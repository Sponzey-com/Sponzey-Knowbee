use std::fs;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub const TEST_JPEG: &[u8] = &[
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x01, 0x00, 0x01, 0x03, 0x01, 0x11, 0x00, 0x02,
    0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9,
];
pub const TEST_PNG: &[u8] = &[
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0xf0,
    0x1f, 0x00, 0x05, 0x00, 0x01, 0xff, 0x89, 0x99, 0x3d, 0x1d, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
    0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
];

use anyhow::{Result, bail};
use knowbee_yeonjang::automation::{
    ApplicationLaunchRequest, ApplicationLaunchResult, AutomationBackend, AutomationCapabilities,
    CameraCaptureProcessError, CameraCaptureRequest, CameraCaptureResult, CameraDevice,
    CameraPermissionState, CameraPermissionStatus, CommandExecutionRequest, CommandExecutionResult,
    FocusedTargetResult, KeyboardTypeRequest, KeyboardTypeResult, MouseClickRequest,
    MouseClickResult, MouseMoveRequest, MouseMoveResult, MousePositionResult, PlatformKind,
    ScreenCaptureRequest, ScreenCaptureResult, SystemControlRequest, SystemControlResult,
    SystemSnapshot,
};

#[derive(Default)]
pub struct SystemInfoTestBackend {
    system_info_calls: AtomicUsize,
    fail_system_info: bool,
    camera_capture_calls: AtomicUsize,
    camera_timeout: bool,
    screen_capture_calls: AtomicUsize,
    omit_capture_output: bool,
    events: Option<Arc<Mutex<Vec<&'static str>>>>,
    wait_for_camera_cancellation: bool,
    camera_capture_started: std::sync::atomic::AtomicBool,
    camera_permission_status: Option<CameraPermissionStatus>,
}

impl SystemInfoTestBackend {
    #[allow(dead_code)]
    pub fn with_private_system_info_failure() -> Self {
        Self {
            fail_system_info: true,
            ..Default::default()
        }
    }

    #[allow(dead_code)]
    pub fn system_info_calls(&self) -> usize {
        self.system_info_calls.load(Ordering::SeqCst)
    }

    #[allow(dead_code)]
    pub fn with_camera_timeout() -> Self {
        Self {
            camera_timeout: true,
            ..Default::default()
        }
    }

    #[allow(dead_code)]
    pub fn with_missing_capture_artifacts() -> Self {
        Self {
            omit_capture_output: true,
            ..Default::default()
        }
    }

    #[allow(dead_code)]
    pub fn with_events(events: Arc<Mutex<Vec<&'static str>>>) -> Self {
        Self {
            events: Some(events),
            ..Default::default()
        }
    }

    #[allow(dead_code)]
    pub fn with_cancellation_wait() -> Self {
        Self {
            wait_for_camera_cancellation: true,
            ..Default::default()
        }
    }

    #[allow(dead_code)]
    pub fn with_requestable_camera_permission() -> Self {
        Self {
            camera_permission_status: Some(CameraPermissionStatus {
                status: CameraPermissionState::NotDetermined,
                reason: "camera_permission_not_determined".to_string(),
                platform: PlatformKind::Macos,
                can_attempt_capture: true,
                requires_user_action: true,
            }),
            ..Default::default()
        }
    }

    #[allow(dead_code)]
    pub fn camera_capture_calls(&self) -> usize {
        self.camera_capture_calls.load(Ordering::SeqCst)
    }

    #[allow(dead_code)]
    pub fn camera_capture_started(&self) -> bool {
        self.camera_capture_started.load(Ordering::SeqCst)
    }

    #[allow(dead_code)]
    pub fn screen_capture_calls(&self) -> usize {
        self.screen_capture_calls.load(Ordering::SeqCst)
    }
}

impl AutomationBackend for SystemInfoTestBackend {
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
        self.system_info_calls.fetch_add(1, Ordering::SeqCst);
        if self.fail_system_info {
            bail!("/Users/private/capture failed with token=controlled-secret-value");
        }
        Ok(SystemSnapshot {
            node: "controlled-test-node".to_string(),
            version: "test".to_string(),
            platform: PlatformKind::Unknown,
            os: "controlled-test-os".to_string(),
            arch: "test-arch".to_string(),
            current_dir: "redacted".to_string(),
            executable: "controlled-test".to_string(),
            user: None,
        })
    }

    fn control_system(&self, _: SystemControlRequest) -> Result<SystemControlResult> {
        bail!("unsupported by controlled test backend")
    }

    fn execute_command(&self, _: CommandExecutionRequest) -> Result<CommandExecutionResult> {
        bail!("unsupported by controlled test backend")
    }

    fn launch_application(&self, _: ApplicationLaunchRequest) -> Result<ApplicationLaunchResult> {
        bail!("unsupported by controlled test backend")
    }

    fn list_cameras(&self) -> Result<Vec<CameraDevice>> {
        Ok(Vec::new())
    }

    fn camera_permission_status(&self) -> Result<CameraPermissionStatus> {
        Ok(self
            .camera_permission_status
            .clone()
            .unwrap_or_else(|| CameraPermissionStatus::unavailable(self.platform_kind())))
    }

    fn capture_camera(&self, request: CameraCaptureRequest) -> Result<CameraCaptureResult> {
        self.camera_capture_calls.fetch_add(1, Ordering::SeqCst);
        self.camera_capture_started.store(true, Ordering::SeqCst);
        if let Some(events) = &self.events {
            events.lock().expect("test events").push("effect");
        }
        if self.camera_timeout {
            return Err(CameraCaptureProcessError::timed_out().into());
        }
        if self.wait_for_camera_cancellation {
            let deadline = Instant::now() + Duration::from_secs(2);
            while !request.cancellation.load(Ordering::SeqCst) {
                if Instant::now() >= deadline {
                    bail!("controlled cancellation wait timed out");
                }
                std::thread::sleep(Duration::from_millis(1));
            }
            return Err(CameraCaptureProcessError::cancelled().into());
        }
        if !self.omit_capture_output
            && let Some(output_path) = request.output_path.as_deref()
        {
            fs::write(output_path, TEST_JPEG)?;
        }
        Ok(CameraCaptureResult {
            device_id: Some("controlled-camera".to_string()),
            artifact_ref: None,
            output_path: None,
            file_name: Some("controlled.jpg".to_string()),
            file_extension: Some("jpg".to_string()),
            mime_type: Some("image/jpeg".to_string()),
            size_bytes: Some(TEST_JPEG.len() as u64),
            transfer_encoding: Some("base64".to_string()),
            base64_data: Some("dGVzdA==".to_string()),
            message: "controlled camera captured".to_string(),
        })
    }

    fn capture_screen(&self, request: ScreenCaptureRequest) -> Result<ScreenCaptureResult> {
        self.screen_capture_calls.fetch_add(1, Ordering::SeqCst);
        if !self.omit_capture_output
            && let Some(output_path) = request.output_path.as_deref()
        {
            fs::write(output_path, TEST_PNG)?;
        }
        Ok(ScreenCaptureResult {
            display: request.display,
            artifact_ref: None,
            output_path: None,
            file_name: Some("controlled.png".to_string()),
            file_extension: Some("png".to_string()),
            mime_type: Some("image/png".to_string()),
            size_bytes: Some(TEST_PNG.len() as u64),
            transfer_encoding: None,
            base64_data: None,
            message: "controlled screen captured".to_string(),
        })
    }

    fn mouse_position(&self) -> Result<MousePositionResult> {
        bail!("unsupported by controlled test backend")
    }

    fn move_mouse(&self, _: MouseMoveRequest) -> Result<MouseMoveResult> {
        bail!("unsupported by controlled test backend")
    }

    fn click_mouse(&self, _: MouseClickRequest) -> Result<MouseClickResult> {
        bail!("unsupported by controlled test backend")
    }

    fn type_text(&self, _: KeyboardTypeRequest) -> Result<KeyboardTypeResult> {
        bail!("unsupported by controlled test backend")
    }

    fn focused_target(&self) -> Result<FocusedTargetResult> {
        bail!("unsupported by controlled test backend")
    }
}
