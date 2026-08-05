use knowbee_yeonjang::legacy_capture_platform::LegacyScreenPermissionProbe;
use knowbee_yeonjang::platform_operation::PreflightPermissionState;
use knowbee_yeonjang::system_screen_permission::{
    SystemScreenPermissionProbe, request_screen_capture_access,
};

#[test]
fn system_probe_observes_a_closed_state_without_requesting_os_permission() {
    let source = include_str!("../src/system_screen_permission.rs");
    assert!(source.contains("CGPreflightScreenCaptureAccess"));
    assert!(source.contains("CGRequestScreenCaptureAccess"));
    assert!(source.contains("pub fn request_screen_capture_access"));

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

#[test]
fn one_time_gui_permission_request_is_not_part_of_the_normal_probe_contract() {
    let source = include_str!("../src/system_screen_permission.rs");
    let probe_impl = source
        .split("impl LegacyScreenPermissionProbe for SystemScreenPermissionProbe")
        .nth(1)
        .and_then(|value| value.split("#[cfg(target_os = \"macos\")]").next())
        .expect("screen probe implementation");
    assert!(!probe_impl.contains("request_screen_capture_access"));
    let _ = request_screen_capture_access as fn() -> _;

    let gui_source = include_str!("../src/gui.rs");
    assert!(gui_source.contains("RequestScreenCapturePermission"));
    assert!(gui_source.contains("request_screen_capture_access()"));
    assert!(gui_source.contains("needs_initial_screen_capture_permission_request"));
    assert!(gui_source.contains("mark_screen_capture_permission_requested"));
    assert!(gui_source.contains("initial_screen_capture_permission_request_pending"));
    assert!(gui_source.contains("screen_capture_permission_status_label"));
}
