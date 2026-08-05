use std::error::Error;
use std::fmt;

use anyhow::Result;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CaptureArtifactPolicyError;

impl CaptureArtifactPolicyError {
    pub fn code(&self) -> &'static str {
        "caller_output_path_not_allowed"
    }

    pub fn public_message(&self) -> &'static str {
        "Caller-provided capture output path is not allowed."
    }
}

impl fmt::Display for CaptureArtifactPolicyError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.public_message())
    }
}

impl Error for CaptureArtifactPolicyError {}

pub fn reject_caller_output_path(output_path: Option<&str>) -> Result<()> {
    if output_path.is_some() {
        return Err(CaptureArtifactPolicyError.into());
    }
    Ok(())
}
