#[allow(dead_code)]
#[path = "support/controlled_mqtt_broker.rs"]
mod controlled_mqtt_broker;
#[path = "support/protocol_fixture.rs"]
mod protocol_fixture;
#[path = "support/system_info_test_backend.rs"]
mod system_info_test_backend;
#[path = "support/terminal_assertions.rs"]
mod terminal_assertions;

use std::sync::Arc;
use std::time::Duration;

use controlled_mqtt_broker::ControlledMqttBroker;
use hmac::{Hmac, Mac};
use knowbee_yeonjang::authorization::AuthorizationClock;
use knowbee_yeonjang::authorization_bootstrap::AuthorizationBootstrapInput;
use knowbee_yeonjang::automation::AutomationBackend;
use knowbee_yeonjang::instance_process_lease::{
    FilesystemInstanceLeaseProvider, InstanceLeaseProvider,
};
use knowbee_yeonjang::managed_composition::{
    ManagedRuntimeConfig, ManagedRuntimeDependencies, build_managed_runtime,
};
use knowbee_yeonjang::request_dispatcher::DispatchConfig;
use knowbee_yeonjang::request_schema::parse_canonical_request;
use knowbee_yeonjang::runtime::RuntimeConfig;
use knowbee_yeonjang::runtime_host::{RuntimeHostConfig, TokioRuntimeHost};
use knowbee_yeonjang::settings::YeonjangSettings;
use knowbee_yeonjang::{RuntimeEvent, managed_runtime_state, new_shared_lifecycle_state};
use protocol_fixture::ReadOnlyProtocolFixture;
use sha2::Sha256;
use system_info_test_backend::SystemInfoTestBackend;
use terminal_assertions::TerminalResponseLedger;

const CONTROLLED_LOCAL_IO_TIMEOUT: Duration = Duration::from_secs(5);
// macOS can defer a newly linked test process while executable policy checks
// complete. Match the controlled broker's finite CONNECT budget without
// changing the production reconnect or effect deadline.
const CONTROLLED_CONNECTION_TIMEOUT: Duration = Duration::from_secs(20);
static CONTROLLED_RUNTIME_TEST_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

struct FixedClock;

impl AuthorizationClock for FixedClock {
    fn now_ms(&self) -> i64 {
        1_700_000_000_000
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn managed_mqtt_processes_requests_reconnects_and_returns_its_host_lease() {
    let _test_lock = CONTROLLED_RUNTIME_TEST_LOCK.lock().await;
    let initial_fixture = ReadOnlyProtocolFixture::system_info("controlled-mqtt-1");
    let initial_request = initial_fixture.value.clone();
    let initial_terminals = TerminalResponseLedger::default();
    initial_terminals
        .accept_request(&initial_fixture.request())
        .expect("initial request contract");
    let broker = ControlledMqttBroker::start(
        "knowbee/v1/node/controlled-node/request",
        "knowbee/v1/node/controlled-node/response",
        initial_request,
    )
    .expect("controlled broker");
    let mut settings = YeonjangSettings {
        node_id: "controlled-node".to_string(),
        ..Default::default()
    };
    settings.reset_topics_from_node_id();
    settings.connection.host = "127.0.0.1".to_string();
    settings.connection.port = broker.port();
    settings.connection.username = "controlled-user".to_string();
    settings.connection.password = "controlled-password".to_string();
    let host_config = RuntimeHostConfig {
        worker_threads: 2,
        max_blocking_threads: 8,
    };
    let backend: Arc<dyn AutomationBackend> = Arc::new(SystemInfoTestBackend::default());
    let runtime = build_managed_runtime(
        ManagedRuntimeConfig {
            host: host_config,
            runtime: RuntimeConfig { max_in_flight: 2 },
            dispatch: DispatchConfig { max_pending: 4 },
            completed_capacity: 16,
        },
        ManagedRuntimeDependencies::new(
            settings,
            backend,
            AuthorizationBootstrapInput::new(
                "controlled-provider",
                "controlled-key",
                "controlled-audience",
                b"controlled-provider-secret".to_vec(),
                16,
            )
            .expect("authorization input"),
            Arc::new(FixedClock),
            controlled_lease_provider(),
        ),
    )
    .expect("managed runtime");
    let (runtime, events) = runtime
        .start_mqtt(new_shared_lifecycle_state(managed_runtime_state()))
        .expect("managed MQTT");

    let initial_client_id = broker
        .wait_for_client_id(CONTROLLED_CONNECTION_TIMEOUT)
        .expect("initial MQTT client identity");
    let first_event = events.recv_timeout(CONTROLLED_CONNECTION_TIMEOUT);
    assert!(
        matches!(first_event, Ok(RuntimeEvent::Connected)),
        "expected initial connected event, received {first_event:?}"
    );
    assert!(initial_client_id.starts_with("knowbee-y-"));
    assert!(!initial_client_id.contains("controlled-node"));
    let response = broker
        .wait_for_response(CONTROLLED_LOCAL_IO_TIMEOUT)
        .expect("terminal correlated response");
    initial_fixture.assert_success(
        &serde_json::from_value(response.clone()).expect("canonical fixture response"),
    );
    initial_terminals
        .record_terminal(
            &serde_json::from_value(response.clone()).expect("canonical terminal response"),
        )
        .expect("exactly one correlated initial terminal");
    initial_terminals
        .exact_terminals(&["controlled-mqtt-1".to_string()])
        .expect("complete initial terminal set");
    assert_eq!(
        response.get("id").and_then(serde_json::Value::as_str),
        Some("controlled-mqtt-1")
    );
    assert_eq!(
        response.get("ok").and_then(serde_json::Value::as_bool),
        Some(true)
    );

    tokio::task::spawn_blocking(move || runtime.shutdown_blocking())
        .await
        .expect("blocking shutdown worker")
        .expect("managed MQTT blocking shutdown");
    broker.stop().expect("controlled broker shutdown");
    drop(TokioRuntimeHost::acquire(host_config).expect("host lease returned"));

    let secret = b"controlled-provider-secret".to_vec();
    let reconnect_terminals = TerminalResponseLedger::default();
    let request_terminals = reconnect_terminals.clone();
    let reconnect_broker = ControlledMqttBroker::start_reconnect(
        "knowbee/v1/node/reconnect-node/request",
        "knowbee/v1/node/reconnect-node/response",
        "knowbee/v1/node/reconnect-node/status",
        Arc::new(move |attempt, session_id| {
            let request = signed_camera_request(
                if attempt == 0 {
                    "reconnect-delivery-1"
                } else {
                    "reconnect-delivery-2"
                },
                session_id,
                &secret,
            );
            request_terminals
                .accept_request(&request_from_value(&request))
                .expect("reconnect request contract");
            request
        }),
    )
    .expect("controlled reconnect broker");
    let mut reconnect_settings = YeonjangSettings {
        node_id: "reconnect-node".to_string(),
        ..Default::default()
    };
    reconnect_settings.reset_topics_from_node_id();
    reconnect_settings.connection.host = "127.0.0.1".to_string();
    reconnect_settings.connection.port = reconnect_broker.port();
    reconnect_settings.connection.username = "controlled-user".to_string();
    reconnect_settings.connection.password = "controlled-password".to_string();
    reconnect_settings.permissions.allow_camera_access = true;
    let recording = Arc::new(SystemInfoTestBackend::default());
    let reconnect_runtime = build_managed_runtime(
        ManagedRuntimeConfig {
            host: host_config,
            runtime: RuntimeConfig { max_in_flight: 2 },
            dispatch: DispatchConfig { max_pending: 4 },
            completed_capacity: 16,
        },
        ManagedRuntimeDependencies::new(
            reconnect_settings,
            recording.clone(),
            AuthorizationBootstrapInput::new(
                "controlled-provider",
                "controlled-key",
                "controlled-audience",
                b"controlled-provider-secret".to_vec(),
                16,
            )
            .expect("authorization input"),
            Arc::new(FixedClock),
            controlled_lease_provider(),
        ),
    )
    .expect("reconnect managed runtime");
    let (reconnect_runtime, reconnect_events) = reconnect_runtime
        .start_mqtt(new_shared_lifecycle_state(managed_runtime_state()))
        .expect("reconnect managed MQTT");
    assert!(matches!(
        reconnect_events.recv_timeout(CONTROLLED_CONNECTION_TIMEOUT),
        Ok(RuntimeEvent::Connected)
    ));
    let first_reconnect_client_id = reconnect_broker
        .wait_for_client_id(CONTROLLED_CONNECTION_TIMEOUT)
        .expect("first reconnect client identity");
    let first = reconnect_broker
        .wait_for_response(CONTROLLED_LOCAL_IO_TIMEOUT)
        .expect("first terminal response");
    let second = reconnect_broker
        .wait_for_response(Duration::from_secs(8))
        .expect("redelivered terminal response");
    let second_reconnect_client_id = reconnect_broker
        .wait_for_client_id(CONTROLLED_CONNECTION_TIMEOUT)
        .expect("second reconnect client identity");
    assert_eq!(first_reconnect_client_id, second_reconnect_client_id);
    assert!(!first_reconnect_client_id.contains("reconnect-node"));
    for response in [&first, &second] {
        reconnect_terminals
            .record_terminal(
                &serde_json::from_value(response.clone()).expect("canonical terminal response"),
            )
            .expect("exactly one correlated reconnect terminal");
    }
    reconnect_terminals
        .exact_terminals(&[
            "reconnect-delivery-1".to_string(),
            "reconnect-delivery-2".to_string(),
        ])
        .expect("complete reconnect terminal set");
    assert_eq!(
        first.get("id").and_then(serde_json::Value::as_str),
        Some("reconnect-delivery-1")
    );
    assert_eq!(
        second.get("id").and_then(serde_json::Value::as_str),
        Some("reconnect-delivery-2")
    );
    assert_eq!(
        first.get("ok").and_then(serde_json::Value::as_bool),
        Some(true)
    );
    assert_eq!(
        second.get("ok").and_then(serde_json::Value::as_bool),
        Some(true)
    );
    for response in [&first, &second] {
        let result = response.get("result").expect("capture result");
        assert!(
            result
                .get("artifact_ref")
                .and_then(serde_json::Value::as_str)
                .is_some_and(|reference| reference.starts_with("capture:"))
        );
        assert!(
            result
                .get("output_path")
                .is_none_or(serde_json::Value::is_null)
        );
        assert!(
            result
                .get("base64_data")
                .is_none_or(serde_json::Value::is_null)
        );
    }
    assert_eq!(recording.camera_capture_calls(), 1);

    reconnect_runtime
        .shutdown()
        .await
        .expect("reconnect managed MQTT shutdown");
    reconnect_broker
        .stop()
        .expect("controlled reconnect broker shutdown");
    drop(TokioRuntimeHost::acquire(host_config).expect("reconnect host lease returned"));
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn managed_mqtt_preserves_the_current_unknown_failure_projection_and_binding() {
    let _test_lock = CONTROLLED_RUNTIME_TEST_LOCK.lock().await;
    let target_fingerprint =
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    let request = serde_json::json!({
        "protocolVersion": 1,
        "id": "controlled-failure-1",
        "method": "system.info",
        "params": {},
        "metadata": {
            "commandId": "controlled-failure-command",
            "operationId": "controlled-failure-operation",
            "targetFingerprint": target_fingerprint
        }
    });
    let terminals = TerminalResponseLedger::default();
    terminals
        .accept_request(&request_from_value(&request))
        .expect("failure request contract");
    let broker = ControlledMqttBroker::start(
        "knowbee/v1/node/controlled-failure-node/request",
        "knowbee/v1/node/controlled-failure-node/response",
        request,
    )
    .expect("controlled failure broker");
    let mut settings = YeonjangSettings {
        node_id: "controlled-failure-node".to_string(),
        ..Default::default()
    };
    settings.reset_topics_from_node_id();
    settings.connection.host = "127.0.0.1".to_string();
    settings.connection.port = broker.port();
    settings.connection.username = "controlled-user".to_string();
    settings.connection.password = "controlled-password".to_string();
    let host_config = RuntimeHostConfig {
        worker_threads: 2,
        max_blocking_threads: 8,
    };
    let backend = Arc::new(SystemInfoTestBackend::with_private_system_info_failure());
    let runtime = build_managed_runtime(
        ManagedRuntimeConfig {
            host: host_config,
            runtime: RuntimeConfig { max_in_flight: 2 },
            dispatch: DispatchConfig { max_pending: 4 },
            completed_capacity: 16,
        },
        ManagedRuntimeDependencies::new(
            settings,
            backend.clone(),
            AuthorizationBootstrapInput::new(
                "controlled-provider",
                "controlled-key",
                "controlled-audience",
                b"controlled-provider-secret".to_vec(),
                16,
            )
            .expect("authorization input"),
            Arc::new(FixedClock),
            controlled_lease_provider(),
        ),
    )
    .expect("failure managed runtime");
    let (runtime, events) = runtime
        .start_mqtt(new_shared_lifecycle_state(managed_runtime_state()))
        .expect("failure managed MQTT");

    let first_event = events.recv_timeout(CONTROLLED_CONNECTION_TIMEOUT);
    assert!(
        matches!(first_event, Ok(RuntimeEvent::Connected)),
        "expected controlled failure broker connection, got {first_event:?}"
    );
    broker
        .wait_for_client_id(CONTROLLED_CONNECTION_TIMEOUT)
        .expect("failure MQTT client identity");
    let response = broker
        .wait_for_response(CONTROLLED_LOCAL_IO_TIMEOUT)
        .expect("failure terminal response");
    let terminal: knowbee_yeonjang::protocol::Response =
        serde_json::from_value(response.clone()).expect("canonical failure response");
    terminals
        .record_terminal(&terminal)
        .expect("exactly one correlated failure terminal");
    terminals
        .exact_terminals(&["controlled-failure-1".to_string()])
        .expect("complete failure terminal set");

    assert_eq!(response["ok"], false);
    assert_eq!(response["error"]["code"], "request_failed");
    assert_eq!(
        response["error"]["message"],
        "Request could not be completed."
    );
    assert_eq!(response["attempt"]["method"], "system.info");
    assert_eq!(
        response["attempt"]["command_id"],
        "controlled-failure-command"
    );
    assert_eq!(
        response["attempt"]["operation_id"],
        "controlled-failure-operation"
    );
    assert_eq!(
        response["attempt"]["target_fingerprint"],
        target_fingerprint
    );
    assert_eq!(response["attempt"]["terminal_stage"], "handler_failed");
    assert_eq!(response["attempt"]["retry_safety"], "unknown_effect_state");
    let serialized = serde_json::to_string(&response).expect("bounded failure response");
    assert!(!serialized.contains("/Users/private"));
    assert!(!serialized.contains("controlled-secret-value"));
    assert_eq!(backend.system_info_calls(), 1);

    runtime
        .shutdown()
        .await
        .expect("failure managed MQTT shutdown");
    broker.stop().expect("controlled failure broker shutdown");
    drop(TokioRuntimeHost::acquire(host_config).expect("failure host lease returned"));
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn managed_mqtt_replays_a_bound_camera_timeout_without_repeating_the_effect() {
    let _test_lock = CONTROLLED_RUNTIME_TEST_LOCK.lock().await;
    let secret = b"controlled-provider-secret".to_vec();
    let terminals = TerminalResponseLedger::default();
    let request_terminals = terminals.clone();
    let broker = ControlledMqttBroker::start_reconnect(
        "knowbee/v1/node/timeout-node/request",
        "knowbee/v1/node/timeout-node/response",
        "knowbee/v1/node/timeout-node/status",
        Arc::new(move |attempt, session_id| {
            let request = signed_camera_request(
                if attempt == 0 {
                    "camera-timeout-1"
                } else {
                    "camera-timeout-2"
                },
                session_id,
                &secret,
            );
            request_terminals
                .accept_request(&request_from_value(&request))
                .expect("timeout request contract");
            request
        }),
    )
    .expect("controlled timeout broker");
    let mut settings = YeonjangSettings {
        node_id: "timeout-node".to_string(),
        ..Default::default()
    };
    settings.reset_topics_from_node_id();
    settings.connection.host = "127.0.0.1".to_string();
    settings.connection.port = broker.port();
    settings.connection.username = "controlled-user".to_string();
    settings.connection.password = "controlled-password".to_string();
    settings.permissions.allow_camera_access = true;
    let host_config = RuntimeHostConfig {
        worker_threads: 2,
        max_blocking_threads: 8,
    };
    let backend = Arc::new(SystemInfoTestBackend::with_camera_timeout());
    let runtime = build_managed_runtime(
        ManagedRuntimeConfig {
            host: host_config,
            runtime: RuntimeConfig { max_in_flight: 2 },
            dispatch: DispatchConfig { max_pending: 4 },
            completed_capacity: 16,
        },
        ManagedRuntimeDependencies::new(
            settings,
            backend.clone(),
            AuthorizationBootstrapInput::new(
                "controlled-provider",
                "controlled-key",
                "controlled-audience",
                b"controlled-provider-secret".to_vec(),
                16,
            )
            .expect("authorization input"),
            Arc::new(FixedClock),
            controlled_lease_provider(),
        ),
    )
    .expect("timeout managed runtime");
    let (runtime, events) = runtime
        .start_mqtt(new_shared_lifecycle_state(managed_runtime_state()))
        .expect("timeout managed MQTT");

    let first_event = events.recv_timeout(CONTROLLED_CONNECTION_TIMEOUT);
    assert!(
        matches!(first_event, Ok(RuntimeEvent::Connected)),
        "expected timeout broker connection, got {first_event:?}"
    );
    let first = broker
        .wait_for_response(CONTROLLED_LOCAL_IO_TIMEOUT)
        .expect("first timeout terminal");
    let second = broker
        .wait_for_response(Duration::from_secs(8))
        .expect("replayed timeout terminal");
    for response in [&first, &second] {
        terminals
            .record_terminal(
                &serde_json::from_value(response.clone()).expect("canonical timeout response"),
            )
            .expect("exactly one correlated timeout terminal");
        assert_eq!(response["ok"], false);
        assert_eq!(response["error"]["code"], "camera_helper_timeout");
        assert_eq!(response["attempt"]["command_id"], "controlled-command");
        assert_eq!(response["attempt"]["operation_id"], "controlled-operation");
        assert_eq!(response["attempt"]["terminal_stage"], "helper_timeout");
        assert_eq!(response["attempt"]["retry_safety"], "change_strategy");
    }
    terminals
        .exact_terminals(&[
            "camera-timeout-1".to_string(),
            "camera-timeout-2".to_string(),
        ])
        .expect("complete timeout terminal set");
    assert_eq!(
        first.get("id").and_then(serde_json::Value::as_str),
        Some("camera-timeout-1")
    );
    assert_eq!(
        second.get("id").and_then(serde_json::Value::as_str),
        Some("camera-timeout-2")
    );
    assert_eq!(backend.camera_capture_calls(), 1);

    runtime.shutdown().await.expect("timeout MQTT shutdown");
    broker.stop().expect("controlled timeout broker shutdown");
    drop(TokioRuntimeHost::acquire(host_config).expect("timeout host lease returned"));
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn managed_mqtt_distinguishes_missing_camera_and_screen_artifacts_after_effects() {
    let _test_lock = CONTROLLED_RUNTIME_TEST_LOCK.lock().await;
    let secret = b"controlled-provider-secret".to_vec();
    let terminals = TerminalResponseLedger::default();
    let request_terminals = terminals.clone();
    let broker = ControlledMqttBroker::start_reconnect(
        "knowbee/v1/node/missing-artifact-node/request",
        "knowbee/v1/node/missing-artifact-node/response",
        "knowbee/v1/node/missing-artifact-node/status",
        Arc::new(move |attempt, session_id| {
            let request = if attempt == 0 {
                signed_capture_request(SignedCaptureSpec {
                    id: "missing-camera-artifact",
                    session_id,
                    secret: &secret,
                    method: "camera.capture",
                    resource_scope: "camera",
                    command_id: "missing-camera-command",
                    operation_id: "missing-camera-operation",
                    idempotency_key: "missing-camera-idempotency",
                })
            } else {
                signed_capture_request(SignedCaptureSpec {
                    id: "missing-screen-artifact",
                    session_id,
                    secret: &secret,
                    method: "screen.capture",
                    resource_scope: "screen",
                    command_id: "missing-screen-command",
                    operation_id: "missing-screen-operation",
                    idempotency_key: "missing-screen-idempotency",
                })
            };
            request_terminals
                .accept_request(&request_from_value(&request))
                .expect("missing artifact request contract");
            request
        }),
    )
    .expect("controlled missing artifact broker");
    let mut settings = YeonjangSettings {
        node_id: "missing-artifact-node".to_string(),
        ..Default::default()
    };
    settings.reset_topics_from_node_id();
    settings.connection.host = "127.0.0.1".to_string();
    settings.connection.port = broker.port();
    settings.connection.username = "controlled-user".to_string();
    settings.connection.password = "controlled-password".to_string();
    settings.permissions.allow_camera_access = true;
    settings.permissions.allow_screen_capture = true;
    let host_config = RuntimeHostConfig {
        worker_threads: 2,
        max_blocking_threads: 8,
    };
    let backend = Arc::new(SystemInfoTestBackend::with_missing_capture_artifacts());
    let runtime = build_managed_runtime(
        ManagedRuntimeConfig {
            host: host_config,
            runtime: RuntimeConfig { max_in_flight: 2 },
            dispatch: DispatchConfig { max_pending: 4 },
            completed_capacity: 16,
        },
        ManagedRuntimeDependencies::new(
            settings,
            backend.clone(),
            AuthorizationBootstrapInput::new(
                "controlled-provider",
                "controlled-key",
                "controlled-audience",
                b"controlled-provider-secret".to_vec(),
                16,
            )
            .expect("authorization input"),
            Arc::new(FixedClock),
            controlled_lease_provider(),
        ),
    )
    .expect("missing artifact managed runtime");
    let (runtime, events) = runtime
        .start_mqtt(new_shared_lifecycle_state(managed_runtime_state()))
        .expect("missing artifact managed MQTT");

    let first_event = events.recv_timeout(CONTROLLED_CONNECTION_TIMEOUT);
    assert!(
        matches!(first_event, Ok(RuntimeEvent::Connected)),
        "expected missing-artifact broker connection, got {first_event:?}"
    );
    let camera = broker
        .wait_for_response(CONTROLLED_LOCAL_IO_TIMEOUT)
        .expect("camera artifact terminal");
    let screen = broker
        .wait_for_response(Duration::from_secs(8))
        .expect("screen artifact terminal");
    for response in [&camera, &screen] {
        terminals
            .record_terminal(
                &serde_json::from_value(response.clone())
                    .expect("canonical missing artifact response"),
            )
            .expect("exactly one missing artifact terminal");
        assert_eq!(response["ok"], false);
        assert_eq!(response["error"]["code"], "artifact_missing");
        assert_eq!(response["attempt"]["terminal_stage"], "handler_failed");
        assert_eq!(response["attempt"]["retry_safety"], "unknown_effect_state");
    }
    terminals
        .exact_terminals(&[
            "missing-camera-artifact".to_string(),
            "missing-screen-artifact".to_string(),
        ])
        .expect("complete missing artifact terminal set");
    assert_eq!(camera["attempt"]["command_id"], "missing-camera-command");
    assert_eq!(
        camera["attempt"]["operation_id"],
        "missing-camera-operation"
    );
    assert_eq!(screen["attempt"]["command_id"], "missing-screen-command");
    assert_eq!(
        screen["attempt"]["operation_id"],
        "missing-screen-operation"
    );
    assert_eq!(backend.camera_capture_calls(), 1);
    assert_eq!(backend.screen_capture_calls(), 1);

    runtime
        .shutdown()
        .await
        .expect("missing artifact MQTT shutdown");
    broker
        .stop()
        .expect("controlled missing artifact broker shutdown");
    drop(TokioRuntimeHost::acquire(host_config).expect("missing artifact host lease returned"));
}

fn controlled_lease_provider() -> Arc<dyn InstanceLeaseProvider> {
    Arc::new(
        FilesystemInstanceLeaseProvider::new(
            std::env::temp_dir().join(format!(
                "knowbee-controlled-mqtt-leases-{}",
                std::process::id()
            )),
            "controlled-mqtt-provider",
        )
        .expect("controlled lease provider"),
    )
}

fn request_from_value(value: &serde_json::Value) -> knowbee_yeonjang::protocol::Request {
    parse_canonical_request(&serde_json::to_vec(value).expect("canonical request payload"))
        .expect("canonical request")
        .into_request()
}

fn signed_camera_request(id: &str, session_id: &str, secret: &[u8]) -> serde_json::Value {
    signed_capture_request(SignedCaptureSpec {
        id,
        session_id,
        secret,
        method: "camera.capture",
        resource_scope: "camera",
        command_id: "controlled-command",
        operation_id: "controlled-operation",
        idempotency_key: "controlled-idempotency",
    })
}

struct SignedCaptureSpec<'a> {
    id: &'a str,
    session_id: &'a str,
    secret: &'a [u8],
    method: &'a str,
    resource_scope: &'a str,
    command_id: &'a str,
    operation_id: &'a str,
    idempotency_key: &'a str,
}

fn signed_capture_request(spec: SignedCaptureSpec<'_>) -> serde_json::Value {
    let target_fingerprint =
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    let expires_at = 4_000_000_000_000_i64;
    let authorization_id = format!("authorization-{}", spec.command_id);
    let fields = [
        "1".to_string(),
        authorization_id.clone(),
        "controlled-provider".to_string(),
        "controlled-key".to_string(),
        "controlled-audience".to_string(),
        spec.method.to_string(),
        spec.resource_scope.to_string(),
        spec.command_id.to_string(),
        spec.operation_id.to_string(),
        spec.session_id.to_string(),
        target_fingerprint.to_string(),
        spec.idempotency_key.to_string(),
        expires_at.to_string(),
    ];
    let payload = fields
        .into_iter()
        .map(|value| format!("{}:{value}", value.len()))
        .collect::<String>();
    let mut mac = Hmac::<Sha256>::new_from_slice(spec.secret).expect("controlled HMAC");
    mac.update(payload.as_bytes());
    let proof = mac
        .finalize()
        .into_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    serde_json::json!({
        "protocolVersion": 1,
        "id": spec.id,
        "method": spec.method,
        "params": {},
        "metadata": {
            "commandId": spec.command_id,
            "operationId": spec.operation_id,
            "targetSessionId": spec.session_id,
            "targetFingerprint": target_fingerprint,
            "idempotencyKey": spec.idempotency_key,
            "expiresAt": expires_at,
            "cancelToken": "controlled-cancel",
            "authorizationReceipt": {
                "schemaVersion": 1,
                "authorizationId": authorization_id,
                "issuer": "controlled-provider",
                "issuerKeyId": "controlled-key",
                "audience": "controlled-audience",
                "method": spec.method,
                "resourceScope": spec.resource_scope,
                "commandId": spec.command_id,
                "operationId": spec.operation_id,
                "targetSessionId": spec.session_id,
                "targetFingerprint": target_fingerprint,
                "idempotencyKey": spec.idempotency_key,
                "expiresAt": expires_at,
                "proof": proof
            }
        }
    })
}
