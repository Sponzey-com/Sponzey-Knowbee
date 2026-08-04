pub mod shared;

#[cfg(any(target_os = "linux", test))]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
mod unsupported;
// Keep the Windows adapter in host-side unit builds so its pure request,
// response, and helper contracts do not silently rot between Windows runs.
#[cfg(any(target_os = "windows", test))]
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

#[cfg(target_os = "linux")]
pub fn current_backend() -> CurrentBackend {
    CurrentBackend::default()
}

#[cfg(not(target_os = "linux"))]
pub fn current_backend() -> CurrentBackend {
    CurrentBackend
}
