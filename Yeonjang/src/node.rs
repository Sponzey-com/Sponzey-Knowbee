use anyhow::{Context, Result};
use serde_json::{Value, json};
use std::thread::{self, JoinHandle};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::automation::{
    AutomationBackend, AutomationCapabilities, KeyboardActionRequest, MouseActionRequest,
    PlatformKind,
};
use crate::features::{camera, keyboard, mouse, screen, system};
use crate::lifecycle::{SupportProfileKind, SupportProfileRuntimeInfo, runtime_support_profile};
use crate::platform::current_backend;
use crate::protocol::{Request, Response};
use crate::settings::{PermissionSettings, YeonjangSettings, load_settings};

const YEONJANG_PROTOCOL_VERSION: &str = "2026-04-16.capability-matrix.v1";

pub fn handle_request(request: Request) -> Response {
    match dispatch(&request) {
        Ok(result) => Response::ok(request.id, result),
        Err(error) => Response::error(request.id, "request_failed", format!("{error:#}")),
    }
}

pub fn spawn_request_task(request: Request) -> JoinHandle<Response> {
    thread::spawn(move || handle_request(request))
}

pub fn capabilities_payload() -> Value {
    capabilities()
}

fn dispatch(request: &Request) -> Result<Value> {
    let settings = load_settings().unwrap_or_else(|_| YeonjangSettings::default());
    let support_profile = runtime_support_profile(&settings, None);
    let runtime_capabilities = runtime_capabilities(&support_profile);
    let permissions = current_permissions();

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
        "node.capabilities" => Ok(capabilities()),
        "system.info" => system::system_info(),
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
            system::control(params)
        }
        "camera.list" => {
            ensure_runtime_support(
                runtime_capabilities.camera_management,
                "camera.list",
                &support_profile,
            )?;
            camera::list_devices()
        }
        "camera.capture" => {
            ensure_runtime_support(
                runtime_capabilities.camera_management,
                "camera.capture",
                &support_profile,
            )?;
            let params = serde_json::from_value::<camera::CaptureParams>(request.params.clone())
                .context("invalid params for camera.capture")?;
            camera::capture(params)
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
            system::exec(params)
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
            system::launch_application(params)
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
            screen::capture(params)
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
            mouse::move_cursor(params)
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
            mouse::click(params)
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
            mouse::action(params)
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
            keyboard::type_text(params)
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
            keyboard::action(params)
        }
        other => anyhow::bail!("unknown method: {other}"),
    }
}

fn capabilities() -> Value {
    let settings = load_settings().unwrap_or_else(|_| YeonjangSettings::default());
    let support_profile = runtime_support_profile(&settings, None);
    let capability_flags = runtime_capabilities(&support_profile);
    let permissions = current_permissions();
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
        "platform": capability_flags.platform,
        "capabilityHash": capability_hash(&capability_flags),
        "supportProfile": support_profile.effective_profile.as_str(),
        "configuredSupportProfile": support_profile.configured_profile.as_str(),
        "supportProfileReasonCodes": support_profile.reason_codes,
        "interactiveDesktopAvailable": support_profile.interactive_desktop_available,
        "trayRuntimeAvailable": support_profile.tray_runtime_available,
        "capabilityMatrix": capability_matrix(&capability_flags, &support_profile, last_checked_at),
        "permissions": permissions_payload(&permissions),
        "toolHealth": tool_health(&capability_flags, &permissions, last_checked_at),
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
                "name": "camera.list",
                "implemented": capability_flags.camera_management,
                "category": "camera",
                "summary": "Lists available camera devices.",
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
        "node.ping": capability_entry("node.ping", true, false, None, flags.platform, support_profile, last_checked_at),
        "node.capabilities": capability_entry("node.capabilities", true, false, None, flags.platform, support_profile, last_checked_at),
        "system.info": capability_entry("system.info", true, false, None, flags.platform, support_profile, last_checked_at),
        "camera.list": capability_entry(
            "camera.list",
            flags.camera_management,
            false,
            None,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "camera.capture": capability_entry(
            "camera.capture",
            flags.camera_management,
            true,
            None,
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "system.control": capability_entry(
            "system.control",
            flags.system_control,
            true,
            Some("allow_system_control"),
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "system.exec": capability_entry(
            "system.exec",
            flags.command_execution,
            true,
            Some("allow_shell_exec"),
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "application.launch": capability_entry(
            "application.launch",
            flags.application_launch,
            true,
            Some("allow_application_launch"),
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "screen.capture": capability_entry(
            "screen.capture",
            flags.screen_capture,
            false,
            Some("allow_screen_capture"),
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "mouse.action": capability_entry(
            "mouse.action",
            flags.mouse_control,
            true,
            Some("allow_mouse_control"),
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "mouse.move": capability_entry(
            "mouse.move",
            flags.mouse_control,
            true,
            Some("allow_mouse_control"),
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "mouse.click": capability_entry(
            "mouse.click",
            flags.mouse_control,
            true,
            Some("allow_mouse_control"),
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "keyboard.action": capability_entry(
            "keyboard.action",
            flags.keyboard_control,
            true,
            Some("allow_keyboard_control"),
            flags.platform,
            support_profile,
            last_checked_at,
        ),
        "keyboard.type": capability_entry(
            "keyboard.type",
            flags.keyboard_control,
            true,
            Some("allow_keyboard_control"),
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

fn capability_entry(
    method: &'static str,
    supported: bool,
    requires_approval: bool,
    permission_setting: Option<&'static str>,
    platform: PlatformKind,
    support_profile: &SupportProfileRuntimeInfo,
    last_checked_at: u64,
) -> Value {
    let baseline = method_metadata_for_platform(method, platform);
    let platform_baseline = json!({
        "macos": platform_method_summary(method, PlatformKind::Macos),
        "windows": platform_method_summary(method, PlatformKind::Windows),
        "linux": platform_method_summary(method, PlatformKind::Linux),
    });
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
        "supported": supported,
        "supportState": support_state,
        "requiresApproval": requires_approval,
        "requiresPermission": permission_setting.is_some(),
        "permissionSetting": permission_setting,
        "knownLimitations": known_limitations,
        "requiresInteractiveDesktop": baseline.requires_interactive_desktop,
        "broadcastSafe": baseline.broadcast_safe,
        "defaultTargetPolicy": baseline.default_target_policy,
        "outputModes": baseline.output_modes,
        "reasonCodes": reason_codes,
        "platformBaseline": platform_baseline,
        "lastCheckedAt": last_checked_at,
    })
}

fn permissions_payload(permissions: &PermissionSettings) -> Value {
    json!({
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
    last_checked_at: u64,
) -> Value {
    json!({
        "node.ping": tool_health_entry(true, true, None, last_checked_at),
        "node.capabilities": tool_health_entry(true, true, None, last_checked_at),
        "system.info": tool_health_entry(true, true, None, last_checked_at),
        "camera.list": tool_health_entry(flags.camera_management, true, None, last_checked_at),
        "camera.capture": tool_health_entry(flags.camera_management, true, None, last_checked_at),
        "system.control": tool_health_entry(flags.system_control, permissions.allow_system_control, Some("allow_system_control"), last_checked_at),
        "system.exec": tool_health_entry(flags.command_execution, permissions.allow_shell_exec, Some("allow_shell_exec"), last_checked_at),
        "application.launch": tool_health_entry(flags.application_launch, permissions.allow_application_launch, Some("allow_application_launch"), last_checked_at),
        "screen.capture": tool_health_entry(flags.screen_capture, permissions.allow_screen_capture, Some("allow_screen_capture"), last_checked_at),
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

fn current_permissions() -> PermissionSettings {
    load_settings()
        .map(|settings| settings.permissions)
        .unwrap_or_default()
}

fn runtime_capabilities(support_profile: &SupportProfileRuntimeInfo) -> AutomationCapabilities {
    let mut capability_flags = current_backend().capabilities();
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
        "camera.list" => CapabilityMethodMetadata {
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
    fn capability_entry_exposes_platform_baseline_and_target_policy() {
        let runtime = SupportProfileRuntimeInfo {
            configured_profile: SupportProfileKind::DesktopInteractive,
            effective_profile: SupportProfileKind::DesktopInteractive,
            interactive_desktop_available: true,
            tray_runtime_available: true,
            reason_codes: vec!["tray_runtime_visible".to_string()],
        };

        let entry = capability_entry(
            "screen.capture",
            true,
            false,
            Some("allow_screen_capture"),
            PlatformKind::Linux,
            &runtime,
            42,
        );

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
    fn capability_entry_marks_interactive_methods_blocked_in_headless_profile() {
        let runtime = SupportProfileRuntimeInfo {
            configured_profile: SupportProfileKind::DesktopInteractive,
            effective_profile: SupportProfileKind::HeadlessManaged,
            interactive_desktop_available: false,
            tray_runtime_available: false,
            reason_codes: vec!["interactive_desktop_unavailable".to_string()],
        };

        let entry = capability_entry(
            "screen.capture",
            false,
            false,
            Some("allow_screen_capture"),
            PlatformKind::Linux,
            &runtime,
            42,
        );

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
}
