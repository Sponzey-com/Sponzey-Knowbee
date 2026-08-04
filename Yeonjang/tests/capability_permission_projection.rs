use knowbee_yeonjang::automation::{AutomationCapabilities, PlatformKind};
use knowbee_yeonjang::capability_permission::{
    CaptureCapabilityKind, CapturePermissionObservations, LocalPolicyState, OsPermissionState,
    capture_permission_projection,
};
use knowbee_yeonjang::platform_operation::PreflightPermissionState;
use knowbee_yeonjang::settings::PermissionSettings;

fn capabilities() -> AutomationCapabilities {
    AutomationCapabilities {
        platform: PlatformKind::Macos,
        camera_management: true,
        command_execution: true,
        application_launch: true,
        screen_capture: true,
        mouse_control: true,
        keyboard_control: true,
        system_control: true,
    }
}

#[test]
fn camera_and_screen_share_one_projection_without_losing_exact_contract_identity() {
    let permissions = PermissionSettings {
        allow_camera_access: true,
        allow_screen_capture: false,
        ..PermissionSettings::default()
    };

    let projection = capture_permission_projection(
        &capabilities(),
        &permissions,
        CapturePermissionObservations {
            camera: Some(PreflightPermissionState::Granted),
            screen: Some(PreflightPermissionState::Denied),
        },
    );

    assert_eq!(projection.len(), 2);
    assert_eq!(projection[0].kind, CaptureCapabilityKind::Camera);
    assert_eq!(projection[0].method, "camera.capture");
    assert_eq!(projection[0].resource, "camera");
    assert_eq!(projection[0].setting_name, "allow_camera_access");
    assert!(projection[0].capability_available);
    assert_eq!(projection[0].local_policy, LocalPolicyState::Allowed);
    assert_eq!(projection[0].os_permission, OsPermissionState::Granted);

    assert_eq!(projection[1].kind, CaptureCapabilityKind::Screen);
    assert_eq!(projection[1].method, "screen.capture");
    assert_eq!(projection[1].resource, "screen");
    assert_eq!(projection[1].setting_name, "allow_screen_capture");
    assert!(projection[1].capability_available);
    assert_eq!(projection[1].local_policy, LocalPolicyState::Denied);
    assert_eq!(projection[1].os_permission, OsPermissionState::Denied);
}

#[test]
fn local_policy_never_substitutes_for_an_unobserved_os_permission() {
    let permissions = PermissionSettings {
        allow_camera_access: true,
        allow_screen_capture: true,
        ..PermissionSettings::default()
    };

    let projection = capture_permission_projection(
        &capabilities(),
        &permissions,
        CapturePermissionObservations::default(),
    );

    assert_eq!(projection[0].local_policy, LocalPolicyState::Allowed);
    assert_eq!(projection[0].os_permission, OsPermissionState::NotObserved);
    assert_eq!(projection[1].local_policy, LocalPolicyState::Allowed);
    assert_eq!(projection[1].os_permission, OsPermissionState::NotObserved);
}

#[test]
fn unsupported_capability_remains_distinct_from_policy_and_os_permission() {
    let mut flags = capabilities();
    flags.camera_management = false;
    let permissions = PermissionSettings {
        allow_camera_access: true,
        ..PermissionSettings::default()
    };

    let projection = capture_permission_projection(
        &flags,
        &permissions,
        CapturePermissionObservations {
            camera: Some(PreflightPermissionState::NotRequired),
            screen: None,
        },
    );

    assert!(!projection[0].capability_available);
    assert_eq!(projection[0].local_policy, LocalPolicyState::Allowed);
    assert_eq!(projection[0].os_permission, OsPermissionState::NotRequired);
}
