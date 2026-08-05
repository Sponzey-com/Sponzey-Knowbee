use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, mpsc};
use std::time::Duration;

use knowbee_yeonjang::blocking_resource_admission::BlockingExecutionResourceAdmission;
use knowbee_yeonjang::execute_capability::{
    ExecuteCapabilityResult, ExecuteCapabilityUseCase, ExecutionCancellation, ExecutionClock,
    ExecutionResourceAdmission, ExecutionResourceAdmissionError,
};
use knowbee_yeonjang::platform_execution::{EffectState, ExecutionFailureReason};
use knowbee_yeonjang::platform_operation::{
    BoundPlatformOperation, BoundPlatformOperationInput, CapabilityCommand,
    PlatformPreflightReceipt, PreflightObservation, PreflightPermissionState, TargetPlatform,
};
use knowbee_yeonjang::platform_port::{PlatformCapabilityPort, PlatformEffectReceipt};
use knowbee_yeonjang::resource_admission::ExecutionResourceKey;

#[test]
fn operation_resource_key_binds_target_and_typed_device_or_display_selector() {
    let default_camera = operation(
        "key-default-camera",
        CapabilityCommand::CameraCapture {
            device_id: None,
            capture_timeout_ms: Some(1_000),
        },
        2_000,
    );
    let same_camera = operation("key-same-camera", default_camera.command().clone(), 2_000);
    let explicit_default = operation(
        "key-explicit-default",
        CapabilityCommand::CameraCapture {
            device_id: Some("default".to_string()),
            capture_timeout_ms: Some(1_000),
        },
        2_000,
    );
    let screen = operation(
        "key-screen",
        CapabilityCommand::ScreenCapture { display: None },
        2_000,
    );
    let other_target = operation_for_target(
        "key-other-target",
        default_camera.command().clone(),
        2_000,
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    );

    assert_eq!(
        ExecutionResourceKey::for_operation(&default_camera),
        ExecutionResourceKey::for_operation(&same_camera)
    );
    assert_ne!(
        ExecutionResourceKey::for_operation(&default_camera),
        ExecutionResourceKey::for_operation(&explicit_default)
    );
    assert_ne!(
        ExecutionResourceKey::for_operation(&default_camera),
        ExecutionResourceKey::for_operation(&screen)
    );
    assert_ne!(
        ExecutionResourceKey::for_operation(&default_camera),
        ExecutionResourceKey::for_operation(&other_target)
    );
}

#[test]
fn same_camera_waits_for_the_scoped_permit_while_screen_remains_independent() {
    let admission = Arc::new(BlockingExecutionResourceAdmission::new(4).expect("admission"));
    let clock = FixedClock(1_000);
    let active = NeverCancelled;
    let camera = operation(
        "camera-a",
        CapabilityCommand::CameraCapture {
            device_id: Some("camera-1".to_string()),
            capture_timeout_ms: Some(1_000),
        },
        2_000,
    );
    let same_camera = operation("camera-b", camera.command().clone(), 2_000);
    let screen = operation(
        "screen",
        CapabilityCommand::ScreenCapture { display: None },
        2_000,
    );
    let first = admission
        .acquire(&camera, &active, &clock)
        .expect("first camera");
    assert!(admission.acquire(&screen, &active, &clock).is_ok());

    let waiting_admission = Arc::clone(&admission);
    let (acquired_tx, acquired_rx) = mpsc::channel();
    let waiting = std::thread::spawn(move || {
        let permit = waiting_admission.acquire(&same_camera, &NeverCancelled, &FixedClock(1_000));
        acquired_tx.send(permit.is_ok()).expect("acquired result");
        permit
    });
    assert!(acquired_rx.recv_timeout(Duration::from_millis(50)).is_err());
    drop(first);
    assert!(
        acquired_rx
            .recv_timeout(Duration::from_secs(1))
            .expect("released")
    );
    drop(
        waiting
            .join()
            .expect("waiting worker")
            .expect("waiting permit"),
    );
}

#[test]
fn waiting_camera_cancellation_returns_before_backend_admission() {
    let admission = Arc::new(BlockingExecutionResourceAdmission::new(2).expect("admission"));
    let operation = operation(
        "cancel",
        CapabilityCommand::CameraCapture {
            device_id: None,
            capture_timeout_ms: Some(1_000),
        },
        2_000,
    );
    let first = admission
        .acquire(&operation, &NeverCancelled, &FixedClock(1_000))
        .expect("first permit");
    let cancelled = Arc::new(AtomicCancellation(AtomicBool::new(false)));
    let waiting_cancelled = Arc::clone(&cancelled);
    let waiting_admission = Arc::clone(&admission);
    let waiting = std::thread::spawn(move || {
        waiting_admission.acquire(&operation, waiting_cancelled.as_ref(), &FixedClock(1_000))
    });
    std::thread::sleep(Duration::from_millis(40));
    cancelled.0.store(true, Ordering::SeqCst);

    assert!(matches!(
        waiting.join().expect("waiting worker"),
        Err(ExecutionResourceAdmissionError::Cancelled)
    ));
    drop(first);
}

#[test]
fn waiting_camera_deadline_and_distinct_slot_saturation_fail_pre_effect() {
    let admission = BlockingExecutionResourceAdmission::new(1).expect("admission");
    let camera = operation(
        "deadline",
        CapabilityCommand::CameraCapture {
            device_id: None,
            capture_timeout_ms: Some(1_000),
        },
        1_040,
    );
    let first = admission
        .acquire(&camera, &NeverCancelled, &FixedClock(1_000))
        .expect("first permit");
    assert!(matches!(
        admission.acquire(
            &operation(
                "saturated",
                CapabilityCommand::ScreenCapture { display: None },
                2_000,
            ),
            &NeverCancelled,
            &FixedClock(1_000),
        ),
        Err(ExecutionResourceAdmissionError::Saturated)
    ));
    assert!(matches!(
        admission.acquire(&camera, &NeverCancelled, &FixedClock(1_000)),
        Err(ExecutionResourceAdmissionError::DeadlineExceeded)
    ));
    drop(first);
}

#[test]
fn common_execute_cancels_a_same_camera_waiter_before_second_effect() {
    let effects = Arc::new(AtomicUsize::new(0));
    let port = Arc::new(CountingPort(Arc::clone(&effects)));
    let cancelled = Arc::new(AtomicCancellation(AtomicBool::new(false)));
    let cancellation: Arc<dyn ExecutionCancellation> = cancelled.clone();
    let admission = Arc::new(BlockingExecutionResourceAdmission::new(2).expect("admission"));
    let use_case = Arc::new(
        ExecuteCapabilityUseCase::new(port, Arc::new(FixedClock(1_000)), cancellation, 100)
            .with_resource_admission(admission),
    );
    let first_operation = operation(
        "execute-first",
        CapabilityCommand::CameraCapture {
            device_id: None,
            capture_timeout_ms: Some(1_000),
        },
        2_000,
    );
    let second_operation = operation(
        "execute-second",
        CapabilityCommand::CameraCapture {
            device_id: None,
            capture_timeout_ms: Some(1_000),
        },
        2_000,
    );
    let first_use_case = Arc::clone(&use_case);
    let first = std::thread::spawn(move || first_use_case.execute(&first_operation));
    while effects.load(Ordering::SeqCst) == 0 {
        std::thread::yield_now();
    }
    let second_use_case = Arc::clone(&use_case);
    let second = std::thread::spawn(move || second_use_case.execute(&second_operation));
    std::thread::sleep(Duration::from_millis(40));
    cancelled.0.store(true, Ordering::SeqCst);

    let ExecuteCapabilityResult::Failed(failure) = second.join().expect("second execute worker")
    else {
        panic!("waiting operation must be cancelled");
    };
    assert_eq!(failure.reason_code(), ExecutionFailureReason::Cancelled);
    assert_eq!(failure.effect_state(), EffectState::NotStarted);
    assert!(matches!(
        first.join().expect("first execute worker"),
        ExecuteCapabilityResult::Succeeded(_)
    ));
    assert_eq!(effects.load(Ordering::SeqCst), 1);
}

struct FixedClock(i64);

impl ExecutionClock for FixedClock {
    fn now_ms(&self) -> i64 {
        self.0
    }
}

struct NeverCancelled;

impl ExecutionCancellation for NeverCancelled {
    fn is_cancelled(&self, _: &str) -> bool {
        false
    }
}

struct AtomicCancellation(AtomicBool);

impl ExecutionCancellation for AtomicCancellation {
    fn is_cancelled(&self, _: &str) -> bool {
        self.0.load(Ordering::SeqCst)
    }
}

struct CountingPort(Arc<AtomicUsize>);

impl PlatformCapabilityPort for CountingPort {
    fn preflight(
        &self,
        operation: &BoundPlatformOperation,
    ) -> Result<PlatformPreflightReceipt, knowbee_yeonjang::platform_execution::ExecutionFailure>
    {
        PlatformPreflightReceipt::for_operation(
            operation,
            PreflightObservation {
                capability_available: true,
                permission: PreflightPermissionState::Granted,
                resource_fingerprint: "camera-admission".to_string(),
                observed_at_ms: 1_000,
            },
        )
        .map_err(|error| panic!("preflight fixture: {error}"))
    }

    fn execute(
        &self,
        operation: &BoundPlatformOperation,
        _: &PlatformPreflightReceipt,
    ) -> Result<PlatformEffectReceipt, knowbee_yeonjang::platform_execution::ExecutionFailure> {
        self.0.fetch_add(1, Ordering::SeqCst);
        std::thread::sleep(Duration::from_millis(120));
        PlatformEffectReceipt::for_operation(operation, "native:admission".to_string(), 1_100)
            .map_err(|error| panic!("effect fixture: {error}"))
    }
}

fn operation(suffix: &str, command: CapabilityCommand, deadline_ms: i64) -> BoundPlatformOperation {
    operation_for_target(
        suffix,
        command,
        deadline_ms,
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    )
}

fn operation_for_target(
    suffix: &str,
    command: CapabilityCommand,
    deadline_ms: i64,
    target_fingerprint: &str,
) -> BoundPlatformOperation {
    BoundPlatformOperation::new(BoundPlatformOperationInput {
        request_id: format!("request-{suffix}"),
        command_id: format!("command-{suffix}"),
        operation_id: format!("operation-{suffix}"),
        requester_id: "requester-admission".to_string(),
        target_platform: TargetPlatform::Linux,
        target_instance_id: "instance-admission".to_string(),
        target_session_id: "session-admission".to_string(),
        target_fingerprint: target_fingerprint.to_string(),
        authorization_ref: format!("authorization-{suffix}"),
        policy_revision: 1,
        idempotency_key: format!("idempotency-{suffix}"),
        deadline_ms,
        cancellation_id: format!("cancel-{suffix}"),
        artifact_lease_ref: Some(format!("artifact-{suffix}")),
        command,
    })
    .expect("bound operation")
}
