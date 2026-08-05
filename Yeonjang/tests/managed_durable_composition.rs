#[path = "support/system_info_test_backend.rs"]
mod system_info_test_backend;

use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use hmac::{Hmac, Mac};
use knowbee_yeonjang::atomic_local_storage::AtomicLocalStorage;
use knowbee_yeonjang::authorization::{AuthorizationClock, AuthorizationReceipt};
use knowbee_yeonjang::authorization_bootstrap::AuthorizationBootstrapInput;
use knowbee_yeonjang::automation::AutomationBackend;
use knowbee_yeonjang::durable_cancellation::DurableCancellationReceiptRepository;
use knowbee_yeonjang::durable_completed_store::DurableRecordRepository;
use knowbee_yeonjang::durable_response_archive::ResponseArchiveRepository;
use knowbee_yeonjang::instance_process_lease::{
    FilesystemRuntimeLeaseProvider, RuntimeLeaseGuard, RuntimeLeaseProvider,
};
use knowbee_yeonjang::managed_composition::{
    ManagedDurableDependencies, ManagedRuntimeConfig, ManagedRuntimeDependencies,
    build_managed_runtime,
};
use knowbee_yeonjang::protocol::{Request, RequestMetadata};
use knowbee_yeonjang::request_dispatcher::DispatchConfig;
use knowbee_yeonjang::runtime::RuntimeConfig;
use knowbee_yeonjang::runtime_host::RuntimeHostConfig;
use knowbee_yeonjang::settings::YeonjangSettings;
use sha2::Sha256;
use system_info_test_backend::SystemInfoTestBackend;

static TEMP_SEQUENCE: AtomicUsize = AtomicUsize::new(0);
static MANAGED_RUNTIME_TEST_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

struct FixedClock;

impl AuthorizationClock for FixedClock {
    fn now_ms(&self) -> i64 {
        1_700_000_000_000
    }
}

#[tokio::test]
async fn managed_restart_recovery_replays_cancelled_effect_and_control_receipt_without_reexecution()
{
    let _test_guard = MANAGED_RUNTIME_TEST_LOCK.lock().await;
    let secret = b"managed-real-durable-secret";
    let files = TempDurableFiles::new();
    let record_storage = files.storage("records");
    let response_storage = files.storage("responses");
    let cancellation_storage = files.storage("cancellations");
    let backend = Arc::new(SystemInfoTestBackend::with_cancellation_wait());
    let host = RuntimeHostConfig {
        worker_threads: 1,
        max_blocking_threads: 2,
    };

    let first = build_managed_runtime(
        managed_config(host),
        real_durable_dependencies(
            secret,
            backend.clone(),
            record_storage.clone(),
            response_storage.clone(),
            cancellation_storage.clone(),
        ),
    )
    .expect("first managed runtime");
    let first_camera = first
        .dispatcher()
        .try_dispatch(signed_camera_request("first-delivery", secret))
        .expect("first dispatch");
    let started_deadline = std::time::Instant::now() + std::time::Duration::from_secs(1);
    while !backend.camera_capture_started() {
        assert!(
            std::time::Instant::now() < started_deadline,
            "camera effect did not start"
        );
        std::thread::sleep(std::time::Duration::from_millis(1));
    }
    let cancel_response = first
        .dispatcher()
        .try_dispatch(cancellation_request("cancel-control"))
        .expect("cancel dispatch")
        .await
        .expect("cancel worker");
    assert!(cancel_response.ok);
    assert_eq!(
        cancel_response
            .result
            .as_ref()
            .and_then(|result| result.get("accepted"))
            .and_then(serde_json::Value::as_bool),
        Some(true)
    );
    let first_response = first_camera.await.expect("first worker");
    assert!(!first_response.ok);
    assert_eq!(
        first_response
            .error
            .as_ref()
            .map(|error| error.code.as_str()),
        Some("camera_capture_cancelled")
    );
    assert_eq!(backend.camera_capture_calls(), 1);
    first.shutdown().await;

    let restarted = build_managed_runtime(
        managed_config(host),
        real_durable_dependencies(
            secret,
            backend.clone(),
            record_storage,
            response_storage,
            cancellation_storage,
        ),
    )
    .expect("restarted managed runtime");
    let replayed_cancel = restarted
        .dispatcher()
        .try_dispatch(cancellation_request("cancel-control"))
        .expect("restart cancel dispatch")
        .await
        .expect("restart cancel worker");
    assert!(replayed_cancel.ok);
    assert_eq!(replayed_cancel.result, cancel_response.result);
    let replayed = restarted
        .dispatcher()
        .try_dispatch(signed_camera_request("restart-delivery", secret))
        .expect("restart dispatch")
        .await
        .expect("restart worker");
    assert!(!replayed.ok);
    assert_eq!(replayed.id.as_deref(), Some("restart-delivery"));
    assert_eq!(
        replayed.error.as_ref().map(|error| error.code.as_str()),
        Some("camera_capture_cancelled")
    );
    assert_eq!(backend.camera_capture_calls(), 1);
    restarted.shutdown().await;
}

#[tokio::test]
async fn exact_late_cancel_recovers_original_terminal_after_restart_without_reexecution() {
    let _test_guard = MANAGED_RUNTIME_TEST_LOCK.lock().await;
    let secret = b"managed-terminal-index-secret";
    let files = TempDurableFiles::new();
    let record_storage = files.storage("records");
    let response_storage = files.storage("responses");
    let cancellation_storage = files.storage("cancellations");
    let backend = Arc::new(SystemInfoTestBackend::default());
    let host = RuntimeHostConfig {
        worker_threads: 1,
        max_blocking_threads: 2,
    };

    let first = build_managed_runtime(
        managed_config(host),
        real_durable_dependencies(
            secret,
            backend.clone(),
            record_storage.clone(),
            response_storage.clone(),
            cancellation_storage.clone(),
        ),
    )
    .expect("first managed runtime");
    let completed = first
        .dispatcher()
        .try_dispatch(signed_camera_request("terminal-delivery", secret))
        .expect("terminal dispatch")
        .await
        .expect("terminal worker");
    assert!(completed.ok);
    assert_eq!(backend.camera_capture_calls(), 1);
    first.shutdown().await;

    let restarted = build_managed_runtime(
        managed_config(host),
        real_durable_dependencies(
            secret,
            backend.clone(),
            record_storage,
            response_storage,
            cancellation_storage,
        ),
    )
    .expect("restarted managed runtime");
    let wrong_operation = restarted
        .dispatcher()
        .try_dispatch(exact_cancellation_request_with_binding(
            "wrong-operation-control",
            "terminal-delivery",
            "wrong-operation",
            "managed-cancel",
        ))
        .expect("wrong operation dispatch")
        .await
        .expect("wrong operation worker");
    assert_eq!(
        wrong_operation
            .error
            .as_ref()
            .map(|error| error.code.as_str()),
        Some("cancellation_binding_mismatch")
    );
    let wrong_token = restarted
        .dispatcher()
        .try_dispatch(exact_cancellation_request_with_binding(
            "wrong-token-control",
            "terminal-delivery",
            "managed-operation",
            "wrong-token",
        ))
        .expect("wrong token dispatch")
        .await
        .expect("wrong token worker");
    assert_eq!(
        wrong_token.error.as_ref().map(|error| error.code.as_str()),
        Some("cancellation_binding_mismatch")
    );
    let legacy = restarted
        .dispatcher()
        .try_dispatch(cancellation_request("legacy-late-control"))
        .expect("legacy late cancellation dispatch")
        .await
        .expect("legacy late cancellation worker");
    assert_eq!(
        legacy.error.as_ref().map(|error| error.code.as_str()),
        Some("command_cancellation_not_active")
    );
    let late = restarted
        .dispatcher()
        .try_dispatch(exact_cancellation_request(
            "late-control",
            "terminal-delivery",
        ))
        .expect("late cancellation dispatch")
        .await
        .expect("late cancellation worker");
    assert!(!late.ok);
    assert_eq!(
        late.error.as_ref().map(|error| error.code.as_str()),
        Some("command_already_terminal")
    );
    assert_eq!(backend.camera_capture_calls(), 1);
    restarted.shutdown().await;
}

fn managed_config(host: RuntimeHostConfig) -> ManagedRuntimeConfig {
    ManagedRuntimeConfig {
        host,
        runtime: RuntimeConfig { max_in_flight: 1 },
        dispatch: DispatchConfig { max_pending: 2 },
        completed_capacity: 4,
    }
}

fn real_durable_dependencies(
    secret: &[u8],
    backend: Arc<SystemInfoTestBackend>,
    record_storage: Arc<AtomicLocalStorage>,
    response_storage: Arc<AtomicLocalStorage>,
    cancellation_storage: Arc<AtomicLocalStorage>,
) -> ManagedRuntimeDependencies {
    let records =
        Arc::new(DurableRecordRepository::bootstrap(4, record_storage).expect("record repository"));
    let archive = Arc::new(
        ResponseArchiveRepository::bootstrap(4, 4096, 16_384, response_storage)
            .expect("response repository"),
    );
    let cancellations = Arc::new(
        DurableCancellationReceiptRepository::bootstrap(4, cancellation_storage)
            .expect("cancellation repository"),
    );
    let mut settings = YeonjangSettings::default();
    settings.permissions.allow_camera_access = true;
    let backend: Arc<dyn AutomationBackend> = backend;
    ManagedRuntimeDependencies::new_with_durable(
        settings,
        backend,
        AuthorizationBootstrapInput::new(
            "managed-durable",
            "managed-key",
            "managed-audience",
            secret.to_vec(),
            16,
        )
        .expect("authorization"),
        Arc::new(FixedClock),
        ManagedDurableDependencies::new(records, archive.clone(), archive)
            .with_cancellations(cancellations),
        durable_runtime_lease(),
    )
}

fn durable_runtime_lease() -> RuntimeLeaseGuard {
    FilesystemRuntimeLeaseProvider::new(std::env::temp_dir().join(format!(
        "knowbee-managed-durable-runtime-leases-{}",
        std::process::id()
    )))
    .expect("durable lease provider")
    .acquire()
    .expect("durable runtime lease")
}

struct TempDurableFiles {
    root: PathBuf,
}

impl TempDurableFiles {
    fn new() -> Self {
        let sequence = TEMP_SEQUENCE.fetch_add(1, Ordering::SeqCst);
        let root = std::env::temp_dir().join(format!(
            "knowbee-managed-durable-{}-{sequence}",
            std::process::id()
        ));
        fs::create_dir(&root).expect("temp durable directory");
        Self {
            root: fs::canonicalize(root).expect("canonical durable directory"),
        }
    }

    fn storage(&self, name: &str) -> Arc<AtomicLocalStorage> {
        Arc::new(
            AtomicLocalStorage::open(
                self.root.join(format!("{name}.json")),
                self.root.join(format!("{name}.lock")),
                64 * 1024,
            )
            .expect("atomic local storage"),
        )
    }
}

impl Drop for TempDurableFiles {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.root).expect("remove durable temp directory");
    }
}

fn cancellation_request(id: &str) -> Request {
    Request {
        id: Some(id.to_string()),
        method: "command.cancel".to_string(),
        params: serde_json::json!({
            "command_id": "managed-command",
            "cancel_token": "managed-cancel",
        }),
        metadata: Default::default(),
    }
}

fn exact_cancellation_request(id: &str, target_request_id: &str) -> Request {
    exact_cancellation_request_with_binding(
        id,
        target_request_id,
        "managed-operation",
        "managed-cancel",
    )
}

fn exact_cancellation_request_with_binding(
    id: &str,
    target_request_id: &str,
    operation_id: &str,
    cancel_token: &str,
) -> Request {
    Request {
        id: Some(id.to_string()),
        method: "command.cancel".to_string(),
        params: serde_json::json!({
            "schema_version": 1,
            "target_request_id": target_request_id,
            "command_id": "managed-command",
            "operation_id": operation_id,
            "target_session_id": "managed-session",
            "target_fingerprint": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "idempotency_key": "managed-idempotency",
            "cancel_token": cancel_token,
            "reason_kind": "user_requested",
            "requested_at_ms": 1_700_000_000_000_i64,
        }),
        metadata: Default::default(),
    }
}

fn signed_camera_request(id: &str, secret: &[u8]) -> Request {
    let target = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    let mut request = Request {
        id: Some(id.to_string()),
        method: "camera.capture".to_string(),
        params: serde_json::json!({}),
        metadata: RequestMetadata {
            command_id: Some("managed-command".to_string()),
            operation_id: Some("managed-operation".to_string()),
            target_session_id: Some("managed-session".to_string()),
            target_fingerprint: Some(target.to_string()),
            idempotency_key: Some("managed-idempotency".to_string()),
            expires_at: Some(4_000_000_000_000),
            cancel_token: Some("managed-cancel".to_string()),
            authorization_receipt: Some(AuthorizationReceipt {
                schema_version: 1,
                authorization_id: "managed-authorization".to_string(),
                issuer: "managed-durable".to_string(),
                issuer_key_id: "managed-key".to_string(),
                audience: "managed-audience".to_string(),
                method: "camera.capture".to_string(),
                resource_scope: "camera".to_string(),
                command_id: "managed-command".to_string(),
                operation_id: "managed-operation".to_string(),
                target_session_id: "managed-session".to_string(),
                target_fingerprint: target.to_string(),
                idempotency_key: "managed-idempotency".to_string(),
                expires_at: 4_000_000_000_000,
                proof: String::new(),
            }),
            ..Default::default()
        },
    };
    let receipt = request
        .metadata
        .authorization_receipt
        .as_mut()
        .expect("authorization receipt");
    let payload = [
        receipt.schema_version.to_string(),
        receipt.authorization_id.clone(),
        receipt.issuer.clone(),
        receipt.issuer_key_id.clone(),
        receipt.audience.clone(),
        receipt.method.clone(),
        receipt.resource_scope.clone(),
        receipt.command_id.clone(),
        receipt.operation_id.clone(),
        receipt.target_session_id.clone(),
        receipt.target_fingerprint.clone(),
        receipt.idempotency_key.clone(),
        receipt.expires_at.to_string(),
    ]
    .into_iter()
    .map(|value| format!("{}:{value}", value.len()))
    .collect::<String>();
    let mut mac = Hmac::<Sha256>::new_from_slice(secret).expect("test HMAC");
    mac.update(payload.as_bytes());
    receipt.proof = mac
        .finalize()
        .into_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    request
}
