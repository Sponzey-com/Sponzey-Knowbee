pub mod shared;

#[cfg(any(target_os = "linux", test))]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
mod unsupported;
#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "linux")]
pub use linux::PlatformBackend as CurrentBackend;
#[cfg(target_os = "macos")]
pub use macos::PlatformBackend as CurrentBackend;
#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
pub use unsupported::PlatformBackend as CurrentBackend;
#[cfg(target_os = "windows")]
pub use windows::PlatformBackend as CurrentBackend;
#[cfg(target_os = "windows")]
pub(crate) use windows::run_camera_capture_helper as run_platform_camera_capture_helper;

pub fn current_backend() -> CurrentBackend {
    CurrentBackend
}

/// Executes the private browser focus backend only after the caller has completed
/// admission verification. Platforms without a native implementation fail closed.
pub fn execute_verified_browser_focus(process_name: &str, interactive_desktop_session: bool) -> serde_json::Value {
    #[cfg(target_os = "macos")]
    {
        return macos::execute_verified_browser_focus(process_name, interactive_desktop_session);
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (process_name, interactive_desktop_session);
        serde_json::json!({
            "commandAccepted": false,
            "reasonCode": "browser_focus_platform_unsupported",
            "focusedTargetObservationRequired": true,
            "goalSuccess": false,
        })
    }
}
