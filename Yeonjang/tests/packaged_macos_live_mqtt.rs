#![cfg(target_os = "macos")]
#![recursion_limit = "256"]

#[path = "support/packaged_desktop_live_mqtt.rs"]
mod packaged_desktop_live_mqtt;

use packaged_desktop_live_mqtt::{DesktopLiveProfile, run_signed_package_device_gate};

/// Runs the shared direct-MQTT package/device contract against the signed
/// macOS arm64 application bundle.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires YEONJANG_LIVE_DEVICE_GATE=1 and a signed macOS app"]
async fn signed_package_captures_camera_and_screen_over_direct_mqtt() {
    run_signed_package_device_gate(DesktopLiveProfile {
        package_target: "darwin-arm64",
        target_os: "macos",
        target_arch: "aarch64",
    })
    .await;
}
