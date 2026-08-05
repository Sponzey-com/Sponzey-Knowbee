use knowbee_yeonjang::mqtt_v2_capability_projection::{
    V2PlatformCapabilitySnapshot, project_v2_capture_capabilities,
};
use knowbee_yeonjang::mqtt_v2_topics::MqttV2TopicSet;
use knowbee_yeonjang::permission_policy::PermissionPolicySnapshot;
use knowbee_yeonjang::platform_operation::TargetPlatform;
use knowbee_yeonjang::protocol_v2_capabilities::{
    V2CapabilitiesAdmission, V2CapabilitiesIdentity, V2CapabilitiesParseError,
    V2CapabilitiesSignatureVerifier, V2CapabilitiesSnapshot, parse_v2_capabilities,
};
use knowbee_yeonjang::protocol_v2_terminal::{
    V2ResponseSigner, V2ResponseSignerError, V2ResponseSigningContext,
};
use sha2::{Digest, Sha256};

#[test]
fn signed_capabilities_round_trip_and_tamper_is_rejected() {
    let topics = topics();
    let projection = project_v2_capture_capabilities(
        &V2PlatformCapabilitySnapshot::new(TargetPlatform::Linux, true, true),
        &PermissionPolicySnapshot::new("instance-a").expect("policy"),
    )
    .expect("projection");
    let envelope = V2CapabilitiesSnapshot::new(
        V2CapabilitiesIdentity::new(
            "instance-a",
            "session-a",
            &format!("sha256:{}", "34".repeat(32)),
        )
        .expect("identity"),
        projection,
        1_000,
        31_000,
        1,
    )
    .expect("snapshot")
    .sign(signing_context(), &DigestCrypto)
    .expect("sign");
    let bytes = serde_json::to_vec(&envelope).expect("json");
    let parsed =
        parse_v2_capabilities(topics.capabilities(), &bytes, true, 2_000, &topics).expect("parse");
    V2CapabilitiesAdmission::new(&DigestCrypto)
        .admit(&parsed)
        .expect("signature");
    assert_eq!(parsed.projection().advertised_methods.len(), 2);

    let mut value: serde_json::Value = serde_json::from_slice(&bytes).expect("value");
    value["payload"]["policyRevision"] = 7.into();
    let tampered = serde_json::to_vec(&value).expect("tampered");
    let parsed_tampered =
        parse_v2_capabilities(topics.capabilities(), &tampered, true, 2_000, &topics)
            .expect("valid shape");
    assert!(
        V2CapabilitiesAdmission::new(&DigestCrypto)
            .admit(&parsed_tampered)
            .is_err()
    );
}

#[test]
fn capabilities_require_exact_retained_topic_and_fresh_projection() {
    let topics = topics();
    let envelope = fixture();
    let bytes = serde_json::to_vec(&envelope).expect("json");
    assert_eq!(
        parse_v2_capabilities(topics.status(), &bytes, true, 2_000, &topics),
        Err(V2CapabilitiesParseError::TopicMismatch)
    );
    assert_eq!(
        parse_v2_capabilities(topics.capabilities(), &bytes, false, 2_000, &topics),
        Err(V2CapabilitiesParseError::NonRetained)
    );
    assert_eq!(
        parse_v2_capabilities(topics.capabilities(), &bytes, true, 31_000, &topics),
        Err(V2CapabilitiesParseError::Expired)
    );
}

fn fixture() -> knowbee_yeonjang::protocol_v2_capabilities::V2CapabilitiesEnvelope {
    let projection = project_v2_capture_capabilities(
        &V2PlatformCapabilitySnapshot::new(TargetPlatform::Macos, true, false),
        &PermissionPolicySnapshot::new("instance-a").expect("policy"),
    )
    .expect("projection");
    V2CapabilitiesSnapshot::new(
        V2CapabilitiesIdentity::new(
            "instance-a",
            "session-a",
            &format!("sha256:{}", "34".repeat(32)),
        )
        .expect("identity"),
        projection,
        1_000,
        31_000,
        1,
    )
    .expect("snapshot")
    .sign(signing_context(), &DigestCrypto)
    .expect("sign")
}

fn topics() -> MqttV2TopicSet {
    MqttV2TopicSet::new("instance-a", "session-a", "requester-a").expect("topics")
}

fn signing_context() -> V2ResponseSigningContext {
    V2ResponseSigningContext {
        message_id: "capabilities-message-a".to_string(),
        issued_at: 1_000,
        expires_at: 31_000,
        issuer: "instance-a".to_string(),
        key_id: "instance-hmac-v2".to_string(),
        audience: "session-a".to_string(),
        nonce: "capabilities-nonce-a".to_string(),
    }
}

struct DigestCrypto;

impl V2ResponseSigner for DigestCrypto {
    fn sign(&self, _: &str, _: &str, bytes: &[u8]) -> Result<String, V2ResponseSignerError> {
        Ok(format!("{:x}", Sha256::digest(bytes)))
    }
}

impl V2CapabilitiesSignatureVerifier for DigestCrypto {
    fn verify(&self, _: &str, _: &str, bytes: &[u8], signature: &str) -> bool {
        format!("{:x}", Sha256::digest(bytes)) == signature
    }
}
