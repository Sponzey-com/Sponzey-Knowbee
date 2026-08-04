use knowbee_yeonjang::platform_operation::{
    BoundPlatformOperation, BoundPlatformOperationInput, CapabilityCommand,
    PlatformPreflightReceipt, PlatformResource, PreflightObservation, PreflightPermissionState,
    PreflightReceiptError,
};

#[test]
fn bound_capture_operation_has_a_stable_digest_and_closed_resource() {
    let input = camera_input("command-camera", "session-a");
    let first = BoundPlatformOperation::new(input.clone()).expect("bound camera operation");
    let second = BoundPlatformOperation::new(input).expect("same bound camera operation");

    assert_eq!(first.binding_digest(), second.binding_digest());
    assert!(first.binding_digest().starts_with("sha256:"));
    assert_eq!(first.command().resource(), PlatformResource::Camera);
    assert_eq!(first.command().method_code(), "camera.capture");

    let command = serde_json::to_value(first.command()).expect("closed command JSON");
    assert_eq!(command["kind"], "camera_capture");
    assert_eq!(command["device_id"], "camera-a");
}

#[test]
fn every_execution_critical_identity_changes_the_binding_digest() {
    let base = BoundPlatformOperation::new(camera_input("command-camera", "session-a"))
        .expect("base operation");
    let different_command = BoundPlatformOperation::new(camera_input("command-other", "session-a"))
        .expect("different command");
    let different_session =
        BoundPlatformOperation::new(camera_input("command-camera", "session-b"))
            .expect("different session");

    assert_ne!(base.binding_digest(), different_command.binding_digest());
    assert_ne!(base.binding_digest(), different_session.binding_digest());
}

#[test]
fn preflight_receipt_is_exactly_bound_and_cannot_be_reused_for_another_operation() {
    let original = BoundPlatformOperation::new(camera_input("command-camera", "session-a"))
        .expect("original operation");
    let other = BoundPlatformOperation::new(camera_input("command-other", "session-a"))
        .expect("other operation");
    let receipt = PlatformPreflightReceipt::for_operation(
        &original,
        PreflightObservation {
            capability_available: true,
            permission: PreflightPermissionState::Granted,
            resource_fingerprint: "camera-resource-a".to_string(),
            observed_at_ms: 10_000,
        },
    )
    .expect("preflight receipt");

    receipt
        .validate_for(&original, 10_050, 100)
        .expect("fresh exact receipt");
    assert_eq!(
        receipt
            .validate_for(&other, 10_050, 100)
            .expect_err("wrong operation cannot reuse receipt"),
        PreflightReceiptError::BindingMismatch
    );
}

#[test]
fn stale_or_future_preflight_observations_are_rejected_before_effect() {
    let operation = BoundPlatformOperation::new(screen_input()).expect("screen operation");
    let receipt = PlatformPreflightReceipt::for_operation(
        &operation,
        PreflightObservation {
            capability_available: true,
            permission: PreflightPermissionState::Granted,
            resource_fingerprint: "screen-resource-main".to_string(),
            observed_at_ms: 20_000,
        },
    )
    .expect("preflight receipt");

    assert_eq!(
        receipt
            .validate_for(&operation, 20_101, 100)
            .expect_err("stale observation"),
        PreflightReceiptError::Stale
    );
    assert_eq!(
        receipt
            .validate_for(&operation, 19_999, 100)
            .expect_err("future observation"),
        PreflightReceiptError::ObservationFromFuture
    );
}

fn camera_input(command_id: &str, session_id: &str) -> BoundPlatformOperationInput {
    BoundPlatformOperationInput {
        request_id: "request-camera".to_string(),
        command_id: command_id.to_string(),
        operation_id: "operation-camera".to_string(),
        requester_id: "requester-a".to_string(),
        target_platform: knowbee_yeonjang::platform_operation::TargetPlatform::Macos,
        target_instance_id: "instance-a".to_string(),
        target_session_id: session_id.to_string(),
        target_fingerprint:
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_string(),
        authorization_ref: "authorization-ref-camera".to_string(),
        policy_revision: 7,
        idempotency_key: "idempotency-camera".to_string(),
        deadline_ms: 30_000,
        cancellation_id: "cancel-camera".to_string(),
        artifact_lease_ref: Some("artifact-lease-camera".to_string()),
        command: CapabilityCommand::CameraCapture {
            device_id: Some("camera-a".to_string()),
            capture_timeout_ms: Some(1_000),
        },
    }
}

fn screen_input() -> BoundPlatformOperationInput {
    BoundPlatformOperationInput {
        request_id: "request-screen".to_string(),
        command_id: "command-screen".to_string(),
        operation_id: "operation-screen".to_string(),
        requester_id: "requester-a".to_string(),
        target_platform: knowbee_yeonjang::platform_operation::TargetPlatform::Macos,
        target_instance_id: "instance-a".to_string(),
        target_session_id: "session-a".to_string(),
        target_fingerprint:
            "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb".to_string(),
        authorization_ref: "authorization-ref-screen".to_string(),
        policy_revision: 8,
        idempotency_key: "idempotency-screen".to_string(),
        deadline_ms: 30_000,
        cancellation_id: "cancel-screen".to_string(),
        artifact_lease_ref: Some("artifact-lease-screen".to_string()),
        command: CapabilityCommand::ScreenCapture { display: Some(0) },
    }
}
