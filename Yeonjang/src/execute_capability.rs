//! Application use case that exclusively owns the common platform call order.

use std::sync::Arc;

use crate::cancellation::ActiveCommandRegistry;
use crate::platform_execution::{
    EffectState, ExecutionFailure, ExecutionFailureReason, ExecutionStage, RecoveryAction,
    RetrySafety,
};
use crate::platform_operation::{
    BoundPlatformOperation, PreflightPermissionState, PreflightReceiptError,
};
use crate::platform_port::{
    PlatformCapabilityPort, PlatformEffectReceipt, PlatformEffectReceiptError,
};
use crate::stage_timing::{RuntimeStage, StageTimingRecorder, StageTimingSpan};

/// Injected time source used for deterministic preflight freshness checks.
pub trait ExecutionClock: Send + Sync {
    fn now_ms(&self) -> i64;
}

/// Read-only cancellation query for the exact ID bound into an operation.
pub trait ExecutionCancellation: Send + Sync {
    fn is_cancelled(&self, cancellation_id: &str) -> bool;
}

/// Scoped permit retained until one platform effect attempt has finished.
pub trait ExecutionResourcePermit: Send {}

/// Closed pre-effect resource admission outcomes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExecutionResourceAdmissionError {
    Cancelled,
    DeadlineExceeded,
    Saturated,
    Unavailable,
}

/// Application-owned port for exact typed resource coordination.
pub trait ExecutionResourceAdmission: Send + Sync {
    fn acquire(
        &self,
        operation: &BoundPlatformOperation,
        cancellation: &dyn ExecutionCancellation,
        clock: &dyn ExecutionClock,
    ) -> Result<Box<dyn ExecutionResourcePermit>, ExecutionResourceAdmissionError>;
}

impl ExecutionCancellation for ActiveCommandRegistry {
    fn is_cancelled(&self, cancellation_id: &str) -> bool {
        self.is_cancelled_id(cancellation_id)
    }
}

/// Closed Application result; native and transport exceptions never cross it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExecuteCapabilityResult {
    Succeeded(PlatformEffectReceipt),
    Failed(ExecutionFailure),
}

/// Owns `preflight -> validate -> admit -> execute -> receipt validate`.
pub struct ExecuteCapabilityUseCase {
    port: Arc<dyn PlatformCapabilityPort>,
    clock: Arc<dyn ExecutionClock>,
    cancellation: Arc<dyn ExecutionCancellation>,
    resource_admission: Option<Arc<dyn ExecutionResourceAdmission>>,
    stage_timing: Option<StageTimingRecorder>,
    max_preflight_age_ms: u64,
}

impl ExecuteCapabilityUseCase {
    pub fn new(
        port: Arc<dyn PlatformCapabilityPort>,
        clock: Arc<dyn ExecutionClock>,
        cancellation: Arc<dyn ExecutionCancellation>,
        max_preflight_age_ms: u64,
    ) -> Self {
        Self {
            port,
            clock,
            cancellation,
            resource_admission: None,
            stage_timing: None,
            max_preflight_age_ms,
        }
    }

    pub fn with_resource_admission(
        mut self,
        resource_admission: Arc<dyn ExecutionResourceAdmission>,
    ) -> Self {
        self.resource_admission = Some(resource_admission);
        self
    }

    /// Adds a diagnostic observer that cannot change the execution result.
    pub fn with_stage_timing(mut self, recorder: StageTimingRecorder) -> Self {
        self.stage_timing = Some(recorder);
        self
    }

    /// Executes at most one platform effect after all pre-effect guards pass.
    pub fn execute(&self, operation: &BoundPlatformOperation) -> ExecuteCapabilityResult {
        if let Some(failure) = self.pre_effect_guard(operation) {
            return ExecuteCapabilityResult::Failed(failure);
        }
        let preflight = match self.port.preflight(operation) {
            Ok(receipt) => receipt,
            Err(failure) => return ExecuteCapabilityResult::Failed(failure),
        };
        if let Err(error) =
            preflight.validate_for(operation, self.clock.now_ms(), self.max_preflight_age_ms)
        {
            return ExecuteCapabilityResult::Failed(preflight_validation_failure(operation, error));
        }
        if !preflight.capability_available() {
            return ExecuteCapabilityResult::Failed(known_failure(
                operation,
                ExecutionStage::OsPreflight,
                ExecutionFailureReason::CapabilityUnavailable,
                EffectState::NotStarted,
                RetrySafety::MaterialChangeRequired,
                RecoveryAction::SelectSupportedTarget,
            ));
        }
        match preflight.permission() {
            PreflightPermissionState::NotRequired | PreflightPermissionState::Granted => {}
            PreflightPermissionState::NotDetermined if preflight.permission_requestable() => {}
            PreflightPermissionState::NotDetermined => {
                return ExecuteCapabilityResult::Failed(permission_failure(
                    operation,
                    ExecutionFailureReason::PermissionNotDetermined,
                ));
            }
            PreflightPermissionState::Denied => {
                return ExecuteCapabilityResult::Failed(permission_failure(
                    operation,
                    ExecutionFailureReason::PermissionDenied,
                ));
            }
            PreflightPermissionState::Restricted => {
                return ExecuteCapabilityResult::Failed(permission_failure(
                    operation,
                    ExecutionFailureReason::PermissionRestricted,
                ));
            }
        }
        if let Some(failure) = self.pre_effect_guard(operation) {
            return ExecuteCapabilityResult::Failed(failure);
        }
        let _resource_permit = match &self.resource_admission {
            Some(admission) => {
                match admission.acquire(operation, self.cancellation.as_ref(), self.clock.as_ref())
                {
                    Ok(permit) => Some(permit),
                    Err(error) => {
                        return ExecuteCapabilityResult::Failed(resource_admission_failure(
                            operation, error,
                        ));
                    }
                }
            }
            None => None,
        };
        if let Some(failure) = self.pre_effect_guard(operation) {
            return ExecuteCapabilityResult::Failed(failure);
        }

        let handler_timing = self.start_timing(RuntimeStage::Handler, operation);
        let executed = self.port.execute(operation, &preflight);
        Self::complete_timing(handler_timing);
        let effect = match executed {
            Ok(receipt) => receipt,
            Err(failure) => return ExecuteCapabilityResult::Failed(failure),
        };
        let post_check_timing = self.start_timing(RuntimeStage::PostCheck, operation);
        let post_check = effect.validate_for(operation);
        Self::complete_timing(post_check_timing);
        if let Err(PlatformEffectReceiptError::BindingMismatch) = post_check {
            return ExecuteCapabilityResult::Failed(known_failure(
                operation,
                ExecutionStage::PostCheck,
                ExecutionFailureReason::PostCheckMismatch,
                EffectState::Unknown,
                RetrySafety::ManualVerificationRequired,
                RecoveryAction::ManualEffectVerification,
            ));
        }
        ExecuteCapabilityResult::Succeeded(effect)
    }

    fn start_timing(
        &self,
        stage: RuntimeStage,
        operation: &BoundPlatformOperation,
    ) -> Option<StageTimingSpan> {
        self.stage_timing
            .as_ref()
            .and_then(|recorder| recorder.start(stage, operation.binding_digest()).ok())
    }

    fn complete_timing(span: Option<StageTimingSpan>) {
        if let Some(span) = span {
            // Observation failure is intentionally independent from the
            // canonical platform result and is checked by the release gate.
            let _ = span.complete();
        }
    }

    fn pre_effect_guard(&self, operation: &BoundPlatformOperation) -> Option<ExecutionFailure> {
        if self.cancellation.is_cancelled(operation.cancellation_id()) {
            return Some(known_failure(
                operation,
                ExecutionStage::ResourceAdmission,
                ExecutionFailureReason::Cancelled,
                EffectState::NotStarted,
                RetrySafety::NotRetryable,
                RecoveryAction::None,
            ));
        }
        if self.clock.now_ms() >= operation.deadline_ms() {
            return Some(known_failure(
                operation,
                ExecutionStage::ResourceAdmission,
                ExecutionFailureReason::DeadlineExceeded,
                EffectState::NotStarted,
                RetrySafety::MaterialChangeRequired,
                RecoveryAction::CorrectRequest,
            ));
        }
        None
    }
}

fn resource_admission_failure(
    operation: &BoundPlatformOperation,
    error: ExecutionResourceAdmissionError,
) -> ExecutionFailure {
    match error {
        ExecutionResourceAdmissionError::Cancelled => known_failure(
            operation,
            ExecutionStage::ResourceAdmission,
            ExecutionFailureReason::Cancelled,
            EffectState::NotStarted,
            RetrySafety::NotRetryable,
            RecoveryAction::None,
        ),
        ExecutionResourceAdmissionError::DeadlineExceeded => known_failure(
            operation,
            ExecutionStage::ResourceAdmission,
            ExecutionFailureReason::DeadlineExceeded,
            EffectState::NotStarted,
            RetrySafety::MaterialChangeRequired,
            RecoveryAction::CorrectRequest,
        ),
        ExecutionResourceAdmissionError::Saturated => known_failure(
            operation,
            ExecutionStage::ResourceAdmission,
            ExecutionFailureReason::ResourceBusy,
            EffectState::NotStarted,
            RetrySafety::LocalActionRequired,
            RecoveryAction::ReleaseResource,
        ),
        ExecutionResourceAdmissionError::Unavailable => known_failure(
            operation,
            ExecutionStage::ResourceAdmission,
            ExecutionFailureReason::InternalUnclassified,
            EffectState::NotStarted,
            RetrySafety::MaterialChangeRequired,
            RecoveryAction::None,
        ),
    }
}

fn preflight_validation_failure(
    operation: &BoundPlatformOperation,
    error: PreflightReceiptError,
) -> ExecutionFailure {
    match error {
        PreflightReceiptError::BindingMismatch => known_failure(
            operation,
            ExecutionStage::OsPreflight,
            ExecutionFailureReason::TargetMismatch,
            EffectState::NotStarted,
            RetrySafety::NotRetryable,
            RecoveryAction::SelectSupportedTarget,
        ),
        PreflightReceiptError::Stale => known_failure(
            operation,
            ExecutionStage::OsPreflight,
            ExecutionFailureReason::PreflightStale,
            EffectState::NotStarted,
            RetrySafety::MaterialChangeRequired,
            RecoveryAction::None,
        ),
        PreflightReceiptError::ObservationFromFuture
        | PreflightReceiptError::InvalidResourceFingerprint
        | PreflightReceiptError::InvalidObservedAt
        | PreflightReceiptError::PermissionRequestNotAllowed => known_failure(
            operation,
            ExecutionStage::OsPreflight,
            ExecutionFailureReason::PreflightObservationInvalid,
            EffectState::NotStarted,
            RetrySafety::MaterialChangeRequired,
            RecoveryAction::None,
        ),
    }
}

fn permission_failure(
    operation: &BoundPlatformOperation,
    reason: ExecutionFailureReason,
) -> ExecutionFailure {
    known_failure(
        operation,
        ExecutionStage::OsPreflight,
        reason,
        EffectState::NotStarted,
        RetrySafety::LocalActionRequired,
        RecoveryAction::CompleteLocalOsSetup,
    )
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
