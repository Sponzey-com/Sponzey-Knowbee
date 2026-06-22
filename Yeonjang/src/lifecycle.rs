use std::env;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::settings::YeonjangSettings;

pub const STARTUP_MODE_ENV: &str = "YEONJANG_STARTUP_MODE";
pub const SUPPORT_PROFILE_ENV: &str = "YEONJANG_SUPPORT_PROFILE";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SupportProfileKind {
    DesktopInteractive,
    DesktopLimited,
    HeadlessManaged,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StartupSource {
    Manual,
    Autostart,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StartupMode {
    Manual,
    Autostart,
    Managed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WindowModeState {
    Visible,
    Hidden,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrayState {
    Visible,
    Unsupported,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CloseBehavior {
    HideToTray,
    Quit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LifecycleCommand {
    None,
    ShowWindow,
    HideWindow,
    QuitApp,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WindowLifecyclePolicy {
    pub support_profile: SupportProfileKind,
    pub startup_mode: StartupMode,
    pub initial_window_mode: WindowModeState,
    pub tray_icon_expected: bool,
    pub close_behavior: CloseBehavior,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LifecycleRegistrationState {
    pub startup_mode: StartupMode,
    pub window_mode: WindowModeState,
    pub tray_state: TrayState,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SupportProfileRuntimeInfo {
    pub configured_profile: SupportProfileKind,
    pub effective_profile: SupportProfileKind,
    pub interactive_desktop_available: bool,
    pub tray_runtime_available: bool,
    pub reason_codes: Vec<String>,
}

pub type SharedLifecycleState = Arc<Mutex<LifecycleRegistrationState>>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LifecycleMachine {
    policy: WindowLifecyclePolicy,
    state: LifecycleRegistrationState,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AutostartPlatformPaths {
    pub startup_entry_path: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AutostartSyncResult {
    pub enabled: bool,
    pub entry_path: PathBuf,
    pub changed: bool,
}

impl SupportProfileKind {
    pub fn from_settings_value(value: &str) -> Self {
        match value.trim().to_lowercase().as_str() {
            "desktop_limited" => Self::DesktopLimited,
            "headless_managed" => Self::HeadlessManaged,
            _ => Self::DesktopInteractive,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::DesktopInteractive => "desktop_interactive",
            Self::DesktopLimited => "desktop_limited",
            Self::HeadlessManaged => "headless_managed",
        }
    }
}

impl StartupSource {
    pub fn detect() -> Self {
        match env::var(STARTUP_MODE_ENV) {
            Ok(value) if value.trim().eq_ignore_ascii_case("autostart") => Self::Autostart,
            _ => Self::Manual,
        }
    }
}

impl StartupMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Manual => "manual",
            Self::Autostart => "autostart",
            Self::Managed => "managed",
        }
    }
}

impl WindowModeState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Visible => "visible",
            Self::Hidden => "hidden",
        }
    }
}

impl TrayState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Visible => "visible",
            Self::Unsupported => "unsupported",
            Self::Unavailable => "unavailable",
        }
    }
}

pub fn build_window_lifecycle_policy(
    support_profile: SupportProfileKind,
    startup_source: StartupSource,
) -> WindowLifecyclePolicy {
    match support_profile {
        SupportProfileKind::DesktopInteractive => WindowLifecyclePolicy {
            support_profile,
            startup_mode: match startup_source {
                StartupSource::Manual => StartupMode::Manual,
                StartupSource::Autostart => StartupMode::Autostart,
            },
            initial_window_mode: WindowModeState::Hidden,
            tray_icon_expected: true,
            close_behavior: CloseBehavior::HideToTray,
        },
        SupportProfileKind::DesktopLimited => WindowLifecyclePolicy {
            support_profile,
            startup_mode: match startup_source {
                StartupSource::Manual => StartupMode::Manual,
                StartupSource::Autostart => StartupMode::Autostart,
            },
            initial_window_mode: WindowModeState::Visible,
            tray_icon_expected: false,
            close_behavior: CloseBehavior::Quit,
        },
        SupportProfileKind::HeadlessManaged => WindowLifecyclePolicy {
            support_profile,
            startup_mode: StartupMode::Managed,
            initial_window_mode: WindowModeState::Visible,
            tray_icon_expected: false,
            close_behavior: CloseBehavior::Quit,
        },
    }
}

pub fn initial_lifecycle_state(
    policy: WindowLifecyclePolicy,
    tray_available: bool,
) -> LifecycleRegistrationState {
    let tray_state = if policy.tray_icon_expected {
        if tray_available {
            TrayState::Visible
        } else {
            TrayState::Unavailable
        }
    } else {
        TrayState::Unsupported
    };
    let window_mode = match policy.support_profile {
        SupportProfileKind::HeadlessManaged => WindowModeState::Hidden,
        _ if policy.initial_window_mode == WindowModeState::Hidden && tray_available => {
            WindowModeState::Hidden
        }
        _ => WindowModeState::Visible,
    };
    LifecycleRegistrationState {
        startup_mode: policy.startup_mode,
        window_mode,
        tray_state,
    }
}

pub fn managed_runtime_state() -> LifecycleRegistrationState {
    LifecycleRegistrationState {
        startup_mode: StartupMode::Managed,
        window_mode: WindowModeState::Hidden,
        tray_state: TrayState::Unsupported,
    }
}

pub fn new_shared_lifecycle_state(state: LifecycleRegistrationState) -> SharedLifecycleState {
    Arc::new(Mutex::new(state))
}

pub fn read_shared_lifecycle_state(shared: &SharedLifecycleState) -> LifecycleRegistrationState {
    shared
        .lock()
        .map(|state| *state)
        .unwrap_or(LifecycleRegistrationState {
            startup_mode: StartupMode::Managed,
            window_mode: WindowModeState::Visible,
            tray_state: TrayState::Unavailable,
        })
}

pub fn write_shared_lifecycle_state(
    shared: &SharedLifecycleState,
    next: LifecycleRegistrationState,
) {
    if let Ok(mut state) = shared.lock() {
        *state = next;
    }
}

impl LifecycleMachine {
    pub fn new(policy: WindowLifecyclePolicy, tray_available: bool) -> Self {
        Self {
            policy,
            state: initial_lifecycle_state(policy, tray_available),
        }
    }

    pub fn state(&self) -> LifecycleRegistrationState {
        self.state
    }

    pub fn tray_available(&self) -> bool {
        self.state.tray_state == TrayState::Visible
    }

    pub fn expects_tray(&self) -> bool {
        self.policy.tray_icon_expected
    }

    pub fn initial_window_visible(&self) -> bool {
        self.policy.initial_window_mode == WindowModeState::Visible
    }

    pub fn sync_tray_availability(&mut self, tray_available: bool) {
        self.state = initial_lifecycle_state(self.policy, tray_available);
    }

    pub fn show_window(&mut self) -> LifecycleCommand {
        self.state.window_mode = WindowModeState::Visible;
        LifecycleCommand::ShowWindow
    }

    pub fn hide_window(&mut self) -> LifecycleCommand {
        if !self.tray_available() || self.state.window_mode == WindowModeState::Hidden {
            return LifecycleCommand::None;
        }
        self.state.window_mode = WindowModeState::Hidden;
        LifecycleCommand::HideWindow
    }

    pub fn handle_close_request(&mut self) -> LifecycleCommand {
        match self.policy.close_behavior {
            CloseBehavior::HideToTray if self.tray_available() => self.hide_window(),
            CloseBehavior::HideToTray | CloseBehavior::Quit => LifecycleCommand::QuitApp,
        }
    }

    pub fn quit(&self) -> LifecycleCommand {
        LifecycleCommand::QuitApp
    }

    pub fn force_foreground_fallback(&mut self) -> LifecycleCommand {
        self.state.window_mode = WindowModeState::Visible;
        self.state.tray_state = TrayState::Unavailable;
        LifecycleCommand::ShowWindow
    }
}

pub fn current_policy_from_settings(settings: &YeonjangSettings) -> WindowLifecyclePolicy {
    build_window_lifecycle_policy(
        configured_support_profile(settings),
        StartupSource::detect(),
    )
}

pub fn configured_support_profile(settings: &YeonjangSettings) -> SupportProfileKind {
    resolve_configured_support_profile(
        env::var(SUPPORT_PROFILE_ENV).ok().as_deref(),
        Some(settings.support_profile.as_str()),
    )
}

pub fn runtime_support_profile(
    settings: &YeonjangSettings,
    lifecycle: Option<&LifecycleRegistrationState>,
) -> SupportProfileRuntimeInfo {
    runtime_support_profile_from_inputs(
        configured_support_profile(settings),
        detect_interactive_desktop_available(),
        lifecycle.map(|state| state.tray_state),
    )
}

pub fn runtime_support_profile_from_inputs(
    configured: SupportProfileKind,
    interactive_desktop_available: bool,
    tray_state: Option<TrayState>,
) -> SupportProfileRuntimeInfo {
    let mut effective_profile = configured;
    let mut reason_codes = Vec::new();

    if !interactive_desktop_available {
        effective_profile = SupportProfileKind::HeadlessManaged;
        reason_codes.push("interactive_desktop_unavailable".to_string());
    } else {
        match configured {
            SupportProfileKind::DesktopInteractive => match tray_state {
                Some(TrayState::Visible) => {
                    reason_codes.push("tray_runtime_visible".to_string());
                }
                Some(TrayState::Unavailable) => {
                    effective_profile = SupportProfileKind::DesktopLimited;
                    reason_codes.push("tray_runtime_unavailable".to_string());
                }
                Some(TrayState::Unsupported) => {
                    effective_profile = SupportProfileKind::DesktopLimited;
                    reason_codes.push("tray_runtime_unsupported".to_string());
                }
                None => {}
            },
            SupportProfileKind::DesktopLimited => {
                reason_codes.push("configured_desktop_limited".to_string());
            }
            SupportProfileKind::HeadlessManaged => {
                reason_codes.push("configured_headless_managed".to_string());
            }
        }
    }

    SupportProfileRuntimeInfo {
        configured_profile: configured,
        effective_profile,
        interactive_desktop_available,
        tray_runtime_available: matches!(tray_state, Some(TrayState::Visible)),
        reason_codes,
    }
}

fn resolve_configured_support_profile(
    env_override: Option<&str>,
    settings_value: Option<&str>,
) -> SupportProfileKind {
    if let Some(value) = env_override {
        let normalized = value.trim();
        if !normalized.is_empty() {
            return SupportProfileKind::from_settings_value(normalized);
        }
    }
    SupportProfileKind::from_settings_value(settings_value.unwrap_or_default())
}

fn detect_interactive_desktop_available() -> bool {
    #[cfg(target_os = "linux")]
    {
        let has_display = env::var("DISPLAY")
            .ok()
            .is_some_and(|value| !value.trim().is_empty());
        let has_wayland = env::var("WAYLAND_DISPLAY")
            .ok()
            .is_some_and(|value| !value.trim().is_empty());
        return has_display || has_wayland;
    }

    #[cfg(not(target_os = "linux"))]
    {
        true
    }
}

fn startup_paths_for_current_platform() -> Result<AutostartPlatformPaths> {
    #[cfg(target_os = "macos")]
    {
        let home = env::var("HOME").context("HOME is not set")?;
        return Ok(AutostartPlatformPaths {
            startup_entry_path: PathBuf::from(home)
                .join("Library")
                .join("LaunchAgents")
                .join("com.sponzey.knowbee.yeonjang.plist"),
        });
    }

    #[cfg(target_os = "windows")]
    {
        let app_data = env::var("APPDATA").context("APPDATA is not set")?;
        return Ok(AutostartPlatformPaths {
            startup_entry_path: PathBuf::from(app_data)
                .join("Microsoft")
                .join("Windows")
                .join("Start Menu")
                .join("Programs")
                .join("Startup")
                .join("Yeonjang Startup.cmd"),
        });
    }

    #[cfg(target_os = "linux")]
    {
        let home = env::var("HOME").context("HOME is not set")?;
        return Ok(AutostartPlatformPaths {
            startup_entry_path: PathBuf::from(home)
                .join(".config")
                .join("autostart")
                .join("com.sponzey.knowbee.yeonjang.desktop"),
        });
    }

    #[allow(unreachable_code)]
    Err(anyhow::anyhow!(
        "autostart sync is not implemented for this platform"
    ))
}

#[cfg(target_os = "linux")]
fn shell_escape_single_quotes(value: &str) -> String {
    value.replace('\'', "'\"'\"'")
}

fn build_autostart_entry_content(path: &PathBuf) -> String {
    let executable = path.display().to_string();

    #[cfg(target_os = "macos")]
    {
        format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.sponzey.knowbee.yeonjang</string>
  <key>ProgramArguments</key>
  <array>
    <string>{executable}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>{}</key>
    <string>autostart</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
</dict>
</plist>
"#,
            STARTUP_MODE_ENV,
        )
    }

    #[cfg(target_os = "windows")]
    {
        format!(
            "@echo off\r\nset \"{}=autostart\"\r\nstart \"\" \"{}\"\r\n",
            STARTUP_MODE_ENV, executable
        )
    }

    #[cfg(target_os = "linux")]
    {
        format!(
            "[Desktop Entry]\nType=Application\nVersion=1.0\nName=Yeonjang\nComment=Knowbee Yeonjang tray app\nExec=env {}=autostart '{}'\nTerminal=false\nX-GNOME-Autostart-enabled=true\n",
            STARTUP_MODE_ENV,
            shell_escape_single_quotes(&executable),
        )
    }
}

pub fn sync_launch_on_startup(settings: &YeonjangSettings) -> Result<AutostartSyncResult> {
    let paths = startup_paths_for_current_platform()?;
    let executable = env::current_exe().context("failed to resolve current executable path")?;
    let entry_path = paths.startup_entry_path;
    let changed = if settings.connection.launch_on_system_start {
        if let Some(parent) = entry_path.parent() {
            fs::create_dir_all(parent).with_context(|| {
                format!("failed to create autostart directory: {}", parent.display())
            })?;
        }
        let content = build_autostart_entry_content(&executable);
        let previous = fs::read_to_string(&entry_path).ok();
        if previous.as_deref() == Some(content.as_str()) {
            false
        } else {
            fs::write(&entry_path, content).with_context(|| {
                format!("failed to write autostart entry: {}", entry_path.display())
            })?;
            true
        }
    } else if entry_path.exists() {
        fs::remove_file(&entry_path).with_context(|| {
            format!("failed to remove autostart entry: {}", entry_path.display())
        })?;
        true
    } else {
        false
    };

    Ok(AutostartSyncResult {
        enabled: settings.connection.launch_on_system_start,
        entry_path,
        changed,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn desktop_interactive_starts_hidden_when_tray_is_available() {
        let policy = build_window_lifecycle_policy(
            SupportProfileKind::DesktopInteractive,
            StartupSource::Manual,
        );
        let state = initial_lifecycle_state(policy, true);

        assert_eq!(state.startup_mode, StartupMode::Manual);
        assert_eq!(state.window_mode, WindowModeState::Hidden);
        assert_eq!(state.tray_state, TrayState::Visible);
    }

    #[test]
    fn desktop_limited_starts_foreground_without_tray_dependency() {
        let policy = build_window_lifecycle_policy(
            SupportProfileKind::DesktopLimited,
            StartupSource::Manual,
        );
        let state = initial_lifecycle_state(policy, false);

        assert_eq!(state.startup_mode, StartupMode::Manual);
        assert_eq!(state.window_mode, WindowModeState::Visible);
        assert_eq!(state.tray_state, TrayState::Unsupported);
    }

    #[test]
    fn headless_managed_uses_hidden_no_tray_state() {
        let policy = build_window_lifecycle_policy(
            SupportProfileKind::HeadlessManaged,
            StartupSource::Manual,
        );
        let state = initial_lifecycle_state(policy, false);

        assert_eq!(state.startup_mode, StartupMode::Managed);
        assert_eq!(state.window_mode, WindowModeState::Hidden);
        assert_eq!(state.tray_state, TrayState::Unsupported);
    }

    #[test]
    fn runtime_profile_downgrades_interactive_to_headless_without_desktop() {
        let runtime = runtime_support_profile_from_inputs(
            SupportProfileKind::DesktopInteractive,
            false,
            Some(TrayState::Unavailable),
        );

        assert_eq!(
            runtime.configured_profile,
            SupportProfileKind::DesktopInteractive
        );
        assert_eq!(
            runtime.effective_profile,
            SupportProfileKind::HeadlessManaged
        );
        assert_eq!(
            runtime.reason_codes,
            vec!["interactive_desktop_unavailable"]
        );
        assert!(!runtime.tray_runtime_available);
    }

    #[test]
    fn runtime_profile_downgrades_interactive_to_desktop_limited_when_tray_is_unavailable() {
        let runtime = runtime_support_profile_from_inputs(
            SupportProfileKind::DesktopInteractive,
            true,
            Some(TrayState::Unavailable),
        );

        assert_eq!(
            runtime.effective_profile,
            SupportProfileKind::DesktopLimited
        );
        assert_eq!(runtime.reason_codes, vec!["tray_runtime_unavailable"]);
    }

    #[test]
    fn env_override_takes_precedence_over_settings_value() {
        let configured = resolve_configured_support_profile(
            Some("headless_managed"),
            Some("desktop_interactive"),
        );

        assert_eq!(configured, SupportProfileKind::HeadlessManaged);
    }

    #[test]
    fn close_request_hides_to_tray_for_interactive_policy() {
        let policy = build_window_lifecycle_policy(
            SupportProfileKind::DesktopInteractive,
            StartupSource::Manual,
        );
        let mut machine = LifecycleMachine::new(policy, true);
        let show = machine.show_window();
        let close = machine.handle_close_request();

        assert_eq!(show, LifecycleCommand::ShowWindow);
        assert_eq!(close, LifecycleCommand::HideWindow);
        assert_eq!(machine.state().window_mode, WindowModeState::Hidden);
    }

    #[test]
    fn explicit_quit_is_distinct_from_close_to_tray() {
        let policy = build_window_lifecycle_policy(
            SupportProfileKind::DesktopInteractive,
            StartupSource::Autostart,
        );
        let machine = LifecycleMachine::new(policy, true);

        assert_eq!(machine.quit(), LifecycleCommand::QuitApp);
        assert_eq!(machine.state().startup_mode, StartupMode::Autostart);
    }

    #[test]
    fn repeated_show_keeps_single_visible_window_state() {
        let policy = build_window_lifecycle_policy(
            SupportProfileKind::DesktopInteractive,
            StartupSource::Manual,
        );
        let mut machine = LifecycleMachine::new(policy, true);

        let first = machine.show_window();
        let second = machine.show_window();

        assert_eq!(first, LifecycleCommand::ShowWindow);
        assert_eq!(second, LifecycleCommand::ShowWindow);
        assert_eq!(machine.state().window_mode, WindowModeState::Visible);
    }

    #[test]
    fn close_request_quits_when_tray_is_unavailable() {
        let policy = build_window_lifecycle_policy(
            SupportProfileKind::DesktopInteractive,
            StartupSource::Manual,
        );
        let mut machine = LifecycleMachine::new(policy, false);

        let command = machine.handle_close_request();

        assert_eq!(command, LifecycleCommand::QuitApp);
        assert_eq!(machine.state().tray_state, TrayState::Unavailable);
    }
}
