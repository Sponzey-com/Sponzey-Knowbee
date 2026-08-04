use std::sync::Arc;

use knowbee_yeonjang::authorization::InMemoryAuthorizationReplayGuard;
use knowbee_yeonjang::cancellation::{
    ActiveCommandRegistration, ActiveCommandRegistry, CommandTargetBinding,
};
use knowbee_yeonjang::mqtt_v2_topics::MqttV2TopicSet;
use knowbee_yeonjang::protocol_v2_control::{V2ControlSignatureVerifier, parse_v2_control};
use knowbee_yeonjang::protocol_v2_control_admission::V2ControlAdmission;
use knowbee_yeonjang::request_lifecycle::{RequestEvent, TerminalOutcome, TransitionOutcome};
use knowbee_yeonjang::v2_cancel_use_case::{V2CancelOutcome, V2CancelOwnerScope, V2CancelUseCase};
use serde_json::{Value, json};

#[test]
fn admitted_cancel_transitions_the_existing_exact_registry_and_returns_non_terminal_ack() {
    let registry = Arc::new(ActiveCommandRegistry::default());
    let target = target("operation-camera");
    let handle = match registry.register_bound(target, "token-camera") {
        ActiveCommandRegistration::Registered(handle) => handle,
        _ => panic!("active command"),
    };
    let control = parsed_control("operation-camera");
    let replay = InMemoryAuthorizationReplayGuard::new(1).expect("replay");
    let admitted = V2ControlAdmission::new(&AcceptSignatures, &replay)
        .admit(&control, 1_000)
        .expect("admitted");
    let use_case = use_case(Arc::clone(&registry));

    let first = use_case.execute(&admitted);
    assert_eq!(first.outcome(), V2CancelOutcome::Accepted);
    assert!(!first.target_terminal());
    assert!(handle.cancellation_signal().is_cancelled());
    assert_eq!(
        use_case.execute(&admitted).outcome(),
        V2CancelOutcome::Duplicate
    );
}

#[test]
fn wrong_exact_target_and_missing_target_do_not_cancel_an_active_command() {
    let registry = Arc::new(ActiveCommandRegistry::default());
    let handle = match registry.register_bound(target("operation-other"), "token-camera") {
        ActiveCommandRegistration::Registered(handle) => handle,
        _ => panic!("active command"),
    };
    let control = parsed_control("operation-camera");
    let replay = InMemoryAuthorizationReplayGuard::new(1).expect("replay");
    let admitted = V2ControlAdmission::new(&AcceptSignatures, &replay)
        .admit(&control, 1_000)
        .expect("admitted");

    assert_eq!(
        use_case(Arc::clone(&registry)).execute(&admitted).outcome(),
        V2CancelOutcome::BindingMismatch
    );
    assert!(!handle.cancellation_signal().is_cancelled());

    let empty = Arc::new(ActiveCommandRegistry::default());
    assert_eq!(
        use_case(empty).execute(&admitted).outcome(),
        V2CancelOutcome::NotActive
    );
}

#[test]
fn terminal_and_wrong_owner_scope_are_closed_without_reopening_target_execution() {
    let registry = Arc::new(ActiveCommandRegistry::default());
    let target = target("operation-camera");
    let handle = match registry.register_bound(target, "token-camera") {
        ActiveCommandRegistration::Registered(handle) => handle,
        _ => panic!("active command"),
    };
    for event in [
        RequestEvent::Validate,
        RequestEvent::Authorize,
        RequestEvent::Admit,
        RequestEvent::Enqueue,
        RequestEvent::Start,
        RequestEvent::Complete(TerminalOutcome::Succeeded),
    ] {
        assert!(matches!(
            handle.transition(event),
            TransitionOutcome::Applied(_)
        ));
    }
    registry.finalize_and_remove(Some("command-camera"));
    let control = parsed_control("operation-camera");
    let replay = InMemoryAuthorizationReplayGuard::new(1).expect("replay");
    let admitted = V2ControlAdmission::new(&AcceptSignatures, &replay)
        .admit(&control, 1_000)
        .expect("admitted");

    let terminal_ack = use_case(Arc::clone(&registry)).execute(&admitted);
    assert_eq!(terminal_ack.outcome(), V2CancelOutcome::AlreadyTerminal);
    assert!(!terminal_ack.target_terminal());

    let wrong_scope = V2CancelUseCase::new(
        registry,
        V2CancelOwnerScope::new("yeonjang-other", "session-main", fingerprint('a'))
            .expect("other owner"),
    );
    assert_eq!(
        wrong_scope.execute(&admitted).outcome(),
        V2CancelOutcome::TargetMismatch
    );
}

#[test]
fn acknowledgement_projection_contains_no_cancel_secret_and_never_claims_target_terminal() {
    let registry = Arc::new(ActiveCommandRegistry::default());
    let _handle = match registry.register_bound(target("operation-camera"), "token-camera") {
        ActiveCommandRegistration::Registered(handle) => handle,
        _ => panic!("active command"),
    };
    let control = parsed_control("operation-camera");
    let replay = InMemoryAuthorizationReplayGuard::new(1).expect("replay");
    let admitted = V2ControlAdmission::new(&AcceptSignatures, &replay)
        .admit(&control, 1_000)
        .expect("admitted");
    let acknowledgement = use_case(registry).execute(&admitted);

    let encoded = serde_json::to_string(&acknowledgement).expect("ack JSON");
    assert!(!encoded.contains("token-camera"));
    assert!(!encoded.contains(&"b".repeat(64)));
    assert!(encoded.contains("\"target_terminal\":false"));
    assert!(!format!("{acknowledgement:?}").contains("token-camera"));
}

fn use_case(registry: Arc<ActiveCommandRegistry>) -> V2CancelUseCase {
    V2CancelUseCase::new(
        registry,
        V2CancelOwnerScope::new("yeonjang-main", "session-main", fingerprint('a'))
            .expect("owner scope"),
    )
}

fn target(operation_id: &str) -> CommandTargetBinding {
    CommandTargetBinding::new(
        "request-camera",
        "command-camera",
        operation_id,
        "session-main",
        &fingerprint('a'),
        "idem-camera",
    )
    .expect("target")
}

fn parsed_control(operation_id: &str) -> knowbee_yeonjang::protocol_v2_control::V2ControlEnvelope {
    let topics = MqttV2TopicSet::new("yeonjang-main", "session-main", "brad").expect("topics");
    let mut fixture = cancel_fixture();
    fixture["payload"]["params"]["target_operation_id"] = json!(operation_id);
    fixture["authorization"]["target_operation_id"] = json!(operation_id);
    parse_v2_control(
        topics.control(),
        &serde_json::to_vec(&fixture).expect("JSON"),
        1_000,
        &topics,
    )
    .expect("control")
}

fn cancel_fixture() -> Value {
    json!({
        "protocol_version": 2, "schema_id": "yeonjang.control.v2",
        "message_kind": "control", "message_id": "message-cancel",
        "request_id": "request-cancel", "command_id": "command-cancel",
        "operation_id": "operation-cancel", "correlation_id": "correlation-cancel",
        "causation_id": "message-camera", "requester_id": "brad",
        "target_instance_id": "yeonjang-main", "target_session_id": "session-main",
        "target_fingerprint": fingerprint('a'), "idempotency_key": "idem-cancel",
        "issued_at": 900, "expires_at": 2_000, "sequence": 1,
        "payload": {"control": "command.cancel", "params": {
            "target_request_id": "request-camera", "target_command_id": "command-camera",
            "target_operation_id": "operation-camera", "target_idempotency_key": "idem-camera",
            "cancellation_id": "cancel-camera", "cancel_token": "token-camera",
            "reason": "user_requested"
        }},
        "authorization": {
            "schema_version": 1, "authorization_id": "auth-cancel",
            "issuer": "gateway-main", "key_id": "key-main", "audience": "yeonjang-main",
            "scope": "effect.cancel", "requester_id": "brad",
            "command_id": "command-cancel", "operation_id": "operation-cancel",
            "target_instance_id": "yeonjang-main", "target_session_id": "session-main",
            "target_fingerprint": fingerprint('a'), "idempotency_key": "idem-cancel",
            "target_request_id": "request-camera", "target_command_id": "command-camera",
            "target_operation_id": "operation-camera", "target_idempotency_key": "idem-camera",
            "cancellation_id": "cancel-camera", "cancel_token": "token-camera",
            "expires_at": 2_000, "nonce": "nonce-cancel", "signature": "b".repeat(64)
        }
    })
}

fn fingerprint(value: char) -> String {
    format!("sha256:{}", value.to_string().repeat(64))
}

struct AcceptSignatures;

impl V2ControlSignatureVerifier for AcceptSignatures {
    fn verify(&self, _: &str, _: &str, _: &[u8], _: &str) -> bool {
        true
    }
}
