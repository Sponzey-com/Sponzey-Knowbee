#![recursion_limit = "256"]

#[allow(dead_code)]
#[path = "support/controlled_mqtt_broker.rs"]
mod controlled_mqtt_broker;

use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use controlled_mqtt_broker::ControlledMqttBroker;
use knowbee_yeonjang::artifact_lifecycle::{ArtifactBinding, ArtifactLifecycleState};
use knowbee_yeonjang::artifact_repository::ArtifactLifecycleRead;
use knowbee_yeonjang::artifact_runtime_composition::{
    ArtifactRuntimeComposition, ArtifactRuntimeConfig,
};
use knowbee_yeonjang::artifact_sink::{
    CaptureArtifactBinding, CaptureArtifactKind, CaptureArtifactLease, CaptureArtifactSink,
};
use knowbee_yeonjang::capability_permission::{
    CaptureCapabilityAvailability, CapturePermissionObservations,
};
use knowbee_yeonjang::capture_permission_read::{
    CapturePermissionObservationPort, CapturePermissionObservationRead,
};
use knowbee_yeonjang::durable_cancellation::DurableCancellationReceiptRepository;
use knowbee_yeonjang::durable_completed_store::{
    DurableRecordStorage, RawStoreRead, RawStoreWrite,
};
use knowbee_yeonjang::mqtt_transport::MqttTransportSecurity;
use knowbee_yeonjang::mqtt_v2_capability_projection::V2PlatformCapabilitySnapshot;
use knowbee_yeonjang::mqtt_v2_command_pump::MqttV2PumpConfig;
use knowbee_yeonjang::mqtt_v2_connection::{
    MqttV2BrokerCredentials, MqttV2ConnectionConfig, build_mqtt_v2_connection,
};
use knowbee_yeonjang::mqtt_v2_crypto::{MqttV2HmacCrypto, V2HmacKeySnapshot};
use knowbee_yeonjang::mqtt_v2_runtime_composition::{
    MqttV2RuntimeBuildError, MqttV2RuntimeClock, MqttV2RuntimeConfig, MqttV2RuntimeDependencies,
    start_mqtt_v2_runtime,
};
use knowbee_yeonjang::mqtt_v2_topics::MqttV2TopicSet;
use knowbee_yeonjang::permission_policy::{
    PermissionPolicySnapshot, PolicyCapability, PolicyDecision, PolicyResourceConstraint,
    PolicyTransition, PolicyUpdateCommand, apply_policy_update,
};
use knowbee_yeonjang::platform_execution::ExecutionFailure;
use knowbee_yeonjang::platform_operation::{
    BoundPlatformOperation, PlatformPreflightReceipt, PreflightObservation,
    PreflightPermissionState, TargetPlatform,
};
use knowbee_yeonjang::platform_port::{
    PlatformCapabilityPort, PlatformCaptureArtifactReceipt, PlatformEffectReceipt,
};
use knowbee_yeonjang::policy_repository::{PermissionPolicyReader, PolicySnapshotRead};
use knowbee_yeonjang::protocol_v2::parse_v2_command;
use knowbee_yeonjang::protocol_v2_artifact::parse_v2_artifact_control;
use knowbee_yeonjang::protocol_v2_capabilities::{V2CapabilitiesAdmission, parse_v2_capabilities};
use knowbee_yeonjang::protocol_v2_permission_query::parse_v2_capture_permission_query;
use knowbee_yeonjang::protocol_v2_status::{V2StatusAdmission, V2StatusState, parse_v2_status};
use knowbee_yeonjang::protocol_v2_terminal::V2ResponseSigner;
use knowbee_yeonjang::v2_delivery_receipt::DurableV2DeliveryRepository;
use knowbee_yeonjang::v2_terminal_repository::DurableV2TerminalRepository;

// A fresh macOS test binary can spend several seconds in executable policy
// inspection before the runtime reaches its first MQTT CONNECT. Keep that
// cold-start allowance confined to the first network observation; connected
// session assertions retain their tighter per-operation budgets below.
const CONTROLLED_INITIAL_CONNECTION_BUDGET: Duration = Duration::from_secs(20);

#[test]
fn runtime_config_binds_connection_topics_target_and_signing_identity_once() {
    let connection = MqttV2ConnectionConfig::new(
        "127.0.0.1",
        1883,
        "instance-a",
        "session-a",
        5,
        8,
        MqttTransportSecurity::LoopbackPlaintext,
    )
    .expect("connection")
    .with_credentials(broker_credentials());
    let topics = MqttV2TopicSet::new("instance-a", "session-a", "requester-a").expect("topics");
    let config = MqttV2RuntimeConfig::new(
        connection,
        topics,
        format!("sha256:{}", "34".repeat(32)),
        TargetPlatform::Macos,
        "instance-a",
        "response-key",
        "requester-a",
        30_000,
        64,
        1_000,
        MqttV2PumpConfig::new(8).expect("pump config"),
    )
    .expect("runtime config");

    assert_eq!(config.instance_id(), "instance-a");
    assert_eq!(config.session_id(), "session-a");
    assert_eq!(config.requester_id(), "requester-a");
    assert!(build_mqtt_v2_connection(config.connection()).is_ok());
}

#[test]
fn mismatched_or_invalid_runtime_identity_fails_before_connection_creation() {
    let connection = MqttV2ConnectionConfig::new(
        "127.0.0.1",
        1883,
        "instance-a",
        "session-a",
        5,
        8,
        MqttTransportSecurity::LoopbackPlaintext,
    )
    .expect("connection")
    .with_credentials(broker_credentials());
    let wrong_topics =
        MqttV2TopicSet::new("instance-b", "session-a", "requester-a").expect("topics");
    assert!(matches!(
        MqttV2RuntimeConfig::new(
            connection,
            wrong_topics,
            format!("sha256:{}", "34".repeat(32)),
            TargetPlatform::Macos,
            "instance-a",
            "response-key",
            "requester-a",
            30_000,
            64,
            1_000,
            MqttV2PumpConfig::new(8).expect("pump config"),
        ),
        Err(MqttV2RuntimeBuildError::IdentityMismatch)
    ));
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn production_builder_owns_signed_command_pump_and_deterministic_shutdown() {
    let topics = MqttV2TopicSet::new("instance-a", "session-a", "requester-a").expect("topics");
    let root = temporary_root();
    let artifacts = ArtifactRuntimeComposition::bootstrap(
        ArtifactRuntimeConfig::new(&root, "instance-a", 32, 4 * 1024 * 1024, 600_000),
        1_000,
    )
    .expect("artifacts");
    let artifact_repository = artifacts.lifecycle_store();
    let bytes = large_camera_bytes();
    let capture_binding = CaptureArtifactBinding::new(
        "command-v2",
        "operation-v2",
        "session-a",
        &format!("sha256:{}", "34".repeat(32)),
        "idempotency-v2",
    )
    .expect("capture binding");
    let lease = artifacts
        .artifact_store()
        .allocate(CaptureArtifactKind::CameraJpeg, &capture_binding)
        .expect("artifact lease");
    let artifact_ref = lease.artifact_ref();
    let metadata = knowbee_yeonjang::capture_artifact_postcheck::post_check_capture_bytes(
        CaptureArtifactKind::CameraJpeg,
        &bytes,
    )
    .expect("expected metadata");
    let artifact_binding = ArtifactBinding::new(
        &artifact_ref,
        "requester-a",
        "request-v2",
        "operation-v2",
        metadata.sha256_digest(),
        metadata.size_bytes(),
        1_000,
        601_000,
    )
    .expect("artifact binding");
    let client_signer = Arc::new(
        MqttV2HmacCrypto::new(
            key("unused", "unused", b"unused-secret-123".to_vec()),
            key("issuer-v2", "key-v2", b"command-secret-1".to_vec()),
        )
        .expect("client signer"),
    );
    let command = signed_command(&topics, client_signer.as_ref());
    let fetch = signed_artifact_control(
        &topics.control(),
        artifact_fetch(&artifact_binding),
        &topics,
        client_signer.as_ref(),
    );
    let ack_topic = topics.artifact_ack("transfer-a").expect("ack topic");
    let ack = signed_artifact_control(
        &ack_topic,
        artifact_ack(&artifact_binding),
        &topics,
        client_signer.as_ref(),
    );
    let broker = ControlledMqttBroker::start_command_artifact(
        topics.command(),
        topics.response(),
        topics.control(),
        topics.artifact_chunk("transfer-a").expect("chunk topic"),
        ack_topic,
        command,
        fetch,
        ack,
        2,
    )
    .expect("broker");
    let connection = MqttV2ConnectionConfig::new(
        "127.0.0.1",
        broker.port(),
        "instance-a",
        "session-a",
        5,
        8,
        MqttTransportSecurity::LoopbackPlaintext,
    )
    .expect("connection")
    .with_credentials(broker_credentials());
    let config = MqttV2RuntimeConfig::new(
        connection,
        topics,
        format!("sha256:{}", "34".repeat(32)),
        TargetPlatform::Macos,
        "instance-a",
        "response-key",
        "requester-a",
        30_000,
        64,
        1_000,
        MqttV2PumpConfig::new(8).expect("pump"),
    )
    .expect("runtime config");
    let effects = Arc::new(AtomicUsize::new(0));
    let crypto = Arc::new(
        MqttV2HmacCrypto::new(
            key("issuer-v2", "key-v2", b"command-secret-1".to_vec()),
            key("instance-a", "response-key", b"response-secret1".to_vec()),
        )
        .expect("runtime crypto"),
    );
    let dependencies = MqttV2RuntimeDependencies::new(
        crypto,
        Arc::new(
            DurableV2TerminalRepository::bootstrap(32, storage()).expect("terminal repository"),
        ),
        Arc::new(
            DurableV2DeliveryRepository::bootstrap(32, storage()).expect("delivery repository"),
        ),
        Arc::new(
            DurableCancellationReceiptRepository::bootstrap(32, storage())
                .expect("cancellation repository"),
        ),
        Arc::new(AllowedPolicy),
        Arc::new(LeaseArtifactPort::new(lease, bytes, Arc::clone(&effects))),
        artifacts,
        Arc::new(FixedClock),
    );

    let runtime = start_mqtt_v2_runtime(config, dependencies).expect("runtime start");
    let response = broker
        .wait_for_response(CONTROLLED_INITIAL_CONNECTION_BUDGET)
        .expect("signed response");
    assert_eq!(response["schema_id"], "yeonjang.response.v2");
    assert_eq!(
        response["payload"]["terminal"]["execution_outcome"],
        "succeeded"
    );
    assert_eq!(response["payload"]["schema_version"], 3);
    assert_eq!(response["payload"]["artifact"]["artifactRef"], artifact_ref);
    assert_ne!(response["authorization"]["signature"], "");
    assert_eq!(effects.load(Ordering::SeqCst), 1);
    assert_eq!(
        runtime.connection_state(),
        knowbee_yeonjang::mqtt_v2_runtime_composition::MqttV2RuntimeConnectionState::Connected
    );
    for _ in 0..2 {
        let chunk = broker
            .wait_for_response(Duration::from_secs(5))
            .expect("artifact chunk");
        assert_eq!(chunk["magic"], "YAC2");
    }
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            if matches!(
                artifact_repository.read(artifact_binding.artifact_ref()),
                ArtifactLifecycleRead::Found(lifecycle)
                    if matches!(lifecycle.state(), ArtifactLifecycleState::Acknowledged { .. })
                        && matches!(
                            lifecycle.cleanup_status(),
                            knowbee_yeonjang::artifact_lifecycle::ArtifactCleanupStatus::Completed {
                                ..
                            }
                        )
            ) {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("artifact acknowledgement and cleanup");
    assert_eq!(
        runtime.shutdown().await.expect("shutdown"),
        knowbee_yeonjang::mqtt_v2_command_pump::MqttV2PumpOutcome::Stopped
    );
    broker.stop().expect("broker stop");
    let _ = std::fs::remove_dir_all(root);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn production_control_route_reads_permissions_without_platform_effect() {
    let topics = MqttV2TopicSet::new("instance-a", "session-a", "requester-a").expect("topics");
    let client_signer = MqttV2HmacCrypto::new(
        key("unused", "unused", b"unused-secret-123".to_vec()),
        key("requester-a", "key-v2", b"command-secret-1".to_vec()),
    )
    .expect("client signer");
    let query = signed_permission_query(&topics, &client_signer);
    let broker = ControlledMqttBroker::start_control(topics.control(), topics.response(), query)
        .expect("broker");
    let root = temporary_root();
    let artifacts = ArtifactRuntimeComposition::bootstrap(
        ArtifactRuntimeConfig::new(&root, "instance-a", 16, 1024 * 1024, 600_000),
        1_000,
    )
    .expect("artifacts");
    let connection = MqttV2ConnectionConfig::new(
        "127.0.0.1",
        broker.port(),
        "instance-a",
        "session-a",
        5,
        8,
        MqttTransportSecurity::LoopbackPlaintext,
    )
    .expect("connection")
    .with_credentials(broker_credentials());
    let config = MqttV2RuntimeConfig::new(
        connection,
        topics,
        format!("sha256:{}", "34".repeat(32)),
        TargetPlatform::Macos,
        "instance-a",
        "response-key",
        "requester-a",
        30_000,
        64,
        1_000,
        MqttV2PumpConfig::new(8).expect("pump"),
    )
    .expect("runtime config");
    let crypto = Arc::new(
        MqttV2HmacCrypto::new(
            key("requester-a", "key-v2", b"command-secret-1".to_vec()),
            key("instance-a", "response-key", b"response-secret1".to_vec()),
        )
        .expect("runtime crypto"),
    );
    let dependencies = MqttV2RuntimeDependencies::new(
        crypto,
        Arc::new(
            DurableV2TerminalRepository::bootstrap(16, storage()).expect("terminal repository"),
        ),
        Arc::new(
            DurableV2DeliveryRepository::bootstrap(16, storage()).expect("delivery repository"),
        ),
        Arc::new(
            DurableCancellationReceiptRepository::bootstrap(16, storage())
                .expect("cancellation repository"),
        ),
        Arc::new(AllowedPolicy),
        Arc::new(UnusedPlatform),
        artifacts,
        Arc::new(FixedClock),
    )
    .with_permission_observation(Arc::new(PermissionObservationFixture));
    let runtime = start_mqtt_v2_runtime(config, dependencies).expect("runtime");
    let response = broker
        .wait_for_response(CONTROLLED_INITIAL_CONNECTION_BUDGET)
        .expect("permission response");
    assert_eq!(
        response["schema_id"],
        "yeonjang.capture-permission-response.v2"
    );
    assert_eq!(response["payload"]["outcome"], "available");
    assert_eq!(
        response["payload"]["permissions"][0]["osPermission"],
        "granted"
    );
    assert_eq!(
        response["payload"]["permissions"][1]["osPermission"],
        "denied"
    );
    runtime.shutdown().await.expect("shutdown");
    broker.stop().expect("broker stop");
    let _ = std::fs::remove_dir_all(root);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn production_builder_binds_will_then_publishes_online_and_graceful_offline() {
    let topics = MqttV2TopicSet::new("instance-a", "session-a", "requester-a").expect("topics");
    let root = temporary_root();
    let artifacts = ArtifactRuntimeComposition::bootstrap(
        ArtifactRuntimeConfig::new(&root, "instance-a", 16, 1024 * 1024, 600_000),
        1_000,
    )
    .expect("artifacts");
    let broker =
        ControlledMqttBroker::start_status_and_capabilities(topics.status(), topics.capabilities())
            .expect("status broker");
    let connection = MqttV2ConnectionConfig::new(
        "127.0.0.1",
        broker.port(),
        "instance-a",
        "session-a",
        5,
        8,
        MqttTransportSecurity::LoopbackPlaintext,
    )
    .expect("connection")
    .with_credentials(broker_credentials());
    let config = MqttV2RuntimeConfig::new(
        connection,
        topics.clone(),
        format!("sha256:{}", "34".repeat(32)),
        TargetPlatform::Macos,
        "instance-a",
        "response-key",
        "requester-a",
        3_000,
        64,
        1_000,
        MqttV2PumpConfig::new(8).expect("pump"),
    )
    .expect("runtime config");
    let crypto = Arc::new(
        MqttV2HmacCrypto::new(
            key("issuer-v2", "key-v2", b"command-secret-1".to_vec()),
            key("instance-a", "response-key", b"response-secret1".to_vec()),
        )
        .expect("runtime crypto"),
    );
    let status_verifier = MqttV2HmacCrypto::new(
        key("instance-a", "response-key", b"response-secret1".to_vec()),
        key("unused", "unused", b"unused-secret-123".to_vec()),
    )
    .expect("status verifier");
    let dependencies = MqttV2RuntimeDependencies::new(
        crypto.clone(),
        Arc::new(
            DurableV2TerminalRepository::bootstrap(16, storage()).expect("terminal repository"),
        ),
        Arc::new(
            DurableV2DeliveryRepository::bootstrap(16, storage()).expect("delivery repository"),
        ),
        Arc::new(
            DurableCancellationReceiptRepository::bootstrap(16, storage())
                .expect("cancellation repository"),
        ),
        Arc::new(AllowedPolicy),
        Arc::new(UnusedPlatform),
        artifacts,
        Arc::new(FixedClock),
    )
    .with_capability_snapshot(V2PlatformCapabilitySnapshot::new(
        TargetPlatform::Macos,
        true,
        false,
    ));

    let runtime = start_mqtt_v2_runtime(config, dependencies).expect("runtime");
    // Let the owned pump reach its first EventLoop poll before this test
    // enters a synchronous observation boundary.
    tokio::task::yield_now().await;
    let will = match tokio::task::block_in_place(|| {
        broker.wait_for_response(CONTROLLED_INITIAL_CONNECTION_BUDGET)
    }) {
        Ok(will) => will,
        Err(error) => {
            let finished = runtime.is_finished();
            let runtime_outcome = if finished {
                format!("{:?}", runtime.shutdown().await)
            } else {
                drop(runtime);
                "still_running".to_string()
            };
            let broker_outcome = broker.stop();
            panic!(
                "CONNECT will: {error}; runtime_finished={finished}; runtime_outcome={runtime_outcome}; broker_outcome={broker_outcome:?}"
            );
        }
    };
    assert_eq!(will["kind"], "will");
    assert_eq!(will["retained"], true);
    assert_eq!(will["payload"]["payload"]["state"], "offline");
    assert_eq!(
        will["payload"]["payload"]["reason"],
        "unexpected_disconnect"
    );
    let will_bytes = serde_json::to_vec(&will["payload"]).expect("will bytes");
    let parsed_will =
        parse_v2_status(topics.status(), &will_bytes, true, 1_000, &topics).expect("parse will");
    V2StatusAdmission::new(&status_verifier)
        .admit(&parsed_will)
        .expect("will signature");
    let online = match tokio::task::block_in_place(|| {
        broker.wait_for_response(Duration::from_secs(5))
    }) {
        Ok(online) => online,
        Err(error) => {
            let finished = runtime.is_finished();
            drop(runtime);
            let broker_outcome = broker.stop();
            panic!(
                "online status: {error}; runtime_finished={finished}; broker_outcome={broker_outcome:?}"
            );
        }
    };
    assert_eq!(online["retained"], true);
    assert_eq!(online["payload"]["payload"]["state"], "online");
    let online_bytes = serde_json::to_vec(&online["payload"]).expect("online bytes");
    let parsed_online = parse_v2_status(topics.status(), &online_bytes, true, 1_000, &topics)
        .expect("parse online");
    V2StatusAdmission::new(&status_verifier)
        .admit(&parsed_online)
        .expect("online signature");
    assert_eq!(parsed_online.state(), V2StatusState::Online);
    let capabilities = match tokio::task::block_in_place(|| {
        broker.wait_for_response(Duration::from_secs(5))
    }) {
        Ok(capabilities) => capabilities,
        Err(error) => {
            let finished = runtime.is_finished();
            drop(runtime);
            let broker_outcome = broker.stop();
            panic!(
                "capabilities projection: {error}; runtime_finished={finished}; broker_outcome={broker_outcome:?}"
            );
        }
    };
    assert_eq!(capabilities["topic"], topics.capabilities());
    assert_eq!(
        capabilities["payload"]["payload"]["advertisedMethods"],
        serde_json::json!(["camera.capture"])
    );
    let capabilities_bytes =
        serde_json::to_vec(&capabilities["payload"]).expect("capabilities bytes");
    let parsed_capabilities = parse_v2_capabilities(
        topics.capabilities(),
        &capabilities_bytes,
        true,
        1_000,
        &topics,
    )
    .expect("parse capabilities");
    V2CapabilitiesAdmission::new(&status_verifier)
        .admit(&parsed_capabilities)
        .expect("capabilities signature");
    let refreshed =
        tokio::task::block_in_place(|| broker.wait_for_response(Duration::from_secs(5)))
            .expect("refreshed online status");
    assert_eq!(refreshed["payload"]["payload"]["state"], "online");
    let refreshed_bytes = serde_json::to_vec(&refreshed["payload"]).expect("refreshed bytes");
    let parsed_refreshed = parse_v2_status(topics.status(), &refreshed_bytes, true, 1_000, &topics)
        .expect("parse refreshed");
    V2StatusAdmission::new(&status_verifier)
        .admit(&parsed_refreshed)
        .expect("refreshed signature");
    assert!(parsed_refreshed.sequence() > parsed_online.sequence());

    assert_eq!(
        runtime.shutdown().await.expect("shutdown"),
        knowbee_yeonjang::mqtt_v2_command_pump::MqttV2PumpOutcome::Stopped
    );
    let mut offline = None;
    let offline_deadline = Instant::now() + Duration::from_secs(5);
    while Instant::now() < offline_deadline {
        let remaining = offline_deadline.saturating_duration_since(Instant::now());
        let status = tokio::task::block_in_place(|| broker.wait_for_response(remaining))
            .expect("shutdown status");
        if status["payload"]["payload"]["state"] == "offline" {
            offline = Some(status);
            break;
        }
    }
    let offline = offline.expect("graceful offline status");
    assert_eq!(offline["payload"]["payload"]["state"], "offline");
    assert_eq!(offline["payload"]["payload"]["reason"], "graceful_shutdown");
    let offline_bytes = serde_json::to_vec(&offline["payload"]).expect("offline bytes");
    let parsed_offline = parse_v2_status(topics.status(), &offline_bytes, true, 1_000, &topics)
        .expect("parse offline");
    V2StatusAdmission::new(&status_verifier)
        .admit(&parsed_offline)
        .expect("offline signature");
    broker.stop().expect("broker stop");
    let _ = std::fs::remove_dir_all(root);
}

fn signed_command(topics: &MqttV2TopicSet, signer: &MqttV2HmacCrypto) -> serde_json::Value {
    let mut value = serde_json::json!({
        "protocol_version": 2, "schema_id": "yeonjang.command.v2",
        "message_kind": "command", "message_id": "message-v2",
        "request_id": "request-v2", "command_id": "command-v2",
        "operation_id": "operation-v2", "correlation_id": "correlation-v2",
        "causation_id": "causation-v2", "requester_id": "requester-a",
        "target_instance_id": "instance-a", "target_session_id": "session-a",
        "target_fingerprint": format!("sha256:{}", "34".repeat(32)),
        "idempotency_key": "idempotency-v2", "cancellation_id": "cancel-v2",
        "cancel_token": "cancel-token-v2", "issued_at": 900, "expires_at": 2_000,
        "sequence": 1,
        "payload": {"method": "camera.capture", "params": {"capture_timeout_ms": 1_000}},
        "authorization": {
            "schema_version": 1, "authorization_id": "authorization-v2",
            "issuer": "issuer-v2", "key_id": "key-v2", "audience": "yeonjang-v2",
            "scope": "effect.execute", "method": "camera.capture", "resource": "camera",
            "requester_id": "requester-a", "command_id": "command-v2",
            "operation_id": "operation-v2", "target_instance_id": "instance-a",
            "target_session_id": "session-a",
            "target_fingerprint": format!("sha256:{}", "34".repeat(32)),
            "idempotency_key": "idempotency-v2", "cancellation_id": "cancel-v2",
            "cancel_token": "cancel-token-v2", "expires_at": 2_000,
            "nonce": "nonce-v2", "signature": "00".repeat(32)
        }
    });
    let bytes = serde_json::to_vec(&value).expect("command bytes");
    let parsed = parse_v2_command(topics.command(), &bytes, 1_000, topics).expect("command parse");
    value["authorization"]["signature"] = V2ResponseSigner::sign(
        signer,
        "issuer-v2",
        "key-v2",
        &parsed.authorization_signing_bytes(),
    )
    .expect("command signature")
    .into();
    value
}

fn signed_artifact_control(
    topic: &str,
    mut value: serde_json::Value,
    topics: &MqttV2TopicSet,
    signer: &MqttV2HmacCrypto,
) -> serde_json::Value {
    let bytes = serde_json::to_vec(&value).expect("artifact control bytes");
    let parsed = parse_v2_artifact_control(topic, &bytes, false, 1_000, topics)
        .expect("artifact control parse");
    value["authorization"]["signature"] = V2ResponseSigner::sign(
        signer,
        "issuer-v2",
        "key-v2",
        &parsed.authorization_signing_bytes(),
    )
    .expect("artifact signature")
    .into();
    value
}

fn artifact_fetch(binding: &ArtifactBinding) -> serde_json::Value {
    artifact_control(
        "fetch",
        serde_json::json!({
            "artifact": "artifact.fetch",
            "params": {
                "artifact_ref": binding.artifact_ref(),
                "owner_request_id": binding.owner_request_id(),
                "owner_operation_id": binding.owner_operation_id(),
                "expected_revision": 0,
                "transfer_id": "transfer-a",
                "chunk_payload_bytes": 262144
            }
        }),
        binding,
        None,
        Some(262_144),
    )
}

fn artifact_ack(binding: &ArtifactBinding) -> serde_json::Value {
    artifact_control(
        "ack",
        serde_json::json!({
            "artifact": "artifact.ack",
            "params": {
                "artifact_ref": binding.artifact_ref(),
                "owner_request_id": binding.owner_request_id(),
                "owner_operation_id": binding.owner_operation_id(),
                "expected_revision": 2,
                "transfer_id": "transfer-a",
                "full_digest": binding.full_digest()
            }
        }),
        binding,
        Some(binding.full_digest()),
        None,
    )
}

fn artifact_control(
    variant: &str,
    payload: serde_json::Value,
    binding: &ArtifactBinding,
    full_digest: Option<&str>,
    chunk_payload_bytes: Option<u32>,
) -> serde_json::Value {
    serde_json::json!({
        "protocol_version": 2, "schema_id": "yeonjang.artifact-control.v2",
        "message_kind": "control", "message_id": format!("artifact-message-{variant}"),
        "request_id": format!("artifact-request-{variant}"),
        "command_id": format!("artifact-command-{variant}"),
        "operation_id": format!("artifact-operation-{variant}"),
        "correlation_id": "artifact-correlation", "causation_id": "message-v2",
        "requester_id": "requester-a", "target_instance_id": "instance-a",
        "target_session_id": "session-a",
        "target_fingerprint": format!("sha256:{}", "34".repeat(32)),
        "idempotency_key": format!("artifact-idem-{variant}"),
        "issued_at": 900, "expires_at": 2_000, "sequence": 1,
        "payload": payload,
        "authorization": {
            "schema_version": 1,
            "authorization_id": format!("artifact-authorization-{variant}"),
            "issuer": "issuer-v2", "key_id": "key-v2", "audience": "instance-a",
            "scope": "artifact.read", "requester_id": "requester-a",
            "command_id": format!("artifact-command-{variant}"),
            "operation_id": format!("artifact-operation-{variant}"),
            "target_instance_id": "instance-a", "target_session_id": "session-a",
            "target_fingerprint": format!("sha256:{}", "34".repeat(32)),
            "idempotency_key": format!("artifact-idem-{variant}"),
            "artifact_ref": binding.artifact_ref(),
            "owner_request_id": binding.owner_request_id(),
            "owner_operation_id": binding.owner_operation_id(),
            "transfer_id": "transfer-a",
            "expected_revision": if full_digest.is_some() { 2 } else { 0 },
            "full_digest": full_digest,
            "chunk_payload_bytes": chunk_payload_bytes,
            "expires_at": 2_000, "nonce": format!("artifact-nonce-{variant}"),
            "signature": "00".repeat(32)
        }
    })
}

fn key(issuer: &str, key_id: &str, secret: Vec<u8>) -> V2HmacKeySnapshot {
    V2HmacKeySnapshot::new(issuer, key_id, secret).expect("key")
}

fn broker_credentials() -> MqttV2BrokerCredentials {
    MqttV2BrokerCredentials::new("broker-user", b"broker-secret-1".to_vec())
        .expect("broker credentials")
}

fn signed_permission_query(
    topics: &MqttV2TopicSet,
    signer: &MqttV2HmacCrypto,
) -> serde_json::Value {
    let mut value = serde_json::json!({
        "protocol_version": 2, "schema_id": "yeonjang.control.v2",
        "message_kind": "control", "message_id": "permission-message",
        "request_id": "permission-request", "command_id": "permission-command",
        "operation_id": "permission-operation", "correlation_id": "permission-correlation",
        "causation_id": "permission-causation", "requester_id": "requester-a",
        "target_instance_id": "instance-a", "target_session_id": "session-a",
        "target_fingerprint": format!("sha256:{}", "34".repeat(32)),
        "idempotency_key": "permission-idempotency", "issued_at": 900,
        "expires_at": 2_000, "sequence": 1,
        "payload": {"control": "capture.permission.get", "params": {}},
        "authorization": {
            "schema_version": 1, "authorization_id": "permission-authorization",
            "issuer": "requester-a", "key_id": "key-v2", "audience": "instance-a",
            "scope": "permission.read", "requester_id": "requester-a",
            "command_id": "permission-command", "operation_id": "permission-operation",
            "target_instance_id": "instance-a", "target_session_id": "session-a",
            "target_fingerprint": format!("sha256:{}", "34".repeat(32)),
            "idempotency_key": "permission-idempotency", "expires_at": 2_000,
            "nonce": "permission-nonce", "signature": "00".repeat(32)
        }
    });
    let parsed = parse_v2_capture_permission_query(
        topics.control(),
        &serde_json::to_vec(&value).expect("query bytes"),
        false,
        1_000,
        topics,
    )
    .expect("query parse");
    value["authorization"]["signature"] = signer
        .sign(
            "requester-a",
            "key-v2",
            &parsed.authorization_signing_bytes(),
        )
        .expect("query signature")
        .into();
    value
}

struct FixedClock;

impl MqttV2RuntimeClock for FixedClock {
    fn now_ms(&self) -> i64 {
        1_000
    }
}

struct LeaseArtifactPort {
    lease: Mutex<Option<CaptureArtifactLease>>,
    bytes: Vec<u8>,
    effects: Arc<AtomicUsize>,
}

struct UnusedPlatform;

impl PlatformCapabilityPort for UnusedPlatform {
    fn preflight(
        &self,
        _: &BoundPlatformOperation,
    ) -> Result<PlatformPreflightReceipt, ExecutionFailure> {
        panic!("status-only runtime must not invoke platform preflight")
    }

    fn execute(
        &self,
        _: &BoundPlatformOperation,
        _: &PlatformPreflightReceipt,
    ) -> Result<PlatformEffectReceipt, ExecutionFailure> {
        panic!("status-only runtime must not invoke platform effect")
    }
}

struct PermissionObservationFixture;

impl CapturePermissionObservationPort for PermissionObservationFixture {
    fn observe(&self) -> CapturePermissionObservationRead {
        CapturePermissionObservationRead::Snapshot {
            availability: CaptureCapabilityAvailability {
                camera: true,
                screen: true,
            },
            observations: CapturePermissionObservations {
                camera: Some(PreflightPermissionState::Granted),
                screen: Some(PreflightPermissionState::Denied),
            },
        }
    }
}

impl LeaseArtifactPort {
    fn new(lease: CaptureArtifactLease, bytes: Vec<u8>, effects: Arc<AtomicUsize>) -> Self {
        Self {
            lease: Mutex::new(Some(lease)),
            bytes,
            effects,
        }
    }
}

impl PlatformCapabilityPort for LeaseArtifactPort {
    fn preflight(
        &self,
        operation: &BoundPlatformOperation,
    ) -> Result<PlatformPreflightReceipt, ExecutionFailure> {
        PlatformPreflightReceipt::for_operation(
            operation,
            PreflightObservation {
                capability_available: true,
                permission: PreflightPermissionState::Granted,
                resource_fingerprint: "camera-production".to_string(),
                observed_at_ms: 1_000,
            },
        )
        .map_err(|error| panic!("preflight fixture: {error}"))
    }

    fn execute(
        &self,
        operation: &BoundPlatformOperation,
        _: &PlatformPreflightReceipt,
    ) -> Result<PlatformEffectReceipt, ExecutionFailure> {
        self.effects.fetch_add(1, Ordering::SeqCst);
        let lease = self
            .lease
            .lock()
            .expect("artifact lease")
            .take()
            .expect("single effect");
        std::fs::write(lease.output_path(), &self.bytes).expect("artifact bytes");
        let persisted = lease.commit().expect("artifact commit");
        let artifact = PlatformCaptureArtifactReceipt::new(
            persisted.artifact_ref(),
            persisted.metadata().kind(),
            persisted.metadata().size_bytes(),
            persisted.metadata().sha256_digest(),
        )
        .expect("artifact receipt");
        PlatformEffectReceipt::for_capture_operation(operation, artifact, 1_000)
            .map_err(|error| panic!("effect receipt: {error}"))
    }
}

struct AllowedPolicy;

impl PermissionPolicyReader for AllowedPolicy {
    fn snapshot(&self) -> PolicySnapshotRead {
        let initial = PermissionPolicySnapshot::new("instance-a").expect("policy");
        let update = PolicyUpdateCommand::new(
            "instance-a",
            0,
            PolicyCapability::CameraCapture,
            PolicyDecision::Allowed,
            PolicyResourceConstraint::Any,
        )
        .expect("update");
        match apply_policy_update(&initial, &update) {
            PolicyTransition::Applied { snapshot, .. } => PolicySnapshotRead::Snapshot(snapshot),
            other => panic!("policy fixture: {other:?}"),
        }
    }
}

#[derive(Default)]
struct MemoryStorage(Mutex<(u64, Vec<Vec<u8>>)>);

impl DurableRecordStorage for MemoryStorage {
    fn read(&self) -> RawStoreRead {
        let state = self.0.lock().expect("storage");
        if state.1.is_empty() {
            RawStoreRead::Missing { revision: state.0 }
        } else {
            RawStoreRead::Records {
                revision: state.0,
                records: state.1.clone(),
            }
        }
    }

    fn compare_and_swap(&self, expected_revision: u64, records: Vec<Vec<u8>>) -> RawStoreWrite {
        let mut state = self.0.lock().expect("storage");
        if state.0 != expected_revision {
            return RawStoreWrite::Conflict;
        }
        state.0 += 1;
        state.1 = records;
        RawStoreWrite::Written { revision: state.0 }
    }
}

fn storage() -> Arc<dyn DurableRecordStorage> {
    Arc::new(MemoryStorage::default())
}

fn temporary_root() -> std::path::PathBuf {
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    std::env::temp_dir().join(format!(
        "knowbee-v2-runtime-{}-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    ))
}

fn large_camera_bytes() -> Vec<u8> {
    let mut bytes = vec![
        0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x01, 0x00, 0x01, 0x03, 0x01, 0x11, 0x00,
        0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xda, 0x00, 0x02,
    ];
    bytes.resize(300_000, 7);
    bytes.extend_from_slice(&[0xff, 0xd9]);
    bytes
}
