use knowbee_yeonjang::contract_only_platform::{ContractOnlyPlatform, ContractOnlyPlatformAdapter};
use knowbee_yeonjang::platform_execution::{
    EffectState, ExecutionFailureReason, ExecutionStage, RecoveryAction, RetrySafety,
};
use knowbee_yeonjang::platform_operation::{
    BoundPlatformOperation, BoundPlatformOperationInput, CapabilityCommand,
    PlatformPreflightReceipt, PreflightObservation, PreflightPermissionState,
};
use knowbee_yeonjang::platform_port::{
    PlatformCapabilityPort, PlatformEffectReceipt, PlatformEffectReceiptError,
};

#[test]
fn successful_effect_receipt_is_exactly_bound_to_one_operation() {
    let operation = camera_operation("command-a");
    let other = camera_operation("command-b");
    let receipt =
        PlatformEffectReceipt::for_operation(&operation, "native-receipt-camera".to_string(), 500)
            .expect("effect receipt");

    receipt
        .validate_for(&operation)
        .expect("exact operation binding");
    assert_eq!(
        receipt
            .validate_for(&other)
            .expect_err("different operation cannot reuse effect receipt"),
        PlatformEffectReceiptError::BindingMismatch
    );
    assert_eq!(receipt.native_receipt_ref(), "native-receipt-camera");
}

#[test]
fn contract_only_platforms_fail_preflight_without_fake_success() {
    let operation = camera_operation("command-unavailable");

    for platform in [
        ContractOnlyPlatform::Android,
        ContractOnlyPlatform::Ios,
        ContractOnlyPlatform::Unknown,
    ] {
        let port: &dyn PlatformCapabilityPort = &ContractOnlyPlatformAdapter::new(platform);
        let failure = port
            .preflight(&operation)
            .expect_err("contract-only target has no executable adapter");

        assert_eq!(failure.stage(), ExecutionStage::OsPreflight);
        assert_eq!(
            failure.reason_code(),
            ExecutionFailureReason::CapabilityUnavailable
        );
        assert_eq!(failure.effect_state(), EffectState::NotStarted);
        assert_eq!(failure.retry_safety(), RetrySafety::MaterialChangeRequired);
        assert_eq!(
            failure.recovery_action(),
            RecoveryAction::SelectSupportedTarget
        );
        assert!(failure.evidence_ref().is_none());
    }
}

#[test]
fn direct_execute_on_an_unavailable_adapter_remains_confirmed_not_applied() {
    let operation = camera_operation("command-direct-unavailable");
    let preflight = PlatformPreflightReceipt::for_operation(
        &operation,
        PreflightObservation {
            capability_available: false,
            permission: PreflightPermissionState::NotRequired,
            resource_fingerprint: "unavailable-camera-resource".to_string(),
            observed_at_ms: 100,
        },
    )
    .expect("contract fixture receipt");
    let adapter = ContractOnlyPlatformAdapter::new(ContractOnlyPlatform::Unknown);

    let failure = adapter
        .execute(&operation, &preflight)
        .expect_err("unavailable execute fails closed");

    assert_eq!(failure.stage(), ExecutionStage::PlatformDispatch);
    assert_eq!(failure.effect_state(), EffectState::ConfirmedNotApplied);
    assert_eq!(failure.retry_safety(), RetrySafety::NotRetryable);
}

fn camera_operation(command_id: &str) -> BoundPlatformOperation {
    BoundPlatformOperation::new(BoundPlatformOperationInput {
        request_id: format!("request-{command_id}"),
        command_id: command_id.to_string(),
        operation_id: format!("operation-{command_id}"),
        requester_id: "requester-contract".to_string(),
        target_platform: knowbee_yeonjang::platform_operation::TargetPlatform::Unknown,
        target_instance_id: "instance-contract".to_string(),
        target_session_id: "session-contract".to_string(),
        target_fingerprint:
            "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc".to_string(),
        authorization_ref: format!("authorization-{command_id}"),
        policy_revision: 1,
        idempotency_key: format!("idempotency-{command_id}"),
        deadline_ms: 1_000,
        cancellation_id: format!("cancel-{command_id}"),
        artifact_lease_ref: Some(format!("artifact-{command_id}")),
        command: CapabilityCommand::CameraCapture {
            device_id: None,
            capture_timeout_ms: Some(1_000),
        },
    })
    .expect("bound contract operation")
}
