use knowbee_yeonjang::platform_execution::{
    EffectState, ExecutionFailure, ExecutionFailureReason, ExecutionStage, RecoveryAction,
    RetrySafety,
};
use knowbee_yeonjang::platform_operation::{
    BoundPlatformOperation, BoundPlatformOperationInput, CapabilityCommand, TargetPlatform,
};
use knowbee_yeonjang::terminal_receipt::{
    DeliveryOutcome, ExecutionOutcome, TerminalReceipt, TerminalReceiptError,
};

#[test]
fn terminal_receipt_preserves_exact_bound_identity_with_stable_codes() {
    let operation = camera_operation();
    let receipt = TerminalReceipt::new(
        &operation,
        ExecutionOutcome::Succeeded,
        DeliveryOutcome::Published,
        1,
        None,
    )
    .expect("successful terminal");

    let value = serde_json::to_value(receipt).expect("terminal JSON");
    assert_eq!(value["schema_version"], 1);
    assert_eq!(value["request_id"], "request-terminal");
    assert_eq!(value["command_id"], "command-terminal");
    assert_eq!(value["operation_id"], "operation-terminal");
    assert_eq!(value["target"]["platform"], "macos");
    assert_eq!(value["target"]["instance_id"], "instance-terminal");
    assert_eq!(value["method"], "camera.capture");
    assert_eq!(value["resource"], "camera");
    assert_eq!(value["execution_outcome"], "succeeded");
    assert_eq!(value["delivery_outcome"], "published");
    assert!(value.get("failure").is_none());
}

#[test]
fn confirmed_execution_can_keep_success_when_only_response_publish_failed() {
    let operation = camera_operation();
    let delivery_failure = ExecutionFailure::new(
        ExecutionStage::ResponsePublish,
        ExecutionFailureReason::InternalUnclassified,
        EffectState::ConfirmedApplied,
        RetrySafety::SafeRedeliverySameIdempotency,
        RecoveryAction::ReconnectTransport,
        Some("evidence:delivery:receipt".to_string()),
        operation.binding_digest().to_string(),
    )
    .expect("delivery failure");
    let receipt = TerminalReceipt::new(
        &operation,
        ExecutionOutcome::Succeeded,
        DeliveryOutcome::PendingRetry,
        2,
        Some(delivery_failure),
    )
    .expect("independent delivery failure");

    assert_eq!(receipt.execution_outcome(), ExecutionOutcome::Succeeded);
    assert_eq!(receipt.delivery_outcome(), DeliveryOutcome::PendingRetry);
    assert_eq!(
        receipt.failure().expect("delivery failure").effect_state(),
        EffectState::ConfirmedApplied
    );
}

#[test]
fn blocked_and_effect_unknown_outcomes_reject_contradictory_effect_claims() {
    let operation = camera_operation();
    let applied = ExecutionFailure::new(
        ExecutionStage::CleanupRecovery,
        ExecutionFailureReason::ResourceBusy,
        EffectState::ConfirmedApplied,
        RetrySafety::NotRetryable,
        RecoveryAction::ReleaseResource,
        None,
        operation.binding_digest().to_string(),
    )
    .expect("failure value can represent later-stage applied evidence");
    assert_eq!(
        TerminalReceipt::new(
            &operation,
            ExecutionOutcome::Blocked,
            DeliveryOutcome::NotStarted,
            1,
            Some(applied),
        )
        .expect_err("blocked cannot claim applied effect"),
        TerminalReceiptError::BlockedHasInvalidEffectState
    );

    let known_not_applied = ExecutionFailure::new(
        ExecutionStage::PlatformDispatch,
        ExecutionFailureReason::HelperExited,
        EffectState::ConfirmedNotApplied,
        RetrySafety::MaterialChangeRequired,
        RecoveryAction::None,
        None,
        operation.binding_digest().to_string(),
    )
    .expect("known non-applied failure");
    assert_eq!(
        TerminalReceipt::new(
            &operation,
            ExecutionOutcome::EffectUnknown,
            DeliveryOutcome::NotStarted,
            1,
            Some(known_not_applied),
        )
        .expect_err("effect-unknown requires unknown evidence"),
        TerminalReceiptError::EffectUnknownRequiresUnknownEffect
    );
}

#[test]
fn every_non_success_execution_requires_a_typed_failure() {
    let operation = camera_operation();
    assert_eq!(
        TerminalReceipt::new(
            &operation,
            ExecutionOutcome::Failed,
            DeliveryOutcome::NotStarted,
            1,
            None,
        )
        .expect_err("failed terminal without failure"),
        TerminalReceiptError::MissingFailure
    );
}

fn camera_operation() -> BoundPlatformOperation {
    BoundPlatformOperation::new(BoundPlatformOperationInput {
        request_id: "request-terminal".to_string(),
        command_id: "command-terminal".to_string(),
        operation_id: "operation-terminal".to_string(),
        requester_id: "requester-terminal".to_string(),
        target_platform: TargetPlatform::Macos,
        target_instance_id: "instance-terminal".to_string(),
        target_session_id: "session-terminal".to_string(),
        target_fingerprint:
            "sha256:1212121212121212121212121212121212121212121212121212121212121212".to_string(),
        authorization_ref: "authorization-terminal".to_string(),
        policy_revision: 3,
        idempotency_key: "idempotency-terminal".to_string(),
        deadline_ms: 2_000,
        cancellation_id: "cancel-terminal".to_string(),
        artifact_lease_ref: Some("artifact-terminal".to_string()),
        command: CapabilityCommand::CameraCapture {
            device_id: None,
            capture_timeout_ms: Some(1_000),
        },
    })
    .expect("terminal operation")
}
