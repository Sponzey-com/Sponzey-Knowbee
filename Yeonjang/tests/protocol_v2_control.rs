use knowbee_yeonjang::authorization::InMemoryAuthorizationReplayGuard;
use knowbee_yeonjang::mqtt_v2_topics::MqttV2TopicSet;
use knowbee_yeonjang::protocol_v2_control::{
    V2CancelReason, V2ControlParseError, V2ControlSignatureVerifier, parse_v2_control,
};
use knowbee_yeonjang::protocol_v2_control_admission::{
    V2ControlAdmission, V2ControlAdmissionError,
};
use serde_json::{Value, json};

const NOW_MS: i64 = 1_000;

#[test]
fn valid_cancel_preserves_exact_target_and_has_order_independent_signing_bytes() {
    let topics = topics();
    let fixture = cancel_fixture();
    let encoded = serde_json::to_vec(&fixture).expect("control JSON");
    let parsed =
        parse_v2_control(topics.control(), &encoded, NOW_MS, &topics).expect("valid exact cancel");

    assert_eq!(parsed.request_id(), "request-cancel");
    assert_eq!(parsed.target_request_id(), "request-camera");
    assert_eq!(parsed.target_command_id(), "command-camera");
    assert_eq!(parsed.target_operation_id(), "operation-camera");
    assert_eq!(parsed.target_idempotency_key(), "idem-camera");
    assert_eq!(parsed.cancellation_id(), "cancel-camera");
    assert_eq!(parsed.cancel_token(), "token-camera");
    assert_eq!(parsed.reason(), V2CancelReason::UserRequested);

    let reordered = json!({
        "authorization": fixture["authorization"].clone(),
        "payload": fixture["payload"].clone(),
        "sequence": 1,
        "expires_at": 2_000,
        "issued_at": 900,
        "target_fingerprint": fingerprint('a'),
        "target_session_id": "session-main",
        "target_instance_id": "yeonjang-main",
        "requester_id": "brad",
        "causation_id": "message-camera",
        "correlation_id": "correlation-cancel",
        "idempotency_key": "idem-cancel",
        "operation_id": "operation-cancel",
        "command_id": "command-cancel",
        "request_id": "request-cancel",
        "message_id": "message-cancel",
        "message_kind": "control",
        "schema_id": "yeonjang.control.v2",
        "protocol_version": 2
    });
    let reordered = parse_v2_control(
        topics.control(),
        &serde_json::to_vec(&reordered).expect("reordered JSON"),
        NOW_MS,
        &topics,
    )
    .expect("order independent control");
    assert_eq!(
        parsed.authorization_signing_bytes(),
        reordered.authorization_signing_bytes()
    );
}

#[test]
fn wrong_authorized_target_or_unknown_field_is_rejected_before_cancellation() {
    let topics = topics();
    let mut wrong_target = cancel_fixture();
    wrong_target["authorization"]["target_operation_id"] = json!("operation-other");
    assert_eq!(
        parse_v2_control(
            topics.control(),
            &serde_json::to_vec(&wrong_target).expect("JSON"),
            NOW_MS,
            &topics,
        ),
        Err(V2ControlParseError::AuthorizationMismatch)
    );

    let mut unknown = cancel_fixture();
    unknown["payload"]["params"]["semantic_hint"] = json!("cancel latest camera");
    assert_eq!(
        parse_v2_control(
            topics.control(),
            &serde_json::to_vec(&unknown).expect("JSON"),
            NOW_MS,
            &topics,
        ),
        Err(V2ControlParseError::UnknownOrInvalidField)
    );
}

#[test]
fn v1_and_wrong_topic_are_closed_before_strict_v2_deserialization() {
    let topics = topics();
    let mut v1 = cancel_fixture();
    v1["protocol_version"] = json!(1);
    v1["legacy_extra"] = json!(true);
    assert_eq!(
        parse_v2_control(
            topics.control(),
            &serde_json::to_vec(&v1).expect("JSON"),
            NOW_MS,
            &topics,
        ),
        Err(V2ControlParseError::ProtocolUpgradeRequired)
    );
    assert_eq!(
        parse_v2_control(
            topics.command(),
            &serde_json::to_vec(&cancel_fixture()).expect("JSON"),
            NOW_MS,
            &topics,
        ),
        Err(V2ControlParseError::TopicMismatch)
    );
}

#[test]
fn signing_binds_control_and_target_identity_without_debugging_secrets() {
    let topics = topics();
    let encoded = serde_json::to_vec(&cancel_fixture()).expect("JSON");
    let parsed =
        parse_v2_control(topics.control(), &encoded, NOW_MS, &topics).expect("valid control");
    let original = parsed.authorization_signing_bytes();

    let mut changed = cancel_fixture();
    changed["payload"]["params"]["target_command_id"] = json!("command-other");
    changed["authorization"]["target_command_id"] = json!("command-other");
    let changed = parse_v2_control(
        topics.control(),
        &serde_json::to_vec(&changed).expect("JSON"),
        NOW_MS,
        &topics,
    )
    .expect("internally consistent changed target");
    assert_ne!(original, changed.authorization_signing_bytes());

    let debug = format!("{parsed:?}");
    assert!(!debug.contains("token-camera"));
    assert!(!debug.contains(&"b".repeat(64)));
}

#[test]
fn admission_verifies_before_consuming_and_accepts_exact_control_once() {
    let topics = topics();
    let encoded = serde_json::to_vec(&cancel_fixture()).expect("JSON");
    let control =
        parse_v2_control(topics.control(), &encoded, NOW_MS, &topics).expect("valid control");
    let replay = InMemoryAuthorizationReplayGuard::new(1).expect("replay");

    assert_eq!(
        V2ControlAdmission::new(&RejectSignatures, &replay).admit(&control, NOW_MS),
        Err(V2ControlAdmissionError::SignatureRejected)
    );
    assert!(
        V2ControlAdmission::new(&AcceptSignatures, &replay)
            .admit(&control, NOW_MS)
            .is_ok()
    );
    assert_eq!(
        V2ControlAdmission::new(&AcceptSignatures, &replay).admit(&control, NOW_MS + 1),
        Err(V2ControlAdmissionError::Replayed)
    );
}

#[test]
fn admission_rechecks_expiry_without_consuming_replay_capacity() {
    let topics = topics();
    let encoded = serde_json::to_vec(&cancel_fixture()).expect("JSON");
    let control =
        parse_v2_control(topics.control(), &encoded, NOW_MS, &topics).expect("valid control");
    let replay = InMemoryAuthorizationReplayGuard::new(1).expect("replay");

    assert_eq!(
        V2ControlAdmission::new(&AcceptSignatures, &replay).admit(&control, 2_000),
        Err(V2ControlAdmissionError::Expired)
    );
    assert!(
        V2ControlAdmission::new(&AcceptSignatures, &replay)
            .admit(&control, NOW_MS)
            .is_ok()
    );
}

#[test]
fn admission_closes_when_replay_storage_capacity_is_unavailable() {
    let topics = topics();
    let first = parse_v2_control(
        topics.control(),
        &serde_json::to_vec(&cancel_fixture()).expect("first JSON"),
        NOW_MS,
        &topics,
    )
    .expect("first control");
    let mut second = cancel_fixture();
    for (path, value) in [
        (&["message_id"][..], "message-cancel-second"),
        (&["request_id"][..], "request-cancel-second"),
        (&["command_id"][..], "command-cancel-second"),
        (&["operation_id"][..], "operation-cancel-second"),
        (&["idempotency_key"][..], "idem-cancel-second"),
        (
            &["authorization", "authorization_id"][..],
            "auth-cancel-second",
        ),
        (&["authorization", "nonce"][..], "nonce-cancel-second"),
        (
            &["authorization", "command_id"][..],
            "command-cancel-second",
        ),
        (
            &["authorization", "operation_id"][..],
            "operation-cancel-second",
        ),
        (
            &["authorization", "idempotency_key"][..],
            "idem-cancel-second",
        ),
    ] {
        set_path(&mut second, path, json!(value));
    }
    let second = parse_v2_control(
        topics.control(),
        &serde_json::to_vec(&second).expect("second JSON"),
        NOW_MS,
        &topics,
    )
    .expect("second control");
    let replay = InMemoryAuthorizationReplayGuard::new(1).expect("replay");
    let admission = V2ControlAdmission::new(&AcceptSignatures, &replay);

    assert!(admission.admit(&first, NOW_MS).is_ok());
    assert_eq!(
        admission.admit(&second, NOW_MS + 1),
        Err(V2ControlAdmissionError::ReplayUnavailable)
    );
}

fn topics() -> MqttV2TopicSet {
    MqttV2TopicSet::new("yeonjang-main", "session-main", "brad").expect("topics")
}

fn cancel_fixture() -> Value {
    json!({
        "protocol_version": 2,
        "schema_id": "yeonjang.control.v2",
        "message_kind": "control",
        "message_id": "message-cancel",
        "request_id": "request-cancel",
        "command_id": "command-cancel",
        "operation_id": "operation-cancel",
        "correlation_id": "correlation-cancel",
        "causation_id": "message-camera",
        "requester_id": "brad",
        "target_instance_id": "yeonjang-main",
        "target_session_id": "session-main",
        "target_fingerprint": fingerprint('a'),
        "idempotency_key": "idem-cancel",
        "issued_at": 900,
        "expires_at": 2_000,
        "sequence": 1,
        "payload": {
            "control": "command.cancel",
            "params": {
                "target_request_id": "request-camera",
                "target_command_id": "command-camera",
                "target_operation_id": "operation-camera",
                "target_idempotency_key": "idem-camera",
                "cancellation_id": "cancel-camera",
                "cancel_token": "token-camera",
                "reason": "user_requested"
            }
        },
        "authorization": {
            "schema_version": 1,
            "authorization_id": "auth-cancel",
            "issuer": "gateway-main",
            "key_id": "key-main",
            "audience": "yeonjang-main",
            "scope": "effect.cancel",
            "requester_id": "brad",
            "command_id": "command-cancel",
            "operation_id": "operation-cancel",
            "target_instance_id": "yeonjang-main",
            "target_session_id": "session-main",
            "target_fingerprint": fingerprint('a'),
            "idempotency_key": "idem-cancel",
            "target_request_id": "request-camera",
            "target_command_id": "command-camera",
            "target_operation_id": "operation-camera",
            "target_idempotency_key": "idem-camera",
            "cancellation_id": "cancel-camera",
            "cancel_token": "token-camera",
            "expires_at": 2_000,
            "nonce": "nonce-cancel",
            "signature": "b".repeat(64)
        }
    })
}

fn fingerprint(value: char) -> String {
    format!("sha256:{}", value.to_string().repeat(64))
}

fn set_path(document: &mut Value, path: &[&str], value: Value) {
    let mut current = document;
    for segment in &path[..path.len() - 1] {
        current = &mut current[*segment];
    }
    current[path[path.len() - 1]] = value;
}

struct AcceptSignatures;

impl V2ControlSignatureVerifier for AcceptSignatures {
    fn verify(&self, _: &str, _: &str, _: &[u8], _: &str) -> bool {
        true
    }
}

struct RejectSignatures;

impl V2ControlSignatureVerifier for RejectSignatures {
    fn verify(&self, _: &str, _: &str, _: &[u8], _: &str) -> bool {
        false
    }
}
