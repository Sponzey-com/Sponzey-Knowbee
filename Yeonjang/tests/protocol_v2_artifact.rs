#![recursion_limit = "256"]

use knowbee_yeonjang::artifact_transfer_use_case::ArtifactCancelResult;
use knowbee_yeonjang::authorization::InMemoryAuthorizationReplayGuard;
use knowbee_yeonjang::mqtt_v2_crypto::{MqttV2HmacCrypto, V2HmacKeySnapshot};
use knowbee_yeonjang::mqtt_v2_topics::MqttV2TopicSet;
use knowbee_yeonjang::protocol_v2_artifact::{
    V2ArtifactAdmission, V2ArtifactAdmissionError, V2ArtifactControlKind, V2ArtifactParseError,
    V2ArtifactSignatureVerifier, parse_v2_artifact_control,
};
use knowbee_yeonjang::protocol_v2_artifact_cancel_response::{
    V2ArtifactCancelResponseEnvelope, V2ArtifactCancelResponseError,
};
use knowbee_yeonjang::protocol_v2_terminal::{
    V2ResponseSigner, V2ResponseSignerError, V2ResponseSigningContext,
};
use serde_json::{Value, json};

const NOW_MS: i64 = 1_000;

/// Gateway's fixed artifact-fetch vector must be admitted by the real Rust
/// HMAC verifier. This prevents a valid JSON fetch from being silently
/// rejected because either language changed canonical signing bytes.
#[test]
fn admits_gateway_signed_fetch_vector() {
    let topics = MqttV2TopicSet::new("instance-a", "session-a", "requester-a").expect("topics");
    let envelope = parse_v2_artifact_control(
        topics.control(),
        &serde_json::to_vec(&gateway_fetch_fixture()).expect("JSON"),
        false,
        NOW_MS,
        &topics,
    )
    .expect("Gateway fetch shape");
    let verifier = MqttV2HmacCrypto::new(
        V2HmacKeySnapshot::new("requester-a", "requester-hmac-v2", vec![0x22; 32])
            .expect("test key"),
        V2HmacKeySnapshot::new("instance-a", "response-hmac-v2", vec![0x33; 32])
            .expect("response key"),
    )
    .expect("crypto");
    let replay = InMemoryAuthorizationReplayGuard::new(1).expect("replay");
    assert!(
        V2ArtifactAdmission::new(&verifier, &replay)
            .admit(&envelope, NOW_MS)
            .is_ok()
    );
}

#[test]
fn signed_fetch_and_ack_bind_exact_routes_and_payloads() {
    let topics = topics();
    let fetch = fetch_fixture();
    let parsed = parse_v2_artifact_control(
        topics.control(),
        &serde_json::to_vec(&fetch).expect("JSON"),
        false,
        NOW_MS,
        &topics,
    )
    .expect("fetch");
    assert_eq!(parsed.kind(), V2ArtifactControlKind::Fetch);
    assert_eq!(parsed.artifact_ref(), artifact_ref());
    assert_eq!(parsed.transfer_id(), "transfer-a");
    assert_eq!(parsed.owner_request_id(), "request-camera");
    assert_eq!(parsed.expected_revision(), 0);
    assert_eq!(parsed.chunk_payload_bytes(), Some(262_144));

    let ack = ack_fixture();
    let parsed_ack = parse_v2_artifact_control(
        topics.artifact_ack("transfer-a").expect("ack topic"),
        &serde_json::to_vec(&ack).expect("JSON"),
        false,
        NOW_MS,
        &topics,
    )
    .expect("ack");
    assert_eq!(parsed_ack.kind(), V2ArtifactControlKind::Ack);
    let expected_full_digest = fingerprint('b');
    assert_eq!(
        parsed_ack.full_digest(),
        Some(expected_full_digest.as_str())
    );
    assert_ne!(
        parsed.authorization_signing_bytes(),
        parsed_ack.authorization_signing_bytes()
    );
}

#[test]
fn signed_cancel_uses_control_route_and_a_distinct_least_privilege_scope() {
    let topics = topics();
    let cancel = cancel_fixture();
    let parsed = parse_v2_artifact_control(
        topics.control(),
        &serde_json::to_vec(&cancel).expect("JSON"),
        false,
        NOW_MS,
        &topics,
    )
    .expect("cancel");
    assert_eq!(parsed.kind(), V2ArtifactControlKind::Cancel);
    assert_eq!(parsed.artifact_ref(), artifact_ref());
    assert_eq!(parsed.owner_request_id(), "request-camera");
    assert_eq!(parsed.owner_operation_id(), "operation-camera");
    assert_eq!(parsed.transfer_id(), "transfer-a");
    assert_eq!(parsed.expected_revision(), 1);
    assert_eq!(parsed.full_digest(), None);
    assert_eq!(parsed.chunk_payload_bytes(), None);

    let mut read_scope = cancel_fixture();
    read_scope["authorization"]["scope"] = json!("artifact.read");
    assert_eq!(
        parse_v2_artifact_control(
            topics.control(),
            &serde_json::to_vec(&read_scope).expect("JSON"),
            false,
            NOW_MS,
            &topics,
        ),
        Err(V2ArtifactParseError::AuthorizationMismatch)
    );
}

#[test]
fn signed_cancel_ack_binds_request_transfer_outcome_and_redacts_signature() {
    let topics = topics();
    let cancel = cancel_fixture();
    let parsed = parse_v2_artifact_control(
        topics.control(),
        &serde_json::to_vec(&cancel).expect("JSON"),
        false,
        NOW_MS,
        &topics,
    )
    .expect("cancel");
    let response = V2ArtifactCancelResponseEnvelope::sign(
        &parsed,
        ArtifactCancelResult::Cancelled {
            lifecycle_revision: 2,
        },
        response_context("brad"),
        &ResponseSigner,
    )
    .expect("response");
    let value = serde_json::to_value(&response).expect("response JSON");
    assert_eq!(value["schema_id"], "yeonjang.artifact-cancel-ack.v2");
    assert_eq!(value["request_id"], "request-artifact");
    assert_eq!(value["payload"]["transfer_id"], "transfer-a");
    assert_eq!(value["payload"]["outcome"], "cancelled");
    assert_eq!(value["payload"]["lifecycle_revision"], 2);
    assert_eq!(value["authorization"]["scope"], "response.publish");
    assert_eq!(value["authorization"]["signature"], "cd".repeat(32));
    assert!(!format!("{response:?}").contains(&"cd".repeat(32)));
    assert!(!response.authorization_signing_bytes().is_empty());

    assert_eq!(
        V2ArtifactCancelResponseEnvelope::sign(
            &parsed,
            ArtifactCancelResult::AlreadyCancelled {
                lifecycle_revision: 2,
            },
            response_context("other-requester"),
            &ResponseSigner,
        ),
        Err(V2ArtifactCancelResponseError::IdentityMismatch)
    );
}

#[test]
fn retained_wrong_topic_scope_expiry_and_unknown_fields_are_pre_use_case_rejections() {
    let topics = topics();
    let bytes = serde_json::to_vec(&fetch_fixture()).expect("JSON");
    assert_eq!(
        parse_v2_artifact_control(topics.control(), &bytes, true, NOW_MS, &topics),
        Err(V2ArtifactParseError::RetainedNotAllowed)
    );
    assert_eq!(
        parse_v2_artifact_control(topics.command(), &bytes, false, NOW_MS, &topics),
        Err(V2ArtifactParseError::TopicMismatch)
    );

    let mut wrong_scope = fetch_fixture();
    wrong_scope["authorization"]["scope"] = json!("effect.execute");
    assert_eq!(
        parse_v2_artifact_control(
            topics.control(),
            &serde_json::to_vec(&wrong_scope).expect("JSON"),
            false,
            NOW_MS,
            &topics,
        ),
        Err(V2ArtifactParseError::AuthorizationMismatch)
    );
    let mut unknown = fetch_fixture();
    unknown["payload"]["params"]["semantic_hint"] = json!("latest photo");
    assert_eq!(
        parse_v2_artifact_control(
            topics.control(),
            &serde_json::to_vec(&unknown).expect("JSON"),
            false,
            NOW_MS,
            &topics,
        ),
        Err(V2ArtifactParseError::UnknownOrInvalidField)
    );
    assert_eq!(
        parse_v2_artifact_control(topics.control(), &bytes, false, 2_000, &topics),
        Err(V2ArtifactParseError::Expired)
    );
}

fn response_context(audience: &str) -> V2ResponseSigningContext {
    V2ResponseSigningContext {
        message_id: "artifact-cancel-response".to_string(),
        issued_at: 1_100,
        expires_at: 3_000,
        issuer: "yeonjang-main".to_string(),
        key_id: "response-key".to_string(),
        audience: audience.to_string(),
        nonce: "artifact-cancel-response-nonce".to_string(),
    }
}

struct ResponseSigner;

impl V2ResponseSigner for ResponseSigner {
    fn sign(&self, _: &str, _: &str, _: &[u8]) -> Result<String, V2ResponseSignerError> {
        Ok("cd".repeat(32))
    }
}

#[test]
fn signature_and_replay_admission_run_after_strict_scope_validation() {
    let topics = topics();
    let envelope = parse_v2_artifact_control(
        topics.control(),
        &serde_json::to_vec(&fetch_fixture()).expect("JSON"),
        false,
        NOW_MS,
        &topics,
    )
    .expect("fetch");
    let replay = InMemoryAuthorizationReplayGuard::new(1).expect("replay");
    assert_eq!(
        V2ArtifactAdmission::new(&RejectSignatures, &replay).admit(&envelope, NOW_MS),
        Err(V2ArtifactAdmissionError::SignatureRejected)
    );
    assert!(
        V2ArtifactAdmission::new(&AcceptSignatures, &replay)
            .admit(&envelope, NOW_MS)
            .is_ok()
    );
    assert_eq!(
        V2ArtifactAdmission::new(&AcceptSignatures, &replay).admit(&envelope, NOW_MS + 1),
        Err(V2ArtifactAdmissionError::Replayed)
    );
}

fn topics() -> MqttV2TopicSet {
    MqttV2TopicSet::new("yeonjang-main", "session-main", "brad").expect("topics")
}

fn fetch_fixture() -> Value {
    fixture(
        json!({
            "artifact": "artifact.fetch",
            "params": {
                "artifact_ref": artifact_ref(),
                "owner_request_id": "request-camera",
                "owner_operation_id": "operation-camera",
                "expected_revision": 0,
                "transfer_id": "transfer-a",
                "chunk_payload_bytes": 262144
            }
        }),
        None,
        Some(262_144),
    )
}

fn gateway_fetch_fixture() -> Value {
    json!({
        "protocol_version": 2,
        "schema_id": "yeonjang.artifact-control.v2",
        "message_kind": "control",
        "message_id": "artifact-message",
        "request_id": "artifact-request",
        "command_id": "artifact-command",
        "operation_id": "artifact-operation",
        "correlation_id": "artifact-correlation",
        "causation_id": "response-message",
        "requester_id": "requester-a",
        "target_instance_id": "instance-a",
        "target_session_id": "session-a",
        "target_fingerprint": format!("sha256:{}", "34".repeat(32)),
        "idempotency_key": "artifact-idempotency",
        "issued_at": 900,
        "expires_at": 2_000,
        "sequence": 1,
        "payload": {
            "artifact": "artifact.fetch",
            "params": {
                "artifact_ref": format!("capture:{}", "90".repeat(32)),
                "owner_request_id": "request-v2",
                "owner_operation_id": "operation-v2",
                "expected_revision": 1,
                "transfer_id": "transfer-a",
                "chunk_payload_bytes": 262_144
            }
        },
        "authorization": {
            "schema_version": 1,
            "authorization_id": "artifact-authorization",
            "issuer": "requester-a",
            "key_id": "requester-hmac-v2",
            "audience": "instance-a",
            "scope": "artifact.read",
            "requester_id": "requester-a",
            "command_id": "artifact-command",
            "operation_id": "artifact-operation",
            "target_instance_id": "instance-a",
            "target_session_id": "session-a",
            "target_fingerprint": format!("sha256:{}", "34".repeat(32)),
            "idempotency_key": "artifact-idempotency",
            "artifact_ref": format!("capture:{}", "90".repeat(32)),
            "owner_request_id": "request-v2",
            "owner_operation_id": "operation-v2",
            "transfer_id": "transfer-a",
            "expected_revision": 1,
            "full_digest": null,
            "chunk_payload_bytes": 262_144,
            "expires_at": 2_000,
            "nonce": "artifact-nonce",
            "signature": "62218933d029330cda38d78a8fd8d9171bf666bce96b2eb75f5c7d58273798e4"
        }
    })
}

fn ack_fixture() -> Value {
    fixture(
        json!({
            "artifact": "artifact.ack",
            "params": {
                "artifact_ref": artifact_ref(),
                "owner_request_id": "request-camera",
                "owner_operation_id": "operation-camera",
                "expected_revision": 2,
                "transfer_id": "transfer-a",
                "full_digest": fingerprint('b')
            }
        }),
        Some(fingerprint('b')),
        None,
    )
}

fn cancel_fixture() -> Value {
    let mut value = fixture(
        json!({
            "artifact": "artifact.cancel",
            "params": {
                "artifact_ref": artifact_ref(),
                "owner_request_id": "request-camera",
                "owner_operation_id": "operation-camera",
                "expected_revision": 1,
                "transfer_id": "transfer-a"
            }
        }),
        None,
        None,
    );
    value["authorization"]["scope"] = json!("artifact.cancel");
    value["authorization"]["expected_revision"] = json!(1);
    value
}

fn fixture(payload: Value, full_digest: Option<String>, chunk_payload_bytes: Option<u32>) -> Value {
    json!({
        "protocol_version": 2,
        "schema_id": "yeonjang.artifact-control.v2",
        "message_kind": "control",
        "message_id": "message-artifact",
        "request_id": "request-artifact",
        "command_id": "command-artifact",
        "operation_id": "operation-artifact",
        "correlation_id": "correlation-artifact",
        "causation_id": "message-camera",
        "requester_id": "brad",
        "target_instance_id": "yeonjang-main",
        "target_session_id": "session-main",
        "target_fingerprint": fingerprint('a'),
        "idempotency_key": "idem-artifact",
        "issued_at": 900,
        "expires_at": 2000,
        "sequence": 1,
        "payload": payload,
        "authorization": {
            "schema_version": 1,
            "authorization_id": "authorization-artifact",
            "issuer": "issuer-main",
            "key_id": "key-main",
            "audience": "yeonjang-main",
            "scope": "artifact.read",
            "requester_id": "brad",
            "command_id": "command-artifact",
            "operation_id": "operation-artifact",
            "target_instance_id": "yeonjang-main",
            "target_session_id": "session-main",
            "target_fingerprint": fingerprint('a'),
            "idempotency_key": "idem-artifact",
            "artifact_ref": artifact_ref(),
            "owner_request_id": "request-camera",
            "owner_operation_id": "operation-camera",
            "transfer_id": "transfer-a",
            "expected_revision": if full_digest.is_some() { 2 } else { 0 },
            "full_digest": full_digest,
            "chunk_payload_bytes": chunk_payload_bytes,
            "expires_at": 2000,
            "nonce": "nonce-artifact",
            "signature": "c".repeat(64)
        }
    })
}

fn artifact_ref() -> &'static str {
    "capture:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}

fn fingerprint(character: char) -> String {
    format!("sha256:{}", character.to_string().repeat(64))
}

struct AcceptSignatures;
impl V2ArtifactSignatureVerifier for AcceptSignatures {
    fn verify(&self, _: &str, _: &str, _: &[u8], _: &str) -> bool {
        true
    }
}

struct RejectSignatures;
impl V2ArtifactSignatureVerifier for RejectSignatures {
    fn verify(&self, _: &str, _: &str, _: &[u8], _: &str) -> bool {
        false
    }
}
