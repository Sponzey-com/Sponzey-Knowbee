use std::sync::atomic::{AtomicI64, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use knowbee_yeonjang::execute_capability::{
    ExecuteCapabilityResult, ExecuteCapabilityUseCase, ExecutionCancellation, ExecutionClock,
};
use knowbee_yeonjang::platform_execution::{
    EffectState, ExecutionFailure, ExecutionFailureReason, ExecutionStage, RetrySafety,
};
use knowbee_yeonjang::platform_operation::{
    BoundPlatformOperation, BoundPlatformOperationInput, CapabilityCommand,
    PlatformPreflightReceipt, PreflightObservation, PreflightPermissionState,
    PreflightReceiptError,
};
use knowbee_yeonjang::platform_port::{PlatformCapabilityPort, PlatformEffectReceipt};
use knowbee_yeonjang::stage_timing::{
    RuntimeStage, StageTimingClock, StageTimingEvidence, StageTimingRecorder, StageTimingSink,
    StageTimingWriteError,
};

#[test]
fn use_case_owns_the_single_preflight_then_execute_order() {
    let operation = camera_operation("success");
    let fixture = FixturePort::new(
        operation.clone(),
        granted_observation(950),
        operation.clone(),
    );
    let events = Arc::clone(&fixture.events);
    let execute_calls = Arc::clone(&fixture.execute_calls);
    let use_case = ExecuteCapabilityUseCase::new(
        Arc::new(fixture),
        Arc::new(FixedClock(1_000)),
        Arc::new(NeverCancelled),
        100,
    );

    let result = use_case.execute(&operation);

    assert!(matches!(result, ExecuteCapabilityResult::Succeeded(_)));
    assert_eq!(*events.lock().expect("events"), ["preflight", "execute"]);
    assert_eq!(execute_calls.load(Ordering::SeqCst), 1);
}

#[test]
fn wrong_or_stale_preflight_never_reaches_execute() {
    let operation = camera_operation("requested");
    let wrong = camera_operation("wrong");
    let wrong_fixture =
        FixturePort::new(wrong.clone(), granted_observation(950), operation.clone());
    let wrong_calls = Arc::clone(&wrong_fixture.execute_calls);
    let wrong_result = ExecuteCapabilityUseCase::new(
        Arc::new(wrong_fixture),
        Arc::new(FixedClock(1_000)),
        Arc::new(NeverCancelled),
        100,
    )
    .execute(&operation);
    assert_failure(
        wrong_result,
        ExecutionStage::OsPreflight,
        ExecutionFailureReason::TargetMismatch,
        EffectState::NotStarted,
    );
    assert_eq!(wrong_calls.load(Ordering::SeqCst), 0);

    let stale_fixture = FixturePort::new(
        operation.clone(),
        granted_observation(899),
        operation.clone(),
    );
    let stale_calls = Arc::clone(&stale_fixture.execute_calls);
    let stale_result = ExecuteCapabilityUseCase::new(
        Arc::new(stale_fixture),
        Arc::new(FixedClock(1_000)),
        Arc::new(NeverCancelled),
        100,
    )
    .execute(&operation);
    assert_failure(
        stale_result,
        ExecutionStage::OsPreflight,
        ExecutionFailureReason::PreflightStale,
        EffectState::NotStarted,
    );
    assert_eq!(stale_calls.load(Ordering::SeqCst), 0);
}

#[test]
fn denied_permission_is_a_local_action_before_effect() {
    let operation = camera_operation("permission");
    let fixture = FixturePort::new(
        operation.clone(),
        PreflightObservation {
            capability_available: true,
            permission: PreflightPermissionState::Denied,
            resource_fingerprint: "camera-resource".to_string(),
            observed_at_ms: 990,
        },
        operation.clone(),
    );
    let execute_calls = Arc::clone(&fixture.execute_calls);
    let result = ExecuteCapabilityUseCase::new(
        Arc::new(fixture),
        Arc::new(FixedClock(1_000)),
        Arc::new(NeverCancelled),
        100,
    )
    .execute(&operation);

    let failure = assert_failure(
        result,
        ExecutionStage::OsPreflight,
        ExecutionFailureReason::PermissionDenied,
        EffectState::NotStarted,
    );
    assert_eq!(failure.retry_safety(), RetrySafety::LocalActionRequired);
    assert_eq!(execute_calls.load(Ordering::SeqCst), 0);
}

#[test]
fn not_determined_without_requestable_evidence_never_reaches_execute() {
    let operation = camera_operation("permission-not-requestable");
    let fixture = FixturePort::new(
        operation.clone(),
        PreflightObservation {
            capability_available: true,
            permission: PreflightPermissionState::NotDetermined,
            resource_fingerprint: "camera-resource".to_string(),
            observed_at_ms: 990,
        },
        operation.clone(),
    );
    let execute_calls = Arc::clone(&fixture.execute_calls);
    let result = ExecuteCapabilityUseCase::new(
        Arc::new(fixture),
        Arc::new(FixedClock(1_000)),
        Arc::new(NeverCancelled),
        100,
    )
    .execute(&operation);

    assert_failure(
        result,
        ExecutionStage::OsPreflight,
        ExecutionFailureReason::PermissionNotDetermined,
        EffectState::NotStarted,
    );
    assert_eq!(execute_calls.load(Ordering::SeqCst), 0);
}

#[test]
fn exact_camera_operation_reaches_platform_consent_when_permission_is_not_determined() {
    let operation = camera_operation("camera-consent");
    let fixture = RequestablePermissionPort::new(operation.clone());
    let execute_calls = Arc::clone(&fixture.execute_calls);

    let result = ExecuteCapabilityUseCase::new(
        Arc::new(fixture),
        Arc::new(FixedClock(1_000)),
        Arc::new(NeverCancelled),
        100,
    )
    .execute(&operation);

    assert!(matches!(result, ExecuteCapabilityResult::Succeeded(_)));
    assert_eq!(execute_calls.load(Ordering::SeqCst), 1);
}

#[test]
fn screen_operation_does_not_request_os_consent_from_not_determined_preflight() {
    let operation = screen_operation("screen-no-consent");
    let fixture = FixturePort::new(
        operation.clone(),
        permission_observation(PreflightPermissionState::NotDetermined, 990),
        operation.clone(),
    );
    let execute_calls = Arc::clone(&fixture.execute_calls);

    let result = ExecuteCapabilityUseCase::new(
        Arc::new(fixture),
        Arc::new(FixedClock(1_000)),
        Arc::new(NeverCancelled),
        100,
    )
    .execute(&operation);

    assert_failure(
        result,
        ExecutionStage::OsPreflight,
        ExecutionFailureReason::PermissionNotDetermined,
        EffectState::NotStarted,
    );
    assert_eq!(execute_calls.load(Ordering::SeqCst), 0);
}

#[test]
fn requestable_permission_receipt_rejects_screen_and_durable_denial() {
    let screen = screen_operation("screen-requestable-invalid");
    let screen_result = PlatformPreflightReceipt::for_operation_with_permission_request(
        &screen,
        permission_observation(PreflightPermissionState::NotDetermined, 990),
    );
    assert_eq!(
        screen_result.expect_err("screen permission request must fail closed"),
        PreflightReceiptError::PermissionRequestNotAllowed,
    );

    let camera = camera_operation("denied-requestable-invalid");
    let denied_result = PlatformPreflightReceipt::for_operation_with_permission_request(
        &camera,
        permission_observation(PreflightPermissionState::Denied, 990),
    );
    assert_eq!(
        denied_result.expect_err("durable denial must fail closed"),
        PreflightReceiptError::PermissionRequestNotAllowed,
    );
}

#[test]
fn mismatched_success_receipt_preserves_unknown_effect_and_requires_manual_review() {
    let operation = camera_operation("receipt-requested");
    let wrong_effect = camera_operation("receipt-wrong");
    let fixture = FixturePort::new(operation.clone(), granted_observation(990), wrong_effect);
    let result = ExecuteCapabilityUseCase::new(
        Arc::new(fixture),
        Arc::new(FixedClock(1_000)),
        Arc::new(NeverCancelled),
        100,
    )
    .execute(&operation);

    let failure = assert_failure(
        result,
        ExecutionStage::PostCheck,
        ExecutionFailureReason::PostCheckMismatch,
        EffectState::Unknown,
    );
    assert_eq!(
        failure.retry_safety(),
        RetrySafety::ManualVerificationRequired
    );
}

#[test]
fn use_case_observes_handler_and_post_check_without_changing_success() {
    let operation = camera_operation("timed");
    let timing_clock = Arc::new(MutableStageClock::new(5_000, 10_000));
    let timing_sink = Arc::new(StageValues::default());
    let fixture = FixturePort::new(
        operation.clone(),
        granted_observation(990),
        operation.clone(),
    )
    .with_timing_advance(timing_clock.clone(), 2, 1_250);
    let result = ExecuteCapabilityUseCase::new(
        Arc::new(fixture),
        Arc::new(FixedClock(1_000)),
        Arc::new(NeverCancelled),
        100,
    )
    .with_stage_timing(StageTimingRecorder::new(timing_clock, timing_sink.clone()))
    .execute(&operation);

    assert!(matches!(result, ExecuteCapabilityResult::Succeeded(_)));
    let evidence = timing_sink.values();
    assert_eq!(evidence.len(), 2);
    assert_eq!(evidence[0].stage(), RuntimeStage::Handler);
    assert_eq!(evidence[0].duration_us(), 1_250);
    assert_eq!(evidence[1].stage(), RuntimeStage::PostCheck);
    assert_eq!(evidence[1].duration_us(), 0);
    assert!(
        evidence
            .iter()
            .all(|row| row.correlation_id() == operation.binding_digest())
    );
}

struct FixedClock(i64);

impl ExecutionClock for FixedClock {
    fn now_ms(&self) -> i64 {
        self.0
    }
}

struct NeverCancelled;

impl ExecutionCancellation for NeverCancelled {
    fn is_cancelled(&self, _cancellation_id: &str) -> bool {
        false
    }
}

struct FixturePort {
    preflight_operation: BoundPlatformOperation,
    observation: PreflightObservation,
    effect_operation: BoundPlatformOperation,
    events: Arc<Mutex<Vec<&'static str>>>,
    execute_calls: Arc<AtomicUsize>,
    timing_advance: Option<(Arc<MutableStageClock>, i64, u64)>,
}

impl FixturePort {
    fn new(
        preflight_operation: BoundPlatformOperation,
        observation: PreflightObservation,
        effect_operation: BoundPlatformOperation,
    ) -> Self {
        Self {
            preflight_operation,
            observation,
            effect_operation,
            events: Arc::new(Mutex::new(Vec::new())),
            execute_calls: Arc::new(AtomicUsize::new(0)),
            timing_advance: None,
        }
    }

    fn with_timing_advance(
        mut self,
        clock: Arc<MutableStageClock>,
        wall_ms: i64,
        monotonic_us: u64,
    ) -> Self {
        self.timing_advance = Some((clock, wall_ms, monotonic_us));
        self
    }
}

impl PlatformCapabilityPort for FixturePort {
    fn preflight(
        &self,
        _operation: &BoundPlatformOperation,
    ) -> Result<PlatformPreflightReceipt, ExecutionFailure> {
        self.events.lock().expect("events").push("preflight");
        PlatformPreflightReceipt::for_operation(&self.preflight_operation, self.observation.clone())
            .map_err(|error| panic!("fixture preflight: {error}"))
    }

    fn execute(
        &self,
        _operation: &BoundPlatformOperation,
        _preflight: &PlatformPreflightReceipt,
    ) -> Result<PlatformEffectReceipt, ExecutionFailure> {
        self.events.lock().expect("events").push("execute");
        self.execute_calls.fetch_add(1, Ordering::SeqCst);
        if let Some((clock, wall_ms, monotonic_us)) = &self.timing_advance {
            clock.advance(*wall_ms, *monotonic_us);
        }
        Ok(PlatformEffectReceipt::for_operation(
            &self.effect_operation,
            "native-receipt".to_string(),
            1_000,
        )
        .expect("fixture effect receipt"))
    }
}

struct RequestablePermissionPort {
    operation: BoundPlatformOperation,
    execute_calls: Arc<AtomicUsize>,
}

impl RequestablePermissionPort {
    fn new(operation: BoundPlatformOperation) -> Self {
        Self {
            operation,
            execute_calls: Arc::new(AtomicUsize::new(0)),
        }
    }
}

impl PlatformCapabilityPort for RequestablePermissionPort {
    fn preflight(
        &self,
        operation: &BoundPlatformOperation,
    ) -> Result<PlatformPreflightReceipt, ExecutionFailure> {
        PlatformPreflightReceipt::for_operation_with_permission_request(
            operation,
            PreflightObservation {
                capability_available: true,
                permission: PreflightPermissionState::NotDetermined,
                resource_fingerprint: "camera-resource".to_string(),
                observed_at_ms: 990,
            },
        )
        .map_err(|error| panic!("requestable preflight: {error}"))
    }

    fn execute(
        &self,
        operation: &BoundPlatformOperation,
        _preflight: &PlatformPreflightReceipt,
    ) -> Result<PlatformEffectReceipt, ExecutionFailure> {
        assert_eq!(operation.binding_digest(), self.operation.binding_digest());
        self.execute_calls.fetch_add(1, Ordering::SeqCst);
        Ok(PlatformEffectReceipt::for_operation(
            operation,
            "native-permission-receipt".to_string(),
            1_000,
        )
        .expect("requestable effect receipt"))
    }
}

struct MutableStageClock {
    wall_ms: AtomicI64,
    monotonic_us: AtomicU64,
}

impl MutableStageClock {
    fn new(wall_ms: i64, monotonic_us: u64) -> Self {
        Self {
            wall_ms: AtomicI64::new(wall_ms),
            monotonic_us: AtomicU64::new(monotonic_us),
        }
    }

    fn advance(&self, wall_ms: i64, monotonic_us: u64) {
        self.wall_ms.fetch_add(wall_ms, Ordering::SeqCst);
        self.monotonic_us.fetch_add(monotonic_us, Ordering::SeqCst);
    }
}

impl StageTimingClock for MutableStageClock {
    fn wall_time_ms(&self) -> i64 {
        self.wall_ms.load(Ordering::SeqCst)
    }

    fn monotonic_time_us(&self) -> u64 {
        self.monotonic_us.load(Ordering::SeqCst)
    }
}

#[derive(Default)]
struct StageValues(Mutex<Vec<StageTimingEvidence>>);

impl StageValues {
    fn values(&self) -> Vec<StageTimingEvidence> {
        self.0.lock().expect("stage values").clone()
    }
}

impl StageTimingSink for StageValues {
    fn record(&self, evidence: StageTimingEvidence) -> Result<(), StageTimingWriteError> {
        self.0
            .lock()
            .map_err(|_| StageTimingWriteError::Unavailable)?
            .push(evidence);
        Ok(())
    }
}

fn granted_observation(observed_at_ms: i64) -> PreflightObservation {
    permission_observation(PreflightPermissionState::Granted, observed_at_ms)
}

fn permission_observation(
    permission: PreflightPermissionState,
    observed_at_ms: i64,
) -> PreflightObservation {
    PreflightObservation {
        capability_available: true,
        permission,
        resource_fingerprint: "camera-resource".to_string(),
        observed_at_ms,
    }
}

fn assert_failure(
    result: ExecuteCapabilityResult,
    stage: ExecutionStage,
    reason: ExecutionFailureReason,
    effect_state: EffectState,
) -> ExecutionFailure {
    let ExecuteCapabilityResult::Failed(failure) = result else {
        panic!("expected failed execution result");
    };
    assert_eq!(failure.stage(), stage);
    assert_eq!(failure.reason_code(), reason);
    assert_eq!(failure.effect_state(), effect_state);
    failure
}

fn camera_operation(suffix: &str) -> BoundPlatformOperation {
    BoundPlatformOperation::new(BoundPlatformOperationInput {
        request_id: format!("request-{suffix}"),
        command_id: format!("command-{suffix}"),
        operation_id: format!("operation-{suffix}"),
        requester_id: "requester-use-case".to_string(),
        target_platform: knowbee_yeonjang::platform_operation::TargetPlatform::Macos,
        target_instance_id: "instance-use-case".to_string(),
        target_session_id: "session-use-case".to_string(),
        target_fingerprint:
            "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd".to_string(),
        authorization_ref: format!("authorization-{suffix}"),
        policy_revision: 1,
        idempotency_key: format!("idempotency-{suffix}"),
        deadline_ms: 2_000,
        cancellation_id: format!("cancel-{suffix}"),
        artifact_lease_ref: Some(format!("artifact-{suffix}")),
        command: CapabilityCommand::CameraCapture {
            device_id: None,
            capture_timeout_ms: Some(1_000),
        },
    })
    .expect("bound use-case operation")
}

fn screen_operation(suffix: &str) -> BoundPlatformOperation {
    BoundPlatformOperation::new(BoundPlatformOperationInput {
        request_id: format!("request-{suffix}"),
        command_id: format!("command-{suffix}"),
        operation_id: format!("operation-{suffix}"),
        requester_id: "requester-use-case".to_string(),
        target_platform: knowbee_yeonjang::platform_operation::TargetPlatform::Macos,
        target_instance_id: "instance-use-case".to_string(),
        target_session_id: "session-use-case".to_string(),
        target_fingerprint:
            "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee".to_string(),
        authorization_ref: format!("authorization-{suffix}"),
        policy_revision: 1,
        idempotency_key: format!("idempotency-{suffix}"),
        deadline_ms: 2_000,
        cancellation_id: format!("cancel-{suffix}"),
        artifact_lease_ref: Some(format!("artifact-{suffix}")),
        command: CapabilityCommand::ScreenCapture { display: Some(0) },
    })
    .expect("bound screen use-case operation")
}
