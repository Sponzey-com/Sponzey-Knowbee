use knowbee_yeonjang::automation::{AutomationCapabilities, PlatformKind};
use knowbee_yeonjang::capability_permission::{
    CaptureCapabilityKind, CapturePermissionObservations, LocalPolicyState, OsPermissionState,
    capture_permission_projection_from_policy,
};
use knowbee_yeonjang::permission_policy::{
    PermissionPolicySnapshot, PolicyCapability, PolicyDecision, PolicyResourceConstraint,
    PolicyTransition, PolicyUpdateCommand, apply_policy_update,
};
use knowbee_yeonjang::permission_policy_migration::migrate_legacy_capture_policy;
use knowbee_yeonjang::platform_operation::PreflightPermissionState;
use knowbee_yeonjang::settings::PermissionSettings;

#[test]
fn canonical_projection_reads_revision_decision_and_resource_without_conflating_os_state() {
    let initial = PermissionPolicySnapshot::new("instance-a").expect("policy");
    let update = PolicyUpdateCommand::new(
        "instance-a",
        0,
        PolicyCapability::CameraCapture,
        PolicyDecision::Allowed,
        PolicyResourceConstraint::exact_camera("camera-front"),
    )
    .expect("update");
    let policy = match apply_policy_update(&initial, &update) {
        PolicyTransition::Applied { snapshot, .. } => snapshot,
        other => panic!("policy: {other:?}"),
    };

    let projection = capture_permission_projection_from_policy(
        &capabilities(),
        &policy,
        CapturePermissionObservations {
            camera: Some(PreflightPermissionState::Denied),
            screen: None,
        },
    );

    assert_eq!(projection[0].kind, CaptureCapabilityKind::Camera);
    assert_eq!(projection[0].policy_revision, 1);
    assert_eq!(projection[0].local_policy, LocalPolicyState::Allowed);
    assert_eq!(projection[0].os_permission, OsPermissionState::Denied);
    assert_eq!(
        projection[0].policy_resource,
        PolicyResourceConstraint::exact_camera("camera-front")
    );
    assert_eq!(projection[1].local_policy, LocalPolicyState::Denied);
    assert_eq!(projection[1].os_permission, OsPermissionState::NotObserved);
}

#[test]
fn legacy_migration_is_fail_closed_until_review_and_migrates_only_capture_choices() {
    let permissions = PermissionSettings {
        allow_camera_access: true,
        allow_screen_capture: true,
        allow_shell_exec: true,
        ..PermissionSettings::default()
    };

    let pending =
        migrate_legacy_capture_policy("instance-a", &permissions, false).expect("pending policy");
    assert_eq!(pending.revision(), 0);
    assert_eq!(
        pending.entry(PolicyCapability::CameraCapture).decision(),
        PolicyDecision::Denied
    );

    let reviewed =
        migrate_legacy_capture_policy("instance-a", &permissions, true).expect("reviewed policy");
    assert_eq!(reviewed.revision(), 2);
    assert_eq!(
        reviewed.entry(PolicyCapability::CameraCapture).decision(),
        PolicyDecision::Allowed
    );
    assert_eq!(
        reviewed.entry(PolicyCapability::ScreenCapture).decision(),
        PolicyDecision::Allowed
    );
}

#[test]
fn fresh_or_missing_legacy_capture_values_remain_default_deny() {
    let migrated =
        migrate_legacy_capture_policy("instance-a", &PermissionSettings::default(), true)
            .expect("policy");

    assert_eq!(migrated.revision(), 0);
    assert_eq!(
        migrated.entry(PolicyCapability::CameraCapture).decision(),
        PolicyDecision::Denied
    );
    assert_eq!(
        migrated.entry(PolicyCapability::ScreenCapture).decision(),
        PolicyDecision::Denied
    );
}

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
