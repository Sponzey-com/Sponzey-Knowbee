#![recursion_limit = "256"]

#[allow(dead_code)]
#[path = "support/controlled_mqtt_broker.rs"]
mod controlled_mqtt_broker;
#[path = "support/system_info_test_backend.rs"]
mod system_info_test_backend;

use std::net::TcpListener;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use controlled_mqtt_broker::ControlledMqttBroker;
use knowbee_yeonjang::atomic_local_storage::AtomicLocalStorage;
use knowbee_yeonjang::durable_completed_store::DurableRecordStorage;
use knowbee_yeonjang::instance_process_lease::{
    InstanceLeaseError, InstanceLeaseProvider, InstanceProcessLease,
};
use knowbee_yeonjang::legacy_capture_platform::{
    LegacyScreenPermissionProbe, ScreenPermissionProbeError,
};
use knowbee_yeonjang::mqtt_transport::MqttTransportSecurity;
use knowbee_yeonjang::mqtt_v2_crypto::{MqttV2HmacCrypto, V2HmacKeySnapshot};
use knowbee_yeonjang::mqtt_v2_production_bootstrap::{
    MqttV2BootstrapClock, MqttV2Enrollment, MqttV2ProductionBuildError, MqttV2ProductionConfig,
    MqttV2ProductionDependencies, MqttV2ProductionRuntime, UnavailableScreenPermissionProbe,
    canonical_target_fingerprint, derive_mqtt_v2_hmac_key, start_production_mqtt_v2,
    start_production_mqtt_v2_with_stage_timing,
};
use knowbee_yeonjang::mqtt_v2_runtime_composition::MqttV2RuntimeConnectionState;
use knowbee_yeonjang::mqtt_v2_topics::MqttV2TopicSet;
use knowbee_yeonjang::permission_policy::{
    PolicyCapability, PolicyDecision, PolicyResourceConstraint, PolicyUpdateCommand,
};
use knowbee_yeonjang::platform_operation::{PreflightPermissionState, TargetPlatform};
use knowbee_yeonjang::policy_repository::DurablePermissionPolicyRepository;
use knowbee_yeonjang::protocol_v2::parse_v2_command;
use knowbee_yeonjang::protocol_v2_policy_admin::parse_v2_policy_admin;
use knowbee_yeonjang::protocol_v2_terminal::V2ResponseSigner;
use knowbee_yeonjang::settings::{
    BrokerConnectionSettings, MqttV2EnrollmentSettings, YeonjangSettings,
};
use knowbee_yeonjang::stage_timing::StageTimingRecorder;
use system_info_test_backend::SystemInfoTestBackend;

const CONTROLLED_NETWORK_OBSERVATION: Duration = Duration::from_secs(20);

#[test]
fn production_bootstrap_exposes_opt_in_stage_timing_without_changing_default_dependencies() {
    let observed_start: fn(
        MqttV2ProductionConfig,
        MqttV2ProductionDependencies,
        tokio::runtime::Handle,
        StageTimingRecorder,
    ) -> Result<MqttV2ProductionRuntime, MqttV2ProductionBuildError> =
        start_production_mqtt_v2_with_stage_timing;
    let default_start: fn(
        MqttV2ProductionConfig,
        MqttV2ProductionDependencies,
        tokio::runtime::Handle,
    ) -> Result<MqttV2ProductionRuntime, MqttV2ProductionBuildError> = start_production_mqtt_v2;

    let _ = (observed_start, default_start);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn packaged_bootstrap_executes_signed_camera_once_without_legacy_runtime() {
    let terminal = packaged_capture(
        "camera.capture",
        serde_json::json!({"capture_timeout_ms": 1_000}),
        Arc::new(UnavailableScreenPermissionProbe),
    )
    .await;
    assert_eq!(
        terminal["payload"]["terminal"]["execution_outcome"],
        "succeeded"
    );
    assert_eq!(terminal["payload"]["schema_version"], 3);
    assert!(
        terminal["payload"]["artifact"]["artifactRef"]
            .as_str()
            .is_some_and(|value| value.starts_with("capture:"))
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn packaged_bootstrap_executes_signed_screen_capture_through_the_same_common_entry() {
    let terminal = packaged_capture(
        "screen.capture",
        serde_json::json!({"display": 0}),
        Arc::new(FixedScreenProbe),
    )
    .await;
    assert_eq!(
        terminal["payload"]["terminal"]["execution_outcome"],
        "succeeded"
    );
    assert_eq!(terminal["payload"]["schema_version"], 3);
    assert!(
        terminal["payload"]["artifact"]["artifactRef"]
            .as_str()
            .is_some_and(|value| value.starts_with("capture:"))
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn packaged_bootstrap_burst_duplicate_returns_two_results_with_one_effect() {
    let root = temporary_root();
    std::fs::create_dir_all(&root).expect("test root");
    let mut settings = production_settings(&root, true);
    let fingerprint = canonical_target_fingerprint(&settings);
    let topics = MqttV2TopicSet::new("instance-a", "session-a", "requester-a").expect("topics");
    let command = signed_command(
        &topics,
        &fingerprint,
        "camera.capture",
        serde_json::json!({"capture_timeout_ms": 1_000}),
        &request_signer(),
    );
    let broker = ControlledMqttBroker::start_production_burst_redelivery(
        topics.command(),
        topics.response(),
        command,
    )
    .expect("burst broker");
    settings.connection.port = broker.port();
    let backend = Arc::new(SystemInfoTestBackend::default());
    let config = MqttV2ProductionConfig::from_resolved_settings(
        settings.clone(),
        MqttV2Enrollment::from_settings(&settings),
        MqttTransportSecurity::LoopbackPlaintext,
        root.join("state"),
        TargetPlatform::Macos,
    )
    .expect("production config");
    let runtime = start_production_mqtt_v2(
        config,
        MqttV2ProductionDependencies {
            backend: backend.clone(),
            policy: durable_allowed_policy(&root),
            lease_provider: Arc::new(TestLeaseProvider),
            screen_permission: Arc::new(UnavailableScreenPermissionProbe),
            clock: Arc::new(FixedClock),
        },
        tokio::runtime::Handle::current(),
    )
    .expect("production runtime");

    let first =
        tokio::task::block_in_place(|| broker.wait_for_response(CONTROLLED_NETWORK_OBSERVATION))
            .expect("first duplicate result");
    let second =
        tokio::task::block_in_place(|| broker.wait_for_response(CONTROLLED_NETWORK_OBSERVATION))
            .expect("second duplicate result");
    let responses = [first, second];
    let terminals = responses
        .iter()
        .filter(|response| response["schema_id"] == "yeonjang.response.v2")
        .collect::<Vec<_>>();
    assert!(!terminals.is_empty());
    assert_eq!(backend.camera_capture_calls(), 1);
    assert!(!runtime.is_finished());

    assert_eq!(
        runtime.shutdown().await.expect("shutdown"),
        knowbee_yeonjang::mqtt_v2_command_pump::MqttV2PumpOutcome::Stopped
    );
    broker.stop().expect("broker stop");
    let _ = std::fs::remove_dir_all(root);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn packaged_bootstrap_reconnects_and_replays_one_terminal_without_repeating_the_effect() {
    let root = temporary_root();
    std::fs::create_dir_all(&root).expect("test root");
    let mut settings = production_settings(&root, true);
    let fingerprint = canonical_target_fingerprint(&settings);
    let topics = MqttV2TopicSet::new("instance-a", "session-a", "requester-a").expect("topics");
    let signer = request_signer();
    let broker = ControlledMqttBroker::start_v2_reconnect(
        topics.command(),
        topics.response(),
        topics.status(),
        topics.capabilities(),
        signed_command(
            &topics,
            &fingerprint,
            "camera.capture",
            serde_json::json!({"capture_timeout_ms": 1_000}),
            &signer,
        ),
    )
    .expect("reconnect broker");
    settings.connection.port = broker.port();
    let backend = Arc::new(SystemInfoTestBackend::default());
    let config = MqttV2ProductionConfig::from_resolved_settings(
        settings.clone(),
        MqttV2Enrollment::from_settings(&settings),
        MqttTransportSecurity::LoopbackPlaintext,
        root.join("state"),
        TargetPlatform::Macos,
    )
    .expect("production config");
    let runtime = start_production_mqtt_v2(
        config,
        MqttV2ProductionDependencies {
            backend: backend.clone(),
            policy: durable_allowed_policy(&root),
            lease_provider: Arc::new(TestLeaseProvider),
            screen_permission: Arc::new(UnavailableScreenPermissionProbe),
            clock: Arc::new(FixedClock),
        },
        tokio::runtime::Handle::current(),
    )
    .expect("production runtime");

    tokio::task::yield_now().await;
    let first_client = match tokio::task::block_in_place(|| {
        broker.wait_for_client_id(CONTROLLED_NETWORK_OBSERVATION)
    }) {
        Ok(client_id) => client_id,
        Err(wait_error) => {
            let runtime_state = runtime.connection_state();
            let runtime_result = runtime.shutdown().await;
            let broker_result = broker.stop();
            panic!(
                "first client unavailable: wait={wait_error}; state={runtime_state:?}; \
                 runtime={runtime_result:?}; broker={broker_result:?}"
            );
        }
    };
    let first_response = wait_for_reconnect_response(&broker, 0, 1);
    let second_client =
        tokio::task::block_in_place(|| broker.wait_for_client_id(CONTROLLED_NETWORK_OBSERVATION))
            .expect("second client");
    assert_eq!(first_client, second_client);
    let recovered = wait_for_reconnect_evidence(&broker);
    assert_eq!(
        recovered.responses[0]["payload"]["terminal"],
        first_response["payload"]["terminal"]
    );
    assert!(
        recovered.responses.iter().all(
            |response| response["payload"]["terminal"] == first_response["payload"]["terminal"]
        )
    );
    assert!(recovered.online);
    assert!(recovered.capabilities);
    assert_eq!(backend.camera_capture_calls(), 1);
    assert_eq!(backend.screen_capture_calls(), 0);
    assert!(!runtime.is_finished());

    assert_eq!(
        runtime.shutdown().await.expect("shutdown"),
        knowbee_yeonjang::mqtt_v2_command_pump::MqttV2PumpOutcome::Stopped
    );
    broker.stop().expect("broker stop");
    let _ = std::fs::remove_dir_all(root);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn packaged_restart_replays_completed_terminal_without_repeating_the_effect() {
    let root = temporary_root();
    std::fs::create_dir_all(&root).expect("test root");
    let state_root = root.join("state");
    let mut settings = production_settings(&root, true);
    let fingerprint = canonical_target_fingerprint(&settings);
    let topics = MqttV2TopicSet::new("instance-a", "session-a", "requester-a").expect("topics");
    let command = signed_command(
        &topics,
        &fingerprint,
        "camera.capture",
        serde_json::json!({"capture_timeout_ms": 1_000}),
        &request_signer(),
    );
    let policy = durable_allowed_policy(&root);
    let backend = Arc::new(SystemInfoTestBackend::default());

    let first_broker = ControlledMqttBroker::start_production_v2(
        topics.command(),
        topics.response(),
        command.clone(),
    )
    .expect("first broker");
    settings.connection.port = first_broker.port();
    let first_config = MqttV2ProductionConfig::from_resolved_settings(
        settings.clone(),
        MqttV2Enrollment::from_settings(&settings),
        MqttTransportSecurity::LoopbackPlaintext,
        state_root.clone(),
        TargetPlatform::Macos,
    )
    .expect("first config");
    let first_runtime = start_production_mqtt_v2(
        first_config,
        MqttV2ProductionDependencies {
            backend: backend.clone(),
            policy: policy.clone(),
            lease_provider: Arc::new(TestLeaseProvider),
            screen_permission: Arc::new(UnavailableScreenPermissionProbe),
            clock: Arc::new(FixedClock),
        },
        tokio::runtime::Handle::current(),
    )
    .expect("first runtime");
    tokio::task::yield_now().await;
    tokio::task::block_in_place(|| first_broker.wait_for_client_id(CONTROLLED_NETWORK_OBSERVATION))
        .expect("first client");
    let first = tokio::task::block_in_place(|| {
        first_broker.wait_for_response(CONTROLLED_NETWORK_OBSERVATION)
    })
    .expect("first terminal");
    assert_eq!(
        first["payload"]["terminal"]["execution_outcome"],
        "succeeded"
    );
    assert_eq!(backend.camera_capture_calls(), 1);
    assert_eq!(
        first_runtime.shutdown().await.expect("first shutdown"),
        knowbee_yeonjang::mqtt_v2_command_pump::MqttV2PumpOutcome::Stopped
    );
    first_broker.stop().expect("first broker stop");

    let second_broker =
        ControlledMqttBroker::start_production_v2(topics.command(), topics.response(), command)
            .expect("restart broker");
    settings.connection.port = second_broker.port();
    let second_config = MqttV2ProductionConfig::from_resolved_settings(
        settings.clone(),
        MqttV2Enrollment::from_settings(&settings),
        MqttTransportSecurity::LoopbackPlaintext,
        state_root,
        TargetPlatform::Macos,
    )
    .expect("restart config");
    let second_runtime = start_production_mqtt_v2(
        second_config,
        MqttV2ProductionDependencies {
            backend: backend.clone(),
            policy,
            lease_provider: Arc::new(TestLeaseProvider),
            screen_permission: Arc::new(UnavailableScreenPermissionProbe),
            clock: Arc::new(FixedClock),
        },
        tokio::runtime::Handle::current(),
    )
    .expect("restart runtime");
    tokio::task::yield_now().await;
    tokio::task::block_in_place(|| {
        second_broker.wait_for_client_id(CONTROLLED_NETWORK_OBSERVATION)
    })
    .expect("restart client");
    let replayed = match tokio::task::block_in_place(|| {
        second_broker.wait_for_response(CONTROLLED_NETWORK_OBSERVATION)
    }) {
        Ok(response) => response,
        Err(wait_error) => {
            let runtime_state = second_runtime.connection_state();
            let runtime_result = second_runtime.shutdown().await;
            let broker_result = second_broker.stop();
            panic!(
                "replayed terminal unavailable: wait={wait_error}; state={runtime_state:?}; \
                     runtime={runtime_result:?}; broker={broker_result:?}"
            );
        }
    };
    assert_eq!(replayed["payload"], first["payload"]);
    assert_eq!(backend.camera_capture_calls(), 1);
    assert_eq!(backend.screen_capture_calls(), 0);
    assert_eq!(
        second_runtime.shutdown().await.expect("restart shutdown"),
        knowbee_yeonjang::mqtt_v2_command_pump::MqttV2PumpOutcome::Stopped
    );
    second_broker.stop().expect("restart broker stop");
    let _ = std::fs::remove_dir_all(root);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn packaged_bootstrap_applies_signed_policy_admin_without_platform_effect() {
    let root = temporary_root();
    std::fs::create_dir_all(&root).expect("test root");
    let state_root = root.join("state");
    let mut settings = production_settings(&root, true);
    let fingerprint = canonical_target_fingerprint(&settings);
    let topics = MqttV2TopicSet::new("instance-a", "session-a", "requester-a").expect("topics");
    let signer = request_signer();
    let broker = ControlledMqttBroker::start_admin_with_capabilities(
        topics.admin(),
        topics.response(),
        topics.capabilities(),
        signed_policy_admin(&topics, &fingerprint, &signer),
    )
    .expect("broker");
    settings.connection.port = broker.port();
    let policy = durable_policy(&root);
    let backend = Arc::new(SystemInfoTestBackend::default());
    let backend_port: Arc<dyn knowbee_yeonjang::automation::AutomationBackend> = backend.clone();
    let config = MqttV2ProductionConfig::from_resolved_settings(
        settings.clone(),
        MqttV2Enrollment::from_settings(&settings),
        MqttTransportSecurity::LoopbackPlaintext,
        state_root,
        TargetPlatform::Macos,
    )
    .expect("production config");
    let runtime = start_production_mqtt_v2(
        config,
        MqttV2ProductionDependencies {
            backend: backend_port,
            policy: policy.clone(),
            lease_provider: Arc::new(TestLeaseProvider),
            screen_permission: Arc::new(UnavailableScreenPermissionProbe),
            clock: Arc::new(FixedClock),
        },
        tokio::runtime::Handle::current(),
    )
    .expect("production start");

    let deadline = Instant::now() + CONTROLLED_NETWORK_OBSERVATION;
    let mut initial_capabilities = None;
    let mut response = None;
    let mut refreshed_capabilities = None;
    while Instant::now() < deadline
        && (initial_capabilities.is_none()
            || response.is_none()
            || refreshed_capabilities.is_none())
    {
        let remaining = deadline.saturating_duration_since(Instant::now());
        let Ok(event) = tokio::task::block_in_place(|| broker.wait_for_response(remaining)) else {
            break;
        };
        match event["schema_id"].as_str() {
            Some("yeonjang.capabilities.v2")
                if event["payload"]["policyRevision"] == serde_json::json!(0) =>
            {
                initial_capabilities = Some(event);
            }
            Some("yeonjang.capabilities.v2")
                if event["payload"]["policyRevision"] == serde_json::json!(1) =>
            {
                refreshed_capabilities = Some(event);
            }
            Some("yeonjang.policy-admin-result.v2") => response = Some(event),
            _ => {}
        }
    }
    assert!(
        initial_capabilities.is_some() && response.is_some() && refreshed_capabilities.is_some(),
        "missing projection: initial={initial_capabilities:?} response={response:?} refreshed={refreshed_capabilities:?}"
    );
    let initial_capabilities = initial_capabilities.expect("initial capabilities");
    let response = response.expect("signed policy result");
    let refreshed_capabilities = refreshed_capabilities.expect("refreshed capabilities");
    assert_eq!(
        initial_capabilities["payload"]["capabilities"][0]["localPolicy"],
        "denied"
    );
    assert_eq!(response["schema_id"], "yeonjang.policy-admin-result.v2");
    assert_eq!(response["payload"]["outcome"], "applied");
    assert_eq!(
        refreshed_capabilities["payload"]["capabilities"][0]["localPolicy"],
        "allowed"
    );
    assert_eq!(
        policy
            .snapshot()
            .expect("policy snapshot")
            .entry(PolicyCapability::CameraCapture)
            .decision(),
        PolicyDecision::Allowed
    );
    assert_eq!(backend.camera_capture_calls(), 0);
    assert_eq!(backend.screen_capture_calls(), 0);

    assert_eq!(
        runtime.shutdown().await.expect("shutdown"),
        knowbee_yeonjang::mqtt_v2_command_pump::MqttV2PumpOutcome::Stopped
    );
    broker.stop().expect("broker stop");

    let duplicate_broker = ControlledMqttBroker::start_production_admin(
        topics.admin(),
        topics.response(),
        signed_policy_admin(&topics, &fingerprint, &signer),
    )
    .expect("duplicate broker");
    settings.connection.port = duplicate_broker.port();
    let duplicate_config = MqttV2ProductionConfig::from_resolved_settings(
        settings.clone(),
        MqttV2Enrollment::from_settings(&settings),
        MqttTransportSecurity::LoopbackPlaintext,
        root.join("state"),
        TargetPlatform::Macos,
    )
    .expect("duplicate production config");
    let duplicate_runtime = start_production_mqtt_v2(
        duplicate_config,
        MqttV2ProductionDependencies {
            backend: backend.clone(),
            policy: policy.clone(),
            lease_provider: Arc::new(TestLeaseProvider),
            screen_permission: Arc::new(UnavailableScreenPermissionProbe),
            clock: Arc::new(FixedClock),
        },
        tokio::runtime::Handle::current(),
    )
    .expect("duplicate production runtime");
    let duplicate = tokio::task::block_in_place(|| {
        duplicate_broker.wait_for_response(CONTROLLED_NETWORK_OBSERVATION)
    })
    .expect("signed duplicate result");
    assert_eq!(duplicate["payload"]["outcome"], "authorization_rejected");
    assert_eq!(duplicate["payload"]["reason_code"], "replayed");
    assert_eq!(
        policy.snapshot().expect("policy after replay").revision(),
        1
    );
    assert_eq!(backend.camera_capture_calls(), 0);
    assert_eq!(
        duplicate_runtime
            .shutdown()
            .await
            .expect("duplicate shutdown"),
        knowbee_yeonjang::mqtt_v2_command_pump::MqttV2PumpOutcome::Stopped
    );
    duplicate_broker.stop().expect("duplicate broker stop");

    // Reopen the same durable policy records and prove that the next packaged
    // command runtime reads the applied revision instead of a copied snapshot.
    drop(policy);
    let recovered_policy = durable_policy(&root);
    assert_eq!(
        recovered_policy
            .snapshot()
            .expect("recovered policy")
            .revision(),
        1
    );
    let command_broker = ControlledMqttBroker::start_production_v2(
        topics.command(),
        topics.response(),
        signed_command(
            &topics,
            &fingerprint,
            "camera.capture",
            serde_json::json!({"capture_timeout_ms": 1_000}),
            &signer,
        ),
    )
    .expect("command broker");
    settings.connection.port = command_broker.port();
    let command_config = MqttV2ProductionConfig::from_resolved_settings(
        settings.clone(),
        MqttV2Enrollment::from_settings(&settings),
        MqttTransportSecurity::LoopbackPlaintext,
        root.join("state"),
        TargetPlatform::Macos,
    )
    .expect("restarted production config");
    let command_runtime = start_production_mqtt_v2(
        command_config,
        MqttV2ProductionDependencies {
            backend: backend.clone(),
            policy: recovered_policy,
            lease_provider: Arc::new(TestLeaseProvider),
            screen_permission: Arc::new(UnavailableScreenPermissionProbe),
            clock: Arc::new(FixedClock),
        },
        tokio::runtime::Handle::current(),
    )
    .expect("restarted production runtime");
    let terminal = tokio::task::block_in_place(|| {
        command_broker.wait_for_response(CONTROLLED_NETWORK_OBSERVATION)
    })
    .expect("command terminal");
    assert_eq!(
        terminal["payload"]["terminal"]["execution_outcome"],
        "succeeded"
    );
    assert_eq!(backend.camera_capture_calls(), 1);
    assert_eq!(
        command_runtime.shutdown().await.expect("command shutdown"),
        knowbee_yeonjang::mqtt_v2_command_pump::MqttV2PumpOutcome::Stopped
    );
    command_broker.stop().expect("command broker stop");
    let _ = std::fs::remove_dir_all(root);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn packaged_bootstrap_reports_stale_policy_revision_without_write_or_effect() {
    let root = temporary_root();
    std::fs::create_dir_all(&root).expect("test root");
    let mut settings = production_settings(&root, true);
    let fingerprint = canonical_target_fingerprint(&settings);
    let topics = MqttV2TopicSet::new("instance-a", "session-a", "requester-a").expect("topics");
    let signer = request_signer();
    let broker = ControlledMqttBroker::start_production_admin(
        topics.admin(),
        topics.response(),
        signed_policy_admin_with_revision(&topics, &fingerprint, &signer, 7),
    )
    .expect("broker");
    settings.connection.port = broker.port();
    let policy = durable_policy(&root);
    let backend = Arc::new(SystemInfoTestBackend::default());
    let config = MqttV2ProductionConfig::from_resolved_settings(
        settings.clone(),
        MqttV2Enrollment::from_settings(&settings),
        MqttTransportSecurity::LoopbackPlaintext,
        root.join("state"),
        TargetPlatform::Macos,
    )
    .expect("production config");
    let runtime = start_production_mqtt_v2(
        config,
        MqttV2ProductionDependencies {
            backend: backend.clone(),
            policy: policy.clone(),
            lease_provider: Arc::new(TestLeaseProvider),
            screen_permission: Arc::new(UnavailableScreenPermissionProbe),
            clock: Arc::new(FixedClock),
        },
        tokio::runtime::Handle::current(),
    )
    .expect("production start");

    let response =
        tokio::task::block_in_place(|| broker.wait_for_response(CONTROLLED_NETWORK_OBSERVATION))
            .expect("signed conflict result");
    assert_eq!(response["payload"]["outcome"], "revision_conflict");
    assert_eq!(response["payload"]["reason_code"], "revision_conflict");
    assert_eq!(response["payload"]["revision"], 0);
    assert_eq!(policy.snapshot().expect("unchanged policy").revision(), 0);
    assert_eq!(backend.camera_capture_calls(), 0);
    assert_eq!(backend.screen_capture_calls(), 0);
    assert_eq!(
        runtime.shutdown().await.expect("shutdown"),
        knowbee_yeonjang::mqtt_v2_command_pump::MqttV2PumpOutcome::Stopped
    );
    broker.stop().expect("broker stop");
    let _ = std::fs::remove_dir_all(root);
}

async fn packaged_capture(
    method: &str,
    params: serde_json::Value,
    screen_permission: Arc<dyn LegacyScreenPermissionProbe>,
) -> serde_json::Value {
    let root = temporary_root();
    std::fs::create_dir_all(&root).expect("test root");
    let state_root = root.join("state");
    let mut settings = production_settings(&root, true);
    let fingerprint = canonical_target_fingerprint(&settings);
    let topics = MqttV2TopicSet::new("instance-a", "session-a", "requester-a").expect("topics");
    let signer = request_signer();
    let broker = ControlledMqttBroker::start_production_v2(
        topics.command(),
        topics.response(),
        signed_command(&topics, &fingerprint, method, params, &signer),
    )
    .expect("broker");
    settings.connection.port = broker.port();
    let enrollment = MqttV2Enrollment::from_settings(&settings);
    let config = MqttV2ProductionConfig::from_resolved_settings(
        settings,
        enrollment,
        MqttTransportSecurity::LoopbackPlaintext,
        state_root,
        TargetPlatform::Macos,
    )
    .expect("production config");
    let runtime = start_production_mqtt_v2(
        config,
        MqttV2ProductionDependencies {
            backend: Arc::new(SystemInfoTestBackend::default()),
            policy: durable_allowed_policy(&root),
            lease_provider: Arc::new(TestLeaseProvider),
            screen_permission,
            clock: Arc::new(FixedClock),
        },
        tokio::runtime::Handle::current(),
    )
    .expect("production start");

    wait_for_connection_state(&runtime, MqttV2RuntimeConnectionState::Connected)
        .await
        .expect("production connection");
    let terminal = match tokio::task::block_in_place(|| {
        broker.wait_for_response(CONTROLLED_NETWORK_OBSERVATION)
    }) {
        Ok(terminal) => terminal,
        Err(wait_error) => {
            let runtime_state = runtime.connection_state();
            let runtime_result = runtime.shutdown().await;
            let broker_result = broker.stop();
            panic!(
                "terminal unavailable: wait={wait_error}; state={runtime_state:?}; \
                 runtime={runtime_result:?}; broker={broker_result:?}"
            );
        }
    };
    assert_eq!(
        runtime.connection_state(),
        knowbee_yeonjang::mqtt_v2_runtime_composition::MqttV2RuntimeConnectionState::Connected
    );
    assert_eq!(
        runtime.shutdown().await.expect("shutdown"),
        knowbee_yeonjang::mqtt_v2_command_pump::MqttV2PumpOutcome::Stopped
    );
    broker.stop().expect("broker stop");
    let _ = std::fs::remove_dir_all(root);
    terminal
}

#[test]
fn missing_exact_enrollment_is_rejected_before_runtime_or_storage_activation() {
    let root = temporary_root();
    let settings = production_settings(&root, false);

    let result = MqttV2ProductionConfig::from_resolved_settings(
        settings.clone(),
        MqttV2Enrollment::from_settings(&settings),
        MqttTransportSecurity::LoopbackPlaintext,
        root.join("state"),
        TargetPlatform::Macos,
    );

    assert!(matches!(result, Err(MqttV2ProductionBuildError::Topics(_))));
    assert!(!root.exists());
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn legacy_pending_terminal_blocks_artifact_and_mqtt_activation_before_runtime_start() {
    let root = temporary_root();
    std::fs::create_dir_all(root.join("state")).expect("state root");
    let state_root = root.join("state").canonicalize().expect("canonical state");
    let storage = AtomicLocalStorage::open(
        state_root.join("terminal.json"),
        state_root.join("terminal.lock"),
        16 * 1024 * 1024,
    )
    .expect("terminal storage");
    let record = serde_json::to_vec(&serde_json::json!({
        "schema_version": 1,
        "idempotency_key": "legacy-pending",
        "exact_scope_digest": format!("sha256:{}", "ab".repeat(32)),
        "terminal": {"state": "pending"}
    }))
    .expect("legacy record");
    assert!(matches!(
        DurableRecordStorage::compare_and_swap(&storage, 0, vec![record]),
        knowbee_yeonjang::durable_completed_store::RawStoreWrite::Written { .. }
    ));
    let settings = production_settings(&root, true);
    let config = MqttV2ProductionConfig::from_resolved_settings(
        settings.clone(),
        MqttV2Enrollment::from_settings(&settings),
        MqttTransportSecurity::LoopbackPlaintext,
        state_root,
        TargetPlatform::Macos,
    )
    .expect("config");
    let backend = Arc::new(SystemInfoTestBackend::default());
    let provider = Arc::new(ExclusiveLeaseProvider::default());

    let result = start_production_mqtt_v2(
        config,
        MqttV2ProductionDependencies {
            backend: backend.clone(),
            policy: durable_allowed_policy(&root),
            lease_provider: provider.clone(),
            screen_permission: Arc::new(UnavailableScreenPermissionProbe),
            clock: Arc::new(FixedClock),
        },
        tokio::runtime::Handle::current(),
    );

    assert!(matches!(
        result,
        Err(MqttV2ProductionBuildError::Terminal(
            knowbee_yeonjang::v2_terminal_repository::DurableV2TerminalRepositoryError::RecoveryEvidenceMissing
        ))
    ));
    assert!(!root.join("artifacts").exists());
    assert_eq!(backend.camera_capture_calls(), 0);
    assert_eq!(backend.screen_capture_calls(), 0);
    assert_eq!(provider.counts(), (1, 1));
    drop(
        provider
            .acquire("instance-a")
            .expect("failure released lease"),
    );
    assert_eq!(provider.counts(), (2, 2));
    let _ = std::fs::remove_dir_all(root);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn duplicate_instance_is_rejected_before_storage_and_mqtt_connection() {
    let root = temporary_root();
    std::fs::create_dir_all(&root).expect("test root");
    let state_root = root.join("state");
    let settings = production_settings(&root, true);
    let enrollment = MqttV2Enrollment::from_settings(&settings);
    let config = MqttV2ProductionConfig::from_resolved_settings(
        settings,
        enrollment,
        MqttTransportSecurity::LoopbackPlaintext,
        state_root.clone(),
        TargetPlatform::Macos,
    )
    .expect("config");

    let result = start_production_mqtt_v2(
        config,
        MqttV2ProductionDependencies {
            backend: Arc::new(SystemInfoTestBackend::default()),
            policy: durable_allowed_policy(&root),
            lease_provider: Arc::new(BusyLeaseProvider),
            screen_permission: Arc::new(UnavailableScreenPermissionProbe),
            clock: Arc::new(FixedClock),
        },
        tokio::runtime::Handle::current(),
    );

    assert!(matches!(
        result,
        Err(MqttV2ProductionBuildError::InstanceLease(
            InstanceLeaseError::AlreadyRunning
        ))
    ));
    assert!(!state_root.exists());
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn graceful_shutdown_releases_exact_instance_lease_for_reacquisition() {
    let root = temporary_root();
    std::fs::create_dir_all(&root).expect("test root");
    let mut settings = production_settings(&root, true);
    settings.connection.port = unused_loopback_port();
    let provider = Arc::new(ExclusiveLeaseProvider::default());
    let config = MqttV2ProductionConfig::from_resolved_settings(
        settings.clone(),
        MqttV2Enrollment::from_settings(&settings),
        MqttTransportSecurity::LoopbackPlaintext,
        root.join("state"),
        TargetPlatform::Macos,
    )
    .expect("config");
    let runtime = start_production_mqtt_v2(
        config,
        MqttV2ProductionDependencies {
            backend: Arc::new(SystemInfoTestBackend::default()),
            policy: durable_allowed_policy(&root),
            lease_provider: provider.clone(),
            screen_permission: Arc::new(UnavailableScreenPermissionProbe),
            clock: Arc::new(FixedClock),
        },
        tokio::runtime::Handle::current(),
    )
    .expect("runtime");
    wait_for_connection_state(
        &runtime,
        knowbee_yeonjang::mqtt_v2_runtime_composition::MqttV2RuntimeConnectionState::Reconnecting,
    )
    .await
    .expect("reconnecting runtime");
    assert_eq!(provider.counts(), (1, 0));

    assert_eq!(
        runtime.shutdown().await.expect("graceful shutdown"),
        knowbee_yeonjang::mqtt_v2_command_pump::MqttV2PumpOutcome::Stopped
    );
    assert_eq!(provider.counts(), (1, 1));
    let reacquired = provider.acquire("instance-a").expect("reacquired lease");
    assert_eq!(provider.counts(), (2, 1));
    drop(reacquired);
    assert_eq!(provider.counts(), (2, 2));
    let _ = std::fs::remove_dir_all(root);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn dropped_runtime_requests_shutdown_and_releases_lease_after_owned_pump_exit() {
    let root = temporary_root();
    std::fs::create_dir_all(&root).expect("test root");
    let mut settings = production_settings(&root, true);
    settings.connection.port = unused_loopback_port();
    let provider = Arc::new(ExclusiveLeaseProvider::default());
    let config = MqttV2ProductionConfig::from_resolved_settings(
        settings.clone(),
        MqttV2Enrollment::from_settings(&settings),
        MqttTransportSecurity::LoopbackPlaintext,
        root.join("state"),
        TargetPlatform::Macos,
    )
    .expect("config");
    let runtime = start_production_mqtt_v2(
        config,
        MqttV2ProductionDependencies {
            backend: Arc::new(SystemInfoTestBackend::default()),
            policy: durable_allowed_policy(&root),
            lease_provider: provider.clone(),
            screen_permission: Arc::new(UnavailableScreenPermissionProbe),
            clock: Arc::new(FixedClock),
        },
        tokio::runtime::Handle::current(),
    )
    .expect("runtime");
    wait_for_connection_state(
        &runtime,
        knowbee_yeonjang::mqtt_v2_runtime_composition::MqttV2RuntimeConnectionState::Reconnecting,
    )
    .await
    .expect("reconnecting runtime");
    drop(runtime);

    wait_for_lease_release(&provider)
        .await
        .expect("drop shutdown lease release");
    assert_eq!(provider.counts(), (1, 1));
    let reacquired = provider.acquire("instance-a").expect("reacquired lease");
    drop(reacquired);
    assert_eq!(provider.counts(), (2, 2));
    let _ = std::fs::remove_dir_all(root);
}

fn request_signer() -> MqttV2HmacCrypto {
    MqttV2HmacCrypto::new(
        key("unused", "unused", b"unused-secret-123".to_vec()),
        key(
            "requester-a",
            "requester-hmac-v2",
            derive_mqtt_v2_hmac_key(b"broker-secret-1").expect("protocol key"),
        ),
    )
    .expect("request signer")
}

struct ReconnectEvidence {
    responses: Vec<serde_json::Value>,
    online: bool,
    capabilities: bool,
}

fn wait_for_reconnect_response(
    broker: &ControlledMqttBroker,
    attempt: usize,
    expected_count: usize,
) -> serde_json::Value {
    let deadline = Instant::now() + Duration::from_secs(10);
    let mut responses = Vec::new();
    while Instant::now() < deadline && responses.len() < expected_count {
        let remaining = deadline.saturating_duration_since(Instant::now());
        let event = tokio::task::block_in_place(|| broker.wait_for_response(remaining))
            .expect("reconnect publication");
        if event["attempt"] == serde_json::json!(attempt)
            && event["payload"]["schema_id"] == "yeonjang.response.v2"
        {
            responses.push(event["payload"].clone());
        }
    }
    responses
        .into_iter()
        .next()
        .expect("reconnect terminal response")
}

fn wait_for_reconnect_evidence(broker: &ControlledMqttBroker) -> ReconnectEvidence {
    let deadline = Instant::now() + Duration::from_secs(10);
    let mut evidence = ReconnectEvidence {
        responses: Vec::new(),
        online: false,
        capabilities: false,
    };
    while Instant::now() < deadline
        && (evidence.responses.len() < 2 || !evidence.online || !evidence.capabilities)
    {
        let remaining = deadline.saturating_duration_since(Instant::now());
        let event = tokio::task::block_in_place(|| broker.wait_for_response(remaining))
            .expect("recovered publication");
        if event["attempt"] != serde_json::json!(1) {
            continue;
        }
        match event["payload"]["schema_id"].as_str() {
            Some("yeonjang.response.v2") => evidence.responses.push(event["payload"].clone()),
            Some("yeonjang.status.v2") if event["payload"]["payload"]["state"] == "online" => {
                evidence.online = true;
            }
            Some("yeonjang.capabilities.v2") => evidence.capabilities = true,
            _ => {}
        }
    }
    assert!(
        evidence.responses.len() >= 2 && evidence.online && evidence.capabilities,
        "incomplete reconnect evidence: responses={} online={} capabilities={}",
        evidence.responses.len(),
        evidence.online,
        evidence.capabilities
    );
    evidence
}

fn durable_policy(root: &std::path::Path) -> Arc<DurablePermissionPolicyRepository> {
    let root = root.canonicalize().expect("canonical policy root");
    let storage = AtomicLocalStorage::open(
        root.join("policy.json"),
        root.join("policy.lock"),
        1024 * 1024,
    )
    .expect("policy storage");
    DurablePermissionPolicyRepository::bootstrap(
        "instance-a",
        32,
        Arc::new(storage) as Arc<dyn DurableRecordStorage>,
    )
    .map(Arc::new)
    .expect("policy repository")
}

fn durable_allowed_policy(root: &std::path::Path) -> Arc<DurablePermissionPolicyRepository> {
    let policy = durable_policy(root);
    for (expected_revision, capability) in [
        (0, PolicyCapability::CameraCapture),
        (1, PolicyCapability::ScreenCapture),
    ] {
        let command = PolicyUpdateCommand::new(
            "instance-a",
            expected_revision,
            capability,
            PolicyDecision::Allowed,
            PolicyResourceConstraint::Any,
        )
        .expect("allowed policy update");
        assert!(matches!(
            policy.update(&command),
            knowbee_yeonjang::policy_repository::PolicyRepositoryResult::Applied { .. }
        ));
    }
    policy
}

fn signed_command(
    topics: &MqttV2TopicSet,
    fingerprint: &str,
    method: &str,
    params: serde_json::Value,
    signer: &MqttV2HmacCrypto,
) -> serde_json::Value {
    let mut value = serde_json::json!({
        "protocol_version": 2, "schema_id": "yeonjang.command.v2",
        "message_kind": "command", "message_id": "message-v2",
        "request_id": "request-v2", "command_id": "command-v2",
        "operation_id": "operation-v2", "correlation_id": "correlation-v2",
        "causation_id": "causation-v2", "requester_id": "requester-a",
        "target_instance_id": "instance-a", "target_session_id": "session-a",
        "target_fingerprint": fingerprint, "idempotency_key": "idempotency-v2",
        "cancellation_id": "cancel-v2", "cancel_token": "cancel-token-v2",
        "issued_at": 900, "expires_at": 2_000, "sequence": 1,
        "payload": {"method": method, "params": params},
        "authorization": {
            "schema_version": 1, "authorization_id": "authorization-v2",
            "issuer": "requester-a", "key_id": "requester-hmac-v2",
            "audience": "yeonjang-v2", "scope": "effect.execute",
            "method": method,
            "resource": if method == "camera.capture" { "camera" } else { "screen" },
            "requester_id": "requester-a", "command_id": "command-v2",
            "operation_id": "operation-v2", "target_instance_id": "instance-a",
            "target_session_id": "session-a", "target_fingerprint": fingerprint,
            "idempotency_key": "idempotency-v2", "cancellation_id": "cancel-v2",
            "cancel_token": "cancel-token-v2", "expires_at": 2_000,
            "nonce": "nonce-v2", "signature": "00".repeat(32)
        }
    });
    let bytes = serde_json::to_vec(&value).expect("command bytes");
    let parsed = parse_v2_command(topics.command(), &bytes, 1_000, topics).expect("parse");
    value["authorization"]["signature"] = V2ResponseSigner::sign(
        signer,
        "requester-a",
        "requester-hmac-v2",
        &parsed.authorization_signing_bytes(),
    )
    .expect("signature")
    .into();
    value
}

fn signed_policy_admin(
    topics: &MqttV2TopicSet,
    fingerprint: &str,
    signer: &MqttV2HmacCrypto,
) -> serde_json::Value {
    signed_policy_admin_with_revision(topics, fingerprint, signer, 0)
}

fn signed_policy_admin_with_revision(
    topics: &MqttV2TopicSet,
    fingerprint: &str,
    signer: &MqttV2HmacCrypto,
    expected_revision: u64,
) -> serde_json::Value {
    let mut value = serde_json::json!({
        "protocol_version": 2, "schema_id": "yeonjang.admin.v2",
        "message_kind": "admin", "message_id": "message-admin",
        "request_id": "request-admin", "command_id": "command-admin",
        "operation_id": "operation-admin", "correlation_id": "correlation-admin",
        "causation_id": "causation-admin", "requester_id": "requester-a",
        "target_instance_id": "instance-a", "target_session_id": "session-a",
        "target_fingerprint": fingerprint, "idempotency_key": "idempotency-admin",
        "issued_at": 900, "expires_at": 2_000, "sequence": 1,
        "payload": {
            "admin": "policy.update",
            "params": {
                "expected_revision": expected_revision,
                "capability": "camera.capture",
                "decision": "allowed",
                "resource": {"kind": "any"},
                "reason": "controlled production policy update"
            }
        },
        "authorization": {
            "schema_version": 1, "authorization_id": "authorization-admin",
            "issuer": "requester-a", "key_id": "requester-hmac-v2",
            "audience": "instance-a", "scope": "admin.policy.write",
            "requester_id": "requester-a", "command_id": "command-admin",
            "operation_id": "operation-admin", "target_instance_id": "instance-a",
            "target_session_id": "session-a", "target_fingerprint": fingerprint,
            "idempotency_key": "idempotency-admin", "expires_at": 2_000,
            "nonce": "nonce-admin", "signature": "00".repeat(32)
        }
    });
    let bytes = serde_json::to_vec(&value).expect("policy admin bytes");
    let parsed =
        parse_v2_policy_admin(topics.admin(), &bytes, false, 1_000, topics).expect("parse admin");
    value["authorization"]["signature"] = V2ResponseSigner::sign(
        signer,
        "requester-a",
        "requester-hmac-v2",
        &parsed.authorization_signing_bytes(),
    )
    .expect("admin signature")
    .into();
    value
}

fn key(issuer: &str, key_id: &str, secret: Vec<u8>) -> V2HmacKeySnapshot {
    V2HmacKeySnapshot::new(issuer, key_id, secret).expect("key")
}

struct FixedClock;

impl MqttV2BootstrapClock for FixedClock {
    fn now_ms(&self) -> i64 {
        1_000
    }
}

struct FixedScreenProbe;

impl LegacyScreenPermissionProbe for FixedScreenProbe {
    fn permission(&self) -> Result<PreflightPermissionState, ScreenPermissionProbeError> {
        Ok(PreflightPermissionState::Granted)
    }
}

async fn wait_for_connection_state(
    runtime: &MqttV2ProductionRuntime,
    expected: MqttV2RuntimeConnectionState,
) -> Result<(), String> {
    tokio::time::timeout(CONTROLLED_NETWORK_OBSERVATION, async {
        while runtime.connection_state() != expected {
            tokio::time::sleep(Duration::from_millis(1)).await;
        }
    })
    .await
    .map_err(|_| format!("timed out waiting for connection state {expected:?}"))
}

async fn wait_for_lease_release(provider: &ExclusiveLeaseProvider) -> Result<(), String> {
    tokio::time::timeout(Duration::from_secs(5), async {
        while provider.is_held() {
            tokio::time::sleep(Duration::from_millis(1)).await;
        }
    })
    .await
    .map_err(|_| "timed out waiting for instance lease release".to_string())
}

fn unused_loopback_port() -> u16 {
    TcpListener::bind(("127.0.0.1", 0))
        .expect("unused loopback listener")
        .local_addr()
        .expect("unused loopback address")
        .port()
}

#[derive(Default)]
struct ExclusiveLeaseProvider {
    held: Arc<AtomicBool>,
    acquired: Arc<AtomicUsize>,
    released: Arc<AtomicUsize>,
}

impl ExclusiveLeaseProvider {
    fn counts(&self) -> (usize, usize) {
        (
            self.acquired.load(Ordering::SeqCst),
            self.released.load(Ordering::SeqCst),
        )
    }

    fn is_held(&self) -> bool {
        self.held.load(Ordering::SeqCst)
    }
}

impl InstanceLeaseProvider for ExclusiveLeaseProvider {
    fn acquire(
        &self,
        instance_id: &str,
    ) -> Result<Box<dyn InstanceProcessLease>, InstanceLeaseError> {
        if instance_id != "instance-a" {
            return Err(InstanceLeaseError::InvalidIdentity);
        }
        if self
            .held
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Err(InstanceLeaseError::AlreadyRunning);
        }
        self.acquired.fetch_add(1, Ordering::SeqCst);
        Ok(Box::new(ExclusiveLease {
            held: self.held.clone(),
            released: self.released.clone(),
        }))
    }
}

struct ExclusiveLease {
    held: Arc<AtomicBool>,
    released: Arc<AtomicUsize>,
}

impl InstanceProcessLease for ExclusiveLease {}

impl Drop for ExclusiveLease {
    fn drop(&mut self) {
        if self.held.swap(false, Ordering::SeqCst) {
            self.released.fetch_add(1, Ordering::SeqCst);
        }
    }
}

struct TestLease;
impl InstanceProcessLease for TestLease {}

struct TestLeaseProvider;

impl InstanceLeaseProvider for TestLeaseProvider {
    fn acquire(
        &self,
        instance_id: &str,
    ) -> Result<Box<dyn InstanceProcessLease>, InstanceLeaseError> {
        if instance_id == "instance-a" {
            Ok(Box::new(TestLease))
        } else {
            Err(InstanceLeaseError::InvalidIdentity)
        }
    }
}

struct BusyLeaseProvider;

impl InstanceLeaseProvider for BusyLeaseProvider {
    fn acquire(&self, _: &str) -> Result<Box<dyn InstanceProcessLease>, InstanceLeaseError> {
        Err(InstanceLeaseError::AlreadyRunning)
    }
}

fn temporary_root() -> std::path::PathBuf {
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    std::env::temp_dir().join(format!(
        "knowbee-v2-production-bootstrap-{}-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    ))
}

fn production_settings(root: &std::path::Path, enrolled: bool) -> YeonjangSettings {
    YeonjangSettings {
        instance_id: "instance-a".to_string(),
        host_fingerprint: "host-a".to_string(),
        install_fingerprint: "install-a".to_string(),
        capture_artifact_root: root.join("artifacts").to_string_lossy().to_string(),
        connection: BrokerConnectionSettings {
            username: "broker-user".to_string(),
            password: "broker-secret-1".to_string(),
            ..BrokerConnectionSettings::default()
        },
        mqtt_v2: if enrolled {
            MqttV2EnrollmentSettings {
                session_id: "session-a".to_string(),
                requester_id: "requester-a".to_string(),
            }
        } else {
            MqttV2EnrollmentSettings::default()
        },
        ..YeonjangSettings::default()
    }
}
