use anyhow::Result;
use serde_json::Value;
use std::sync::{Arc, atomic::AtomicBool};

use crate::artifact_sink::{
    CaptureArtifactBindingInput, CaptureArtifactSink, execute_camera_capture,
};
use crate::automation::{AutomationBackend, CameraCaptureRequest, CameraPermissionStatus};
use crate::features::capture_artifact::reject_caller_output_path;
pub use crate::params_schema::CameraCaptureParams as CaptureParams;

pub fn list_devices(backend: &dyn AutomationBackend) -> Result<Value> {
    Ok(serde_json::to_value(backend.list_cameras()?)?)
}

pub fn permission_status(backend: &dyn AutomationBackend) -> Result<Value> {
    permission_status_value(backend.camera_permission_status()?)
}

fn permission_status_value(status: CameraPermissionStatus) -> Result<Value> {
    Ok(serde_json::to_value(status)?)
}

pub fn capture_with_artifact_sink(
    params: CaptureParams,
    cancellation: Arc<AtomicBool>,
    backend: &dyn AutomationBackend,
    artifact_sink: &dyn CaptureArtifactSink,
    binding: CaptureArtifactBindingInput<'_>,
) -> Result<Value> {
    reject_caller_output_path(params.output_path.as_deref())?;
    let binding = binding.validate()?;
    let request = CameraCaptureRequest {
        device_id: params.device_id,
        output_path: None,
        inline_base64: params.inline_base64,
        capture_timeout_ms: params.capture_timeout_ms,
        cancellation,
    };
    Ok(serde_json::to_value(execute_camera_capture(
        artifact_sink,
        backend,
        request,
        &binding,
    )?)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn permission_status_returns_recovery_fields_without_capture() {
        let result = permission_status_value(CameraPermissionStatus::unavailable(
            crate::automation::PlatformKind::Unknown,
        ))
        .expect("camera permission status");

        assert!(!result["status"].as_str().unwrap_or_default().is_empty());
        assert!(!result["reason"].as_str().unwrap_or_default().is_empty());
        assert!(!result["platform"].as_str().unwrap_or_default().is_empty());
        assert!(result["canAttemptCapture"].is_boolean());
        assert!(result["requiresUserAction"].is_boolean());
    }
}
