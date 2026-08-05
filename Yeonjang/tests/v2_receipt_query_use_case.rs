use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use knowbee_yeonjang::authorization::InMemoryAuthorizationReplayGuard;
use knowbee_yeonjang::mqtt_v2_topics::MqttV2TopicSet;
use knowbee_yeonjang::protocol_v2_receipt_query::{
    V2ReceiptQuerySignatureVerifier, parse_v2_receipt_query,
};
use knowbee_yeonjang::protocol_v2_receipt_query_admission::{
    V2ReceiptQueryAdmission, V2ReceiptQueryAdmissionOutcome,
};
use knowbee_yeonjang::protocol_v2_terminal::V2TerminalResponseContent;
use knowbee_yeonjang::v2_receipt_query_use_case::{
    V2ReceiptLookupOutcome, V2ReceiptQueryOwnerScope, V2ReceiptQueryUseCase,
};
use knowbee_yeonjang::v2_terminal_repository::{
    V2TerminalClaim, V2TerminalComplete, V2TerminalLookup, V2TerminalRepository, V2TerminalScope,
};
use serde_json::{Value, json};

#[test]
fn exact_query_returns_same_immutable_terminal_without_repository_write_or_effect() {
    let content = terminal_content();
    let repository = Arc::new(RecordingRepository {
        lookups: AtomicUsize::new(0),
        writes: AtomicUsize::new(0),
        result: V2TerminalLookup::Completed(Box::new(content.clone())),
    });
    let use_case = V2ReceiptQueryUseCase::new(
        repository.clone(),
        V2ReceiptQueryOwnerScope::new("yeonjang-main", "session-main", digest('a')).expect("owner"),
    );
    let query = admitted_query(receipt_query_fixture());

    let result = match query {
        V2ReceiptQueryAdmissionOutcome::Fresh(query) => use_case.execute(&query),
        V2ReceiptQueryAdmissionOutcome::VerifiedReplay(_) => panic!("fresh fixture"),
    };
    assert_eq!(result.outcome(), V2ReceiptLookupOutcome::Found);
    assert_eq!(result.terminal(), Some(&content));
    assert_eq!(repository.lookups.load(Ordering::SeqCst), 1);
    assert_eq!(repository.writes.load(Ordering::SeqCst), 0);
}

#[test]
fn wrong_revision_binding_and_owner_are_closed_without_terminal_disclosure() {
    let repository = Arc::new(RecordingRepository {
        lookups: AtomicUsize::new(0),
        writes: AtomicUsize::new(0),
        result: V2TerminalLookup::Completed(Box::new(terminal_content())),
    });
    let use_case = V2ReceiptQueryUseCase::new(
        repository.clone(),
        V2ReceiptQueryOwnerScope::new("yeonjang-main", "session-main", digest('a')).expect("owner"),
    );

    let mut wrong_revision = receipt_query_fixture();
    set_revision(&mut wrong_revision, 2);
    let outcome = execute(&use_case, wrong_revision);
    assert_eq!(outcome.outcome(), V2ReceiptLookupOutcome::RevisionMismatch);
    assert!(outcome.terminal().is_none());

    let mut wrong_target = receipt_query_fixture();
    wrong_target["target_fingerprint"] = json!(digest('d'));
    wrong_target["authorization"]["target_fingerprint"] = json!(digest('d'));
    let outcome = execute(&use_case, wrong_target);
    assert_eq!(outcome.outcome(), V2ReceiptLookupOutcome::BindingMismatch);
    assert!(outcome.terminal().is_none());
    assert_eq!(repository.lookups.load(Ordering::SeqCst), 1);
    assert_eq!(repository.writes.load(Ordering::SeqCst), 0);
}

#[test]
fn repository_nonterminal_and_failure_states_map_to_closed_read_outcomes() {
    for (lookup, expected) in [
        (V2TerminalLookup::Miss, V2ReceiptLookupOutcome::NotFound),
        (
            V2TerminalLookup::InProgress,
            V2ReceiptLookupOutcome::InProgress,
        ),
        (
            V2TerminalLookup::ScopeConflict,
            V2ReceiptLookupOutcome::BindingMismatch,
        ),
        (
            V2TerminalLookup::Unavailable,
            V2ReceiptLookupOutcome::StateUnavailable,
        ),
    ] {
        let repository = Arc::new(RecordingRepository {
            lookups: AtomicUsize::new(0),
            writes: AtomicUsize::new(0),
            result: lookup,
        });
        let use_case = V2ReceiptQueryUseCase::new(
            repository.clone(),
            V2ReceiptQueryOwnerScope::new("yeonjang-main", "session-main", digest('a'))
                .expect("owner"),
        );
        let result = execute(&use_case, receipt_query_fixture());
        assert_eq!(result.outcome(), expected);
        assert!(result.terminal().is_none());
        assert_eq!(repository.lookups.load(Ordering::SeqCst), 1);
        assert_eq!(repository.writes.load(Ordering::SeqCst), 0);
    }
}

fn execute(
    use_case: &V2ReceiptQueryUseCase,
    fixture: Value,
) -> knowbee_yeonjang::v2_receipt_query_use_case::V2ReceiptQueryResult {
    match admitted_query(fixture) {
        V2ReceiptQueryAdmissionOutcome::Fresh(query) => use_case.execute(&query),
        V2ReceiptQueryAdmissionOutcome::VerifiedReplay(query) => use_case.replay(&query),
    }
}

fn admitted_query(fixture: Value) -> V2ReceiptQueryAdmissionOutcome<'static> {
    let query = parse_v2_receipt_query(
        topics().control(),
        &serde_json::to_vec(&fixture).expect("JSON"),
        1_000,
        &topics(),
    )
    .expect("query");
    let query = Box::leak(Box::new(query));
    let replay = Box::leak(Box::new(
        InMemoryAuthorizationReplayGuard::new(8).expect("replay"),
    ));
    V2ReceiptQueryAdmission::new(&AcceptSignatures, replay)
        .admit_or_replay(query, 1_000)
        .expect("admitted")
}

fn set_revision(fixture: &mut Value, revision: u64) {
    fixture["payload"]["params"]["expected_terminal_revision"] = json!(revision);
    fixture["authorization"]["expected_terminal_revision"] = json!(revision);
}

struct RecordingRepository {
    lookups: AtomicUsize,
    writes: AtomicUsize,
    result: V2TerminalLookup,
}

impl V2TerminalRepository for RecordingRepository {
    fn prepare(&self, _: &V2TerminalScope, _: V2TerminalResponseContent) -> V2TerminalClaim {
        self.writes.fetch_add(1, Ordering::SeqCst);
        V2TerminalClaim::Unavailable
    }
    fn lookup(&self, _: &V2TerminalScope) -> V2TerminalLookup {
        self.lookups.fetch_add(1, Ordering::SeqCst);
        self.result.clone()
    }
    fn complete(&self, _: &V2TerminalScope, _: V2TerminalResponseContent) -> V2TerminalComplete {
        self.writes.fetch_add(1, Ordering::SeqCst);
        V2TerminalComplete::Unavailable
    }
}

struct AcceptSignatures;
impl V2ReceiptQuerySignatureVerifier for AcceptSignatures {
    fn verify(&self, _: &str, _: &str, _: &[u8], _: &str) -> bool {
        true
    }
}

fn topics() -> MqttV2TopicSet {
    MqttV2TopicSet::new("yeonjang-main", "session-main", "brad").expect("topics")
}

fn digest(value: char) -> String {
    format!("sha256:{}", value.to_string().repeat(64))
}

fn terminal_content() -> V2TerminalResponseContent {
    serde_json::from_value(json!({
        "schema_version": 1,
        "request_id": "request-camera", "command_id": "command-camera",
        "operation_id": "operation-camera", "requester_id": "brad",
        "correlation_id": "correlation-camera", "causation_id": "message-camera",
        "target_instance_id": "yeonjang-main", "target_session_id": "session-main",
        "target_fingerprint": digest('a'), "idempotency_key": "idem-camera",
        "terminal": {
            "schema_version": 1,
            "request_id": "request-camera", "command_id": "command-camera",
            "operation_id": "operation-camera", "requester_id": "brad",
            "target": {
                "platform": "macos", "instance_id": "yeonjang-main",
                "session_id": "session-main", "fingerprint": digest('a')
            },
            "method": "camera.capture", "resource": "camera",
            "idempotency_key": "idem-camera", "binding_digest": digest('e'),
            "execution_outcome": "succeeded", "delivery_outcome": "not_started",
            "terminal_revision": 1
        }
    }))
    .expect("terminal content")
}

fn receipt_query_fixture() -> Value {
    json!({
        "protocol_version": 2, "schema_id": "yeonjang.control.v2",
        "message_kind": "control", "message_id": "message-receipt",
        "request_id": "request-receipt", "command_id": "command-receipt",
        "operation_id": "operation-receipt", "correlation_id": "correlation-receipt",
        "causation_id": "message-camera", "requester_id": "brad",
        "target_instance_id": "yeonjang-main", "target_session_id": "session-main",
        "target_fingerprint": digest('a'), "idempotency_key": "idem-receipt",
        "issued_at": 900, "expires_at": 2_000, "sequence": 1,
        "payload": {"control": "receipt.get", "params": {
            "target_request_id": "request-camera", "target_command_id": "command-camera",
            "target_operation_id": "operation-camera",
            "target_idempotency_key": "idem-camera",
            "target_scope_digest": digest('c'), "expected_terminal_revision": 1
        }},
        "authorization": {
            "schema_version": 1, "authorization_id": "auth-receipt",
            "issuer": "gateway-main", "key_id": "key-main", "audience": "yeonjang-main",
            "scope": "receipt.read", "requester_id": "brad",
            "command_id": "command-receipt", "operation_id": "operation-receipt",
            "target_instance_id": "yeonjang-main", "target_session_id": "session-main",
            "target_fingerprint": digest('a'), "idempotency_key": "idem-receipt",
            "target_request_id": "request-camera", "target_command_id": "command-camera",
            "target_operation_id": "operation-camera",
            "target_idempotency_key": "idem-camera",
            "target_scope_digest": digest('c'), "expected_terminal_revision": 1,
            "expires_at": 2_000, "nonce": "nonce-receipt", "signature": "bb".repeat(32)
        }
    })
}
