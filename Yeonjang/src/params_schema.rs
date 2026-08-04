use serde::Deserialize;
use serde_json::Value;

use crate::request_schema::MAX_CANONICAL_PARAMS_BYTES;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ParamsSchema {
    Unspecified,
    ExecutorTyped,
    CameraCapture,
    ScreenCapture,
}

impl ParamsSchema {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Unspecified => "unspecified",
            Self::ExecutorTyped => "executor_typed_v1",
            Self::CameraCapture => "camera_capture_params_v1",
            Self::ScreenCapture => "screen_capture_params_v1",
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct CameraCaptureParams {
    #[serde(default)]
    pub device_id: Option<String>,
    #[serde(default)]
    pub output_path: Option<String>,
    #[serde(default)]
    pub inline_base64: bool,
    #[serde(default)]
    pub capture_timeout_ms: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct ScreenCaptureParams {
    #[serde(default)]
    pub display: Option<u32>,
    #[serde(default)]
    pub output_path: Option<String>,
    #[serde(default)]
    pub inline_base64: bool,
}

pub fn validate_params(schema: ParamsSchema, params: &Value) -> bool {
    if serde_json::to_vec(params)
        .map(|encoded| encoded.len() > MAX_CANONICAL_PARAMS_BYTES)
        .unwrap_or(true)
    {
        return false;
    }
    match schema {
        ParamsSchema::ExecutorTyped => params.is_object(),
        ParamsSchema::CameraCapture => {
            has_only_fields(
                params,
                &[
                    "device_id",
                    "output_path",
                    "inline_base64",
                    "capture_timeout_ms",
                ],
            ) && serde_json::from_value::<CameraCaptureParams>(params.clone()).is_ok()
        }
        ParamsSchema::ScreenCapture => {
            has_only_fields(params, &["display", "output_path", "inline_base64"])
                && serde_json::from_value::<ScreenCaptureParams>(params.clone()).is_ok()
        }
        ParamsSchema::Unspecified => false,
    }
}

fn has_only_fields(value: &Value, allowed: &[&str]) -> bool {
    value
        .as_object()
        .is_some_and(|object| object.keys().all(|key| allowed.contains(&key.as_str())))
}
