use std::sync::Arc;

use knowbee_yeonjang::authorization::InMemoryAuthorizationReplayGuard;
use knowbee_yeonjang::mqtt_v2_receipt_query_adapter::{
    MqttV2InboundReceiptQuery, MqttV2ReceiptQueryAdapter, MqttV2ReceiptQueryAdapterResult,
};
use knowbee_yeonjang::mqtt_v2_topics::{MqttQos, MqttV2TopicSet};
use knowbee_yeonjang::protocol_v2_receipt_query::V2ReceiptQuerySignatureVerifier;
use knowbee_yeonjang::protocol_v2_terminal::{
    V2ResponseSigner, V2ResponseSignerError, V2ResponseSigningContext, V2TerminalResponseContent,
};
use knowbee_yeonjang::v2_receipt_query_use_case::{
    V2ReceiptQueryOwnerScope, V2ReceiptQueryUseCase,
};
use knowbee_yeonjang::v2_terminal_repository::{
    V2TerminalClaim, V2TerminalComplete, V2TerminalLookup, V2TerminalRepository, V2TerminalScope,
};
use serde_json::{Value, json};

#[test]
fn completed_receipt_query_publishes_signed_bounded_read_response() {
    let adapter = adapter(V2TerminalLookup::Completed(Box::new(terminal_content())));
    let result = adapter.process(inbound(), 1_000, signing_context());
    let MqttV2ReceiptQueryAdapterResult::Publish(response) = result else {
        panic!("receipt response");
    };
    assert_eq!(response.topic, topics().response());
    assert_eq!(response.qos, MqttQos::AtLeastOnce);
    assert!(!response.retained);
    let response: Value = serde_json::from_slice(&response.payload).expect("response JSON");
    assert_eq!(response["schema_id"], "yeonjang.receipt-response.v2");
    assert_eq!(response["payload"]["outcome"], "found");
    assert_eq!(
        response["payload"]["terminal"]["request_id"],
        "request-camera"
    );
    assert_eq!(
        response["payload"]["terminal"]["terminal"]["terminal_revision"],
        1
    );
}

#[test]
fn missing_receipt_is_signed_without_fabricated_terminal() {
    let adapter = adapter(V2TerminalLookup::Miss);
    let result = adapter.process(inbound(), 1_000, signing_context());
    let MqttV2ReceiptQueryAdapterResult::Publish(response) = result else {
        panic!("receipt response");
    };
    let response: Value = serde_json::from_slice(&response.payload).expect("response JSON");
    assert_eq!(response["payload"]["outcome"], "not_found");
    assert!(response["payload"].get("terminal").is_none());
}

fn adapter(result: V2TerminalLookup) -> MqttV2ReceiptQueryAdapter {
    MqttV2ReceiptQueryAdapter::new(
        topics(),
        Arc::new(AcceptSignatures),
        Arc::new(InMemoryAuthorizationReplayGuard::new(8).expect("replay")),
        V2ReceiptQueryUseCase::new(
            Arc::new(FixedRepository(result)),
            V2ReceiptQueryOwnerScope::new("yeonjang-main", "session-main", digest('a'))
                .expect("owner"),
        ),
        Arc::new(FixedSigner),
    )
}

struct FixedRepository(V2TerminalLookup);
impl V2TerminalRepository for FixedRepository {
    fn prepare(&self, _: &V2TerminalScope, _: V2TerminalResponseContent) -> V2TerminalClaim {
        panic!("read adapter must not claim")
    }
    fn lookup(&self, _: &V2TerminalScope) -> V2TerminalLookup {
        self.0.clone()
    }
    fn complete(&self, _: &V2TerminalScope, _: V2TerminalResponseContent) -> V2TerminalComplete {
        panic!("read adapter must not complete")
    }
}

struct AcceptSignatures;
impl V2ReceiptQuerySignatureVerifier for AcceptSignatures {
    fn verify(&self, _: &str, _: &str, _: &[u8], _: &str) -> bool {
        true
    }
}
struct FixedSigner;
impl V2ResponseSigner for FixedSigner {
    fn sign(&self, _: &str, _: &str, _: &[u8]) -> Result<String, V2ResponseSignerError> {
        Ok("aa".repeat(32))
    }
}

fn inbound() -> MqttV2InboundReceiptQuery {
    MqttV2InboundReceiptQuery {
        topic: topics().control(),
        payload: serde_json::to_vec(&receipt_query_fixture()).expect("JSON"),
        retained: false,
    }
}

fn topics() -> MqttV2TopicSet {
    MqttV2TopicSet::new("yeonjang-main", "session-main", "brad").expect("topics")
}

fn signing_context() -> V2ResponseSigningContext {
    V2ResponseSigningContext {
        message_id: "response-receipt".to_string(),
        issued_at: 1_100,
        expires_at: 3_000,
        issuer: "yeonjang-main".to_string(),
        key_id: "response-key".to_string(),
        audience: "brad".to_string(),
        nonce: "response-receipt-nonce".to_string(),
    }
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
            "target": {"platform": "macos", "instance_id": "yeonjang-main",
                "session_id": "session-main", "fingerprint": digest('a')},
            "method": "camera.capture", "resource": "camera",
            "idempotency_key": "idem-camera", "binding_digest": digest('e'),
            "execution_outcome": "succeeded", "delivery_outcome": "not_started",
            "terminal_revision": 1
        }
    }))
    .expect("terminal")
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
