use anyhow::{Context, Result};
use hmac::{Hmac, Mac};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::sync::{Arc, atomic::AtomicBool};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::artifact_sink::{
    CaptureArtifactBindingInput, CaptureArtifactSink, UnavailableCaptureArtifactSink,
};
use crate::automation::{
    AutomationBackend, AutomationCapabilities, KeyboardActionRequest, MouseActionRequest,
    PlatformKind,
};
use crate::browser_focus_nonce::consume_browser_focus_nonce;
use crate::features::{
    browser, camera, clipboard, device, disk, file, input, keyboard, mouse, network, process,
    screen, system,
};
use crate::lifecycle::{SupportProfileKind, SupportProfileRuntimeInfo, runtime_support_profile};
use crate::method_descriptor::{MethodUnavailableError, UnknownMethodError, method_descriptor};
use crate::protocol::{
    CommandAttemptEvidence, CommandAttemptRetrySafety, CommandAttemptTerminalStage, Request,
    Response,
};
#[cfg(test)]
use crate::settings::load_settings;
use crate::settings::{PermissionSettings, YeonjangSettings, browser_focus_nonce_state_path};

const YEONJANG_PROTOCOL_VERSION: &str = "2026-04-16.capability-matrix.v1";
const YEONJANG_CAPABILITY_SCHEMA_VERSION: u64 = 1;
type HmacSha256 = Hmac<Sha256>;

/// Handles a request against the immutable settings snapshot captured when the
/// runtime started. Managed transports must use this entry point instead of
/// reloading settings while handling a command.
#[cfg(test)]
pub fn handle_request_with_settings(request: Request, settings: YeonjangSettings) -> Response {
    let backend = crate::platform::CurrentBackend;
    handle_request_with_settings_and_backend_and_cancellation(
        request,
        settings,
        &backend,
        Arc::new(AtomicBool::new(false)),
    )
}

pub fn handle_request_with_settings_and_backend(
    request: Request,
    settings: YeonjangSettings,
    backend: &dyn AutomationBackend,
) -> Response {
    handle_request_with_settings_and_backend_and_cancellation(
        request,
        settings,
        backend,
        Arc::new(AtomicBool::new(false)),
    )
}

pub(crate) fn handle_request_with_settings_and_backend_and_cancellation(
    request: Request,
    settings: YeonjangSettings,
    backend: &dyn AutomationBackend,
    cancellation: Arc<AtomicBool>,
) -> Response {
    let artifact_sink = UnavailableCaptureArtifactSink;
    handle_request_with_settings_backend_sink_and_cancellation(
        request,
        settings,
        backend,
        &artifact_sink,
        cancellation,
    )
}

pub(crate) fn handle_request_with_settings_backend_sink_and_cancellation(
    request: Request,
    settings: YeonjangSettings,
    backend: &dyn AutomationBackend,
    artifact_sink: &dyn CaptureArtifactSink,
    cancellation: Arc<AtomicBool>,
) -> Response {
    match dispatch_with_settings(&request, &settings, backend, artifact_sink, cancellation) {
        Ok(result) => success_response_for_request(&request, result),
        Err(error) => error_response_for_request(&request, &error),
    }
}

fn classify_request_error(error: &anyhow::Error) -> (String, String) {
    if let Some(policy_error) =
        error.downcast_ref::<crate::features::capture_artifact::CaptureArtifactPolicyError>()
    {
        return (
            policy_error.code().to_string(),
            policy_error.public_message().to_string(),
        );
    }
    if let Some(artifact_error) = error.downcast_ref::<crate::artifact_sink::CaptureArtifactError>()
    {
        return (
            artifact_error.code().to_string(),
            artifact_error.public_message().to_string(),
        );
    }
    if let Some(camera_error) = error.downcast_ref::<crate::automation::CameraCaptureProcessError>()
    {
        return (
            camera_error.code().to_string(),
            camera_error.public_message().to_string(),
        );
    }
    if let Some(command_error) =
        error.downcast_ref::<crate::automation::CommandExecutionProcessError>()
    {
        return (
            command_error.code().to_string(),
            command_error.public_message().to_string(),
        );
    }
    if let Some(policy_error) = error.downcast_ref::<crate::features::system::CommandPolicyError>()
    {
        return (
            policy_error.code().to_string(),
            policy_error.public_message().to_string(),
        );
    }
    if let Some(method_error) = error.downcast_ref::<UnknownMethodError>() {
        return (
            method_error.code().to_string(),
            method_error.public_message().to_string(),
        );
    }
    if let Some(method_error) = error.downcast_ref::<MethodUnavailableError>() {
        return (
            method_error.code().to_string(),
            method_error.public_message().to_string(),
        );
    }

    (
        "request_failed".to_string(),
        "Request could not be completed.".to_string(),
    )
}

fn success_response_for_request(request: &Request, result: Value) -> Response {
    let attempt = CommandAttemptEvidence::for_request(
        request,
        CommandAttemptTerminalStage::ResponseReady,
        "command_completed",
        CommandAttemptRetrySafety::Completed,
    );
    match attempt {
        Some(attempt) => Response::ok_with_attempt(request.id.clone(), result, attempt),
        None => Response::ok(request.id.clone(), result),
    }
}

fn error_response_for_request(request: &Request, error: &anyhow::Error) -> Response {
    let (code, message) = classify_request_error(error);
    let (terminal_stage, retry_safety) = match code.as_str() {
        "camera_helper_timeout" => (
            CommandAttemptTerminalStage::HelperTimeout,
            CommandAttemptRetrySafety::ChangeStrategy,
        ),
        "camera_permission_denied" | "camera_permission_restricted" => (
            CommandAttemptTerminalStage::Rejected,
            CommandAttemptRetrySafety::ChangeStrategy,
        ),
        "command_invalid"
        | "command_shell_args_conflict"
        | "command_args_too_large"
        | "command_cwd_invalid"
        | "command_environment_too_large"
        | "command_timeout_invalid" => (
            CommandAttemptTerminalStage::Rejected,
            CommandAttemptRetrySafety::ChangeStrategy,
        ),
        "camera_capture_cancelled" | "command_cancelled" => (
            CommandAttemptTerminalStage::Cancelled,
            CommandAttemptRetrySafety::UnknownEffectState,
        ),
        _ => (
            CommandAttemptTerminalStage::HandlerFailed,
            CommandAttemptRetrySafety::UnknownEffectState,
        ),
    };
    let attempt =
        CommandAttemptEvidence::for_request(request, terminal_stage, code.as_str(), retry_safety);
    match attempt {
        Some(attempt) => Response::error_with_attempt(request.id.clone(), code, message, attempt),
        None => Response::error(request.id.clone(), code, message),
    }
}

fn dispatch_with_settings(
    request: &Request,
    settings: &YeonjangSettings,
    backend: &dyn AutomationBackend,
    artifact_sink: &dyn CaptureArtifactSink,
    cancellation: Arc<AtomicBool>,
) -> Result<Value> {
    let support_profile = runtime_support_profile(settings, None);
    let runtime_capabilities = runtime_capabilities_with_backend(&support_profile, backend);
    let permissions = settings.permissions.clone();

    match request.method.as_str() {
        "node.ping" => Ok(json!({
            "node": "knowbee-yeonjang",
            "version": git_tag(),
            "protocolVersion": YEONJANG_PROTOCOL_VERSION,
            "gitTag": git_tag(),
            "gitCommit": git_commit(),
            "buildTarget": build_target(),
            "os": std::env::consts::OS,
            "arch": std::env::consts::ARCH,
            "status": "ready",
        })),
        "node.capabilities" => Ok(capabilities_with_settings_and_backend(settings, backend)),
        "system.info" => system::system_info_with_backend(backend),
        "file.metadata" => {
            ensure_runtime_support(true, "file.metadata", &support_profile)?;
            ensure_permission(
                permissions.allow_file_read,
                "file.metadata",
                "allow_file_read",
            )?;
            let params = serde_json::from_value::<file::FilePathParams>(request.params.clone())
                .context("invalid params for file.metadata")?;
            file::metadata(params, &settings.path_access)
        }
        "file.list" => {
            ensure_runtime_support(true, "file.list", &support_profile)?;
            ensure_permission(permissions.allow_file_read, "file.list", "allow_file_read")?;
            let params = serde_json::from_value::<file::FilePathParams>(request.params.clone())
                .context("invalid params for file.list")?;
            file::list_path(params, &settings.path_access)
        }
        "file.read" => {
            ensure_runtime_support(true, "file.read", &support_profile)?;
            ensure_permission(permissions.allow_file_read, "file.read", "allow_file_read")?;
            let params = serde_json::from_value::<file::FileReadParams>(request.params.clone())
                .context("invalid params for file.read")?;
            file::read_file(params, &settings.path_access)
        }
        "file.search" => {
            ensure_runtime_support(true, "file.search", &support_profile)?;
            ensure_permission(
                permissions.allow_file_read,
                "file.search",
                "allow_file_read",
            )?;
            let params = serde_json::from_value::<file::FileSearchParams>(request.params.clone())
                .context("invalid params for file.search")?;
            file::search_files(params, &settings.path_access)
        }
        "file.write" => {
            ensure_runtime_support(true, "file.write", &support_profile)?;
            ensure_permission(
                permissions.allow_file_write,
                "file.write",
                "allow_file_write",
            )?;
            let params = serde_json::from_value::<file::FileWriteParams>(request.params.clone())
                .context("invalid params for file.write")?;
            file::write_file(params, &settings.path_access)
        }
        "file.patch" => {
            ensure_runtime_support(true, "file.patch", &support_profile)?;
            ensure_permission(
                permissions.allow_file_write,
                "file.patch",
                "allow_file_write",
            )?;
            let params = serde_json::from_value::<file::FilePatchParams>(request.params.clone())
                .context("invalid params for file.patch")?;
            file::patch_file(params, &settings.path_access)
        }
        "file.delete" => {
            ensure_runtime_support(true, "file.delete", &support_profile)?;
            ensure_permission(
                permissions.allow_file_delete,
                "file.delete",
                "allow_file_delete",
            )?;
            let params = serde_json::from_value::<file::FileDeleteParams>(request.params.clone())
                .context("invalid params for file.delete")?;
            file::delete_path(params, &settings.path_access)
        }
        "disk.info" => {
            ensure_runtime_support(true, "disk.info", &support_profile)?;
            ensure_permission(permissions.allow_disk_read, "disk.info", "allow_disk_read")?;
            let params = serde_json::from_value::<disk::DiskPathParams>(request.params.clone())
                .context("invalid params for disk.info")?;
            disk::info(params, &settings.path_access)
        }
        "disk.usage" => {
            ensure_runtime_support(true, "disk.usage", &support_profile)?;
            ensure_permission(permissions.allow_disk_read, "disk.usage", "allow_disk_read")?;
            let params = serde_json::from_value::<disk::DiskPathParams>(request.params.clone())
                .context("invalid params for disk.usage")?;
            disk::usage(params, &settings.path_access)
        }
        "disk.exists" => {
            ensure_runtime_support(true, "disk.exists", &support_profile)?;
            ensure_permission(
                permissions.allow_disk_read,
                "disk.exists",
                "allow_disk_read",
            )?;
            let params = serde_json::from_value::<disk::DiskPathParams>(request.params.clone())
                .context("invalid params for disk.exists")?;
            disk::exists(params, &settings.path_access)
        }
        "process.list" => {
            ensure_runtime_support(true, "process.list", &support_profile)?;
            ensure_permission(
                permissions.allow_process_read,
                "process.list",
                "allow_process_read",
            )?;
            let params =
                serde_json::from_value::<process::ProcessListParams>(request.params.clone())
                    .context("invalid params for process.list")?;
            process::list_processes(params)
        }
        "process.info" => {
            ensure_runtime_support(true, "process.info", &support_profile)?;
            ensure_permission(
                permissions.allow_process_read,
                "process.info",
                "allow_process_read",
            )?;
            let params =
                serde_json::from_value::<process::ProcessInfoParams>(request.params.clone())
                    .context("invalid params for process.info")?;
            process::process_info(params)
        }
        "browser.list" => {
            ensure_runtime_support(true, "browser.list", &support_profile)?;
            ensure_permission(
                permissions.allow_browser_read,
                "browser.list",
                "allow_browser_read",
            )?;
            let params =
                serde_json::from_value::<browser::BrowserListParams>(request.params.clone())
                    .context("invalid params for browser.list")?;
            browser::list_browsers(params)
        }
        "browser.active_hint" => {
            ensure_runtime_support(true, "browser.active_hint", &support_profile)?;
            ensure_permission(
                permissions.allow_browser_read,
                "browser.active_hint",
                "allow_browser_read",
            )?;
            let params =
                serde_json::from_value::<browser::BrowserActiveHintParams>(request.params.clone())
                    .context("invalid params for browser.active_hint")?;
            browser::active_hint(params)
        }
        "browser.open_url" => {
            ensure_runtime_support(true, "browser.open_url", &support_profile)?;
            ensure_permission(
                permissions.allow_browser_control,
                "browser.open_url",
                "allow_browser_control",
            )?;
            let params =
                serde_json::from_value::<browser::BrowserOpenUrlParams>(request.params.clone())
                    .context("invalid params for browser.open_url")?;
            browser::open_url(params)
        }
        "browser.focus" => dispatch_browser_focus_request_with_runtime(
            request,
            &permissions,
            &support_profile,
            settings,
            request.metadata.target_session_id.as_deref(),
            backend,
        ),
        "clipboard.read" => {
            ensure_runtime_support(true, "clipboard.read", &support_profile)?;
            ensure_permission(
                permissions.allow_clipboard_read,
                "clipboard.read",
                "allow_clipboard_read",
            )?;
            clipboard::read()
        }
        "clipboard.write" => {
            ensure_runtime_support(true, "clipboard.write", &support_profile)?;
            ensure_permission(
                permissions.allow_clipboard_write,
                "clipboard.write",
                "allow_clipboard_write",
            )?;
            let params =
                serde_json::from_value::<clipboard::ClipboardWriteParams>(request.params.clone())
                    .context("invalid params for clipboard.write")?;
            clipboard::write(params)
        }
        "network.status" => {
            ensure_runtime_support(true, "network.status", &support_profile)?;
            ensure_permission(
                permissions.allow_network_read,
                "network.status",
                "allow_network_read",
            )?;
            network::status()
        }
        "device.status" => {
            ensure_runtime_support(true, "device.status", &support_profile)?;
            ensure_permission(
                permissions.allow_device_status,
                "device.status",
                "allow_device_status",
            )?;
            Ok(device::status(
                &runtime_capabilities,
                &permissions,
                &settings.path_access,
            ))
        }
        "system.control" => {
            ensure_runtime_support(
                runtime_capabilities.system_control,
                "system.control",
                &support_profile,
            )?;
            ensure_permission(
                permissions.allow_system_control,
                "system.control",
                "allow_system_control",
            )?;
            let params = serde_json::from_value::<system::ControlParams>(request.params.clone())
                .context("invalid params for system.control")?;
            system::control(params, backend)
        }
        "camera.list" => {
            ensure_runtime_support(
                runtime_capabilities.camera_management,
                "camera.list",
                &support_profile,
            )?;
            ensure_permission(
                permissions.allow_camera_access,
                "camera.list",
                "allow_camera_access",
            )?;
            camera::list_devices(backend)
        }
        "camera.permission_status" => {
            ensure_runtime_support(
                runtime_capabilities.camera_management,
                "camera.permission_status",
                &support_profile,
            )?;
            ensure_permission(
                permissions.allow_camera_access,
                "camera.permission_status",
                "allow_camera_access",
            )?;
            camera::permission_status(backend)
        }
        "camera.capture" => {
            ensure_runtime_support(
                runtime_capabilities.camera_management,
                "camera.capture",
                &support_profile,
            )?;
            ensure_permission(
                permissions.allow_camera_access,
                "camera.capture",
                "allow_camera_access",
            )?;
            let params = serde_json::from_value::<camera::CaptureParams>(request.params.clone())
                .context("invalid params for camera.capture")?;
            camera::capture_with_artifact_sink(
                params,
                cancellation,
                backend,
                artifact_sink,
                capture_artifact_binding_input(request),
            )
        }
        "system.exec" => {
            ensure_runtime_support(
                runtime_capabilities.command_execution,
                "system.exec",
                &support_profile,
            )?;
            ensure_permission(
                permissions.allow_shell_exec,
                "system.exec",
                "allow_shell_exec",
            )?;
            let params = serde_json::from_value::<system::ExecParams>(request.params.clone())
                .context("invalid params for system.exec")?;
            system::exec(params, cancellation, backend)
        }
        "application.launch" => {
            ensure_runtime_support(
                runtime_capabilities.application_launch,
                "application.launch",
                &support_profile,
            )?;
            ensure_permission(
                permissions.allow_application_launch,
                "application.launch",
                "allow_application_launch",
            )?;
            let params = serde_json::from_value::<system::LaunchAppParams>(request.params.clone())
                .context("invalid params for application.launch")?;
            system::launch_application(params, backend)
        }
        "screen.capture" => {
            ensure_runtime_support(
                runtime_capabilities.screen_capture,
                "screen.capture",
                &support_profile,
            )?;
            ensure_permission(
                permissions.allow_screen_capture,
                "screen.capture",
                "allow_screen_capture",
            )?;
            let params = serde_json::from_value::<screen::CaptureParams>(request.params.clone())
                .context("invalid params for screen.capture")?;
            screen::capture_with_artifact_sink(
                params,
                backend,
                artifact_sink,
                capture_artifact_binding_input(request),
            )
        }
        "mouse.position" => {
            ensure_runtime_support(
                runtime_capabilities.mouse_control,
                "mouse.position",
                &support_profile,
            )?;
            ensure_permission(
                permissions.allow_mouse_control,
                "mouse.position",
                "allow_mouse_control",
            )?;
            mouse::current_position(backend)
        }
        "input.focused_target" => {
            ensure_runtime_support(
                runtime_capabilities.keyboard_control,
                "input.focused_target",
                &support_profile,
            )?;
            ensure_permission(
                permissions.allow_keyboard_control,
                "input.focused_target",
                "allow_keyboard_control",
            )?;
            input::focused_target(backend)
        }
        "mouse.move" => {
            ensure_runtime_support(
                runtime_capabilities.mouse_control,
                "mouse.move",
                &support_profile,
            )?;
            ensure_permission(
                permissions.allow_mouse_control,
                "mouse.move",
                "allow_mouse_control",
            )?;
            let params = serde_json::from_value::<mouse::MoveParams>(request.params.clone())
                .context("invalid params for mouse.move")?;
            mouse::move_cursor(params, backend)
        }
        "mouse.click" => {
            ensure_runtime_support(
                runtime_capabilities.mouse_control,
                "mouse.click",
                &support_profile,
            )?;
            ensure_permission(
                permissions.allow_mouse_control,
                "mouse.click",
                "allow_mouse_control",
            )?;
            let params = serde_json::from_value::<mouse::ClickParams>(request.params.clone())
                .context("invalid params for mouse.click")?;
            mouse::click(params, backend)
        }
        "mouse.action" => {
            ensure_runtime_support(
                runtime_capabilities.mouse_control,
                "mouse.action",
                &support_profile,
            )?;
            ensure_permission(
                permissions.allow_mouse_control,
                "mouse.action",
                "allow_mouse_control",
            )?;
            let params = serde_json::from_value::<MouseActionRequest>(request.params.clone())
                .context("invalid params for mouse.action")?;
            mouse::action(params, backend)
        }
        "keyboard.type" => {
            ensure_runtime_support(
                runtime_capabilities.keyboard_control,
                "keyboard.type",
                &support_profile,
            )?;
            ensure_permission(
                permissions.allow_keyboard_control,
                "keyboard.type",
                "allow_keyboard_control",
            )?;
            let params = serde_json::from_value::<keyboard::TypeParams>(request.params.clone())
                .context("invalid params for keyboard.type")?;
            keyboard::type_text(params, backend)
        }
        "keyboard.action" => {
            ensure_runtime_support(
                runtime_capabilities.keyboard_control,
                "keyboard.action",
                &support_profile,
            )?;
            ensure_permission(
                permissions.allow_keyboard_control,
                "keyboard.action",
                "allow_keyboard_control",
            )?;
            let params = serde_json::from_value::<KeyboardActionRequest>(request.params.clone())
                .context("invalid params for keyboard.action")?;
            keyboard::action(params, backend)
        }
        _ if method_descriptor(&request.method).is_some() => {
            Err(anyhow::Error::new(MethodUnavailableError))
        }
        _ => Err(anyhow::Error::new(UnknownMethodError)),
    }
}

fn capture_artifact_binding_input(request: &Request) -> CaptureArtifactBindingInput<'_> {
    CaptureArtifactBindingInput {
        command_id: request.metadata.command_id.as_deref(),
        operation_id: request.metadata.operation_id.as_deref(),
        target_session_id: request.metadata.target_session_id.as_deref(),
        target_fingerprint: request.metadata.target_fingerprint.as_deref(),
        idempotency_key: request.metadata.idempotency_key.as_deref(),
    }
}

#[cfg(test)]
fn dispatch_browser_focus_request(
    request: &Request,
    permissions: &PermissionSettings,
    support_profile: &SupportProfileRuntimeInfo,
) -> Result<Value> {
    let settings = load_settings().unwrap_or_else(|_| YeonjangSettings::default());
    dispatch_browser_focus_request_with_runtime(
        request,
        permissions,
        support_profile,
        &settings,
        request.metadata.target_session_id.as_deref(),
        &crate::platform::CurrentBackend,
    )
}

fn dispatch_browser_focus_request_with_runtime(
    request: &Request,
    permissions: &PermissionSettings,
    support_profile: &SupportProfileRuntimeInfo,
    settings: &YeonjangSettings,
    expected_session_id: Option<&str>,
    backend: &dyn AutomationBackend,
) -> Result<Value> {
    ensure_runtime_support(
        support_profile.effective_profile != SupportProfileKind::HeadlessManaged,
        "browser.focus",
        support_profile,
    )?;
    ensure_permission(
        permissions.allow_browser_control,
        "browser.focus",
        "allow_browser_control",
    )?;
    prepare_browser_focus_dispatch_contract_with_runtime(
        &request.params,
        settings,
        expected_session_id,
        now_unix_millis() as i64,
        support_profile.effective_profile != SupportProfileKind::HeadlessManaged,
        backend,
    )
}

#[cfg(test)]
fn prepare_browser_focus_dispatch_contract(params: &Value) -> Result<Value> {
    let settings = load_settings().unwrap_or_else(|_| YeonjangSettings::default());
    prepare_browser_focus_dispatch_contract_with_runtime(
        params,
        &settings,
        None,
        now_unix_millis() as i64,
        true,
        &crate::platform::CurrentBackend,
    )
}

fn prepare_browser_focus_dispatch_contract_with_runtime(
    params: &Value,
    settings: &YeonjangSettings,
    expected_session_id: Option<&str>,
    now_ms: i64,
    interactive_desktop_session: bool,
    backend: &dyn AutomationBackend,
) -> Result<Value> {
    let target = params
        .get("target")
        .ok_or_else(|| anyhow::anyhow!("target_identity_required"))?;
    let approval = params
        .get("approvalReceipt")
        .ok_or_else(|| anyhow::anyhow!("side_effect_authorization_required"))?;
    let pre_dispatch = params
        .get("preDispatch")
        .ok_or_else(|| anyhow::anyhow!("pre_dispatch_required"))?;

    if approval.get("method").and_then(Value::as_str) != Some("browser.focus")
        || approval.get("approved").and_then(Value::as_bool) != Some(true)
        || !matches!(
            approval.get("decision").and_then(Value::as_str),
            Some("allow_once") | Some("allow_run")
        )
        || approval
            .get("scopeId")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim()
            .is_empty()
    {
        anyhow::bail!("side_effect_authorization_required");
    }

    if pre_dispatch.get("status").and_then(Value::as_str) != Some("dispatch_prepared") {
        anyhow::bail!(
            "{}",
            pre_dispatch
                .get("reasonCode")
                .and_then(Value::as_str)
                .unwrap_or("pre_dispatch_not_ready")
        );
    }
    let invoke_now = pre_dispatch.get("invokeNow").and_then(Value::as_bool);
    if !matches!(invoke_now, Some(false) | Some(true)) {
        anyhow::bail!("browser_focus_dispatch_invoke_not_enabled");
    }
    let expected_target_hash = browser_focus_execution_target_hash(target)?;
    let admission = params
        .get("executionAdmission")
        .map(|admission| {
            verify_browser_focus_execution_admission(
                admission,
                &settings.connection.password,
                &settings.node_id,
                expected_session_id,
                &expected_target_hash,
                approval
                    .get("scopeId")
                    .and_then(Value::as_str)
                    .unwrap_or_default(),
                now_ms,
            )
        })
        .transpose()?;

    if invoke_now == Some(true) {
        let admission = admission
            .ok_or_else(|| anyhow::anyhow!("browser_focus_execution_admission_missing"))?;
        return execute_browser_focus_after_admission(
            target,
            admission,
            now_ms,
            interactive_desktop_session,
            &browser_focus_nonce_state_path(),
            |verified_process_name, interactive_desktop| {
                backend.focus_browser(verified_process_name, interactive_desktop)
            },
            || backend.focused_target().ok(),
        );
    }

    Ok(json!({
        "schemaVersion": "yeonjang-browser-focus-dispatch-contract-v1",
        "method": "browser.focus",
        "toolName": "yeonjang_browser_focus",
        "status": "dispatch_prepared",
        "reasonCode": "browser_focus_dispatch_contract_ready",
        "invokeNow": false,
        "addProductionBindingNow": false,
        "dispatcherRegistrationNow": false,
        "target": project_browser_focus_public_target(target),
        "preDispatchReasonCode": pre_dispatch
            .get("reasonCode")
            .and_then(Value::as_str)
            .unwrap_or("browser_focus_dispatch_prepared"),
    }))
}

fn execute_browser_focus_after_admission<F, O>(
    target: &Value,
    admission: VerifiedBrowserFocusExecutionAdmission,
    now_ms: i64,
    interactive_desktop_session: bool,
    nonce_state_path: &std::path::Path,
    executor: F,
    observe_focused_target: O,
) -> Result<Value>
where
    F: FnOnce(&str, bool) -> crate::automation::BrowserFocusExecutionResult,
    O: FnOnce() -> Option<crate::automation::FocusedTargetResult>,
{
    let process_name = target
        .get("processName")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| anyhow::anyhow!("browser_focus_process_name_required"))?;
    // Consume only after all validation succeeded and immediately before the OS side effect.
    consume_browser_focus_nonce(
        nonce_state_path,
        &admission.extension_id,
        &admission.nonce,
        admission.expires_at_ms,
        now_ms,
    )?;
    let execution = executor(process_name, interactive_desktop_session);
    let observed_focused_target = if execution.command_accepted {
        project_observed_browser_focus_target(observe_focused_target())
    } else {
        None
    };
    Ok(json!({
        "schemaVersion": "yeonjang-browser-focus-dispatch-contract-v1",
        "method": "browser.focus",
        "toolName": "yeonjang_browser_focus",
        "status": "dispatch_executed",
        "reasonCode": execution.reason_code,
        "commandAccepted": execution.command_accepted,
        "focusedTargetObservationRequired": true,
        "goalSuccess": false,
        "target": project_browser_focus_public_target(target),
        "observedFocusedTarget": observed_focused_target,
    }))
}

fn project_observed_browser_focus_target(
    observation: Option<crate::automation::FocusedTargetResult>,
) -> Option<Value> {
    let app_name = observation?.app_name?.trim().to_string();
    if app_name.is_empty() {
        return None;
    }
    Some(json!({
        "schemaVersion": "yeonjang-browser-focus-target-v1",
        "targetKind": "browser_window_or_tab",
        "displayName": app_name,
        "processName": app_name,
        "publicEvidenceFields": ["displayName", "processName"],
        "auditOnlyFields": ["rawTitle", "rawUrl", "pid", "windowId", "tabId"],
    }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserFocusExecutionAdmission {
    schema_version: String,
    method: String,
    extension_id: String,
    #[serde(default)]
    session_id: Option<String>,
    target_hash: String,
    approval_scope_id: String,
    expires_at: String,
    nonce: String,
    signature: String,
}

#[derive(Debug)]
struct VerifiedBrowserFocusExecutionAdmission {
    extension_id: String,
    nonce: String,
    expires_at_ms: i64,
}

fn verify_browser_focus_execution_admission(
    admission: &Value,
    connection_password: &str,
    expected_extension_id: &str,
    expected_session_id: Option<&str>,
    expected_target_hash: &str,
    expected_approval_scope_id: &str,
    now_ms: i64,
) -> Result<VerifiedBrowserFocusExecutionAdmission> {
    let admission = serde_json::from_value::<BrowserFocusExecutionAdmission>(admission.clone())
        .context("browser_focus_execution_admission_invalid")?;
    if admission.schema_version != "knowbee.yeonjang-browser-focus-execution-admission.v1"
        || admission.method != "browser.focus"
        || admission.extension_id.trim() != expected_extension_id.trim()
        || normalize_browser_focus_session(admission.session_id.as_deref())
            != normalize_browser_focus_session(expected_session_id)
        || admission.target_hash.trim() != expected_target_hash
        || admission.target_hash.trim().is_empty()
        || admission.approval_scope_id.trim().is_empty()
        || admission.approval_scope_id.trim() != expected_approval_scope_id.trim()
        || admission.nonce.trim().is_empty()
    {
        anyhow::bail!("browser_focus_execution_admission_invalid");
    }
    let expires_at = chrono::DateTime::parse_from_rfc3339(&admission.expires_at)
        .map_err(|_| anyhow::anyhow!("browser_focus_execution_admission_expired"))?
        .timestamp_millis();
    if expires_at <= now_ms {
        anyhow::bail!("browser_focus_execution_admission_expired");
    }
    let secret = connection_password.trim();
    if secret.is_empty() {
        anyhow::bail!("browser_focus_execution_admission_key_unavailable");
    }
    let signature = admission
        .signature
        .strip_prefix("hmac-sha256:")
        .ok_or_else(|| anyhow::anyhow!("browser_focus_execution_admission_signature_invalid"))?;
    let signature = decode_browser_focus_signature(signature)?;
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .map_err(|_| anyhow::anyhow!("browser_focus_execution_admission_signature_invalid"))?;
    mac.update(browser_focus_execution_admission_canonical_payload(&admission).as_bytes());
    mac.verify_slice(&signature)
        .map_err(|_| anyhow::anyhow!("browser_focus_execution_admission_signature_invalid"))?;
    Ok(VerifiedBrowserFocusExecutionAdmission {
        extension_id: admission.extension_id,
        nonce: admission.nonce,
        expires_at_ms: expires_at,
    })
}

fn browser_focus_execution_target_hash(target: &Value) -> Result<String> {
    let string_field = |name: &str| -> String {
        target
            .get(name)
            .and_then(Value::as_str)
            .map(str::trim)
            .unwrap_or_default()
            .to_string()
    };
    let number_field = |name: &str| -> String {
        target
            .get(name)
            .and_then(Value::as_i64)
            .map(|value| value.to_string())
            .unwrap_or_default()
    };
    let schema_version = string_field("schemaVersion");
    let target_kind = string_field("targetKind");
    let display_name = string_field("displayName");
    if schema_version != "yeonjang-browser-focus-target-v1"
        || target_kind != "browser_window_or_tab"
        || display_name.is_empty()
    {
        anyhow::bail!("target_identity_required");
    }
    let canonical = [
        schema_version,
        target_kind,
        display_name,
        string_field("processName"),
        string_field("titleHash"),
        number_field("titleLength"),
        string_field("urlScheme"),
        string_field("urlHash"),
        number_field("urlLength"),
    ]
    .join("\0");
    let mut hasher = Sha256::new();
    hasher.update(canonical.as_bytes());
    Ok(format!("sha256:{:x}", hasher.finalize()))
}

fn browser_focus_execution_admission_canonical_payload(
    admission: &BrowserFocusExecutionAdmission,
) -> String {
    [
        admission.schema_version.as_str(),
        admission.method.as_str(),
        admission.extension_id.trim(),
        normalize_browser_focus_session(admission.session_id.as_deref()),
        admission.target_hash.trim(),
        admission.approval_scope_id.trim(),
        admission.expires_at.trim(),
        admission.nonce.trim(),
    ]
    .join("\0")
}

fn normalize_browser_focus_session(value: Option<&str>) -> &str {
    value.map(str::trim).unwrap_or_default()
}

fn decode_browser_focus_signature(value: &str) -> Result<Vec<u8>> {
    if value.len() != 64 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        anyhow::bail!("browser_focus_execution_admission_signature_invalid");
    }
    (0..value.len())
        .step_by(2)
        .map(|offset| {
            u8::from_str_radix(&value[offset..offset + 2], 16)
                .map_err(|_| anyhow::anyhow!("browser_focus_execution_admission_signature_invalid"))
        })
        .collect()
}

fn project_browser_focus_public_target(target: &Value) -> Value {
    let mut projected = serde_json::Map::new();
    for key in [
        "schemaVersion",
        "targetKind",
        "targetAlias",
        "displayName",
        "processName",
        "titleHash",
        "titleLength",
        "urlScheme",
        "urlHash",
        "urlLength",
    ] {
        if let Some(value) = target.get(key) {
            projected.insert(key.to_string(), value.clone());
        }
    }
    Value::Object(projected)
}

fn capabilities_with_settings_and_backend(
    settings: &YeonjangSettings,
    backend: &dyn AutomationBackend,
) -> Value {
    capabilities_payload_with_snapshot(settings, backend.capabilities())
}

pub(crate) fn capabilities_payload_with_snapshot(
    settings: &YeonjangSettings,
    capability_snapshot: AutomationCapabilities,
) -> Value {
    let support_profile = runtime_support_profile(settings, None);
    let capability_flags =
        runtime_capabilities_with_snapshot(&support_profile, capability_snapshot);
    let permissions = settings.permissions.clone();
    let last_checked_at = now_unix_millis();
    json!({
        "node": "knowbee-yeonjang",
        "version": git_tag(),
        "protocolVersion": YEONJANG_PROTOCOL_VERSION,
        "gitTag": git_tag(),
        "gitCommit": git_commit(),
        "buildTarget": build_target(),
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "transport": ["stdio-jsonl", "mqtt-json"],
        "capabilitySchemaVersion": YEONJANG_CAPABILITY_SCHEMA_VERSION,
        "platform": capability_flags.platform,
        "capabilityHash": capability_hash(&capability_flags),
        "supportProfile": support_profile.effective_profile.as_str(),
        "configuredSupportProfile": support_profile.configured_profile.as_str(),
        "supportProfileReasonCodes": support_profile.reason_codes,
        "interactiveDesktopAvailable": support_profile.interactive_desktop_available,
        "trayRuntimeAvailable": support_profile.tray_runtime_available,
        "capabilityMatrix": capability_matrix(&capability_flags, &support_profile, last_checked_at),
        "permissions": permissions_payload(&permissions),
        "toolHealth": tool_health(&capability_flags, &permissions, &support_profile, last_checked_at),
        "abstractions": {
            "cameraManagement": capability_flags.camera_management,
            "commandExecution": capability_flags.command_execution,
            "applicationLaunch": capability_flags.application_launch,
            "screenCapture": capability_flags.screen_capture,
            "mouseControl": capability_flags.mouse_control,
            "keyboardControl": capability_flags.keyboard_control,
            "systemControl": capability_flags.system_control,
        },
        "methods": [
            {
                "name": "node.ping",
                "implemented": true,
                "category": "node",
                "summary": "Basic liveness probe.",
            },
            {
                "name": "node.capabilities",
                "implemented": true,
                "category": "node",
                "summary": "Lists supported methods and implementation state.",
            },
            {
                "name": "system.info",
                "implemented": true,
                "category": "system",
                "summary": "Returns runtime and host environment info through the abstraction layer.",
            },
            {
                "name": "file.metadata",
                "implemented": true,
                "category": "file",
                "summary": "Returns metadata for an allowed file or directory.",
            },
            {
                "name": "file.list",
                "implemented": true,
                "category": "file",
                "summary": "Lists entries in an allowed directory without returning file contents.",
            },
            {
                "name": "file.read",
                "implemented": true,
                "category": "file",
                "summary": "Reads allowed UTF-8 text files with byte limits and truncation metadata.",
            },
            {
                "name": "file.search",
                "implemented": true,
                "category": "file",
                "summary": "Searches allowed UTF-8 files and returns bounded match previews.",
            },
            {
                "name": "file.write",
                "implemented": true,
                "category": "file",
                "summary": "Writes allowed UTF-8 text files with byte limits and post-check metadata.",
            },
            {
                "name": "file.patch",
                "implemented": true,
                "category": "file",
                "summary": "Applies an exact single-match UTF-8 text replacement with post-check metadata.",
            },
            {
                "name": "file.delete",
                "implemented": true,
                "category": "file",
                "summary": "Deletes allowed files or empty directories with post-check metadata.",
            },
            {
                "name": "disk.info",
                "implemented": true,
                "category": "disk",
                "summary": "Returns read-only disk metadata and capacity for an allowed path.",
            },
            {
                "name": "disk.usage",
                "implemented": true,
                "category": "disk",
                "summary": "Returns total, free, and available bytes for an allowed path.",
            },
            {
                "name": "disk.exists",
                "implemented": true,
                "category": "disk",
                "summary": "Checks existence of a path inside an allowed parent without returning file contents.",
            },
            {
                "name": "process.list",
                "implemented": true,
                "category": "process",
                "summary": "Lists process metadata without command line, cwd, or environment fields.",
            },
            {
                "name": "process.info",
                "implemented": true,
                "category": "process",
                "summary": "Returns process metadata for one PID without command line, cwd, or environment fields.",
            },
            {
                "name": "browser.list",
                "implemented": true,
                "category": "browser",
                "summary": "Lists running browser candidates without URL, title, command line, cwd, profile path, or environment fields.",
            },
            {
                "name": "browser.active_hint",
                "implemented": true,
                "category": "browser",
                "summary": "Returns the best available browser candidate hint without reading browser tabs or profiles.",
            },
            {
                "name": "browser.active_tab_info",
                "implemented": false,
                "category": "browser",
                "summary": "Advertises the active tab observation contract. Dispatch remains disabled until an approved observation backend is available.",
            },
            {
                "name": "browser.open_url",
                "implemented": true,
                "category": "browser",
                "summary": "Opens an http or https URL through the platform default browser launcher.",
            },
            {
                "name": "browser.focus",
                "implemented": true,
                "category": "browser",
                "summary": "Prepares a browser focus request after approval and focused target verification gates without executing OS focus directly.",
            },
            {
                "name": "clipboard.read",
                "implemented": true,
                "category": "clipboard",
                "summary": "Reads UTF-8 clipboard text with content metadata. Raw text is for the direct tool result only.",
            },
            {
                "name": "clipboard.write",
                "implemented": true,
                "category": "clipboard",
                "summary": "Writes UTF-8 clipboard text and verifies the final clipboard state with metadata only.",
            },
            {
                "name": "network.status",
                "implemented": true,
                "category": "network",
                "summary": "Returns local network interface counters without external probes.",
            },
            {
                "name": "device.status",
                "implemented": true,
                "category": "device",
                "summary": "Returns local resource support and permission summaries without internal identifiers.",
            },
            {
                "name": "camera.list",
                "implemented": capability_flags.camera_management,
                "category": "camera",
                "summary": "Lists available camera devices.",
            },
            {
                "name": "camera.permission_status",
                "implemented": capability_flags.camera_management,
                "category": "camera",
                "summary": "Reports camera permission diagnosis without capturing an image.",
            },
            {
                "name": "camera.capture",
                "implemented": capability_flags.camera_management,
                "category": "camera",
                "summary": "Captures a still image from the selected camera device.",
            },
            {
                "name": "system.control",
                "implemented": capability_flags.system_control,
                "category": "system",
                "summary": "Abstract system control entry point for power/session actions.",
            },
            {
                "name": "system.exec",
                "implemented": capability_flags.command_execution,
                "category": "system",
                "summary": "Executes a local command or shell string through the backend abstraction.",
            },
            {
                "name": "application.launch",
                "implemented": capability_flags.application_launch,
                "category": "application",
                "summary": "Abstract application launch entry point.",
            },
            {
                "name": "screen.capture",
                "implemented": capability_flags.screen_capture,
                "category": "screen",
                "summary": "Abstract screen capture entry point.",
            },
            {
                "name": "mouse.position",
                "implemented": capability_flags.mouse_control,
                "category": "mouse",
                "summary": "Returns current mouse cursor coordinates without moving or clicking.",
            },
            {
                "name": "input.focused_target",
                "implemented": capability_flags.keyboard_control,
                "category": "input",
                "summary": "Returns sanitized public summary for the current focused input target.",
            },
            {
                "name": "mouse.action",
                "implemented": capability_flags.mouse_control,
                "category": "mouse",
                "summary": "Accepts action-based mouse requests such as move and click.",
            },
            {
                "name": "mouse.move",
                "implemented": capability_flags.mouse_control,
                "category": "mouse",
                "summary": "Abstract mouse move entry point.",
            },
            {
                "name": "mouse.click",
                "implemented": capability_flags.mouse_control,
                "category": "mouse",
                "summary": "Abstract mouse click entry point.",
            },
            {
                "name": "keyboard.action",
                "implemented": capability_flags.keyboard_control,
                "category": "keyboard",
                "summary": "Accepts action-based keyboard requests such as text input.",
            },
            {
                "name": "keyboard.type",
                "implemented": capability_flags.keyboard_control,
                "category": "keyboard",
                "summary": "Abstract keyboard typing entry point.",
            }
        ]
    })
}

pub fn git_tag() -> &'static str {
    option_env!("YEONJANG_GIT_DESCRIBE").unwrap_or(env!("CARGO_PKG_VERSION"))
}

pub fn git_commit() -> &'static str {
    option_env!("YEONJANG_GIT_COMMIT").unwrap_or("unknown")
}

pub fn build_target() -> &'static str {
    option_env!("YEONJANG_BUILD_TARGET").unwrap_or("unknown")
}

fn now_unix_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| u64::try_from(duration.as_millis()).unwrap_or(u64::MAX))
        .unwrap_or_default()
}

fn capability_hash(flags: &AutomationCapabilities) -> String {
    format!(
        "{}:{}:{:?}:camera={}:exec={}:app={}:screen={}:mouse={}:keyboard={}:system={}",
        env!("CARGO_PKG_VERSION"),
        git_commit(),
        flags.platform,
        flags.camera_management,
        flags.command_execution,
        flags.application_launch,
        flags.screen_capture,
        flags.mouse_control,
        flags.keyboard_control,
        flags.system_control,
    )
}

fn capability_matrix(
    flags: &AutomationCapabilities,
    support_profile: &SupportProfileRuntimeInfo,
    last_checked_at: u64,
) -> Value {
    json!({
        "node.ping": capability_entry("node.ping", true, flags.platform, support_profile, last_checked_at),
        "node.capabilities": capability_entry("node.capabilities", true, flags.platform, support_profile, last_checked_at),
        "system.info": capability_entry("system.info", true, flags.platform, support_profile, last_checked_at),
        "file.metadata": capability_entry(
            "file.metadata",
            true,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "file.list": capability_entry(
            "file.list",
            true,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "file.read": capability_entry(
            "file.read",
            true,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "file.search": capability_entry(
            "file.search",
            true,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "file.write": capability_entry(
            "file.write",
            true,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "file.patch": capability_entry(
            "file.patch",
            true,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "file.delete": capability_entry(
            "file.delete",
            true,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "disk.info": capability_entry(
            "disk.info",
            true,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "disk.usage": capability_entry(
            "disk.usage",
            true,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "disk.exists": capability_entry(
            "disk.exists",
            true,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "process.list": capability_entry(
            "process.list",
            true,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "process.info": capability_entry(
            "process.info",
            true,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "browser.list": capability_entry(
            "browser.list",
            true,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "browser.active_hint": capability_entry(
            "browser.active_hint",
            true,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "browser.active_tab_info": capability_entry(
            "browser.active_tab_info",
            false,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "browser.open_url": capability_entry(
            "browser.open_url",
            true,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "browser.focus": capability_entry(
            "browser.focus",
            flags.application_launch,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "clipboard.read": capability_entry(
            "clipboard.read",
            true,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "clipboard.write": capability_entry(
            "clipboard.write",
            true,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "network.status": capability_entry(
            "network.status",
            true,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "device.status": capability_entry(
            "device.status",
            true,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "camera.list": capability_entry(
            "camera.list",
            flags.camera_management,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "camera.permission_status": capability_entry(
            "camera.permission_status",
            flags.camera_management,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "camera.capture": capability_entry(
            "camera.capture",
            flags.camera_management,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "system.control": capability_entry(
            "system.control",
            flags.system_control,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "system.exec": capability_entry(
            "system.exec",
            flags.command_execution,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "application.launch": capability_entry(
            "application.launch",
            flags.application_launch,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "screen.capture": capability_entry(
            "screen.capture",
            flags.screen_capture,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "mouse.position": capability_entry(
            "mouse.position",
            flags.mouse_control,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "input.focused_target": capability_entry(
            "input.focused_target",
            flags.keyboard_control,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "mouse.action": capability_entry(
            "mouse.action",
            flags.mouse_control,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "mouse.move": capability_entry(
            "mouse.move",
            flags.mouse_control,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "mouse.click": capability_entry(
            "mouse.click",
            flags.mouse_control,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "keyboard.action": capability_entry(
            "keyboard.action",
            flags.keyboard_control,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "keyboard.type": capability_entry(
            "keyboard.type",
            flags.keyboard_control,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
    })
}

#[derive(Debug, Clone)]
struct CapabilityMethodMetadata {
    supported: bool,
    known_limitations: Vec<&'static str>,
    output_modes: Vec<&'static str>,
    requires_interactive_desktop: bool,
    broadcast_safe: bool,
    default_target_policy: &'static str,
}

#[derive(Debug, Clone, Copy)]
struct CapabilityMethodClassification {
    group: &'static str,
    risk_level: &'static str,
    side_effect_class: &'static str,
}

fn method_classification(method: &str) -> CapabilityMethodClassification {
    method_descriptor(method)
        .map(|descriptor| CapabilityMethodClassification {
            group: descriptor.group,
            risk_level: descriptor.risk.as_str(),
            side_effect_class: descriptor.side_effect.as_str(),
        })
        .unwrap_or(CapabilityMethodClassification {
            group: "unknown",
            risk_level: "dangerous",
            side_effect_class: "unknown",
        })
}

fn capability_entry(
    method: &'static str,
    supported: bool,
    platform: PlatformKind,
    support_profile: &SupportProfileRuntimeInfo,
    last_checked_at: u64,
) -> Value {
    let baseline = method_metadata_for_platform(method, platform);
    let classification = method_classification(method);
    let descriptor = method_descriptor(method).expect("capability method must have a descriptor");
    let descriptor_permission = descriptor
        .permission
        .map(|permission| permission.as_setting_name());
    let platform_baseline = json!({
        "macos": platform_method_summary(method, PlatformKind::Macos),
        "windows": platform_method_summary(method, PlatformKind::Windows),
        "linux": platform_method_summary(method, PlatformKind::Linux),
    });
    let raw_payload_visibility = if method == "browser.active_tab_info" {
        "audit_only"
    } else {
        "public_safe"
    };
    let mut known_limitations = baseline.known_limitations.clone();
    let mut reason_codes = support_profile.reason_codes.clone();
    let support_state = if supported {
        "supported"
    } else if baseline.supported
        && baseline.requires_interactive_desktop
        && support_profile.effective_profile == SupportProfileKind::HeadlessManaged
    {
        known_limitations.push(
            "Current runtime profile is headless_managed, so interactive desktop methods are blocked.",
        );
        reason_codes.push("interactive_desktop_required".to_string());
        reason_codes.push("support_profile_restricted".to_string());
        "blocked_by_profile"
    } else {
        if baseline.supported {
            reason_codes.push("runtime_dependency_unavailable".to_string());
        } else {
            reason_codes.push("unsupported_on_platform".to_string());
        }
        "unsupported"
    };
    json!({
        "schemaVersion": YEONJANG_CAPABILITY_SCHEMA_VERSION,
        "group": classification.group,
        "riskLevel": classification.risk_level,
        "sideEffectClass": classification.side_effect_class,
        "supported": supported,
        "supportState": support_state,
        "requiresApproval": descriptor.requires_approval,
        "cancellable": descriptor.cancellable,
        "postCheckRequired": descriptor.post_check_required,
        "timeoutClass": descriptor.timeout.as_str(),
        "executorAvailable": descriptor.executor_available,
        "inputSchema": descriptor.params_schema.as_str(),
        "outputSchema": descriptor.result_schema.as_str(),
        "requiresPermission": descriptor_permission.is_some(),
        "permissionSetting": descriptor_permission,
        "knownLimitations": known_limitations,
        "requiresInteractiveDesktop": baseline.requires_interactive_desktop,
        "broadcastSafe": baseline.broadcast_safe,
        "defaultTargetPolicy": baseline.default_target_policy,
        "rawPayloadVisibility": raw_payload_visibility,
        "outputModes": baseline.output_modes,
        "reasonCodes": reason_codes,
        "platformBaseline": platform_baseline,
        "lastCheckedAt": last_checked_at,
    })
}

fn permissions_payload(permissions: &PermissionSettings) -> Value {
    json!({
        "allow_file_read": permissions.allow_file_read,
        "allow_file_write": permissions.allow_file_write,
        "allow_file_delete": permissions.allow_file_delete,
        "allow_disk_read": permissions.allow_disk_read,
        "allow_camera_access": permissions.allow_camera_access,
        "allow_clipboard_read": permissions.allow_clipboard_read,
        "allow_clipboard_write": permissions.allow_clipboard_write,
        "allow_process_read": permissions.allow_process_read,
        "allow_process_control": permissions.allow_process_control,
        "allow_browser_read": permissions.allow_browser_read,
        "allow_browser_control": permissions.allow_browser_control,
        "allow_network_read": permissions.allow_network_read,
        "allow_device_status": permissions.allow_device_status,
        "allow_system_control": permissions.allow_system_control,
        "allow_shell_exec": permissions.allow_shell_exec,
        "allow_application_launch": permissions.allow_application_launch,
        "allow_screen_capture": permissions.allow_screen_capture,
        "allow_keyboard_control": permissions.allow_keyboard_control,
        "allow_mouse_control": permissions.allow_mouse_control,
    })
}

fn tool_health(
    flags: &AutomationCapabilities,
    permissions: &PermissionSettings,
    support_profile: &SupportProfileRuntimeInfo,
    last_checked_at: u64,
) -> Value {
    json!({
        "node.ping": tool_health_entry(true, true, None, last_checked_at),
        "node.capabilities": tool_health_entry(true, true, None, last_checked_at),
        "system.info": tool_health_entry(true, true, None, last_checked_at),
        "file.metadata": tool_health_entry(true, permissions.allow_file_read, Some("allow_file_read"), last_checked_at),
        "file.list": tool_health_entry(true, permissions.allow_file_read, Some("allow_file_read"), last_checked_at),
        "file.read": tool_health_entry(true, permissions.allow_file_read, Some("allow_file_read"), last_checked_at),
        "file.search": tool_health_entry(true, permissions.allow_file_read, Some("allow_file_read"), last_checked_at),
        "file.write": tool_health_entry(true, permissions.allow_file_write, Some("allow_file_write"), last_checked_at),
        "file.patch": tool_health_entry(true, permissions.allow_file_write, Some("allow_file_write"), last_checked_at),
        "file.delete": tool_health_entry(true, permissions.allow_file_delete, Some("allow_file_delete"), last_checked_at),
        "disk.info": tool_health_entry(true, permissions.allow_disk_read, Some("allow_disk_read"), last_checked_at),
        "disk.usage": tool_health_entry(true, permissions.allow_disk_read, Some("allow_disk_read"), last_checked_at),
        "disk.exists": tool_health_entry(true, permissions.allow_disk_read, Some("allow_disk_read"), last_checked_at),
        "process.list": tool_health_entry(true, permissions.allow_process_read, Some("allow_process_read"), last_checked_at),
        "process.info": tool_health_entry(true, permissions.allow_process_read, Some("allow_process_read"), last_checked_at),
        "browser.list": tool_health_entry(true, permissions.allow_browser_read, Some("allow_browser_read"), last_checked_at),
        "browser.active_hint": tool_health_entry(true, permissions.allow_browser_read, Some("allow_browser_read"), last_checked_at),
        "browser.active_tab_info": browser_active_tab_info_tool_health_entry(flags.platform, permissions, support_profile, last_checked_at),
        "browser.open_url": tool_health_entry(true, permissions.allow_browser_control, Some("allow_browser_control"), last_checked_at),
        "browser.focus": tool_health_entry(flags.application_launch, permissions.allow_browser_control, Some("allow_browser_control"), last_checked_at),
        "clipboard.read": tool_health_entry(true, permissions.allow_clipboard_read, Some("allow_clipboard_read"), last_checked_at),
        "clipboard.write": tool_health_entry(true, permissions.allow_clipboard_write, Some("allow_clipboard_write"), last_checked_at),
        "network.status": tool_health_entry(true, permissions.allow_network_read, Some("allow_network_read"), last_checked_at),
        "device.status": tool_health_entry(true, permissions.allow_device_status, Some("allow_device_status"), last_checked_at),
        "camera.list": tool_health_entry(flags.camera_management, permissions.allow_camera_access, Some("allow_camera_access"), last_checked_at),
        "camera.permission_status": tool_health_entry(flags.camera_management, permissions.allow_camera_access, Some("allow_camera_access"), last_checked_at),
        "camera.capture": tool_health_entry(flags.camera_management, permissions.allow_camera_access, Some("allow_camera_access"), last_checked_at),
        "system.control": tool_health_entry(flags.system_control, permissions.allow_system_control, Some("allow_system_control"), last_checked_at),
        "system.exec": tool_health_entry(flags.command_execution, permissions.allow_shell_exec, Some("allow_shell_exec"), last_checked_at),
        "application.launch": tool_health_entry(flags.application_launch, permissions.allow_application_launch, Some("allow_application_launch"), last_checked_at),
        "screen.capture": tool_health_entry(flags.screen_capture, permissions.allow_screen_capture, Some("allow_screen_capture"), last_checked_at),
        "mouse.position": tool_health_entry(flags.mouse_control, permissions.allow_mouse_control, Some("allow_mouse_control"), last_checked_at),
        "input.focused_target": tool_health_entry(flags.keyboard_control, permissions.allow_keyboard_control, Some("allow_keyboard_control"), last_checked_at),
        "mouse.action": tool_health_entry(flags.mouse_control, permissions.allow_mouse_control, Some("allow_mouse_control"), last_checked_at),
        "mouse.move": tool_health_entry(flags.mouse_control, permissions.allow_mouse_control, Some("allow_mouse_control"), last_checked_at),
        "mouse.click": tool_health_entry(flags.mouse_control, permissions.allow_mouse_control, Some("allow_mouse_control"), last_checked_at),
        "keyboard.action": tool_health_entry(flags.keyboard_control, permissions.allow_keyboard_control, Some("allow_keyboard_control"), last_checked_at),
        "keyboard.type": tool_health_entry(flags.keyboard_control, permissions.allow_keyboard_control, Some("allow_keyboard_control"), last_checked_at),
    })
}

fn tool_health_entry(
    supported: bool,
    permission_allowed: bool,
    permission_setting: Option<&'static str>,
    last_checked_at: u64,
) -> Value {
    let status = if !supported {
        "unsupported"
    } else if !permission_allowed {
        "permission_disabled"
    } else {
        "ready"
    };
    json!({
        "status": status,
        "supported": supported,
        "permissionAllowed": permission_allowed,
        "permissionSetting": permission_setting,
        "lastCheckedAt": last_checked_at,
    })
}

fn browser_active_tab_info_tool_health_entry(
    platform: PlatformKind,
    permissions: &PermissionSettings,
    support_profile: &SupportProfileRuntimeInfo,
    last_checked_at: u64,
) -> Value {
    let (status, reason_code) = if support_profile.effective_profile
        == SupportProfileKind::HeadlessManaged
        || !support_profile.interactive_desktop_available
    {
        ("unsupported", "interactive_desktop_required")
    } else if !permissions.allow_browser_read {
        ("permission_disabled", "browser_read_permission_disabled")
    } else {
        ("unsupported", "active_tab_observation_backend_missing")
    };
    json!({
        "status": status,
        "supported": false,
        "permissionAllowed": permissions.allow_browser_read,
        "permissionSetting": "allow_browser_read",
        "lastCheckedAt": last_checked_at,
        "reasonCode": reason_code,
        "candidateBackendFamilies": active_tab_observation_backend_families(platform),
        "rawDetailsSchema": {
            "visibility": "audit_only",
            "required": ["browserName"],
            "optional": ["title", "url", "profileName", "profilePath", "pid", "windowId", "tabId"],
        },
    })
}

fn active_tab_observation_backend_families(platform: PlatformKind) -> Vec<&'static str> {
    match platform {
        PlatformKind::Macos => vec!["accessibility_api", "browser_extension_bridge"],
        PlatformKind::Windows => vec!["windows_ui_automation", "browser_extension_bridge"],
        PlatformKind::Linux => vec![
            "linux_accessibility_api",
            "browser_extension_bridge",
            "wayland_portal",
        ],
        PlatformKind::Unknown => vec![],
    }
}

#[cfg(test)]
fn capabilities() -> Value {
    let settings = load_settings().unwrap_or_else(|_| YeonjangSettings::default());
    capabilities_with_settings_and_backend(&settings, &crate::platform::CurrentBackend)
}

fn runtime_capabilities_with_backend(
    support_profile: &SupportProfileRuntimeInfo,
    backend: &dyn AutomationBackend,
) -> AutomationCapabilities {
    runtime_capabilities_with_snapshot(support_profile, backend.capabilities())
}

fn runtime_capabilities_with_snapshot(
    support_profile: &SupportProfileRuntimeInfo,
    mut capability_flags: AutomationCapabilities,
) -> AutomationCapabilities {
    if support_profile.effective_profile == SupportProfileKind::HeadlessManaged {
        capability_flags.application_launch = false;
        capability_flags.screen_capture = false;
        capability_flags.mouse_control = false;
        capability_flags.keyboard_control = false;
    }
    capability_flags
}

fn ensure_permission(allowed: bool, method: &str, setting: &str) -> Result<()> {
    if allowed {
        Ok(())
    } else {
        anyhow::bail!(
            "permission denied: `{method}` is disabled in Yeonjang permissions ({setting})"
        )
    }
}

fn ensure_runtime_support(
    supported: bool,
    method: &str,
    support_profile: &SupportProfileRuntimeInfo,
) -> Result<()> {
    if supported {
        return Ok(());
    }
    if support_profile.effective_profile == SupportProfileKind::HeadlessManaged {
        anyhow::bail!(
            "`{method}` is blocked for the current support profile (`{}`); interactive desktop access is unavailable",
            support_profile.effective_profile.as_str()
        );
    }
    anyhow::bail!("`{method}` is not supported on this Yeonjang runtime")
}

fn platform_method_summary(method: &'static str, platform: PlatformKind) -> Value {
    let metadata = method_metadata_for_platform(method, platform);
    json!({
        "supported": metadata.supported,
        "knownLimitations": metadata.known_limitations,
        "outputModes": metadata.output_modes,
        "requiresInteractiveDesktop": metadata.requires_interactive_desktop,
    })
}

fn method_metadata_for_platform(
    method: &'static str,
    platform: PlatformKind,
) -> CapabilityMethodMetadata {
    match method {
        "node.ping" | "node.capabilities" | "system.info" => CapabilityMethodMetadata {
            supported: true,
            known_limitations: vec![],
            output_modes: vec!["json"],
            requires_interactive_desktop: false,
            broadcast_safe: true,
            default_target_policy: "local_preferred",
        },
        "file.metadata" => CapabilityMethodMetadata {
            supported: true,
            known_limitations: vec![],
            output_modes: vec!["json"],
            requires_interactive_desktop: false,
            broadcast_safe: true,
            default_target_policy: "exact_instance",
        },
        "file.list" => CapabilityMethodMetadata {
            supported: true,
            known_limitations: vec![],
            output_modes: vec!["json"],
            requires_interactive_desktop: false,
            broadcast_safe: true,
            default_target_policy: "exact_instance",
        },
        "file.read" => CapabilityMethodMetadata {
            supported: true,
            known_limitations: vec![
                "file.read currently returns UTF-8 text and truncation metadata.",
            ],
            output_modes: vec!["utf8"],
            requires_interactive_desktop: false,
            broadcast_safe: true,
            default_target_policy: "exact_instance",
        },
        "file.search" => CapabilityMethodMetadata {
            supported: true,
            known_limitations: vec![
                "file.search currently scans UTF-8 text and returns bounded match previews, not full file content.",
            ],
            output_modes: vec!["json"],
            requires_interactive_desktop: false,
            broadcast_safe: true,
            default_target_policy: "exact_instance",
        },
        "file.write" => CapabilityMethodMetadata {
            supported: true,
            known_limitations: vec![
                "file.write currently supports UTF-8 text only and refuses overwrite unless requested.",
            ],
            output_modes: vec!["json"],
            requires_interactive_desktop: false,
            broadcast_safe: false,
            default_target_policy: "exact_instance",
        },
        "file.patch" => CapabilityMethodMetadata {
            supported: true,
            known_limitations: vec![
                "file.patch currently supports exact single-match UTF-8 text replacement only.",
            ],
            output_modes: vec!["json"],
            requires_interactive_desktop: false,
            broadcast_safe: false,
            default_target_policy: "exact_instance",
        },
        "file.delete" => CapabilityMethodMetadata {
            supported: true,
            known_limitations: vec![
                "file.delete currently supports files and empty directories only.",
            ],
            output_modes: vec!["json"],
            requires_interactive_desktop: false,
            broadcast_safe: false,
            default_target_policy: "exact_instance",
        },
        "disk.info" | "disk.usage" | "disk.exists" => CapabilityMethodMetadata {
            supported: true,
            known_limitations: vec![],
            output_modes: vec!["json"],
            requires_interactive_desktop: false,
            broadcast_safe: true,
            default_target_policy: "exact_instance",
        },
        "process.list" | "process.info" => CapabilityMethodMetadata {
            supported: true,
            known_limitations: vec![
                "process read capabilities omit command line, cwd, and environment fields by default.",
            ],
            output_modes: vec!["json"],
            requires_interactive_desktop: false,
            broadcast_safe: true,
            default_target_policy: "exact_instance",
        },
        "browser.list" | "browser.active_hint" => CapabilityMethodMetadata {
            supported: true,
            known_limitations: vec![
                "browser discovery uses process-name candidates and does not inspect tabs, URLs, titles, profiles, command lines, cwd, or environment fields.",
            ],
            output_modes: vec!["json"],
            requires_interactive_desktop: false,
            broadcast_safe: true,
            default_target_policy: "exact_instance",
        },
        "browser.active_tab_info" => CapabilityMethodMetadata {
            supported: platform != PlatformKind::Unknown,
            known_limitations: vec![
                "browser.active_tab_info requires explicit approval, browser read permission, and an interactive desktop session.",
                "browser.active_tab_info raw active tab title and URL are audit-only; public output must use hash and length fields.",
                "browser.active_tab_info must not read browser profile files or use system.exec as a fallback.",
            ],
            output_modes: vec!["json"],
            requires_interactive_desktop: true,
            broadcast_safe: false,
            default_target_policy: "exact_instance",
        },
        "browser.open_url" => CapabilityMethodMetadata {
            supported: true,
            known_limitations: vec![
                "browser.open_url only accepts http and https URLs.",
                "browser.open_url confirms that the platform launcher accepted the command; final user goal validation must be performed by Knowbee.",
            ],
            output_modes: vec!["json"],
            requires_interactive_desktop: true,
            broadcast_safe: false,
            default_target_policy: "exact_instance",
        },
        "browser.focus" => CapabilityMethodMetadata {
            supported: platform != PlatformKind::Unknown,
            known_limitations: vec![
                "browser.focus requires explicit approval, browser control permission, and an interactive desktop session.",
                "browser.focus prepares dispatch only; focused target observation must verify the user goal before success is reported.",
            ],
            output_modes: vec!["json"],
            requires_interactive_desktop: true,
            broadcast_safe: false,
            default_target_policy: "exact_instance",
        },
        "clipboard.read" => CapabilityMethodMetadata {
            supported: true,
            known_limitations: vec![
                "clipboard.read returns raw clipboard text only in the direct tool output; evidence and details must use metadata only.",
            ],
            output_modes: vec!["utf8", "json"],
            requires_interactive_desktop: false,
            broadcast_safe: false,
            default_target_policy: "exact_instance",
        },
        "clipboard.write" => CapabilityMethodMetadata {
            supported: true,
            known_limitations: vec![
                "clipboard.write supports UTF-8 text only and verifies the final clipboard state by reading metadata after write.",
                "clipboard.write raw input must not be persisted in evidence, logs, or default UI projections.",
            ],
            output_modes: vec!["json"],
            requires_interactive_desktop: false,
            broadcast_safe: false,
            default_target_policy: "exact_instance",
        },
        "network.status" => CapabilityMethodMetadata {
            supported: true,
            known_limitations: vec![
                "network.status reads local interface counters only and does not perform external probes.",
            ],
            output_modes: vec!["json"],
            requires_interactive_desktop: false,
            broadcast_safe: true,
            default_target_policy: "exact_instance",
        },
        "device.status" => CapabilityMethodMetadata {
            supported: true,
            known_limitations: vec![
                "device.status returns resource support and permission summaries without internal identifiers or raw configured paths.",
            ],
            output_modes: vec!["json"],
            requires_interactive_desktop: false,
            broadcast_safe: true,
            default_target_policy: "exact_instance",
        },
        "camera.list" | "camera.permission_status" => CapabilityMethodMetadata {
            supported: true,
            known_limitations: match platform {
                PlatformKind::Linux => vec![
                    "Linux camera list uses v4l2-ctl when available and otherwise scans /dev/video*.",
                ],
                _ => vec![],
            },
            output_modes: vec!["json"],
            requires_interactive_desktop: false,
            broadcast_safe: true,
            default_target_policy: "local_preferred",
        },
        "camera.capture" => CapabilityMethodMetadata {
            supported: true,
            known_limitations: match platform {
                PlatformKind::Macos => vec![
                    "iPhone Continuity Camera front/rear lens selection is not exposed to Yeonjang.",
                ],
                PlatformKind::Linux => vec![
                    "Linux camera capture depends on v4l2 devices and ffmpeg or fswebcam availability.",
                ],
                PlatformKind::Windows => vec![
                    "Windows camera capture opens the native camera flow when a device_id is not specified.",
                ],
                PlatformKind::Unknown => vec![],
            },
            output_modes: vec!["base64", "file"],
            requires_interactive_desktop: false,
            broadcast_safe: false,
            default_target_policy: "exact_instance",
        },
        "system.control" => CapabilityMethodMetadata {
            supported: true,
            known_limitations: match platform {
                PlatformKind::Linux => vec![
                    "Linux system control depends on systemctl/loginctl availability and session permissions.",
                ],
                _ => vec![],
            },
            output_modes: vec!["json"],
            requires_interactive_desktop: false,
            broadcast_safe: false,
            default_target_policy: "exact_instance",
        },
        "system.exec" => CapabilityMethodMetadata {
            supported: true,
            known_limitations: vec![],
            output_modes: vec!["stdout", "stderr", "exit_code"],
            requires_interactive_desktop: false,
            broadcast_safe: false,
            default_target_policy: "exact_instance",
        },
        "application.launch" => CapabilityMethodMetadata {
            supported: true,
            known_limitations: vec![],
            output_modes: vec!["json"],
            requires_interactive_desktop: true,
            broadcast_safe: false,
            default_target_policy: "exact_instance",
        },
        "screen.capture" => CapabilityMethodMetadata {
            supported: true,
            known_limitations: match platform {
                PlatformKind::Macos => vec![
                    "Gateway display indexes are zero-based; Yeonjang translates them to macOS screencapture one-based indexes.",
                ],
                PlatformKind::Linux => vec![
                    "Linux screen.capture currently captures the current full screen only; display index selection is unsupported.",
                ],
                PlatformKind::Windows => vec!["Display indexes are zero-based."],
                PlatformKind::Unknown => vec!["Display indexes are zero-based."],
            },
            output_modes: vec!["base64", "file"],
            requires_interactive_desktop: true,
            broadcast_safe: true,
            default_target_policy: "local_preferred",
        },
        "mouse.position" => CapabilityMethodMetadata {
            supported: true,
            known_limitations: match platform {
                PlatformKind::Linux => {
                    vec!["Linux mouse position observation requires xdotool in PATH."]
                }
                _ => vec![],
            },
            output_modes: vec!["json"],
            requires_interactive_desktop: true,
            broadcast_safe: true,
            default_target_policy: "local_preferred",
        },
        "input.focused_target" => CapabilityMethodMetadata {
            supported: true,
            known_limitations: match platform {
                PlatformKind::Linux => {
                    vec!["Linux focused target observation requires xdotool in PATH."]
                }
                PlatformKind::Macos => {
                    vec!["macOS focused target observation returns frontmost application only."]
                }
                _ => vec![],
            },
            output_modes: vec!["json"],
            requires_interactive_desktop: true,
            broadcast_safe: true,
            default_target_policy: "local_preferred",
        },
        "mouse.action" | "mouse.move" | "mouse.click" => CapabilityMethodMetadata {
            supported: true,
            known_limitations: match platform {
                PlatformKind::Linux => vec!["Linux mouse control requires xdotool in PATH."],
                _ => vec![],
            },
            output_modes: vec!["json"],
            requires_interactive_desktop: true,
            broadcast_safe: false,
            default_target_policy: "exact_instance",
        },
        "keyboard.action" | "keyboard.type" => CapabilityMethodMetadata {
            supported: true,
            known_limitations: match platform {
                PlatformKind::Linux => vec!["Linux keyboard control requires xdotool in PATH."],
                _ => vec![],
            },
            output_modes: vec!["json"],
            requires_interactive_desktop: true,
            broadcast_safe: false,
            default_target_policy: "exact_instance",
        },
        _ => CapabilityMethodMetadata {
            supported: false,
            known_limitations: vec!["This method is not part of the Yeonjang baseline matrix."],
            output_modes: vec!["json"],
            requires_interactive_desktop: false,
            broadcast_safe: false,
            default_target_policy: "exact_instance",
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn camera_timeout_is_projected_as_a_bounded_protocol_error() {
        let error = anyhow::Error::new(crate::automation::CameraCaptureProcessError::timed_out());

        let (code, message) = classify_request_error(&error);

        assert_eq!(code, "camera_helper_timeout");
        assert_eq!(message, "Camera capture timed out before completion.");
        assert!(!message.contains('/'));
    }

    #[test]
    fn camera_timeout_response_carries_the_exact_command_attempt_binding() {
        let request = Request {
            id: Some("delivery-1".to_string()),
            method: "camera.capture".to_string(),
            params: json!({}),
            metadata: crate::protocol::RequestMetadata {
                command_id: Some("command-1".to_string()),
                operation_id: Some("operation-1".to_string()),
                target_fingerprint: Some(
                    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                        .to_string(),
                ),
                ..Default::default()
            },
        };
        let error = anyhow::Error::new(crate::automation::CameraCaptureProcessError::timed_out());

        let response = error_response_for_request(&request, &error);

        assert_eq!(
            response.error.as_ref().map(|error| error.code.as_str()),
            Some("camera_helper_timeout")
        );
        let attempt = response.attempt.expect("typed attempt evidence");
        assert_eq!(attempt.command_id, "command-1");
        assert_eq!(attempt.operation_id.as_deref(), Some("operation-1"));
        assert!(matches!(
            attempt.terminal_stage,
            crate::protocol::CommandAttemptTerminalStage::HelperTimeout
        ));
    }

    #[test]
    fn camera_permission_denial_is_a_typed_rejection_not_a_helper_timeout() {
        let request = Request {
            id: Some("delivery-1".to_string()),
            method: "camera.capture".to_string(),
            params: json!({}),
            metadata: crate::protocol::RequestMetadata {
                command_id: Some("command-1".to_string()),
                ..Default::default()
            },
        };
        let error =
            anyhow::Error::new(crate::automation::CameraCaptureProcessError::permission_denied());

        let response = error_response_for_request(&request, &error);

        assert_eq!(
            response.error.as_ref().map(|error| error.code.as_str()),
            Some("camera_permission_denied")
        );
        assert!(matches!(
            response.attempt.expect("typed attempt").terminal_stage,
            crate::protocol::CommandAttemptTerminalStage::Rejected
        ));
    }

    #[test]
    fn request_handling_uses_the_explicit_startup_settings_snapshot() {
        let mut settings = YeonjangSettings::default();
        settings.permissions.allow_browser_control = false;

        let response = handle_request_with_settings(
            Request {
                id: Some("snapshot-settings".to_string()),
                method: "node.capabilities".to_string(),
                params: json!({}),
                metadata: Default::default(),
            },
            settings,
        );

        assert!(response.ok);
        assert_eq!(
            response
                .result
                .as_ref()
                .expect("capabilities response must include a result")["permissions"]["allow_browser_control"],
            Value::Bool(false)
        );
    }

    #[test]
    fn capability_entry_exposes_platform_baseline_and_target_policy() {
        let runtime = SupportProfileRuntimeInfo {
            configured_profile: SupportProfileKind::DesktopInteractive,
            effective_profile: SupportProfileKind::DesktopInteractive,
            interactive_desktop_available: true,
            tray_runtime_available: true,
            reason_codes: vec!["tray_runtime_visible".to_string()],
        };

        let entry = capability_entry("screen.capture", true, PlatformKind::Linux, &runtime, 42);

        assert_eq!(entry["supported"], Value::Bool(true));
        assert_eq!(entry["requiresInteractiveDesktop"], Value::Bool(true));
        assert_eq!(entry["broadcastSafe"], Value::Bool(true));
        assert_eq!(
            entry["defaultTargetPolicy"],
            Value::String("local_preferred".to_string())
        );
        assert!(
            entry["platformBaseline"]["macos"]["supported"]
                .as_bool()
                .unwrap_or(false)
        );
        assert!(
            entry["platformBaseline"]["windows"]["supported"]
                .as_bool()
                .unwrap_or(false)
        );
        assert!(
            entry["platformBaseline"]["linux"]["supported"]
                .as_bool()
                .unwrap_or(false)
        );
    }

    #[test]
    fn capability_entry_exposes_schema_group_risk_and_side_effect() {
        let runtime = SupportProfileRuntimeInfo {
            configured_profile: SupportProfileKind::DesktopInteractive,
            effective_profile: SupportProfileKind::DesktopInteractive,
            interactive_desktop_available: true,
            tray_runtime_available: true,
            reason_codes: vec!["tray_runtime_visible".to_string()],
        };

        let screen = capability_entry("screen.capture", true, PlatformKind::Macos, &runtime, 42);
        assert_eq!(screen["schemaVersion"], Value::Number(1.into()));
        assert_eq!(screen["group"], Value::String("screen".to_string()));
        assert_eq!(screen["riskLevel"], Value::String("moderate".to_string()));
        assert_eq!(
            screen["sideEffectClass"],
            Value::String("screen_read".to_string())
        );

        let command = capability_entry("system.exec", true, PlatformKind::Macos, &runtime, 42);
        assert_eq!(command["group"], Value::String("command".to_string()));
        assert_eq!(command["riskLevel"], Value::String("dangerous".to_string()));
        assert_eq!(
            command["sideEffectClass"],
            Value::String("system_control".to_string())
        );
    }

    #[test]
    fn capabilities_payload_exposes_capability_schema_version() {
        let payload = capabilities();

        assert_eq!(payload["capabilitySchemaVersion"], Value::Number(1.into()));
    }

    #[test]
    fn capability_advertisement_exactly_matches_the_canonical_method_inventory() {
        let payload = capabilities();
        let advertised = payload["methods"]
            .as_array()
            .expect("capabilities methods")
            .iter()
            .filter_map(|entry| entry["name"].as_str())
            .collect::<std::collections::BTreeSet<_>>();
        let matrix = payload["capabilityMatrix"]
            .as_object()
            .expect("capability matrix")
            .keys()
            .map(String::as_str)
            .collect::<std::collections::BTreeSet<_>>();
        let health = payload["toolHealth"]
            .as_object()
            .expect("tool health")
            .keys()
            .map(String::as_str)
            .collect::<std::collections::BTreeSet<_>>();
        let canonical = crate::method_descriptor::all_method_names()
            .iter()
            .copied()
            .collect::<std::collections::BTreeSet<_>>();

        assert_eq!(advertised, canonical);
        assert_eq!(matrix, canonical);
        assert_eq!(health, canonical);
        for method in crate::method_descriptor::all_method_names() {
            let descriptor =
                crate::method_descriptor::method_descriptor(method).expect("descriptor");
            let entry = &payload["capabilityMatrix"][method];
            let listed = payload["methods"]
                .as_array()
                .expect("methods")
                .iter()
                .find(|listed| listed["name"] == **method)
                .expect("listed method");
            assert_eq!(entry["requiresApproval"], descriptor.requires_approval);
            assert_eq!(entry["cancellable"], descriptor.cancellable);
            assert_eq!(entry["postCheckRequired"], descriptor.post_check_required);
            assert_eq!(entry["timeoutClass"], descriptor.timeout.as_str());
            assert_eq!(
                entry["permissionSetting"],
                descriptor
                    .permission
                    .map(|permission| Value::String(permission.as_setting_name().to_string()))
                    .unwrap_or(Value::Null)
            );
            assert_eq!(listed["implemented"], entry["supported"]);
            if !descriptor.executor_available {
                assert_eq!(entry["supported"], Value::Bool(false));
            }
        }
    }

    #[test]
    fn unknown_executor_method_returns_a_typed_fail_closed_error() {
        let response = handle_request_with_settings(
            Request {
                id: Some("unknown-method".to_string()),
                method: "unknown.method".to_string(),
                params: json!({}),
                metadata: Default::default(),
            },
            YeonjangSettings::default(),
        );

        assert!(!response.ok);
        assert_eq!(
            response.error.as_ref().map(|error| error.code.as_str()),
            Some("unknown_method")
        );
        assert_eq!(
            response.error.as_ref().map(|error| error.message.as_str()),
            Some("The requested method is not supported.")
        );
    }

    #[test]
    fn every_canonical_method_has_an_explicit_executor_or_unavailable_outcome() {
        for method in crate::method_descriptor::all_method_names() {
            let descriptor =
                crate::method_descriptor::method_descriptor(method).expect("descriptor");
            let response = handle_request_with_settings(
                Request {
                    id: Some(format!("route-{method}")),
                    method: method.to_string(),
                    params: json!({}),
                    metadata: Default::default(),
                },
                YeonjangSettings::default(),
            );
            let code = response.error.as_ref().map(|error| error.code.as_str());
            if descriptor.executor_available {
                assert_ne!(
                    code,
                    Some("unknown_method"),
                    "`{method}` has no executor route"
                );
                assert_ne!(
                    code,
                    Some("method_unavailable"),
                    "`{method}` is marked executable but routed as unavailable"
                );
            } else {
                assert_eq!(
                    code,
                    Some("method_unavailable"),
                    "`{method}` must fail with the explicit unavailable contract"
                );
            }
        }
    }

    #[test]
    fn capabilities_payload_keeps_resource_method_inventory_consistent() {
        let payload = capabilities();
        let methods = payload["methods"]
            .as_array()
            .expect("capabilities methods must be an array");
        let matrix = payload["capabilityMatrix"]
            .as_object()
            .expect("capabilityMatrix must be an object");
        let tool_health_payload = payload["toolHealth"]
            .as_object()
            .expect("toolHealth must be an object");
        let permissions = payload["permissions"]
            .as_object()
            .expect("permissions must be an object");

        let required_methods = [
            (
                "file.metadata",
                "file",
                "allow_file_read",
                "safe",
                "read_local",
            ),
            ("file.list", "file", "allow_file_read", "safe", "read_local"),
            ("file.read", "file", "allow_file_read", "safe", "read_local"),
            (
                "file.search",
                "file",
                "allow_file_read",
                "safe",
                "read_local",
            ),
            (
                "file.write",
                "file",
                "allow_file_write",
                "moderate",
                "write_local",
            ),
            (
                "file.patch",
                "file",
                "allow_file_write",
                "moderate",
                "write_local",
            ),
            (
                "file.delete",
                "file",
                "allow_file_delete",
                "dangerous",
                "delete_local",
            ),
            ("disk.info", "disk", "allow_disk_read", "safe", "read_local"),
            (
                "disk.usage",
                "disk",
                "allow_disk_read",
                "safe",
                "read_local",
            ),
            (
                "disk.exists",
                "disk",
                "allow_disk_read",
                "safe",
                "read_local",
            ),
            (
                "process.list",
                "process",
                "allow_process_read",
                "safe",
                "read_local",
            ),
            (
                "process.info",
                "process",
                "allow_process_read",
                "safe",
                "read_local",
            ),
            (
                "browser.list",
                "browser",
                "allow_browser_read",
                "safe",
                "read_local",
            ),
            (
                "browser.active_hint",
                "browser",
                "allow_browser_read",
                "safe",
                "read_local",
            ),
            (
                "browser.active_tab_info",
                "browser",
                "allow_browser_read",
                "moderate",
                "read_local",
            ),
            (
                "browser.focus",
                "browser",
                "allow_browser_control",
                "moderate",
                "process_control",
            ),
            (
                "camera.list",
                "camera",
                "allow_camera_access",
                "safe",
                "read_local",
            ),
            (
                "camera.permission_status",
                "camera",
                "allow_camera_access",
                "safe",
                "read_local",
            ),
            (
                "camera.capture",
                "camera",
                "allow_camera_access",
                "moderate",
                "screen_read",
            ),
            (
                "mouse.position",
                "mouse",
                "allow_mouse_control",
                "safe",
                "read_local",
            ),
            (
                "input.focused_target",
                "input",
                "allow_keyboard_control",
                "safe",
                "read_local",
            ),
        ];

        for (method, category, permission_setting, risk_level, side_effect_class) in
            required_methods
        {
            let method_entry = methods
                .iter()
                .find(|entry| entry["name"] == Value::String(method.to_string()))
                .unwrap_or_else(|| panic!("methods is missing {method}"));
            let matrix_entry = matrix
                .get(method)
                .unwrap_or_else(|| panic!("capabilityMatrix is missing {method}"));
            let health_entry = tool_health_payload
                .get(method)
                .unwrap_or_else(|| panic!("toolHealth is missing {method}"));

            assert_eq!(
                method_entry["category"],
                Value::String(category.to_string()),
                "{method} category drifted"
            );
            assert_eq!(
                matrix_entry["permissionSetting"],
                Value::String(permission_setting.to_string()),
                "{method} capability permission setting drifted"
            );
            assert_eq!(
                health_entry["permissionSetting"],
                Value::String(permission_setting.to_string()),
                "{method} tool health permission setting drifted"
            );
            assert!(
                permissions.contains_key(permission_setting),
                "permissions payload is missing {permission_setting} for {method}"
            );
            assert_eq!(
                matrix_entry["riskLevel"],
                Value::String(risk_level.to_string()),
                "{method} risk level drifted"
            );
            assert_eq!(
                matrix_entry["sideEffectClass"],
                Value::String(side_effect_class.to_string()),
                "{method} side effect class drifted"
            );
            assert_eq!(
                method_entry["implemented"], matrix_entry["supported"],
                "{method} methods.implemented must match capabilityMatrix.supported"
            );
        }
    }

    #[test]
    fn browser_active_tab_info_capability_payload_exposes_contract_without_dispatch() {
        let payload = capabilities();
        let methods = payload["methods"]
            .as_array()
            .expect("capabilities methods must be an array");
        let matrix = payload["capabilityMatrix"]
            .as_object()
            .expect("capabilityMatrix must be an object");
        let tool_health_payload = payload["toolHealth"]
            .as_object()
            .expect("toolHealth must be an object");
        let permissions = payload["permissions"]
            .as_object()
            .expect("permissions must be an object");
        let method_entry = methods
            .iter()
            .find(|entry| entry["name"] == Value::String("browser.active_tab_info".to_string()))
            .expect("browser.active_tab_info must be advertised in methods inventory");
        let matrix_entry = matrix
            .get("browser.active_tab_info")
            .expect("browser.active_tab_info must be advertised in capabilityMatrix");
        let health_entry = tool_health_payload
            .get("browser.active_tab_info")
            .expect("browser.active_tab_info must be advertised in toolHealth");

        assert_eq!(method_entry["implemented"], Value::Bool(false));
        assert_eq!(matrix_entry["supported"], Value::Bool(false));
        assert_eq!(
            matrix_entry["permissionSetting"],
            Value::String("allow_browser_read".to_string())
        );
        assert_eq!(
            matrix_entry["riskLevel"],
            Value::String("moderate".to_string())
        );
        assert_eq!(
            matrix_entry["sideEffectClass"],
            Value::String("read_local".to_string())
        );
        assert_eq!(matrix_entry["requiresApproval"], Value::Bool(true));
        assert_eq!(
            matrix_entry["requiresInteractiveDesktop"],
            Value::Bool(true)
        );
        assert_eq!(matrix_entry["broadcastSafe"], Value::Bool(false));
        assert_eq!(
            matrix_entry["defaultTargetPolicy"],
            Value::String("exact_instance".to_string())
        );
        assert_eq!(
            matrix_entry["rawPayloadVisibility"],
            Value::String("audit_only".to_string())
        );
        assert_eq!(
            health_entry["status"],
            Value::String("permission_disabled".to_string())
        );
        assert_eq!(
            health_entry["reasonCode"],
            Value::String("browser_read_permission_disabled".to_string())
        );
        assert!(
            health_entry["candidateBackendFamilies"]
                .as_array()
                .expect("candidate backend families must be an array")
                .iter()
                .all(|value| matches!(
                    value.as_str().unwrap_or_default(),
                    "accessibility_api"
                        | "browser_extension_bridge"
                        | "windows_ui_automation"
                        | "linux_accessibility_api"
                        | "wayland_portal"
                ))
        );
        assert_eq!(
            health_entry["permissionSetting"],
            Value::String("allow_browser_read".to_string())
        );
        assert!(
            permissions.contains_key("allow_browser_read"),
            "browser.active_tab_info will use allow_browser_read when it is implemented"
        );

        let runtime = browser_focus_support_profile();
        let flags = AutomationCapabilities {
            platform: PlatformKind::Macos,
            camera_management: true,
            command_execution: true,
            application_launch: true,
            screen_capture: true,
            mouse_control: true,
            keyboard_control: true,
            system_control: true,
        };
        let health_with_permission =
            tool_health(&flags, &browser_read_permissions(true), &runtime, 42);
        assert_eq!(
            health_with_permission["browser.active_tab_info"]["status"],
            Value::String("unsupported".to_string())
        );
        assert_eq!(
            health_with_permission["browser.active_tab_info"]["reasonCode"],
            Value::String("active_tab_observation_backend_missing".to_string())
        );
    }

    #[test]
    fn browser_active_tab_info_capability_entry_fixture_exposes_sensitive_read_contract() {
        let runtime = SupportProfileRuntimeInfo {
            configured_profile: SupportProfileKind::DesktopInteractive,
            effective_profile: SupportProfileKind::DesktopInteractive,
            interactive_desktop_available: true,
            tray_runtime_available: true,
            reason_codes: vec!["tray_runtime_visible".to_string()],
        };

        let entry = capability_entry(
            "browser.active_tab_info",
            true,
            PlatformKind::Macos,
            &runtime,
            42,
        );

        assert_eq!(entry["group"], Value::String("browser".to_string()));
        assert_eq!(entry["riskLevel"], Value::String("moderate".to_string()));
        assert_eq!(
            entry["sideEffectClass"],
            Value::String("read_local".to_string())
        );
        assert_eq!(
            entry["permissionSetting"],
            Value::String("allow_browser_read".to_string())
        );
        assert_eq!(entry["requiresApproval"], Value::Bool(true));
        assert_eq!(entry["requiresInteractiveDesktop"], Value::Bool(true));
        assert_eq!(entry["broadcastSafe"], Value::Bool(false));
        assert_eq!(
            entry["defaultTargetPolicy"],
            Value::String("exact_instance".to_string())
        );
        assert_eq!(
            entry["rawPayloadVisibility"],
            Value::String("audit_only".to_string())
        );
        assert!(
            entry["knownLimitations"]
                .as_array()
                .into_iter()
                .flatten()
                .any(|value| value
                    .as_str()
                    .unwrap_or_default()
                    .contains("raw active tab title and URL are audit-only"))
        );
    }

    #[test]
    fn capability_entry_marks_interactive_methods_blocked_in_headless_profile() {
        let runtime = SupportProfileRuntimeInfo {
            configured_profile: SupportProfileKind::DesktopInteractive,
            effective_profile: SupportProfileKind::HeadlessManaged,
            interactive_desktop_available: false,
            tray_runtime_available: false,
            reason_codes: vec!["interactive_desktop_unavailable".to_string()],
        };

        let entry = capability_entry("screen.capture", false, PlatformKind::Linux, &runtime, 42);

        assert_eq!(
            entry["supportState"],
            Value::String("blocked_by_profile".to_string())
        );
        assert_eq!(entry["supported"], Value::Bool(false));
        assert!(
            entry["reasonCodes"]
                .as_array()
                .into_iter()
                .flatten()
                .any(|value| value == "support_profile_restricted")
        );
    }

    #[test]
    fn tool_health_prefers_permission_disabled_over_ready() {
        let entry = tool_health_entry(true, false, Some("allow_shell_exec"), 42);
        assert_eq!(
            entry["status"],
            Value::String("permission_disabled".to_string())
        );
    }

    #[test]
    fn permission_payload_exposes_fail_closed_resource_permissions() {
        let permissions = PermissionSettings::default();
        let payload = permissions_payload(&permissions);

        for key in [
            "allow_file_read",
            "allow_file_write",
            "allow_file_delete",
            "allow_disk_read",
            "allow_camera_access",
            "allow_clipboard_read",
            "allow_clipboard_write",
            "allow_process_read",
            "allow_process_control",
            "allow_browser_read",
            "allow_browser_control",
            "allow_network_read",
            "allow_device_status",
        ] {
            assert!(
                payload.get(key).is_some(),
                "permissions payload is missing {key}"
            );
        }
        for key in [
            "allow_camera_access",
            "allow_file_write",
            "allow_process_control",
            "allow_system_control",
            "allow_shell_exec",
            "allow_application_launch",
            "allow_screen_capture",
            "allow_keyboard_control",
            "allow_mouse_control",
        ] {
            assert_eq!(payload[key], Value::Bool(false), "{key} must fail closed");
        }
    }

    #[test]
    fn browser_focus_capability_payload_exposes_desktop_control_contract() {
        let runtime = browser_focus_support_profile();
        let mut flags = AutomationCapabilities {
            platform: PlatformKind::Macos,
            camera_management: true,
            command_execution: true,
            application_launch: true,
            screen_capture: true,
            mouse_control: true,
            keyboard_control: true,
            system_control: true,
        };
        let permissions = browser_focus_permissions(true);
        let matrix = capability_matrix(&flags, &runtime, 42);
        let health = tool_health(&flags, &permissions, &runtime, 42);

        assert_eq!(
            matrix["browser.focus"]["permissionSetting"],
            Value::String("allow_browser_control".to_string())
        );
        assert_eq!(
            matrix["browser.focus"]["riskLevel"],
            Value::String("moderate".to_string())
        );
        assert_eq!(
            matrix["browser.focus"]["sideEffectClass"],
            Value::String("process_control".to_string())
        );
        assert_eq!(
            matrix["browser.focus"]["requiresInteractiveDesktop"],
            Value::Bool(true)
        );
        assert_eq!(matrix["browser.focus"]["broadcastSafe"], Value::Bool(false));
        assert_eq!(
            matrix["browser.focus"]["defaultTargetPolicy"],
            Value::String("exact_instance".to_string())
        );
        assert_eq!(
            health["browser.focus"]["status"],
            Value::String("ready".to_string())
        );

        flags.application_launch = false;
        let unsupported_health = tool_health(&flags, &permissions, &runtime, 42);
        assert_eq!(
            unsupported_health["browser.focus"]["status"],
            Value::String("unsupported".to_string())
        );
    }

    fn browser_focus_target_fixture() -> Value {
        json!({
            "schemaVersion": "yeonjang-browser-focus-target-v1",
            "targetKind": "browser_window_or_tab",
            "targetAlias": "업무 브라우저",
            "displayName": "업무 브라우저",
            "processName": "Google Chrome",
            "titleHash": "title-hash",
            "titleLength": 21,
            "urlScheme": "https",
            "urlHash": "url-hash",
            "urlLength": 40,
            "auditOnlyFields": ["rawTitle", "rawUrl", "pid", "windowId", "tabId"],
            "rawTitle": "Private Admin Console",
            "rawUrl": "https://example.test/admin?token=private",
            "pid": 4401,
            "windowId": "window-private",
            "tabId": "tab-private"
        })
    }

    fn browser_focus_approval_fixture() -> Value {
        json!({
            "method": "browser.focus",
            "decision": "allow_once",
            "scopeId": "scope:approved",
            "approved": true,
            "rawReceiptPayload": {
                "internalInstanceId": "private-instance",
                "automationScriptText": "tell application \"Google Chrome\" to activate"
            }
        })
    }

    fn browser_focus_pre_dispatch_fixture() -> Value {
        json!({
            "schemaVersion": "yeonjang-browser-focus-pre-dispatch-v1",
            "method": "browser.focus",
            "toolName": "yeonjang_browser_focus",
            "platform": "macos",
            "status": "dispatch_prepared",
            "reasonCode": "browser_focus_dispatch_prepared",
            "invokeNow": false,
            "addProductionBindingNow": false,
            "dispatcherRegistrationNow": false
        })
    }

    fn browser_focus_execution_admission_fixture(target: &Value) -> Value {
        let unsigned = BrowserFocusExecutionAdmission {
            schema_version: "knowbee.yeonjang-browser-focus-execution-admission.v1".to_string(),
            method: "browser.focus".to_string(),
            extension_id: "yeonjang-main".to_string(),
            session_id: Some("session-001".to_string()),
            target_hash: browser_focus_execution_target_hash(target)
                .expect("target fixture should be hashable"),
            approval_scope_id: "scope:approved".to_string(),
            expires_at: "2026-07-23T09:01:00.000Z".to_string(),
            nonce: "nonce-private".to_string(),
            signature: String::new(),
        };
        let canonical = browser_focus_execution_admission_canonical_payload(&unsigned);
        let mut mac =
            HmacSha256::new_from_slice(b"pairing-secret").expect("fixed HMAC key should be valid");
        mac.update(canonical.as_bytes());
        let signature = format!("hmac-sha256:{:x}", mac.finalize().into_bytes());
        json!({
            "schemaVersion": unsigned.schema_version,
            "method": unsigned.method,
            "extensionId": unsigned.extension_id,
            "sessionId": unsigned.session_id,
            "targetHash": unsigned.target_hash,
            "approvalScopeId": unsigned.approval_scope_id,
            "expiresAt": unsigned.expires_at,
            "nonce": unsigned.nonce,
            "signature": signature,
        })
    }

    fn browser_focus_support_profile() -> SupportProfileRuntimeInfo {
        SupportProfileRuntimeInfo {
            configured_profile: SupportProfileKind::DesktopInteractive,
            effective_profile: SupportProfileKind::DesktopInteractive,
            interactive_desktop_available: true,
            tray_runtime_available: true,
            reason_codes: vec!["tray_runtime_visible".to_string()],
        }
    }

    fn browser_focus_permissions(allow_browser_control: bool) -> PermissionSettings {
        PermissionSettings {
            allow_browser_control,
            ..PermissionSettings::default()
        }
    }

    fn browser_read_permissions(allow_browser_read: bool) -> PermissionSettings {
        PermissionSettings {
            allow_browser_read,
            ..PermissionSettings::default()
        }
    }

    #[test]
    fn browser_focus_public_dispatch_entry_requires_permission_before_contract() {
        let request = Request {
            id: None,
            method: "browser.focus".to_string(),
            params: json!({}),
            metadata: Default::default(),
        };

        let error = dispatch_browser_focus_request(
            &request,
            &browser_focus_permissions(false),
            &browser_focus_support_profile(),
        )
        .expect_err("browser.focus should require browser control permission");

        assert!(
            error
                .to_string()
                .contains("permission denied: `browser.focus`")
        );
    }

    #[test]
    fn browser_focus_public_dispatch_entry_requires_interactive_desktop() {
        let request = Request {
            id: None,
            method: "browser.focus".to_string(),
            params: json!({}),
            metadata: Default::default(),
        };
        let support_profile = SupportProfileRuntimeInfo {
            configured_profile: SupportProfileKind::DesktopInteractive,
            effective_profile: SupportProfileKind::HeadlessManaged,
            interactive_desktop_available: false,
            tray_runtime_available: false,
            reason_codes: vec!["interactive_desktop_unavailable".to_string()],
        };

        let error = dispatch_browser_focus_request(
            &request,
            &browser_focus_permissions(true),
            &support_profile,
        )
        .expect_err("browser.focus should require interactive desktop");

        assert!(
            error
                .to_string()
                .contains("blocked for the current support profile")
        );
    }

    #[test]
    fn browser_focus_dispatch_contract_requires_pre_dispatch_fixture() {
        let request = Request {
            id: None,
            method: "browser.focus".to_string(),
            params: json!({
            "target": browser_focus_target_fixture(),
            "approvalReceipt": browser_focus_approval_fixture()
            }),
            metadata: Default::default(),
        };
        let error = dispatch_browser_focus_request(
            &request,
            &browser_focus_permissions(true),
            &browser_focus_support_profile(),
        )
        .expect_err("pre-dispatch fixture should be required");

        assert!(error.to_string().contains("pre_dispatch_required"));
    }

    #[test]
    fn browser_focus_execution_admission_requires_exact_signed_instance_session_and_expiry() {
        let target = browser_focus_target_fixture();
        let target_hash = browser_focus_execution_target_hash(&target)
            .expect("target fixture should be hashable");
        let admission = browser_focus_execution_admission_fixture(&target);
        verify_browser_focus_execution_admission(
            &admission,
            "pairing-secret",
            "yeonjang-main",
            Some("session-001"),
            &target_hash,
            "scope:approved",
            1_784_760_000_000,
        )
        .expect("signed admission should verify");

        let mut wrong_instance = admission.clone();
        wrong_instance["extensionId"] = Value::String("other-node".to_string());
        assert!(
            verify_browser_focus_execution_admission(
                &wrong_instance,
                "pairing-secret",
                "yeonjang-main",
                Some("session-001"),
                &target_hash,
                "scope:approved",
                1_784_760_000_000,
            )
            .expect_err("different extension must not verify")
            .to_string()
            .contains("browser_focus_execution_admission_invalid")
        );

        assert!(
            verify_browser_focus_execution_admission(
                &admission,
                "pairing-secret",
                "yeonjang-main",
                Some("session-001"),
                &target_hash,
                "scope:other",
                1_784_760_000_000,
            )
            .expect_err("different approval scope must not verify")
            .to_string()
            .contains("browser_focus_execution_admission_invalid")
        );

        assert!(
            verify_browser_focus_execution_admission(
                &admission,
                "wrong-secret",
                "yeonjang-main",
                Some("session-001"),
                &target_hash,
                "scope:approved",
                1_784_760_000_000,
            )
            .expect_err("different secret must not verify")
            .to_string()
            .contains("browser_focus_execution_admission_signature_invalid")
        );

        assert!(
            verify_browser_focus_execution_admission(
                &admission,
                "pairing-secret",
                "yeonjang-main",
                Some("session-001"),
                &target_hash,
                "scope:approved",
                1_784_800_000_000,
            )
            .expect_err("expired admission must not verify")
            .to_string()
            .contains("browser_focus_execution_admission_expired")
        );
    }

    #[test]
    fn browser_focus_dispatch_verifies_optional_execution_admission_without_echoing_it() {
        let mut settings = YeonjangSettings::default();
        settings.connection.password = "pairing-secret".to_string();
        let result = prepare_browser_focus_dispatch_contract_with_runtime(
            &json!({
                "target": browser_focus_target_fixture(),
                "approvalReceipt": browser_focus_approval_fixture(),
                "preDispatch": browser_focus_pre_dispatch_fixture(),
                "executionAdmission": browser_focus_execution_admission_fixture(&browser_focus_target_fixture()),
            }),
            &settings,
            Some("session-001"),
            1_784_760_000_000,
            true,
            &crate::platform::CurrentBackend,
        )
        .expect("valid signed execution admission should be accepted by dispatch");
        let public =
            serde_json::to_string(&result).expect("public dispatch result should serialize");
        assert!(!public.contains("pairing-secret"));
        assert!(!public.contains("nonce-private"));
        assert!(!public.contains("hmac-sha256"));
        assert!(!public.contains("scope:approved"));

        let invalid = prepare_browser_focus_dispatch_contract_with_runtime(
            &json!({
                "target": browser_focus_target_fixture(),
                "approvalReceipt": browser_focus_approval_fixture(),
                "preDispatch": browser_focus_pre_dispatch_fixture(),
                "executionAdmission": { "method": "browser.focus" },
            }),
            &settings,
            Some("session-001"),
            1_784_760_000_000,
            true,
            &crate::platform::CurrentBackend,
        )
        .expect_err("malformed admission must stop dispatch");
        assert!(
            invalid
                .to_string()
                .contains("browser_focus_execution_admission_invalid")
        );
    }

    #[test]
    fn browser_focus_execution_consumes_a_verified_nonce_immediately_before_the_executor() {
        let target = browser_focus_target_fixture();
        let admission_value = browser_focus_execution_admission_fixture(&target);
        let target_hash = browser_focus_execution_target_hash(&target)
            .expect("target fixture should be hashable");
        let nonce_state_path = std::env::temp_dir().join(format!(
            "knowbee-browser-focus-node-execution-{}-{}.json",
            std::process::id(),
            now_unix_millis(),
        ));
        let _ = std::fs::remove_file(&nonce_state_path);
        let admission = verify_browser_focus_execution_admission(
            &admission_value,
            "pairing-secret",
            "yeonjang-main",
            Some("session-001"),
            &target_hash,
            "scope:approved",
            1_784_760_000_000,
        )
        .expect("signed admission should verify before execution");
        let mut executor_calls = Vec::new();
        let result = execute_browser_focus_after_admission(
            &target,
            admission,
            1_784_760_000_000,
            true,
            &nonce_state_path,
            |process_name, interactive_desktop| {
                executor_calls.push((process_name.to_string(), interactive_desktop));
                crate::automation::BrowserFocusExecutionResult {
                    command_accepted: true,
                    reason_code: "macos_browser_focus_command_accepted",
                }
            },
            || {
                Some(crate::automation::FocusedTargetResult {
                    available: true,
                    app_name: Some("Google Chrome".to_string()),
                    process_id: None,
                    title_hash: None,
                    title_length: 0,
                    message: "Focused target observed.".to_string(),
                })
            },
        )
        .expect("verified admission should reach the executor");
        assert_eq!(executor_calls, vec![("Google Chrome".to_string(), true)]);
        assert_eq!(
            result["status"],
            Value::String("dispatch_executed".to_string())
        );
        assert_eq!(result["commandAccepted"], Value::Bool(true));
        assert_eq!(result["goalSuccess"], Value::Bool(false));
        assert_eq!(
            result["observedFocusedTarget"]["processName"],
            Value::String("Google Chrome".to_string())
        );
        assert!(
            !serde_json::to_string(&result)
                .expect("result should serialize")
                .contains("nonce-private")
        );
        assert!(
            !serde_json::to_string(&result)
                .expect("result should serialize")
                .contains("scope:approved")
        );

        let replay_admission = verify_browser_focus_execution_admission(
            &admission_value,
            "pairing-secret",
            "yeonjang-main",
            Some("session-001"),
            &target_hash,
            "scope:approved",
            1_784_760_000_000,
        )
        .expect("signature stays valid; nonce store must reject replay");
        let replay = execute_browser_focus_after_admission(
            &target,
            replay_admission,
            1_784_760_000_000,
            true,
            &nonce_state_path,
            |_, _| panic!("replayed nonce must not reach executor"),
            || panic!("replayed nonce must not reach observer"),
        )
        .expect_err("replayed nonce must block the OS executor");
        assert!(
            replay
                .to_string()
                .contains("browser_focus_execution_admission_nonce_replayed")
        );
        let _ = std::fs::remove_file(nonce_state_path);
    }

    #[test]
    fn browser_focus_dispatch_contract_requires_approval_and_target() {
        let missing_target = prepare_browser_focus_dispatch_contract(&json!({
            "approvalReceipt": browser_focus_approval_fixture(),
            "preDispatch": browser_focus_pre_dispatch_fixture()
        }))
        .expect_err("target should be required");
        assert!(
            missing_target
                .to_string()
                .contains("target_identity_required")
        );

        let denied_approval = prepare_browser_focus_dispatch_contract(&json!({
            "target": browser_focus_target_fixture(),
            "approvalReceipt": {
                "method": "browser.focus",
                "decision": "deny",
                "scopeId": "request-scope-public",
                "approved": false
            },
            "preDispatch": browser_focus_pre_dispatch_fixture()
        }))
        .expect_err("allowed approval should be required");
        assert!(
            denied_approval
                .to_string()
                .contains("side_effect_authorization_required")
        );
    }

    #[test]
    fn browser_focus_dispatch_contract_accepts_prepared_fixture_without_invoking() {
        let request = Request {
            id: None,
            method: "browser.focus".to_string(),
            params: json!({
            "target": browser_focus_target_fixture(),
            "approvalReceipt": browser_focus_approval_fixture(),
            "preDispatch": browser_focus_pre_dispatch_fixture()
            }),
            metadata: Default::default(),
        };
        let result = dispatch_browser_focus_request(
            &request,
            &browser_focus_permissions(true),
            &browser_focus_support_profile(),
        )
        .expect("prepared fixture should pass contract");

        assert_eq!(
            result["status"],
            Value::String("dispatch_prepared".to_string())
        );
        assert_eq!(result["invokeNow"], Value::Bool(false));
        assert_eq!(result["addProductionBindingNow"], Value::Bool(false));
        assert_eq!(result["dispatcherRegistrationNow"], Value::Bool(false));
        assert_eq!(
            result["reasonCode"],
            Value::String("browser_focus_dispatch_contract_ready".to_string())
        );
    }

    #[test]
    fn browser_focus_dispatch_contract_rejects_invoke_enabled_fixture_without_admission() {
        let mut pre_dispatch = browser_focus_pre_dispatch_fixture();
        pre_dispatch["invokeNow"] = Value::Bool(true);

        let request = Request {
            id: None,
            method: "browser.focus".to_string(),
            params: json!({
            "target": browser_focus_target_fixture(),
            "approvalReceipt": browser_focus_approval_fixture(),
            "preDispatch": pre_dispatch
            }),
            metadata: Default::default(),
        };
        let error = dispatch_browser_focus_request(
            &request,
            &browser_focus_permissions(true),
            &browser_focus_support_profile(),
        )
        .expect_err("actual invoke requires a signed admission");

        assert!(
            error
                .to_string()
                .contains("browser_focus_execution_admission_missing")
        );
    }

    #[test]
    fn browser_focus_dispatch_contract_does_not_expose_raw_payload() {
        let request = Request {
            id: None,
            method: "browser.focus".to_string(),
            params: json!({
            "target": browser_focus_target_fixture(),
            "approvalReceipt": browser_focus_approval_fixture(),
            "preDispatch": browser_focus_pre_dispatch_fixture()
            }),
            metadata: Default::default(),
        };
        let result = dispatch_browser_focus_request(
            &request,
            &browser_focus_permissions(true),
            &browser_focus_support_profile(),
        )
        .expect("prepared fixture should pass contract");
        let public = serde_json::to_string(&result).expect("serialize public dispatch contract");

        assert!(!public.contains("Private Admin Console"));
        assert!(!public.contains("https://example.test"));
        assert!(!public.contains("token=private"));
        assert!(!public.contains("private-instance"));
        assert!(!public.contains("tell application"));
        assert!(!public.contains("4401"));
        assert!(!public.contains("window-private"));
        assert!(!public.contains("tab-private"));
        assert!(!public.contains("rawReceiptPayload"));
        assert!(!public.contains("auditOnlyFields"));
        assert!(!public.contains("automationScriptText"));
    }
}
