use std::sync::{Arc, Mutex};

use knowbee_yeonjang::authorization::InMemoryAuthorizationReplayGuard;
use knowbee_yeonjang::cancellation::{
    ActiveCommandRegistration, ActiveCommandRegistry, CommandTargetBinding,
};
use knowbee_yeonjang::mqtt_v2_topics::MqttV2TopicSet;
use knowbee_yeonjang::protocol_v2_cancel_response::{
    V2CancelResponseEnvelope, V2CancelResponseError,
};
use knowbee_yeonjang::protocol_v2_control::{V2ControlSignatureVerifier, parse_v2_control};
use knowbee_yeonjang::protocol_v2_control_admission::V2ControlAdmission;
use knowbee_yeonjang::protocol_v2_terminal::{
    V2ResponseSigner, V2ResponseSignerError, V2ResponseSigningContext,
};
use knowbee_yeonjang::v2_cancel_use_case::{V2CancelOwnerScope, V2CancelUseCase};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

#[test]
fn signed_cancel_ack_preserves_exact_identity_and_never_claims_target_terminal() {
    let acknowledgement = accepted_ack();
    let signer = RecordingSigner::default();
    let response =
        V2CancelResponseEnvelope::sign(acknowledgement, signing_context("brad"), &signer)
            .expect("signed cancel ack");
    let value = serde_json::to_value(&response).expect("response JSON");

    assert_eq!(value["schema_id"], "yeonjang.cancel-ack.v2");
    assert_eq!(value["request_id"], "request-cancel");
    assert_eq!(value["command_id"], "command-cancel");
    assert_eq!(value["operation_id"], "operation-cancel");
    assert_eq!(value["payload"]["target_command_id"], "command-camera");
    assert_eq!(value["payload"]["outcome"], "accepted");
    assert_eq!(value["payload"]["target_terminal"], false);
    assert_eq!(value["authorization"]["signature"], "aa".repeat(32));
    let calls = signer.calls.lock().expect("calls");
    assert_eq!(calls.len(), 1);
    assert_eq!(
        format!("sha256:{:x}", Sha256::digest(&calls[0])),
        "sha256:6721e2d75ffe5ee19d18fee7ea87147a971ad86b4008fbe7e330147a059057fd"
    );

    let debug = format!("{response:?}");
    assert!(!debug.contains(&"aa".repeat(32)));
    assert!(!debug.contains("token-camera"));
}

#[test]
fn wrong_audience_and_malformed_signature_are_closed_without_response() {
    let acknowledgement = accepted_ack();
    assert_eq!(
        V2CancelResponseEnvelope::sign(
            acknowledgement.clone(),
            signing_context("requester-other"),
            &RecordingSigner::default(),
        ),
        Err(V2CancelResponseError::IdentityMismatch)
    );
    assert_eq!(
        V2CancelResponseEnvelope::sign(acknowledgement, signing_context("brad"), &MalformedSigner,),
        Err(V2CancelResponseError::InvalidSignature)
    );
}

fn accepted_ack() -> knowbee_yeonjang::v2_cancel_use_case::V2CancelAcknowledgement {
    let registry = Arc::new(ActiveCommandRegistry::default());
    let target = CommandTargetBinding::new(
        "request-camera",
        "command-camera",
        "operation-camera",
        "session-main",
        &fingerprint('a'),
        "idem-camera",
    )
    .expect("target");
    assert!(matches!(
        registry.register_bound(target, "token-camera"),
        ActiveCommandRegistration::Registered(_)
    ));
    let topics = MqttV2TopicSet::new("yeonjang-main", "session-main", "brad").expect("topics");
    let control = parse_v2_control(
        topics.control(),
        &serde_json::to_vec(&control_fixture()).expect("control JSON"),
        1_000,
        &topics,
    )
    .expect("control");
    let replay = InMemoryAuthorizationReplayGuard::new(1).expect("replay");
    let admitted = V2ControlAdmission::new(&AcceptSignatures, &replay)
        .admit(&control, 1_000)
        .expect("admitted");
    V2CancelUseCase::new(
        registry,
        V2CancelOwnerScope::new("yeonjang-main", "session-main", fingerprint('a')).expect("owner"),
    )
    .execute(&admitted)
}

fn signing_context(audience: &str) -> V2ResponseSigningContext {
    V2ResponseSigningContext {
        message_id: "message-cancel-response".to_string(),
        issued_at: 1_100,
        expires_at: 3_000,
        issuer: "yeonjang-main".to_string(),
        key_id: "response-key".to_string(),
        audience: audience.to_string(),
        nonce: "response-nonce".to_string(),
    }
}

fn control_fixture() -> Value {
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
            "expires_at": 2_000, "nonce": "nonce-cancel", "signature": "bb".repeat(32)
        }
    })
}

fn fingerprint(value: char) -> String {
    format!("sha256:{}", value.to_string().repeat(64))
}

#[derive(Default)]
struct RecordingSigner {
    calls: Mutex<Vec<Vec<u8>>>,
}

impl V2ResponseSigner for RecordingSigner {
    fn sign(&self, _: &str, _: &str, bytes: &[u8]) -> Result<String, V2ResponseSignerError> {
        self.calls.lock().expect("calls").push(bytes.to_vec());
        Ok("aa".repeat(32))
    }
}

struct MalformedSigner;

impl V2ResponseSigner for MalformedSigner {
    fn sign(&self, _: &str, _: &str, _: &[u8]) -> Result<String, V2ResponseSignerError> {
        Ok("not-a-signature".to_string())
    }
}

struct AcceptSignatures;

impl V2ControlSignatureVerifier for AcceptSignatures {
    fn verify(&self, _: &str, _: &str, _: &[u8], _: &str) -> bool {
        true
    }
}
