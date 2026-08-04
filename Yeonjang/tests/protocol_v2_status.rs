use knowbee_yeonjang::mqtt_v2_topics::MqttV2TopicSet;
use knowbee_yeonjang::protocol_v2_status::{
    V2StatusAdmission, V2StatusBuildError, V2StatusParseError, V2StatusSignatureVerifier,
    V2StatusSnapshot, V2StatusState, parse_v2_status,
};
use knowbee_yeonjang::protocol_v2_terminal::{
    V2ResponseSigner, V2ResponseSignerError, V2ResponseSigningContext,
};
use sha2::{Digest, Sha256};

#[test]
fn signed_online_status_round_trips_with_exact_finite_liveness_binding() {
    let topics = topics();
    let envelope = V2StatusSnapshot::new(
        "instance-a",
        "session-a",
        &format!("sha256:{}", "34".repeat(32)),
        V2StatusState::Online,
        1_000,
        31_000,
        7,
    )
    .expect("snapshot")
    .sign(signing_context(1_000, 31_000), &DigestCrypto)
    .expect("signed");
    let payload = serde_json::to_vec(&envelope).expect("json");
    let parsed =
        parse_v2_status(topics.status(), &payload, true, 2_000, &topics).expect("strict parse");
    assert_eq!(parsed.state(), V2StatusState::Online);
    assert_eq!(parsed.sequence(), 7);
    assert_eq!(parsed.target_instance_id(), "instance-a");
    assert_eq!(parsed.target_session_id(), "session-a");
    V2StatusAdmission::new(&DigestCrypto)
        .admit(&parsed)
        .expect("signature");
}

#[test]
fn offline_will_is_indefinite_but_online_expiry_and_identity_remain_strict() {
    assert_eq!(
        V2StatusSnapshot::new(
            "instance-a",
            "session-a",
            &format!("sha256:{}", "34".repeat(32)),
            V2StatusState::Offline,
            1_000,
            31_000,
            1,
        ),
        Err(V2StatusBuildError::InvalidOfflineExpiry)
    );
    let offline = V2StatusSnapshot::new(
        "instance-a",
        "session-a",
        &format!("sha256:{}", "34".repeat(32)),
        V2StatusState::Offline,
        1_000,
        i64::MAX,
        1,
    )
    .expect("offline");
    assert!(offline.is_last_will_compatible());

    assert_eq!(
        V2StatusSnapshot::new(
            "instance-a",
            "session-a",
            &format!("sha256:{}", "34".repeat(32)),
            V2StatusState::Online,
            1_000,
            i64::MAX,
            1,
        ),
        Err(V2StatusBuildError::InvalidOnlineExpiry)
    );
    assert!(
        V2StatusSnapshot::new(
            "wrong/instance",
            "session-a",
            &format!("sha256:{}", "34".repeat(32)),
            V2StatusState::Offline,
            1_000,
            i64::MAX,
            1,
        )
        .is_err()
    );
}

#[test]
fn status_rejects_wrong_topic_non_retained_unknown_field_and_signature_tamper() {
    let topics = topics();
    let envelope = V2StatusSnapshot::new(
        "instance-a",
        "session-a",
        &format!("sha256:{}", "34".repeat(32)),
        V2StatusState::Online,
        1_000,
        31_000,
        1,
    )
    .expect("snapshot")
    .sign(signing_context(1_000, 31_000), &DigestCrypto)
    .expect("signed");
    let payload = serde_json::to_vec(&envelope).expect("json");
    assert_eq!(
        parse_v2_status(topics.command(), &payload, true, 2_000, &topics),
        Err(V2StatusParseError::TopicMismatch)
    );
    assert_eq!(
        parse_v2_status(topics.status(), &payload, false, 2_000, &topics),
        Err(V2StatusParseError::NonRetained)
    );

    let mut value: serde_json::Value = serde_json::from_slice(&payload).expect("value");
    value["payload"]["unexpected"] = true.into();
    let unknown = serde_json::to_vec(&value).expect("unknown json");
    assert_eq!(
        parse_v2_status(topics.status(), &unknown, true, 2_000, &topics),
        Err(V2StatusParseError::UnknownOrInvalidField)
    );
    value["payload"]
        .as_object_mut()
        .expect("payload object")
        .remove("unexpected");
    value["sequence"] = 2.into();
    let tampered = serde_json::to_vec(&value).expect("tampered json");
    let parsed =
        parse_v2_status(topics.status(), &tampered, true, 2_000, &topics).expect("shape valid");
    assert!(
        V2StatusAdmission::new(&DigestCrypto)
            .admit(&parsed)
            .is_err()
    );
}

fn topics() -> MqttV2TopicSet {
    MqttV2TopicSet::new("instance-a", "session-a", "requester-a").expect("topics")
}

fn signing_context(issued_at: i64, expires_at: i64) -> V2ResponseSigningContext {
    V2ResponseSigningContext {
        message_id: "status-message-a".to_string(),
        issued_at,
        expires_at,
        issuer: "instance-a".to_string(),
        key_id: "instance-hmac-v2".to_string(),
        audience: "session-a".to_string(),
        nonce: "status-nonce-a".to_string(),
    }
}

struct DigestCrypto;

impl V2ResponseSigner for DigestCrypto {
    fn sign(
        &self,
        _: &str,
        _: &str,
        signing_bytes: &[u8],
    ) -> Result<String, V2ResponseSignerError> {
        Ok(format!("{:x}", Sha256::digest(signing_bytes)))
    }
}

impl V2StatusSignatureVerifier for DigestCrypto {
    fn verify(&self, _: &str, _: &str, signing_bytes: &[u8], signature_hex: &str) -> bool {
        format!("{:x}", Sha256::digest(signing_bytes)) == signature_hex
    }
}
