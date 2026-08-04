//! OS-specific, non-prompting screen-capture permission observation.
//!
//! This Platform adapter only observes current consent. It never requests or
//! changes OS permission and therefore remains safe on the normal MQTT effect
//! path. Capability/backend availability is evaluated separately.

use crate::legacy_capture_platform::{LegacyScreenPermissionProbe, ScreenPermissionProbeError};
use crate::platform_operation::PreflightPermissionState;

#[derive(Debug, Default)]
pub struct SystemScreenPermissionProbe;

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

#[cfg(any(target_os = "windows", target_os = "linux"))]
fn platform_screen_permission() -> Result<PreflightPermissionState, ScreenPermissionProbeError> {
    // Current Windows and non-portal Linux adapters have no separate
    // preflight consent API. Backend capability/resource checks still fail
    // independently and are not promoted by this observation.
    Ok(PreflightPermissionState::NotRequired)
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn platform_screen_permission() -> Result<PreflightPermissionState, ScreenPermissionProbeError> {
    Err(ScreenPermissionProbeError::ObservationUnavailable)
}

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
}

#[cfg(target_os = "macos")]
fn macos_preflight_screen_capture_access() -> bool {
    // SAFETY: CoreGraphics exposes this zero-argument read-only function for
    // the process lifetime. It displays no consent UI and returns no resource.
    unsafe { CGPreflightScreenCaptureAccess() }
}
