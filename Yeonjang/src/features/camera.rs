use anyhow::Result;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::automation::{AutomationBackend, CameraCaptureRequest};
use crate::platform::current_backend;

#[derive(Debug, Deserialize)]
pub struct CaptureParams {
    #[serde(default)]
    pub device_id: Option<String>,
    #[serde(default)]
    pub output_path: Option<String>,
    #[serde(default)]
    pub inline_base64: bool,
}

pub fn list_devices() -> Result<Value> {
    Ok(serde_json::to_value(current_backend().list_cameras()?)?)
}

pub fn permission_status() -> Result<Value> {
    Ok(json!({
        "status": "unknown",
        "reason": "os_permission_status_unavailable",
        "platform": std::env::consts::OS,
        "canAttemptCapture": true,
        "requiresUserAction": false,
    }))
}

pub fn capture(params: CaptureParams) -> Result<Value> {
    let request = CameraCaptureRequest {
        device_id: params.device_id,
        output_path: params.output_path,
        inline_base64: params.inline_base64,
    };
    Ok(serde_json::to_value(
        current_backend().capture_camera(request)?,
    )?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn permission_status_returns_recovery_fields_without_capture() {
        let result = permission_status().expect("camera permission status");

        assert!(result["status"].as_str().unwrap_or_default().len() > 0);
        assert!(result["reason"].as_str().unwrap_or_default().len() > 0);
        assert!(result["platform"].as_str().unwrap_or_default().len() > 0);
        assert!(result["canAttemptCapture"].is_boolean());
        assert!(result["requiresUserAction"].is_boolean());
    }
}
