use knowbee_yeonjang::platform_execution::{
    EffectState, ExecutionFailureReason, ExecutionStage, RecoveryAction, RetrySafety,
};
use knowbee_yeonjang::protocol_v2::V2CommandParseError;
use knowbee_yeonjang::protocol_v2_admission::V2CommandAdmissionError;
use knowbee_yeonjang::protocol_v2_rejection::{map_v2_admission_rejection, map_v2_parse_rejection};

#[test]
fn every_parse_rejection_has_a_precise_pre_effect_projection() {
    let fixtures = [
        (
            V2CommandParseError::PayloadTooLarge,
            ExecutionStage::IngressValidation,
            ExecutionFailureReason::InvalidRequest,
        ),
        (
            V2CommandParseError::Malformed,
            ExecutionStage::IngressValidation,
            ExecutionFailureReason::InvalidRequest,
        ),
        (
            V2CommandParseError::ProtocolUpgradeRequired,
            ExecutionStage::IngressValidation,
            ExecutionFailureReason::ProtocolUpgradeRequired,
        ),
        (
            V2CommandParseError::ProtocolVersionUnsupported,
            ExecutionStage::IngressValidation,
            ExecutionFailureReason::ProtocolVersionUnsupported,
        ),
        (
            V2CommandParseError::TopicMismatch,
            ExecutionStage::TargetValidation,
            ExecutionFailureReason::TargetMismatch,
        ),
        (
            V2CommandParseError::UnknownOrInvalidField,
            ExecutionStage::IngressValidation,
            ExecutionFailureReason::InvalidRequest,
        ),
        (
            V2CommandParseError::IssuedInFuture,
            ExecutionStage::IngressValidation,
            ExecutionFailureReason::RequestIssuedInFuture,
        ),
        (
            V2CommandParseError::Expired,
            ExecutionStage::IngressValidation,
            ExecutionFailureReason::RequestExpired,
        ),
        (
            V2CommandParseError::IdentityMismatch,
            ExecutionStage::TargetValidation,
            ExecutionFailureReason::TargetMismatch,
        ),
        (
            V2CommandParseError::AuthorizationMismatch,
            ExecutionStage::Authorization,
            ExecutionFailureReason::AuthorizationRejected,
        ),
    ];

    for (error, stage, reason) in fixtures {
        let failure = map_v2_parse_rejection(error, "ingress-correlation".to_string())
            .expect("valid projection");
        assert_eq!(failure.stage(), stage);
        assert_eq!(failure.reason_code(), reason);
        assert_eq!(failure.effect_state(), EffectState::NotStarted);
    }
}

#[test]
fn admission_rejections_keep_replay_and_verifier_availability_distinct() {
    let fixtures = [
        (
            V2CommandAdmissionError::SignatureRejected,
            ExecutionFailureReason::AuthorizationRejected,
            RetrySafety::NotRetryable,
            RecoveryAction::None,
        ),
        (
            V2CommandAdmissionError::Expired,
            ExecutionFailureReason::RequestExpired,
            RetrySafety::MaterialChangeRequired,
            RecoveryAction::CorrectRequest,
        ),
        (
            V2CommandAdmissionError::Replayed,
            ExecutionFailureReason::AuthorizationReplayed,
            RetrySafety::NotRetryable,
            RecoveryAction::None,
        ),
        (
            V2CommandAdmissionError::ReplayUnavailable,
            ExecutionFailureReason::AuthorizationVerifierUnavailable,
            RetrySafety::SafeRedeliverySameIdempotency,
            RecoveryAction::RetryAdmission,
        ),
    ];

    for (error, reason, retry, recovery) in fixtures {
        let failure = map_v2_admission_rejection(error, "admission-correlation".to_string())
            .expect("valid projection");
        assert_eq!(failure.stage(), ExecutionStage::Authorization);
        assert_eq!(failure.reason_code(), reason);
        assert_eq!(failure.effect_state(), EffectState::NotStarted);
        assert_eq!(failure.retry_safety(), retry);
        assert_eq!(failure.recovery_action(), recovery);
    }
}

#[test]
fn serialized_rejection_contains_only_closed_bounded_evidence() {
    let failure = map_v2_admission_rejection(
        V2CommandAdmissionError::ReplayUnavailable,
        "safe-correlation".to_string(),
    )
    .expect("failure");

    assert_eq!(
        serde_json::to_value(failure).expect("serialized failure"),
        serde_json::json!({
            "stage": "authorization",
            "reason_code": "authorization_verifier_unavailable",
            "effect_state": "not_started",
            "retry_safety": "safe_redelivery_same_idempotency",
            "recovery_action": "retry_admission",
            "correlation_id": "safe-correlation"
        })
    );
}
