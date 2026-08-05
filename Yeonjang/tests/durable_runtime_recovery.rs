#[path = "support/system_info_test_backend.rs"]
mod system_info_test_backend;

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use hmac::{Hmac, Mac};
use knowbee_yeonjang::artifact_sink::configured_filesystem_sink;
use knowbee_yeonjang::authorization::{
    AuthorizationClock, AuthorizationContext, AuthorizationDecision, AuthorizationReceipt,
    AuthorizationVerifier, HmacAuthorizationVerifier,
};
use knowbee_yeonjang::automation::AutomationBackend;
use knowbee_yeonjang::completed_idempotency::{
    CompletedRequestKey, CompletedResponseRepository, CompletedResponseStore,
    DurableCompletedRecord, DurableCompletedRecordStore, DurableFinalizeResult, DurableLoadResult,
    DurableReserveResult, DurableSaveResult, DurableTerminalOutcome,
};
use knowbee_yeonjang::managed_request::ManagedRequestService;
use knowbee_yeonjang::protocol::{Request, RequestMetadata, Response};
use knowbee_yeonjang::runtime::{
    DurableRecoveryDependencies, DurableResponseArchive, DurableResponseArchiveResult,
    DurableResponseResolveResult, DurableResponseResolver, RuntimeConfig, RuntimeSubmitError,
    RuntimeSupervisor,
};
use knowbee_yeonjang::settings::YeonjangSettings;
use knowbee_yeonjang::side_effect_admission::SideEffectAdmission;
use serde_json::json;
use sha2::{Digest, Sha256};
use system_info_test_backend::SystemInfoTestBackend;

struct FixedClock;
static ARTIFACT_ROOT_SEQUENCE: AtomicU64 = AtomicU64::new(0);

impl AuthorizationClock for FixedClock {
    fn now_ms(&self) -> i64 {
        1_700_000_000_000
    }
}

struct FixedDurableStore {
    record: Option<DurableCompletedRecord>,
}

impl DurableCompletedRecordStore for FixedDurableStore {
    fn load(&self, key: &CompletedRequestKey) -> DurableLoadResult {
        match &self.record {
            Some(record) if record.key() == key => {
                DurableLoadResult::Exact(Box::new(record.clone()))
            }
            Some(_) => DurableLoadResult::ScopeMismatch,
            None => DurableLoadResult::Miss,
        }
    }

    fn save(&self, _: DurableCompletedRecord) -> DurableSaveResult {
        DurableSaveResult::Unavailable
    }
}

struct FixedResolver {
    response: Option<Response>,
}

struct TransitionDurableStore {
    record: Mutex<Option<DurableCompletedRecord>>,
    events: Arc<Mutex<Vec<&'static str>>>,
}

impl DurableCompletedRecordStore for TransitionDurableStore {
    fn load(&self, key: &CompletedRequestKey) -> DurableLoadResult {
        match self.record.lock().expect("transition store").as_ref() {
            Some(record) if record.key() == key => {
                DurableLoadResult::Exact(Box::new(record.clone()))
            }
            Some(_) => DurableLoadResult::ScopeMismatch,
            None => DurableLoadResult::Miss,
        }
    }

    fn save(&self, _: DurableCompletedRecord) -> DurableSaveResult {
        DurableSaveResult::Unavailable
    }

    fn reserve(&self, record: DurableCompletedRecord) -> DurableReserveResult {
        let mut slot = self.record.lock().expect("transition store");
        if slot.is_some() {
            return DurableReserveResult::AlreadyReserved;
        }
        self.events.lock().expect("events").push("reserve");
        *slot = Some(record);
        DurableReserveResult::Reserved
    }

    fn finalize(&self, record: DurableCompletedRecord) -> DurableFinalizeResult {
        let mut slot = self.record.lock().expect("transition store");
        let Some(existing) = slot.as_ref() else {
            return DurableFinalizeResult::NotReserved;
        };
        if existing.key() != record.key() {
            return DurableFinalizeResult::ScopeMismatch;
        }
        self.events.lock().expect("events").push("finalize");
        *slot = Some(record);
        DurableFinalizeResult::Finalized
    }
}

struct TransitionArchive {
    response: Mutex<Option<Response>>,
    events: Arc<Mutex<Vec<&'static str>>>,
    available: bool,
}

impl DurableResponseResolver for TransitionArchive {
    fn resolve(&self, _: &str) -> DurableResponseResolveResult {
        match self.response.lock().expect("archive").as_ref() {
            Some(response) => DurableResponseResolveResult::Found(Box::new(response.clone())),
            None => DurableResponseResolveResult::Missing,
        }
    }
}

impl DurableResponseArchive for TransitionArchive {
    fn archive(&self, response: &Response) -> DurableResponseArchiveResult {
        self.events.lock().expect("events").push("archive");
        if !self.available {
            return DurableResponseArchiveResult::Unavailable;
        }
        *self.response.lock().expect("archive") = Some(response.clone());
        DurableResponseArchiveResult::Archived {
            response_reference: "response:transition".to_string(),
        }
    }
}

impl DurableResponseResolver for FixedResolver {
    fn resolve(&self, _: &str) -> DurableResponseResolveResult {
        match &self.response {
            Some(response) => DurableResponseResolveResult::Found(Box::new(response.clone())),
            None => DurableResponseResolveResult::Missing,
        }
    }
}

#[tokio::test]
async fn restart_replay_resolves_only_exact_durable_terminal_without_reexecuting_effect() {
    let secret = b"durable-runtime-recovery-secret";
    let request = signed_camera_request("restart-delivery", secret);
    let key = CompletedRequestKey::from_request(&request, "camera").expect("completed key");
    let archived = Response::ok(None, json!({ "artifact": "opaque:camera-1" }));
    let record = durable_record(key, &archived);
    let recording = Arc::new(SystemInfoTestBackend::default());
    let supervisor = recovered_supervisor(
        secret,
        request.clone(),
        recording.clone(),
        Some(record),
        Some(archived.clone()),
        false,
    );

    let replayed = supervisor.execute(request).await.expect("durable replay");

    assert_eq!(replayed.id.as_deref(), Some("restart-delivery"));
    assert_eq!(replayed.result, archived.result);
    assert_eq!(recording.camera_capture_calls(), 0);
}

#[tokio::test]
async fn restart_replay_with_missing_record_or_response_never_reexecutes_effect() {
    let secret = b"durable-runtime-unknown-secret";
    let request = signed_camera_request("restart-unknown", secret);
    let recording = Arc::new(SystemInfoTestBackend::default());
    let missing_record =
        recovered_supervisor(secret, request.clone(), recording.clone(), None, None, true);
    assert_eq!(
        missing_record
            .execute(request.clone())
            .await
            .expect_err("unknown effect state"),
        RuntimeSubmitError::EffectStateUnknown
    );

    let key = CompletedRequestKey::from_request(&request, "camera").expect("completed key");
    let unknown_record = DurableCompletedRecord::new(
        key.clone(),
        DurableTerminalOutcome::EffectStateUnknown {
            observed_at_ms: 1_700_000_000_000,
        },
        1_700_000_000_000,
    )
    .expect("unknown effect record");
    let restarted_unknown = recovered_supervisor(
        secret,
        request.clone(),
        recording.clone(),
        Some(unknown_record),
        None,
        false,
    );
    assert_eq!(
        restarted_unknown
            .execute(request.clone())
            .await
            .expect_err("restart unknown effect"),
        RuntimeSubmitError::EffectStateUnknown
    );

    let archived = Response::ok(None, json!({ "artifact": "opaque:camera-2" }));
    let unresolved = recovered_supervisor(
        secret,
        request.clone(),
        recording.clone(),
        Some(durable_record(key, &archived)),
        None,
        false,
    );
    assert_eq!(
        unresolved
            .execute(request)
            .await
            .expect_err("unresolved durable response"),
        RuntimeSubmitError::DurableRecoveryUnavailable
    );
    assert_eq!(recording.camera_capture_calls(), 0);
}

#[tokio::test]
async fn unknown_restart_recovery_is_projected_as_structured_post_check_evidence() {
    let secret = b"durable-runtime-post-check-secret";
    let request = signed_camera_request("restart-post-check", secret);
    let recording = Arc::new(SystemInfoTestBackend::default());
    let service = ManagedRequestService::new(recovered_supervisor(
        secret,
        request.clone(),
        recording.clone(),
        None,
        None,
        true,
    ));

    let response = service.handle(request).await;
    let projected = serde_json::to_value(&response).expect("public response");

    assert!(!response.ok);
    assert_eq!(projected["error"]["code"], "effect_state_unknown");
    assert_eq!(
        projected["attempt"]["terminal_stage"],
        "effect_state_unknown"
    );
    assert_eq!(projected["attempt"]["retry_safety"], "unknown_effect_state");
    assert_eq!(recording.camera_capture_calls(), 0);
}

#[tokio::test]
async fn restart_replay_rejects_same_idempotency_key_with_different_exact_scope() {
    let secret = b"durable-runtime-scope-secret";
    let request = signed_camera_request("restart-scope", secret);
    let mut conflicting = request.clone();
    let conflicting_target =
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    conflicting.metadata.target_fingerprint = Some(conflicting_target.to_string());
    let receipt = conflicting
        .metadata
        .authorization_receipt
        .as_mut()
        .expect("authorization receipt");
    receipt.target_fingerprint = conflicting_target.to_string();
    receipt.proof.clear();
    sign_request(&mut conflicting, secret);
    let conflicting_key =
        CompletedRequestKey::from_request(&conflicting, "camera").expect("conflicting key");
    let archived = Response::ok(None, json!({ "artifact": "opaque:camera-conflict" }));
    let recording = Arc::new(SystemInfoTestBackend::default());
    let supervisor = recovered_supervisor(
        secret,
        request.clone(),
        recording.clone(),
        Some(durable_record(conflicting_key, &archived)),
        Some(archived),
        false,
    );

    assert_eq!(
        supervisor
            .execute(request)
            .await
            .expect_err("scope collision"),
        RuntimeSubmitError::IdempotencyConflict
    );
    assert_eq!(recording.camera_capture_calls(), 0);
}

#[tokio::test]
async fn durable_runtime_reserves_before_effect_and_finalizes_after_response_archive() {
    let secret = b"durable-runtime-persistence-secret";
    let request = signed_camera_request("persistent-first", secret);
    let events = Arc::new(Mutex::new(Vec::new()));
    let recording = Arc::new(SystemInfoTestBackend::with_events(events.clone()));
    let store = Arc::new(TransitionDurableStore {
        record: Mutex::new(None),
        events: events.clone(),
    });
    let archive = Arc::new(TransitionArchive {
        response: Mutex::new(None),
        events: events.clone(),
        available: true,
    });
    let first = persistent_supervisor(secret, recording.clone(), store.clone(), archive.clone());

    let first_response = first.execute(request.clone()).await.expect("first effect");

    assert!(first_response.ok);
    assert_eq!(
        events.lock().expect("events").as_slice(),
        &["reserve", "effect", "archive", "finalize"]
    );
    assert_eq!(recording.camera_capture_calls(), 1);

    let mut redelivery = request;
    redelivery.id = Some("persistent-redelivery".to_string());
    let restarted =
        persistent_supervisor(secret, recording.clone(), store.clone(), archive.clone());
    let replayed = restarted.execute(redelivery).await.expect("restart replay");
    assert_eq!(replayed.id.as_deref(), Some("persistent-redelivery"));
    assert_eq!(recording.camera_capture_calls(), 1);
    assert_eq!(
        events.lock().expect("events").as_slice(),
        &["reserve", "effect", "archive", "finalize"]
    );
}

#[tokio::test]
async fn failed_archive_leaves_unknown_reservation_and_restart_never_reexecutes_effect() {
    let secret = b"durable-runtime-archive-failure";
    let request = signed_camera_request("archive-failure", secret);
    let events = Arc::new(Mutex::new(Vec::new()));
    let recording = Arc::new(SystemInfoTestBackend::with_events(events.clone()));
    let store = Arc::new(TransitionDurableStore {
        record: Mutex::new(None),
        events: events.clone(),
    });
    let archive = Arc::new(TransitionArchive {
        response: Mutex::new(None),
        events: events.clone(),
        available: false,
    });
    let first = persistent_supervisor(secret, recording.clone(), store.clone(), archive.clone());

    assert_eq!(
        first
            .execute(request.clone())
            .await
            .expect_err("archive failure"),
        RuntimeSubmitError::DurableRecoveryUnavailable
    );
    assert_eq!(
        events.lock().expect("events").as_slice(),
        &["reserve", "effect", "archive"]
    );
    assert_eq!(recording.camera_capture_calls(), 1);

    let restarted = persistent_supervisor(secret, recording.clone(), store, archive);
    assert_eq!(
        restarted
            .execute(request)
            .await
            .expect_err("unknown reservation after restart"),
        RuntimeSubmitError::EffectStateUnknown
    );
    assert_eq!(recording.camera_capture_calls(), 1);
}

#[tokio::test]
async fn concurrent_supervisors_with_same_durable_idempotency_key_enter_effect_at_most_once() {
    let secret = b"durable-runtime-concurrent-secret";
    let first_request = signed_camera_request("concurrent-first", secret);
    let mut second_request = first_request.clone();
    second_request.id = Some("concurrent-second".to_string());
    let events = Arc::new(Mutex::new(Vec::new()));
    let recording = Arc::new(SystemInfoTestBackend::with_events(events.clone()));
    let store = Arc::new(TransitionDurableStore {
        record: Mutex::new(None),
        events: events.clone(),
    });
    let archive = Arc::new(TransitionArchive {
        response: Mutex::new(None),
        events,
        available: true,
    });
    let first = persistent_supervisor(secret, recording.clone(), store.clone(), archive.clone());
    let second = persistent_supervisor(secret, recording.clone(), store, archive);

    let (first_result, second_result) =
        tokio::join!(first.execute(first_request), second.execute(second_request));

    assert!(first_result.is_ok() || second_result.is_ok());
    assert!(
        first_result.is_ok() || matches!(first_result, Err(RuntimeSubmitError::EffectStateUnknown))
    );
    assert!(
        second_result.is_ok()
            || matches!(second_result, Err(RuntimeSubmitError::EffectStateUnknown))
    );
    assert_eq!(recording.camera_capture_calls(), 1);
}

fn recovered_supervisor(
    secret: &[u8],
    request: Request,
    backend: Arc<SystemInfoTestBackend>,
    record: Option<DurableCompletedRecord>,
    response: Option<Response>,
    consume_authorization_before_execute: bool,
) -> RuntimeSupervisor {
    let verifier = Arc::new(
        HmacAuthorizationVerifier::new(
            secret,
            "durable-provider",
            "durable-key",
            "durable-audience",
            Arc::new(FixedClock),
        )
        .expect("HMAC verifier"),
    );
    let receipt = request
        .metadata
        .authorization_receipt
        .as_ref()
        .expect("authorization receipt");
    let context = AuthorizationContext {
        method: receipt.method.clone(),
        resource_scope: receipt.resource_scope.clone(),
        command_id: receipt.command_id.clone(),
        operation_id: receipt.operation_id.clone(),
        target_session_id: receipt.target_session_id.clone(),
        target_fingerprint: receipt.target_fingerprint.clone(),
        idempotency_key: receipt.idempotency_key.clone(),
        expires_at: receipt.expires_at,
    };
    if consume_authorization_before_execute {
        assert_eq!(
            verifier.verify(receipt, &context),
            AuthorizationDecision::Authorized
        );
    }
    let completed: Arc<dyn CompletedResponseStore> =
        Arc::new(CompletedResponseRepository::new(4).expect("completed store"));
    let backend: Arc<dyn AutomationBackend> = backend;
    RuntimeSupervisor::new_with_admission_completed_and_recovery(
        RuntimeConfig { max_in_flight: 1 },
        settings(),
        backend,
        SideEffectAdmission::new(verifier),
        completed,
        DurableRecoveryDependencies::new(
            Arc::new(FixedDurableStore { record }),
            Arc::new(FixedResolver { response }),
        ),
    )
    .expect("recovered runtime")
}

fn persistent_supervisor(
    secret: &[u8],
    backend: Arc<SystemInfoTestBackend>,
    store: Arc<TransitionDurableStore>,
    archive: Arc<TransitionArchive>,
) -> RuntimeSupervisor {
    let verifier = Arc::new(
        HmacAuthorizationVerifier::new(
            secret,
            "durable-provider",
            "durable-key",
            "durable-audience",
            Arc::new(FixedClock),
        )
        .expect("HMAC verifier"),
    );
    let completed: Arc<dyn CompletedResponseStore> =
        Arc::new(CompletedResponseRepository::new(4).expect("completed store"));
    let backend: Arc<dyn AutomationBackend> = backend;
    let mut settings = settings();
    settings.capture_artifact_root = std::env::temp_dir()
        .join(format!(
            "knowbee-durable-artifacts-{}-{}",
            std::process::id(),
            ARTIFACT_ROOT_SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ))
        .display()
        .to_string();
    let artifact_sink =
        configured_filesystem_sink(&settings.capture_artifact_root, &settings.instance_id)
            .expect("test artifact sink");
    RuntimeSupervisor::new_with_admission_completed_recovery_and_artifact_sink(
        RuntimeConfig { max_in_flight: 1 },
        settings,
        backend,
        SideEffectAdmission::new(verifier),
        completed,
        DurableRecoveryDependencies::new_with_persistence(
            store,
            archive.clone(),
            archive,
            Arc::new(FixedClock),
        ),
        artifact_sink,
    )
    .expect("persistent runtime")
}

fn durable_record(key: CompletedRequestKey, response: &Response) -> DurableCompletedRecord {
    let encoded = serde_json::to_vec(response).expect("public response");
    let digest = format!("sha256:{:x}", Sha256::digest(encoded));
    DurableCompletedRecord::new(
        key,
        DurableTerminalOutcome::Succeeded {
            response_digest: digest,
            response_reference: "response:restart-fixture".to_string(),
        },
        1_700_000_000_000,
    )
    .expect("durable record")
}

fn settings() -> YeonjangSettings {
    let mut settings = YeonjangSettings::default();
    settings.permissions.allow_camera_access = true;
    settings
}

fn signed_camera_request(id: &str, secret: &[u8]) -> Request {
    let target = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    let mut request = Request {
        id: Some(id.to_string()),
        method: "camera.capture".to_string(),
        params: json!({}),
        metadata: RequestMetadata {
            command_id: Some("durable-command".to_string()),
            operation_id: Some("durable-operation".to_string()),
            target_session_id: Some("durable-session".to_string()),
            target_fingerprint: Some(target.to_string()),
            idempotency_key: Some("durable-idempotency".to_string()),
            expires_at: Some(4_000_000_000_000),
            cancel_token: Some("durable-cancel".to_string()),
            authorization_receipt: Some(AuthorizationReceipt {
                schema_version: 1,
                authorization_id: "durable-authorization".to_string(),
                issuer: "durable-provider".to_string(),
                issuer_key_id: "durable-key".to_string(),
                audience: "durable-audience".to_string(),
                method: "camera.capture".to_string(),
                resource_scope: "camera".to_string(),
                command_id: "durable-command".to_string(),
                operation_id: "durable-operation".to_string(),
                target_session_id: "durable-session".to_string(),
                target_fingerprint: target.to_string(),
                idempotency_key: "durable-idempotency".to_string(),
                expires_at: 4_000_000_000_000,
                proof: String::new(),
            }),
            ..Default::default()
        },
    };
    sign_request(&mut request, secret);
    request
}

fn sign_request(request: &mut Request, secret: &[u8]) {
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
}
