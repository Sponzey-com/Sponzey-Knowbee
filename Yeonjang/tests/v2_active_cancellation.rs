use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Barrier};

use knowbee_yeonjang::authorization::InMemoryAuthorizationReplayGuard;
use knowbee_yeonjang::cancellation::{
    ActiveCommandRegistration, ActiveCommandRegistry, CancellationReasonKind,
    CancellationRequestResult, CommandTargetBinding, ExactCancellationRequest,
};
use knowbee_yeonjang::execute_capability::{
    ExecuteCapabilityUseCase, ExecutionCancellation, ExecutionClock,
};
use knowbee_yeonjang::mqtt_v2_direct_handler::{MqttV2CommandHandler, MqttV2HandlerResult};
use knowbee_yeonjang::mqtt_v2_topics::MqttV2TopicSet;
use knowbee_yeonjang::permission_policy::{
    PermissionPolicySnapshot, PolicyCapability, PolicyDecision, PolicyResourceConstraint,
    PolicyTransition, PolicyUpdateCommand, apply_policy_update,
};
use knowbee_yeonjang::platform_execution::ExecutionFailure;
use knowbee_yeonjang::platform_operation::{
    BoundPlatformOperation, PlatformPreflightReceipt, PreflightObservation,
    PreflightPermissionState, TargetPlatform,
};
use knowbee_yeonjang::platform_port::{PlatformCapabilityPort, PlatformEffectReceipt};
use knowbee_yeonjang::policy_repository::{PermissionPolicyReader, PolicySnapshotRead};
use knowbee_yeonjang::protocol_v2::V2CommandSignatureVerifier;
use knowbee_yeonjang::protocol_v2_operation::V2OperationBindingContext;
use knowbee_yeonjang::v2_terminal_repository::InMemoryV2TerminalRepository;

#[test]
fn registry_owns_unique_cancellation_id_and_exact_signal_lifecycle() {
    let registry = ActiveCommandRegistry::default();
    let camera_target = target("command-camera", "operation-camera");
    let handle = match registry.register_bound_with_cancellation_id(
        camera_target.clone(),
        "cancel-camera",
        "token-camera",
    ) {
        ActiveCommandRegistration::Registered(handle) => handle,
        _ => panic!("registered"),
    };
    assert!(!registry.is_cancelled_id("cancel-camera"));
    assert!(!registry.is_cancelled_id("cancel-other"));

    assert!(matches!(
        registry.register_bound_with_cancellation_id(
            target("command-other", "operation-other"),
            "cancel-camera",
            "token-other",
        ),
        ActiveCommandRegistration::AlreadyActive
    ));

    let cancellation = ExactCancellationRequest::new(
        1,
        camera_target,
        "token-camera",
        CancellationReasonKind::UserRequested,
        1_000,
    )
    .expect("cancellation");
    assert!(matches!(
        registry.request_exact_cancellation(&cancellation),
        knowbee_yeonjang::cancellation::CancellationRequestResult::Accepted
    ));
    assert!(registry.is_cancelled_id("cancel-camera"));
    assert!(handle.cancellation_signal().is_cancelled());

    registry.remove(Some("command-camera"));
    assert!(!registry.is_cancelled_id("cancel-camera"));
}

#[test]
fn preflight_cancel_returns_cancelled_terminal_without_effect_and_cleans_active_entry() {
    let registry = Arc::new(ActiveCommandRegistry::default());
    let entered = Arc::new(Barrier::new(2));
    let release = Arc::new(Barrier::new(2));
    let effects = Arc::new(AtomicUsize::new(0));
    let port = Arc::new(BlockingPreflightPort {
        entered: Arc::clone(&entered),
        release: Arc::clone(&release),
        effects: Arc::clone(&effects),
    });
    let cancellation: Arc<dyn ExecutionCancellation> = registry.clone();
    let handler = Arc::new(MqttV2CommandHandler::new(
        topics(),
        Arc::new(AcceptSignatures),
        Arc::new(InMemoryAuthorizationReplayGuard::new(4).expect("replay")),
        Arc::new(InMemoryV2TerminalRepository::new(4).expect("terminals")),
        Arc::clone(&registry),
        Arc::new(AllowedPolicy),
        ExecuteCapabilityUseCase::new(port, Arc::new(FixedClock), cancellation, 100),
    ));
    let running_handler = Arc::clone(&handler);
    let running = std::thread::spawn(move || {
        running_handler.handle(
            &topics().command(),
            &command_bytes(),
            1_000,
            V2OperationBindingContext {
                target_platform: TargetPlatform::Macos,
                policy_revision: 1,
                artifact_lease_ref: Some("artifact-v2".to_string()),
            },
        )
    });
    entered.wait();
    let conflict = handler.handle(
        &topics().command(),
        &conflicting_active_command_bytes(),
        1_000,
        V2OperationBindingContext {
            target_platform: TargetPlatform::Macos,
            policy_revision: 1,
            artifact_lease_ref: Some("artifact-conflict".to_string()),
        },
    );
    let MqttV2HandlerResult::Terminal(conflict) = conflict else {
        panic!("active command conflict terminal");
    };
    let conflict = serde_json::to_value(conflict).expect("conflict JSON");
    assert_eq!(conflict["terminal"]["execution_outcome"], "blocked");
    assert_eq!(
        conflict["terminal"]["failure"]["reason_code"],
        "resource_busy"
    );
    assert_eq!(effects.load(Ordering::SeqCst), 0);

    let cancellation = exact_cancellation();
    assert_eq!(
        registry.request_exact_cancellation(&cancellation),
        CancellationRequestResult::Accepted
    );
    release.wait();

    let MqttV2HandlerResult::Terminal(content) = running.join().expect("handler thread") else {
        panic!("cancelled terminal");
    };
    let value = serde_json::to_value(content).expect("terminal JSON");
    assert_eq!(value["terminal"]["execution_outcome"], "cancelled");
    assert_eq!(value["terminal"]["failure"]["reason_code"], "cancelled");
    assert_eq!(effects.load(Ordering::SeqCst), 0);
    assert!(!registry.is_cancelled_id("cancel-camera"));
    assert_eq!(
        registry.request_exact_cancellation(&cancellation),
        CancellationRequestResult::AlreadyTerminal
    );
}

fn target(command_id: &str, operation_id: &str) -> CommandTargetBinding {
    CommandTargetBinding::new(
        "request-camera",
        command_id,
        operation_id,
        "session-main",
        &format!("sha256:{}", "34".repeat(32)),
        "idem-camera",
    )
    .expect("target")
}

fn exact_cancellation() -> ExactCancellationRequest {
    ExactCancellationRequest::new(
        1,
        target("command-camera", "operation-camera"),
        "token-camera",
        CancellationReasonKind::UserRequested,
        1_001,
    )
    .expect("exact cancellation")
}

fn topics() -> MqttV2TopicSet {
    MqttV2TopicSet::new("instance-a", "session-main", "requester-a").expect("topics")
}

struct AllowedPolicy;
impl PermissionPolicyReader for AllowedPolicy {
    fn snapshot(&self) -> PolicySnapshotRead {
        let initial = PermissionPolicySnapshot::new("instance-a").expect("policy");
        let update = PolicyUpdateCommand::new(
            "instance-a",
            0,
            PolicyCapability::CameraCapture,
            PolicyDecision::Allowed,
            PolicyResourceConstraint::Any,
        )
        .expect("update");
        match apply_policy_update(&initial, &update) {
            PolicyTransition::Applied { snapshot, .. } => PolicySnapshotRead::Snapshot(snapshot),
            other => panic!("allowed policy: {other:?}"),
        }
    }
}

fn command_bytes() -> Vec<u8> {
    serde_json::to_vec(&serde_json::json!({
        "protocol_version": 2, "schema_id": "yeonjang.command.v2",
        "message_kind": "command", "message_id": "message-camera",
        "request_id": "request-camera", "command_id": "command-camera",
        "operation_id": "operation-camera", "correlation_id": "correlation-camera",
        "causation_id": "causation-camera", "requester_id": "requester-a",
        "target_instance_id": "instance-a", "target_session_id": "session-main",
        "target_fingerprint": format!("sha256:{}", "34".repeat(32)),
        "idempotency_key": "idem-camera", "cancellation_id": "cancel-camera",
        "cancel_token": "token-camera", "issued_at": 900, "expires_at": 2_000,
        "sequence": 1,
        "payload": {"method": "camera.capture", "params": {}},
        "authorization": {
            "schema_version": 1, "authorization_id": "auth-camera",
            "issuer": "issuer-main", "key_id": "key-main", "audience": "instance-a",
            "scope": "effect.execute", "method": "camera.capture", "resource": "camera",
            "requester_id": "requester-a", "command_id": "command-camera",
            "operation_id": "operation-camera", "target_instance_id": "instance-a",
            "target_session_id": "session-main",
            "target_fingerprint": format!("sha256:{}", "34".repeat(32)),
            "idempotency_key": "idem-camera", "cancellation_id": "cancel-camera",
            "cancel_token": "token-camera", "expires_at": 2_000,
            "nonce": "nonce-camera", "signature": "aa".repeat(32)
        }
    }))
    .expect("command JSON")
}

fn conflicting_active_command_bytes() -> Vec<u8> {
    let mut value: serde_json::Value =
        serde_json::from_slice(&command_bytes()).expect("base command");
    value["message_id"] = "message-conflict".into();
    value["request_id"] = "request-conflict".into();
    value["correlation_id"] = "correlation-conflict".into();
    value["causation_id"] = "causation-conflict".into();
    value["idempotency_key"] = "idem-conflict".into();
    value["cancellation_id"] = "cancel-conflict".into();
    value["cancel_token"] = "token-conflict".into();
    value["authorization"]["authorization_id"] = "auth-conflict".into();
    value["authorization"]["idempotency_key"] = "idem-conflict".into();
    value["authorization"]["cancellation_id"] = "cancel-conflict".into();
    value["authorization"]["cancel_token"] = "token-conflict".into();
    value["authorization"]["nonce"] = "nonce-conflict".into();
    serde_json::to_vec(&value).expect("conflict command")
}

struct BlockingPreflightPort {
    entered: Arc<Barrier>,
    release: Arc<Barrier>,
    effects: Arc<AtomicUsize>,
}

impl PlatformCapabilityPort for BlockingPreflightPort {
    fn preflight(
        &self,
        operation: &BoundPlatformOperation,
    ) -> Result<PlatformPreflightReceipt, ExecutionFailure> {
        self.entered.wait();
        self.release.wait();
        PlatformPreflightReceipt::for_operation(
            operation,
            PreflightObservation {
                capability_available: true,
                permission: PreflightPermissionState::Granted,
                resource_fingerprint: "camera-main".to_string(),
                observed_at_ms: 1_000,
            },
        )
        .map_err(|error| panic!("fixture: {error}"))
    }

    fn execute(
        &self,
        operation: &BoundPlatformOperation,
        _: &PlatformPreflightReceipt,
    ) -> Result<PlatformEffectReceipt, ExecutionFailure> {
        self.effects.fetch_add(1, Ordering::SeqCst);
        PlatformEffectReceipt::for_operation(operation, "native:camera".to_string(), 1_001)
            .map_err(|error| panic!("fixture: {error}"))
    }
}

struct FixedClock;

impl ExecutionClock for FixedClock {
    fn now_ms(&self) -> i64 {
        1_000
    }
}

struct AcceptSignatures;

impl V2CommandSignatureVerifier for AcceptSignatures {
    fn verify(&self, _: &str, _: &str, _: &[u8], _: &str) -> bool {
        true
    }
}
