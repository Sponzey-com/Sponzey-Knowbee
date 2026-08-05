#[path = "support/protocol_fixture.rs"]
mod protocol_fixture;

use anyhow::{Result, bail};
use hmac::{Hmac, Mac};
use knowbee_yeonjang::artifact_sink::configured_filesystem_sink;
use knowbee_yeonjang::authorization::{
    AuthorizationClock, AuthorizationContext, AuthorizationDecision, AuthorizationReceipt,
    AuthorizationRejection, AuthorizationVerifier, HmacAuthorizationVerifier,
};
use knowbee_yeonjang::authorization_bootstrap::AuthorizationBootstrapInput;
use knowbee_yeonjang::automation::{
    ApplicationLaunchRequest, ApplicationLaunchResult, AutomationBackend, AutomationCapabilities,
    CameraCaptureProcessError, CameraCaptureRequest, CameraCaptureResult, CameraDevice,
    CommandExecutionRequest, CommandExecutionResult, FocusedTargetResult, KeyboardTypeRequest,
    KeyboardTypeResult, MouseClickRequest, MouseClickResult, MouseMoveRequest, MouseMoveResult,
    MousePositionResult, PlatformKind, ScreenCaptureRequest, ScreenCaptureResult,
    SystemControlRequest, SystemControlResult, SystemSnapshot,
};
use knowbee_yeonjang::cancellation::{
    CancellationReasonKind, CommandTargetBinding, ExactCancellationRequest,
};
use knowbee_yeonjang::completed_idempotency::CompletedResponseRepository;
use knowbee_yeonjang::handle_request_with_settings_and_backend;
use knowbee_yeonjang::instance_process_lease::{
    FilesystemRuntimeLeaseProvider, RuntimeLeaseProvider,
};
use knowbee_yeonjang::managed_composition::{
    ManagedMqttStartError, ManagedRuntimeBuildError, ManagedRuntimeConfig,
    ManagedRuntimeDependencies, ManagedRuntimeWorkConfig, build_managed_runtime,
    build_managed_runtime_on_handle,
};
use knowbee_yeonjang::managed_request::ManagedRequestService;
use knowbee_yeonjang::protocol::{CommandAttemptCancellationReason, Request};
use knowbee_yeonjang::request_dispatcher::{
    DeliveryError, DispatchBuildError, DispatchCompletion, DispatchConfig, DispatchError,
    ResponseDelivery, TokioRequestDispatcher,
};
use knowbee_yeonjang::runtime::{
    RuntimeBuildError, RuntimeCancelResult, RuntimeConfig, RuntimeSubmitError, RuntimeSupervisor,
};
use knowbee_yeonjang::runtime_host::{RuntimeHostConfig, TokioRuntimeHost};
use knowbee_yeonjang::settings::YeonjangSettings;
use knowbee_yeonjang::side_effect_admission::SideEffectAdmission;
use knowbee_yeonjang::{managed_runtime_state, new_shared_lifecycle_state};
use protocol_fixture::ReadOnlyProtocolFixture;
use serde_json::json;

static RUNTIME_HOST_TEST_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
use sha2::Sha256;
use std::fs;
use std::sync::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Barrier};
use std::thread;
use std::time::Duration;
use support::{ControlledTestProvider, TestProviderError};

const TEST_JPEG: &[u8] = &[
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x01, 0x00, 0x01, 0x03, 0x01, 0x11, 0x00, 0x02,
    0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9,
];
const TEST_PNG: &[u8] = &[
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0xf0,
    0x1f, 0x00, 0x05, 0x00, 0x01, 0xff, 0x89, 0x99, 0x3d, 0x1d, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
    0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
];

#[derive(Default)]
struct FakeBackend {
    camera_capture_calls: AtomicUsize,
    active_camera_capture: AtomicUsize,
    max_active_camera_capture: AtomicUsize,
    camera_capture_delay: Option<Duration>,
    camera_success_release: Option<Arc<Barrier>>,
    screen_capture_calls: AtomicUsize,
    screen_capture_delay: Option<Duration>,
    active_side_effects: AtomicUsize,
    max_active_side_effects: AtomicUsize,
    side_effect_start_barrier: Option<Arc<Barrier>>,
    active_system_info: AtomicUsize,
    max_active_system_info: AtomicUsize,
    system_info_release: Option<Arc<Barrier>>,
    wait_for_camera_cancellation: bool,
    camera_cancel_release: Option<Arc<Barrier>>,
    panic_camera_capture: bool,
    expose_private_system_error: bool,
}

struct AllowTestAuthorizationVerifier;

struct FixedAuthorizationClock;

impl AuthorizationClock for FixedAuthorizationClock {
    fn now_ms(&self) -> i64 {
        1_000
    }
}

fn runtime_with_authorization(
    config: RuntimeConfig,
    settings: YeonjangSettings,
    backend: Arc<dyn AutomationBackend>,
    authorization: Arc<dyn AuthorizationVerifier>,
) -> Result<RuntimeSupervisor, RuntimeBuildError> {
    let artifact_sink =
        configured_filesystem_sink(&settings.capture_artifact_root, &settings.instance_id)
            .expect("test artifact sink");
    RuntimeSupervisor::new_with_authorization_and_artifact_sink(
        config,
        settings,
        backend,
        authorization,
        artifact_sink,
    )
}

struct BlockingResponseDelivery {
    started: Arc<Barrier>,
    release: Arc<Barrier>,
    response_ids: Mutex<Vec<Option<String>>>,
}

#[derive(Default)]
struct FailingResponseDelivery {
    observed_success: AtomicUsize,
}

impl ResponseDelivery for FailingResponseDelivery {
    fn deliver(
        &self,
        response: &knowbee_yeonjang::protocol::Response,
    ) -> Result<(), DeliveryError> {
        self.observed_success
            .store(usize::from(response.ok), Ordering::SeqCst);
        Err(DeliveryError::Unavailable)
    }
}

impl ResponseDelivery for BlockingResponseDelivery {
    fn deliver(
        &self,
        response: &knowbee_yeonjang::protocol::Response,
    ) -> Result<(), DeliveryError> {
        self.started.wait();
        self.release.wait();
        self.response_ids
            .lock()
            .expect("delivery recording")
            .push(response.id.clone());
        Ok(())
    }
}

impl AuthorizationVerifier for AllowTestAuthorizationVerifier {
    fn verify(
        &self,
        receipt: &AuthorizationReceipt,
        context: &AuthorizationContext,
    ) -> AuthorizationDecision {
        if receipt.schema_version == 1
            && receipt.method == context.method
            && receipt.resource_scope == context.resource_scope
            && receipt.command_id == context.command_id
            && receipt.operation_id == context.operation_id
            && receipt.target_session_id == context.target_session_id
            && receipt.target_fingerprint == context.target_fingerprint
            && receipt.idempotency_key == context.idempotency_key
            && receipt.expires_at == context.expires_at
            && receipt.proof == "test-proof"
        {
            AuthorizationDecision::Authorized
        } else {
            AuthorizationDecision::Rejected(AuthorizationRejection::ScopeMismatch)
        }
    }
}

impl AutomationBackend for FakeBackend {
    fn platform_kind(&self) -> PlatformKind {
        PlatformKind::Unknown
    }

    fn capabilities(&self) -> AutomationCapabilities {
        AutomationCapabilities {
            platform: PlatformKind::Unknown,
            camera_management: true,
            command_execution: false,
            application_launch: false,
            screen_capture: true,
            mouse_control: false,
            keyboard_control: false,
            system_control: false,
        }
    }

    fn system_info(&self) -> Result<SystemSnapshot> {
        if self.expose_private_system_error {
            bail!("/Users/private/device failed with token=secret-value");
        }
        let active = self.active_system_info.fetch_add(1, Ordering::SeqCst) + 1;
        self.max_active_system_info
            .fetch_max(active, Ordering::SeqCst);
        match &self.system_info_release {
            Some(release) => {
                release.wait();
            }
            None => thread::sleep(Duration::from_millis(40)),
        }
        self.active_system_info.fetch_sub(1, Ordering::SeqCst);
        Ok(SystemSnapshot {
            node: "fake-node".to_string(),
            version: "test".to_string(),
            platform: PlatformKind::Unknown,
            os: "test-os".to_string(),
            arch: "test-arch".to_string(),
            current_dir: "redacted".to_string(),
            executable: "fake".to_string(),
            user: None,
        })
    }

    fn control_system(&self, _: SystemControlRequest) -> Result<SystemControlResult> {
        bail!("not used")
    }

    fn execute_command(&self, _: CommandExecutionRequest) -> Result<CommandExecutionResult> {
        bail!("not used")
    }

    fn launch_application(&self, _: ApplicationLaunchRequest) -> Result<ApplicationLaunchResult> {
        bail!("not used")
    }

    fn list_cameras(&self) -> Result<Vec<CameraDevice>> {
        Ok(vec![CameraDevice {
            id: "fake-camera".to_string(),
            name: "Fake Camera".to_string(),
            position: Some("virtual".to_string()),
            available: true,
        }])
    }

    fn capture_camera(&self, request: CameraCaptureRequest) -> Result<CameraCaptureResult> {
        self.camera_capture_calls.fetch_add(1, Ordering::SeqCst);
        assert!(!self.panic_camera_capture, "fake camera worker panic");
        let active = self.active_camera_capture.fetch_add(1, Ordering::SeqCst) + 1;
        self.max_active_camera_capture
            .fetch_max(active, Ordering::SeqCst);
        let active_side_effects = self.active_side_effects.fetch_add(1, Ordering::SeqCst) + 1;
        self.max_active_side_effects
            .fetch_max(active_side_effects, Ordering::SeqCst);
        if let Some(barrier) = &self.side_effect_start_barrier {
            barrier.wait();
        }
        if self.wait_for_camera_cancellation {
            while !request.cancellation.load(Ordering::SeqCst) {
                thread::sleep(Duration::from_millis(1));
            }
            if let Some(release) = &self.camera_cancel_release {
                release.wait();
            }
            self.active_camera_capture.fetch_sub(1, Ordering::SeqCst);
            self.active_side_effects.fetch_sub(1, Ordering::SeqCst);
            return Err(CameraCaptureProcessError::cancelled().into());
        }
        if let Some(delay) = self.camera_capture_delay {
            if let Some(release) = &self.camera_success_release {
                release.wait();
            }
            thread::sleep(delay);
            if let Some(output_path) = request.output_path.as_deref() {
                fs::write(output_path, TEST_JPEG)?;
            }
            self.active_camera_capture.fetch_sub(1, Ordering::SeqCst);
            self.active_side_effects.fetch_sub(1, Ordering::SeqCst);
            return Ok(CameraCaptureResult {
                device_id: Some("fake-camera".to_string()),
                artifact_ref: None,
                output_path: request.output_path,
                file_name: Some("fake-camera.jpg".to_string()),
                file_extension: Some("jpg".to_string()),
                mime_type: Some("image/jpeg".to_string()),
                size_bytes: Some(TEST_JPEG.len() as u64),
                transfer_encoding: Some("base64".to_string()),
                base64_data: Some("dGVzdA==".to_string()),
                message: "fake camera captured".to_string(),
            });
        }
        self.active_camera_capture.fetch_sub(1, Ordering::SeqCst);
        self.active_side_effects.fetch_sub(1, Ordering::SeqCst);
        bail!("not used")
    }

    fn capture_screen(&self, request: ScreenCaptureRequest) -> Result<ScreenCaptureResult> {
        self.screen_capture_calls.fetch_add(1, Ordering::SeqCst);
        let active_side_effects = self.active_side_effects.fetch_add(1, Ordering::SeqCst) + 1;
        self.max_active_side_effects
            .fetch_max(active_side_effects, Ordering::SeqCst);
        if let Some(barrier) = &self.side_effect_start_barrier {
            barrier.wait();
        }
        if let Some(delay) = self.screen_capture_delay {
            thread::sleep(delay);
            if let Some(output_path) = request.output_path.as_deref() {
                fs::write(output_path, TEST_PNG)?;
            }
            self.active_side_effects.fetch_sub(1, Ordering::SeqCst);
            return Ok(ScreenCaptureResult {
                display: Some(1),
                artifact_ref: None,
                output_path: request.output_path,
                file_name: Some("fake-screen.png".to_string()),
                file_extension: Some("png".to_string()),
                mime_type: Some("image/png".to_string()),
                size_bytes: Some(TEST_PNG.len() as u64),
                transfer_encoding: Some("base64".to_string()),
                base64_data: Some("dGVzdA==".to_string()),
                message: "fake screen captured".to_string(),
            });
        }
        self.active_side_effects.fetch_sub(1, Ordering::SeqCst);
        bail!("not used")
    }

    fn mouse_position(&self) -> Result<MousePositionResult> {
        bail!("not used")
    }

    fn move_mouse(&self, _: MouseMoveRequest) -> Result<MouseMoveResult> {
        bail!("not used")
    }

    fn click_mouse(&self, _: MouseClickRequest) -> Result<MouseClickResult> {
        bail!("not used")
    }

    fn type_text(&self, _: KeyboardTypeRequest) -> Result<KeyboardTypeResult> {
        bail!("not used")
    }

    fn focused_target(&self) -> Result<FocusedTargetResult> {
        bail!("not used")
    }
}

#[test]
fn request_pipeline_uses_the_injected_backend_without_an_os_device() {
    let backend = FakeBackend::default();
    let response = handle_request_with_settings_and_backend(
        Request {
            id: Some("standalone-library-test".to_string()),
            method: "system.info".to_string(),
            params: json!({}),
            metadata: Default::default(),
        },
        YeonjangSettings::default(),
        &backend,
    );

    assert!(response.ok);
    let result = response.result.expect("system.info result");
    assert_eq!(result["node"], "fake-node");
    assert_eq!(result["os"], "test-os");
}

#[test]
fn camera_request_uses_the_injected_backend_without_the_host_camera() {
    let backend = FakeBackend::default();
    let mut settings = YeonjangSettings::default();
    settings.permissions.allow_camera_access = true;
    let response = handle_request_with_settings_and_backend(
        Request {
            id: Some("standalone-camera-test".to_string()),
            method: "camera.list".to_string(),
            params: json!({}),
            metadata: Default::default(),
        },
        settings,
        &backend,
    );

    assert!(response.ok);
    let result = response.result.expect("camera.list result");
    assert_eq!(result[0]["id"], "fake-camera");
}

#[test]
fn caller_camera_output_path_is_rejected_before_backend_execution() {
    let backend = FakeBackend::default();
    let mut settings = YeonjangSettings::default();
    settings.permissions.allow_camera_access = true;

    let response = handle_request_with_settings_and_backend(
        Request {
            id: Some("caller-output-path-test".to_string()),
            method: "camera.capture".to_string(),
            params: json!({ "output_path": "/tmp/caller-selected.jpg" }),
            metadata: Default::default(),
        },
        settings,
        &backend,
    );

    assert!(!response.ok);
    assert_eq!(backend.camera_capture_calls.load(Ordering::SeqCst), 0);
    let error = response.error.expect("path rejection");
    assert_eq!(error.code, "caller_output_path_not_allowed");
    assert_eq!(
        error.message,
        "Caller-provided capture output path is not allowed."
    );
}

#[test]
fn caller_screen_output_path_is_rejected_before_backend_execution() {
    let backend = FakeBackend::default();
    let mut settings = YeonjangSettings::default();
    settings.permissions.allow_screen_capture = true;

    let response = handle_request_with_settings_and_backend(
        Request {
            id: Some("caller-screen-path-test".to_string()),
            method: "screen.capture".to_string(),
            params: json!({ "output_path": "/tmp/caller-selected.png" }),
            metadata: Default::default(),
        },
        settings,
        &backend,
    );

    assert!(!response.ok);
    assert_eq!(backend.screen_capture_calls.load(Ordering::SeqCst), 0);
    let error = response.error.expect("path rejection");
    assert_eq!(error.code, "caller_output_path_not_allowed");
    assert_eq!(
        error.message,
        "Caller-provided capture output path is not allowed."
    );
}

#[test]
fn capture_without_exact_operation_binding_never_reaches_the_backend() {
    let backend = FakeBackend::default();
    let mut settings = YeonjangSettings::default();
    settings.permissions.allow_camera_access = true;

    let response = handle_request_with_settings_and_backend(
        Request {
            id: Some("missing-capture-operation".to_string()),
            method: "camera.capture".to_string(),
            params: json!({}),
            metadata: Default::default(),
        },
        settings,
        &backend,
    );

    assert!(!response.ok);
    assert_eq!(backend.camera_capture_calls.load(Ordering::SeqCst), 0);
    assert_eq!(
        response.error.expect("operation rejection").code,
        "artifact_operation_invalid"
    );
}

#[test]
fn independent_requests_can_overlap_on_a_shared_backend() {
    let recording = Arc::new(FakeBackend::default());
    let backend: Arc<dyn AutomationBackend> = recording.clone();
    let barrier = Arc::new(Barrier::new(3));
    let mut workers = Vec::new();

    for index in 0..3 {
        let backend = Arc::clone(&backend);
        let barrier = Arc::clone(&barrier);
        workers.push(thread::spawn(move || {
            barrier.wait();
            handle_request_with_settings_and_backend(
                Request {
                    id: Some(format!("concurrent-{index}")),
                    method: "system.info".to_string(),
                    params: json!({}),
                    metadata: Default::default(),
                },
                YeonjangSettings::default(),
                backend.as_ref(),
            )
        }));
    }

    let responses = workers
        .into_iter()
        .map(|worker| worker.join().expect("request worker"))
        .collect::<Vec<_>>();
    assert!(responses.iter().all(|response| response.ok));
    assert_eq!(recording.max_active_system_info.load(Ordering::SeqCst), 3);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn bounded_runtime_rejects_work_before_spawning_an_extra_worker() {
    let recording = Arc::new(FakeBackend::default());
    let backend: Arc<dyn AutomationBackend> = recording.clone();
    assert!(matches!(
        RuntimeSupervisor::new(
            RuntimeConfig { max_in_flight: 0 },
            YeonjangSettings::default(),
            Arc::clone(&backend),
        ),
        Err(RuntimeBuildError::InvalidMaxInFlight)
    ));
    let supervisor = RuntimeSupervisor::new(
        RuntimeConfig { max_in_flight: 2 },
        YeonjangSettings::default(),
        backend,
    )
    .expect("valid runtime config");

    let first_supervisor = supervisor.clone();
    let first = tokio::spawn(async move {
        first_supervisor
            .execute(system_info_request("bounded-1"))
            .await
    });
    let second_supervisor = supervisor.clone();
    let second = tokio::spawn(async move {
        second_supervisor
            .execute(system_info_request("bounded-2"))
            .await
    });
    while recording.active_system_info.load(Ordering::SeqCst) < 2 {
        tokio::task::yield_now().await;
    }

    let rejected = supervisor
        .execute(system_info_request("bounded-3"))
        .await
        .expect_err("capacity overflow");
    assert_eq!(rejected, RuntimeSubmitError::Backpressure);
    assert!(first.await.expect("first task").expect("first response").ok);
    assert!(
        second
            .await
            .expect("second task")
            .expect("second response")
            .ok
    );
    assert_eq!(recording.max_active_system_info.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn supervisor_accepts_the_common_prebuilt_admission_dependency() {
    let backend: Arc<dyn AutomationBackend> = Arc::new(FakeBackend::default());
    let admission = SideEffectAdmission::new(Arc::new(AllowTestAuthorizationVerifier));
    let supervisor = RuntimeSupervisor::new_with_admission(
        RuntimeConfig { max_in_flight: 1 },
        YeonjangSettings::default(),
        backend,
        admission,
    )
    .expect("valid runtime composition");

    assert!(
        supervisor
            .execute(system_info_request("prebuilt-admission"))
            .await
            .expect("read-only response")
            .ok
    );
}

#[tokio::test]
async fn supervisor_replays_completed_side_effect_without_backend_execution() {
    let recording = Arc::new(FakeBackend::default());
    let backend: Arc<dyn AutomationBackend> = recording.clone();
    let mut settings = YeonjangSettings::default();
    settings.permissions.allow_camera_access = true;
    let completed = Arc::new(CompletedResponseRepository::new(8).expect("repository"));
    let artifact_sink =
        configured_filesystem_sink(&settings.capture_artifact_root, &settings.instance_id)
            .expect("test artifact sink");
    let supervisor = RuntimeSupervisor::new_with_admission_completed_and_artifact_sink(
        RuntimeConfig { max_in_flight: 1 },
        settings,
        backend,
        SideEffectAdmission::new(Arc::new(AllowTestAuthorizationVerifier)),
        completed,
        artifact_sink,
    )
    .expect("runtime");
    let first = bound_camera_request(
        "idempotency-first",
        "idempotency-command",
        "idempotency-cancel",
    );
    let mut redelivery = first.clone();
    redelivery.id = Some("idempotency-redelivery".to_string());

    let first_response = supervisor.execute(first).await.expect("first response");
    let replayed = supervisor
        .execute(redelivery)
        .await
        .expect("cached response");

    assert_eq!(replayed.ok, first_response.ok);
    assert_eq!(replayed.result, first_response.result);
    assert_eq!(
        replayed.error.as_ref().map(|error| error.code.as_str()),
        first_response
            .error
            .as_ref()
            .map(|error| error.code.as_str())
    );
    assert_eq!(replayed.id.as_deref(), Some("idempotency-redelivery"));
    assert_eq!(recording.camera_capture_calls.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn verified_hmac_replay_recovers_only_the_exact_completed_response() {
    let secret = b"completed-replay-test-secret";
    let recording = Arc::new(FakeBackend::default());
    let backend: Arc<dyn AutomationBackend> = recording.clone();
    let mut settings = YeonjangSettings::default();
    settings.permissions.allow_camera_access = true;
    let verifier = HmacAuthorizationVerifier::new(
        secret,
        "test-provider",
        "test-key-1",
        "yeonjang-test",
        Arc::new(FixedAuthorizationClock),
    )
    .expect("HMAC verifier");
    let supervisor = runtime_with_authorization(
        RuntimeConfig { max_in_flight: 1 },
        settings,
        backend,
        Arc::new(verifier),
    )
    .expect("runtime");
    let mut first = bound_camera_request("signed-first", "signed-command", "signed-cancel");
    sign_request_receipt(&mut first, secret);
    let mut redelivery = first.clone();
    redelivery.id = Some("signed-redelivery".to_string());

    let first_response = supervisor.execute(first).await.expect("first response");
    let replayed = supervisor
        .execute(redelivery)
        .await
        .expect("verified replay response");

    assert_eq!(replayed.ok, first_response.ok);
    assert_eq!(replayed.id.as_deref(), Some("signed-redelivery"));
    assert_eq!(recording.camera_capture_calls.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn verified_hmac_replay_without_completed_record_remains_rejected() {
    let secret = b"replay-miss-test-secret";
    let recording = Arc::new(FakeBackend::default());
    let backend: Arc<dyn AutomationBackend> = recording.clone();
    let mut request =
        bound_camera_request("replay-miss", "replay-miss-command", "replay-miss-cancel");
    sign_request_receipt(&mut request, secret);
    let receipt = request
        .metadata
        .authorization_receipt
        .as_ref()
        .expect("receipt");
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
    let verifier = Arc::new(
        HmacAuthorizationVerifier::new(
            secret,
            "test-provider",
            "test-key-1",
            "yeonjang-test",
            Arc::new(FixedAuthorizationClock),
        )
        .expect("HMAC verifier"),
    );
    assert_eq!(
        verifier.verify(receipt, &context),
        AuthorizationDecision::Authorized
    );
    let supervisor = runtime_with_authorization(
        RuntimeConfig { max_in_flight: 1 },
        YeonjangSettings::default(),
        backend,
        verifier,
    )
    .expect("runtime");

    assert_eq!(
        supervisor.execute(request).await.expect_err("replay miss"),
        RuntimeSubmitError::AuthorizationRejected(AuthorizationRejection::Replayed)
    );
    assert_eq!(recording.camera_capture_calls.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn invalid_hmac_receipt_never_reaches_the_camera_backend() {
    let secret = b"invalid-proof-test-secret";
    let recording = Arc::new(FakeBackend::default());
    let backend: Arc<dyn AutomationBackend> = recording.clone();
    let mut settings = YeonjangSettings::default();
    settings.permissions.allow_camera_access = true;
    let mut request = bound_camera_request(
        "invalid-proof",
        "invalid-proof-command",
        "invalid-proof-cancel",
    );
    sign_request_receipt(&mut request, secret);
    request
        .metadata
        .authorization_receipt
        .as_mut()
        .expect("signed receipt")
        .proof = "0".repeat(64);
    let verifier = HmacAuthorizationVerifier::new(
        secret,
        "test-provider",
        "test-key-1",
        "yeonjang-test",
        Arc::new(FixedAuthorizationClock),
    )
    .expect("HMAC verifier");
    let supervisor = runtime_with_authorization(
        RuntimeConfig { max_in_flight: 1 },
        settings,
        backend,
        Arc::new(verifier),
    )
    .expect("runtime");

    assert_eq!(
        supervisor
            .execute(request)
            .await
            .expect_err("invalid proof"),
        RuntimeSubmitError::AuthorizationRejected(AuthorizationRejection::Invalid)
    );
    assert_eq!(recording.camera_capture_calls.load(Ordering::SeqCst), 0);
}

fn sign_request_receipt(request: &mut Request, secret: &[u8]) {
    let receipt = request
        .metadata
        .authorization_receipt
        .as_mut()
        .expect("test receipt");
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

#[tokio::test]
async fn managed_service_projects_execution_and_non_terminal_cancellation_receipts() {
    let backend: Arc<dyn AutomationBackend> = Arc::new(FakeBackend::default());
    let supervisor = RuntimeSupervisor::new(
        RuntimeConfig { max_in_flight: 1 },
        YeonjangSettings::default(),
        backend,
    )
    .expect("valid runtime");
    let service = ManagedRequestService::new(supervisor);

    let executed = service.handle(system_info_request("managed-read")).await;
    assert!(executed.ok);
    assert_eq!(executed.id.as_deref(), Some("managed-read"));

    let not_active = service
        .handle(Request {
            id: Some("managed-cancel".to_string()),
            method: "command.cancel".to_string(),
            params: json!({
                "command_id": "missing-command",
                "cancel_token": "missing-token"
            }),
            metadata: Default::default(),
        })
        .await;
    assert!(!not_active.ok);
    assert_eq!(not_active.id.as_deref(), Some("managed-cancel"));
    assert_eq!(
        not_active.error.as_ref().map(|error| error.code.as_str()),
        Some("command_cancellation_not_active")
    );

    let malformed = service
        .handle(Request {
            id: Some("managed-invalid-cancel".to_string()),
            method: "command.cancel".to_string(),
            params: json!({
                "command_id": "command",
                "cancel_token": "token",
                "unexpected": true
            }),
            metadata: Default::default(),
        })
        .await;
    assert_eq!(
        malformed.error.as_ref().map(|error| error.code.as_str()),
        Some("invalid_command_cancellation")
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn tokio_dispatcher_bounds_pending_tasks_and_preserves_response_identity() {
    let backend: Arc<dyn AutomationBackend> = Arc::new(FakeBackend::default());
    let supervisor = RuntimeSupervisor::new(
        RuntimeConfig { max_in_flight: 2 },
        YeonjangSettings::default(),
        backend,
    )
    .expect("valid runtime");
    assert!(matches!(
        TokioRequestDispatcher::new(
            DispatchConfig { max_pending: 0 },
            tokio::runtime::Handle::current(),
            ManagedRequestService::new(supervisor.clone()),
        ),
        Err(DispatchBuildError::InvalidMaxPending)
    ));
    let dispatcher = TokioRequestDispatcher::new(
        DispatchConfig { max_pending: 1 },
        tokio::runtime::Handle::current(),
        ManagedRequestService::new(supervisor),
    )
    .expect("valid dispatcher");

    let first = dispatcher
        .try_dispatch(system_info_request("dispatch-first"))
        .expect("first task admitted");
    assert!(matches!(
        dispatcher.try_dispatch(system_info_request("dispatch-overflow")),
        Err(DispatchError::Backpressure)
    ));

    let first_response = first.await.expect("first task completion");
    assert_eq!(first_response.id.as_deref(), Some("dispatch-first"));
    assert!(first_response.ok);

    let next_response = dispatcher
        .try_dispatch(system_info_request("dispatch-next"))
        .expect("permit returned after completion")
        .await
        .expect("next task completion");
    assert_eq!(next_response.id.as_deref(), Some("dispatch-next"));
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn dispatcher_owns_the_permit_until_response_delivery_finishes_once() {
    let backend: Arc<dyn AutomationBackend> = Arc::new(FakeBackend::default());
    let supervisor = RuntimeSupervisor::new(
        RuntimeConfig { max_in_flight: 1 },
        YeonjangSettings::default(),
        backend,
    )
    .expect("valid runtime");
    let dispatcher = TokioRequestDispatcher::new(
        DispatchConfig { max_pending: 1 },
        tokio::runtime::Handle::current(),
        ManagedRequestService::new(supervisor),
    )
    .expect("valid dispatcher");
    let started = Arc::new(Barrier::new(2));
    let release = Arc::new(Barrier::new(2));
    let delivery = Arc::new(BlockingResponseDelivery {
        started: started.clone(),
        release: release.clone(),
        response_ids: Mutex::new(Vec::new()),
    });

    let completion = dispatcher
        .try_dispatch_and_deliver(system_info_request("delivered-once"), delivery.clone())
        .expect("delivery task admitted");
    tokio::task::spawn_blocking(move || started.wait())
        .await
        .expect("delivery started");
    assert!(matches!(
        dispatcher.try_dispatch(system_info_request("blocked-until-delivered")),
        Err(DispatchError::Backpressure)
    ));
    tokio::task::spawn_blocking(move || release.wait())
        .await
        .expect("delivery released");
    let completion = completion.await.expect("delivery task join");

    assert_eq!(completion, DispatchCompletion::Delivered);
    assert_eq!(
        delivery
            .response_ids
            .lock()
            .expect("recorded IDs")
            .as_slice(),
        &[Some("delivered-once".to_string())]
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn dispatcher_keeps_execution_success_distinct_from_delivery_failure() {
    let backend: Arc<dyn AutomationBackend> = Arc::new(FakeBackend::default());
    let supervisor = RuntimeSupervisor::new(
        RuntimeConfig { max_in_flight: 1 },
        YeonjangSettings::default(),
        backend,
    )
    .expect("valid runtime");
    let dispatcher = TokioRequestDispatcher::new(
        DispatchConfig { max_pending: 1 },
        tokio::runtime::Handle::current(),
        ManagedRequestService::new(supervisor),
    )
    .expect("valid dispatcher");
    let delivery = Arc::new(FailingResponseDelivery::default());

    let completion = dispatcher
        .try_dispatch_and_deliver(system_info_request("delivery-failure"), delivery.clone())
        .expect("request admitted")
        .await
        .expect("dispatcher task");

    assert_eq!(
        completion,
        DispatchCompletion::DeliveryFailed(DeliveryError::Unavailable)
    );
    assert_eq!(delivery.observed_success.load(Ordering::SeqCst), 1);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn dispatcher_shutdown_rejects_all_clones_and_drains_delivery() {
    let backend: Arc<dyn AutomationBackend> = Arc::new(FakeBackend::default());
    let supervisor = RuntimeSupervisor::new(
        RuntimeConfig { max_in_flight: 1 },
        YeonjangSettings::default(),
        backend,
    )
    .expect("valid runtime");
    let dispatcher = TokioRequestDispatcher::new(
        DispatchConfig { max_pending: 1 },
        tokio::runtime::Handle::current(),
        ManagedRequestService::new(supervisor),
    )
    .expect("valid dispatcher");
    let dispatcher_clone = dispatcher.clone();
    let started = Arc::new(Barrier::new(2));
    let release = Arc::new(Barrier::new(2));
    let delivery = Arc::new(BlockingResponseDelivery {
        started: started.clone(),
        release: release.clone(),
        response_ids: Mutex::new(Vec::new()),
    });
    let completion = dispatcher
        .try_dispatch_and_deliver(system_info_request("shutdown-delivery"), delivery)
        .expect("delivery admitted");
    tokio::task::spawn_blocking(move || started.wait())
        .await
        .expect("delivery started");

    let shutdown = tokio::spawn(async move {
        dispatcher_clone.shutdown().await;
    });
    loop {
        match dispatcher.try_dispatch(system_info_request("shutdown-rejected")) {
            Err(DispatchError::ShuttingDown) => break,
            Err(DispatchError::Backpressure) => tokio::task::yield_now().await,
            Ok(_) => panic!("dispatcher admitted work after shutdown started"),
        }
    }
    assert!(
        !shutdown.is_finished(),
        "shutdown must drain response delivery"
    );

    tokio::task::spawn_blocking(move || release.wait())
        .await
        .expect("delivery released");
    assert_eq!(
        completion.await.expect("delivery completion"),
        DispatchCompletion::Delivered
    );
    shutdown.await.expect("dispatcher shutdown");
    assert!(matches!(
        dispatcher.try_dispatch(system_info_request("shutdown-clone-rejected")),
        Err(DispatchError::ShuttingDown)
    ));
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn controlled_test_provider_correlates_ten_out_of_order_terminal_responses_once() {
    let recording = Arc::new(FakeBackend::default());
    let backend: Arc<dyn AutomationBackend> = recording.clone();
    let supervisor = RuntimeSupervisor::new(
        RuntimeConfig { max_in_flight: 10 },
        YeonjangSettings::default(),
        backend,
    )
    .expect("valid runtime");
    let dispatcher = TokioRequestDispatcher::new(
        DispatchConfig { max_pending: 10 },
        tokio::runtime::Handle::current(),
        ManagedRequestService::new(supervisor),
    )
    .expect("valid dispatcher");
    let request_ids = (1..=10)
        .map(|index| format!("provider-{index:02}"))
        .collect::<Vec<_>>();
    let provider = ControlledTestProvider::new_with_terminal_order(
        dispatcher,
        request_ids.iter().rev().cloned().collect(),
    )
    .expect("bounded terminal delivery order");

    let mut completions = Vec::new();
    for request_id in &request_ids {
        let payload = canonical_system_info_payload(request_id);
        completions.push(provider.submit(&payload).expect("provider admission"));
    }
    for completion in completions {
        assert_eq!(
            completion.await.expect("provider task"),
            DispatchCompletion::Delivered
        );
    }

    let response_ids = provider
        .responses()
        .into_iter()
        .map(|response| response.id.expect("response correlation ID"))
        .collect::<Vec<_>>();
    assert_eq!(
        response_ids,
        request_ids.iter().rev().cloned().collect::<Vec<_>>()
    );
    provider
        .exact_terminals(&request_ids)
        .expect("one terminal per accepted request");
    assert_eq!(recording.max_active_system_info.load(Ordering::SeqCst), 10);
}

fn canonical_system_info_payload(id: &str) -> Vec<u8> {
    ReadOnlyProtocolFixture::system_info(id).payload
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn controlled_provider_bounds_recovers_and_rejects_after_shutdown() {
    let recording = Arc::new(FakeBackend::default());
    let backend: Arc<dyn AutomationBackend> = recording.clone();
    let supervisor = RuntimeSupervisor::new(
        RuntimeConfig { max_in_flight: 1 },
        YeonjangSettings::default(),
        backend,
    )
    .expect("valid runtime");
    let dispatcher = TokioRequestDispatcher::new(
        DispatchConfig { max_pending: 1 },
        tokio::runtime::Handle::current(),
        ManagedRequestService::new(supervisor),
    )
    .expect("valid dispatcher");
    let provider = ControlledTestProvider::new(dispatcher);

    let first = provider
        .submit(&canonical_system_info_payload("provider-first"))
        .expect("first request");
    assert_eq!(
        provider
            .submit(&canonical_system_info_payload("provider-overflow"))
            .expect_err("capacity overflow"),
        TestProviderError::DispatchRejected(DispatchError::Backpressure)
    );
    assert_eq!(
        first.await.expect("first completion"),
        DispatchCompletion::Delivered
    );
    assert_eq!(
        provider
            .submit(&canonical_system_info_payload("provider-recovered"))
            .expect("permit recovered")
            .await
            .expect("recovered completion"),
        DispatchCompletion::Delivered
    );

    provider.shutdown().await;
    assert_eq!(
        provider
            .submit(&canonical_system_info_payload("provider-after-shutdown"))
            .expect_err("shutdown rejection"),
        TestProviderError::DispatchRejected(DispatchError::ShuttingDown)
    );
    assert_eq!(recording.max_active_system_info.load(Ordering::SeqCst), 1);
    assert_eq!(provider.responses().len(), 2);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn controlled_provider_separates_cancel_ack_from_camera_terminal_response() {
    let cancel_release = Arc::new(Barrier::new(2));
    let recording = Arc::new(FakeBackend {
        wait_for_camera_cancellation: true,
        camera_cancel_release: Some(cancel_release.clone()),
        ..Default::default()
    });
    let backend: Arc<dyn AutomationBackend> = recording.clone();
    let mut settings = YeonjangSettings::default();
    settings.permissions.allow_camera_access = true;
    let supervisor = runtime_with_authorization(
        RuntimeConfig { max_in_flight: 2 },
        settings,
        backend,
        Arc::new(AllowTestAuthorizationVerifier),
    )
    .expect("valid runtime");
    let dispatcher = TokioRequestDispatcher::new(
        DispatchConfig { max_pending: 2 },
        tokio::runtime::Handle::current(),
        ManagedRequestService::new(supervisor),
    )
    .expect("valid dispatcher");
    let provider = ControlledTestProvider::new(dispatcher);

    let camera_payload = serde_json::to_vec(&json!({
        "protocolVersion": 1,
        "id": "provider-camera",
        "method": "camera.capture",
        "params": {},
        "metadata": {
            "commandId": "provider-camera-command",
            "operationId": "provider-camera-operation",
            "targetSessionId": "provider-camera-session",
            "targetFingerprint": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "idempotencyKey": "provider-camera-idempotency",
            "expiresAt": 4_000_000_000_000_i64,
            "cancelToken": "provider-camera-cancel",
            "authorizationReceipt": {
                "schemaVersion": 1,
                "authorizationId": "provider-camera-authorization",
                "issuer": "test-provider",
                "issuerKeyId": "test-key-1",
                "audience": "yeonjang-test",
                "method": "camera.capture",
                "resourceScope": "camera",
                "commandId": "provider-camera-command",
                "operationId": "provider-camera-operation",
                "targetSessionId": "provider-camera-session",
                "targetFingerprint": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                "idempotencyKey": "provider-camera-idempotency",
                "expiresAt": 4_000_000_000_000_i64,
                "proof": "test-proof"
            }
        }
    }))
    .expect("camera payload");
    let camera_target = Request {
        id: Some("provider-camera".to_string()),
        method: "camera.capture".to_string(),
        params: json!({}),
        metadata: knowbee_yeonjang::protocol::RequestMetadata {
            command_id: Some("provider-camera-command".to_string()),
            operation_id: Some("provider-camera-operation".to_string()),
            target_session_id: Some("provider-camera-session".to_string()),
            target_fingerprint: Some(
                "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                    .to_string(),
            ),
            idempotency_key: Some("provider-camera-idempotency".to_string()),
            ..Default::default()
        },
    };
    let camera = provider.submit(&camera_payload).expect("camera admitted");
    while recording.active_camera_capture.load(Ordering::SeqCst) == 0 {
        tokio::task::yield_now().await;
    }

    let fast = provider
        .submit(&canonical_system_info_payload("provider-fast-system-info"))
        .expect("independent read-only request admitted");
    assert_eq!(
        fast.await.expect("fast request completion"),
        DispatchCompletion::Delivered
    );
    assert!(
        provider
            .response_by_id("provider-fast-system-info")
            .is_some()
    );
    assert_eq!(
        recording.active_camera_capture.load(Ordering::SeqCst),
        1,
        "slow camera must still be active after the independent terminal response"
    );

    let wrong_cancel = provider
        .submit(&canonical_cancel_payload(
            "provider-wrong-cancel",
            "provider-camera-command",
            "wrong-token",
        ))
        .expect("wrong cancel admitted");
    assert_eq!(
        wrong_cancel.await.expect("wrong cancel completion"),
        DispatchCompletion::Delivered
    );
    assert_eq!(
        provider
            .response_by_id("provider-wrong-cancel")
            .and_then(|response| response.error)
            .map(|error| error.code),
        Some("command_cancellation_not_active".to_string())
    );
    assert_eq!(recording.active_camera_capture.load(Ordering::SeqCst), 1);

    let cancel_payload = canonical_cancel_payload(
        "provider-cancel",
        "provider-camera-command",
        "provider-camera-cancel",
    );
    let cancel = provider.submit(&cancel_payload).expect("cancel admitted");
    assert_eq!(
        cancel.await.expect("cancel completion"),
        DispatchCompletion::Delivered
    );
    let duplicate = provider
        .submit(&canonical_cancel_payload(
            "provider-duplicate-cancel",
            "provider-camera-command",
            "provider-camera-cancel",
        ))
        .expect("duplicate cancel admitted");
    assert_eq!(
        duplicate.await.expect("duplicate completion"),
        DispatchCompletion::Delivered
    );
    let duplicate_response = provider
        .response_by_id("provider-duplicate-cancel")
        .expect("duplicate response");
    assert!(duplicate_response.ok);
    assert_eq!(
        duplicate_response
            .result
            .as_ref()
            .and_then(|result| result["duplicate"].as_bool()),
        Some(true)
    );
    assert_eq!(
        duplicate_response
            .result
            .as_ref()
            .and_then(|result| result["terminal"].as_bool()),
        Some(false)
    );
    tokio::task::spawn_blocking(move || cancel_release.wait())
        .await
        .expect("camera release");
    let camera_completion = camera.await.expect("camera completion");
    assert_eq!(
        camera_completion,
        DispatchCompletion::Delivered,
        "{:?}",
        provider.terminal_result("provider-camera")
    );

    let cancel_response = provider
        .response_by_id("provider-cancel")
        .expect("cancel response");
    assert!(cancel_response.ok);
    assert_eq!(
        cancel_response
            .result
            .as_ref()
            .and_then(|result| result["terminal"].as_bool()),
        Some(false)
    );
    let camera_response = provider
        .response_by_id("provider-camera")
        .expect("camera terminal response");
    assert!(!camera_response.ok);
    assert_eq!(
        camera_response
            .error
            .as_ref()
            .map(|error| error.code.as_str()),
        Some("camera_capture_cancelled")
    );
    assert_eq!(
        camera_response
            .attempt
            .as_ref()
            .and_then(|attempt| attempt.cancellation_reason),
        Some(CommandAttemptCancellationReason::UserRequested)
    );
    let late = provider
        .submit(&canonical_exact_cancel_payload(
            "provider-late-cancel",
            &camera_target,
            "provider-camera-cancel",
        ))
        .expect("late cancel admitted");
    assert_eq!(
        late.await.expect("late completion"),
        DispatchCompletion::Delivered
    );
    assert_eq!(
        provider
            .response_by_id("provider-late-cancel")
            .and_then(|response| response.error)
            .map(|error| error.code),
        Some("command_already_terminal".to_string())
    );
    provider
        .exact_terminals(&[
            "provider-camera".to_string(),
            "provider-fast-system-info".to_string(),
            "provider-wrong-cancel".to_string(),
            "provider-cancel".to_string(),
            "provider-duplicate-cancel".to_string(),
            "provider-late-cancel".to_string(),
        ])
        .expect("all request and control terminals remain correlated");
}

#[tokio::test]
async fn controlled_provider_signed_redelivery_executes_camera_once() {
    let secret = b"provider-redelivery-secret";
    let recording = Arc::new(FakeBackend::default());
    let backend: Arc<dyn AutomationBackend> = recording.clone();
    let mut settings = YeonjangSettings::default();
    settings.permissions.allow_camera_access = true;
    let verifier = HmacAuthorizationVerifier::new(
        secret,
        "test-provider",
        "test-key-1",
        "yeonjang-test",
        Arc::new(FixedAuthorizationClock),
    )
    .expect("HMAC verifier");
    let supervisor = runtime_with_authorization(
        RuntimeConfig { max_in_flight: 1 },
        settings,
        backend,
        Arc::new(verifier),
    )
    .expect("runtime");
    let dispatcher = TokioRequestDispatcher::new(
        DispatchConfig { max_pending: 1 },
        tokio::runtime::Handle::current(),
        ManagedRequestService::new(supervisor),
    )
    .expect("dispatcher");
    let provider = ControlledTestProvider::new(dispatcher);

    for delivery_id in ["provider-signed-first", "provider-signed-redelivery"] {
        let completion = provider
            .submit(&canonical_signed_camera_payload(delivery_id, secret))
            .expect("signed delivery")
            .await
            .expect("delivery completion");
        assert_eq!(
            completion,
            DispatchCompletion::Delivered,
            "{:?}",
            provider.terminal_result(delivery_id)
        );
    }

    assert_eq!(provider.responses().len(), 2);
    assert!(provider.response_by_id("provider-signed-first").is_some());
    assert!(
        provider
            .response_by_id("provider-signed-redelivery")
            .is_some()
    );
    assert_eq!(recording.camera_capture_calls.load(Ordering::SeqCst), 1);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn controlled_provider_serializes_the_same_camera_resource() {
    let secret = b"provider-resource-secret";
    let recording = Arc::new(FakeBackend {
        camera_capture_delay: Some(Duration::from_millis(40)),
        ..Default::default()
    });
    let backend: Arc<dyn AutomationBackend> = recording.clone();
    let mut settings = YeonjangSettings::default();
    settings.permissions.allow_camera_access = true;
    let verifier = HmacAuthorizationVerifier::new(
        secret,
        "test-provider",
        "test-key-1",
        "yeonjang-test",
        Arc::new(FixedAuthorizationClock),
    )
    .expect("HMAC verifier");
    let supervisor = runtime_with_authorization(
        RuntimeConfig { max_in_flight: 2 },
        settings,
        backend,
        Arc::new(verifier),
    )
    .expect("runtime");
    let dispatcher = TokioRequestDispatcher::new(
        DispatchConfig { max_pending: 2 },
        tokio::runtime::Handle::current(),
        ManagedRequestService::new(supervisor),
    )
    .expect("dispatcher");
    let provider = ControlledTestProvider::new(dispatcher);
    let request_ids = vec![
        "provider-camera-resource-1".to_string(),
        "provider-camera-resource-2".to_string(),
    ];

    let first = provider
        .submit(&canonical_signed_camera_payload_for(
            &request_ids[0],
            "provider-camera-resource-command-1",
            "provider-camera-resource-cancel-1",
            secret,
        ))
        .expect("first camera admitted");
    let second = provider
        .submit(&canonical_signed_camera_payload_for(
            &request_ids[1],
            "provider-camera-resource-command-2",
            "provider-camera-resource-cancel-2",
            secret,
        ))
        .expect("second camera admitted");
    assert_eq!(
        first.await.expect("first camera"),
        DispatchCompletion::Delivered
    );
    assert_eq!(
        second.await.expect("second camera"),
        DispatchCompletion::Delivered
    );
    provider
        .exact_terminals(&request_ids)
        .expect("camera terminals");
    let responses = request_ids
        .iter()
        .map(|request_id| {
            provider
                .response_by_id(request_id)
                .expect("camera terminal")
        })
        .collect::<Vec<_>>();
    assert!(responses.iter().all(|response| response.ok));
    assert_eq!(recording.camera_capture_calls.load(Ordering::SeqCst), 2);
    assert_eq!(
        recording.max_active_camera_capture.load(Ordering::SeqCst),
        1,
        "same camera resource must not overlap in the backend"
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn controlled_provider_cancels_a_same_camera_waiter_before_backend_entry() {
    let recording = Arc::new(FakeBackend {
        camera_capture_delay: Some(Duration::from_millis(100)),
        ..Default::default()
    });
    let backend: Arc<dyn AutomationBackend> = recording.clone();
    let mut settings = YeonjangSettings::default();
    settings.permissions.allow_camera_access = true;
    let supervisor = runtime_with_authorization(
        RuntimeConfig { max_in_flight: 2 },
        settings,
        backend,
        Arc::new(AllowTestAuthorizationVerifier),
    )
    .expect("runtime");
    let dispatcher = TokioRequestDispatcher::new(
        DispatchConfig { max_pending: 3 },
        tokio::runtime::Handle::current(),
        ManagedRequestService::new(supervisor),
    )
    .expect("dispatcher");
    let provider = ControlledTestProvider::new(dispatcher);
    let running_request = bound_camera_request(
        "provider-wait-running",
        "provider-wait-running-command",
        "provider-wait-running-cancel",
    );
    let waiting_request = bound_camera_request(
        "provider-wait-cancelled",
        "provider-wait-cancelled-command",
        "provider-wait-cancelled-token",
    );

    let first = provider
        .submit(&canonical_bound_side_effect_payload(&running_request))
        .expect("running camera admitted");
    while recording.active_camera_capture.load(Ordering::SeqCst) == 0 {
        tokio::task::yield_now().await;
    }
    let waiting = provider
        .submit(&canonical_bound_side_effect_payload(&waiting_request))
        .expect("waiting camera admitted");
    tokio::time::sleep(Duration::from_millis(10)).await;
    let cancellation = provider
        .submit(&canonical_cancel_payload(
            "provider-wait-cancel-control",
            "provider-wait-cancelled-command",
            "provider-wait-cancelled-token",
        ))
        .expect("waiting cancellation admitted");

    assert_eq!(
        cancellation.await.expect("cancellation completion"),
        DispatchCompletion::Delivered
    );
    let control = provider
        .response_by_id("provider-wait-cancel-control")
        .expect("cancellation control response");
    assert!(control.ok);
    assert_eq!(
        control
            .result
            .as_ref()
            .and_then(|result| result["accepted"].as_bool()),
        Some(true)
    );
    assert_eq!(
        control
            .result
            .as_ref()
            .and_then(|result| result["terminal"].as_bool()),
        Some(false)
    );
    assert_eq!(
        first.await.expect("running completion"),
        DispatchCompletion::Delivered
    );
    assert_eq!(
        waiting.await.expect("waiting completion"),
        DispatchCompletion::Delivered
    );
    let waiting_terminal = provider
        .response_by_id("provider-wait-cancelled")
        .expect("waiting terminal");
    assert!(!waiting_terminal.ok);
    assert_eq!(
        waiting_terminal
            .error
            .as_ref()
            .map(|error| error.code.as_str()),
        Some("command_cancelled_before_execution")
    );
    assert_eq!(
        waiting_terminal
            .attempt
            .as_ref()
            .and_then(|attempt| attempt.cancellation_reason),
        Some(CommandAttemptCancellationReason::UserRequested)
    );
    assert_eq!(recording.camera_capture_calls.load(Ordering::SeqCst), 1);

    let retry_request = bound_camera_request(
        "provider-wait-retry",
        "provider-wait-cancelled-command",
        "provider-wait-cancelled-token",
    );
    let retry = provider
        .submit(&canonical_bound_side_effect_payload(&retry_request))
        .expect("cancelled command retry admitted after cleanup");
    assert_eq!(
        retry.await.expect("retry completion"),
        DispatchCompletion::Delivered
    );
    assert!(
        provider
            .response_by_id("provider-wait-retry")
            .is_some_and(|response| response.ok)
    );
    assert_eq!(recording.camera_capture_calls.load(Ordering::SeqCst), 2);
    provider
        .exact_terminals(&[
            "provider-wait-running".to_string(),
            "provider-wait-cancelled".to_string(),
            "provider-wait-cancel-control".to_string(),
            "provider-wait-retry".to_string(),
        ])
        .expect("running, waiting and control terminals");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn controlled_provider_preserves_success_when_cancellation_is_too_late() {
    let release = Arc::new(Barrier::new(2));
    let recording = Arc::new(FakeBackend {
        camera_capture_delay: Some(Duration::ZERO),
        camera_success_release: Some(Arc::clone(&release)),
        ..Default::default()
    });
    let backend: Arc<dyn AutomationBackend> = recording.clone();
    let mut settings = YeonjangSettings::default();
    settings.permissions.allow_camera_access = true;
    let supervisor = runtime_with_authorization(
        RuntimeConfig { max_in_flight: 2 },
        settings,
        backend,
        Arc::new(AllowTestAuthorizationVerifier),
    )
    .expect("runtime");
    let dispatcher = TokioRequestDispatcher::new(
        DispatchConfig { max_pending: 2 },
        tokio::runtime::Handle::current(),
        ManagedRequestService::new(supervisor),
    )
    .expect("dispatcher");
    let provider = ControlledTestProvider::new(dispatcher);
    let camera_request = bound_camera_request(
        "provider-race-camera",
        "provider-race-command",
        "provider-race-cancel",
    );
    let camera = provider
        .submit(&canonical_bound_side_effect_payload(&camera_request))
        .expect("camera admitted");
    while recording.active_camera_capture.load(Ordering::SeqCst) == 0 {
        tokio::task::yield_now().await;
    }

    let cancellation = provider
        .submit(&canonical_cancel_payload(
            "provider-race-cancel-control",
            "provider-race-command",
            "provider-race-cancel",
        ))
        .expect("race cancellation admitted");
    assert_eq!(
        cancellation.await.expect("cancel control"),
        DispatchCompletion::Delivered
    );
    let control = provider
        .response_by_id("provider-race-cancel-control")
        .expect("cancel control response");
    assert!(control.ok);
    assert_eq!(
        control
            .result
            .as_ref()
            .and_then(|result| result["terminal"].as_bool()),
        Some(false)
    );
    tokio::task::spawn_blocking(move || release.wait())
        .await
        .expect("successful effect release");
    assert_eq!(
        camera.await.expect("camera completion"),
        DispatchCompletion::Delivered
    );
    assert!(
        provider
            .response_by_id("provider-race-camera")
            .is_some_and(|response| response.ok)
    );

    let late = provider
        .submit(&canonical_exact_cancel_payload(
            "provider-race-late-control",
            &camera_request,
            "provider-race-cancel",
        ))
        .expect("late cancellation admitted");
    assert_eq!(
        late.await.expect("late control"),
        DispatchCompletion::Delivered
    );
    assert_eq!(
        provider
            .response_by_id("provider-race-late-control")
            .and_then(|response| response.error)
            .map(|error| error.code),
        Some("command_already_terminal".to_string())
    );
    assert_eq!(recording.camera_capture_calls.load(Ordering::SeqCst), 1);
    provider
        .exact_terminals(&[
            "provider-race-camera".to_string(),
            "provider-race-cancel-control".to_string(),
            "provider-race-late-control".to_string(),
        ])
        .expect("race terminal set");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn controlled_provider_requires_the_complete_exact_cancellation_binding() {
    let release = Arc::new(Barrier::new(2));
    let recording = Arc::new(FakeBackend {
        wait_for_camera_cancellation: true,
        camera_cancel_release: Some(Arc::clone(&release)),
        ..Default::default()
    });
    let backend: Arc<dyn AutomationBackend> = recording.clone();
    let mut settings = YeonjangSettings::default();
    settings.permissions.allow_camera_access = true;
    let supervisor = runtime_with_authorization(
        RuntimeConfig { max_in_flight: 2 },
        settings,
        backend,
        Arc::new(AllowTestAuthorizationVerifier),
    )
    .expect("runtime");
    let dispatcher = TokioRequestDispatcher::new(
        DispatchConfig { max_pending: 3 },
        tokio::runtime::Handle::current(),
        ManagedRequestService::new(supervisor),
    )
    .expect("dispatcher");
    let provider = ControlledTestProvider::new(dispatcher);
    let camera_request = bound_camera_request(
        "provider-exact-camera",
        "provider-exact-command",
        "provider-exact-cancel",
    );
    let camera = provider
        .submit(&canonical_bound_side_effect_payload(&camera_request))
        .expect("camera admitted");
    while recording.active_camera_capture.load(Ordering::SeqCst) == 0 {
        tokio::task::yield_now().await;
    }

    let mut wrong_binding = camera_request.clone();
    wrong_binding.metadata.operation_id = Some("wrong-operation".to_string());
    let wrong = provider
        .submit(&canonical_exact_cancel_payload(
            "provider-exact-wrong",
            &wrong_binding,
            "provider-exact-cancel",
        ))
        .expect("wrong exact cancellation admitted to parser");
    assert_eq!(
        wrong.await.expect("wrong cancellation completion"),
        DispatchCompletion::Delivered
    );
    let wrong_code = provider
        .response_by_id("provider-exact-wrong")
        .and_then(|response| response.error)
        .map(|error| error.code);
    assert_eq!(recording.active_camera_capture.load(Ordering::SeqCst), 1);

    let exact = provider
        .submit(&canonical_exact_cancel_payload(
            "provider-exact-control",
            &camera_request,
            "provider-exact-cancel",
        ))
        .expect("exact cancellation admitted");
    assert_eq!(
        exact.await.expect("exact cancellation completion"),
        DispatchCompletion::Delivered
    );
    let exact_ok = provider
        .response_by_id("provider-exact-control")
        .is_some_and(|response| response.ok);
    if !exact_ok {
        let cleanup = provider
            .submit(&canonical_cancel_payload(
                "provider-exact-cleanup",
                "provider-exact-command",
                "provider-exact-cancel",
            ))
            .expect("legacy cleanup cancellation admitted");
        assert_eq!(
            cleanup.await.expect("cleanup cancellation"),
            DispatchCompletion::Delivered
        );
    }
    tokio::task::spawn_blocking(move || release.wait())
        .await
        .expect("camera cancellation release");
    assert_eq!(
        camera.await.expect("camera completion"),
        DispatchCompletion::Delivered
    );
    assert_eq!(recording.camera_capture_calls.load(Ordering::SeqCst), 1);
    assert_eq!(
        wrong_code,
        Some("cancellation_binding_mismatch".to_string())
    );
    assert!(exact_ok);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn controlled_provider_runs_camera_and_screen_resources_in_parallel() {
    let start = Arc::new(Barrier::new(2));
    let recording = Arc::new(FakeBackend {
        camera_capture_delay: Some(Duration::from_millis(1)),
        screen_capture_delay: Some(Duration::from_millis(1)),
        side_effect_start_barrier: Some(start),
        ..Default::default()
    });
    let backend: Arc<dyn AutomationBackend> = recording.clone();
    let mut settings = YeonjangSettings::default();
    settings.permissions.allow_camera_access = true;
    settings.permissions.allow_screen_capture = true;
    let supervisor = runtime_with_authorization(
        RuntimeConfig { max_in_flight: 2 },
        settings,
        backend,
        Arc::new(AllowTestAuthorizationVerifier),
    )
    .expect("runtime");
    let dispatcher = TokioRequestDispatcher::new(
        DispatchConfig { max_pending: 2 },
        tokio::runtime::Handle::current(),
        ManagedRequestService::new(supervisor),
    )
    .expect("dispatcher");
    let provider = ControlledTestProvider::new(dispatcher);
    let camera = bound_camera_request(
        "provider-parallel-camera",
        "provider-parallel-camera-command",
        "provider-parallel-camera-cancel",
    );
    let screen = bound_screen_request(
        "provider-parallel-screen",
        "provider-parallel-screen-command",
        "provider-parallel-screen-cancel",
    );

    let camera_completion = provider
        .submit(&canonical_bound_side_effect_payload(&camera))
        .expect("camera admitted");
    let screen_completion = provider
        .submit(&canonical_bound_side_effect_payload(&screen))
        .expect("screen admitted");
    assert_eq!(
        camera_completion.await.expect("camera completion"),
        DispatchCompletion::Delivered
    );
    assert_eq!(
        screen_completion.await.expect("screen completion"),
        DispatchCompletion::Delivered
    );
    provider
        .exact_terminals(&[
            "provider-parallel-camera".to_string(),
            "provider-parallel-screen".to_string(),
        ])
        .expect("different resource terminals");
    assert_eq!(
        recording.max_active_side_effects.load(Ordering::SeqCst),
        2,
        "different resources must enter their backends in parallel"
    );
}

#[tokio::test]
async fn typed_composition_owns_runtime_dispatch_and_shutdown_lease() {
    let _host_test_lock = RUNTIME_HOST_TEST_LOCK.lock().await;
    let backend: Arc<dyn AutomationBackend> = Arc::new(FakeBackend::default());
    let host_config = RuntimeHostConfig {
        worker_threads: 2,
        max_blocking_threads: 8,
    };
    let invalid = build_managed_runtime(
        ManagedRuntimeConfig {
            host: host_config,
            runtime: RuntimeConfig { max_in_flight: 2 },
            dispatch: DispatchConfig { max_pending: 0 },
            completed_capacity: 16,
        },
        managed_dependencies(backend.clone()),
    )
    .expect_err("invalid dispatcher config");
    assert!(matches!(invalid, ManagedRuntimeBuildError::Dispatcher(_)));

    let runtime = build_managed_runtime(
        ManagedRuntimeConfig {
            host: host_config,
            runtime: RuntimeConfig { max_in_flight: 2 },
            dispatch: DispatchConfig { max_pending: 2 },
            completed_capacity: 16,
        },
        managed_dependencies(backend),
    )
    .expect("managed runtime");
    let dispatcher = runtime.dispatcher();
    let provider = ControlledTestProvider::new(dispatcher.clone());
    assert_eq!(
        provider
            .submit(&canonical_system_info_payload("composition-request"))
            .expect("composition dispatch")
            .await
            .expect("composition completion"),
        DispatchCompletion::Delivered
    );
    assert!(
        provider
            .response_by_id("composition-request")
            .expect("composition response")
            .ok
    );

    runtime.shutdown().await;
    assert!(matches!(
        dispatcher.try_dispatch(system_info_request("composition-after-shutdown")),
        Err(DispatchError::ShuttingDown)
    ));
    drop(TokioRuntimeHost::acquire(host_config).expect("host lease returned"));
}

#[tokio::test]
async fn shared_gui_handle_builds_no_hidden_runtime_and_drains_its_dispatcher() {
    let _host_test_lock = RUNTIME_HOST_TEST_LOCK.lock().await;
    let backend: Arc<dyn AutomationBackend> = Arc::new(FakeBackend::default());
    let runtime = build_managed_runtime_on_handle(
        ManagedRuntimeWorkConfig {
            runtime: RuntimeConfig { max_in_flight: 2 },
            dispatch: DispatchConfig { max_pending: 2 },
            completed_capacity: 16,
        },
        managed_dependencies(backend),
        tokio::runtime::Handle::current(),
    )
    .expect("shared handle managed runtime");
    let dispatcher = runtime.dispatcher();
    let provider = ControlledTestProvider::new(dispatcher.clone());

    let independent_host = TokioRuntimeHost::acquire(RuntimeHostConfig {
        worker_threads: 1,
        max_blocking_threads: 2,
    })
    .expect("shared composition did not acquire the process host lease");
    drop(independent_host);

    assert_eq!(
        provider
            .submit(&canonical_system_info_payload("shared-gui-composition"))
            .expect("shared composition dispatch")
            .await
            .expect("shared composition completion"),
        DispatchCompletion::Delivered
    );
    runtime.shutdown().await;
    assert!(matches!(
        dispatcher.try_dispatch(system_info_request("shared-gui-after-shutdown")),
        Err(DispatchError::ShuttingDown)
    ));
}

#[tokio::test]
async fn same_instance_managed_composition_is_exclusive_and_shutdown_returns_its_lease() {
    let lease_root =
        std::env::temp_dir().join(format!("knowbee-instance-lease-{}", std::process::id()));
    fs::create_dir_all(&lease_root).expect("lease root");
    let lease_provider =
        FilesystemRuntimeLeaseProvider::new(lease_root.clone()).expect("lease provider");
    let settings = YeonjangSettings {
        instance_id: "shared-instance".to_string(),
        ..Default::default()
    };
    let dependencies = |backend: Arc<dyn AutomationBackend>, runtime_lease| {
        ManagedRuntimeDependencies::new(
            settings.clone(),
            backend,
            AuthorizationBootstrapInput::new(
                "test-provider",
                "test-key-1",
                "test-audience",
                b"composition-test-secret".to_vec(),
                16,
            )
            .expect("authorization input"),
            Arc::new(FixedAuthorizationClock),
            runtime_lease,
        )
    };
    let config = ManagedRuntimeWorkConfig {
        runtime: RuntimeConfig { max_in_flight: 1 },
        dispatch: DispatchConfig { max_pending: 1 },
        completed_capacity: 4,
    };
    let first = build_managed_runtime_on_handle(
        config,
        dependencies(
            Arc::new(FakeBackend::default()),
            lease_provider.acquire().expect("first runtime lease"),
        ),
        tokio::runtime::Handle::current(),
    )
    .expect("first instance owner");

    assert!(lease_provider.acquire().is_err(), "second runtime lease");

    first.shutdown().await;
    let restarted = build_managed_runtime_on_handle(
        config,
        dependencies(
            Arc::new(FakeBackend::default()),
            lease_provider.acquire().expect("restarted runtime lease"),
        ),
        tokio::runtime::Handle::current(),
    )
    .expect("shutdown returned instance lease");
    restarted.shutdown().await;
    fs::remove_dir_all(lease_root).expect("remove lease root");
}

#[tokio::test]
async fn managed_mqtt_start_failure_rolls_back_the_composition_host() {
    let _host_test_lock = RUNTIME_HOST_TEST_LOCK.lock().await;
    let host_config = RuntimeHostConfig {
        worker_threads: 2,
        max_blocking_threads: 8,
    };
    let backend: Arc<dyn AutomationBackend> = Arc::new(FakeBackend::default());
    let runtime = build_managed_runtime(
        ManagedRuntimeConfig {
            host: host_config,
            runtime: RuntimeConfig { max_in_flight: 2 },
            dispatch: DispatchConfig { max_pending: 2 },
            completed_capacity: 16,
        },
        managed_dependencies(backend),
    )
    .expect("managed runtime");

    let error = runtime
        .start_mqtt(new_shared_lifecycle_state(managed_runtime_state()))
        .expect_err("default settings have no runtime broker secret");
    assert_eq!(error, ManagedMqttStartError::ConnectionStartFailed);
    drop(TokioRuntimeHost::acquire(host_config).expect("start rollback returned host lease"));
}

fn managed_dependencies(backend: Arc<dyn AutomationBackend>) -> ManagedRuntimeDependencies {
    ManagedRuntimeDependencies::new(
        YeonjangSettings::default(),
        backend,
        AuthorizationBootstrapInput::new(
            "test-provider",
            "test-key-1",
            "test-audience",
            b"composition-test-secret".to_vec(),
            16,
        )
        .expect("authorization input"),
        Arc::new(FixedAuthorizationClock),
        FilesystemRuntimeLeaseProvider::new(
            std::env::temp_dir().join("knowbee-standalone-runtime-leases"),
        )
        .expect("test lease provider")
        .acquire()
        .expect("test runtime lease"),
    )
}

fn canonical_signed_camera_payload(delivery_id: &str, secret: &[u8]) -> Vec<u8> {
    canonical_signed_camera_payload_for(
        delivery_id,
        "provider-signed-command",
        "provider-signed-cancel",
        secret,
    )
}

fn canonical_signed_camera_payload_for(
    delivery_id: &str,
    command_id: &str,
    cancel_token: &str,
    secret: &[u8],
) -> Vec<u8> {
    let mut request = bound_camera_request(delivery_id, command_id, cancel_token);
    sign_request_receipt(&mut request, secret);
    let receipt = request
        .metadata
        .authorization_receipt
        .as_ref()
        .expect("signed receipt");
    serde_json::to_vec(&json!({
        "protocolVersion": 1,
        "id": delivery_id,
        "method": "camera.capture",
        "params": {},
        "metadata": {
            "commandId": request.metadata.command_id,
            "operationId": request.metadata.operation_id,
            "targetSessionId": request.metadata.target_session_id,
            "targetFingerprint": request.metadata.target_fingerprint,
            "idempotencyKey": request.metadata.idempotency_key,
            "expiresAt": request.metadata.expires_at,
            "cancelToken": request.metadata.cancel_token,
            "authorizationReceipt": {
                "schemaVersion": receipt.schema_version,
                "authorizationId": receipt.authorization_id,
                "issuer": receipt.issuer,
                "issuerKeyId": receipt.issuer_key_id,
                "audience": receipt.audience,
                "method": receipt.method,
                "resourceScope": receipt.resource_scope,
                "commandId": receipt.command_id,
                "operationId": receipt.operation_id,
                "targetSessionId": receipt.target_session_id,
                "targetFingerprint": receipt.target_fingerprint,
                "idempotencyKey": receipt.idempotency_key,
                "expiresAt": receipt.expires_at,
                "proof": receipt.proof
            }
        }
    }))
    .expect("canonical signed payload")
}

fn canonical_cancel_payload(id: &str, command_id: &str, cancel_token: &str) -> Vec<u8> {
    serde_json::to_vec(&json!({
        "protocolVersion": 1,
        "id": id,
        "method": "command.cancel",
        "params": {
            "command_id": command_id,
            "cancel_token": cancel_token
        },
        "metadata": {}
    }))
    .expect("cancel payload")
}

fn canonical_exact_cancel_payload(id: &str, target: &Request, cancel_token: &str) -> Vec<u8> {
    serde_json::to_vec(&json!({
        "protocolVersion": 1,
        "id": id,
        "method": "command.cancel",
        "params": exact_cancellation_params(target, cancel_token),
        "metadata": {}
    }))
    .expect("canonical exact cancellation payload")
}

fn exact_cancellation_params(target: &Request, cancel_token: &str) -> serde_json::Value {
    json!({
        "schema_version": 1,
        "target_request_id": target.id,
        "command_id": target.metadata.command_id,
        "operation_id": target.metadata.operation_id,
        "target_session_id": target.metadata.target_session_id,
        "target_fingerprint": target.metadata.target_fingerprint,
        "idempotency_key": target.metadata.idempotency_key,
        "cancel_token": cancel_token,
        "reason_kind": "user_requested",
        "requested_at_ms": 2_000_i64
    })
}

fn exact_cancellation_for_request(
    target: &Request,
    cancel_token: &str,
) -> ExactCancellationRequest {
    ExactCancellationRequest::new(
        1,
        CommandTargetBinding::from_request(target).expect("exact target binding"),
        cancel_token,
        CancellationReasonKind::UserRequested,
        2_000,
    )
    .expect("exact cancellation")
}

fn canonical_bound_side_effect_payload(request: &Request) -> Vec<u8> {
    let receipt = request
        .metadata
        .authorization_receipt
        .as_ref()
        .expect("bound authorization receipt");
    serde_json::to_vec(&json!({
        "protocolVersion": 1,
        "id": request.id,
        "method": request.method,
        "params": request.params,
        "metadata": {
            "commandId": request.metadata.command_id,
            "operationId": request.metadata.operation_id,
            "targetSessionId": request.metadata.target_session_id,
            "targetFingerprint": request.metadata.target_fingerprint,
            "idempotencyKey": request.metadata.idempotency_key,
            "expiresAt": request.metadata.expires_at,
            "cancelToken": request.metadata.cancel_token,
            "authorizationReceipt": {
                "schemaVersion": receipt.schema_version,
                "authorizationId": receipt.authorization_id,
                "issuer": receipt.issuer,
                "issuerKeyId": receipt.issuer_key_id,
                "audience": receipt.audience,
                "method": receipt.method,
                "resourceScope": receipt.resource_scope,
                "commandId": receipt.command_id,
                "operationId": receipt.operation_id,
                "targetSessionId": receipt.target_session_id,
                "targetFingerprint": receipt.target_fingerprint,
                "idempotencyKey": receipt.idempotency_key,
                "expiresAt": receipt.expires_at,
                "proof": receipt.proof
            }
        }
    }))
    .expect("canonical bound side-effect payload")
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn graceful_shutdown_rejects_new_work_and_drains_admitted_work() {
    let release = Arc::new(Barrier::new(2));
    let recording = Arc::new(FakeBackend {
        system_info_release: Some(Arc::clone(&release)),
        ..Default::default()
    });
    let backend: Arc<dyn AutomationBackend> = recording.clone();
    let supervisor = RuntimeSupervisor::new(
        RuntimeConfig { max_in_flight: 1 },
        YeonjangSettings::default(),
        backend,
    )
    .expect("valid runtime config");

    let running_supervisor = supervisor.clone();
    let running = tokio::spawn(async move {
        running_supervisor
            .execute(system_info_request("shutdown-running"))
            .await
    });
    while recording.active_system_info.load(Ordering::SeqCst) < 1 {
        tokio::task::yield_now().await;
    }

    let shutdown_supervisor = supervisor.clone();
    let shutdown = tokio::spawn(async move {
        shutdown_supervisor.shutdown().await;
    });
    loop {
        match supervisor
            .execute(system_info_request("shutdown-rejected"))
            .await
        {
            Err(RuntimeSubmitError::ShuttingDown) => break,
            Err(RuntimeSubmitError::Backpressure) => tokio::task::yield_now().await,
            other => panic!("unexpected admission result during shutdown: {other:?}"),
        }
    }
    assert!(
        !shutdown.is_finished(),
        "shutdown must wait for admitted work"
    );

    tokio::task::spawn_blocking(move || release.wait())
        .await
        .expect("release barrier");
    assert!(
        running
            .await
            .expect("running task")
            .expect("running response")
            .ok
    );
    shutdown.await.expect("shutdown task");
    assert_eq!(
        supervisor
            .execute(system_info_request("shutdown-after-drain"))
            .await
            .expect_err("runtime remains closed"),
        RuntimeSubmitError::ShuttingDown
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn graceful_shutdown_cancels_and_drains_an_active_side_effect() {
    let recording = Arc::new(FakeBackend {
        wait_for_camera_cancellation: true,
        ..Default::default()
    });
    let backend: Arc<dyn AutomationBackend> = recording.clone();
    let mut settings = YeonjangSettings::default();
    settings.permissions.allow_camera_access = true;
    let supervisor = runtime_with_authorization(
        RuntimeConfig { max_in_flight: 1 },
        settings,
        backend,
        Arc::new(AllowTestAuthorizationVerifier),
    )
    .expect("runtime");

    let running_supervisor = supervisor.clone();
    let running = tokio::spawn(async move {
        running_supervisor
            .execute(bound_camera_request(
                "shutdown-camera",
                "shutdown-camera-command",
                "shutdown-camera-token",
            ))
            .await
    });
    while recording.active_camera_capture.load(Ordering::SeqCst) == 0 {
        tokio::task::yield_now().await;
    }

    supervisor.shutdown().await;
    let response = running
        .await
        .expect("camera task")
        .expect("camera terminal response");
    assert_eq!(
        response.error.as_ref().map(|error| error.code.as_str()),
        Some("camera_capture_cancelled")
    );
    assert_eq!(
        response
            .attempt
            .as_ref()
            .and_then(|attempt| attempt.cancellation_reason),
        Some(CommandAttemptCancellationReason::RuntimeShutdown)
    );
    assert_eq!(recording.active_camera_capture.load(Ordering::SeqCst), 0);
    assert_eq!(
        supervisor.cancel("shutdown-camera-command", "shutdown-camera-token"),
        RuntimeCancelResult::NotActive
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn exact_cancellation_receipt_leads_to_a_separate_terminal_cancelled_response() {
    let cancel_release = Arc::new(Barrier::new(2));
    let recording = Arc::new(FakeBackend {
        wait_for_camera_cancellation: true,
        camera_cancel_release: Some(Arc::clone(&cancel_release)),
        ..Default::default()
    });
    let backend: Arc<dyn AutomationBackend> = recording.clone();
    let mut settings = YeonjangSettings::default();
    settings.permissions.allow_camera_access = true;
    let supervisor = runtime_with_authorization(
        RuntimeConfig { max_in_flight: 2 },
        settings,
        backend,
        Arc::new(AllowTestAuthorizationVerifier),
    )
    .expect("valid runtime config");
    let service = ManagedRequestService::new(supervisor.clone());
    let request = bound_camera_request("cancelled-camera", "command-camera", "cancel-camera");
    let exact_cancellation = exact_cancellation_for_request(&request, "cancel-camera");

    let running_supervisor = supervisor.clone();
    let running_request = request.clone();
    let running = tokio::spawn(async move { running_supervisor.execute(running_request).await });
    while recording.active_camera_capture.load(Ordering::SeqCst) < 1 {
        tokio::task::yield_now().await;
    }

    assert_eq!(
        supervisor.cancel("command-camera", "wrong-token"),
        RuntimeCancelResult::NotActive
    );
    assert_eq!(
        supervisor
            .execute(request.clone())
            .await
            .expect_err("duplicate active command"),
        RuntimeSubmitError::IdempotencyInProgress
    );
    let cancellation_receipt = service
        .handle(Request {
            id: Some("cancel-receipt".to_string()),
            method: "command.cancel".to_string(),
            params: exact_cancellation_params(&request, "cancel-camera"),
            metadata: Default::default(),
        })
        .await;
    assert!(cancellation_receipt.ok);
    assert_eq!(
        cancellation_receipt
            .result
            .as_ref()
            .and_then(|result| result["accepted"].as_bool()),
        Some(true)
    );
    assert_eq!(
        cancellation_receipt
            .result
            .as_ref()
            .and_then(|result| result["terminal"].as_bool()),
        Some(false)
    );
    assert_eq!(
        supervisor.cancel("command-camera", "cancel-camera"),
        RuntimeCancelResult::Duplicate
    );
    tokio::task::spawn_blocking(move || cancel_release.wait())
        .await
        .expect("camera cancellation release");

    let terminal = running
        .await
        .expect("camera task")
        .expect("terminal response");
    assert!(!terminal.ok);
    assert_eq!(
        terminal.error.as_ref().map(|error| error.code.as_str()),
        Some("camera_capture_cancelled")
    );
    assert_eq!(
        supervisor.cancel_exact_with_request_id(None, &exact_cancellation),
        RuntimeCancelResult::AlreadyTerminal
    );
}

#[tokio::test]
async fn standalone_runtime_rejects_an_unbound_side_effect_before_the_backend() {
    let recording = Arc::new(FakeBackend::default());
    let backend: Arc<dyn AutomationBackend> = recording.clone();
    let mut settings = YeonjangSettings::default();
    settings.permissions.allow_camera_access = true;
    let supervisor = RuntimeSupervisor::new(RuntimeConfig { max_in_flight: 1 }, settings, backend)
        .expect("valid runtime config");

    let rejected = supervisor
        .execute(Request {
            id: Some("unbound-camera".to_string()),
            method: "camera.capture".to_string(),
            params: json!({}),
            metadata: Default::default(),
        })
        .await
        .expect_err("missing exact binding");

    assert_eq!(rejected, RuntimeSubmitError::InvalidSideEffectBinding);
    assert_eq!(recording.camera_capture_calls.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn standalone_runtime_requires_authorization_after_exact_binding() {
    let recording = Arc::new(FakeBackend::default());
    let backend: Arc<dyn AutomationBackend> = recording.clone();
    let mut settings = YeonjangSettings::default();
    settings.permissions.allow_camera_access = true;
    let supervisor = RuntimeSupervisor::new(RuntimeConfig { max_in_flight: 1 }, settings, backend)
        .expect("valid runtime config");

    let mut request = bound_camera_request(
        "unauthorized-camera",
        "unauthorized-command",
        "unauthorized-cancel",
    );
    request.metadata.authorization_receipt = None;
    let rejected = supervisor
        .execute(request)
        .await
        .expect_err("missing authorization receipt");

    assert_eq!(rejected, RuntimeSubmitError::AuthorizationRequired);
    assert_eq!(
        supervisor
            .execute(bound_camera_request(
                "unavailable-verifier-camera",
                "unavailable-verifier-command",
                "unavailable-verifier-cancel",
            ))
            .await
            .expect_err("default verifier fails closed"),
        RuntimeSubmitError::AuthorizationRejected(AuthorizationRejection::VerifierUnavailable)
    );
    assert_eq!(recording.camera_capture_calls.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn capture_params_are_strictly_rejected_before_camera_or_screen_backends() {
    let recording = Arc::new(FakeBackend::default());
    let backend: Arc<dyn AutomationBackend> = recording.clone();
    let mut settings = YeonjangSettings::default();
    settings.permissions.allow_camera_access = true;
    settings.permissions.allow_screen_capture = true;
    let supervisor = runtime_with_authorization(
        RuntimeConfig { max_in_flight: 1 },
        settings,
        backend,
        Arc::new(AllowTestAuthorizationVerifier),
    )
    .expect("valid runtime config");

    let mut camera = bound_camera_request(
        "invalid-camera-params",
        "invalid-camera-command",
        "invalid-camera-cancel",
    );
    camera.params = json!({ "unexpected": true });
    assert_eq!(
        supervisor
            .execute(camera)
            .await
            .expect_err("unknown camera field"),
        RuntimeSubmitError::InvalidParams
    );

    let mut screen = bound_camera_request(
        "invalid-screen-params",
        "invalid-screen-command",
        "invalid-screen-cancel",
    );
    screen.method = "screen.capture".to_string();
    screen.params = json!({ "display": "not-a-number" });
    screen
        .metadata
        .authorization_receipt
        .as_mut()
        .expect("test receipt")
        .method = "screen.capture".to_string();
    assert_eq!(
        supervisor
            .execute(screen)
            .await
            .expect_err("invalid screen display"),
        RuntimeSubmitError::InvalidParams
    );

    assert_eq!(recording.camera_capture_calls.load(Ordering::SeqCst), 0);
    assert_eq!(recording.screen_capture_calls.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn active_command_registration_is_cleaned_up_when_a_worker_panics() {
    let backend: Arc<dyn AutomationBackend> = Arc::new(FakeBackend {
        panic_camera_capture: true,
        ..Default::default()
    });
    let mut settings = YeonjangSettings::default();
    settings.permissions.allow_camera_access = true;
    let supervisor = runtime_with_authorization(
        RuntimeConfig { max_in_flight: 1 },
        settings,
        backend,
        Arc::new(AllowTestAuthorizationVerifier),
    )
    .expect("valid runtime config");

    for request_id in ["panic-camera-1", "panic-camera-2"] {
        let request = bound_camera_request(request_id, "panic-command", "panic-cancel");
        let cancellation = exact_cancellation_for_request(&request, "panic-cancel");
        assert_eq!(
            supervisor.execute(request).await.expect_err("worker panic"),
            RuntimeSubmitError::WorkerFailed
        );
        assert_eq!(
            supervisor.cancel_exact_with_request_id(None, &cancellation),
            RuntimeCancelResult::AlreadyTerminal
        );
    }
}

fn system_info_request(id: &str) -> Request {
    Request {
        id: Some(id.to_string()),
        method: "system.info".to_string(),
        params: json!({}),
        metadata: Default::default(),
    }
}

fn bound_camera_request(id: &str, command_id: &str, cancel_token: &str) -> Request {
    Request {
        id: Some(id.to_string()),
        method: "camera.capture".to_string(),
        params: json!({}),
        metadata: knowbee_yeonjang::protocol::RequestMetadata {
            command_id: Some(command_id.to_string()),
            operation_id: Some("operation-camera".to_string()),
            target_session_id: Some("session-camera".to_string()),
            target_fingerprint: Some(
                "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                    .to_string(),
            ),
            idempotency_key: Some(format!("idempotency-{command_id}")),
            expires_at: Some(4_000_000_000_000),
            cancel_token: Some(cancel_token.to_string()),
            authorization_receipt: Some(AuthorizationReceipt {
                schema_version: 1,
                authorization_id: format!("authorization-{command_id}"),
                issuer: "test-provider".to_string(),
                issuer_key_id: "test-key-1".to_string(),
                audience: "yeonjang-test".to_string(),
                method: "camera.capture".to_string(),
                resource_scope: "camera".to_string(),
                command_id: command_id.to_string(),
                operation_id: "operation-camera".to_string(),
                target_session_id: "session-camera".to_string(),
                target_fingerprint:
                    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                        .to_string(),
                idempotency_key: format!("idempotency-{command_id}"),
                expires_at: 4_000_000_000_000,
                proof: "test-proof".to_string(),
            }),
            ..Default::default()
        },
    }
}

fn bound_screen_request(id: &str, command_id: &str, cancel_token: &str) -> Request {
    let mut request = bound_camera_request(id, command_id, cancel_token);
    request.method = "screen.capture".to_string();
    let receipt = request
        .metadata
        .authorization_receipt
        .as_mut()
        .expect("bound receipt");
    receipt.method = "screen.capture".to_string();
    receipt.resource_scope = "screen".to_string();
    request
}

#[test]
fn unknown_backend_error_is_redacted_from_the_public_response() {
    let backend = FakeBackend {
        expose_private_system_error: true,
        ..Default::default()
    };
    let mut settings = YeonjangSettings::default();
    settings.connection.password = "response-broker-secret-marker".to_string();
    settings.pairing_secret = "response-pairing-secret-marker".to_string();

    let response = handle_request_with_settings_and_backend(
        system_info_request("redacted-error"),
        settings,
        &backend,
    );

    let serialized = serde_json::to_string(&response).expect("public response");
    assert!(!serialized.contains("response-broker-secret-marker"));
    assert!(!serialized.contains("response-pairing-secret-marker"));
    let error = response.error.expect("backend failure");
    assert_eq!(error.code, "request_failed");
    assert_eq!(error.message, "Request could not be completed.");
    assert!(!error.message.contains("/Users/private"));
    assert!(!error.message.contains("secret-value"));
}
mod support;
