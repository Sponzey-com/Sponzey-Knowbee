use knowbee_yeonjang::legacy_capture_platform::LegacyScreenPermissionProbe;
use knowbee_yeonjang::platform_operation::PreflightPermissionState;
use knowbee_yeonjang::system_screen_permission::SystemScreenPermissionProbe;

#[test]
fn system_probe_observes_a_closed_state_without_requesting_os_permission() {
    let source = include_str!("../src/system_screen_permission.rs");
    assert!(source.contains("CGPreflightScreenCaptureAccess"));
    assert!(!source.contains("CGRequestScreenCaptureAccess"));

    let observed = SystemScreenPermissionProbe
        .permission()
        .expect("supported desktop observation");
    #[cfg(target_os = "macos")]
    assert!(matches!(
        observed,
        PreflightPermissionState::Granted | PreflightPermissionState::Denied
    ));
    #[cfg(any(target_os = "windows", target_os = "linux"))]
    assert_eq!(observed, PreflightPermissionState::NotRequired);
}
