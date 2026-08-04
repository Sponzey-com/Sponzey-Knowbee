#![cfg(all(target_os = "windows", target_arch = "aarch64"))]
#![recursion_limit = "256"]

#[path = "support/packaged_desktop_live_mqtt.rs"]
mod packaged_desktop_live_mqtt;

use packaged_desktop_live_mqtt::{DesktopLiveProfile, run_signed_package_device_gate};

/// Runs the shared direct-MQTT package/device contract against a native
/// Windows 11 ARM64 package without changing the established x64 entry.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires YEONJANG_LIVE_DEVICE_GATE=1 and a Windows 11 ARM64 camera/display host"]
async fn packaged_windows_arm64_captures_camera_and_screen_over_direct_mqtt() {
    run_signed_package_device_gate(DesktopLiveProfile {
        package_target: "win32-arm64",
        target_os: "windows",
        target_arch: "aarch64",
    })
    .await;
}
