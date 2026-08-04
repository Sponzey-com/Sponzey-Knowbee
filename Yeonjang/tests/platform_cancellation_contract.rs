use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use knowbee_yeonjang::execute_capability::{
    ExecuteCapabilityResult, ExecuteCapabilityUseCase, ExecutionCancellation, ExecutionClock,
};
use knowbee_yeonjang::platform_execution::{
    EffectState, ExecutionFailure, ExecutionFailureReason, ExecutionStage,
};
use knowbee_yeonjang::platform_operation::{
    BoundPlatformOperation, BoundPlatformOperationInput, CapabilityCommand,
    PlatformPreflightReceipt, PreflightObservation, PreflightPermissionState,
};
use knowbee_yeonjang::platform_port::{PlatformCapabilityPort, PlatformEffectReceipt};

#[test]
fn cancellation_before_preflight_starts_no_platform_work() {
    let operation = camera_operation(2_000);
    let port = Arc::new(CountingPort::default());
    let cancellation = Arc::new(SequencedCancellation::cancel_on(1));
    let result = ExecuteCapabilityUseCase::new(
        port.clone(),
        Arc::new(FixedClock(1_000)),
        cancellation.clone(),
        100,
    )
    .execute(&operation);

    assert_failure(
        result,
        ExecutionFailureReason::Cancelled,
        EffectState::NotStarted,
    );
    assert_eq!(port.preflight_calls.load(Ordering::SeqCst), 0);
    assert_eq!(port.execute_calls.load(Ordering::SeqCst), 0);
    assert_eq!(cancellation.last_id(), Some("cancel-camera".to_string()));
}

#[test]
fn cancellation_after_preflight_still_prevents_the_effect() {
    let operation = camera_operation(2_000);
    let port = Arc::new(CountingPort::default());
    let cancellation = Arc::new(SequencedCancellation::cancel_on(2));
    let result =
        ExecuteCapabilityUseCase::new(port.clone(), Arc::new(FixedClock(1_000)), cancellation, 100)
            .execute(&operation);

    assert_failure(
        result,
        ExecutionFailureReason::Cancelled,
        EffectState::NotStarted,
    );
    assert_eq!(port.preflight_calls.load(Ordering::SeqCst), 1);
    assert_eq!(port.execute_calls.load(Ordering::SeqCst), 0);
}

#[test]
fn an_expired_deadline_is_rejected_before_preflight() {
    let operation = camera_operation(1_000);
    let port = Arc::new(CountingPort::default());
    let result = ExecuteCapabilityUseCase::new(
        port.clone(),
        Arc::new(FixedClock(1_000)),
        Arc::new(SequencedCancellation::never()),
        100,
    )
    .execute(&operation);

    assert_failure(
        result,
        ExecutionFailureReason::DeadlineExceeded,
        EffectState::NotStarted,
    );
    assert_eq!(port.preflight_calls.load(Ordering::SeqCst), 0);
    assert_eq!(port.execute_calls.load(Ordering::SeqCst), 0);
}

fn assert_failure(
    result: ExecuteCapabilityResult,
    reason: ExecutionFailureReason,
    effect_state: EffectState,
) {
    let ExecuteCapabilityResult::Failed(failure) = result else {
        panic!("expected failure");
    };
    assert_eq!(failure.stage(), ExecutionStage::ResourceAdmission);
    assert_eq!(failure.reason_code(), reason);
    assert_eq!(failure.effect_state(), effect_state);
}

struct FixedClock(i64);

impl ExecutionClock for FixedClock {
    fn now_ms(&self) -> i64 {
        self.0
    }
}

struct SequencedCancellation {
    cancel_on_call: usize,
    calls: AtomicUsize,
    last_id: std::sync::Mutex<Option<String>>,
}

impl SequencedCancellation {
    fn cancel_on(call: usize) -> Self {
        Self {
            cancel_on_call: call,
            calls: AtomicUsize::new(0),
            last_id: std::sync::Mutex::new(None),
        }
    }

    fn never() -> Self {
        Self::cancel_on(usize::MAX)
    }

    fn last_id(&self) -> Option<String> {
        self.last_id.lock().expect("last id").clone()
    }
}

impl ExecutionCancellation for SequencedCancellation {
    fn is_cancelled(&self, cancellation_id: &str) -> bool {
        *self.last_id.lock().expect("last id") = Some(cancellation_id.to_string());
        self.calls.fetch_add(1, Ordering::SeqCst) + 1 >= self.cancel_on_call
    }
}

#[derive(Default)]
struct CountingPort {
    preflight_calls: AtomicUsize,
    execute_calls: AtomicUsize,
}

impl PlatformCapabilityPort for CountingPort {
    fn preflight(
        &self,
        operation: &BoundPlatformOperation,
    ) -> Result<PlatformPreflightReceipt, ExecutionFailure> {
        self.preflight_calls.fetch_add(1, Ordering::SeqCst);
        Ok(PlatformPreflightReceipt::for_operation(
            operation,
            PreflightObservation {
                capability_available: true,
                permission: PreflightPermissionState::Granted,
                resource_fingerprint: "camera-resource".to_string(),
                observed_at_ms: 1_000,
            },
        )
        .expect("preflight"))
    }

    fn execute(
        &self,
        operation: &BoundPlatformOperation,
        _preflight: &PlatformPreflightReceipt,
    ) -> Result<PlatformEffectReceipt, ExecutionFailure> {
        self.execute_calls.fetch_add(1, Ordering::SeqCst);
        Ok(
            PlatformEffectReceipt::for_operation(operation, "native-receipt".to_string(), 1_000)
                .expect("effect"),
        )
    }
}

fn camera_operation(deadline_ms: i64) -> BoundPlatformOperation {
    BoundPlatformOperation::new(BoundPlatformOperationInput {
        request_id: "request-camera".to_string(),
        command_id: "command-camera".to_string(),
        operation_id: "operation-camera".to_string(),
        requester_id: "requester-camera".to_string(),
        target_platform: knowbee_yeonjang::platform_operation::TargetPlatform::Macos,
        target_instance_id: "instance-camera".to_string(),
        target_session_id: "session-camera".to_string(),
        target_fingerprint:
            "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee".to_string(),
        authorization_ref: "authorization-camera".to_string(),
        policy_revision: 1,
        idempotency_key: "idempotency-camera".to_string(),
        deadline_ms,
        cancellation_id: "cancel-camera".to_string(),
        artifact_lease_ref: Some("artifact-camera".to_string()),
        command: CapabilityCommand::CameraCapture {
            device_id: None,
            capture_timeout_ms: Some(1_000),
        },
    })
    .expect("bound camera operation")
}
