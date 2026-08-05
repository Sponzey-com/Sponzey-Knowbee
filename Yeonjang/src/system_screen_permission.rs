//! OS-specific screen-capture permission observation and explicit request.
//!
//! The normal MQTT effect path only observes current consent. The local GUI
//! may request macOS consent once during its first eligible interactive start,
//! but that request is never reachable from MQTT preflight or capture execution.

use crate::legacy_capture_platform::{LegacyScreenPermissionProbe, ScreenPermissionProbeError};
use crate::platform_operation::PreflightPermissionState;

#[derive(Debug, Default)]
pub struct SystemScreenPermissionProbe;

/// Result of a local user's explicit request to register or grant macOS screen
/// capture access. `Requested` deliberately does not claim that the user
/// accepted the OS prompt.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScreenPermissionRequestResult {
    Granted,
    Requested,
    Unsupported,
}

/// Requests screen-capture consent only from a local, interactive caller.
///
/// This function is intentionally separate from [`LegacyScreenPermissionProbe`]
/// so remote MQTT commands can observe but can never create an OS permission
/// prompt. The GUI persists its one-time request marker before calling this
/// function. macOS records the calling app bundle in Screen & System Audio
/// Recording when it receives this request.
pub fn request_screen_capture_access()
-> Result<ScreenPermissionRequestResult, ScreenPermissionProbeError> {
    platform_request_screen_capture_access()
}

impl LegacyScreenPermissionProbe for SystemScreenPermissionProbe {
    fn permission(&self) -> Result<PreflightPermissionState, ScreenPermissionProbeError> {
        platform_screen_permission()
    }
}

#[cfg(target_os = "macos")]
fn platform_screen_permission() -> Result<PreflightPermissionState, ScreenPermissionProbeError> {
    Ok(if macos_preflight_screen_capture_access() {
        PreflightPermissionState::Granted
    } else {
        PreflightPermissionState::Denied
    })
}

#[cfg(target_os = "macos")]
fn platform_request_screen_capture_access()
-> Result<ScreenPermissionRequestResult, ScreenPermissionProbeError> {
    if macos_preflight_screen_capture_access() {
        return Ok(ScreenPermissionRequestResult::Granted);
    }
    // SAFETY: this CoreGraphics call is invoked only by the local GUI's
    // explicit button handler. It has no target, capture payload, or MQTT
    // connection and may only cause macOS to present its consent prompt.
    unsafe {
        CGRequestScreenCaptureAccess();
    }
    Ok(if macos_preflight_screen_capture_access() {
        ScreenPermissionRequestResult::Granted
    } else {
        ScreenPermissionRequestResult::Requested
    })
}

#[cfg(any(target_os = "windows", target_os = "linux"))]
fn platform_screen_permission() -> Result<PreflightPermissionState, ScreenPermissionProbeError> {
    // Current Windows and non-portal Linux adapters have no separate
    // preflight consent API. Backend capability/resource checks still fail
    // independently and are not promoted by this observation.
    Ok(PreflightPermissionState::NotRequired)
}

#[cfg(any(target_os = "windows", target_os = "linux"))]
fn platform_request_screen_capture_access()
-> Result<ScreenPermissionRequestResult, ScreenPermissionProbeError> {
    Ok(ScreenPermissionRequestResult::Unsupported)
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn platform_screen_permission() -> Result<PreflightPermissionState, ScreenPermissionProbeError> {
    Err(ScreenPermissionProbeError::ObservationUnavailable)
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn platform_request_screen_capture_access()
-> Result<ScreenPermissionRequestResult, ScreenPermissionProbeError> {
    Err(ScreenPermissionProbeError::ObservationUnavailable)
}

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

#[cfg(target_os = "macos")]
fn macos_preflight_screen_capture_access() -> bool {
    // SAFETY: CoreGraphics exposes this zero-argument read-only function for
    // the process lifetime. It displays no consent UI and returns no resource.
    unsafe { CGPreflightScreenCaptureAccess() }
}
