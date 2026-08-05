use knowbee_yeonjang::authorization::InMemoryAuthorizationReplayGuard;
use knowbee_yeonjang::mqtt_v2_topics::MqttV2TopicSet;
use knowbee_yeonjang::protocol_v2_receipt_query::{
    V2ReceiptQueryParseError, V2ReceiptQuerySignatureVerifier, parse_v2_receipt_query,
};
use knowbee_yeonjang::protocol_v2_receipt_query_admission::{
    V2ReceiptQueryAdmission, V2ReceiptQueryAdmissionOutcome,
};
use serde_json::{Value, json};

#[test]
fn strict_signed_receipt_query_preserves_exact_target_revision_and_scope() {
    let fixture = receipt_query_fixture();
    let query = parse_v2_receipt_query(
        topics().control(),
        &serde_json::to_vec(&fixture).expect("JSON"),
        1_000,
        &topics(),
    )
    .expect("receipt query");

    assert_eq!(query.target_request_id(), "request-camera");
    assert_eq!(query.target_command_id(), "command-camera");
    assert_eq!(query.target_operation_id(), "operation-camera");
    assert_eq!(query.target_idempotency_key(), "idem-camera");
    assert_eq!(query.target_scope_digest(), digest('c'));
    assert_eq!(query.expected_terminal_revision(), 1);

    let debug = format!("{query:?}");
    assert!(!debug.contains(&"b".repeat(64)));
    assert!(!debug.contains("nonce-receipt"));
}

#[test]
fn receipt_query_rejects_wrong_authorized_revision_scope_and_cancel_shape() {
    let mut wrong_revision = receipt_query_fixture();
    wrong_revision["authorization"]["expected_terminal_revision"] = json!(2);
    assert_eq!(
        parse(&wrong_revision),
        Err(V2ReceiptQueryParseError::AuthorizationMismatch)
    );

    let mut wrong_scope = receipt_query_fixture();
    wrong_scope["payload"]["params"]["target_scope_digest"] = json!(digest('d'));
    assert_eq!(
        parse(&wrong_scope),
        Err(V2ReceiptQueryParseError::AuthorizationMismatch)
    );

    let mut cancel = receipt_query_fixture();
    cancel["payload"]["control"] = json!("command.cancel");
    assert_eq!(
        parse(&cancel),
        Err(V2ReceiptQueryParseError::UnknownOrInvalidField)
    );
}

#[test]
fn receipt_query_admission_verifies_and_classifies_redelivery_as_read_only() {
    let query = parse(&receipt_query_fixture()).expect("query");
    let replay = InMemoryAuthorizationReplayGuard::new(2).expect("replay");
    let admission = V2ReceiptQueryAdmission::new(&AcceptSignatures, &replay);

    assert!(matches!(
        admission.admit_or_replay(&query, 1_000),
        Ok(V2ReceiptQueryAdmissionOutcome::Fresh(_))
    ));
    assert!(matches!(
        admission.admit_or_replay(&query, 1_001),
        Ok(V2ReceiptQueryAdmissionOutcome::VerifiedReplay(_))
    ));

    let other_replay = InMemoryAuthorizationReplayGuard::new(1).expect("replay");
    assert!(
        V2ReceiptQueryAdmission::new(&RejectSignatures, &other_replay)
            .admit_or_replay(&query, 1_000)
            .is_err()
    );
    assert!(
        V2ReceiptQueryAdmission::new(&AcceptSignatures, &other_replay)
            .admit_or_replay(&query, 1_000)
            .is_ok()
    );
}

fn parse(
    value: &Value,
) -> Result<
    knowbee_yeonjang::protocol_v2_receipt_query::V2ReceiptQueryEnvelope,
    V2ReceiptQueryParseError,
> {
    parse_v2_receipt_query(
        topics().control(),
        &serde_json::to_vec(value).expect("JSON"),
        1_000,
        &topics(),
    )
}

fn topics() -> MqttV2TopicSet {
    MqttV2TopicSet::new("yeonjang-main", "session-main", "brad").expect("topics")
}

struct AcceptSignatures;
impl V2ReceiptQuerySignatureVerifier for AcceptSignatures {
    fn verify(&self, _: &str, _: &str, _: &[u8], _: &str) -> bool {
        true
    }
}

struct RejectSignatures;
impl V2ReceiptQuerySignatureVerifier for RejectSignatures {
    fn verify(&self, _: &str, _: &str, _: &[u8], _: &str) -> bool {
        false
    }
}

fn digest(value: char) -> String {
    format!("sha256:{}", value.to_string().repeat(64))
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
