//! Application-owned port for OS-neutral platform effects.

use std::fmt;

use crate::capture_artifact_postcheck::CaptureArtifactKind;
use crate::platform_execution::ExecutionFailure;
use crate::platform_operation::{
    BoundPlatformOperation, CapabilityCommand, PlatformPreflightReceipt,
};

const MAX_NATIVE_RECEIPT_REF_BYTES: usize = 256;
const MAX_ARTIFACT_BYTES: u64 = 64 * 1024 * 1024;

/// Post-checked capture evidence crossing the Platform/Application boundary.
///
/// This value contains no path or bytes. It lets the Application durably bind
/// the exact artifact without interpreting a native receipt string.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlatformCaptureArtifactReceipt {
    artifact_ref: String,
    kind: CaptureArtifactKind,
    size_bytes: u64,
    full_digest: String,
}

impl PlatformCaptureArtifactReceipt {
    pub fn new(
        artifact_ref: impl Into<String>,
        kind: CaptureArtifactKind,
        size_bytes: u64,
        full_digest: impl Into<String>,
    ) -> Result<Self, PlatformEffectReceiptError> {
        let receipt = Self {
            artifact_ref: artifact_ref.into(),
            kind,
            size_bytes,
            full_digest: full_digest.into(),
        };
        if !is_artifact_ref(&receipt.artifact_ref)
            || receipt.size_bytes == 0
            || receipt.size_bytes > MAX_ARTIFACT_BYTES
            || !is_sha256_digest(&receipt.full_digest)
        {
            return Err(PlatformEffectReceiptError::InvalidArtifactEvidence);
        }
        Ok(receipt)
    }

    pub fn artifact_ref(&self) -> &str {
        &self.artifact_ref
    }

    pub fn kind(&self) -> CaptureArtifactKind {
        self.kind
    }

    pub fn size_bytes(&self) -> u64 {
        self.size_bytes
    }

    pub fn full_digest(&self) -> &str {
        &self.full_digest
    }
}

/// The only platform capability port exposed to the Application layer.
pub trait PlatformCapabilityPort: Send + Sync {
    fn preflight(
        &self,
        operation: &BoundPlatformOperation,
    ) -> Result<PlatformPreflightReceipt, ExecutionFailure>;

    fn execute(
        &self,
        operation: &BoundPlatformOperation,
        preflight: &PlatformPreflightReceipt,
    ) -> Result<PlatformEffectReceipt, ExecutionFailure>;
}

/// Successful native effect evidence tied to exactly one bound operation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlatformEffectReceipt {
    operation_id: String,
    target_instance_id: String,
    target_session_id: String,
    target_fingerprint: String,
    binding_digest: String,
    native_receipt_ref: String,
    completed_at_ms: i64,
    artifact: Option<PlatformCaptureArtifactReceipt>,
}

impl PlatformEffectReceipt {
    /// Creates bounded native evidence without copying native payloads or paths.
    pub fn for_operation(
        operation: &BoundPlatformOperation,
        native_receipt_ref: String,
        completed_at_ms: i64,
    ) -> Result<Self, PlatformEffectReceiptError> {
        if native_receipt_ref.trim().is_empty()
            || native_receipt_ref.len() > MAX_NATIVE_RECEIPT_REF_BYTES
        {
            return Err(PlatformEffectReceiptError::InvalidNativeReceiptRef);
        }
        if completed_at_ms < 0 {
            return Err(PlatformEffectReceiptError::InvalidCompletedAt);
        }
        Ok(Self {
            operation_id: operation.operation_id().to_string(),
            target_instance_id: operation.target_instance_id().to_string(),
            target_session_id: operation.target_session_id().to_string(),
            target_fingerprint: operation.target_fingerprint().to_string(),
            binding_digest: operation.binding_digest().to_string(),
            native_receipt_ref,
            completed_at_ms,
            artifact: None,
        })
    }

    pub fn for_capture_operation(
        operation: &BoundPlatformOperation,
        artifact: PlatformCaptureArtifactReceipt,
        completed_at_ms: i64,
    ) -> Result<Self, PlatformEffectReceiptError> {
        let expected_kind = match operation.command() {
            CapabilityCommand::CameraCapture { .. } => CaptureArtifactKind::CameraJpeg,
            CapabilityCommand::ScreenCapture { .. } => CaptureArtifactKind::ScreenPng,
        };
        if artifact.kind() != expected_kind {
            return Err(PlatformEffectReceiptError::ArtifactKindMismatch);
        }
        let mut receipt = Self::for_operation(
            operation,
            artifact.artifact_ref().to_string(),
            completed_at_ms,
        )?;
        receipt.artifact = Some(artifact);
        Ok(receipt)
    }

    /// Rejects a receipt copied to a different operation or execution target.
    pub fn validate_for(
        &self,
        operation: &BoundPlatformOperation,
    ) -> Result<(), PlatformEffectReceiptError> {
        if self.operation_id != operation.operation_id()
            || self.target_instance_id != operation.target_instance_id()
            || self.target_session_id != operation.target_session_id()
            || self.target_fingerprint != operation.target_fingerprint()
            || self.binding_digest != operation.binding_digest()
        {
            return Err(PlatformEffectReceiptError::BindingMismatch);
        }
        Ok(())
    }

    pub fn native_receipt_ref(&self) -> &str {
        &self.native_receipt_ref
    }

    pub fn completed_at_ms(&self) -> i64 {
        self.completed_at_ms
    }

    pub fn artifact(&self) -> Option<&PlatformCaptureArtifactReceipt> {
        self.artifact.as_ref()
    }
}

/// Invalid or mismatched native effect evidence.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlatformEffectReceiptError {
    InvalidNativeReceiptRef,
    InvalidCompletedAt,
    InvalidArtifactEvidence,
    ArtifactKindMismatch,
    BindingMismatch,
}

impl fmt::Display for PlatformEffectReceiptError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::InvalidNativeReceiptRef => "invalid native receipt reference",
            Self::InvalidCompletedAt => "invalid native effect completion time",
            Self::InvalidArtifactEvidence => "invalid capture artifact evidence",
            Self::ArtifactKindMismatch => "capture artifact kind does not match the operation",
            Self::BindingMismatch => "effect receipt does not match the bound operation",
        })
    }
}

impl std::error::Error for PlatformEffectReceiptError {}

fn is_artifact_ref(value: &str) -> bool {
    value.strip_prefix("capture:").is_some_and(|digest| {
        digest.len() == 64 && digest.bytes().all(|byte| byte.is_ascii_hexdigit())
    })
}

fn is_sha256_digest(value: &str) -> bool {
    value.strip_prefix("sha256:").is_some_and(|digest| {
        digest.len() == 64 && digest.bytes().all(|byte| byte.is_ascii_hexdigit())
    })
}
