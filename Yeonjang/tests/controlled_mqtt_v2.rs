#![recursion_limit = "256"]

//! Direct MQTT v2 reference-client and owned-pump integration contracts.
//!
//! All peers are test-only loopback owners. Their connection budget covers
//! cold binary inspection, while effect and terminal assertions remain
//! explicit and independent from transport readiness.

#[allow(dead_code)]
#[path = "support/controlled_mqtt_broker.rs"]
mod controlled_mqtt_broker;

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, mpsc};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use controlled_mqtt_broker::ControlledMqttBroker;
use knowbee_yeonjang::artifact_lifecycle::{ArtifactBinding, ArtifactLifecycleState};
use knowbee_yeonjang::artifact_repository::{ArtifactLifecycleRead, ArtifactRepositoryResult};
use knowbee_yeonjang::artifact_runtime_composition::{
    ArtifactRuntimeComposition, ArtifactRuntimeConfig,
};
use knowbee_yeonjang::artifact_sink::{
    CaptureArtifactBinding, CaptureArtifactKind, CaptureArtifactLease, CaptureArtifactSink,
};
use knowbee_yeonjang::authorization::InMemoryAuthorizationReplayGuard;
use knowbee_yeonjang::blocking_resource_admission::BlockingExecutionResourceAdmission;
use knowbee_yeonjang::cancellation::ActiveCommandRegistry;
use knowbee_yeonjang::durable_completed_store::{
    DurableRecordStorage, RawStoreRead, RawStoreWrite,
};
use knowbee_yeonjang::execute_capability::{ExecuteCapabilityUseCase, ExecutionClock};
use knowbee_yeonjang::mqtt_v2_command_pump::{
    MqttV2CommandPump, MqttV2PumpConfig, MqttV2PumpConfigError, MqttV2PumpContext,
    MqttV2PumpContextError, MqttV2PumpContextProvider, MqttV2PumpDependencies, MqttV2PumpError,
    MqttV2PumpOutcome,
};
use knowbee_yeonjang::mqtt_v2_control_adapter::MqttV2ControlAdapter;
use knowbee_yeonjang::mqtt_v2_control_router::MqttV2ControlRouter;
use knowbee_yeonjang::mqtt_v2_direct_handler::MqttV2CommandHandler;
use knowbee_yeonjang::mqtt_v2_policy_admin_adapter::MqttV2PolicyAdminAdapter;
use knowbee_yeonjang::mqtt_v2_receipt_query_adapter::MqttV2ReceiptQueryAdapter;
use knowbee_yeonjang::mqtt_v2_response_ack_adapter::MqttV2ResponseAckAdapter;
use knowbee_yeonjang::mqtt_v2_response_adapter::{
    MqttV2InboundCommand, MqttV2ResponseAdapter, MqttV2ResponseAdapterResult,
};
use knowbee_yeonjang::mqtt_v2_topics::{MqttQos, MqttV2TopicSet};
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
use knowbee_yeonjang::policy_admin::{
    PolicyAdminAuthorizationDecision, PolicyAdminAuthorizationGrant,
    PolicyAdminAuthorizationVerifier, PolicyAdminUseCase,
};
use knowbee_yeonjang::policy_repository::{
    DurablePermissionPolicyRepository, PermissionPolicyReader, PolicySnapshotRead,
};
use knowbee_yeonjang::protocol_v2::V2CommandSignatureVerifier;
use knowbee_yeonjang::protocol_v2_artifact::V2ArtifactSignatureVerifier;
use knowbee_yeonjang::protocol_v2_control::V2ControlSignatureVerifier;
use knowbee_yeonjang::protocol_v2_operation::V2OperationBindingContext;
use knowbee_yeonjang::protocol_v2_policy_admin::V2PolicyAdminSignatureVerifier;
use knowbee_yeonjang::protocol_v2_receipt_query::V2ReceiptQuerySignatureVerifier;
use knowbee_yeonjang::protocol_v2_response_ack::V2ResponseAckSignatureVerifier;
use knowbee_yeonjang::protocol_v2_terminal::{
    V2ResponseSigner, V2ResponseSignerError, V2ResponseSigningContext, V2TerminalResponseContent,
};
use knowbee_yeonjang::stage_timing::{
    RuntimeStage, StageTimingClock, StageTimingEvidence, StageTimingRecorder, StageTimingSink,
    StageTimingWriteError,
};
use knowbee_yeonjang::v2_cancel_use_case::{V2CancelOwnerScope, V2CancelUseCase};
use knowbee_yeonjang::v2_delivery_receipt::{
    DurableV2DeliveryRepository, V2DeliveryAckBinding, V2DeliveryAckStoreResult, V2DeliveryReceipt,
    V2DeliveryReceiptState, V2DeliveryReceiptStore,
};
use knowbee_yeonjang::v2_receipt_query_use_case::{
    V2ReceiptQueryOwnerScope, V2ReceiptQueryUseCase,
};
use knowbee_yeonjang::v2_response_ack_use_case::{V2ResponseAckOwnerScope, V2ResponseAckUseCase};
use knowbee_yeonjang::v2_terminal_repository::{
    InMemoryV2TerminalRepository, V2TerminalClaim, V2TerminalComplete, V2TerminalLookup,
    V2TerminalRepository, V2TerminalScope,
};
use rumqttc::{AsyncClient, Event, EventLoop, Incoming, MqttOptions, NetworkOptions, QoS};
use tokio::sync::watch;

const CONTROLLED_NETWORK_OBSERVATION: Duration = Duration::from_secs(20);

fn controlled_client(options: MqttOptions, capacity: usize) -> (AsyncClient, EventLoop) {
    let (client, mut event_loop) = AsyncClient::new(options, capacity);
    let mut network = NetworkOptions::new();
    network.set_connection_timeout(20);
    event_loop.set_network_options(network);
    (client, event_loop)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn direct_v2_round_trip_replays_two_responses_with_one_platform_effect() {
    let topics = topics();
    let broker = ControlledMqttBroker::start_redelivery(
        topics.command(),
        topics.response(),
        valid_command(),
        2,
    )
    .expect("broker");
    let calls = Arc::new(AtomicUsize::new(0));
    let adapter = response_adapter(Arc::clone(&calls));
    let mut options = MqttOptions::new("yeonjang-v2-reference", "127.0.0.1", broker.port());
    options.set_keep_alive(Duration::from_secs(5));
    let (client, mut event_loop) = controlled_client(options, 8);
    client
        .subscribe(topics.command(), QoS::AtLeastOnce)
        .await
        .expect("subscribe");

    let mut commands = 0;
    let mut response_pubacks = 0;
    while commands < 2 || response_pubacks < 2 {
        let event = tokio::time::timeout(CONTROLLED_NETWORK_OBSERVATION, event_loop.poll())
            .await
            .expect("MQTT event timeout")
            .unwrap_or_else(|error| {
                panic!(
                    "MQTT event: {error:?}; commands={commands}; response_pubacks={response_pubacks}"
                )
            });
        match event {
            Event::Incoming(Incoming::Publish(publish)) => {
                let result = adapter.process(
                    MqttV2InboundCommand {
                        topic: publish.topic,
                        payload: publish.payload.to_vec(),
                        retained: publish.retain,
                    },
                    1_000 + commands,
                    binding(),
                    signing_context(),
                );
                let MqttV2ResponseAdapterResult::Publish(response) = result else {
                    panic!("expected publish projection");
                };
                assert_eq!(response.qos, MqttQos::AtLeastOnce);
                assert!(!response.retained);
                client
                    .publish(
                        response.topic,
                        QoS::AtLeastOnce,
                        response.retained,
                        response.payload,
                    )
                    .await
                    .expect("response enqueue");
                commands += 1;
            }
            Event::Incoming(Incoming::PubAck(_)) => response_pubacks += 1,
            _ => {}
        }
    }

    let first = broker
        .wait_for_response(Duration::from_secs(2))
        .expect("first response");
    let second = broker
        .wait_for_response(Duration::from_secs(2))
        .expect("second response");
    assert_eq!(first["schema_id"], "yeonjang.response.v2");
    assert_eq!(second["schema_id"], "yeonjang.response.v2");
    assert_eq!(first["payload"], second["payload"]);
    assert_eq!(calls.load(Ordering::SeqCst), 1);

    client.disconnect().await.expect("disconnect enqueue");
    drop(event_loop);
    broker.stop().expect("broker stop");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn owned_v2_pump_processes_and_drains_before_shutdown() {
    let topics = topics();
    let broker = ControlledMqttBroker::start_redelivery(
        topics.command(),
        topics.response(),
        valid_command(),
        1,
    )
    .expect("broker");
    let calls = Arc::new(AtomicUsize::new(0));
    let adapter = Arc::new(response_adapter(Arc::clone(&calls)));
    let mut options = MqttOptions::new("yeonjang-v2-pump", "127.0.0.1", broker.port());
    options.set_keep_alive(Duration::from_secs(5));
    let (client, event_loop) = controlled_client(options, 8);
    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let delivery_repository = test_delivery_repository();
    let stage_values = Arc::new(PumpStageValues::default());
    let pump = MqttV2CommandPump::new(
        client,
        event_loop,
        MqttV2PumpDependencies::new(
            adapter,
            Arc::new(control_router(Arc::new(ActiveCommandRegistry::default()))),
            delivery_repository.clone(),
        )
        .with_stage_timing(StageTimingRecorder::new(
            Arc::new(PumpStageClock),
            stage_values.clone(),
        )),
        Arc::new(FixedPumpContext),
        shutdown_rx,
        MqttV2PumpConfig::new(2).expect("pump config"),
    );
    let task = tokio::spawn(pump.run());

    tokio::task::yield_now().await;
    let response = broker
        .wait_for_response(CONTROLLED_NETWORK_OBSERVATION)
        .expect("pump response");
    assert_eq!(response["schema_id"], "yeonjang.response.v2");
    let receipt_id = response["receipt_id"]
        .as_str()
        .expect("terminal delivery receipt ID")
        .to_string();
    tokio::time::timeout(Duration::from_secs(2), async {
        loop {
            if delivery_repository
                .load_exact(&receipt_id)
                .is_some_and(|receipt| {
                    receipt.state() == V2DeliveryReceiptState::Published
                        && receipt.delivery_revision() == 2
                })
            {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("broker PUBACK publication state");
    shutdown_tx.send(true).expect("shutdown");
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(5), task)
            .await
            .expect("pump stop timeout")
            .expect("pump task")
            .expect("pump result"),
        MqttV2PumpOutcome::Stopped
    );
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    let observed = stage_values
        .values()
        .iter()
        .map(StageTimingEvidence::stage)
        .collect::<Vec<_>>();
    assert!(observed.contains(&RuntimeStage::Queue));
    assert!(observed.contains(&RuntimeStage::Publish));
    broker.stop().expect("broker stop");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn owned_v2_pump_publishes_v1_rejection_without_effect_or_delivery_receipt() {
    let topics = topics();
    let mut v1 = valid_command();
    v1["protocol_version"] = 1.into();
    let broker = ControlledMqttBroker::start_redelivery(topics.command(), topics.response(), v1, 1)
        .expect("broker");
    let calls = Arc::new(AtomicUsize::new(0));
    let adapter = Arc::new(response_adapter(Arc::clone(&calls)));
    let mut options = MqttOptions::new("yeonjang-v1-rejection-pump", "127.0.0.1", broker.port());
    options.set_keep_alive(Duration::from_secs(5));
    let (client, event_loop) = controlled_client(options, 8);
    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let delivery_repository = test_delivery_repository();
    let pump = MqttV2CommandPump::new(
        client,
        event_loop,
        MqttV2PumpDependencies::new(
            adapter,
            Arc::new(control_router(Arc::new(ActiveCommandRegistry::default()))),
            delivery_repository.clone(),
        ),
        Arc::new(FixedPumpContext),
        shutdown_rx,
        MqttV2PumpConfig::new(2).expect("pump config"),
    );
    let task = tokio::spawn(pump.run());

    let response = broker
        .wait_for_response(CONTROLLED_NETWORK_OBSERVATION)
        .expect("signed v1 rejection");
    assert_eq!(response["schema_id"], "yeonjang.command-rejection.v2");
    assert_eq!(
        response["payload"]["failure"]["reason_code"],
        "protocol_upgrade_required"
    );
    assert_eq!(
        response["payload"]["failure"]["effect_state"],
        "not_started"
    );
    assert_eq!(calls.load(Ordering::SeqCst), 0);
    assert!(
        delivery_repository
            .load_exact("receipt-response-message-v2")
            .is_none()
    );

    shutdown_tx.send(true).expect("shutdown");
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(5), task)
            .await
            .expect("pump shutdown")
            .expect("pump task")
            .expect("pump result"),
        MqttV2PumpOutcome::Stopped
    );
    broker.stop().expect("broker stop");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn owned_v2_pump_subscribes_exact_admin_and_returns_signed_policy_result() {
    let topics = topics();
    let broker =
        ControlledMqttBroker::start_admin(topics.admin(), topics.response(), valid_policy_admin())
            .expect("broker");
    let command_calls = Arc::new(AtomicUsize::new(0));
    let command_adapter = Arc::new(response_adapter(command_calls));
    let policy_repository = Arc::new(
        DurablePermissionPolicyRepository::bootstrap(
            "instance-a",
            16,
            Arc::new(ControlledMemoryStorage::default()),
        )
        .expect("policy repository"),
    );
    let policy_adapter = Arc::new(MqttV2PolicyAdminAdapter::new(
        topics.clone(),
        Arc::new(AcceptPolicyAdmin),
        PolicyAdminUseCase::new(Arc::new(AcceptPolicyAdmin), policy_repository.clone()),
        Arc::new(FixedResponseSigner),
    ));
    let mut options = MqttOptions::new("yeonjang-v2-admin-pump", "127.0.0.1", broker.port());
    options.set_keep_alive(Duration::from_secs(5));
    let (client, event_loop) = controlled_client(options, 8);
    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let dependencies = MqttV2PumpDependencies::new(
        command_adapter,
        Arc::new(control_router(Arc::new(ActiveCommandRegistry::default()))),
        test_delivery_repository(),
    )
    .with_policy_admin(policy_adapter);
    let pump = MqttV2CommandPump::new(
        client,
        event_loop,
        dependencies,
        Arc::new(FixedPumpContext),
        shutdown_rx,
        MqttV2PumpConfig::new(3).expect("pump config"),
    );
    let task = tokio::spawn(pump.run());

    let response = broker
        .wait_for_response(CONTROLLED_NETWORK_OBSERVATION)
        .expect("admin response");
    assert_eq!(response["schema_id"], "yeonjang.policy-admin-result.v2");
    assert_eq!(response["payload"]["outcome"], "applied");
    assert_eq!(
        policy_repository
            .snapshot()
            .expect("snapshot")
            .entry(PolicyCapability::CameraCapture)
            .decision(),
        PolicyDecision::Allowed
    );

    shutdown_tx.send(true).expect("shutdown");
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(5), task)
            .await
            .expect("pump shutdown")
            .expect("pump task")
            .expect("pump result"),
        MqttV2PumpOutcome::Stopped
    );
    broker.stop().expect("broker stop");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn admitted_artifact_fetch_failure_publishes_one_signed_response_without_a_chunk() {
    let topics = topics();
    let artifact_root = std::env::temp_dir().join(format!(
        "knowbee-controlled-mqtt-artifact-rejection-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos()
    ));
    let artifacts = ArtifactRuntimeComposition::bootstrap(
        ArtifactRuntimeConfig::new(&artifact_root, "instance-a", 8, 4 * 1024 * 1024, 600_000),
        500,
    )
    .expect("artifact composition");
    let binding = ArtifactBinding::new(
        format!("capture:{}", "90".repeat(32)),
        "requester-a",
        "request-v2",
        "operation-v2",
        format!("sha256:{}", "ab".repeat(32)),
        4,
        1_000,
        601_000,
    )
    .expect("binding");
    assert!(matches!(
        artifacts.lifecycle_store().register(binding.clone()),
        ArtifactRepositoryResult::Registered { .. }
    ));
    let router = artifacts
        .attach_router(
            control_router(Arc::new(ActiveCommandRegistry::default())),
            topics.clone(),
            Arc::new(AcceptArtifactSignatures),
            Arc::new(InMemoryAuthorizationReplayGuard::new(8).expect("artifact replay")),
            Arc::new(FixedResponseSigner),
        )
        .expect("artifact router");
    let mut fetch = valid_artifact_fetch(&binding);
    fetch["payload"]["params"]["expected_revision"] = serde_json::json!(1);
    fetch["authorization"]["expected_revision"] = serde_json::json!(1);
    let broker = ControlledMqttBroker::start_control(topics.control(), topics.response(), fetch)
        .expect("artifact rejection broker");
    let mut options =
        MqttOptions::new("yeonjang-v2-artifact-rejection", "127.0.0.1", broker.port());
    options.set_keep_alive(Duration::from_secs(5));
    let (client, event_loop) = controlled_client(options, 4);
    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let pump = MqttV2CommandPump::new(
        client,
        event_loop,
        artifacts.attach_pump(MqttV2PumpDependencies::new(
            Arc::new(response_adapter(Arc::new(AtomicUsize::new(0)))),
            Arc::new(router),
            test_delivery_repository(),
        )),
        Arc::new(FixedPumpContext),
        shutdown_rx,
        MqttV2PumpConfig::new(3).expect("pump config"),
    );
    let task = tokio::spawn(pump.run());

    let response = broker
        .wait_for_response(CONTROLLED_NETWORK_OBSERVATION)
        .expect("typed fetch rejection");
    assert_eq!(response["schema_id"], "yeonjang.artifact-fetch-result.v2");
    assert_eq!(response["request_id"], "artifact-request-fetch");
    assert_eq!(response["payload"]["artifact_ref"], binding.artifact_ref());
    assert_eq!(response["payload"]["transfer_id"], "transfer-a");
    assert_eq!(response["payload"]["reason"], "revision_conflict");
    assert_eq!(response["authorization"]["scope"], "response.publish");

    shutdown_tx.send(true).expect("shutdown");
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(5), task)
            .await
            .expect("pump shutdown")
            .expect("pump task")
            .expect("pump result"),
        MqttV2PumpOutcome::Stopped
    );
    broker.stop().expect("broker stop");
    let _ = std::fs::remove_dir_all(artifact_root);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn owned_pump_fetches_two_binary_chunks_then_accepts_exact_ack_and_hands_off_cleanup() {
    let topics = topics();
    let bytes = large_camera_bytes();
    let artifact_root = std::env::temp_dir().join(format!(
        "knowbee-controlled-mqtt-artifact-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos()
    ));
    let artifacts = ArtifactRuntimeComposition::bootstrap(
        ArtifactRuntimeConfig::new(&artifact_root, "instance-a", 8, 4 * 1024 * 1024, 600_000),
        500,
    )
    .expect("production artifact composition");
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
    let binding = ArtifactBinding::new(
        &artifact_ref,
        "requester-a",
        "request-v2",
        "operation-v2",
        metadata.sha256_digest(),
        metadata.size_bytes(),
        1_000,
        601_000,
    )
    .expect("binding");
    let repository = artifacts.lifecycle_store();
    let router = artifacts
        .attach_router(
            control_router(Arc::new(ActiveCommandRegistry::default())),
            topics.clone(),
            Arc::new(AcceptArtifactSignatures),
            Arc::new(InMemoryAuthorizationReplayGuard::new(8).expect("artifact replay")),
            Arc::new(FixedResponseSigner),
        )
        .expect("artifact router");
    let broker = ControlledMqttBroker::start_command_artifact(
        topics.command(),
        topics.response(),
        topics.control(),
        topics.artifact_chunk("transfer-a").expect("chunk topic"),
        topics.artifact_ack("transfer-a").expect("ack topic"),
        valid_command(),
        valid_artifact_fetch(&binding),
        valid_artifact_ack(&binding),
        2,
    )
    .expect("artifact broker");
    let mut options = MqttOptions::new("yeonjang-v2-artifact-pump", "127.0.0.1", broker.port());
    options.set_keep_alive(Duration::from_secs(5));
    options.set_request_channel_capacity(2);
    options.set_max_packet_size(512 * 1024, 512 * 1024);
    let (client, event_loop) = controlled_client(options, 2);
    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let registry = Arc::new(ActiveCommandRegistry::default());
    let handler = artifacts.attach_handler(MqttV2CommandHandler::new(
        topics.clone(),
        Arc::new(AcceptSignatures),
        Arc::new(InMemoryAuthorizationReplayGuard::new(8).expect("command replay")),
        Arc::new(InMemoryV2TerminalRepository::new(8).expect("terminal")),
        registry.clone(),
        Arc::new(AllowedPolicy),
        ExecuteCapabilityUseCase::new(
            Arc::new(LeaseArtifactPort::new(lease, bytes)),
            Arc::new(FixedClock),
            registry,
            100,
        ),
    ));
    let response_adapter = MqttV2ResponseAdapter::new(handler, Arc::new(FixedResponseSigner));
    let stage_values = Arc::new(PumpStageValues::default());
    let pump = MqttV2CommandPump::new(
        client,
        event_loop,
        artifacts
            .attach_pump(MqttV2PumpDependencies::new(
                Arc::new(response_adapter),
                Arc::new(router),
                test_delivery_repository(),
            ))
            .with_stage_timing(StageTimingRecorder::new(
                Arc::new(PumpStageClock),
                stage_values.clone(),
            )),
        Arc::new(FixedPumpContext),
        shutdown_rx,
        MqttV2PumpConfig::new(3).expect("pump config"),
    );
    let task = tokio::spawn(pump.run());

    let terminal = broker
        .wait_for_response(CONTROLLED_NETWORK_OBSERVATION)
        .expect("capture terminal");
    assert_eq!(terminal["payload"]["schema_version"], 3);
    assert_eq!(terminal["payload"]["artifact"]["artifactRef"], artifact_ref);
    for _ in 0..2 {
        let chunk = match broker.wait_for_response(CONTROLLED_NETWORK_OBSERVATION) {
            Ok(chunk) => chunk,
            Err(error) => {
                let pump_result = tokio::time::timeout(Duration::from_secs(1), task).await;
                let broker_result = broker.stop();
                panic!(
                    "binary chunk unavailable: {error}; pump={pump_result:?}; broker={broker_result:?}"
                );
            }
        };
        assert_eq!(chunk["magic"], "YAC2");
        assert_eq!(
            chunk["topic"],
            topics.artifact_chunk("transfer-a").expect("chunk topic")
        );
    }
    tokio::time::timeout(Duration::from_secs(15), async {
        loop {
            if matches!(
                repository.read(binding.artifact_ref()),
                ArtifactLifecycleRead::Found(lifecycle)
                    if matches!(
                        lifecycle.cleanup_status(),
                        knowbee_yeonjang::artifact_lifecycle::ArtifactCleanupStatus::Completed { .. }
                    )
            ) {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("cleanup handoff");
    assert!(matches!(
        repository.read(binding.artifact_ref()),
        ArtifactLifecycleRead::Found(lifecycle)
            if matches!(lifecycle.state(), ArtifactLifecycleState::Acknowledged { .. })
                && matches!(
                    lifecycle.cleanup_status(),
                    knowbee_yeonjang::artifact_lifecycle::ArtifactCleanupStatus::Completed { .. }
                )
    ));
    let observed = stage_values
        .values()
        .iter()
        .map(StageTimingEvidence::stage)
        .collect::<Vec<_>>();
    assert!(observed.contains(&RuntimeStage::Transfer));
    assert!(observed.contains(&RuntimeStage::Acknowledgement));

    shutdown_tx.send(true).expect("shutdown");
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(5), task)
            .await
            .expect("artifact pump stop")
            .expect("artifact pump task")
            .expect("artifact pump result"),
        MqttV2PumpOutcome::Stopped
    );
    broker.stop().expect("broker stop");
    let _ = std::fs::remove_dir_all(artifact_root);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn artifact_transfer_reconnects_after_unacked_chunk_without_reexecuting_capture() {
    let topics = topics();
    let bytes = large_camera_bytes();
    let effects = Arc::new(AtomicUsize::new(0));
    let artifact_root = std::env::temp_dir().join(format!(
        "knowbee-controlled-mqtt-artifact-reconnect-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos()
    ));
    let artifacts = ArtifactRuntimeComposition::bootstrap(
        ArtifactRuntimeConfig::new(&artifact_root, "instance-a", 8, 4 * 1024 * 1024, 600_000),
        500,
    )
    .expect("artifact composition");
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
    .expect("metadata");
    let binding = ArtifactBinding::new(
        &artifact_ref,
        "requester-a",
        "request-v2",
        "operation-v2",
        metadata.sha256_digest(),
        metadata.size_bytes(),
        1_000,
        601_000,
    )
    .expect("binding");
    let repository = artifacts.lifecycle_store();
    let router = artifacts
        .attach_router(
            control_router(Arc::new(ActiveCommandRegistry::default())),
            topics.clone(),
            Arc::new(AcceptArtifactSignatures),
            Arc::new(InMemoryAuthorizationReplayGuard::new(8).expect("artifact replay")),
            Arc::new(FixedResponseSigner),
        )
        .expect("artifact router");
    let broker = ControlledMqttBroker::start_command_artifact_reconnect(
        topics.command(),
        topics.response(),
        topics.control(),
        topics.artifact_chunk("transfer-a").expect("chunk topic"),
        topics.artifact_ack("transfer-a").expect("ack topic"),
        valid_command(),
        valid_artifact_fetch(&binding),
        valid_artifact_ack(&binding),
        binding.clone(),
        "transfer-a",
        2,
    )
    .expect("artifact reconnect broker");
    let mut options =
        MqttOptions::new("yeonjang-v2-artifact-reconnect", "127.0.0.1", broker.port());
    options.set_keep_alive(Duration::from_secs(5));
    options.set_request_channel_capacity(2);
    options.set_max_packet_size(512 * 1024, 512 * 1024);
    let (client, event_loop) = controlled_client(options, 2);
    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let registry = Arc::new(ActiveCommandRegistry::default());
    let handler = artifacts.attach_handler(MqttV2CommandHandler::new(
        topics.clone(),
        Arc::new(AcceptSignatures),
        Arc::new(InMemoryAuthorizationReplayGuard::new(8).expect("command replay")),
        Arc::new(InMemoryV2TerminalRepository::new(8).expect("terminal")),
        registry.clone(),
        Arc::new(AllowedPolicy),
        ExecuteCapabilityUseCase::new(
            Arc::new(LeaseArtifactPort::with_effects(
                lease,
                bytes,
                Arc::clone(&effects),
            )),
            Arc::new(FixedClock),
            registry,
            100,
        ),
    ));
    let pump = MqttV2CommandPump::new(
        client,
        event_loop,
        artifacts.attach_pump(MqttV2PumpDependencies::new(
            Arc::new(MqttV2ResponseAdapter::new(
                handler,
                Arc::new(FixedResponseSigner),
            )),
            Arc::new(router),
            test_delivery_repository(),
        )),
        Arc::new(FixedPumpContext),
        shutdown_rx,
        MqttV2PumpConfig::new(3).expect("pump config"),
    );
    let task = tokio::spawn(pump.run());

    let terminal = broker
        .wait_for_response(CONTROLLED_NETWORK_OBSERVATION)
        .expect("capture terminal");
    assert_eq!(
        terminal["payload"]["terminal"]["execution_outcome"],
        "succeeded"
    );
    let mut attempts = Vec::new();
    let complete = loop {
        let observation = broker
            .wait_for_response(CONTROLLED_NETWORK_OBSERVATION)
            .expect("artifact reconnect observation");
        if observation["kind"] == "artifact_complete" {
            break observation;
        }
        assert_eq!(observation["kind"], "artifact_chunk");
        attempts.push(observation["attempt"].as_u64().expect("artifact attempt"));
    };
    assert!(
        attempts.contains(&0),
        "first session must receive one chunk"
    );
    assert!(
        attempts.contains(&1),
        "reconnect must carry artifact chunks"
    );
    assert_eq!(complete["size"], metadata.size_bytes());
    assert_eq!(complete["full_digest"], metadata.sha256_digest());
    assert_eq!(effects.load(Ordering::SeqCst), 1);
    tokio::time::timeout(Duration::from_secs(15), async {
        loop {
            if matches!(
                repository.read(binding.artifact_ref()),
                ArtifactLifecycleRead::Found(lifecycle)
                    if matches!(lifecycle.state(), ArtifactLifecycleState::Acknowledged { .. })
                        && matches!(
                            lifecycle.cleanup_status(),
                            knowbee_yeonjang::artifact_lifecycle::ArtifactCleanupStatus::Completed { .. }
                        )
            ) {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("reconnect cleanup");

    shutdown_tx.send(true).expect("shutdown");
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(5), task)
            .await
            .expect("artifact reconnect stop")
            .expect("pump task")
            .expect("pump result"),
        MqttV2PumpOutcome::Stopped
    );
    broker.stop().expect("broker stop");
    let _ = std::fs::remove_dir_all(artifact_root);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn artifact_cancel_stops_pending_batch_and_never_reaches_acknowledged_cleanup() {
    let topics = topics();
    let bytes = very_large_camera_bytes();
    let effects = Arc::new(AtomicUsize::new(0));
    let artifact_root = std::env::temp_dir().join(format!(
        "knowbee-controlled-mqtt-artifact-cancel-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos()
    ));
    let artifacts = ArtifactRuntimeComposition::bootstrap(
        ArtifactRuntimeConfig::new(&artifact_root, "instance-a", 8, 4 * 1024 * 1024, 600_000),
        500,
    )
    .expect("artifact composition");
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
    .expect("metadata");
    let binding = ArtifactBinding::new(
        &artifact_ref,
        "requester-a",
        "request-v2",
        "operation-v2",
        metadata.sha256_digest(),
        metadata.size_bytes(),
        1_000,
        601_000,
    )
    .expect("binding");
    let expected_chunks = metadata.size_bytes().div_ceil(262_144);
    let repository = artifacts.lifecycle_store();
    let router = artifacts
        .attach_router(
            control_router(Arc::new(ActiveCommandRegistry::default())),
            topics.clone(),
            Arc::new(AcceptArtifactSignatures),
            Arc::new(InMemoryAuthorizationReplayGuard::new(8).expect("artifact replay")),
            Arc::new(FixedResponseSigner),
        )
        .expect("artifact router");
    let broker = ControlledMqttBroker::start_command_artifact_cancel(
        topics.command(),
        topics.response(),
        topics.control(),
        topics.artifact_chunk("transfer-a").expect("chunk topic"),
        valid_command(),
        valid_artifact_fetch(&binding),
        valid_artifact_cancel(&binding),
    )
    .expect("artifact cancel broker");
    let mut options = MqttOptions::new("yeonjang-v2-artifact-cancel", "127.0.0.1", broker.port());
    options.set_keep_alive(Duration::from_secs(5));
    options.set_request_channel_capacity(1);
    options.set_max_packet_size(512 * 1024, 512 * 1024);
    let (client, event_loop) = controlled_client(options, 1);
    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let registry = Arc::new(ActiveCommandRegistry::default());
    let handler = artifacts.attach_handler(MqttV2CommandHandler::new(
        topics.clone(),
        Arc::new(AcceptSignatures),
        Arc::new(InMemoryAuthorizationReplayGuard::new(8).expect("command replay")),
        Arc::new(InMemoryV2TerminalRepository::new(8).expect("terminal")),
        registry.clone(),
        Arc::new(AllowedPolicy),
        ExecuteCapabilityUseCase::new(
            Arc::new(LeaseArtifactPort::with_effects(
                lease,
                bytes,
                Arc::clone(&effects),
            )),
            Arc::new(FixedClock),
            registry,
            100,
        ),
    ));
    let pump = MqttV2CommandPump::new(
        client,
        event_loop,
        artifacts.attach_pump(MqttV2PumpDependencies::new(
            Arc::new(MqttV2ResponseAdapter::new(
                handler,
                Arc::new(FixedResponseSigner),
            )),
            Arc::new(router),
            test_delivery_repository(),
        )),
        Arc::new(FixedPumpContext),
        shutdown_rx,
        MqttV2PumpConfig::new(3).expect("pump config"),
    );
    let task = tokio::spawn(pump.run());

    let terminal = broker
        .wait_for_response(CONTROLLED_NETWORK_OBSERVATION)
        .expect("capture terminal");
    assert_eq!(
        terminal["payload"]["terminal"]["execution_outcome"],
        "succeeded"
    );
    let first_chunk = broker
        .wait_for_response(CONTROLLED_NETWORK_OBSERVATION)
        .expect("first artifact chunk");
    assert_eq!(first_chunk["kind"], "artifact_chunk");
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            if matches!(
                repository.read(binding.artifact_ref()),
                ArtifactLifecycleRead::Found(lifecycle)
                    if matches!(lifecycle.state(), ArtifactLifecycleState::Cancelled { .. })
            ) {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("artifact cancellation");
    let cancel_response = tokio::time::timeout(Duration::from_secs(2), async {
        loop {
            if let Some(observation) = broker.try_response().expect("cancel response observation")
                && observation["schema_id"] == "yeonjang.artifact-cancel-ack.v2"
            {
                break observation;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("requester-facing artifact cancel response");
    assert_eq!(cancel_response["payload"]["outcome"], "cancelled");
    assert_eq!(
        cancel_response["payload"]["artifact_ref"],
        binding.artifact_ref()
    );
    assert_eq!(cancel_response["payload"]["transfer_id"], "transfer-a");
    tokio::time::sleep(Duration::from_millis(100)).await;
    let mut observed_chunks = 1_u64;
    while let Some(observation) = broker.try_response().expect("chunk observation") {
        if observation["kind"] == "artifact_chunk" {
            observed_chunks += 1;
        }
    }
    assert!(observed_chunks <= expected_chunks);
    assert!(matches!(
        repository.read(binding.artifact_ref()),
        ArtifactLifecycleRead::Found(lifecycle)
            if matches!(lifecycle.state(), ArtifactLifecycleState::Cancelled { .. })
                && matches!(
                    lifecycle.cleanup_status(),
                    knowbee_yeonjang::artifact_lifecycle::ArtifactCleanupStatus::Pending
                )
    ));
    assert_eq!(effects.load(Ordering::SeqCst), 1);

    shutdown_tx.send(true).expect("shutdown");
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(5), task)
            .await
            .expect("artifact cancel stop")
            .expect("pump task")
            .expect("pump result"),
        MqttV2PumpOutcome::Stopped
    );
    broker.stop().expect("broker stop");
    let _ = std::fs::remove_dir_all(artifact_root);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn delivery_registration_failure_stops_before_network_response_enqueue() {
    let topics = topics();
    let broker = ControlledMqttBroker::start_redelivery(
        topics.command(),
        topics.response(),
        valid_command(),
        1,
    )
    .expect("broker");
    let effects = Arc::new(AtomicUsize::new(0));
    let mut options = MqttOptions::new("yeonjang-v2-delivery-fail", "127.0.0.1", broker.port());
    options.set_keep_alive(Duration::from_secs(5));
    let (client, event_loop) = controlled_client(options, 8);
    let (_shutdown_tx, shutdown_rx) = watch::channel(false);
    let pump = MqttV2CommandPump::new(
        client,
        event_loop,
        MqttV2PumpDependencies::new(
            Arc::new(response_adapter(Arc::clone(&effects))),
            Arc::new(control_router(Arc::new(ActiveCommandRegistry::default()))),
            Arc::new(FailingDeliveryStore),
        ),
        Arc::new(FixedPumpContext),
        shutdown_rx,
        MqttV2PumpConfig::new(2).expect("pump config"),
    );
    let task = tokio::spawn(pump.run());
    wait_for_controlled_client(&broker)
        .await
        .expect("delivery failure client");
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(5), task)
            .await
            .expect("pump failure timeout")
            .expect("pump task"),
        Err(MqttV2PumpError::DeliveryStateFailed)
    );
    assert!(
        broker
            .wait_for_response(Duration::from_millis(100))
            .is_err()
    );
    assert_eq!(effects.load(Ordering::SeqCst), 1);
    broker.stop().expect("broker stop");
}

#[test]
fn pump_rejects_zero_or_unbounded_concurrency_before_runtime_start() {
    assert_eq!(
        MqttV2PumpConfig::new(0),
        Err(MqttV2PumpConfigError::InvalidMaxInFlight)
    );
    assert_eq!(
        MqttV2PumpConfig::new(1),
        Err(MqttV2PumpConfigError::InvalidMaxInFlight)
    );
    assert_eq!(
        MqttV2PumpConfig::new(65),
        Err(MqttV2PumpConfigError::InvalidMaxInFlight)
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn v2_pump_serializes_distinct_commands_for_the_same_camera_resource() {
    let topics = topics();
    let broker = ControlledMqttBroker::start_burst(
        topics.command(),
        topics.response(),
        vec![valid_command_with("first"), valid_command_with("second")],
    )
    .expect("burst broker");
    let active = Arc::new(AtomicUsize::new(0));
    let max_active = Arc::new(AtomicUsize::new(0));
    let calls = Arc::new(AtomicUsize::new(0));
    let adapter = Arc::new(response_adapter_with_port(Arc::new(OverlapPort {
        active: Arc::clone(&active),
        max_active: Arc::clone(&max_active),
        calls: Arc::clone(&calls),
    })));
    let mut options = MqttOptions::new("yeonjang-v2-overlap", "127.0.0.1", broker.port());
    options.set_keep_alive(Duration::from_secs(5));
    let (client, event_loop) = controlled_client(options, 8);
    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let pump = MqttV2CommandPump::new(
        client,
        event_loop,
        MqttV2PumpDependencies::new(
            adapter,
            Arc::new(control_router(Arc::new(ActiveCommandRegistry::default()))),
            test_delivery_repository(),
        ),
        Arc::new(SequencedPumpContext::default()),
        shutdown_rx,
        MqttV2PumpConfig::new(2).expect("pump config"),
    );
    let task = tokio::spawn(pump.run());

    let mut request_ids = vec![
        broker
            .wait_for_response(CONTROLLED_NETWORK_OBSERVATION)
            .expect("first response")["request_id"]
            .as_str()
            .expect("request ID")
            .to_string(),
        broker
            .wait_for_response(CONTROLLED_NETWORK_OBSERVATION)
            .expect("second response")["request_id"]
            .as_str()
            .expect("request ID")
            .to_string(),
    ];
    request_ids.sort();
    assert_eq!(request_ids, ["request-first", "request-second"]);
    assert_eq!(calls.load(Ordering::SeqCst), 2);
    assert_eq!(
        max_active.load(Ordering::SeqCst),
        1,
        "same camera resource must not overlap in the direct MQTT backend"
    );

    shutdown_tx.send(true).expect("shutdown");
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(5), task)
            .await
            .expect("stop timeout")
            .expect("pump task")
            .expect("pump result"),
        MqttV2PumpOutcome::Stopped
    );
    broker.stop().expect("broker stop");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn v2_pump_overlaps_camera_and_screen_without_cross_binding_context() {
    let topics = topics();
    let broker = ControlledMqttBroker::start_burst(
        topics.command(),
        topics.response(),
        vec![
            valid_command_with("camera-independent"),
            valid_screen_command_with("screen-independent"),
        ],
    )
    .expect("independent resource broker");
    let active = Arc::new(AtomicUsize::new(0));
    let max_active = Arc::new(AtomicUsize::new(0));
    let calls = Arc::new(AtomicUsize::new(0));
    let adapter = Arc::new(response_adapter_with_port(Arc::new(OverlapPort {
        active: Arc::clone(&active),
        max_active: Arc::clone(&max_active),
        calls: Arc::clone(&calls),
    })));
    let mut options = MqttOptions::new("yeonjang-v2-independent", "127.0.0.1", broker.port());
    options.set_keep_alive(Duration::from_secs(5));
    let (client, event_loop) = controlled_client(options, 8);
    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let pump = MqttV2CommandPump::new(
        client,
        event_loop,
        MqttV2PumpDependencies::new(
            adapter,
            Arc::new(control_router(Arc::new(ActiveCommandRegistry::default()))),
            test_delivery_repository(),
        ),
        Arc::new(SequencedPumpContext::default()),
        shutdown_rx,
        MqttV2PumpConfig::new(2).expect("pump config"),
    );
    let task = tokio::spawn(pump.run());

    for _ in 0..2 {
        broker
            .wait_for_response(CONTROLLED_NETWORK_OBSERVATION)
            .expect("independent resource response");
    }
    assert_eq!(calls.load(Ordering::SeqCst), 2);
    assert_eq!(
        max_active.load(Ordering::SeqCst),
        2,
        "camera and screen must retain independent concurrency"
    );

    shutdown_tx.send(true).expect("shutdown");
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(5), task)
            .await
            .expect("stop timeout")
            .expect("pump task")
            .expect("pump result"),
        MqttV2PumpOutcome::Stopped
    );
    broker.stop().expect("broker stop");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn exact_cancel_stops_same_camera_waiter_and_releases_resource_for_follow_up() {
    let topics = topics();
    let (first_effect_tx, first_effect_rx) = mpsc::channel();
    let broker = ControlledMqttBroker::start_burst_then_control_and_follow_up(
        topics.command(),
        topics.control(),
        topics.response(),
        [
            valid_command_with("resource-first"),
            valid_command_with("resource-waiter"),
        ],
        valid_cancel_control_for("resource-waiter"),
        valid_command_with("resource-follow-up"),
        first_effect_rx,
    )
    .expect("resource waiter broker");
    let effects = Arc::new(Mutex::new(Vec::new()));
    let first_effect_active = Arc::new(AtomicUsize::new(0));
    let registry = Arc::new(ActiveCommandRegistry::default());
    let command_adapter = Arc::new(response_adapter_with_registry_and_port(
        Arc::clone(&registry),
        Arc::new(OrderedCameraPort {
            first_effect_started: first_effect_tx,
            first_effect_active: Arc::clone(&first_effect_active),
            effects: Arc::clone(&effects),
        }),
    ));
    let mut options = MqttOptions::new("yeonjang-v2-waiter-cancel", "127.0.0.1", broker.port());
    options.set_keep_alive(Duration::from_secs(5));
    let (client, event_loop) = controlled_client(options, 8);
    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let pump = MqttV2CommandPump::new(
        client,
        event_loop,
        MqttV2PumpDependencies::new(
            command_adapter,
            Arc::new(control_router(Arc::clone(&registry))),
            test_delivery_repository(),
        ),
        Arc::new(SequencedPumpContext::default()),
        shutdown_rx,
        MqttV2PumpConfig::new(2).expect("pump config"),
    );
    let task = tokio::spawn(pump.run());

    let mut responses = Vec::new();
    for _ in 0..4 {
        responses.push(
            broker
                .wait_for_response(CONTROLLED_NETWORK_OBSERVATION)
                .expect("waiter scenario response"),
        );
    }
    let cancel_ack = responses
        .iter()
        .find(|response| response["schema_id"] == "yeonjang.cancel-ack.v2")
        .expect("cancel acknowledgement");
    let waiter_terminal = responses
        .iter()
        .find(|response| response["request_id"] == "request-resource-waiter")
        .expect("waiter terminal");
    let succeeded = responses
        .iter()
        .filter(|response| {
            response["schema_id"] == "yeonjang.response.v2"
                && response["payload"]["terminal"]["execution_outcome"] == "succeeded"
        })
        .count();
    assert_eq!(cancel_ack["payload"]["outcome"], "accepted");
    assert_eq!(cancel_ack["payload"]["target_terminal"], false);
    assert_eq!(
        waiter_terminal["payload"]["terminal"]["execution_outcome"],
        "cancelled"
    );
    assert_eq!(
        waiter_terminal["payload"]["terminal"]["failure"]["effect_state"],
        "not_started"
    );
    assert_eq!(succeeded, 2, "first and post-cancel follow-up must succeed");
    assert_eq!(
        effects.lock().expect("effect calls").as_slice(),
        ["request-resource-first", "request-resource-follow-up"]
    );
    assert_eq!(first_effect_active.load(Ordering::SeqCst), 0);
    assert_eq!(registry.active_count(), Some(0));

    shutdown_tx.send(true).expect("shutdown");
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(5), task)
            .await
            .expect("stop timeout")
            .expect("pump task")
            .expect("pump result"),
        MqttV2PumpOutcome::Stopped
    );
    broker.stop().expect("broker stop");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn running_command_cancel_publishes_ack_and_distinct_cancelled_terminal_without_effect() {
    let topics = topics();
    let (started_tx, started_rx) = mpsc::channel();
    let broker = ControlledMqttBroker::start_command_then_control(
        topics.command(),
        topics.control(),
        topics.response(),
        valid_command(),
        valid_cancel_control(),
        started_rx,
    )
    .expect("cancel broker");
    let effects = Arc::new(AtomicUsize::new(0));
    let registry = Arc::new(ActiveCommandRegistry::default());
    let command_adapter = Arc::new(response_adapter_with_registry_and_port(
        Arc::clone(&registry),
        Arc::new(DelayedPreflightPort {
            started: started_tx,
            effects: Arc::clone(&effects),
            registry: Arc::clone(&registry),
        }),
    ));
    let control_adapter = Arc::new(control_router(Arc::clone(&registry)));
    let mut options = MqttOptions::new("yeonjang-v2-cancel", "127.0.0.1", broker.port());
    options.set_keep_alive(Duration::from_secs(5));
    let (client, event_loop) = controlled_client(options, 8);
    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let pump = MqttV2CommandPump::new(
        client,
        event_loop,
        MqttV2PumpDependencies::new(command_adapter, control_adapter, test_delivery_repository()),
        Arc::new(SequencedPumpContext::default()),
        shutdown_rx,
        MqttV2PumpConfig::new(2).expect("pump config"),
    );
    let task = tokio::spawn(pump.run());

    let first = broker
        .wait_for_response(CONTROLLED_NETWORK_OBSERVATION)
        .expect("first response");
    let second = broker
        .wait_for_response(CONTROLLED_NETWORK_OBSERVATION)
        .expect("second response");
    let responses = [first, second];
    let cancel_ack = responses
        .iter()
        .find(|response| response["schema_id"] == "yeonjang.cancel-ack.v2")
        .expect("cancel acknowledgement");
    let terminal = responses
        .iter()
        .find(|response| response["schema_id"] == "yeonjang.response.v2")
        .expect("target terminal");
    assert_eq!(cancel_ack["payload"]["outcome"], "accepted");
    assert_eq!(cancel_ack["payload"]["target_terminal"], false);
    assert_eq!(
        terminal["payload"]["terminal"]["execution_outcome"],
        "cancelled"
    );
    assert_eq!(terminal["request_id"], "request-v2");
    assert_eq!(effects.load(Ordering::SeqCst), 0);

    shutdown_tx.send(true).expect("shutdown");
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(5), task)
            .await
            .expect("stop timeout")
            .expect("pump task")
            .expect("pump result"),
        MqttV2PumpOutcome::Stopped
    );
    broker.stop().expect("broker stop");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn runtime_shutdown_cancels_running_command_and_leaves_no_active_owner_or_effect() {
    let topics = topics();
    let (started_tx, started_rx) = mpsc::channel();
    let broker = ControlledMqttBroker::start_redelivery(
        topics.command(),
        topics.response(),
        valid_command(),
        1,
    )
    .expect("shutdown broker");
    let effects = Arc::new(AtomicUsize::new(0));
    let registry = Arc::new(ActiveCommandRegistry::default());
    let command_adapter = Arc::new(response_adapter_with_registry_and_port(
        Arc::clone(&registry),
        Arc::new(DelayedPreflightPort {
            started: started_tx,
            effects: Arc::clone(&effects),
            registry: Arc::clone(&registry),
        }),
    ));
    let mut options = MqttOptions::new("yeonjang-v2-shutdown", "127.0.0.1", broker.port());
    options.set_keep_alive(Duration::from_secs(5));
    let (client, event_loop) = controlled_client(options, 8);
    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let dependencies = MqttV2PumpDependencies::new(
        command_adapter,
        Arc::new(control_router(Arc::clone(&registry))),
        test_delivery_repository(),
    )
    .with_shutdown_sink(registry.clone());
    let pump = MqttV2CommandPump::new(
        client,
        event_loop,
        dependencies,
        Arc::new(FixedPumpContext),
        shutdown_rx,
        MqttV2PumpConfig::new(2).expect("pump config"),
    );
    let mut task = tokio::spawn(pump.run());
    tokio::select! {
        client = wait_for_controlled_client(&broker) => {
            client.expect("shutdown client");
        }
        joined = &mut task => {
            panic!("pump exited before shutdown client: {joined:?}");
        }
    }
    tokio::task::block_in_place(|| started_rx.recv_timeout(CONTROLLED_NETWORK_OBSERVATION))
        .expect("running command");

    shutdown_tx.send(true).expect("shutdown");
    let terminal =
        tokio::task::block_in_place(|| broker.wait_for_response(CONTROLLED_NETWORK_OBSERVATION))
            .expect("cancelled terminal");
    assert_eq!(
        terminal["payload"]["terminal"]["execution_outcome"],
        "cancelled"
    );
    assert_eq!(effects.load(Ordering::SeqCst), 0);
    assert_eq!(registry.active_count(), Some(0));
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(5), task)
            .await
            .expect("shutdown timeout")
            .expect("pump task")
            .expect("pump result"),
        MqttV2PumpOutcome::Stopped
    );
    broker.stop().expect("broker stop");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn runtime_shutdown_terminalizes_a_command_waiting_in_the_bounded_ingress_queue() {
    let topics = topics();
    let broker = ControlledMqttBroker::start_burst(
        topics.command(),
        topics.response(),
        vec![
            valid_command_with("shutdown-first"),
            valid_command_with("shutdown-second"),
            valid_command_with("shutdown-queued"),
        ],
    )
    .expect("queued shutdown broker");
    let (started_tx, started_rx) = mpsc::channel();
    let effects = Arc::new(AtomicUsize::new(0));
    let registry = Arc::new(ActiveCommandRegistry::default());
    let command_adapter = Arc::new(response_adapter_with_registry_and_port(
        Arc::clone(&registry),
        Arc::new(ShutdownWaitingPort {
            started: started_tx,
            effects: Arc::clone(&effects),
            registry: Arc::clone(&registry),
        }),
    ));
    let mut options = MqttOptions::new("yeonjang-v2-queued-shutdown", "127.0.0.1", broker.port());
    options.set_keep_alive(Duration::from_secs(5));
    let (client, event_loop) = controlled_client(options, 8);
    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let dependencies = MqttV2PumpDependencies::new(
        command_adapter,
        Arc::new(control_router(Arc::clone(&registry))),
        test_delivery_repository(),
    )
    .with_shutdown_sink(registry.clone());
    let pump = MqttV2CommandPump::new(
        client,
        event_loop,
        dependencies,
        Arc::new(SequencedPumpContext::default()),
        shutdown_rx,
        MqttV2PumpConfig::new(2).expect("pump config"),
    );
    let mut task = tokio::spawn(pump.run());
    for _ in 0..2 {
        tokio::select! {
            started = async {
                tokio::task::block_in_place(|| {
                    started_rx.recv_timeout(CONTROLLED_NETWORK_OBSERVATION)
                })
            } => {
                started.expect("running command");
            }
            joined = &mut task => {
                panic!("pump exited before queued shutdown: {joined:?}");
            }
        }
    }

    shutdown_tx.send(true).expect("shutdown");
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(5), task)
            .await
            .expect("shutdown timeout")
            .expect("pump task")
            .expect("pump result"),
        MqttV2PumpOutcome::Stopped
    );
    let mut cancelled = Vec::new();
    for _ in 0..3 {
        let response = broker
            .wait_for_response(CONTROLLED_NETWORK_OBSERVATION)
            .expect("cancelled terminal");
        assert_eq!(
            response["payload"]["terminal"]["execution_outcome"],
            "cancelled"
        );
        assert_eq!(
            response["payload"]["terminal"]["failure"]["effect_state"],
            "not_started"
        );
        cancelled.push(
            response["request_id"]
                .as_str()
                .expect("request ID")
                .to_string(),
        );
    }
    cancelled.sort();
    assert_eq!(
        cancelled,
        [
            "request-shutdown-first",
            "request-shutdown-queued",
            "request-shutdown-second"
        ]
    );
    assert_eq!(effects.load(Ordering::SeqCst), 0);
    assert_eq!(registry.active_count(), Some(0));
    broker.stop().expect("broker stop");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn owned_pump_routes_receipt_query_and_replays_terminal_without_command_effect() {
    let topics = topics();
    let broker = ControlledMqttBroker::start_control(
        topics.control(),
        topics.response(),
        valid_receipt_query(),
    )
    .expect("receipt broker");
    let effects = Arc::new(AtomicUsize::new(0));
    let lookups = Arc::new(AtomicUsize::new(0));
    let receipt_repository = Arc::new(ControlledReceiptRepository {
        lookups: Arc::clone(&lookups),
        terminal: controlled_terminal_content(),
    });
    let command_adapter = Arc::new(response_adapter(Arc::clone(&effects)));
    let router = Arc::new(control_router_with_receipt(
        Arc::new(ActiveCommandRegistry::default()),
        receipt_repository,
    ));
    let mut options = MqttOptions::new("yeonjang-v2-receipt", "127.0.0.1", broker.port());
    options.set_keep_alive(Duration::from_secs(5));
    let (client, event_loop) = controlled_client(options, 8);
    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let pump = MqttV2CommandPump::new(
        client,
        event_loop,
        MqttV2PumpDependencies::new(command_adapter, router, test_delivery_repository()),
        Arc::new(SequencedPumpContext::default()),
        shutdown_rx,
        MqttV2PumpConfig::new(2).expect("pump config"),
    );
    let task = tokio::spawn(pump.run());

    let response = broker
        .wait_for_response(CONTROLLED_NETWORK_OBSERVATION)
        .expect("receipt response");
    assert_eq!(response["schema_id"], "yeonjang.receipt-response.v2");
    assert_eq!(response["payload"]["outcome"], "found");
    assert_eq!(response["payload"]["terminal"]["request_id"], "request-v2");
    assert_eq!(effects.load(Ordering::SeqCst), 0);
    assert_eq!(lookups.load(Ordering::SeqCst), 1);

    shutdown_tx.send(true).expect("shutdown");
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(5), task)
            .await
            .expect("stop timeout")
            .expect("pump task")
            .expect("pump result"),
        MqttV2PumpOutcome::Stopped
    );
    broker.stop().expect("broker stop");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn owned_pump_persists_response_ack_and_redelivery_is_duplicate_without_effect() {
    let topics = topics();
    let broker = ControlledMqttBroker::start_control_redelivery(
        topics.control(),
        topics.response(),
        valid_response_ack(),
        2,
    )
    .expect("ack broker");
    let effects = Arc::new(AtomicUsize::new(0));
    let delivery_repository = Arc::new(
        DurableV2DeliveryRepository::bootstrap(8, Arc::new(ControlledMemoryStorage::default()))
            .expect("delivery repository"),
    );
    assert!(
        delivery_repository
            .register(controlled_published_receipt())
            .is_registered()
    );
    let router = Arc::new(control_router_with_stores(
        Arc::new(ActiveCommandRegistry::default()),
        Arc::new(InMemoryV2TerminalRepository::new(8).expect("terminal repository")),
        delivery_repository.clone(),
    ));
    let mut options = MqttOptions::new("yeonjang-v2-response-ack", "127.0.0.1", broker.port());
    options.set_keep_alive(Duration::from_secs(5));
    let (client, event_loop) = controlled_client(options, 8);
    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let pump = MqttV2CommandPump::new(
        client,
        event_loop,
        MqttV2PumpDependencies::new(
            Arc::new(response_adapter(Arc::clone(&effects))),
            router,
            delivery_repository.clone(),
        ),
        Arc::new(SequencedPumpContext::default()),
        shutdown_rx,
        MqttV2PumpConfig::new(2).expect("pump config"),
    );
    let task = tokio::spawn(pump.run());

    let first = broker
        .wait_for_response(CONTROLLED_NETWORK_OBSERVATION)
        .expect("first ack response");
    let second = broker
        .wait_for_response(CONTROLLED_NETWORK_OBSERVATION)
        .expect("duplicate ack response");
    assert_eq!(first["schema_id"], "yeonjang.response-ack-result.v2");
    assert_eq!(first["payload"]["outcome"], "accepted");
    assert_eq!(first["payload"]["delivery_revision"], 2);
    assert_eq!(second["payload"]["outcome"], "duplicate");
    assert_eq!(second["payload"]["delivery_revision"], 2);
    assert_eq!(effects.load(Ordering::SeqCst), 0);
    assert_eq!(
        delivery_repository
            .load_exact("receipt-v2")
            .expect("delivery receipt")
            .state(),
        V2DeliveryReceiptState::ConsumerAcknowledged
    );

    shutdown_tx.send(true).expect("shutdown");
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(5), task)
            .await
            .expect("stop timeout")
            .expect("pump task")
            .expect("pump result"),
        MqttV2PumpOutcome::Stopped
    );
    broker.stop().expect("broker stop");
}

struct OverlapPort {
    active: Arc<AtomicUsize>,
    max_active: Arc<AtomicUsize>,
    calls: Arc<AtomicUsize>,
}

struct OrderedCameraPort {
    first_effect_started: mpsc::Sender<()>,
    first_effect_active: Arc<AtomicUsize>,
    effects: Arc<Mutex<Vec<String>>>,
}

impl PlatformCapabilityPort for OrderedCameraPort {
    fn preflight(
        &self,
        operation: &BoundPlatformOperation,
    ) -> Result<PlatformPreflightReceipt, ExecutionFailure> {
        if operation.request_id() == "request-resource-waiter" {
            let deadline = Instant::now() + Duration::from_secs(3);
            while self.first_effect_active.load(Ordering::SeqCst) == 0 {
                assert!(
                    Instant::now() < deadline,
                    "first command did not own the camera resource"
                );
                std::thread::sleep(Duration::from_millis(2));
            }
        }
        PlatformPreflightReceipt::for_operation(
            operation,
            PreflightObservation {
                capability_available: true,
                permission: PreflightPermissionState::Granted,
                resource_fingerprint: "camera-ordered".to_string(),
                observed_at_ms: 1_000,
            },
        )
        .map_err(|error| panic!("fixture: {error}"))
    }

    fn execute(
        &self,
        operation: &BoundPlatformOperation,
        _: &PlatformPreflightReceipt,
    ) -> Result<PlatformEffectReceipt, ExecutionFailure> {
        self.effects
            .lock()
            .expect("effect calls")
            .push(operation.request_id().to_string());
        if operation.request_id() == "request-resource-first" {
            self.first_effect_active.store(1, Ordering::SeqCst);
            self.first_effect_started
                .send(())
                .expect("first effect signal");
            std::thread::sleep(Duration::from_millis(300));
            self.first_effect_active.store(0, Ordering::SeqCst);
        }
        PlatformEffectReceipt::for_operation(operation, "native:ordered".to_string(), 1_100)
            .map_err(|error| panic!("fixture: {error}"))
    }
}

impl PlatformCapabilityPort for OverlapPort {
    fn preflight(
        &self,
        operation: &BoundPlatformOperation,
    ) -> Result<PlatformPreflightReceipt, ExecutionFailure> {
        PlatformPreflightReceipt::for_operation(
            operation,
            PreflightObservation {
                capability_available: true,
                permission: PreflightPermissionState::Granted,
                resource_fingerprint: "camera-overlap".to_string(),
                observed_at_ms: 1_000,
            },
        )
        .map_err(|error| panic!("fixture: {error}"))
    }

    fn execute(
        &self,
        operation: &BoundPlatformOperation,
        _: &PlatformPreflightReceipt,
    ) -> Result<PlatformEffectReceipt, ExecutionFailure> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        let active = self.active.fetch_add(1, Ordering::SeqCst) + 1;
        self.max_active.fetch_max(active, Ordering::SeqCst);
        std::thread::sleep(Duration::from_millis(100));
        self.active.fetch_sub(1, Ordering::SeqCst);
        Ok(
            PlatformEffectReceipt::for_operation(operation, "native:overlap".to_string(), 1_100)
                .expect("effect receipt"),
        )
    }
}

#[derive(Default)]
struct SequencedPumpContext(AtomicUsize);

impl MqttV2PumpContextProvider for SequencedPumpContext {
    fn context(&self) -> Result<MqttV2PumpContext, MqttV2PumpContextError> {
        let sequence = self.0.fetch_add(1, Ordering::SeqCst);
        Ok(MqttV2PumpContext {
            now_ms: 1_000,
            binding: V2OperationBindingContext {
                target_platform: TargetPlatform::Macos,
                policy_revision: 1,
                artifact_lease_ref: Some(format!("artifact-v2-{sequence}")),
            },
            response_signing: V2ResponseSigningContext {
                message_id: format!("response-message-v2-{sequence}"),
                issued_at: 1_100,
                expires_at: 3_000,
                issuer: "instance-a".to_string(),
                key_id: "response-key-v2".to_string(),
                audience: "requester-a".to_string(),
                nonce: format!("response-nonce-v2-{sequence}"),
            },
        })
    }
}

struct FixedPumpContext;

impl MqttV2PumpContextProvider for FixedPumpContext {
    fn context(&self) -> Result<MqttV2PumpContext, MqttV2PumpContextError> {
        Ok(MqttV2PumpContext {
            now_ms: 1_000,
            binding: binding(),
            response_signing: signing_context(),
        })
    }
}

struct PumpStageClock;
impl StageTimingClock for PumpStageClock {
    fn wall_time_ms(&self) -> i64 {
        5_000
    }

    fn monotonic_time_us(&self) -> u64 {
        10_000
    }
}

#[derive(Default)]
struct PumpStageValues(Mutex<Vec<StageTimingEvidence>>);

impl PumpStageValues {
    fn values(&self) -> Vec<StageTimingEvidence> {
        self.0.lock().expect("stage timing values").clone()
    }
}

impl StageTimingSink for PumpStageValues {
    fn record(&self, evidence: StageTimingEvidence) -> Result<(), StageTimingWriteError> {
        self.0
            .lock()
            .map_err(|_| StageTimingWriteError::Unavailable)?
            .push(evidence);
        Ok(())
    }
}

async fn wait_for_controlled_client(broker: &ControlledMqttBroker) -> Result<String, String> {
    tokio::time::timeout(Duration::from_secs(15), async {
        loop {
            if let Some(client_id) = broker.try_client_id()? {
                return Ok(client_id);
            }
            tokio::time::sleep(Duration::from_millis(1)).await;
        }
    })
    .await
    .map_err(|_| "timed out waiting for controlled client".to_string())?
}

fn response_adapter(calls: Arc<AtomicUsize>) -> MqttV2ResponseAdapter {
    response_adapter_with_port(Arc::new(SuccessPort(calls)))
}

fn response_adapter_with_port(port: Arc<dyn PlatformCapabilityPort>) -> MqttV2ResponseAdapter {
    response_adapter_with_registry_and_port(Arc::new(ActiveCommandRegistry::default()), port)
}

fn response_adapter_with_registry_and_port(
    registry: Arc<ActiveCommandRegistry>,
    port: Arc<dyn PlatformCapabilityPort>,
) -> MqttV2ResponseAdapter {
    let handler = MqttV2CommandHandler::new(
        topics(),
        Arc::new(AcceptSignatures),
        Arc::new(InMemoryAuthorizationReplayGuard::new(8).expect("replay")),
        Arc::new(InMemoryV2TerminalRepository::new(8).expect("terminal")),
        Arc::clone(&registry),
        Arc::new(AllowedPolicy),
        ExecuteCapabilityUseCase::new(port, Arc::new(FixedClock), registry, 100)
            .with_resource_admission(Arc::new(
                BlockingExecutionResourceAdmission::new(8).expect("resource admission"),
            )),
    );
    MqttV2ResponseAdapter::new(handler, Arc::new(FixedResponseSigner))
}

fn control_adapter(registry: Arc<ActiveCommandRegistry>) -> MqttV2ControlAdapter {
    MqttV2ControlAdapter::new(
        topics(),
        Arc::new(AcceptControlSignatures),
        Arc::new(InMemoryAuthorizationReplayGuard::new(8).expect("control replay")),
        V2CancelUseCase::new(
            registry,
            V2CancelOwnerScope::new(
                "instance-a",
                "session-a",
                format!("sha256:{}", "34".repeat(32)),
            )
            .expect("cancel owner"),
        ),
        Arc::new(FixedResponseSigner),
    )
}

fn control_router(registry: Arc<ActiveCommandRegistry>) -> MqttV2ControlRouter {
    control_router_with_receipt(
        registry,
        Arc::new(InMemoryV2TerminalRepository::new(8).expect("receipt repository")),
    )
}

fn control_router_with_receipt(
    registry: Arc<ActiveCommandRegistry>,
    receipt_repository: Arc<dyn V2TerminalRepository>,
) -> MqttV2ControlRouter {
    control_router_with_stores(registry, receipt_repository, Arc::new(MissingDeliveryStore))
}

fn control_router_with_stores(
    registry: Arc<ActiveCommandRegistry>,
    receipt_repository: Arc<dyn V2TerminalRepository>,
    delivery_receipts: Arc<dyn V2DeliveryReceiptStore>,
) -> MqttV2ControlRouter {
    let receipt_adapter = MqttV2ReceiptQueryAdapter::new(
        topics(),
        Arc::new(AcceptReceiptSignatures),
        Arc::new(InMemoryAuthorizationReplayGuard::new(8).expect("receipt replay")),
        V2ReceiptQueryUseCase::new(
            receipt_repository,
            V2ReceiptQueryOwnerScope::new(
                "instance-a",
                "session-a",
                format!("sha256:{}", "34".repeat(32)),
            )
            .expect("receipt owner"),
        ),
        Arc::new(FixedResponseSigner),
    );
    let ack_adapter = MqttV2ResponseAckAdapter::new(
        topics(),
        Arc::new(AcceptResponseAckSignatures),
        Arc::new(InMemoryAuthorizationReplayGuard::new(8).expect("ack replay")),
        V2ResponseAckUseCase::new(
            delivery_receipts,
            V2ResponseAckOwnerScope::new(
                "instance-a",
                "session-a",
                format!("sha256:{}", "34".repeat(32)),
            )
            .expect("ack owner"),
        ),
        Arc::new(FixedResponseSigner),
    );
    MqttV2ControlRouter::new(control_adapter(registry), receipt_adapter, ack_adapter)
        .expect("control router")
}

struct MissingDeliveryStore;
impl V2DeliveryReceiptStore for MissingDeliveryStore {
    fn register(
        &self,
        _: V2DeliveryReceipt,
    ) -> knowbee_yeonjang::v2_delivery_receipt::V2DeliveryRegisterResult {
        knowbee_yeonjang::v2_delivery_receipt::V2DeliveryRegisterResult::Unavailable
    }

    fn mark_published(
        &self,
        _: &str,
    ) -> knowbee_yeonjang::v2_delivery_receipt::V2DeliveryPublishResult {
        knowbee_yeonjang::v2_delivery_receipt::V2DeliveryPublishResult::Unavailable
    }

    fn acknowledge(&self, _: &V2DeliveryAckBinding) -> V2DeliveryAckStoreResult {
        V2DeliveryAckStoreResult::NotFound
    }
}

struct FailingDeliveryStore;
impl V2DeliveryReceiptStore for FailingDeliveryStore {
    fn register(
        &self,
        _: V2DeliveryReceipt,
    ) -> knowbee_yeonjang::v2_delivery_receipt::V2DeliveryRegisterResult {
        knowbee_yeonjang::v2_delivery_receipt::V2DeliveryRegisterResult::Unavailable
    }

    fn mark_published(
        &self,
        _: &str,
    ) -> knowbee_yeonjang::v2_delivery_receipt::V2DeliveryPublishResult {
        knowbee_yeonjang::v2_delivery_receipt::V2DeliveryPublishResult::Unavailable
    }

    fn acknowledge(&self, _: &V2DeliveryAckBinding) -> V2DeliveryAckStoreResult {
        V2DeliveryAckStoreResult::Unavailable
    }
}

fn test_delivery_repository() -> Arc<DurableV2DeliveryRepository> {
    Arc::new(
        DurableV2DeliveryRepository::bootstrap(32, Arc::new(ControlledMemoryStorage::default()))
            .expect("delivery repository"),
    )
}

struct ControlledReceiptRepository {
    lookups: Arc<AtomicUsize>,
    terminal: V2TerminalResponseContent,
}

impl V2TerminalRepository for ControlledReceiptRepository {
    fn prepare(&self, _: &V2TerminalScope, _: V2TerminalResponseContent) -> V2TerminalClaim {
        panic!("receipt route must not claim")
    }

    fn lookup(&self, _: &V2TerminalScope) -> V2TerminalLookup {
        self.lookups.fetch_add(1, Ordering::SeqCst);
        V2TerminalLookup::Completed(Box::new(self.terminal.clone()))
    }

    fn complete(&self, _: &V2TerminalScope, _: V2TerminalResponseContent) -> V2TerminalComplete {
        panic!("receipt route must not complete")
    }
}

struct DelayedPreflightPort {
    started: mpsc::Sender<()>,
    effects: Arc<AtomicUsize>,
    registry: Arc<ActiveCommandRegistry>,
}

struct ShutdownWaitingPort {
    started: mpsc::Sender<()>,
    effects: Arc<AtomicUsize>,
    registry: Arc<ActiveCommandRegistry>,
}

impl PlatformCapabilityPort for ShutdownWaitingPort {
    fn preflight(
        &self,
        operation: &BoundPlatformOperation,
    ) -> Result<PlatformPreflightReceipt, ExecutionFailure> {
        self.started.send(()).expect("preflight start signal");
        let deadline = Instant::now() + Duration::from_secs(3);
        while !self.registry.is_cancelled_id(operation.cancellation_id()) {
            assert!(Instant::now() < deadline, "runtime did not cancel command");
            std::thread::sleep(Duration::from_millis(5));
        }
        PlatformPreflightReceipt::for_operation(
            operation,
            PreflightObservation {
                capability_available: true,
                permission: PreflightPermissionState::Granted,
                resource_fingerprint: "camera-shutdown".to_string(),
                observed_at_ms: 1_000,
            },
        )
        .map_err(|error| panic!("fixture: {error}"))
    }

    fn execute(
        &self,
        operation: &BoundPlatformOperation,
        _: &PlatformPreflightReceipt,
    ) -> Result<PlatformEffectReceipt, ExecutionFailure> {
        self.effects.fetch_add(1, Ordering::SeqCst);
        PlatformEffectReceipt::for_operation(operation, "native:unexpected".to_string(), 1_001)
            .map_err(|error| panic!("fixture: {error}"))
    }
}

impl PlatformCapabilityPort for DelayedPreflightPort {
    fn preflight(
        &self,
        operation: &BoundPlatformOperation,
    ) -> Result<PlatformPreflightReceipt, ExecutionFailure> {
        self.started.send(()).expect("preflight start signal");
        let deadline = Instant::now() + Duration::from_secs(3);
        while !self.registry.is_cancelled_id("cancel-v2") {
            assert!(
                Instant::now() < deadline,
                "control did not signal the active command"
            );
            std::thread::sleep(Duration::from_millis(5));
        }
        PlatformPreflightReceipt::for_operation(
            operation,
            PreflightObservation {
                capability_available: true,
                permission: PreflightPermissionState::Granted,
                resource_fingerprint: "camera-cancel".to_string(),
                observed_at_ms: 1_000,
            },
        )
        .map_err(|error| panic!("fixture: {error}"))
    }

    fn execute(
        &self,
        operation: &BoundPlatformOperation,
        _: &PlatformPreflightReceipt,
    ) -> Result<PlatformEffectReceipt, ExecutionFailure> {
        self.effects.fetch_add(1, Ordering::SeqCst);
        Ok(
            PlatformEffectReceipt::for_operation(operation, "native:unexpected".to_string(), 1_001)
                .expect("effect receipt"),
        )
    }
}

struct SuccessPort(Arc<AtomicUsize>);
impl PlatformCapabilityPort for SuccessPort {
    fn preflight(
        &self,
        operation: &BoundPlatformOperation,
    ) -> Result<PlatformPreflightReceipt, ExecutionFailure> {
        PlatformPreflightReceipt::for_operation(
            operation,
            PreflightObservation {
                capability_available: true,
                permission: PreflightPermissionState::Granted,
                resource_fingerprint: "camera-reference".to_string(),
                observed_at_ms: 1_000,
            },
        )
        .map_err(|error| panic!("fixture: {error}"))
    }

    fn execute(
        &self,
        operation: &BoundPlatformOperation,
        _: &PlatformPreflightReceipt,
    ) -> Result<PlatformEffectReceipt, ExecutionFailure> {
        self.0.fetch_add(1, Ordering::SeqCst);
        Ok(
            PlatformEffectReceipt::for_operation(operation, "native:reference".to_string(), 1_001)
                .expect("effect receipt"),
        )
    }
}

struct LeaseArtifactPort {
    lease: Mutex<Option<CaptureArtifactLease>>,
    bytes: Vec<u8>,
    effects: Arc<AtomicUsize>,
}

impl LeaseArtifactPort {
    fn new(lease: CaptureArtifactLease, bytes: Vec<u8>) -> Self {
        Self::with_effects(lease, bytes, Arc::new(AtomicUsize::new(0)))
    }

    fn with_effects(
        lease: CaptureArtifactLease,
        bytes: Vec<u8>,
        effects: Arc<AtomicUsize>,
    ) -> Self {
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
                resource_fingerprint: "camera-artifact".to_string(),
                observed_at_ms: 1_000,
            },
        )
        .map_err(|error| panic!("fixture: {error}"))
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
            .expect("single artifact effect");
        std::fs::write(lease.output_path(), &self.bytes).expect("artifact bytes");
        let persisted = lease.commit().expect("artifact commit");
        let artifact = PlatformCaptureArtifactReceipt::new(
            persisted.artifact_ref(),
            persisted.metadata().kind(),
            persisted.metadata().size_bytes(),
            persisted.metadata().sha256_digest(),
        )
        .expect("artifact evidence");
        PlatformEffectReceipt::for_capture_operation(operation, artifact, 1_000)
            .map_err(|error| panic!("fixture: {error}"))
    }
}

struct FixedClock;
impl ExecutionClock for FixedClock {
    fn now_ms(&self) -> i64 {
        1_000
    }
}
struct AllowedPolicy;
impl PermissionPolicyReader for AllowedPolicy {
    fn snapshot(&self) -> PolicySnapshotRead {
        let initial = PermissionPolicySnapshot::new("instance-a").expect("policy");
        let camera = PolicyUpdateCommand::new(
            "instance-a",
            0,
            PolicyCapability::CameraCapture,
            PolicyDecision::Allowed,
            PolicyResourceConstraint::Any,
        )
        .expect("update");
        let camera = match apply_policy_update(&initial, &camera) {
            PolicyTransition::Applied { snapshot, .. } => snapshot,
            other => panic!("allowed camera policy: {other:?}"),
        };
        let screen = PolicyUpdateCommand::new(
            "instance-a",
            1,
            PolicyCapability::ScreenCapture,
            PolicyDecision::Allowed,
            PolicyResourceConstraint::Any,
        )
        .expect("screen update");
        match apply_policy_update(&camera, &screen) {
            PolicyTransition::Applied { snapshot, .. } => PolicySnapshotRead::Snapshot(snapshot),
            other => panic!("allowed screen policy: {other:?}"),
        }
    }
}
struct AcceptSignatures;
impl V2CommandSignatureVerifier for AcceptSignatures {
    fn verify(&self, _: &str, _: &str, _: &[u8], _: &str) -> bool {
        true
    }
}
struct AcceptControlSignatures;
impl V2ControlSignatureVerifier for AcceptControlSignatures {
    fn verify(&self, _: &str, _: &str, _: &[u8], _: &str) -> bool {
        true
    }
}
struct AcceptReceiptSignatures;
impl V2ReceiptQuerySignatureVerifier for AcceptReceiptSignatures {
    fn verify(&self, _: &str, _: &str, _: &[u8], _: &str) -> bool {
        true
    }
}
struct AcceptResponseAckSignatures;
impl V2ResponseAckSignatureVerifier for AcceptResponseAckSignatures {
    fn verify(&self, _: &str, _: &str, _: &[u8], _: &str) -> bool {
        true
    }
}
struct AcceptArtifactSignatures;
impl V2ArtifactSignatureVerifier for AcceptArtifactSignatures {
    fn verify(&self, _: &str, _: &str, _: &[u8], _: &str) -> bool {
        true
    }
}
struct AcceptPolicyAdmin;
impl V2PolicyAdminSignatureVerifier for AcceptPolicyAdmin {
    fn verify(&self, _: &str, _: &str, _: &[u8], _: &str) -> bool {
        true
    }
}
impl PolicyAdminAuthorizationVerifier for AcceptPolicyAdmin {
    fn verify(&self, _: &PolicyAdminAuthorizationGrant) -> PolicyAdminAuthorizationDecision {
        PolicyAdminAuthorizationDecision::Authorized
    }
}
struct FixedResponseSigner;
impl V2ResponseSigner for FixedResponseSigner {
    fn sign(&self, _: &str, _: &str, _: &[u8]) -> Result<String, V2ResponseSignerError> {
        Ok("aa".repeat(32))
    }
}

fn topics() -> MqttV2TopicSet {
    MqttV2TopicSet::new("instance-a", "session-a", "requester-a").expect("topics")
}
fn binding() -> V2OperationBindingContext {
    V2OperationBindingContext {
        target_platform: TargetPlatform::Macos,
        policy_revision: 1,
        artifact_lease_ref: Some("artifact-v2".to_string()),
    }
}
fn signing_context() -> V2ResponseSigningContext {
    V2ResponseSigningContext {
        message_id: "response-message-v2".to_string(),
        issued_at: 1_100,
        expires_at: 3_000,
        issuer: "instance-a".to_string(),
        key_id: "response-key-v2".to_string(),
        audience: "requester-a".to_string(),
        nonce: "response-nonce-v2".to_string(),
    }
}
fn valid_command() -> serde_json::Value {
    serde_json::json!({
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
            "nonce": "nonce-v2", "signature": "aa".repeat(32)
        }
    })
}

fn valid_policy_admin() -> serde_json::Value {
    serde_json::json!({
        "protocol_version": 2, "schema_id": "yeonjang.admin.v2",
        "message_kind": "admin", "message_id": "message-admin",
        "request_id": "request-admin", "command_id": "command-admin",
        "operation_id": "operation-admin", "correlation_id": "correlation-admin",
        "causation_id": "causation-admin", "requester_id": "requester-a",
        "target_instance_id": "instance-a", "target_session_id": "session-a",
        "target_fingerprint": format!("sha256:{}", "aa".repeat(32)),
        "idempotency_key": "idempotency-admin", "issued_at": 900,
        "expires_at": 2_000, "sequence": 1,
        "payload": {
            "admin": "policy.update",
            "params": {
                "expected_revision": 0,
                "capability": "camera.capture",
                "decision": "allowed",
                "resource": {"kind": "any"},
                "reason": "enable camera"
            }
        },
        "authorization": {
            "schema_version": 1, "authorization_id": "authorization-admin",
            "issuer": "issuer-v2", "key_id": "key-v2", "audience": "instance-a",
            "scope": "admin.policy.write", "requester_id": "requester-a",
            "command_id": "command-admin", "operation_id": "operation-admin",
            "target_instance_id": "instance-a", "target_session_id": "session-a",
            "target_fingerprint": format!("sha256:{}", "aa".repeat(32)),
            "idempotency_key": "idempotency-admin", "expires_at": 2_000,
            "nonce": "nonce-admin", "signature": "aa".repeat(32)
        }
    })
}

fn valid_command_with(suffix: &str) -> serde_json::Value {
    let mut value = valid_command();
    for (field, prefix) in [
        ("message_id", "message"),
        ("request_id", "request"),
        ("command_id", "command"),
        ("operation_id", "operation"),
        ("correlation_id", "correlation"),
        ("causation_id", "causation"),
        ("idempotency_key", "idempotency"),
    ] {
        value[field] = format!("{prefix}-{suffix}").into();
    }
    value["authorization"]["authorization_id"] = format!("authorization-{suffix}").into();
    value["authorization"]["command_id"] = format!("command-{suffix}").into();
    value["authorization"]["operation_id"] = format!("operation-{suffix}").into();
    value["authorization"]["idempotency_key"] = format!("idempotency-{suffix}").into();
    value["cancellation_id"] = format!("cancel-{suffix}").into();
    value["cancel_token"] = format!("cancel-token-{suffix}").into();
    value["authorization"]["cancellation_id"] = format!("cancel-{suffix}").into();
    value["authorization"]["cancel_token"] = format!("cancel-token-{suffix}").into();
    value["authorization"]["nonce"] = format!("nonce-{suffix}").into();
    value
}

fn valid_screen_command_with(suffix: &str) -> serde_json::Value {
    let mut value = valid_command_with(suffix);
    value["payload"]["method"] = "screen.capture".into();
    value["payload"]["params"] = serde_json::json!({});
    value["authorization"]["method"] = "screen.capture".into();
    value["authorization"]["resource"] = "screen".into();
    value
}

fn valid_cancel_control() -> serde_json::Value {
    serde_json::json!({
        "protocol_version": 2, "schema_id": "yeonjang.control.v2",
        "message_kind": "control", "message_id": "cancel-message-v2",
        "request_id": "cancel-request-v2", "command_id": "cancel-command-v2",
        "operation_id": "cancel-operation-v2", "correlation_id": "cancel-correlation-v2",
        "causation_id": "message-v2", "requester_id": "requester-a",
        "target_instance_id": "instance-a", "target_session_id": "session-a",
        "target_fingerprint": format!("sha256:{}", "34".repeat(32)),
        "idempotency_key": "cancel-idempotency-v2", "issued_at": 900,
        "expires_at": 2_000, "sequence": 1,
        "payload": {"control": "command.cancel", "params": {
            "target_request_id": "request-v2", "target_command_id": "command-v2",
            "target_operation_id": "operation-v2",
            "target_idempotency_key": "idempotency-v2",
            "cancellation_id": "cancel-v2", "cancel_token": "cancel-token-v2",
            "reason": "user_requested"
        }},
        "authorization": {
            "schema_version": 1, "authorization_id": "cancel-authorization-v2",
            "issuer": "issuer-v2", "key_id": "key-v2", "audience": "instance-a",
            "scope": "effect.cancel", "requester_id": "requester-a",
            "command_id": "cancel-command-v2", "operation_id": "cancel-operation-v2",
            "target_instance_id": "instance-a", "target_session_id": "session-a",
            "target_fingerprint": format!("sha256:{}", "34".repeat(32)),
            "idempotency_key": "cancel-idempotency-v2",
            "target_request_id": "request-v2", "target_command_id": "command-v2",
            "target_operation_id": "operation-v2",
            "target_idempotency_key": "idempotency-v2",
            "cancellation_id": "cancel-v2", "cancel_token": "cancel-token-v2",
            "expires_at": 2_000, "nonce": "cancel-nonce-v2",
            "signature": "bb".repeat(32)
        }
    })
}

fn valid_cancel_control_for(suffix: &str) -> serde_json::Value {
    let mut value = valid_cancel_control();
    for (field, prefix) in [
        ("message_id", "cancel-message"),
        ("request_id", "cancel-request"),
        ("command_id", "cancel-command"),
        ("operation_id", "cancel-operation"),
        ("correlation_id", "cancel-correlation"),
        ("idempotency_key", "cancel-idempotency"),
    ] {
        value[field] = format!("{prefix}-{suffix}").into();
    }
    value["causation_id"] = format!("message-{suffix}").into();
    for (field, prefix) in [
        ("target_request_id", "request"),
        ("target_command_id", "command"),
        ("target_operation_id", "operation"),
        ("target_idempotency_key", "idempotency"),
        ("cancellation_id", "cancel"),
        ("cancel_token", "cancel-token"),
    ] {
        value["payload"]["params"][field] = format!("{prefix}-{suffix}").into();
        value["authorization"][field] = format!("{prefix}-{suffix}").into();
    }
    value["authorization"]["authorization_id"] = format!("cancel-authorization-{suffix}").into();
    value["authorization"]["command_id"] = format!("cancel-command-{suffix}").into();
    value["authorization"]["operation_id"] = format!("cancel-operation-{suffix}").into();
    value["authorization"]["idempotency_key"] = format!("cancel-idempotency-{suffix}").into();
    value["authorization"]["nonce"] = format!("cancel-nonce-{suffix}").into();
    value
}

fn valid_receipt_query() -> serde_json::Value {
    serde_json::json!({
        "protocol_version": 2, "schema_id": "yeonjang.control.v2",
        "message_kind": "control", "message_id": "receipt-message-v2",
        "request_id": "receipt-request-v2", "command_id": "receipt-command-v2",
        "operation_id": "receipt-operation-v2", "correlation_id": "receipt-correlation-v2",
        "causation_id": "message-v2", "requester_id": "requester-a",
        "target_instance_id": "instance-a", "target_session_id": "session-a",
        "target_fingerprint": format!("sha256:{}", "34".repeat(32)),
        "idempotency_key": "receipt-idempotency-v2", "issued_at": 900,
        "expires_at": 2_000, "sequence": 1,
        "payload": {"control": "receipt.get", "params": {
            "target_request_id": "request-v2", "target_command_id": "command-v2",
            "target_operation_id": "operation-v2",
            "target_idempotency_key": "idempotency-v2",
            "target_scope_digest": format!("sha256:{}", "56".repeat(32)),
            "expected_terminal_revision": 1
        }},
        "authorization": {
            "schema_version": 1, "authorization_id": "receipt-authorization-v2",
            "issuer": "issuer-v2", "key_id": "key-v2", "audience": "instance-a",
            "scope": "receipt.read", "requester_id": "requester-a",
            "command_id": "receipt-command-v2", "operation_id": "receipt-operation-v2",
            "target_instance_id": "instance-a", "target_session_id": "session-a",
            "target_fingerprint": format!("sha256:{}", "34".repeat(32)),
            "idempotency_key": "receipt-idempotency-v2",
            "target_request_id": "request-v2", "target_command_id": "command-v2",
            "target_operation_id": "operation-v2",
            "target_idempotency_key": "idempotency-v2",
            "target_scope_digest": format!("sha256:{}", "56".repeat(32)),
            "expected_terminal_revision": 1, "expires_at": 2_000,
            "nonce": "receipt-nonce-v2", "signature": "bb".repeat(32)
        }
    })
}

fn controlled_terminal_content() -> V2TerminalResponseContent {
    serde_json::from_value(serde_json::json!({
        "schema_version": 1,
        "request_id": "request-v2", "command_id": "command-v2",
        "operation_id": "operation-v2", "requester_id": "requester-a",
        "correlation_id": "correlation-v2", "causation_id": "message-v2",
        "target_instance_id": "instance-a", "target_session_id": "session-a",
        "target_fingerprint": format!("sha256:{}", "34".repeat(32)),
        "idempotency_key": "idempotency-v2",
        "terminal": {
            "schema_version": 1,
            "request_id": "request-v2", "command_id": "command-v2",
            "operation_id": "operation-v2", "requester_id": "requester-a",
            "target": {
                "platform": "macos", "instance_id": "instance-a",
                "session_id": "session-a",
                "fingerprint": format!("sha256:{}", "34".repeat(32))
            },
            "method": "camera.capture", "resource": "camera",
            "idempotency_key": "idempotency-v2",
            "binding_digest": format!("sha256:{}", "78".repeat(32)),
            "execution_outcome": "succeeded", "delivery_outcome": "not_started",
            "terminal_revision": 1
        }
    }))
    .expect("controlled terminal")
}

fn valid_response_ack() -> serde_json::Value {
    serde_json::json!({
        "protocol_version": 2, "schema_id": "yeonjang.control.v2",
        "message_kind": "control", "message_id": "ack-message-v2",
        "request_id": "ack-request-v2", "command_id": "ack-command-v2",
        "operation_id": "ack-operation-v2", "correlation_id": "ack-correlation-v2",
        "causation_id": "response-message-v2", "requester_id": "requester-a",
        "target_instance_id": "instance-a", "target_session_id": "session-a",
        "target_fingerprint": format!("sha256:{}", "34".repeat(32)),
        "idempotency_key": "ack-idempotency-v2", "issued_at": 900,
        "expires_at": 2_000, "sequence": 1,
        "payload": {"control": "response.ack", "params": {
            "receipt_id": "receipt-v2",
            "target_request_id": "request-v2", "target_command_id": "command-v2",
            "target_operation_id": "operation-v2",
            "target_idempotency_key": "idempotency-v2", "terminal_revision": 1,
            "response_digest": format!("sha256:{}", "9a".repeat(32))
        }},
        "authorization": {
            "schema_version": 1, "authorization_id": "ack-authorization-v2",
            "issuer": "issuer-v2", "key_id": "key-v2", "audience": "instance-a",
            "scope": "response.ack", "requester_id": "requester-a",
            "command_id": "ack-command-v2", "operation_id": "ack-operation-v2",
            "target_instance_id": "instance-a", "target_session_id": "session-a",
            "target_fingerprint": format!("sha256:{}", "34".repeat(32)),
            "idempotency_key": "ack-idempotency-v2", "receipt_id": "receipt-v2",
            "target_request_id": "request-v2", "target_command_id": "command-v2",
            "target_operation_id": "operation-v2",
            "target_idempotency_key": "idempotency-v2", "terminal_revision": 1,
            "response_digest": format!("sha256:{}", "9a".repeat(32)),
            "expires_at": 2_000, "nonce": "ack-nonce-v2",
            "signature": "bb".repeat(32)
        }
    })
}

fn valid_artifact_fetch(binding: &ArtifactBinding) -> serde_json::Value {
    valid_artifact_control(
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

fn valid_artifact_ack(binding: &ArtifactBinding) -> serde_json::Value {
    valid_artifact_control(
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

fn valid_artifact_cancel(binding: &ArtifactBinding) -> serde_json::Value {
    let mut value = valid_artifact_control(
        "cancel",
        serde_json::json!({
            "artifact": "artifact.cancel",
            "params": {
                "artifact_ref": binding.artifact_ref(),
                "owner_request_id": binding.owner_request_id(),
                "owner_operation_id": binding.owner_operation_id(),
                "expected_revision": 1,
                "transfer_id": "transfer-a"
            }
        }),
        binding,
        None,
        None,
    );
    value["authorization"]["scope"] = "artifact.cancel".into();
    value["authorization"]["expected_revision"] = 1.into();
    value
}

fn valid_artifact_control(
    variant: &str,
    payload: serde_json::Value,
    binding: &ArtifactBinding,
    full_digest: Option<&str>,
    chunk_payload_bytes: Option<u32>,
) -> serde_json::Value {
    serde_json::json!({
        "protocol_version": 2,
        "schema_id": "yeonjang.artifact-control.v2",
        "message_kind": "control",
        "message_id": format!("artifact-message-{variant}"),
        "request_id": format!("artifact-request-{variant}"),
        "command_id": format!("artifact-command-{variant}"),
        "operation_id": format!("artifact-operation-{variant}"),
        "correlation_id": "artifact-correlation",
        "causation_id": "camera-message",
        "requester_id": "requester-a",
        "target_instance_id": "instance-a",
        "target_session_id": "session-a",
        "target_fingerprint": format!("sha256:{}", "34".repeat(32)),
        "idempotency_key": format!("artifact-idem-{variant}"),
        "issued_at": 900,
        "expires_at": 2_000,
        "sequence": 1,
        "payload": payload,
        "authorization": {
            "schema_version": 1,
            "authorization_id": format!("artifact-authorization-{variant}"),
            "issuer": "issuer-v2",
            "key_id": "key-v2",
            "audience": "instance-a",
            "scope": "artifact.read",
            "requester_id": "requester-a",
            "command_id": format!("artifact-command-{variant}"),
            "operation_id": format!("artifact-operation-{variant}"),
            "target_instance_id": "instance-a",
            "target_session_id": "session-a",
            "target_fingerprint": format!("sha256:{}", "34".repeat(32)),
            "idempotency_key": format!("artifact-idem-{variant}"),
            "artifact_ref": binding.artifact_ref(),
            "owner_request_id": binding.owner_request_id(),
            "owner_operation_id": binding.owner_operation_id(),
            "transfer_id": "transfer-a",
            "expected_revision": if full_digest.is_some() { 2 } else { 0 },
            "full_digest": full_digest,
            "chunk_payload_bytes": chunk_payload_bytes,
            "expires_at": 2_000,
            "nonce": format!("artifact-nonce-{variant}"),
            "signature": "aa".repeat(32)
        }
    })
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

fn very_large_camera_bytes() -> Vec<u8> {
    let mut bytes = large_camera_bytes();
    bytes.truncate(bytes.len() - 2);
    bytes.resize(3_000_000, 11);
    bytes.extend_from_slice(&[0xff, 0xd9]);
    bytes
}

fn controlled_published_receipt() -> V2DeliveryReceipt {
    V2DeliveryReceipt::published(
        "receipt-v2",
        "requester-a",
        "request-v2",
        "command-v2",
        "operation-v2",
        "idempotency-v2",
        "instance-a",
        "session-a",
        &format!("sha256:{}", "34".repeat(32)),
        1,
        &format!("sha256:{}", "9a".repeat(32)),
    )
    .expect("published receipt")
}

#[derive(Default)]
struct ControlledMemoryStorage(Mutex<(u64, Vec<Vec<u8>>)>);

impl DurableRecordStorage for ControlledMemoryStorage {
    fn read(&self) -> RawStoreRead {
        let state = self.0.lock().expect("storage");
        RawStoreRead::Records {
            revision: state.0,
            records: state.1.clone(),
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
