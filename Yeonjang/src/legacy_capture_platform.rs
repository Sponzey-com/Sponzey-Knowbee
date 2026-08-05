//! Thin compatibility adapter from the common camera port to existing backends.

use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use std::{error::Error, fmt};

use sha2::{Digest, Sha256};

use crate::artifact_sink::{
    CaptureArtifactBinding, CaptureArtifactError, CaptureArtifactSink, execute_camera_capture,
    execute_screen_capture,
};
use crate::automation::{
    AutomationBackend, AutomationCapabilities, CameraCaptureRequest, CameraPermissionState,
    ScreenCaptureRequest,
};
use crate::cancellation::ActiveCommandRegistry;
use crate::execute_capability::ExecutionClock;
use crate::legacy_platform_failure::{NativeFailureContext, map_legacy_platform_error};
use crate::platform_execution::{
    EffectState, ExecutionFailure, ExecutionFailureReason, ExecutionStage, RecoveryAction,
    RetrySafety,
};
use crate::platform_operation::{
    BoundPlatformOperation, CapabilityCommand, PlatformPreflightReceipt, PreflightObservation,
    PreflightPermissionState,
};
use crate::platform_port::{
    PlatformCapabilityPort, PlatformCaptureArtifactReceipt, PlatformEffectReceipt,
};

/// Resolves only the cancellation signal identified by the bound operation.
pub trait LegacyCancellationSignalResolver: Send + Sync {
    fn resolve(&self, cancellation_id: &str) -> Option<Arc<AtomicBool>>;
}

impl LegacyCancellationSignalResolver for ActiveCommandRegistry {
    fn resolve(&self, cancellation_id: &str) -> Option<Arc<AtomicBool>> {
        self.cancellation_flag_id(cancellation_id)
    }
}

/// Observes current screen permission without displaying an OS prompt.
pub trait LegacyScreenPermissionProbe: Send + Sync {
    fn permission(&self) -> Result<PreflightPermissionState, ScreenPermissionProbeError>;
}

/// Bounded probe failure; native details remain at the Platform boundary.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScreenPermissionProbeError {
    ObservationUnavailable,
}

impl fmt::Display for ScreenPermissionProbeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("screen permission observation is unavailable")
    }
}

impl Error for ScreenPermissionProbeError {}

/// Adapts the existing camera backend and artifact sink without selecting an OS.
pub struct LegacyCapturePlatformAdapter {
    backend: Arc<dyn AutomationBackend>,
    artifact_sink: Arc<dyn CaptureArtifactSink>,
    clock: Arc<dyn ExecutionClock>,
    cancellation: Arc<dyn LegacyCancellationSignalResolver>,
    screen_permission: Arc<dyn LegacyScreenPermissionProbe>,
    capabilities: AutomationCapabilities,
}

impl LegacyCapturePlatformAdapter {
    /// Captures the backend capability snapshot once at composition time.
    pub fn new(
        backend: Arc<dyn AutomationBackend>,
        artifact_sink: Arc<dyn CaptureArtifactSink>,
        clock: Arc<dyn ExecutionClock>,
        cancellation: Arc<dyn LegacyCancellationSignalResolver>,
        screen_permission: Arc<dyn LegacyScreenPermissionProbe>,
    ) -> Self {
        let capabilities = backend.capabilities();
        Self {
            backend,
            artifact_sink,
            clock,
            cancellation,
            screen_permission,
            capabilities,
        }
    }

    fn camera_preflight(
        &self,
        operation: &BoundPlatformOperation,
    ) -> Result<PlatformPreflightReceipt, ExecutionFailure> {
        let status = match self.backend.camera_permission_status() {
            Ok(status) => status,
            Err(error) => {
                return Err(map_legacy_platform_error(
                    operation,
                    NativeFailureContext::new(ExecutionStage::OsPreflight, EffectState::NotStarted),
                    &error,
                ));
            }
        };
        let permission = permission_state(status.status);
        let observation = PreflightObservation {
            capability_available: self.capabilities.camera_management,
            permission,
            resource_fingerprint: capture_resource_fingerprint(
                &self.capabilities,
                "camera",
                permission,
            ),
            observed_at_ms: self.clock.now_ms(),
        };
        let receipt = if camera_permission_requestable(&status) {
            PlatformPreflightReceipt::for_operation_with_permission_request(operation, observation)
        } else {
            PlatformPreflightReceipt::for_operation(operation, observation)
        };
        receipt.map_err(|_| {
            known_failure(
                operation,
                ExecutionStage::OsPreflight,
                ExecutionFailureReason::PreflightObservationInvalid,
                EffectState::NotStarted,
                RetrySafety::MaterialChangeRequired,
                RecoveryAction::None,
            )
        })
    }

    fn screen_preflight(
        &self,
        operation: &BoundPlatformOperation,
    ) -> Result<PlatformPreflightReceipt, ExecutionFailure> {
        let permission = self.screen_permission.permission().map_err(|_| {
            known_failure(
                operation,
                ExecutionStage::OsPreflight,
                ExecutionFailureReason::PreflightObservationInvalid,
                EffectState::NotStarted,
                RetrySafety::MaterialChangeRequired,
                RecoveryAction::None,
            )
        })?;
        PlatformPreflightReceipt::for_operation(
            operation,
            PreflightObservation {
                capability_available: self.capabilities.screen_capture,
                permission,
                resource_fingerprint: capture_resource_fingerprint(
                    &self.capabilities,
                    "screen",
                    permission,
                ),
                observed_at_ms: self.clock.now_ms(),
            },
        )
        .map_err(|_| {
            known_failure(
                operation,
                ExecutionStage::OsPreflight,
                ExecutionFailureReason::PreflightObservationInvalid,
                EffectState::NotStarted,
                RetrySafety::MaterialChangeRequired,
                RecoveryAction::None,
            )
        })
    }

    fn execute_camera(
        &self,
        operation: &BoundPlatformOperation,
        device_id: Option<String>,
        capture_timeout_ms: Option<u64>,
    ) -> Result<PlatformEffectReceipt, ExecutionFailure> {
        if operation.artifact_lease_ref().is_none() {
            return Err(known_failure(
                operation,
                ExecutionStage::IngressValidation,
                ExecutionFailureReason::InvalidRequest,
                EffectState::NotStarted,
                RetrySafety::MaterialChangeRequired,
                RecoveryAction::CorrectRequest,
            ));
        }
        let Some(cancellation) = self.cancellation.resolve(operation.cancellation_id()) else {
            return Err(known_failure(
                operation,
                ExecutionStage::TargetValidation,
                ExecutionFailureReason::TargetMismatch,
                EffectState::NotStarted,
                RetrySafety::NotRetryable,
                RecoveryAction::SelectSupportedTarget,
            ));
        };
        let binding = artifact_binding(operation)?;
        let result = execute_camera_capture(
            self.artifact_sink.as_ref(),
            self.backend.as_ref(),
            CameraCaptureRequest {
                device_id,
                output_path: None,
                inline_base64: false,
                capture_timeout_ms,
                cancellation,
            },
            &binding,
        )
        .map_err(|error| {
            map_legacy_platform_error(
                operation,
                NativeFailureContext::new(ExecutionStage::HelperExecution, EffectState::Unknown),
                &error,
            )
        })?;
        self.effect_receipt(operation, result.artifact_ref)
    }

    fn execute_screen(
        &self,
        operation: &BoundPlatformOperation,
        display: Option<u32>,
    ) -> Result<PlatformEffectReceipt, ExecutionFailure> {
        if operation.artifact_lease_ref().is_none() {
            return Err(known_failure(
                operation,
                ExecutionStage::IngressValidation,
                ExecutionFailureReason::InvalidRequest,
                EffectState::NotStarted,
                RetrySafety::MaterialChangeRequired,
                RecoveryAction::CorrectRequest,
            ));
        }
        let binding = artifact_binding(operation)?;
        let result = execute_screen_capture(
            self.artifact_sink.as_ref(),
            self.backend.as_ref(),
            ScreenCaptureRequest {
                display,
                output_path: None,
                inline_base64: false,
            },
            &binding,
        )
        .map_err(|error| {
            map_legacy_platform_error(
                operation,
                NativeFailureContext::new(ExecutionStage::HelperExecution, EffectState::Unknown),
                &error,
            )
        })?;
        self.effect_receipt(operation, result.artifact_ref)
    }

    fn effect_receipt(
        &self,
        operation: &BoundPlatformOperation,
        artifact_ref: Option<String>,
    ) -> Result<PlatformEffectReceipt, ExecutionFailure> {
        let Some(artifact_ref) = artifact_ref else {
            let error: anyhow::Error = CaptureArtifactError::ArtifactMissing.into();
            return Err(map_legacy_platform_error(
                operation,
                NativeFailureContext::new(
                    ExecutionStage::ArtifactCommit,
                    EffectState::ConfirmedApplied,
                ),
                &error,
            ));
        };
        let persisted = self.artifact_sink.resolve(&artifact_ref).map_err(|error| {
            let error: anyhow::Error = error.into();
            map_legacy_platform_error(
                operation,
                NativeFailureContext::new(ExecutionStage::PostCheck, EffectState::ConfirmedApplied),
                &error,
            )
        })?;
        let artifact = PlatformCaptureArtifactReceipt::new(
            persisted.artifact_ref(),
            persisted.metadata().kind(),
            persisted.metadata().size_bytes(),
            persisted.metadata().sha256_digest(),
        )
        .map_err(|_| artifact_receipt_failure(operation))?;
        PlatformEffectReceipt::for_capture_operation(operation, artifact, self.clock.now_ms())
            .map_err(|_| artifact_receipt_failure(operation))
    }
}

impl PlatformCapabilityPort for LegacyCapturePlatformAdapter {
    fn preflight(
        &self,
        operation: &BoundPlatformOperation,
    ) -> Result<PlatformPreflightReceipt, ExecutionFailure> {
        match operation.command() {
            CapabilityCommand::CameraCapture { .. } => self.camera_preflight(operation),
            CapabilityCommand::ScreenCapture { .. } => self.screen_preflight(operation),
        }
    }

    fn execute(
        &self,
        operation: &BoundPlatformOperation,
        _preflight: &PlatformPreflightReceipt,
    ) -> Result<PlatformEffectReceipt, ExecutionFailure> {
        match operation.command() {
            CapabilityCommand::CameraCapture {
                device_id,
                capture_timeout_ms,
            } => self.execute_camera(operation, device_id.clone(), *capture_timeout_ms),
            CapabilityCommand::ScreenCapture { display } => {
                self.execute_screen(operation, *display)
            }
        }
    }
}

fn permission_state(state: CameraPermissionState) -> PreflightPermissionState {
    match state {
        CameraPermissionState::Authorized => PreflightPermissionState::Granted,
        CameraPermissionState::NotDetermined => PreflightPermissionState::NotDetermined,
        CameraPermissionState::Denied => PreflightPermissionState::Denied,
        CameraPermissionState::Restricted => PreflightPermissionState::Restricted,
        CameraPermissionState::Unavailable => PreflightPermissionState::NotRequired,
    }
}

fn camera_permission_requestable(status: &crate::automation::CameraPermissionStatus) -> bool {
    status.status == CameraPermissionState::NotDetermined
        && status.can_attempt_capture
        && status.requires_user_action
}

fn capture_resource_fingerprint(
    capabilities: &AutomationCapabilities,
    resource: &str,
    permission: PreflightPermissionState,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"legacy-capture-resource-v1");
    hasher.update(resource.as_bytes());
    hasher.update([
        capabilities.camera_management as u8,
        capabilities.screen_capture as u8,
    ]);
    hasher.update(format!("{:?}", capabilities.platform).as_bytes());
    hasher.update(format!("{permission:?}").as_bytes());
    format!("sha256:{:x}", hasher.finalize())
}

fn artifact_binding(
    operation: &BoundPlatformOperation,
) -> Result<CaptureArtifactBinding, ExecutionFailure> {
    CaptureArtifactBinding::new(
        operation.command_id(),
        operation.operation_id(),
        operation.target_session_id(),
        operation.target_fingerprint(),
        operation.idempotency_key(),
    )
    .map_err(|error| {
        let error: anyhow::Error = error.into();
        map_legacy_platform_error(
            operation,
            NativeFailureContext::new(ExecutionStage::IngressValidation, EffectState::NotStarted),
            &error,
        )
    })
}

fn known_failure(
    operation: &BoundPlatformOperation,
    stage: ExecutionStage,
    reason: ExecutionFailureReason,
    effect_state: EffectState,
    retry_safety: RetrySafety,
    recovery_action: RecoveryAction,
) -> ExecutionFailure {
    ExecutionFailure::new(
        stage,
        reason,
        effect_state,
        retry_safety,
        recovery_action,
        None,
        operation.binding_digest().to_string(),
    )
    .expect("a validated binding digest satisfies the failure correlation contract")
}

fn artifact_receipt_failure(operation: &BoundPlatformOperation) -> ExecutionFailure {
    known_failure(
        operation,
        ExecutionStage::PostCheck,
        ExecutionFailureReason::PostCheckMismatch,
        EffectState::Unknown,
        RetrySafety::ManualVerificationRequired,
        RecoveryAction::ManualEffectVerification,
    )
}

#[cfg(test)]
mod tests {
    use super::camera_permission_requestable;
    use crate::automation::{CameraPermissionState, CameraPermissionStatus, PlatformKind};

    fn status(
        state: CameraPermissionState,
        can_attempt_capture: bool,
        requires_user_action: bool,
    ) -> CameraPermissionStatus {
        CameraPermissionStatus {
            status: state,
            reason: "test".to_string(),
            platform: PlatformKind::Macos,
            can_attempt_capture,
            requires_user_action,
        }
    }

    #[test]
    fn only_requestable_not_determined_camera_status_can_cross_preflight() {
        assert!(camera_permission_requestable(&status(
            CameraPermissionState::NotDetermined,
            true,
            true,
        )));
        assert!(!camera_permission_requestable(&status(
            CameraPermissionState::NotDetermined,
            false,
            true,
        )));
        assert!(!camera_permission_requestable(&status(
            CameraPermissionState::Denied,
            true,
            true,
        )));
        assert!(!camera_permission_requestable(&status(
            CameraPermissionState::Authorized,
            true,
            false,
        )));
    }
}
