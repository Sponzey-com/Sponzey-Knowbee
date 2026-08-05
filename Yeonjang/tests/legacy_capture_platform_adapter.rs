#[path = "support/system_info_test_backend.rs"]
mod system_info_test_backend;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use knowbee_yeonjang::artifact_sink::{CaptureArtifactSink, FilesystemCaptureArtifactSink};
use knowbee_yeonjang::automation::AutomationBackend;
use knowbee_yeonjang::cancellation::{
    ActiveCommandRegistration, ActiveCommandRegistry, CommandTargetBinding,
};
use knowbee_yeonjang::execute_capability::{
    ExecuteCapabilityResult, ExecuteCapabilityUseCase, ExecutionCancellation, ExecutionClock,
};
use knowbee_yeonjang::legacy_capture_platform::{
    LegacyCancellationSignalResolver, LegacyCapturePlatformAdapter, LegacyScreenPermissionProbe,
    ScreenPermissionProbeError,
};
use knowbee_yeonjang::platform_execution::{
    EffectState, ExecutionFailureReason, ExecutionStage, RetrySafety,
};
use knowbee_yeonjang::platform_operation::{
    BoundPlatformOperation, BoundPlatformOperationInput, CapabilityCommand,
    PreflightPermissionState,
};
use system_info_test_backend::SystemInfoTestBackend;

#[test]
fn canonical_active_registry_resolves_the_exact_legacy_camera_cancellation_signal() {
    let registry = ActiveCommandRegistry::default();
    let target = CommandTargetBinding::new(
        "request-registry",
        "command-registry",
        "operation-registry",
        "session-registry",
        "sha256:abababababababababababababababababababababababababababababababab",
        "idempotency-registry",
    )
    .expect("target binding");
    assert!(matches!(
        registry.register_running_bound_with_cancellation_id(
            target,
            "cancel-registry",
            "cancel-token-registry"
        ),
        ActiveCommandRegistration::Registered(_)
    ));

    let signal = LegacyCancellationSignalResolver::resolve(&registry, "cancel-registry")
        .expect("exact active signal");
    assert!(!signal.load(Ordering::Acquire));
    assert!(LegacyCancellationSignalResolver::resolve(&registry, "wrong-cancel").is_none());
}

#[test]
fn existing_camera_backend_and_artifact_sink_complete_through_the_common_use_case() {
    let root = artifact_root("success");
    let sink = Arc::new(FilesystemCaptureArtifactSink::new(&root).expect("artifact sink"));
    let backend = Arc::new(SystemInfoTestBackend::default());
    let signals = Arc::new(TestSignals::default());
    let clock = Arc::new(FixedClock(1_000));
    let adapter = Arc::new(LegacyCapturePlatformAdapter::new(
        backend.clone(),
        sink.clone(),
        clock.clone(),
        signals.clone(),
        Arc::new(FixedScreenPermissionProbe::granted()),
    ));
    let operation = camera_operation("success");

    let result =
        ExecuteCapabilityUseCase::new(adapter, clock, signals.clone(), 100).execute(&operation);

    let ExecuteCapabilityResult::Succeeded(receipt) = result else {
        panic!("expected common camera success");
    };
    receipt
        .validate_for(&operation)
        .expect("exact effect receipt");
    assert_eq!(
        receipt
            .artifact()
            .expect("typed camera artifact evidence")
            .artifact_ref(),
        receipt.native_receipt_ref()
    );
    assert_eq!(backend.camera_capture_calls(), 1);
    assert_eq!(
        signals.last_resolved_id(),
        Some("cancel-success".to_string())
    );
    let artifact = sink
        .resolve(receipt.native_receipt_ref())
        .expect("opaque artifact resolves");
    artifact.remove().expect("artifact cleanup");
    std::fs::remove_dir_all(root).expect("root cleanup");
}

#[test]
fn requestable_camera_permission_reaches_the_existing_backend_once() {
    let root = artifact_root("requestable-permission");
    let sink = Arc::new(FilesystemCaptureArtifactSink::new(&root).expect("artifact sink"));
    let backend = Arc::new(SystemInfoTestBackend::with_requestable_camera_permission());
    let signals = Arc::new(TestSignals::default());
    let clock = Arc::new(FixedClock(1_000));
    let adapter = Arc::new(LegacyCapturePlatformAdapter::new(
        backend.clone(),
        sink.clone(),
        clock.clone(),
        signals.clone(),
        Arc::new(FixedScreenPermissionProbe::granted()),
    ));
    let operation = camera_operation("requestable-permission");

    let result = ExecuteCapabilityUseCase::new(adapter, clock, signals, 100).execute(&operation);

    let ExecuteCapabilityResult::Succeeded(receipt) = result else {
        panic!("requestable camera permission must reach the native adapter");
    };
    receipt
        .validate_for(&operation)
        .expect("exact effect receipt");
    assert_eq!(backend.camera_capture_calls(), 1);
    sink.resolve(receipt.native_receipt_ref())
        .expect("opaque artifact resolves")
        .remove()
        .expect("artifact cleanup");
    std::fs::remove_dir_all(root).expect("root cleanup");
}

#[test]
fn existing_typed_camera_timeout_returns_unknown_effect_without_a_raw_error() {
    let root = artifact_root("timeout");
    let sink: Arc<dyn CaptureArtifactSink> =
        Arc::new(FilesystemCaptureArtifactSink::new(&root).expect("artifact sink"));
    let backend = Arc::new(SystemInfoTestBackend::with_camera_timeout());
    let signals = Arc::new(TestSignals::default());
    let clock = Arc::new(FixedClock(1_000));
    let backend_port: Arc<dyn AutomationBackend> = backend.clone();
    let adapter = Arc::new(LegacyCapturePlatformAdapter::new(
        backend_port,
        sink,
        clock.clone(),
        signals.clone(),
        Arc::new(FixedScreenPermissionProbe::granted()),
    ));
    let operation = camera_operation("timeout");

    let result = ExecuteCapabilityUseCase::new(adapter, clock, signals, 100).execute(&operation);

    let ExecuteCapabilityResult::Failed(failure) = result else {
        panic!("expected typed timeout");
    };
    assert_eq!(failure.stage(), ExecutionStage::HelperExecution);
    assert_eq!(
        failure.reason_code(),
        ExecutionFailureReason::HelperTimedOut
    );
    assert_eq!(failure.effect_state(), EffectState::Unknown);
    assert_eq!(
        failure.retry_safety(),
        RetrySafety::ManualVerificationRequired
    );
    assert_eq!(backend.camera_capture_calls(), 1);
    let serialized = serde_json::to_string(&failure).expect("bounded failure");
    assert!(!serialized.contains(root.to_string_lossy().as_ref()));
    std::fs::remove_dir_all(root).expect("root cleanup");
}

#[test]
fn existing_screen_backend_and_artifact_sink_complete_through_the_common_use_case() {
    let root = artifact_root("screen-success");
    let sink = Arc::new(FilesystemCaptureArtifactSink::new(&root).expect("artifact sink"));
    let backend = Arc::new(SystemInfoTestBackend::default());
    let signals = Arc::new(TestSignals::default());
    let clock = Arc::new(FixedClock(1_000));
    let adapter = Arc::new(LegacyCapturePlatformAdapter::new(
        backend.clone(),
        sink.clone(),
        clock.clone(),
        signals.clone(),
        Arc::new(FixedScreenPermissionProbe::granted()),
    ));
    let operation = screen_operation("success");

    let result = ExecuteCapabilityUseCase::new(adapter, clock, signals, 100).execute(&operation);

    let ExecuteCapabilityResult::Succeeded(receipt) = result else {
        panic!("expected common screen success");
    };
    receipt
        .validate_for(&operation)
        .expect("exact screen effect receipt");
    assert_eq!(
        receipt
            .artifact()
            .expect("typed screen artifact evidence")
            .kind(),
        knowbee_yeonjang::artifact_sink::CaptureArtifactKind::ScreenPng
    );
    assert_eq!(backend.screen_capture_calls(), 1);
    let artifact = sink
        .resolve(receipt.native_receipt_ref())
        .expect("opaque screen artifact resolves");
    artifact.remove().expect("screen artifact cleanup");
    std::fs::remove_dir_all(root).expect("root cleanup");
}

#[test]
fn missing_screen_file_is_not_reported_as_platform_success() {
    let root = artifact_root("screen-missing");
    let sink: Arc<dyn CaptureArtifactSink> =
        Arc::new(FilesystemCaptureArtifactSink::new(&root).expect("artifact sink"));
    let backend = Arc::new(SystemInfoTestBackend::with_missing_capture_artifacts());
    let signals = Arc::new(TestSignals::default());
    let clock = Arc::new(FixedClock(1_000));
    let adapter = Arc::new(LegacyCapturePlatformAdapter::new(
        backend.clone(),
        sink,
        clock.clone(),
        signals.clone(),
        Arc::new(FixedScreenPermissionProbe::granted()),
    ));
    let operation = screen_operation("missing");

    let result = ExecuteCapabilityUseCase::new(adapter, clock, signals, 100).execute(&operation);

    let ExecuteCapabilityResult::Failed(failure) = result else {
        panic!("missing screen artifact must fail");
    };
    assert_eq!(failure.stage(), ExecutionStage::ArtifactCommit);
    assert_eq!(
        failure.reason_code(),
        ExecutionFailureReason::ArtifactMissing
    );
    assert_eq!(failure.effect_state(), EffectState::Unknown);
    assert_eq!(
        failure.retry_safety(),
        RetrySafety::ManualVerificationRequired
    );
    assert_eq!(backend.screen_capture_calls(), 1);
    std::fs::remove_dir_all(root).expect("root cleanup");
}

#[test]
fn denied_screen_permission_stops_before_the_backend_effect() {
    let root = artifact_root("screen-denied");
    let sink: Arc<dyn CaptureArtifactSink> =
        Arc::new(FilesystemCaptureArtifactSink::new(&root).expect("artifact sink"));
    let backend = Arc::new(SystemInfoTestBackend::default());
    let signals = Arc::new(TestSignals::default());
    let clock = Arc::new(FixedClock(1_000));
    let adapter = Arc::new(LegacyCapturePlatformAdapter::new(
        backend.clone(),
        sink,
        clock.clone(),
        signals.clone(),
        Arc::new(FixedScreenPermissionProbe::denied()),
    ));
    let operation = screen_operation("denied");

    let result = ExecuteCapabilityUseCase::new(adapter, clock, signals, 100).execute(&operation);

    let ExecuteCapabilityResult::Failed(failure) = result else {
        panic!("denied screen permission must fail");
    };
    assert_eq!(failure.stage(), ExecutionStage::OsPreflight);
    assert_eq!(
        failure.reason_code(),
        ExecutionFailureReason::PermissionDenied
    );
    assert_eq!(failure.effect_state(), EffectState::NotStarted);
    assert_eq!(backend.screen_capture_calls(), 0);
    std::fs::remove_dir_all(root).expect("root cleanup");
}

#[test]
fn unavailable_screen_permission_observation_is_bounded_and_stops_before_effect() {
    let root = artifact_root("screen-probe-unavailable");
    let sink: Arc<dyn CaptureArtifactSink> =
        Arc::new(FilesystemCaptureArtifactSink::new(&root).expect("artifact sink"));
    let backend = Arc::new(SystemInfoTestBackend::default());
    let signals = Arc::new(TestSignals::default());
    let clock = Arc::new(FixedClock(1_000));
    let adapter = Arc::new(LegacyCapturePlatformAdapter::new(
        backend.clone(),
        sink,
        clock.clone(),
        signals.clone(),
        Arc::new(FixedScreenPermissionProbe::unavailable()),
    ));

    let result = ExecuteCapabilityUseCase::new(adapter, clock, signals, 100)
        .execute(&screen_operation("probe-unavailable"));

    let ExecuteCapabilityResult::Failed(failure) = result else {
        panic!("unavailable permission observation must fail");
    };
    assert_eq!(
        failure.reason_code(),
        ExecutionFailureReason::PreflightObservationInvalid
    );
    assert_eq!(failure.effect_state(), EffectState::NotStarted);
    assert_eq!(backend.screen_capture_calls(), 0);
    std::fs::remove_dir_all(root).expect("root cleanup");
}

struct FixedClock(i64);

impl ExecutionClock for FixedClock {
    fn now_ms(&self) -> i64 {
        self.0
    }
}

#[derive(Default)]
struct TestSignals {
    signal: Arc<AtomicBool>,
    last_resolved: Mutex<Option<String>>,
}

impl TestSignals {
    fn last_resolved_id(&self) -> Option<String> {
        self.last_resolved.lock().expect("resolved ID").clone()
    }
}

impl ExecutionCancellation for TestSignals {
    fn is_cancelled(&self, cancellation_id: &str) -> bool {
        *self.last_resolved.lock().expect("resolved ID") = Some(cancellation_id.to_string());
        self.signal.load(Ordering::SeqCst)
    }
}

impl LegacyCancellationSignalResolver for TestSignals {
    fn resolve(&self, cancellation_id: &str) -> Option<Arc<AtomicBool>> {
        *self.last_resolved.lock().expect("resolved ID") = Some(cancellation_id.to_string());
        Some(Arc::clone(&self.signal))
    }
}

struct FixedScreenPermissionProbe(Result<PreflightPermissionState, ScreenPermissionProbeError>);

impl FixedScreenPermissionProbe {
    fn granted() -> Self {
        Self(Ok(PreflightPermissionState::Granted))
    }

    fn denied() -> Self {
        Self(Ok(PreflightPermissionState::Denied))
    }

    fn unavailable() -> Self {
        Self(Err(ScreenPermissionProbeError::ObservationUnavailable))
    }
}

impl LegacyScreenPermissionProbe for FixedScreenPermissionProbe {
    fn permission(&self) -> Result<PreflightPermissionState, ScreenPermissionProbeError> {
        self.0
    }
}

fn camera_operation(suffix: &str) -> BoundPlatformOperation {
    BoundPlatformOperation::new(BoundPlatformOperationInput {
        request_id: format!("request-{suffix}"),
        command_id: format!("command-{suffix}"),
        operation_id: format!("operation-{suffix}"),
        requester_id: "requester-adapter".to_string(),
        target_platform: knowbee_yeonjang::platform_operation::TargetPlatform::Macos,
        target_instance_id: "instance-adapter".to_string(),
        target_session_id: "session-adapter".to_string(),
        target_fingerprint:
            "sha256:abababababababababababababababababababababababababababababababab".to_string(),
        authorization_ref: format!("authorization-{suffix}"),
        policy_revision: 1,
        idempotency_key: format!("idempotency-{suffix}"),
        deadline_ms: 2_000,
        cancellation_id: format!("cancel-{suffix}"),
        artifact_lease_ref: Some(format!("artifact-lease-{suffix}")),
        command: CapabilityCommand::CameraCapture {
            device_id: Some("camera-a".to_string()),
            capture_timeout_ms: Some(500),
        },
    })
    .expect("bound camera operation")
}

fn screen_operation(suffix: &str) -> BoundPlatformOperation {
    BoundPlatformOperation::new(BoundPlatformOperationInput {
        request_id: format!("request-screen-{suffix}"),
        command_id: format!("command-screen-{suffix}"),
        operation_id: format!("operation-screen-{suffix}"),
        requester_id: "requester-adapter".to_string(),
        target_platform: knowbee_yeonjang::platform_operation::TargetPlatform::Macos,
        target_instance_id: "instance-adapter".to_string(),
        target_session_id: "session-adapter".to_string(),
        target_fingerprint:
            "sha256:cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd".to_string(),
        authorization_ref: format!("authorization-screen-{suffix}"),
        policy_revision: 1,
        idempotency_key: format!("idempotency-screen-{suffix}"),
        deadline_ms: 2_000,
        cancellation_id: format!("cancel-screen-{suffix}"),
        artifact_lease_ref: Some(format!("artifact-screen-{suffix}")),
        command: CapabilityCommand::ScreenCapture { display: Some(0) },
    })
    .expect("bound screen operation")
}

fn artifact_root(suffix: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!(
        "knowbee-legacy-capture-adapter-{}-{suffix}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos()
    ))
}
