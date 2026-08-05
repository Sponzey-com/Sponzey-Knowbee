use knowbee_yeonjang::authorization::InMemoryAuthorizationReplayGuard;
use knowbee_yeonjang::mqtt_v2_topics::MqttV2TopicSet;
use knowbee_yeonjang::protocol_v2_permission_query::{
    V2CapturePermissionQueryAdmission, V2CapturePermissionQueryAdmissionError,
    V2CapturePermissionQueryAdmissionOutcome, V2CapturePermissionQueryParseError,
    V2CapturePermissionQuerySignatureVerifier, parse_v2_capture_permission_query,
};
use serde_json::{Value, json};

const NOW_MS: i64 = 10_000;

#[test]
fn strict_permission_read_binds_exact_requester_target_and_empty_query() {
    let topics = topics();
    let parsed = parse_v2_capture_permission_query(
        topics.control(),
        &serde_json::to_vec(&fixture()).expect("query JSON"),
        false,
        NOW_MS,
        &topics,
    )
    .expect("permission query");
    assert_eq!(parsed.request_id(), "permission-request");
    assert_eq!(parsed.requester_id(), "requester-a");
    assert_eq!(parsed.target_instance_id(), "instance-a");
    assert_eq!(parsed.target_session_id(), "session-a");
    assert_eq!(parsed.idempotency_key(), "permission-idempotency");
    assert!(!parsed.authorization_signing_bytes().is_empty());
}

#[test]
fn retained_wrong_scope_target_and_extra_input_stop_before_observation() {
    let topics = topics();
    let bytes = serde_json::to_vec(&fixture()).expect("query JSON");
    assert_eq!(
        parse_v2_capture_permission_query(topics.control(), &bytes, true, NOW_MS, &topics),
        Err(V2CapturePermissionQueryParseError::RetainedNotAllowed)
    );

    let mut wrong_scope = fixture();
    wrong_scope["authorization"]["scope"] = json!("effect.execute");
    assert_eq!(
        parse(&topics, wrong_scope),
        Err(V2CapturePermissionQueryParseError::AuthorizationMismatch)
    );

    let mut wrong_target = fixture();
    wrong_target["target_instance_id"] = json!("instance-b");
    assert_eq!(
        parse(&topics, wrong_target),
        Err(V2CapturePermissionQueryParseError::TargetMismatch)
    );

    let mut semantic_input = fixture();
    semantic_input["payload"]["params"]["resource"] = json!("camera");
    assert_eq!(
        parse(&topics, semantic_input),
        Err(V2CapturePermissionQueryParseError::UnknownOrInvalidField)
    );
}

#[test]
fn signature_admission_distinguishes_fresh_replay_and_expired_without_effect() {
    let topics = topics();
    let query = parse(&topics, fixture()).expect("query");
    let guard = InMemoryAuthorizationReplayGuard::new(2).expect("guard");
    let admission = V2CapturePermissionQueryAdmission::new(&AcceptSignature, &guard);
    assert!(matches!(
        admission.admit_or_replay(&query, NOW_MS),
        Ok(V2CapturePermissionQueryAdmissionOutcome::Fresh(_))
    ));
    assert!(matches!(
        admission.admit_or_replay(&query, NOW_MS),
        Ok(V2CapturePermissionQueryAdmissionOutcome::VerifiedReplay(_))
    ));
    assert_eq!(
        V2CapturePermissionQueryAdmission::new(&RejectSignature, &guard)
            .admit_or_replay(&query, NOW_MS),
        Err(V2CapturePermissionQueryAdmissionError::SignatureRejected)
    );
    assert_eq!(
        admission.admit_or_replay(&query, 11_000),
        Err(V2CapturePermissionQueryAdmissionError::Expired)
    );
}

fn parse(
    topics: &MqttV2TopicSet,
    value: Value,
) -> Result<
    knowbee_yeonjang::protocol_v2_permission_query::V2CapturePermissionQueryEnvelope,
    V2CapturePermissionQueryParseError,
> {
    parse_v2_capture_permission_query(
        topics.control(),
        &serde_json::to_vec(&value).expect("query JSON"),
        false,
        NOW_MS,
        topics,
    )
}

fn topics() -> MqttV2TopicSet {
    MqttV2TopicSet::new("instance-a", "session-a", "requester-a").expect("topics")
}

fn fixture() -> Value {
    json!({
        "protocol_version": 2,
        "schema_id": "yeonjang.control.v2",
        "message_kind": "control",
        "message_id": "permission-message",
        "request_id": "permission-request",
        "command_id": "permission-command",
        "operation_id": "permission-operation",
        "correlation_id": "permission-correlation",
        "causation_id": "permission-causation",
        "requester_id": "requester-a",
        "target_instance_id": "instance-a",
        "target_session_id": "session-a",
        "target_fingerprint":
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "idempotency_key": "permission-idempotency",
        "issued_at": 9_000,
        "expires_at": 11_000,
        "sequence": 1,
        "payload": {
            "control": "capture.permission.get",
            "params": {}
        },
        "authorization": {
            "schema_version": 1,
            "authorization_id": "permission-authorization",
            "issuer": "requester-a",
            "key_id": "requester-hmac-v2",
            "audience": "instance-a",
            "scope": "permission.read",
            "requester_id": "requester-a",
            "command_id": "permission-command",
            "operation_id": "permission-operation",
            "target_instance_id": "instance-a",
            "target_session_id": "session-a",
            "target_fingerprint":
                "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "idempotency_key": "permission-idempotency",
            "expires_at": 11_000,
            "nonce": "permission-nonce",
            "signature": "ab".repeat(32)
        }
    })
}

struct AcceptSignature;

impl V2CapturePermissionQuerySignatureVerifier for AcceptSignature {
    fn verify(&self, _: &str, _: &str, _: &[u8], _: &str) -> bool {
        true
    }
}

struct RejectSignature;

impl V2CapturePermissionQuerySignatureVerifier for RejectSignature {
    fn verify(&self, _: &str, _: &str, _: &[u8], _: &str) -> bool {
        false
    }
}
