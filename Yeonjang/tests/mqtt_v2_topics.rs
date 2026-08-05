use knowbee_yeonjang::mqtt_v2_topics::{
    MqttQos, MqttV2TopicError, MqttV2TopicSet, RoutedInboundTopic, V2TopicKind, delivery_policy,
};

#[test]
fn exact_topic_set_contains_instance_session_and_requester_identity() {
    let topics =
        MqttV2TopicSet::new("instance-a", "session-1", "requester-main").expect("topic set");

    assert_eq!(
        topics.command(),
        "yeonjang/v2/instances/instance-a/sessions/session-1/requesters/requester-main/command"
    );
    assert_eq!(
        topics.status(),
        "yeonjang/v2/instances/instance-a/sessions/session-1/status"
    );
    assert_eq!(
        topics.artifact_ack("transfer-1").expect("artifact ack"),
        "yeonjang/v2/instances/instance-a/sessions/session-1/requesters/requester-main/artifact/transfer-1/ack"
    );
    assert_eq!(
        topics.artifact_ack_filter(),
        "yeonjang/v2/instances/instance-a/sessions/session-1/requesters/requester-main/artifact/+/ack"
    );
}

#[test]
fn identifiers_reject_wildcards_traversal_separators_uppercase_and_oversize() {
    for invalid in [
        "",
        "Instance-A",
        "instance/a",
        "instance+a",
        "instance#a",
        ".",
        "..",
        "-instance",
        "instance with space",
    ] {
        assert_eq!(
            MqttV2TopicSet::new(invalid, "session-a", "requester-a")
                .expect_err("invalid instance identifier"),
            MqttV2TopicError::InvalidIdentifier
        );
    }
    assert_eq!(
        MqttV2TopicSet::new("a".repeat(65), "session-a", "requester-a")
            .expect_err("oversized identifier"),
        MqttV2TopicError::InvalidIdentifier
    );
}

#[test]
fn inbound_router_accepts_only_the_exact_bound_identity() {
    let topics = MqttV2TopicSet::new("instance-a", "session-a", "requester-a").expect("topic set");

    assert_eq!(
        topics.route_inbound(topics.command()),
        Ok(RoutedInboundTopic::Command)
    );
    assert_eq!(
        topics.route_inbound(topics.control()),
        Ok(RoutedInboundTopic::Control)
    );
    assert_eq!(
        topics.route_inbound(topics.admin()),
        Ok(RoutedInboundTopic::Admin)
    );
    assert_eq!(
        topics.route_inbound(
            "yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-b/command"
        ),
        Err(MqttV2TopicError::NotBoundTopic)
    );
    assert_eq!(
        topics.route_inbound(
            "yeonjang/v2/instances/instance-a/sessions/session-b/requesters/requester-a/command"
        ),
        Err(MqttV2TopicError::NotBoundTopic)
    );
}

#[test]
fn qos_and_retention_are_explicit_per_topic_kind() {
    for kind in [
        V2TopicKind::Command,
        V2TopicKind::Control,
        V2TopicKind::Admin,
        V2TopicKind::Response,
        V2TopicKind::Event,
        V2TopicKind::ArtifactChunk,
        V2TopicKind::ArtifactAck,
    ] {
        let policy = delivery_policy(kind);
        assert_eq!(policy.qos, MqttQos::AtLeastOnce);
        assert!(!policy.retained, "{kind:?}");
    }
    for kind in [V2TopicKind::Status, V2TopicKind::Capabilities] {
        let policy = delivery_policy(kind);
        assert_eq!(policy.qos, MqttQos::AtLeastOnce);
        assert!(policy.retained, "{kind:?}");
    }
}
