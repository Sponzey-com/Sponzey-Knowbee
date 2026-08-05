//! OS-neutral execution failure values owned by the Domain boundary.
//!
//! These values describe what happened without exposing native errors, transport
//! details, filesystem paths, or user-facing prose.

use std::fmt;

use serde::{Deserialize, Serialize};

const MAX_CORRELATION_ID_BYTES: usize = 128;
const MAX_EVIDENCE_REF_BYTES: usize = 256;

/// The single owning stage at which execution or delivery stopped.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionStage {
    IngressValidation,
    TargetValidation,
    Authorization,
    LocalPolicy,
    OsPreflight,
    ResourceAdmission,
    PlatformDispatch,
    HelperExecution,
    ArtifactCommit,
    PostCheck,
    ResponseEnqueue,
    ResponsePublish,
    ArtifactTransfer,
    CleanupRecovery,
}

impl ExecutionStage {
    pub fn is_before_effect(self) -> bool {
        matches!(
            self,
            Self::IngressValidation
                | Self::TargetValidation
                | Self::Authorization
                | Self::LocalPolicy
                | Self::OsPreflight
                | Self::ResourceAdmission
        )
    }
}

/// What is known about whether the requested platform effect occurred.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EffectState {
    NotStarted,
    ConfirmedNotApplied,
    ConfirmedApplied,
    Unknown,
}

/// Whether and how a caller may attempt progress after this failure.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RetrySafety {
    SafeRedeliverySameIdempotency,
    MaterialChangeRequired,
    LocalActionRequired,
    NotRetryable,
    ManualVerificationRequired,
}

/// A stable action code for recovery; consumers own localized wording.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecoveryAction {
    None,
    CorrectRequest,
    RetryAdmission,
    SelectSupportedTarget,
    UpdateLocalPolicy,
    CompleteLocalOsSetup,
    ReleaseResource,
    ReconnectTransport,
    FetchArtifactAgain,
    ManualEffectVerification,
}

/// Stable, language-neutral reasons known at the platform execution boundary.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionFailureReason {
    InvalidRequest,
    RetainedMessageRejected,
    ProtocolUpgradeRequired,
    ProtocolVersionUnsupported,
    RequestIssuedInFuture,
    RequestExpired,
    TargetMismatch,
    AuthorizationRequired,
    AuthorizationRejected,
    AuthorizationReplayed,
    AuthorizationVerifierUnavailable,
    LocalPolicyDenied,
    LocalPolicyUnavailable,
    PermissionNotDetermined,
    PermissionNotGranted,
    PermissionDenied,
    PermissionRestricted,
    PreflightStale,
    PreflightObservationInvalid,
    CapabilityUnavailable,
    TargetUnavailable,
    DeviceUnavailable,
    DisplayUnavailable,
    ResourceBusy,
    IdempotencyInProgress,
    IdempotencyScopeConflict,
    TerminalRepositoryUnavailable,
    RestartRecoveryRequired,
    Cancelled,
    DeadlineExceeded,
    HelperTimedOut,
    HelperSpawnFailed,
    HelperExited,
    HelperProtocolInvalid,
    ArtifactMissing,
    ArtifactInvalid,
    ArtifactCommitFailed,
    PostCheckMismatch,
    CleanupFailed,
    InternalUnclassified,
}

/// A validated failure projection that can safely cross the Application boundary.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ExecutionFailure {
    stage: ExecutionStage,
    reason_code: ExecutionFailureReason,
    effect_state: EffectState,
    retry_safety: RetrySafety,
    recovery_action: RecoveryAction,
    #[serde(skip_serializing_if = "Option::is_none")]
    evidence_ref: Option<String>,
    correlation_id: String,
}

impl ExecutionFailure {
    /// Constructs a failure only when its effect and recovery claims agree.
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        stage: ExecutionStage,
        reason_code: ExecutionFailureReason,
        effect_state: EffectState,
        retry_safety: RetrySafety,
        recovery_action: RecoveryAction,
        evidence_ref: Option<String>,
        correlation_id: String,
    ) -> Result<Self, ExecutionFailureContractError> {
        let failure = Self {
            stage,
            reason_code,
            effect_state,
            retry_safety,
            recovery_action,
            evidence_ref,
            correlation_id,
        };
        failure.validate()?;
        Ok(failure)
    }

    pub(crate) fn validate(&self) -> Result<(), ExecutionFailureContractError> {
        if self.stage.is_before_effect()
            && !matches!(
                self.effect_state,
                EffectState::NotStarted | EffectState::ConfirmedNotApplied
            )
        {
            return Err(ExecutionFailureContractError::PreEffectStageHasInvalidEffectState);
        }
        if self.effect_state == EffectState::Unknown
            && (self.retry_safety != RetrySafety::ManualVerificationRequired
                || self.recovery_action != RecoveryAction::ManualEffectVerification)
        {
            return Err(ExecutionFailureContractError::UnknownEffectRequiresManualVerification);
        }
        if self.effect_state != EffectState::Unknown
            && (self.retry_safety == RetrySafety::ManualVerificationRequired
                || self.recovery_action == RecoveryAction::ManualEffectVerification)
        {
            return Err(ExecutionFailureContractError::ManualVerificationRequiresUnknownEffect);
        }
        if !is_bounded_non_blank(&self.correlation_id, MAX_CORRELATION_ID_BYTES) {
            return Err(ExecutionFailureContractError::InvalidCorrelationId);
        }
        if self
            .evidence_ref
            .as_deref()
            .is_some_and(|value| !is_bounded_non_blank(value, MAX_EVIDENCE_REF_BYTES))
        {
            return Err(ExecutionFailureContractError::InvalidEvidenceRef);
        }
        Ok(())
    }

    pub fn stage(&self) -> ExecutionStage {
        self.stage
    }

    pub fn reason_code(&self) -> ExecutionFailureReason {
        self.reason_code
    }

    pub fn effect_state(&self) -> EffectState {
        self.effect_state
    }

    pub fn retry_safety(&self) -> RetrySafety {
        self.retry_safety
    }

    pub fn recovery_action(&self) -> RecoveryAction {
        self.recovery_action
    }

    pub fn evidence_ref(&self) -> Option<&str> {
        self.evidence_ref.as_deref()
    }

    pub fn correlation_id(&self) -> &str {
        &self.correlation_id
    }
}

/// Contract violations rejected before a failure can be published or persisted.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExecutionFailureContractError {
    PreEffectStageHasInvalidEffectState,
    UnknownEffectRequiresManualVerification,
    ManualVerificationRequiresUnknownEffect,
    InvalidCorrelationId,
    InvalidEvidenceRef,
}

impl fmt::Display for ExecutionFailureContractError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::PreEffectStageHasInvalidEffectState => {
                "a pre-effect stage cannot claim an applied or unknown effect"
            }
            Self::UnknownEffectRequiresManualVerification => {
                "an unknown effect requires manual verification"
            }
            Self::ManualVerificationRequiresUnknownEffect => {
                "manual effect verification requires an unknown effect"
            }
            Self::InvalidCorrelationId => "correlation ID must be non-blank and bounded",
            Self::InvalidEvidenceRef => "evidence reference must be non-blank and bounded",
        })
    }
}

impl std::error::Error for ExecutionFailureContractError {}

fn is_bounded_non_blank(value: &str, max_bytes: usize) -> bool {
    !value.trim().is_empty() && value.len() <= max_bytes
}
