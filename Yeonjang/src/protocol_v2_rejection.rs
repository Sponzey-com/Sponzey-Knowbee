//! Closed projection of MQTT v2 parser and admission errors into execution failures.

use crate::platform_execution::{
    EffectState, ExecutionFailure, ExecutionFailureContractError, ExecutionFailureReason,
    ExecutionStage, RecoveryAction, RetrySafety,
};
use crate::protocol_v2::V2CommandParseError;
use crate::protocol_v2_admission::V2CommandAdmissionError;

pub fn map_v2_parse_rejection(
    error: V2CommandParseError,
    correlation_id: String,
) -> Result<ExecutionFailure, ExecutionFailureContractError> {
    let (stage, reason, retry, recovery) = match error {
        V2CommandParseError::PayloadTooLarge
        | V2CommandParseError::Malformed
        | V2CommandParseError::UnknownOrInvalidField => (
            ExecutionStage::IngressValidation,
            ExecutionFailureReason::InvalidRequest,
            RetrySafety::MaterialChangeRequired,
            RecoveryAction::CorrectRequest,
        ),
        V2CommandParseError::ProtocolUpgradeRequired => (
            ExecutionStage::IngressValidation,
            ExecutionFailureReason::ProtocolUpgradeRequired,
            RetrySafety::MaterialChangeRequired,
            RecoveryAction::CorrectRequest,
        ),
        V2CommandParseError::ProtocolVersionUnsupported => (
            ExecutionStage::IngressValidation,
            ExecutionFailureReason::ProtocolVersionUnsupported,
            RetrySafety::MaterialChangeRequired,
            RecoveryAction::CorrectRequest,
        ),
        V2CommandParseError::TopicMismatch | V2CommandParseError::IdentityMismatch => (
            ExecutionStage::TargetValidation,
            ExecutionFailureReason::TargetMismatch,
            RetrySafety::MaterialChangeRequired,
            RecoveryAction::SelectSupportedTarget,
        ),
        V2CommandParseError::IssuedInFuture => (
            ExecutionStage::IngressValidation,
            ExecutionFailureReason::RequestIssuedInFuture,
            RetrySafety::MaterialChangeRequired,
            RecoveryAction::CorrectRequest,
        ),
        V2CommandParseError::Expired => (
            ExecutionStage::IngressValidation,
            ExecutionFailureReason::RequestExpired,
            RetrySafety::MaterialChangeRequired,
            RecoveryAction::CorrectRequest,
        ),
        V2CommandParseError::AuthorizationMismatch => (
            ExecutionStage::Authorization,
            ExecutionFailureReason::AuthorizationRejected,
            RetrySafety::MaterialChangeRequired,
            RecoveryAction::CorrectRequest,
        ),
    };
    pre_effect_failure(stage, reason, retry, recovery, correlation_id)
}

pub fn map_v2_admission_rejection(
    error: V2CommandAdmissionError,
    correlation_id: String,
) -> Result<ExecutionFailure, ExecutionFailureContractError> {
    let (reason, retry, recovery) = match error {
        V2CommandAdmissionError::SignatureRejected => (
            ExecutionFailureReason::AuthorizationRejected,
            RetrySafety::NotRetryable,
            RecoveryAction::None,
        ),
        V2CommandAdmissionError::Expired => (
            ExecutionFailureReason::RequestExpired,
            RetrySafety::MaterialChangeRequired,
            RecoveryAction::CorrectRequest,
        ),
        V2CommandAdmissionError::Replayed => (
            ExecutionFailureReason::AuthorizationReplayed,
            RetrySafety::NotRetryable,
            RecoveryAction::None,
        ),
        V2CommandAdmissionError::ReplayUnavailable => (
            ExecutionFailureReason::AuthorizationVerifierUnavailable,
            RetrySafety::SafeRedeliverySameIdempotency,
            RecoveryAction::RetryAdmission,
        ),
    };
    pre_effect_failure(
        ExecutionStage::Authorization,
        reason,
        retry,
        recovery,
        correlation_id,
    )
}

fn pre_effect_failure(
    stage: ExecutionStage,
    reason: ExecutionFailureReason,
    retry: RetrySafety,
    recovery: RecoveryAction,
    correlation_id: String,
) -> Result<ExecutionFailure, ExecutionFailureContractError> {
    ExecutionFailure::new(
        stage,
        reason,
        EffectState::NotStarted,
        retry,
        recovery,
        None,
        correlation_id,
    )
}
