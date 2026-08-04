use std::sync::Arc;

use knowbee_yeonjang::mqtt_v2_capabilities_adapter::MqttV2CapabilitiesAdapter;
use knowbee_yeonjang::mqtt_v2_capability_projection::V2PlatformCapabilitySnapshot;
use knowbee_yeonjang::mqtt_v2_crypto::{MqttV2HmacCrypto, V2HmacKeySnapshot};
use knowbee_yeonjang::mqtt_v2_topics::MqttV2TopicSet;
use knowbee_yeonjang::permission_policy::{
    PermissionPolicySnapshot, PolicyCapability, PolicyDecision, PolicyResourceConstraint,
    PolicyTransition, PolicyUpdateCommand, apply_policy_update,
};
use knowbee_yeonjang::platform_operation::TargetPlatform;
use knowbee_yeonjang::policy_repository::{PermissionPolicyReader, PolicySnapshotRead};
use knowbee_yeonjang::protocol_v2_capabilities::{V2CapabilitiesAdmission, parse_v2_capabilities};

#[test]
fn adapter_reads_policy_and_builds_an_admissible_signed_projection() {
    let topics = MqttV2TopicSet::new("instance-a", "session-a", "requester-a").expect("topics");
    let crypto = Arc::new(
        MqttV2HmacCrypto::new(
            key("instance-a", "response-key", b"response-secret1".to_vec()),
            key("instance-a", "response-key", b"response-secret1".to_vec()),
        )
        .expect("crypto"),
    );
    let adapter = MqttV2CapabilitiesAdapter::new(
        topics.clone(),
        format!("sha256:{}", "34".repeat(32)),
        V2PlatformCapabilitySnapshot::new(TargetPlatform::Macos, true, false),
        Arc::new(AllowedCameraPolicy),
        "instance-a",
        "response-key",
        3_000,
        crypto.clone(),
    )
    .expect("adapter");

    let publication = adapter.publish(1_000).expect("publication");
    let parsed = parse_v2_capabilities(
        topics.capabilities(),
        &publication.payload,
        publication.retained,
        1_000,
        &topics,
    )
    .expect("parse");
    V2CapabilitiesAdmission::new(crypto.as_ref())
        .admit(&parsed)
        .expect("signature");
    assert_eq!(parsed.projection().advertised_methods, ["camera.capture"]);
    assert_eq!(parsed.projection().policy_revision, 1);
}

fn key(issuer: &str, key_id: &str, secret: Vec<u8>) -> V2HmacKeySnapshot {
    V2HmacKeySnapshot::new(issuer, key_id, secret).expect("key")
}

struct AllowedCameraPolicy;

impl PermissionPolicyReader for AllowedCameraPolicy {
    fn snapshot(&self) -> PolicySnapshotRead {
        let initial = PermissionPolicySnapshot::new("instance-a").expect("policy");
        let command = PolicyUpdateCommand::new(
            "instance-a",
            0,
            PolicyCapability::CameraCapture,
            PolicyDecision::Allowed,
            PolicyResourceConstraint::Any,
        )
        .expect("command");
        match apply_policy_update(&initial, &command) {
            PolicyTransition::Applied { snapshot, .. } => PolicySnapshotRead::Snapshot(snapshot),
            other => panic!("policy fixture: {other:?}"),
        }
    }
}
