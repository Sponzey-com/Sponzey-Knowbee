#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RiskLevel {
    Safe,
    Moderate,
    Dangerous,
}

impl RiskLevel {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Safe => "safe",
            Self::Moderate => "moderate",
            Self::Dangerous => "dangerous",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SideEffectClass {
    ReadLocal,
    Network,
    WriteLocal,
    DeleteLocal,
    ScreenRead,
    InputControl,
    ProcessControl,
    SystemControl,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RetrySafety {
    SafeNewAttempt,
    ExactReceiptRequired,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResultSchema {
    Unspecified,
    Json,
    CaptureArtifact,
    CommandExecution,
}

impl ResultSchema {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Unspecified => "unspecified",
            Self::Json => "json_result_v1",
            Self::CaptureArtifact => "capture_artifact_result_v1",
            Self::CommandExecution => "command_execution_result_v1",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TimeoutClass {
    Unspecified,
    Fast,
    Standard,
    LongRunning,
}

impl TimeoutClass {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Unspecified => "unspecified",
            Self::Fast => "fast",
            Self::Standard => "standard",
            Self::LongRunning => "long_running",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct UnknownMethodError;

impl UnknownMethodError {
    pub fn code(self) -> &'static str {
        "unknown_method"
    }

    pub fn public_message(self) -> &'static str {
        "The requested method is not supported."
    }
}

impl std::fmt::Display for UnknownMethodError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.code())
    }
}

impl std::error::Error for UnknownMethodError {}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MethodUnavailableError;

impl MethodUnavailableError {
    pub fn code(self) -> &'static str {
        "method_unavailable"
    }

    pub fn public_message(self) -> &'static str {
        "The requested method is known but is not available in this runtime."
    }
}

impl std::fmt::Display for MethodUnavailableError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.code())
    }
}

impl std::error::Error for MethodUnavailableError {}

impl SideEffectClass {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ReadLocal => "read_local",
            Self::Network => "network",
            Self::WriteLocal => "write_local",
            Self::DeleteLocal => "delete_local",
            Self::ScreenRead => "screen_read",
            Self::InputControl => "input_control",
            Self::ProcessControl => "process_control",
            Self::SystemControl => "system_control",
        }
    }

    pub fn requires_binding(self) -> bool {
        !matches!(self, Self::ReadLocal | Self::Network)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PermissionKey {
    FileRead,
    FileWrite,
    FileDelete,
    DiskRead,
    CameraAccess,
    ClipboardRead,
    ClipboardWrite,
    ProcessRead,
    BrowserRead,
    BrowserControl,
    NetworkRead,
    DeviceStatus,
    SystemControl,
    ShellExec,
    ApplicationLaunch,
    ScreenCapture,
    KeyboardControl,
    MouseControl,
}

impl PermissionKey {
    pub fn as_setting_name(self) -> &'static str {
        match self {
            Self::FileRead => "allow_file_read",
            Self::FileWrite => "allow_file_write",
            Self::FileDelete => "allow_file_delete",
            Self::DiskRead => "allow_disk_read",
            Self::CameraAccess => "allow_camera_access",
            Self::ClipboardRead => "allow_clipboard_read",
            Self::ClipboardWrite => "allow_clipboard_write",
            Self::ProcessRead => "allow_process_read",
            Self::BrowserRead => "allow_browser_read",
            Self::BrowserControl => "allow_browser_control",
            Self::NetworkRead => "allow_network_read",
            Self::DeviceStatus => "allow_device_status",
            Self::SystemControl => "allow_system_control",
            Self::ShellExec => "allow_shell_exec",
            Self::ApplicationLaunch => "allow_application_launch",
            Self::ScreenCapture => "allow_screen_capture",
            Self::KeyboardControl => "allow_keyboard_control",
            Self::MouseControl => "allow_mouse_control",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum MethodResource {
    System,
    Filesystem,
    Disk,
    Process,
    Browser,
    Clipboard,
    Network,
    Device,
    Camera,
    Screen,
    DesktopControl,
    Mouse,
    Keyboard,
}

impl MethodResource {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::System => "system",
            Self::Filesystem => "filesystem",
            Self::Disk => "disk",
            Self::Process => "process",
            Self::Browser => "browser",
            Self::Clipboard => "clipboard",
            Self::Network => "network",
            Self::Device => "device",
            Self::Camera => "camera",
            Self::Screen => "screen",
            Self::DesktopControl => "desktop_control",
            Self::Mouse => "mouse",
            Self::Keyboard => "keyboard",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MethodDescriptor {
    pub group: &'static str,
    pub risk: RiskLevel,
    pub side_effect: SideEffectClass,
    pub permission: Option<PermissionKey>,
    pub resource: MethodResource,
    pub timeout: TimeoutClass,
    pub executor_available: bool,
    pub requires_approval: bool,
    pub cancellable: bool,
    pub post_check_required: bool,
    pub retry_safety: RetrySafety,
    pub params_schema: ParamsSchema,
    pub result_schema: ResultSchema,
}

impl MethodDescriptor {
    pub fn requires_side_effect_binding(self) -> bool {
        self.side_effect.requires_binding()
    }
}

const ALL_METHOD_NAMES: &[&str] = &[
    "node.ping",
    "node.capabilities",
    "system.info",
    "file.metadata",
    "file.list",
    "file.read",
    "file.search",
    "file.write",
    "file.patch",
    "file.delete",
    "disk.info",
    "disk.usage",
    "disk.exists",
    "process.list",
    "process.info",
    "browser.list",
    "browser.active_hint",
    "browser.active_tab_info",
    "browser.open_url",
    "browser.focus",
    "clipboard.read",
    "clipboard.write",
    "network.status",
    "device.status",
    "camera.list",
    "camera.permission_status",
    "camera.capture",
    "system.control",
    "system.exec",
    "application.launch",
    "screen.capture",
    "mouse.position",
    "input.focused_target",
    "mouse.action",
    "mouse.move",
    "mouse.click",
    "keyboard.action",
    "keyboard.type",
];

pub fn all_method_names() -> &'static [&'static str] {
    ALL_METHOD_NAMES
}

pub fn method_descriptor(method: &str) -> Option<MethodDescriptor> {
    let (group, risk, side_effect, permission, resource) = match method {
        "node.ping" | "node.capabilities" | "system.info" => (
            "system",
            RiskLevel::Safe,
            SideEffectClass::ReadLocal,
            None,
            MethodResource::System,
        ),
        "file.metadata" | "file.list" | "file.read" | "file.search" => (
            "files",
            RiskLevel::Safe,
            SideEffectClass::ReadLocal,
            Some(PermissionKey::FileRead),
            MethodResource::Filesystem,
        ),
        "file.write" | "file.patch" => (
            "files",
            RiskLevel::Moderate,
            SideEffectClass::WriteLocal,
            Some(PermissionKey::FileWrite),
            MethodResource::Filesystem,
        ),
        "file.delete" => (
            "files",
            RiskLevel::Dangerous,
            SideEffectClass::DeleteLocal,
            Some(PermissionKey::FileDelete),
            MethodResource::Filesystem,
        ),
        "disk.info" | "disk.usage" | "disk.exists" => (
            "disk",
            RiskLevel::Safe,
            SideEffectClass::ReadLocal,
            Some(PermissionKey::DiskRead),
            MethodResource::Disk,
        ),
        "process.list" | "process.info" => (
            "process",
            RiskLevel::Safe,
            SideEffectClass::ReadLocal,
            Some(PermissionKey::ProcessRead),
            MethodResource::Process,
        ),
        "browser.list" | "browser.active_hint" | "browser.active_tab_info" => (
            "browser",
            if method == "browser.active_tab_info" {
                RiskLevel::Moderate
            } else {
                RiskLevel::Safe
            },
            SideEffectClass::ReadLocal,
            Some(PermissionKey::BrowserRead),
            MethodResource::Browser,
        ),
        "browser.open_url" | "browser.focus" => (
            "browser",
            RiskLevel::Moderate,
            SideEffectClass::ProcessControl,
            Some(PermissionKey::BrowserControl),
            MethodResource::DesktopControl,
        ),
        "clipboard.read" => (
            "clipboard",
            RiskLevel::Safe,
            SideEffectClass::ReadLocal,
            Some(PermissionKey::ClipboardRead),
            MethodResource::Clipboard,
        ),
        "clipboard.write" => (
            "clipboard",
            RiskLevel::Moderate,
            SideEffectClass::WriteLocal,
            Some(PermissionKey::ClipboardWrite),
            MethodResource::Clipboard,
        ),
        "network.status" => (
            "network",
            RiskLevel::Safe,
            SideEffectClass::Network,
            Some(PermissionKey::NetworkRead),
            MethodResource::Network,
        ),
        "device.status" => (
            "device",
            RiskLevel::Safe,
            SideEffectClass::ReadLocal,
            Some(PermissionKey::DeviceStatus),
            MethodResource::Device,
        ),
        "camera.list" | "camera.permission_status" => (
            "camera",
            RiskLevel::Safe,
            SideEffectClass::ReadLocal,
            Some(PermissionKey::CameraAccess),
            MethodResource::Camera,
        ),
        "camera.capture" => (
            "camera",
            RiskLevel::Moderate,
            SideEffectClass::ScreenRead,
            Some(PermissionKey::CameraAccess),
            MethodResource::Camera,
        ),
        "screen.capture" => (
            "screen",
            RiskLevel::Moderate,
            SideEffectClass::ScreenRead,
            Some(PermissionKey::ScreenCapture),
            MethodResource::Screen,
        ),
        "mouse.position" => (
            "input",
            RiskLevel::Safe,
            SideEffectClass::ReadLocal,
            Some(PermissionKey::MouseControl),
            MethodResource::Mouse,
        ),
        "input.focused_target" => (
            "input",
            RiskLevel::Safe,
            SideEffectClass::ReadLocal,
            Some(PermissionKey::KeyboardControl),
            MethodResource::Keyboard,
        ),
        "mouse.action" | "mouse.move" | "mouse.click" => (
            "input",
            RiskLevel::Moderate,
            SideEffectClass::InputControl,
            Some(PermissionKey::MouseControl),
            MethodResource::DesktopControl,
        ),
        "keyboard.action" | "keyboard.type" => (
            "input",
            RiskLevel::Moderate,
            SideEffectClass::InputControl,
            Some(PermissionKey::KeyboardControl),
            MethodResource::DesktopControl,
        ),
        "system.exec" => (
            "command",
            RiskLevel::Dangerous,
            SideEffectClass::SystemControl,
            Some(PermissionKey::ShellExec),
            MethodResource::System,
        ),
        "system.control" => (
            "system",
            RiskLevel::Dangerous,
            SideEffectClass::SystemControl,
            Some(PermissionKey::SystemControl),
            MethodResource::System,
        ),
        "application.launch" => (
            "applications",
            RiskLevel::Moderate,
            SideEffectClass::ProcessControl,
            Some(PermissionKey::ApplicationLaunch),
            MethodResource::Process,
        ),
        _ => return None,
    };
    let side_effecting = side_effect.requires_binding();
    let retry_safety = if side_effecting {
        RetrySafety::ExactReceiptRequired
    } else {
        RetrySafety::SafeNewAttempt
    };
    let params_schema = match method {
        "camera.capture" => ParamsSchema::CameraCapture,
        "screen.capture" => ParamsSchema::ScreenCapture,
        _ => ParamsSchema::ExecutorTyped,
    };
    let result_schema = match method {
        "camera.capture" | "screen.capture" => ResultSchema::CaptureArtifact,
        "system.exec" => ResultSchema::CommandExecution,
        _ => ResultSchema::Json,
    };
    let timeout = match method {
        "node.ping"
        | "node.capabilities"
        | "system.info"
        | "file.metadata"
        | "disk.info"
        | "disk.usage"
        | "disk.exists"
        | "process.info"
        | "browser.active_hint"
        | "camera.permission_status"
        | "mouse.position"
        | "input.focused_target" => TimeoutClass::Fast,
        "file.search" | "camera.capture" | "screen.capture" | "system.exec" => {
            TimeoutClass::LongRunning
        }
        _ => TimeoutClass::Standard,
    };
    Some(MethodDescriptor {
        group,
        risk,
        side_effect,
        permission,
        resource,
        timeout,
        executor_available: method != "browser.active_tab_info",
        requires_approval: side_effecting || method == "browser.active_tab_info",
        cancellable: side_effecting,
        post_check_required: side_effecting,
        retry_safety,
        params_schema,
        result_schema,
    })
}
use crate::params_schema::ParamsSchema;
