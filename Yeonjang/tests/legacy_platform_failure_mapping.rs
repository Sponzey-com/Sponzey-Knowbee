use anyhow::anyhow;
use knowbee_yeonjang::artifact_sink::CaptureArtifactError;
use knowbee_yeonjang::automation::{CameraCaptureProcessError, ScreenCaptureProcessError};
use knowbee_yeonjang::legacy_platform_failure::{NativeFailureContext, map_legacy_platform_error};
use knowbee_yeonjang::platform_execution::{
    EffectState, ExecutionFailureReason, ExecutionStage, RecoveryAction, RetrySafety,
};
use knowbee_yeonjang::platform_operation::{
    BoundPlatformOperation, BoundPlatformOperationInput, CapabilityCommand,
};

#[test]
fn camera_permission_and_timeout_keep_distinct_stage_and_effect_contracts() {
    let operation = camera_operation();
    let denied = map_legacy_platform_error(
        &operation,
        NativeFailureContext::new(ExecutionStage::PlatformDispatch, EffectState::Unknown),
        &CameraCaptureProcessError::permission_denied().into(),
    );
    assert_eq!(
        denied.reason_code(),
        ExecutionFailureReason::PermissionDenied
    );
    assert_eq!(denied.stage(), ExecutionStage::OsPreflight);
    assert_eq!(denied.effect_state(), EffectState::NotStarted);
    assert_eq!(denied.retry_safety(), RetrySafety::LocalActionRequired);

    let timeout = map_legacy_platform_error(
        &operation,
        NativeFailureContext::new(ExecutionStage::HelperExecution, EffectState::Unknown),
        &CameraCaptureProcessError::timed_out().into(),
    );
    assert_eq!(
        timeout.reason_code(),
        ExecutionFailureReason::HelperTimedOut
    );
    assert_eq!(timeout.stage(), ExecutionStage::HelperExecution);
    assert_eq!(timeout.effect_state(), EffectState::Unknown);
    assert_eq!(
        timeout.retry_safety(),
        RetrySafety::ManualVerificationRequired
    );
}

#[test]
fn every_typed_camera_helper_failure_maps_without_native_text() {
    let operation = camera_operation();
    for (error, reason) in [
        (
            CameraCaptureProcessError::helper_spawn_failed(),
            ExecutionFailureReason::HelperSpawnFailed,
        ),
        (
            CameraCaptureProcessError::helper_exited(),
            ExecutionFailureReason::HelperExited,
        ),
        (
            CameraCaptureProcessError::helper_protocol_invalid(),
            ExecutionFailureReason::HelperProtocolInvalid,
        ),
    ] {
        let failure = map_legacy_platform_error(
            &operation,
            NativeFailureContext::new(ExecutionStage::HelperExecution, EffectState::Unknown),
            &error.into(),
        );
        assert_eq!(failure.reason_code(), reason);
        assert_eq!(failure.stage(), ExecutionStage::HelperExecution);
        assert_eq!(failure.effect_state(), EffectState::Unknown);
        assert_eq!(
            failure.retry_safety(),
            RetrySafety::ManualVerificationRequired
        );
    }
}

#[test]
fn every_capture_artifact_error_maps_to_a_known_reason() {
    let operation = camera_operation();
    for error in [
        CaptureArtifactError::InvalidRoot,
        CaptureArtifactError::InvalidOperation,
        CaptureArtifactError::LeaseConflict,
        CaptureArtifactError::StorageUnavailable,
        CaptureArtifactError::InvalidReference,
        CaptureArtifactError::CallerPathNotAllowed,
        CaptureArtifactError::ArtifactMissing,
        CaptureArtifactError::ArtifactInvalid,
        CaptureArtifactError::ArtifactWrongFormat,
        CaptureArtifactError::ArtifactDigestMismatch,
    ] {
        let failure = map_legacy_platform_error(
            &operation,
            NativeFailureContext::new(
                ExecutionStage::ArtifactCommit,
                EffectState::ConfirmedApplied,
            ),
            &error.into(),
        );
        assert_ne!(
            failure.reason_code(),
            ExecutionFailureReason::InternalUnclassified,
            "{error:?}"
        );
    }
}

#[test]
fn screen_permission_and_helper_exit_are_distinct_typed_failures() {
    let operation = camera_operation();
    let permission = map_legacy_platform_error(
        &operation,
        NativeFailureContext::new(ExecutionStage::HelperExecution, EffectState::Unknown),
        &ScreenCaptureProcessError::permission_not_granted().into(),
    );
    assert_eq!(
        permission.reason_code(),
        ExecutionFailureReason::PermissionNotGranted
    );
    assert_eq!(permission.stage(), ExecutionStage::OsPreflight);
    assert_eq!(permission.effect_state(), EffectState::NotStarted);

    let helper = map_legacy_platform_error(
        &operation,
        NativeFailureContext::new(ExecutionStage::HelperExecution, EffectState::Unknown),
        &ScreenCaptureProcessError::helper_exited().into(),
    );
    assert_eq!(helper.reason_code(), ExecutionFailureReason::HelperExited);
    assert_eq!(helper.effect_state(), EffectState::Unknown);
    assert_eq!(
        helper.retry_safety(),
        RetrySafety::ManualVerificationRequired
    );
}

#[test]
fn unsupported_screen_display_is_rejected_as_a_known_pre_effect_request_limitation() {
    let operation = camera_operation();
    let limitation = map_legacy_platform_error(
        &operation,
        NativeFailureContext::new(ExecutionStage::HelperExecution, EffectState::Unknown),
        &ScreenCaptureProcessError::display_selection_unsupported().into(),
    );

    assert_eq!(
        limitation.reason_code(),
        ExecutionFailureReason::InvalidRequest
    );
    assert_eq!(limitation.stage(), ExecutionStage::IngressValidation);
    assert_eq!(limitation.effect_state(), EffectState::NotStarted);
    assert_eq!(limitation.recovery_action(), RecoveryAction::CorrectRequest);
}

#[test]
fn missing_artifact_after_a_confirmed_effect_requests_artifact_recovery_not_effect_retry() {
    let operation = camera_operation();
    let failure = map_legacy_platform_error(
        &operation,
        NativeFailureContext::new(
            ExecutionStage::ArtifactCommit,
            EffectState::ConfirmedApplied,
        ),
        &CaptureArtifactError::ArtifactMissing.into(),
    );

    assert_eq!(
        failure.reason_code(),
        ExecutionFailureReason::ArtifactMissing
    );
    assert_eq!(failure.effect_state(), EffectState::ConfirmedApplied);
    assert_eq!(failure.retry_safety(), RetrySafety::LocalActionRequired);
    assert_eq!(
        failure.recovery_action(),
        RecoveryAction::FetchArtifactAgain
    );
}

#[test]
fn unknown_native_error_is_redacted_and_preserves_unknown_effect_state() {
    let operation = camera_operation();
    let raw = anyhow!("/Users/private/camera.jpg token=private-secret");
    let failure = map_legacy_platform_error(
        &operation,
        NativeFailureContext::new(ExecutionStage::PlatformDispatch, EffectState::Unknown),
        &raw,
    );

    assert_eq!(
        failure.reason_code(),
        ExecutionFailureReason::InternalUnclassified
    );
    assert_eq!(failure.stage(), ExecutionStage::PlatformDispatch);
    assert_eq!(failure.effect_state(), EffectState::Unknown);
    assert_eq!(
        failure.retry_safety(),
        RetrySafety::ManualVerificationRequired
    );
    let serialized = serde_json::to_string(&failure).expect("bounded failure");
    assert!(!serialized.contains("/Users/private"));
    assert!(!serialized.contains("private-secret"));
}

fn camera_operation() -> BoundPlatformOperation {
    BoundPlatformOperation::new(BoundPlatformOperationInput {
        request_id: "request-mapping".to_string(),
        command_id: "command-mapping".to_string(),
        operation_id: "operation-mapping".to_string(),
        requester_id: "requester-mapping".to_string(),
        target_platform: knowbee_yeonjang::platform_operation::TargetPlatform::Macos,
        target_instance_id: "instance-mapping".to_string(),
        target_session_id: "session-mapping".to_string(),
        target_fingerprint:
            "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff".to_string(),
        authorization_ref: "authorization-mapping".to_string(),
        policy_revision: 1,
        idempotency_key: "idempotency-mapping".to_string(),
        deadline_ms: 2_000,
        cancellation_id: "cancel-mapping".to_string(),
        artifact_lease_ref: Some("artifact-mapping".to_string()),
        command: CapabilityCommand::CameraCapture {
            device_id: None,
            capture_timeout_ms: Some(1_000),
        },
    })
    .expect("mapping operation")
}
