//! Immutable, OS-neutral identity contracts for platform execution.
//!
//! The Application layer builds one bound operation and passes it unchanged
//! through preflight and execution. Native adapters observe this identity; they
//! do not reconstruct it from method names or user-facing text.

use std::fmt;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const MAX_IDENTITY_BYTES: usize = 256;

/// The platform resource whose lifecycle must be admitted and observed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlatformResource {
    Camera,
    Screen,
}

/// Closed target platform identity selected once by the composition root.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TargetPlatform {
    Macos,
    Windows,
    Linux,
    Android,
    Ios,
    Unknown,
}

impl TargetPlatform {
    fn code(self) -> &'static str {
        match self {
            Self::Macos => "macos",
            Self::Windows => "windows",
            Self::Linux => "linux",
            Self::Android => "android",
            Self::Ios => "ios",
            Self::Unknown => "unknown",
        }
    }
}

/// Closed, typed capture commands used by the first common execution slice.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CapabilityCommand {
    CameraCapture {
        device_id: Option<String>,
        capture_timeout_ms: Option<u64>,
    },
    ScreenCapture {
        display: Option<u32>,
    },
}

impl CapabilityCommand {
    /// Stable method identity used only at boundary projection and digest input.
    pub fn method_code(&self) -> &'static str {
        match self {
            Self::CameraCapture { .. } => "camera.capture",
            Self::ScreenCapture { .. } => "screen.capture",
        }
    }

    pub fn resource(&self) -> PlatformResource {
        match self {
            Self::CameraCapture { .. } => PlatformResource::Camera,
            Self::ScreenCapture { .. } => PlatformResource::Screen,
        }
    }

    fn append_binding_fields(&self, hasher: &mut Sha256) {
        append_field(hasher, self.method_code());
        match self {
            Self::CameraCapture {
                device_id,
                capture_timeout_ms,
            } => {
                append_optional_field(hasher, device_id.as_deref());
                append_field(
                    hasher,
                    &capture_timeout_ms
                        .map(|value| value.to_string())
                        .unwrap_or_else(|| "none".to_string()),
                );
            }
            Self::ScreenCapture { display } => {
                append_field(
                    hasher,
                    &display
                        .map(|value| value.to_string())
                        .unwrap_or_else(|| "none".to_string()),
                );
            }
        }
    }

    fn validate(&self) -> Result<(), BoundPlatformOperationError> {
        match self {
            Self::CameraCapture {
                device_id: Some(device_id),
                ..
            } if !is_bounded_non_blank(device_id) => {
                Err(BoundPlatformOperationError::InvalidField("device_id"))
            }
            _ => Ok(()),
        }
    }
}

/// Validated values from which one immutable platform operation is constructed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BoundPlatformOperationInput {
    pub request_id: String,
    pub command_id: String,
    pub operation_id: String,
    pub requester_id: String,
    pub target_platform: TargetPlatform,
    pub target_instance_id: String,
    pub target_session_id: String,
    pub target_fingerprint: String,
    pub authorization_ref: String,
    pub policy_revision: u64,
    pub idempotency_key: String,
    pub deadline_ms: i64,
    pub cancellation_id: String,
    pub artifact_lease_ref: Option<String>,
    pub command: CapabilityCommand,
}

/// Exact request, authorization, target, command, and lifecycle binding.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BoundPlatformOperation {
    input: BoundPlatformOperationInput,
    binding_digest: String,
}

impl BoundPlatformOperation {
    /// Validates all execution-critical fields and derives their canonical digest.
    pub fn new(input: BoundPlatformOperationInput) -> Result<Self, BoundPlatformOperationError> {
        for (name, value) in [
            ("request_id", input.request_id.as_str()),
            ("command_id", input.command_id.as_str()),
            ("operation_id", input.operation_id.as_str()),
            ("requester_id", input.requester_id.as_str()),
            ("target_instance_id", input.target_instance_id.as_str()),
            ("target_session_id", input.target_session_id.as_str()),
            ("authorization_ref", input.authorization_ref.as_str()),
            ("idempotency_key", input.idempotency_key.as_str()),
            ("cancellation_id", input.cancellation_id.as_str()),
        ] {
            if !is_bounded_non_blank(value) {
                return Err(BoundPlatformOperationError::InvalidField(name));
            }
        }
        if !is_sha256_fingerprint(&input.target_fingerprint) {
            return Err(BoundPlatformOperationError::InvalidTargetFingerprint);
        }
        if input.deadline_ms <= 0 {
            return Err(BoundPlatformOperationError::InvalidDeadline);
        }
        if input
            .artifact_lease_ref
            .as_deref()
            .is_some_and(|value| !is_bounded_non_blank(value))
        {
            return Err(BoundPlatformOperationError::InvalidField(
                "artifact_lease_ref",
            ));
        }
        input.command.validate()?;

        let binding_digest = binding_digest(&input);
        Ok(Self {
            input,
            binding_digest,
        })
    }

    pub fn command(&self) -> &CapabilityCommand {
        &self.input.command
    }

    pub fn request_id(&self) -> &str {
        &self.input.request_id
    }

    pub fn operation_id(&self) -> &str {
        &self.input.operation_id
    }

    pub fn command_id(&self) -> &str {
        &self.input.command_id
    }

    pub fn requester_id(&self) -> &str {
        &self.input.requester_id
    }

    pub fn target_platform(&self) -> TargetPlatform {
        self.input.target_platform
    }

    pub fn target_instance_id(&self) -> &str {
        &self.input.target_instance_id
    }

    pub fn target_session_id(&self) -> &str {
        &self.input.target_session_id
    }

    pub fn target_fingerprint(&self) -> &str {
        &self.input.target_fingerprint
    }

    pub fn binding_digest(&self) -> &str {
        &self.binding_digest
    }

    pub fn deadline_ms(&self) -> i64 {
        self.input.deadline_ms
    }

    pub fn cancellation_id(&self) -> &str {
        &self.input.cancellation_id
    }

    pub fn idempotency_key(&self) -> &str {
        &self.input.idempotency_key
    }

    pub fn authorization_ref(&self) -> &str {
        &self.input.authorization_ref
    }

    pub fn policy_revision(&self) -> u64 {
        self.input.policy_revision
    }

    pub fn artifact_lease_ref(&self) -> Option<&str> {
        self.input.artifact_lease_ref.as_deref()
    }
}

/// Invalid operation input rejected before preflight or platform dispatch.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BoundPlatformOperationError {
    InvalidField(&'static str),
    InvalidTargetFingerprint,
    InvalidDeadline,
}

impl fmt::Display for BoundPlatformOperationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidField(field) => {
                write!(formatter, "invalid bound operation field: {field}")
            }
            Self::InvalidTargetFingerprint => formatter.write_str("invalid target fingerprint"),
            Self::InvalidDeadline => formatter.write_str("invalid operation deadline"),
        }
    }
}

impl std::error::Error for BoundPlatformOperationError {}

/// OS observation values captured by a platform preflight adapter.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreflightObservation {
    pub capability_available: bool,
    pub permission: PreflightPermissionState,
    pub resource_fingerprint: String,
    pub observed_at_ms: i64,
}

/// Closed OS permission observations; prompting is not part of preflight.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PreflightPermissionState {
    NotRequired,
    Granted,
    NotDetermined,
    Denied,
    Restricted,
}

/// Immutable preflight evidence tied to exactly one bound operation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlatformPreflightReceipt {
    operation_id: String,
    target_instance_id: String,
    target_session_id: String,
    target_fingerprint: String,
    resource: PlatformResource,
    binding_digest: String,
    capability_available: bool,
    permission: PreflightPermissionState,
    permission_requestable: bool,
    resource_fingerprint: String,
    observed_at_ms: i64,
}

impl PlatformPreflightReceipt {
    /// Creates a receipt from observations without permitting identity reconstruction.
    pub fn for_operation(
        operation: &BoundPlatformOperation,
        observation: PreflightObservation,
    ) -> Result<Self, PreflightReceiptError> {
        Self::build(operation, observation, false)
    }

    /// Creates camera preflight evidence whose `not_determined` OS permission may be requested
    /// by the bound platform effect. Other commands and permission states remain fail-closed.
    pub fn for_operation_with_permission_request(
        operation: &BoundPlatformOperation,
        observation: PreflightObservation,
    ) -> Result<Self, PreflightReceiptError> {
        if !matches!(operation.command(), CapabilityCommand::CameraCapture { .. })
            || observation.permission != PreflightPermissionState::NotDetermined
            || !observation.capability_available
        {
            return Err(PreflightReceiptError::PermissionRequestNotAllowed);
        }
        Self::build(operation, observation, true)
    }

    fn build(
        operation: &BoundPlatformOperation,
        observation: PreflightObservation,
        permission_requestable: bool,
    ) -> Result<Self, PreflightReceiptError> {
        if !is_bounded_non_blank(&observation.resource_fingerprint) {
            return Err(PreflightReceiptError::InvalidResourceFingerprint);
        }
        if observation.observed_at_ms < 0 {
            return Err(PreflightReceiptError::InvalidObservedAt);
        }
        Ok(Self {
            operation_id: operation.operation_id().to_string(),
            target_instance_id: operation.target_instance_id().to_string(),
            target_session_id: operation.target_session_id().to_string(),
            target_fingerprint: operation.target_fingerprint().to_string(),
            resource: operation.command().resource(),
            binding_digest: operation.binding_digest().to_string(),
            capability_available: observation.capability_available,
            permission: observation.permission,
            permission_requestable,
            resource_fingerprint: observation.resource_fingerprint,
            observed_at_ms: observation.observed_at_ms,
        })
    }

    /// Checks exact binding and caller-supplied freshness immediately before effect.
    pub fn validate_for(
        &self,
        operation: &BoundPlatformOperation,
        now_ms: i64,
        max_age_ms: u64,
    ) -> Result<(), PreflightReceiptError> {
        if self.operation_id != operation.operation_id()
            || self.target_instance_id != operation.target_instance_id()
            || self.target_session_id != operation.target_session_id()
            || self.target_fingerprint != operation.target_fingerprint()
            || self.resource != operation.command().resource()
            || self.binding_digest != operation.binding_digest()
        {
            return Err(PreflightReceiptError::BindingMismatch);
        }
        let age = now_ms
            .checked_sub(self.observed_at_ms)
            .ok_or(PreflightReceiptError::ObservationFromFuture)?;
        if age < 0 {
            return Err(PreflightReceiptError::ObservationFromFuture);
        }
        if u64::try_from(age).unwrap_or(u64::MAX) > max_age_ms {
            return Err(PreflightReceiptError::Stale);
        }
        Ok(())
    }

    pub fn capability_available(&self) -> bool {
        self.capability_available
    }

    pub fn permission(&self) -> PreflightPermissionState {
        self.permission
    }

    /// True only when the exact camera adapter can resolve `not_determined` during execution.
    pub fn permission_requestable(&self) -> bool {
        self.permission_requestable
    }

    pub fn resource_fingerprint(&self) -> &str {
        &self.resource_fingerprint
    }
}

/// Reasons a preflight receipt cannot authorize platform dispatch.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PreflightReceiptError {
    InvalidResourceFingerprint,
    InvalidObservedAt,
    PermissionRequestNotAllowed,
    BindingMismatch,
    ObservationFromFuture,
    Stale,
}

impl fmt::Display for PreflightReceiptError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::InvalidResourceFingerprint => "invalid preflight resource fingerprint",
            Self::InvalidObservedAt => "invalid preflight observation time",
            Self::PermissionRequestNotAllowed => {
                "permission request is not allowed for this preflight"
            }
            Self::BindingMismatch => "preflight receipt does not match the bound operation",
            Self::ObservationFromFuture => "preflight observation is in the future",
            Self::Stale => "preflight observation is stale",
        })
    }
}

impl std::error::Error for PreflightReceiptError {}

fn binding_digest(input: &BoundPlatformOperationInput) -> String {
    let mut hasher = Sha256::new();
    append_field(&mut hasher, "bound-platform-operation-v1");
    for field in [
        input.request_id.as_str(),
        input.command_id.as_str(),
        input.operation_id.as_str(),
        input.requester_id.as_str(),
        input.target_instance_id.as_str(),
        input.target_session_id.as_str(),
        input.target_fingerprint.as_str(),
        input.authorization_ref.as_str(),
        input.idempotency_key.as_str(),
        input.cancellation_id.as_str(),
    ] {
        append_field(&mut hasher, field);
    }
    append_field(&mut hasher, input.target_platform.code());
    append_field(&mut hasher, &input.policy_revision.to_string());
    append_field(&mut hasher, &input.deadline_ms.to_string());
    append_optional_field(&mut hasher, input.artifact_lease_ref.as_deref());
    input.command.append_binding_fields(&mut hasher);
    format!("sha256:{:x}", hasher.finalize())
}

fn append_optional_field(hasher: &mut Sha256, value: Option<&str>) {
    match value {
        Some(value) => {
            append_field(hasher, "some");
            append_field(hasher, value);
        }
        None => append_field(hasher, "none"),
    }
}

fn append_field(hasher: &mut Sha256, value: &str) {
    hasher.update((value.len() as u64).to_be_bytes());
    hasher.update(value.as_bytes());
}

fn is_bounded_non_blank(value: &str) -> bool {
    !value.trim().is_empty() && value.len() <= MAX_IDENTITY_BYTES
}

fn is_sha256_fingerprint(value: &str) -> bool {
    value.len() == 71
        && value
            .strip_prefix("sha256:")
            .is_some_and(|digest| digest.bytes().all(|byte| byte.is_ascii_hexdigit()))
}
