#![cfg(target_os = "linux")]
#![recursion_limit = "256"]

#[path = "support/packaged_desktop_live_mqtt.rs"]
mod packaged_desktop_live_mqtt;

use packaged_desktop_live_mqtt::{DesktopLiveProfile, run_signed_package_device_gate};

/// Runs the shared direct-MQTT package/device contract against the native
/// Linux x86_64 package. Wayland and X11 remain separate host executions.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires YEONJANG_LIVE_DEVICE_GATE=1 and a Linux camera/display host"]
async fn packaged_linux_captures_camera_and_screen_over_direct_mqtt() {
    run_signed_package_device_gate(DesktopLiveProfile {
        package_target: "linux-x64",
        target_os: "linux",
        target_arch: "x86_64",
    })
    .await;
}
