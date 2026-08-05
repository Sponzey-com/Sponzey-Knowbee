use knowbee_yeonjang::platform_execution::{
    EffectState, ExecutionFailure, ExecutionFailureContractError, ExecutionFailureReason,
    ExecutionStage, RecoveryAction, RetrySafety,
};

#[test]
fn closed_failure_values_serialize_to_stable_protocol_codes() {
    let failure = ExecutionFailure::new(
        ExecutionStage::OsPreflight,
        ExecutionFailureReason::PermissionDenied,
        EffectState::NotStarted,
        RetrySafety::LocalActionRequired,
        RecoveryAction::CompleteLocalOsSetup,
        Some("evidence:permission:camera".to_string()),
        "correlation-platform-1".to_string(),
    )
    .expect("valid preflight failure");

    let value = serde_json::to_value(failure).expect("failure JSON");
    assert_eq!(value["stage"], "os_preflight");
    assert_eq!(value["reason_code"], "permission_denied");
    assert_eq!(value["effect_state"], "not_started");
    assert_eq!(value["retry_safety"], "local_action_required");
    assert_eq!(value["recovery_action"], "complete_local_os_setup");
}

#[test]
fn pre_effect_stages_cannot_claim_an_effect_or_unknown_effect_state() {
    for effect_state in [EffectState::ConfirmedApplied, EffectState::Unknown] {
        let error = ExecutionFailure::new(
            ExecutionStage::Authorization,
            ExecutionFailureReason::AuthorizationRejected,
            effect_state,
            RetrySafety::ManualVerificationRequired,
            RecoveryAction::ManualEffectVerification,
            None,
            "correlation-platform-2".to_string(),
        )
        .expect_err("authorization ends before platform effect");

        assert_eq!(
            error,
            ExecutionFailureContractError::PreEffectStageHasInvalidEffectState
        );
    }
}

#[test]
fn unknown_effect_state_requires_manual_verification_and_the_matching_recovery() {
    let error = ExecutionFailure::new(
        ExecutionStage::HelperExecution,
        ExecutionFailureReason::HelperExited,
        EffectState::Unknown,
        RetrySafety::MaterialChangeRequired,
        RecoveryAction::None,
        None,
        "correlation-platform-3".to_string(),
    )
    .expect_err("unknown effects are never automatically retried");

    assert_eq!(
        error,
        ExecutionFailureContractError::UnknownEffectRequiresManualVerification
    );

    ExecutionFailure::new(
        ExecutionStage::HelperExecution,
        ExecutionFailureReason::HelperExited,
        EffectState::Unknown,
        RetrySafety::ManualVerificationRequired,
        RecoveryAction::ManualEffectVerification,
        Some("evidence:helper:receipt".to_string()),
        "correlation-platform-4".to_string(),
    )
    .expect("manual verification contract");
}

#[test]
fn public_failure_references_are_required_and_bounded() {
    assert_eq!(
        ExecutionFailure::new(
            ExecutionStage::PlatformDispatch,
            ExecutionFailureReason::InternalUnclassified,
            EffectState::ConfirmedNotApplied,
            RetrySafety::MaterialChangeRequired,
            RecoveryAction::None,
            None,
            " ".to_string(),
        )
        .expect_err("blank correlation"),
        ExecutionFailureContractError::InvalidCorrelationId
    );

    assert_eq!(
        ExecutionFailure::new(
            ExecutionStage::PlatformDispatch,
            ExecutionFailureReason::InternalUnclassified,
            EffectState::ConfirmedNotApplied,
            RetrySafety::MaterialChangeRequired,
            RecoveryAction::None,
            Some("x".repeat(257)),
            "correlation-platform-5".to_string(),
        )
        .expect_err("oversized evidence reference"),
        ExecutionFailureContractError::InvalidEvidenceRef
    );
}
