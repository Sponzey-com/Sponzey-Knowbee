use std::env;
use std::fs;
use std::path::Path;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result, bail};
use serde::Serialize;
use serde_json::Value;

use crate::automation::{
    ApplicationLaunchRequest, ApplicationLaunchResult, AutomationBackend, AutomationCapabilities,
    CameraCaptureRequest, CameraCaptureResult, CameraDevice, CommandExecutionRequest,
    CommandExecutionResult, FocusedTargetResult, KeyboardActionKind, KeyboardActionRequest,
    KeyboardActionResult, KeyboardTypeRequest, KeyboardTypeResult, MouseActionKind,
    MouseActionRequest, MouseActionResult, MouseClickRequest, MouseClickResult, MouseMoveRequest,
    MouseMoveResult, MousePositionResult, PlatformKind, ScreenCaptureRequest, ScreenCaptureResult,
    SystemControlRequest, SystemControlResult, SystemSnapshot,
};
use crate::platform::shared;

#[derive(Debug, Default, Clone, Copy)]
pub struct PlatformBackend;

impl AutomationBackend for PlatformBackend {
    fn platform_kind(&self) -> PlatformKind {
        PlatformKind::Macos
    }

    fn capabilities(&self) -> AutomationCapabilities {
        AutomationCapabilities {
            platform: self.platform_kind(),
            camera_management: true,
            command_execution: true,
            application_launch: true,
            screen_capture: true,
            mouse_control: true,
            keyboard_control: true,
            system_control: true,
        }
    }

    fn system_info(&self) -> Result<SystemSnapshot> {
        Ok(shared::collect_system_info(self.platform_kind()))
    }

    fn control_system(&self, request: SystemControlRequest) -> Result<SystemControlResult> {
        let (program, args, action, message) = resolve_macos_system_control(&request)?;
        let output = Command::new(&program)
            .args(&args)
            .output()
            .with_context(|| format!("failed to run macOS system control command `{program}`"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            bail!(
                "system control failed: {}{}{}",
                stderr.trim(),
                if !stderr.trim().is_empty() && !stdout.trim().is_empty() {
                    " | "
                } else {
                    ""
                },
                stdout.trim()
            );
        }

        Ok(SystemControlResult {
            accepted: true,
            action,
            target: request.target,
            message,
        })
    }

    fn execute_command(&self, request: CommandExecutionRequest) -> Result<CommandExecutionResult> {
        shared::execute_command(request)
    }

    fn launch_application(
        &self,
        request: ApplicationLaunchRequest,
    ) -> Result<ApplicationLaunchResult> {
        shared::validate_application_request(&request)?;

        let mut command = Command::new("open");
        command.arg("-a").arg(&request.application);
        if !request.args.is_empty() {
            command.arg("--args");
            command.args(&request.args);
        }
        if let Some(cwd) = &request.cwd {
            command.current_dir(cwd);
        }

        let output = command
            .output()
            .with_context(|| format!("failed to launch application `{}`", request.application))?;

        if !output.status.success() {
            bail!(
                "application launch failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
        }

        Ok(ApplicationLaunchResult {
            launched: true,
            application: request.application,
            pid: None,
            message: if request.detached {
                "Application launch requested in detached mode.".to_string()
            } else {
                "Application launch requested.".to_string()
            },
        })
    }

    fn list_cameras(&self) -> Result<Vec<CameraDevice>> {
        let output = Command::new("system_profiler")
            .args(["SPCameraDataType", "-json"])
            .output()
            .context("failed to run system_profiler for camera discovery")?;

        if !output.status.success() {
            bail!(
                "camera discovery failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
        }

        let payload: Value = serde_json::from_slice(&output.stdout)
            .context("failed to parse system_profiler output")?;
        let items = payload
            .get("SPCameraDataType")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();

        let cameras = items
            .into_iter()
            .enumerate()
            .map(|(index, item)| {
                let name = item
                    .get("_name")
                    .and_then(Value::as_str)
                    .or_else(|| item.get("name").and_then(Value::as_str))
                    .unwrap_or("Camera")
                    .to_string();
                let id = item
                    .get("spcamera_unique-id")
                    .and_then(Value::as_str)
                    .or_else(|| item.get("spcamera_model-id").and_then(Value::as_str))
                    .or_else(|| item.get("id").and_then(Value::as_str))
                    .map(ToOwned::to_owned)
                    .unwrap_or_else(|| format!("camera-{}-{}", index + 1, slugify(&name)));
                let position = item
                    .get("spcamera_position")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned);

                CameraDevice {
                    id,
                    name,
                    position,
                    available: true,
                }
            })
            .collect();

        Ok(cameras)
    }

    fn capture_camera(&self, request: CameraCaptureRequest) -> Result<CameraCaptureResult> {
        shared::validate_camera_request(&request)?;
        let inline_base64 = request.inline_base64;

        let output_path = resolve_camera_output_path(request.output_path.as_deref())?;
        let executable_path = resolve_camera_capture_command_path()?;
        let mut command = Command::new(&executable_path);
        command.arg("--camera-capture-helper").arg(&output_path);
        if let Some(device_id) = request.device_id.as_deref() {
            command.arg("--device-id").arg(device_id);
        }
        if inline_base64 {
            command.arg("--inline-base64");
        }

        let output = command.output().with_context(|| {
            format!(
                "failed to execute Yeonjang camera capture command: {}",
                executable_path.display()
            )
        })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            bail!(
                "camera capture failed: {}{}{}",
                stderr.trim(),
                if !stderr.trim().is_empty() && !stdout.trim().is_empty() {
                    " | "
                } else {
                    ""
                },
                stdout.trim()
            );
        }

        let parsed: Value = serde_json::from_slice(&output.stdout)
            .context("failed to parse camera capture helper output")?;
        let actual_device_id = parsed
            .get("deviceId")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned)
            .or(request.device_id.clone());
        let metadata = build_file_metadata(&output_path, inline_base64, "image/jpeg");
        let base64_data = if inline_base64 {
            Some(
                parsed
                    .get("base64Data")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned)
                    .context("camera capture must include inline base64 data")?,
            )
        } else {
            None
        };
        let should_cleanup = inline_base64;
        if should_cleanup {
            let _ = fs::remove_file(&output_path);
        }

        Ok(CameraCaptureResult {
            device_id: actual_device_id,
            output_path: if inline_base64 {
                None
            } else {
                Some(output_path.clone())
            },
            file_name: metadata.file_name,
            file_extension: metadata.file_extension,
            mime_type: parsed
                .get("mimeType")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .or(metadata.mime_type),
            size_bytes: metadata.size_bytes,
            transfer_encoding: metadata.transfer_encoding,
            base64_data,
            message: "Camera capture completed.".to_string(),
        })
    }

    fn capture_screen(&self, request: ScreenCaptureRequest) -> Result<ScreenCaptureResult> {
        shared::validate_screen_request(&request)?;
        let inline_base64 = request.inline_base64;
        let (output_path, _explicit_output_path) =
            resolve_screen_output_path(request.output_path.as_deref())?;
        let script_path = write_swift_screen_script()?;

        let mut command = Command::new("xcrun");
        command.arg("swift").arg(&script_path).arg(&output_path);
        if let Some(display) = request.display {
            command
                .arg("--display")
                .arg(normalize_macos_screen_capture_display(display).to_string());
        }
        if inline_base64 {
            command.arg("--inline-base64");
        }

        let output = command.output().with_context(|| {
            format!(
                "failed to execute screen capture helper: {}",
                script_path.display()
            )
        })?;

        let _ = fs::remove_file(&script_path);

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            bail!(
                "screen capture failed: {}{}{}",
                stderr.trim(),
                if !stderr.trim().is_empty() && !stdout.trim().is_empty() {
                    " | "
                } else {
                    ""
                },
                stdout.trim()
            );
        }

        let parsed: Value = serde_json::from_slice(&output.stdout)
            .context("failed to parse screen capture helper output")?;

        let metadata = build_file_metadata(&output_path, inline_base64, "image/png");
        let base64_data = if inline_base64 {
            Some(
                parsed
                    .get("base64Data")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned)
                    .context("screen capture must include inline base64 data")?,
            )
        } else {
            None
        };
        let should_cleanup = inline_base64;
        if should_cleanup {
            let _ = fs::remove_file(&output_path);
        }

        Ok(ScreenCaptureResult {
            display: request.display,
            output_path: if inline_base64 {
                None
            } else {
                Some(output_path.clone())
            },
            file_name: metadata.file_name,
            file_extension: metadata.file_extension,
            mime_type: parsed
                .get("mimeType")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .or(metadata.mime_type),
            size_bytes: metadata.size_bytes,
            transfer_encoding: metadata.transfer_encoding,
            base64_data,
            message: "Screen capture completed.".to_string(),
        })
    }

    fn move_mouse(&self, request: MouseMoveRequest) -> Result<MouseMoveResult> {
        shared::validate_mouse_move(&request)?;
        move_mouse_via_core_graphics(request.x, request.y)?;
        Ok(MouseMoveResult {
            moved: true,
            x: request.x,
            y: request.y,
            message: "Mouse move completed.".to_string(),
        })
    }

    fn mouse_position(&self) -> Result<MousePositionResult> {
        let (x, y) = current_mouse_position_via_core_graphics()?;
        Ok(MousePositionResult {
            x,
            y,
            message: "Mouse position observed.".to_string(),
        })
    }

    fn click_mouse(&self, request: MouseClickRequest) -> Result<MouseClickResult> {
        shared::validate_mouse_click(&request)?;
        let button = normalize_mouse_button_name(&request.button)?;
        click_mouse_via_core_graphics(request.x, request.y, button, request.double)?;
        Ok(MouseClickResult {
            clicked: true,
            x: request.x,
            y: request.y,
            button: button.to_string(),
            double: request.double,
            message: if request.double {
                "Mouse double click completed.".to_string()
            } else {
                "Mouse click completed.".to_string()
            },
        })
    }

    fn perform_mouse_action(&self, request: MouseActionRequest) -> Result<MouseActionResult> {
        match request.action {
            MouseActionKind::Move => {
                let x = request
                    .x
                    .ok_or_else(|| anyhow::anyhow!("mouse.action `move` requires `x`"))?;
                let y = request
                    .y
                    .ok_or_else(|| anyhow::anyhow!("mouse.action `move` requires `y`"))?;
                let result = self.move_mouse(MouseMoveRequest { x, y })?;
                Ok(MouseActionResult {
                    accepted: result.moved,
                    action: MouseActionKind::Move,
                    x: Some(result.x),
                    y: Some(result.y),
                    button: None,
                    delta_x: None,
                    delta_y: None,
                    message: result.message,
                })
            }
            MouseActionKind::Click | MouseActionKind::DoubleClick => {
                let x = request.x.ok_or_else(|| {
                    anyhow::anyhow!("mouse.action `{}` requires `x`", request.action.as_str())
                })?;
                let y = request.y.ok_or_else(|| {
                    anyhow::anyhow!("mouse.action `{}` requires `y`", request.action.as_str())
                })?;
                let double = matches!(request.action, MouseActionKind::DoubleClick);
                let result = self.click_mouse(MouseClickRequest {
                    x,
                    y,
                    button: request.button,
                    double,
                })?;
                Ok(MouseActionResult {
                    accepted: result.clicked,
                    action: if result.double {
                        MouseActionKind::DoubleClick
                    } else {
                        MouseActionKind::Click
                    },
                    x: Some(result.x),
                    y: Some(result.y),
                    button: Some(result.button),
                    delta_x: None,
                    delta_y: None,
                    message: result.message,
                })
            }
            MouseActionKind::ButtonDown | MouseActionKind::ButtonUp => {
                let point =
                    resolve_optional_mouse_point(request.x, request.y, request.action.as_str())?;
                let button = normalize_mouse_button_name(&request.button)?;
                run_mouse_action_helper(build_mouse_action_helper_args(
                    request.action,
                    point,
                    button,
                    None,
                    None,
                ))?;
                Ok(MouseActionResult {
                    accepted: true,
                    action: request.action,
                    x: point.map(|(x, _)| x),
                    y: point.map(|(_, y)| y),
                    button: Some(button.to_string()),
                    delta_x: None,
                    delta_y: None,
                    message: format!("Mouse {} completed.", request.action.as_str()),
                })
            }
            MouseActionKind::Scroll => {
                let point =
                    resolve_optional_mouse_point(request.x, request.y, request.action.as_str())?;
                let delta_x = request.delta_x.unwrap_or(0);
                let delta_y = request.delta_y.unwrap_or(0);
                if delta_x == 0 && delta_y == 0 {
                    bail!("mouse.action `scroll` requires non-zero `delta_x` or `delta_y`");
                }
                run_mouse_action_helper(build_mouse_action_helper_args(
                    request.action,
                    point,
                    "left",
                    Some(delta_x),
                    Some(delta_y),
                ))?;
                Ok(MouseActionResult {
                    accepted: true,
                    action: MouseActionKind::Scroll,
                    x: point.map(|(x, _)| x),
                    y: point.map(|(_, y)| y),
                    button: None,
                    delta_x: Some(delta_x),
                    delta_y: Some(delta_y),
                    message: "Mouse scroll completed.".to_string(),
                })
            }
        }
    }

    fn type_text(&self, request: KeyboardTypeRequest) -> Result<KeyboardTypeResult> {
        if request.text.is_empty() {
            bail!("keyboard input text must not be empty");
        }
        type_text_via_system_events(&request.text)?;
        Ok(KeyboardTypeResult {
            typed: true,
            text_len: request.text.chars().count(),
            message: "Keyboard text input completed.".to_string(),
        })
    }

    fn focused_target(&self) -> Result<FocusedTargetResult> {
        let output = Command::new("osascript")
            .arg("-e")
            .arg("tell application \"System Events\" to get name of first application process whose frontmost is true")
            .output()
            .context("failed to observe macOS focused app")?;
        if !output.status.success() {
            return Ok(shared::focused_target_result(None, None, None));
        }
        let app_name = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(shared::focused_target_result(
            (!app_name.is_empty()).then_some(app_name),
            None,
            None,
        ))
    }

    fn perform_keyboard_action(
        &self,
        request: KeyboardActionRequest,
    ) -> Result<KeyboardActionResult> {
        match request.action {
            KeyboardActionKind::TypeText => {
                let text = request.text.unwrap_or_default();
                let result = self.type_text(KeyboardTypeRequest { text })?;
                Ok(KeyboardActionResult {
                    accepted: result.typed,
                    action: KeyboardActionKind::TypeText,
                    text_len: Some(result.text_len),
                    key: None,
                    modifiers: Vec::new(),
                    message: result.message,
                })
            }
            KeyboardActionKind::Shortcut => {
                let key = request.key.unwrap_or_default();
                if key.trim().is_empty() {
                    bail!("keyboard.action `shortcut` requires non-empty `key`");
                }
                trigger_shortcut_via_system_events(&key, &request.modifiers)?;
                Ok(KeyboardActionResult {
                    accepted: true,
                    action: KeyboardActionKind::Shortcut,
                    text_len: None,
                    key: Some(key),
                    modifiers: request.modifiers,
                    message: "Keyboard shortcut completed.".to_string(),
                })
            }
            KeyboardActionKind::KeyPress
            | KeyboardActionKind::KeyDown
            | KeyboardActionKind::KeyUp => {
                let key = request.key.unwrap_or_default();
                if key.trim().is_empty() {
                    bail!(
                        "keyboard.action `{}` requires non-empty `key`",
                        request.action.as_str()
                    );
                }
                perform_keyboard_key_action_via_core_graphics(
                    request.action,
                    &key,
                    &request.modifiers,
                )?;
                Ok(KeyboardActionResult {
                    accepted: true,
                    action: request.action,
                    text_len: None,
                    key: Some(key),
                    modifiers: request.modifiers,
                    message: format!("Keyboard {} completed.", request.action.as_str()),
                })
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum MacosKeyboardTarget {
    Keystroke(String),
    KeyCode(u16),
}

#[derive(Debug, Clone)]
struct MacosBrowserFocusPlanInput {
    approval_granted: bool,
    capability_advertised: bool,
    command_backend_ready: bool,
    focused_target_observation_backend_ready: bool,
    interactive_desktop_session: bool,
    target_alias: Option<String>,
    process_name: Option<String>,
    raw_window_title: Option<String>,
    raw_url: Option<String>,
    pid: Option<u32>,
    window_id: Option<String>,
    tab_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
struct MacosBrowserFocusCommandPlan {
    command_accepted_candidate: bool,
    execute_os_focus_now: bool,
    reason_code: &'static str,
    backend_family: &'static str,
    public_target_name: String,
    post_check_mode: &'static str,
    audit_only_fields: Vec<&'static str>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
struct MacosBrowserFocusCommandExecutionResult {
    command_accepted: bool,
    reason_code: &'static str,
    focused_target_observation_required: bool,
    goal_success: bool,
}

fn build_macos_browser_focus_command_plan(
    input: MacosBrowserFocusPlanInput,
) -> Result<MacosBrowserFocusCommandPlan> {
    if !input.approval_granted {
        bail!("side_effect_authorization_required");
    }
    if !input.capability_advertised {
        bail!("capability_not_supported");
    }
    if !input.command_backend_ready {
        bail!("command_backend_required");
    }
    if !input.focused_target_observation_backend_ready {
        bail!("focused_target_observation_backend_required");
    }
    if !input.interactive_desktop_session {
        bail!("headless_unavailable");
    }

    let _audit_only_identity_present =
        input.pid.is_some() || input.window_id.is_some() || input.tab_id.is_some();
    let public_target_name = resolve_macos_browser_focus_public_target_name(&input)?;

    Ok(MacosBrowserFocusCommandPlan {
        command_accepted_candidate: true,
        execute_os_focus_now: false,
        reason_code: "macos_browser_focus_command_plan_ready",
        backend_family: "osascript",
        public_target_name,
        post_check_mode: "focused_target_observation_required",
        audit_only_fields: vec![
            "rawWindowTitle",
            "rawUrl",
            "queryToken",
            "pid",
            "windowId",
            "tabId",
            "automationScriptText",
        ],
    })
}

fn resolve_macos_browser_focus_public_target_name(
    input: &MacosBrowserFocusPlanInput,
) -> Result<String> {
    for candidate in [
        input.target_alias.as_deref(),
        input.process_name.as_deref(),
        input.raw_window_title.as_deref(),
        input.raw_url.as_deref(),
    ]
    .into_iter()
    .flatten()
    {
        let normalized = candidate.trim();
        if !normalized.is_empty() {
            return Ok(normalized.to_string());
        }
    }

    bail!("target_identity_required")
}

fn execute_macos_browser_focus_command_plan<F>(
    plan: &MacosBrowserFocusCommandPlan,
    runner: F,
) -> MacosBrowserFocusCommandExecutionResult
where
    F: FnOnce() -> Result<bool>,
{
    if !plan.command_accepted_candidate {
        return macos_browser_focus_execution_result(false, "command_plan_not_ready");
    }

    match runner() {
        Ok(true) => {
            macos_browser_focus_execution_result(true, "macos_browser_focus_command_accepted")
        }
        Ok(false) => {
            macos_browser_focus_execution_result(false, "macos_browser_focus_command_rejected")
        }
        Err(_) => macos_browser_focus_execution_result(false, "macos_browser_focus_command_failed"),
    }
}

fn build_macos_browser_focus_osascript(plan: &MacosBrowserFocusCommandPlan) -> Result<String> {
    if !plan.command_accepted_candidate {
        bail!("command_plan_not_ready");
    }
    if plan.backend_family != "osascript" {
        bail!("unsupported_browser_focus_backend_family");
    }
    let target_name = plan.public_target_name.trim();
    if target_name.is_empty() {
        bail!("target_identity_required");
    }

    Ok(format!(
        "tell application {} to activate",
        apple_script_string_literal(target_name)
    ))
}

fn execute_macos_browser_focus_private<F>(
    input: MacosBrowserFocusPlanInput,
    runner: F,
) -> MacosBrowserFocusCommandExecutionResult
where
    F: FnOnce(&str) -> Result<bool>,
{
    let plan = match build_macos_browser_focus_command_plan(input) {
        Ok(plan) => plan,
        Err(error) => {
            return macos_browser_focus_execution_result(
                false,
                macos_browser_focus_sanitized_reason_code(&error),
            );
        }
    };
    let script = match build_macos_browser_focus_osascript(&plan) {
        Ok(script) => script,
        Err(error) => {
            return macos_browser_focus_execution_result(
                false,
                macos_browser_focus_sanitized_reason_code(&error),
            );
        }
    };

    execute_macos_browser_focus_command_plan(&plan, || runner(&script))
}

/// The caller owns authentication and replay protection. This boundary receives
/// only the signed process identity and never exposes the generated AppleScript.
pub(crate) fn execute_verified_browser_focus(
    process_name: &str,
    interactive_desktop_session: bool,
) -> Value {
    let result = execute_macos_browser_focus_private(
        MacosBrowserFocusPlanInput {
            approval_granted: true,
            capability_advertised: true,
            command_backend_ready: true,
            focused_target_observation_backend_ready: true,
            interactive_desktop_session,
            target_alias: None,
            process_name: Some(process_name.trim().to_string()),
            raw_window_title: None,
            raw_url: None,
            pid: None,
            window_id: None,
            tab_id: None,
        },
        |script| {
            let output = Command::new("osascript").arg("-e").arg(script).output()?;
            Ok(output.status.success())
        },
    );
    serde_json::json!({
        "commandAccepted": result.command_accepted,
        "reasonCode": result.reason_code,
        "focusedTargetObservationRequired": result.focused_target_observation_required,
        "goalSuccess": result.goal_success,
    })
}

fn macos_browser_focus_sanitized_reason_code(error: &anyhow::Error) -> &'static str {
    let message = error.to_string();
    match message.as_str() {
        "side_effect_authorization_required" => "side_effect_authorization_required",
        "capability_not_supported" => "capability_not_supported",
        "command_backend_required" => "command_backend_required",
        "focused_target_observation_backend_required" => {
            "focused_target_observation_backend_required"
        }
        "headless_unavailable" => "headless_unavailable",
        "target_identity_required" => "target_identity_required",
        "command_plan_not_ready" => "command_plan_not_ready",
        "unsupported_browser_focus_backend_family" => "unsupported_browser_focus_backend_family",
        _ => "macos_browser_focus_command_failed",
    }
}

fn macos_browser_focus_execution_result(
    command_accepted: bool,
    reason_code: &'static str,
) -> MacosBrowserFocusCommandExecutionResult {
    MacosBrowserFocusCommandExecutionResult {
        command_accepted,
        reason_code,
        focused_target_observation_required: true,
        goal_success: false,
    }
}

fn run_osascript(script: &str) -> Result<()> {
    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .with_context(|| "failed to execute osascript for keyboard control".to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        bail!(
            "keyboard automation failed: {}{}{}",
            stderr.trim(),
            if !stderr.trim().is_empty() && !stdout.trim().is_empty() {
                " | "
            } else {
                ""
            },
            stdout.trim()
        );
    }

    Ok(())
}

fn type_text_via_system_events(text: &str) -> Result<()> {
    let script = format!(
        "tell application \"System Events\" to keystroke {}",
        apple_script_string_literal(text)
    );
    run_osascript(&script)
}

fn trigger_shortcut_via_system_events(key: &str, modifiers: &[String]) -> Result<()> {
    let target = resolve_macos_keyboard_target(key)?;
    let using_clause = build_modifier_clause(modifiers)?;
    let key_expr = match target {
        MacosKeyboardTarget::Keystroke(text) => {
            format!("keystroke {}", apple_script_string_literal(&text))
        }
        MacosKeyboardTarget::KeyCode(code) => format!("key code {code}"),
    };
    let script = if using_clause.is_empty() {
        format!("tell application \"System Events\" to {key_expr}")
    } else {
        format!(
            "tell application \"System Events\" to {key_expr} using {{{}}}",
            using_clause.join(", ")
        )
    };
    run_osascript(&script)
}

fn move_mouse_via_core_graphics(x: i32, y: i32) -> Result<()> {
    run_mouse_action_helper(build_mouse_action_helper_args(
        MouseActionKind::Move,
        Some((x, y)),
        "left",
        None,
        None,
    ))
}

fn current_mouse_position_via_core_graphics() -> Result<(i32, i32)> {
    let script_path = write_swift_mouse_position_script()?;
    let output = Command::new("xcrun")
        .arg("swift")
        .arg(&script_path)
        .output()
        .with_context(|| {
            format!(
                "failed to execute mouse position helper: {}",
                script_path.display()
            )
        })?;

    let _ = fs::remove_file(&script_path);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        bail!(
            "mouse position observation failed: {}{}{}",
            stderr.trim(),
            if !stderr.trim().is_empty() && !stdout.trim().is_empty() {
                " | "
            } else {
                ""
            },
            stdout.trim()
        );
    }

    parse_mouse_position_json(String::from_utf8_lossy(&output.stdout).as_ref())
}

fn click_mouse_via_core_graphics(x: i32, y: i32, button: &str, double: bool) -> Result<()> {
    run_mouse_action_helper(build_mouse_action_helper_args(
        if double {
            MouseActionKind::DoubleClick
        } else {
            MouseActionKind::Click
        },
        Some((x, y)),
        button,
        None,
        None,
    ))
}

fn perform_keyboard_key_action_via_core_graphics(
    action: KeyboardActionKind,
    key: &str,
    modifiers: &[String],
) -> Result<()> {
    let key_code = resolve_macos_keyboard_key_code(key)?;
    let modifier_codes = build_modifier_key_codes(modifiers)?;
    let mut args = vec![
        action.as_str().to_string(),
        "--keycode".to_string(),
        key_code.to_string(),
    ];
    for modifier_code in modifier_codes {
        args.push("--modifier".to_string());
        args.push(modifier_code.to_string());
    }
    run_keyboard_action_helper(args)
}

fn run_mouse_action_helper(args: Vec<String>) -> Result<()> {
    let script_path = write_swift_mouse_action_script()?;
    let output = Command::new("xcrun")
        .arg("swift")
        .arg(&script_path)
        .args(&args)
        .output()
        .with_context(|| {
            format!(
                "failed to execute mouse automation helper: {}",
                script_path.display()
            )
        })?;

    let _ = fs::remove_file(&script_path);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        bail!(
            "mouse automation failed: {}{}{}",
            stderr.trim(),
            if !stderr.trim().is_empty() && !stdout.trim().is_empty() {
                " | "
            } else {
                ""
            },
            stdout.trim()
        );
    }

    Ok(())
}

fn run_keyboard_action_helper(args: Vec<String>) -> Result<()> {
    let script_path = write_swift_keyboard_action_script()?;
    let output = Command::new("xcrun")
        .arg("swift")
        .arg(&script_path)
        .args(&args)
        .output()
        .with_context(|| {
            format!(
                "failed to execute keyboard automation helper: {}",
                script_path.display()
            )
        })?;

    let _ = fs::remove_file(&script_path);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        bail!(
            "keyboard automation failed: {}{}{}",
            stderr.trim(),
            if !stderr.trim().is_empty() && !stdout.trim().is_empty() {
                " | "
            } else {
                ""
            },
            stdout.trim()
        );
    }

    Ok(())
}

fn build_mouse_action_helper_args(
    action: MouseActionKind,
    point: Option<(i32, i32)>,
    button: &str,
    delta_x: Option<i32>,
    delta_y: Option<i32>,
) -> Vec<String> {
    let mut args = vec![action.as_str().to_string()];
    if let Some((x, y)) = point {
        args.push("--x".to_string());
        args.push(x.to_string());
        args.push("--y".to_string());
        args.push(y.to_string());
    }
    if matches!(
        action,
        MouseActionKind::Click
            | MouseActionKind::DoubleClick
            | MouseActionKind::ButtonDown
            | MouseActionKind::ButtonUp
    ) {
        args.push("--button".to_string());
        args.push(button.to_string());
    }
    if let Some(delta_x) = delta_x {
        args.push("--delta-x".to_string());
        args.push(delta_x.to_string());
    }
    if let Some(delta_y) = delta_y {
        args.push("--delta-y".to_string());
        args.push(delta_y.to_string());
    }
    args
}

fn resolve_optional_mouse_point(
    x: Option<i32>,
    y: Option<i32>,
    action: &str,
) -> Result<Option<(i32, i32)>> {
    match (x, y) {
        (Some(x), Some(y)) => Ok(Some((x, y))),
        (None, None) => Ok(None),
        _ => {
            bail!("mouse.action `{action}` requires both `x` and `y` when coordinates are provided")
        }
    }
}

fn normalize_mouse_button_name(button: &str) -> Result<&'static str> {
    match button.trim().to_lowercase().as_str() {
        "" | "left" => Ok("left"),
        "right" => Ok("right"),
        "middle" | "center" => Ok("middle"),
        other => bail!("unsupported mouse button for macOS: {other}"),
    }
}

fn resolve_macos_system_control(
    request: &SystemControlRequest,
) -> Result<(String, Vec<String>, String, String)> {
    let action = request.action.trim().to_lowercase();
    let target = request
        .target
        .as_deref()
        .unwrap_or_default()
        .trim()
        .to_lowercase();
    if !target.is_empty() && target != "local" && target != "localhost" && target != "." {
        bail!(
            "system.control target `{}` is not supported on macOS yet",
            request.target.as_deref().unwrap_or_default()
        );
    }

    match action.as_str() {
        "lock" | "lock_screen" | "lock_workstation" => {
            let program =
                "/System/Library/CoreServices/Menu Extras/User.menu/Contents/Resources/CGSession";
            if !Path::new(program).is_file() {
                bail!("macOS lock helper was not found: {program}");
            }
            Ok((
                program.to_string(),
                vec!["-suspend".to_string()],
                action,
                "macOS lock requested.".to_string(),
            ))
        }
        "sleep" | "sleepnow" | "sleep_now" => Ok((
            "/usr/bin/pmset".to_string(),
            vec!["sleepnow".to_string()],
            action,
            "macOS sleep requested.".to_string(),
        )),
        "logoff" | "logout" | "signout" | "sign_out" => Ok((
            "/usr/bin/osascript".to_string(),
            vec![
                "-e".to_string(),
                "tell application \"System Events\" to log out".to_string(),
            ],
            action,
            "macOS logout requested.".to_string(),
        )),
        "restart" | "reboot" => Ok((
            "/usr/bin/osascript".to_string(),
            vec![
                "-e".to_string(),
                "tell application \"System Events\" to restart".to_string(),
            ],
            action,
            "macOS restart requested.".to_string(),
        )),
        "shutdown" | "poweroff" | "power_off" => Ok((
            "/usr/bin/osascript".to_string(),
            vec![
                "-e".to_string(),
                "tell application \"System Events\" to shut down".to_string(),
            ],
            action,
            "macOS shutdown requested.".to_string(),
        )),
        other => bail!("system.control action `{other}` is not supported on macOS yet"),
    }
}

fn apple_script_string_literal(text: &str) -> String {
    format!("\"{}\"", text.replace('\\', "\\\\").replace('"', "\\\""))
}

fn build_modifier_clause(modifiers: &[String]) -> Result<Vec<&'static str>> {
    let mut clauses: Vec<&'static str> = Vec::new();
    for modifier in modifiers {
        let normalized = modifier.trim().to_lowercase();
        let clause = match normalized.as_str() {
            "control" | "ctrl" | "leftcontrol" | "rightcontrol" | "leftctrl" | "rightctrl" => {
                "control down"
            }
            "shift" | "leftshift" | "rightshift" => "shift down",
            "alt" | "option" | "leftalt" | "rightalt" | "leftoption" | "rightoption" => {
                "option down"
            }
            "meta" | "super" | "cmd" | "command" | "leftcommand" | "rightcommand" | "leftsuper"
            | "rightsuper" | "win" | "windows" => "command down",
            other => bail!("unsupported keyboard modifier for macOS shortcut: {other}"),
        };
        if !clauses.contains(&clause) {
            clauses.push(clause);
        }
    }
    Ok(clauses)
}

fn resolve_macos_keyboard_target(key: &str) -> Result<MacosKeyboardTarget> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        bail!("keyboard shortcut key must not be empty");
    }

    if trimmed.chars().count() == 1 {
        return Ok(MacosKeyboardTarget::Keystroke(trimmed.to_string()));
    }

    let normalized = trimmed
        .to_lowercase()
        .replace('_', "")
        .replace('-', "")
        .replace(' ', "");

    let key_code = match normalized.as_str() {
        "enter" | "return" => Some(36),
        "tab" => Some(48),
        "space" | "spacebar" => Some(49),
        "delete" | "backspace" => Some(51),
        "esc" | "escape" => Some(53),
        "forwarddelete" => Some(117),
        "home" => Some(115),
        "end" => Some(119),
        "pageup" => Some(116),
        "pagedown" => Some(121),
        "left" | "leftarrow" => Some(123),
        "right" | "rightarrow" => Some(124),
        "down" | "downarrow" => Some(125),
        "up" | "uparrow" => Some(126),
        "f1" => Some(122),
        "f2" => Some(120),
        "f3" => Some(99),
        "f4" => Some(118),
        "f5" => Some(96),
        "f6" => Some(97),
        "f7" => Some(98),
        "f8" => Some(100),
        "f9" => Some(101),
        "f10" => Some(109),
        "f11" => Some(103),
        "f12" => Some(111),
        _ => None,
    };

    if let Some(code) = key_code {
        Ok(MacosKeyboardTarget::KeyCode(code))
    } else {
        bail!("unsupported keyboard shortcut key for macOS: {trimmed}")
    }
}

fn build_modifier_key_codes(modifiers: &[String]) -> Result<Vec<u16>> {
    let mut codes = Vec::new();
    for modifier in modifiers {
        let code = resolve_macos_modifier_key_code(modifier)?;
        if !codes.contains(&code) {
            codes.push(code);
        }
    }
    Ok(codes)
}

fn resolve_macos_modifier_key_code(modifier: &str) -> Result<u16> {
    let normalized = modifier.trim().to_lowercase();
    match normalized.as_str() {
        "control" | "ctrl" | "leftcontrol" | "leftctrl" => Ok(59),
        "rightcontrol" | "rightctrl" => Ok(62),
        "shift" | "leftshift" => Ok(56),
        "rightshift" => Ok(60),
        "alt" | "option" | "leftalt" | "leftoption" => Ok(58),
        "rightalt" | "rightoption" => Ok(61),
        "meta" | "super" | "cmd" | "command" | "leftcommand" | "leftsuper" | "win" | "windows" => {
            Ok(55)
        }
        "rightcommand" | "rightsuper" => Ok(54),
        other => bail!("unsupported keyboard modifier for macOS: {other}"),
    }
}

fn resolve_macos_keyboard_key_code(key: &str) -> Result<u16> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        bail!("keyboard key must not be empty");
    }

    let normalized = trimmed
        .to_lowercase()
        .replace('_', "")
        .replace('-', "")
        .replace(' ', "");

    let code = match normalized.as_str() {
        "a" => Some(0),
        "s" => Some(1),
        "d" => Some(2),
        "f" => Some(3),
        "h" => Some(4),
        "g" => Some(5),
        "z" => Some(6),
        "x" => Some(7),
        "c" => Some(8),
        "v" => Some(9),
        "b" => Some(11),
        "q" => Some(12),
        "w" => Some(13),
        "e" => Some(14),
        "r" => Some(15),
        "y" => Some(16),
        "t" => Some(17),
        "1" => Some(18),
        "2" => Some(19),
        "3" => Some(20),
        "4" => Some(21),
        "6" => Some(22),
        "5" => Some(23),
        "=" | "equal" => Some(24),
        "9" => Some(25),
        "7" => Some(26),
        "-" | "minus" => Some(27),
        "8" => Some(28),
        "0" => Some(29),
        "]" | "rightbracket" => Some(30),
        "o" => Some(31),
        "u" => Some(32),
        "[" | "leftbracket" => Some(33),
        "i" => Some(34),
        "p" => Some(35),
        "enter" | "return" => Some(36),
        "l" => Some(37),
        "j" => Some(38),
        "'" | "quote" | "apostrophe" => Some(39),
        "k" => Some(40),
        ";" | "semicolon" => Some(41),
        "\\" | "backslash" => Some(42),
        "," | "comma" => Some(43),
        "/" | "slash" => Some(44),
        "n" => Some(45),
        "m" => Some(46),
        "." | "period" | "dot" => Some(47),
        "tab" => Some(48),
        "space" | "spacebar" => Some(49),
        "`" | "grave" | "backtick" => Some(50),
        "delete" | "backspace" => Some(51),
        "escape" | "esc" => Some(53),
        "command" | "cmd" | "leftcommand" | "meta" | "super" => Some(55),
        "shift" | "leftshift" => Some(56),
        "capslock" => Some(57),
        "option" | "alt" | "leftoption" | "leftalt" => Some(58),
        "control" | "ctrl" | "leftcontrol" | "leftctrl" => Some(59),
        "rightshift" => Some(60),
        "rightoption" | "rightalt" => Some(61),
        "rightcontrol" | "rightctrl" => Some(62),
        "function" | "fn" => Some(63),
        "f17" => Some(64),
        "volumeup" => Some(72),
        "volumedown" => Some(73),
        "mute" => Some(74),
        "f18" => Some(79),
        "f19" => Some(80),
        "f20" => Some(90),
        "f5" => Some(96),
        "f6" => Some(97),
        "f7" => Some(98),
        "f3" => Some(99),
        "f8" => Some(100),
        "f9" => Some(101),
        "f11" => Some(103),
        "f13" => Some(105),
        "f16" => Some(106),
        "f14" => Some(107),
        "f10" => Some(109),
        "f12" => Some(111),
        "f15" => Some(113),
        "help" => Some(114),
        "home" => Some(115),
        "pageup" => Some(116),
        "forwarddelete" => Some(117),
        "f4" => Some(118),
        "end" => Some(119),
        "f2" => Some(120),
        "pagedown" => Some(121),
        "f1" => Some(122),
        "left" | "leftarrow" => Some(123),
        "right" | "rightarrow" => Some(124),
        "down" | "downarrow" => Some(125),
        "up" | "uparrow" => Some(126),
        _ => None,
    };

    code.ok_or_else(|| anyhow::anyhow!("unsupported keyboard key for macOS: {trimmed}"))
}

fn resolve_camera_output_path(output_path: Option<&str>) -> Result<String> {
    match output_path {
        Some(path) if !path.trim().is_empty() => {
            let candidate = PathBuf::from(path);
            if should_treat_as_output_directory(&candidate) {
                Ok(candidate
                    .join(build_generated_capture_name("yeonjang-camera", "jpg"))
                    .display()
                    .to_string())
            } else {
                Ok(path.to_string())
            }
        }
        _ => {
            let path = env::temp_dir().join(build_generated_capture_name("yeonjang-camera", "jpg"));
            Ok(path.display().to_string())
        }
    }
}

fn resolve_screen_output_path(output_path: Option<&str>) -> Result<(String, bool)> {
    match output_path {
        Some(path) if !path.trim().is_empty() => {
            let candidate = PathBuf::from(path);
            if should_treat_as_output_directory(&candidate) {
                Ok((
                    candidate
                        .join(build_generated_capture_name("yeonjang-screen", "png"))
                        .display()
                        .to_string(),
                    false,
                ))
            } else {
                Ok((path.to_string(), true))
            }
        }
        _ => {
            let path = env::temp_dir().join(build_generated_capture_name("yeonjang-screen", "png"));
            Ok((path.display().to_string(), false))
        }
    }
}

fn build_generated_capture_name(prefix: &str, extension: &str) -> String {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    format!("{prefix}-{stamp}.{extension}")
}

fn should_treat_as_output_directory(path: &Path) -> bool {
    let raw = path.to_string_lossy();
    raw.ends_with(std::path::MAIN_SEPARATOR) || path.is_dir() || path.extension().is_none()
}

struct FileMetadata {
    file_name: Option<String>,
    file_extension: Option<String>,
    mime_type: Option<String>,
    size_bytes: Option<u64>,
    transfer_encoding: Option<String>,
}

fn build_file_metadata(
    output_path: &str,
    inline_base64: bool,
    default_mime_type: &str,
) -> FileMetadata {
    let path = Path::new(output_path);
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .map(ToOwned::to_owned);
    let file_extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(ToOwned::to_owned);
    let size_bytes = fs::metadata(path).map(|metadata| metadata.len()).ok();

    FileMetadata {
        file_name,
        file_extension,
        mime_type: Some(default_mime_type.to_string()),
        size_bytes,
        transfer_encoding: if inline_base64 {
            Some("base64".to_string())
        } else {
            Some("file".to_string())
        },
    }
}

fn resolve_camera_capture_command_path() -> Result<PathBuf> {
    let current_executable =
        env::current_exe().context("failed to resolve current executable for camera helper")?;

    if current_executable.is_file() {
        return Ok(current_executable);
    }

    bail!(
        "Yeonjang executable was not found for camera helper dispatch. Build and run Yeonjang through scripts/build-yeonjang-macos.sh or scripts/start-yeonjang-macos.sh"
    );
}

fn write_swift_screen_script() -> Result<PathBuf> {
    let script_path = env::temp_dir().join(format!(
        "yeonjang-screen-capture-{}.swift",
        std::process::id()
    ));
    fs::write(&script_path, SWIFT_SCREEN_CAPTURE)
        .with_context(|| format!("failed to write swift helper to {}", script_path.display()))?;
    Ok(script_path)
}

fn normalize_macos_screen_capture_display(display: u32) -> u32 {
    display.saturating_add(1)
}

fn write_swift_mouse_action_script() -> Result<PathBuf> {
    let script_path = env::temp_dir().join(format!(
        "yeonjang-mouse-action-{}.swift",
        std::process::id()
    ));
    fs::write(&script_path, SWIFT_MOUSE_ACTION)
        .with_context(|| format!("failed to write swift helper to {}", script_path.display()))?;
    Ok(script_path)
}

fn write_swift_mouse_position_script() -> Result<PathBuf> {
    let script_path = env::temp_dir().join(format!(
        "yeonjang-mouse-position-{}.swift",
        std::process::id()
    ));
    fs::write(&script_path, SWIFT_MOUSE_POSITION)
        .with_context(|| format!("failed to write swift helper to {}", script_path.display()))?;
    Ok(script_path)
}

fn parse_mouse_position_json(output: &str) -> Result<(i32, i32)> {
    let value = serde_json::from_str::<Value>(output.trim())
        .context("failed to parse mouse position helper JSON")?;
    let x = value
        .get("x")
        .and_then(Value::as_i64)
        .and_then(|value| i32::try_from(value).ok())
        .context("mouse position helper JSON missing x")?;
    let y = value
        .get("y")
        .and_then(Value::as_i64)
        .and_then(|value| i32::try_from(value).ok())
        .context("mouse position helper JSON missing y")?;
    Ok((x, y))
}

fn write_swift_keyboard_action_script() -> Result<PathBuf> {
    let script_path = env::temp_dir().join(format!(
        "yeonjang-keyboard-action-{}.swift",
        std::process::id()
    ));
    fs::write(&script_path, SWIFT_KEYBOARD_ACTION)
        .with_context(|| format!("failed to write swift helper to {}", script_path.display()))?;
    Ok(script_path)
}

fn slugify(input: &str) -> String {
    let mut result = String::new();
    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() {
            result.push(ch.to_ascii_lowercase());
        } else if !result.ends_with('-') {
            result.push('-');
        }
    }
    let trimmed = result.trim_matches('-');
    if trimmed.is_empty() {
        "device".to_string()
    } else {
        trimmed.to_string()
    }
}

const SWIFT_SCREEN_CAPTURE: &str = r#"
import Foundation
import CoreGraphics

let args = Array(CommandLine.arguments.dropFirst())
guard !args.isEmpty else {
    fputs("output path argument is required\n", stderr)
    exit(2)
}

let outputPath = args[0]
let outputURL = URL(fileURLWithPath: outputPath)
let outputDirectory = outputURL.deletingLastPathComponent()
if !outputDirectory.path.isEmpty {
    try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
}
var displayId: String?
var includeBase64 = false
var index = 1
while index < args.count {
    let value = args[index]
    if value == "--inline-base64" {
        includeBase64 = true
        index += 1
        continue
    }
    if value == "--display", index + 1 < args.count {
        displayId = args[index + 1]
        index += 2
        continue
    }
    index += 1
}

if !CGPreflightScreenCaptureAccess() {
    guard CGRequestScreenCaptureAccess() else {
        fputs("Screen Recording permission was not granted\n", stderr)
        exit(10)
    }
}

let task = Process()
task.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
var captureArgs = ["-x"]
if let displayId, !displayId.isEmpty {
    captureArgs.append(contentsOf: ["-D", displayId])
}
captureArgs.append(outputPath)
task.arguments = captureArgs

let stderrPipe = Pipe()
task.standardError = stderrPipe

do {
    try task.run()
    task.waitUntilExit()
} catch {
    fputs("Failed to launch screencapture: \(error)\n", stderr)
    exit(11)
}

if task.terminationStatus != 0 {
    let errorOutput = String(data: stderrPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
    fputs("screencapture failed: \(errorOutput)\n", stderr)
    exit(12)
}

var payload: [String: Any] = [
    "outputPath": outputPath,
    "mimeType": "image/png"
]
if includeBase64 {
    payload["base64Data"] = try Data(contentsOf: URL(fileURLWithPath: outputPath)).base64EncodedString()
}
let data = try JSONSerialization.data(withJSONObject: payload, options: [])
FileHandle.standardOutput.write(data)
"#;

const SWIFT_MOUSE_POSITION: &str = r#"
import Foundation
import ApplicationServices

let event = CGEvent(source: nil)
let point = event?.location ?? CGPoint(x: 0, y: 0)
let payload: [String: Int] = [
    "x": Int(point.x.rounded()),
    "y": Int(point.y.rounded())
]
let data = try JSONSerialization.data(withJSONObject: payload, options: [])
FileHandle.standardOutput.write(data)
"#;

const SWIFT_MOUSE_ACTION: &str = r#"
import Foundation
import ApplicationServices

enum MouseAction: String {
    case move
    case click
    case doubleClick = "double_click"
    case buttonDown = "button_down"
    case buttonUp = "button_up"
    case scroll
}

guard AXIsProcessTrusted() else {
    fputs("Accessibility permission was not granted\n", stderr)
    exit(20)
}

let args = Array(CommandLine.arguments.dropFirst())
guard let actionArg = args.first, let action = MouseAction(rawValue: actionArg) else {
    fputs("mouse action argument is required\n", stderr)
    exit(21)
}

var x: Double?
var y: Double?
var buttonName = "left"
var deltaX: Int32 = 0
var deltaY: Int32 = 0

var index = 1
while index < args.count {
    switch args[index] {
    case "--x":
        guard index + 1 < args.count, let value = Double(args[index + 1]) else {
            fputs("invalid --x argument\n", stderr)
            exit(22)
        }
        x = value
        index += 2
    case "--y":
        guard index + 1 < args.count, let value = Double(args[index + 1]) else {
            fputs("invalid --y argument\n", stderr)
            exit(23)
        }
        y = value
        index += 2
    case "--button":
        guard index + 1 < args.count else {
            fputs("invalid --button argument\n", stderr)
            exit(24)
        }
        buttonName = args[index + 1]
        index += 2
    case "--delta-x":
        guard index + 1 < args.count, let value = Int32(args[index + 1]) else {
            fputs("invalid --delta-x argument\n", stderr)
            exit(25)
        }
        deltaX = value
        index += 2
    case "--delta-y":
        guard index + 1 < args.count, let value = Int32(args[index + 1]) else {
            fputs("invalid --delta-y argument\n", stderr)
            exit(26)
        }
        deltaY = value
        index += 2
    default:
        fputs("unknown mouse action argument: \(args[index])\n", stderr)
        exit(27)
    }
}

func resolvePoint(required: Bool) -> CGPoint? {
    if let x, let y {
        return CGPoint(x: x, y: y)
    }
    if required {
        fputs("mouse action requires both x and y\n", stderr)
        exit(28)
    }
    return nil
}

func resolveButton(_ name: String) -> CGMouseButton {
    switch name.lowercased() {
    case "right":
        return .right
    case "middle", "center":
        return .center
    default:
        return .left
    }
}

func mouseDownType(_ button: CGMouseButton) -> CGEventType {
    switch button {
    case .right:
        return .rightMouseDown
    case .center:
        return .otherMouseDown
    default:
        return .leftMouseDown
    }
}

func mouseUpType(_ button: CGMouseButton) -> CGEventType {
    switch button {
    case .right:
        return .rightMouseUp
    case .center:
        return .otherMouseUp
    default:
        return .leftMouseUp
    }
}

func moveType(_ button: CGMouseButton) -> CGEventType {
    switch button {
    case .right:
        return .rightMouseDragged
    case .center:
        return .otherMouseDragged
    default:
        return .leftMouseDragged
    }
}

func moveCursor(to point: CGPoint) throws {
    guard let event = CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left) else {
        throw NSError(domain: "YeonjangMouse", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to build mouse move event"])
    }
    event.post(tap: .cghidEventTap)
    usleep(10_000)
}

func postMouseEvent(_ type: CGEventType, at point: CGPoint, button: CGMouseButton, clickState: Int64? = nil) throws {
    guard let event = CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: point, mouseButton: button) else {
        throw NSError(domain: "YeonjangMouse", code: 2, userInfo: [NSLocalizedDescriptionKey: "Failed to build mouse event"])
    }
    if let clickState {
        event.setIntegerValueField(.mouseEventClickState, value: clickState)
    }
    event.post(tap: .cghidEventTap)
    usleep(10_000)
}

let button = resolveButton(buttonName)

do {
    switch action {
    case .move:
        guard let point = resolvePoint(required: true) else {
            exit(28)
        }
        try moveCursor(to: point)
    case .click, .doubleClick:
        guard let point = resolvePoint(required: true) else {
            exit(28)
        }
        try moveCursor(to: point)
        let repetitions = action == .doubleClick ? 2 : 1
        for clickIndex in 0..<repetitions {
            let state = Int64(clickIndex + 1)
            try postMouseEvent(mouseDownType(button), at: point, button: button, clickState: state)
            try postMouseEvent(mouseUpType(button), at: point, button: button, clickState: state)
        }
    case .buttonDown:
        let point = resolvePoint(required: false) ?? CGEvent(source: nil)?.location ?? CGPoint.zero
        if x != nil || y != nil {
            try moveCursor(to: point)
        }
        try postMouseEvent(mouseDownType(button), at: point, button: button)
    case .buttonUp:
        let point = resolvePoint(required: false) ?? CGEvent(source: nil)?.location ?? CGPoint.zero
        if x != nil || y != nil {
            try moveCursor(to: point)
        }
        try postMouseEvent(mouseUpType(button), at: point, button: button)
    case .scroll:
        if let point = resolvePoint(required: false) {
            try moveCursor(to: point)
        }
        guard let event = CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 2, wheel1: deltaY, wheel2: deltaX, wheel3: 0) else {
            throw NSError(domain: "YeonjangMouse", code: 3, userInfo: [NSLocalizedDescriptionKey: "Failed to build scroll event"])
        }
        event.post(tap: .cghidEventTap)
    }
} catch {
    fputs("mouse action failed: \(error)\n", stderr)
    exit(29)
}
"#;

const SWIFT_KEYBOARD_ACTION: &str = r#"
import Foundation
import ApplicationServices

enum KeyboardAction: String {
    case keyPress = "key_press"
    case keyDown = "key_down"
    case keyUp = "key_up"
}

guard AXIsProcessTrusted() else {
    fputs("Accessibility permission was not granted\n", stderr)
    exit(40)
}

let args = Array(CommandLine.arguments.dropFirst())
guard let actionArg = args.first, let action = KeyboardAction(rawValue: actionArg) else {
    fputs("keyboard action argument is required\n", stderr)
    exit(41)
}

var keyCode: CGKeyCode?
var modifierCodes: [CGKeyCode] = []

var index = 1
while index < args.count {
    switch args[index] {
    case "--keycode":
        guard index + 1 < args.count, let value = UInt16(args[index + 1]) else {
            fputs("invalid --keycode argument\n", stderr)
            exit(42)
        }
        keyCode = CGKeyCode(value)
        index += 2
    case "--modifier":
        guard index + 1 < args.count, let value = UInt16(args[index + 1]) else {
            fputs("invalid --modifier argument\n", stderr)
            exit(43)
        }
        modifierCodes.append(CGKeyCode(value))
        index += 2
    default:
        fputs("unknown keyboard action argument: \(args[index])\n", stderr)
        exit(44)
    }
}

guard let keyCode else {
    fputs("keyboard action requires --keycode\n", stderr)
    exit(45)
}

func postKey(_ code: CGKeyCode, down: Bool) throws {
    guard let event = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: down) else {
        throw NSError(domain: "YeonjangKeyboard", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to build keyboard event"])
    }
    event.post(tap: .cghidEventTap)
    usleep(8_000)
}

func postModifierSequence(_ codes: [CGKeyCode], down: Bool) throws {
    let ordered = down ? codes : codes.reversed()
    for code in ordered {
        try postKey(code, down: down)
    }
}

do {
    switch action {
    case .keyPress:
        try postModifierSequence(modifierCodes, down: true)
        try postKey(keyCode, down: true)
        try postKey(keyCode, down: false)
        try postModifierSequence(modifierCodes, down: false)
    case .keyDown:
        try postModifierSequence(modifierCodes, down: true)
        try postKey(keyCode, down: true)
    case .keyUp:
        try postKey(keyCode, down: false)
        try postModifierSequence(modifierCodes, down: false)
    }
} catch {
    fputs("keyboard action failed: \(error)\n", stderr)
    exit(46)
}
"#;

#[cfg(test)]
mod tests {
    use super::{
        MacosBrowserFocusCommandPlan, MacosBrowserFocusPlanInput, MacosKeyboardTarget,
        PlatformBackend, build_macos_browser_focus_command_plan,
        build_macos_browser_focus_osascript, build_modifier_clause, build_modifier_key_codes,
        execute_macos_browser_focus_command_plan, execute_macos_browser_focus_private,
        normalize_macos_screen_capture_display, normalize_mouse_button_name,
        resolve_macos_keyboard_key_code, resolve_macos_keyboard_target,
        resolve_macos_system_control, resolve_optional_mouse_point,
    };
    use crate::automation::{AutomationBackend, SystemControlRequest};

    #[test]
    fn resolves_letter_shortcut_to_keystroke() {
        let result = resolve_macos_keyboard_target("c").expect("letter key should resolve");
        assert_eq!(result, MacosKeyboardTarget::Keystroke("c".to_string()));
    }

    #[test]
    fn resolves_named_shortcut_to_keycode() {
        let result = resolve_macos_keyboard_target("Space").expect("space key should resolve");
        assert_eq!(result, MacosKeyboardTarget::KeyCode(49));
    }

    #[test]
    fn builds_deduplicated_modifier_clause() {
        let clause = build_modifier_clause(&[
            "Command".to_string(),
            "LeftControl".to_string(),
            "cmd".to_string(),
        ])
        .expect("modifier clause should resolve");

        assert_eq!(clause, vec!["command down", "control down"]);
    }

    #[test]
    fn resolves_letter_key_to_keycode() {
        let result = resolve_macos_keyboard_key_code("c").expect("letter key should resolve");
        assert_eq!(result, 8);
    }

    #[test]
    fn resolves_named_key_to_keycode() {
        let result =
            resolve_macos_keyboard_key_code("RightArrow").expect("arrow key should resolve");
        assert_eq!(result, 124);
    }

    #[test]
    fn builds_deduplicated_modifier_key_codes() {
        let codes = build_modifier_key_codes(&[
            "Command".to_string(),
            "LeftControl".to_string(),
            "cmd".to_string(),
        ])
        .expect("modifier key codes should resolve");

        assert_eq!(codes, vec![55, 59]);
    }

    #[test]
    fn normalizes_mouse_button_aliases() {
        assert_eq!(
            normalize_mouse_button_name("center").expect("center button"),
            "middle"
        );
        assert_eq!(
            normalize_mouse_button_name("left").expect("left button"),
            "left"
        );
    }

    #[test]
    fn optional_mouse_point_requires_both_coordinates() {
        let error = resolve_optional_mouse_point(Some(10), None, "button_down")
            .expect_err("partial point should fail");
        assert!(
            error
                .to_string()
                .contains("requires both `x` and `y` when coordinates are provided")
        );
    }

    #[test]
    fn normalizes_screen_capture_display_to_one_based_index() {
        assert_eq!(normalize_macos_screen_capture_display(0), 1);
        assert_eq!(normalize_macos_screen_capture_display(1), 2);
    }

    #[test]
    fn macos_capabilities_report_system_control() {
        let capabilities = PlatformBackend.capabilities();
        assert!(capabilities.system_control);
    }

    #[test]
    fn resolves_sleep_system_control() {
        let (program, args, action, message) =
            resolve_macos_system_control(&SystemControlRequest {
                action: "sleep".to_string(),
                target: None,
            })
            .expect("sleep action should resolve");

        assert_eq!(program, "/usr/bin/pmset");
        assert_eq!(args, vec!["sleepnow"]);
        assert_eq!(action, "sleep");
        assert_eq!(message, "macOS sleep requested.");
    }

    #[test]
    fn rejects_remote_system_control_target() {
        let error = resolve_macos_system_control(&SystemControlRequest {
            action: "sleep".to_string(),
            target: Some("remote-host".to_string()),
        })
        .expect_err("remote target should fail");

        assert!(
            error
                .to_string()
                .contains("target `remote-host` is not supported")
        );
    }

    #[test]
    fn builds_browser_focus_command_plan_only_after_macos_preconditions() {
        let plan = build_macos_browser_focus_command_plan(MacosBrowserFocusPlanInput {
            approval_granted: true,
            capability_advertised: true,
            command_backend_ready: true,
            focused_target_observation_backend_ready: true,
            interactive_desktop_session: true,
            target_alias: Some("업무 브라우저".to_string()),
            process_name: Some("Google Chrome".to_string()),
            raw_window_title: Some("Private Admin Console".to_string()),
            raw_url: Some("https://example.test/admin?token=private".to_string()),
            pid: Some(4401),
            window_id: Some("window-private".to_string()),
            tab_id: Some("tab-private".to_string()),
        })
        .expect("macOS focus plan should be accepted");

        assert!(plan.command_accepted_candidate);
        assert!(!plan.execute_os_focus_now);
        assert_eq!(plan.reason_code, "macos_browser_focus_command_plan_ready");
        assert_eq!(plan.backend_family, "osascript");
        assert_eq!(plan.public_target_name, "업무 브라우저");
        assert_eq!(plan.post_check_mode, "focused_target_observation_required");
        assert_eq!(
            plan.audit_only_fields,
            vec![
                "rawWindowTitle",
                "rawUrl",
                "queryToken",
                "pid",
                "windowId",
                "tabId",
                "automationScriptText",
            ]
        );

        let public = serde_json::to_string(&plan).expect("serialize plan");
        assert!(!public.contains("Private Admin Console"));
        assert!(!public.contains("https://example.test"));
        assert!(!public.contains("token=private"));
        assert!(!public.contains("4401"));
        assert!(!public.contains("window-private"));
        assert!(!public.contains("tab-private"));
        assert!(!public.contains("osascript private"));
    }

    #[test]
    fn rejects_browser_focus_plan_without_required_gate() {
        let error = build_macos_browser_focus_command_plan(MacosBrowserFocusPlanInput {
            approval_granted: false,
            capability_advertised: true,
            command_backend_ready: true,
            focused_target_observation_backend_ready: true,
            interactive_desktop_session: true,
            target_alias: Some("업무 브라우저".to_string()),
            process_name: Some("Google Chrome".to_string()),
            raw_window_title: None,
            raw_url: None,
            pid: None,
            window_id: None,
            tab_id: None,
        })
        .expect_err("approval gate should block browser focus plan");

        assert!(
            error
                .to_string()
                .contains("side_effect_authorization_required")
        );
    }

    #[test]
    fn rejects_browser_focus_plan_without_target_identity() {
        let error = build_macos_browser_focus_command_plan(MacosBrowserFocusPlanInput {
            approval_granted: true,
            capability_advertised: true,
            command_backend_ready: true,
            focused_target_observation_backend_ready: true,
            interactive_desktop_session: true,
            target_alias: None,
            process_name: None,
            raw_window_title: None,
            raw_url: None,
            pid: None,
            window_id: None,
            tab_id: None,
        })
        .expect_err("target identity should be required");

        assert!(error.to_string().contains("target_identity_required"));
    }

    #[test]
    fn executes_browser_focus_plan_through_injected_runner() {
        let plan = build_macos_browser_focus_command_plan(MacosBrowserFocusPlanInput {
            approval_granted: true,
            capability_advertised: true,
            command_backend_ready: true,
            focused_target_observation_backend_ready: true,
            interactive_desktop_session: true,
            target_alias: Some("업무 브라우저".to_string()),
            process_name: Some("Google Chrome".to_string()),
            raw_window_title: Some("Private Admin Console".to_string()),
            raw_url: Some("https://example.test/admin?token=private".to_string()),
            pid: Some(4401),
            window_id: Some("window-private".to_string()),
            tab_id: Some("tab-private".to_string()),
        })
        .expect("plan should be ready");
        let mut called = false;

        let result = execute_macos_browser_focus_command_plan(&plan, || {
            called = true;
            Ok(true)
        });

        assert!(called);
        assert!(result.command_accepted);
        assert_eq!(result.reason_code, "macos_browser_focus_command_accepted");
        assert!(result.focused_target_observation_required);
        assert!(!result.goal_success);

        let public = serde_json::to_string(&result).expect("serialize execution result");
        assert!(!public.contains("Private Admin Console"));
        assert!(!public.contains("https://example.test"));
        assert!(!public.contains("token=private"));
        assert!(!public.contains("4401"));
        assert!(!public.contains("window-private"));
        assert!(!public.contains("tab-private"));
        assert!(!public.contains("osascript"));
    }

    #[test]
    fn maps_browser_focus_runner_rejection_to_sanitized_reason() {
        let plan = build_macos_browser_focus_command_plan(MacosBrowserFocusPlanInput {
            approval_granted: true,
            capability_advertised: true,
            command_backend_ready: true,
            focused_target_observation_backend_ready: true,
            interactive_desktop_session: true,
            target_alias: Some("업무 브라우저".to_string()),
            process_name: Some("Google Chrome".to_string()),
            raw_window_title: None,
            raw_url: None,
            pid: None,
            window_id: None,
            tab_id: None,
        })
        .expect("plan should be ready");

        let result = execute_macos_browser_focus_command_plan(&plan, || Ok(false));

        assert!(!result.command_accepted);
        assert_eq!(result.reason_code, "macos_browser_focus_command_rejected");
        assert!(result.focused_target_observation_required);
        assert!(!result.goal_success);
    }

    #[test]
    fn maps_browser_focus_runner_error_without_leaking_raw_error() {
        let plan = build_macos_browser_focus_command_plan(MacosBrowserFocusPlanInput {
            approval_granted: true,
            capability_advertised: true,
            command_backend_ready: true,
            focused_target_observation_backend_ready: true,
            interactive_desktop_session: true,
            target_alias: Some("업무 브라우저".to_string()),
            process_name: Some("Google Chrome".to_string()),
            raw_window_title: Some("Private Admin Console".to_string()),
            raw_url: Some("https://example.test/admin?token=private".to_string()),
            pid: Some(4401),
            window_id: Some("window-private".to_string()),
            tab_id: Some("tab-private".to_string()),
        })
        .expect("plan should be ready");

        let result = execute_macos_browser_focus_command_plan(&plan, || {
            anyhow::bail!("osascript private failure for window-private")
        });
        let public = serde_json::to_string(&result).expect("serialize execution result");

        assert!(!result.command_accepted);
        assert_eq!(result.reason_code, "macos_browser_focus_command_failed");
        assert!(!public.contains("osascript private"));
        assert!(!public.contains("window-private"));
        assert!(!public.contains("Private Admin Console"));
    }

    #[test]
    fn does_not_call_runner_for_unready_browser_focus_plan() {
        let plan = MacosBrowserFocusCommandPlan {
            command_accepted_candidate: false,
            execute_os_focus_now: false,
            reason_code: "command_backend_required",
            backend_family: "osascript",
            public_target_name: "업무 브라우저".to_string(),
            post_check_mode: "focused_target_observation_required",
            audit_only_fields: vec![],
        };
        let mut called = false;

        let result = execute_macos_browser_focus_command_plan(&plan, || {
            called = true;
            Ok(true)
        });

        assert!(!called);
        assert!(!result.command_accepted);
        assert_eq!(result.reason_code, "command_plan_not_ready");
        assert!(!result.goal_success);
    }

    #[test]
    fn builds_private_browser_focus_osascript_from_sanitized_plan() {
        let plan = MacosBrowserFocusCommandPlan {
            command_accepted_candidate: true,
            execute_os_focus_now: false,
            reason_code: "macos_browser_focus_command_plan_ready",
            backend_family: "osascript",
            public_target_name: "Chrome \"Work\" \\ Desk".to_string(),
            post_check_mode: "focused_target_observation_required",
            audit_only_fields: vec!["automationScriptText"],
        };

        let script = build_macos_browser_focus_osascript(&plan).expect("script should build");

        assert!(script.contains("tell application \"Chrome \\\"Work\\\" \\\\ Desk\""));
        assert!(script.contains("activate"));
        assert!(!script.contains("Private Admin Console"));
        assert!(!script.contains("https://example.test"));
        assert!(!script.contains("window-private"));
    }

    #[test]
    fn rejects_private_browser_focus_osascript_for_unready_plan() {
        let plan = MacosBrowserFocusCommandPlan {
            command_accepted_candidate: false,
            execute_os_focus_now: false,
            reason_code: "command_backend_required",
            backend_family: "osascript",
            public_target_name: "Chrome".to_string(),
            post_check_mode: "focused_target_observation_required",
            audit_only_fields: vec![],
        };

        let error = build_macos_browser_focus_osascript(&plan)
            .expect_err("unready plan should not build script");

        assert!(error.to_string().contains("command_plan_not_ready"));
    }

    #[test]
    fn browser_focus_execution_result_never_contains_private_script_text() {
        let plan = MacosBrowserFocusCommandPlan {
            command_accepted_candidate: true,
            execute_os_focus_now: false,
            reason_code: "macos_browser_focus_command_plan_ready",
            backend_family: "osascript",
            public_target_name: "Chrome".to_string(),
            post_check_mode: "focused_target_observation_required",
            audit_only_fields: vec!["automationScriptText"],
        };
        let script = build_macos_browser_focus_osascript(&plan).expect("script should build");

        let result = execute_macos_browser_focus_command_plan(&plan, || {
            assert!(script.contains("tell application"));
            Ok(true)
        });
        let public = serde_json::to_string(&result).expect("serialize execution result");

        assert!(!public.contains("tell application"));
        assert!(!public.contains("activate"));
        assert!(!public.contains("automationScriptText"));
    }

    #[test]
    fn private_browser_focus_executor_passes_script_to_injected_runner_only() {
        let mut captured_script = String::new();
        let result = execute_macos_browser_focus_private(
            MacosBrowserFocusPlanInput {
                approval_granted: true,
                capability_advertised: true,
                command_backend_ready: true,
                focused_target_observation_backend_ready: true,
                interactive_desktop_session: true,
                target_alias: Some("Chrome \"Work\"".to_string()),
                process_name: Some("Google Chrome".to_string()),
                raw_window_title: Some("Private Admin Console".to_string()),
                raw_url: Some("https://example.test/admin?token=private".to_string()),
                pid: Some(4401),
                window_id: Some("window-private".to_string()),
                tab_id: Some("tab-private".to_string()),
            },
            |script| {
                captured_script = script.to_string();
                Ok(script.contains("tell application \"Chrome \\\"Work\\\"\" to activate"))
            },
        );

        assert!(captured_script.contains("tell application"));
        assert!(result.command_accepted);
        assert_eq!(result.reason_code, "macos_browser_focus_command_accepted");
        assert!(!result.goal_success);

        let public = serde_json::to_string(&result).expect("serialize execution result");
        assert!(!public.contains("tell application"));
        assert!(!public.contains("Chrome"));
        assert!(!public.contains("Private Admin Console"));
        assert!(!public.contains("https://example.test"));
        assert!(!public.contains("token=private"));
        assert!(!public.contains("window-private"));
    }

    #[test]
    fn private_browser_focus_executor_does_not_call_runner_when_plan_is_blocked() {
        let mut called = false;
        let result = execute_macos_browser_focus_private(
            MacosBrowserFocusPlanInput {
                approval_granted: false,
                capability_advertised: true,
                command_backend_ready: true,
                focused_target_observation_backend_ready: true,
                interactive_desktop_session: true,
                target_alias: Some("Chrome".to_string()),
                process_name: Some("Google Chrome".to_string()),
                raw_window_title: None,
                raw_url: None,
                pid: None,
                window_id: None,
                tab_id: None,
            },
            |_script| {
                called = true;
                Ok(true)
            },
        );

        assert!(!called);
        assert!(!result.command_accepted);
        assert_eq!(result.reason_code, "side_effect_authorization_required");
        assert!(!result.goal_success);
    }

    #[test]
    fn private_browser_focus_executor_sanitizes_script_builder_failure() {
        let result = execute_macos_browser_focus_private(
            MacosBrowserFocusPlanInput {
                approval_granted: true,
                capability_advertised: true,
                command_backend_ready: true,
                focused_target_observation_backend_ready: true,
                interactive_desktop_session: true,
                target_alias: Some("   ".to_string()),
                process_name: None,
                raw_window_title: None,
                raw_url: None,
                pid: None,
                window_id: None,
                tab_id: None,
            },
            |_script| Ok(true),
        );

        assert!(!result.command_accepted);
        assert_eq!(result.reason_code, "target_identity_required");
        assert!(!result.goal_success);
    }
}
