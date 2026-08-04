use anyhow::Result;
use serde_json::Value;

use crate::artifact_sink::{
    CaptureArtifactBindingInput, CaptureArtifactSink, execute_screen_capture,
};
use crate::automation::{AutomationBackend, ScreenCaptureRequest};
use crate::features::capture_artifact::reject_caller_output_path;
pub use crate::params_schema::ScreenCaptureParams as CaptureParams;

pub fn capture_with_artifact_sink(
    params: CaptureParams,
    backend: &dyn AutomationBackend,
    artifact_sink: &dyn CaptureArtifactSink,
    binding: CaptureArtifactBindingInput<'_>,
) -> Result<Value> {
    reject_caller_output_path(params.output_path.as_deref())?;
    let binding = binding.validate()?;
    let request = ScreenCaptureRequest {
        display: params.display,
        output_path: None,
        inline_base64: params.inline_base64,
    };
    Ok(serde_json::to_value(execute_screen_capture(
        artifact_sink,
        backend,
        request,
        &binding,
    )?)?)
}
