use knowbee_yeonjang::mqtt_v2_capability_projection::{
    V2ImplementationStatus, V2PlatformCapabilitySnapshot, project_v2_capture_capabilities,
};
use knowbee_yeonjang::permission_policy::{
    PermissionPolicySnapshot, PolicyCapability, PolicyDecision, PolicyResourceConstraint,
    PolicyTransition, PolicyUpdateCommand, apply_policy_update,
};
use knowbee_yeonjang::platform_operation::TargetPlatform;

#[test]
fn desktop_projection_uses_canonical_descriptors_and_keeps_policy_separate() {
    let policy = allowed_camera_policy();
    let projection = project_v2_capture_capabilities(
        &V2PlatformCapabilitySnapshot::new(TargetPlatform::Macos, true, false),
        &policy,
    )
    .expect("projection");
    assert_eq!(projection.policy_revision, 1);
    assert_eq!(projection.advertised_methods, ["camera.capture"]);
    assert_eq!(projection.capabilities.len(), 2);

    let camera = &projection.capabilities[0];
    assert_eq!(camera.method, "camera.capture");
    assert_eq!(camera.resource, "camera");
    assert_eq!(camera.authorization_scope, "effect.execute");
    assert!(camera.cancellable);
    assert!(camera.post_check_required);
    assert_eq!(
        camera.implementation_status,
        V2ImplementationStatus::Executable
    );
    assert_eq!(camera.local_policy, "allowed");

    let screen = &projection.capabilities[1];
    assert_eq!(screen.method, "screen.capture");
    assert_eq!(
        screen.implementation_status,
        V2ImplementationStatus::Unavailable
    );
    assert_eq!(screen.local_policy, "denied");
}

#[test]
fn mobile_contract_values_are_preserved_but_never_advertised_as_executable() {
    for platform in [TargetPlatform::Android, TargetPlatform::Ios] {
        let projection = project_v2_capture_capabilities(
            &V2PlatformCapabilitySnapshot::new(platform, true, true),
            &allowed_camera_policy(),
        )
        .expect("contract projection");
        assert!(projection.advertised_methods.is_empty());
        assert!(projection.capabilities.iter().all(|row| {
            row.implementation_status == V2ImplementationStatus::ContractOnly
                && !row.platform_available
        }));
    }
}

fn allowed_camera_policy() -> PermissionPolicySnapshot {
    let initial = PermissionPolicySnapshot::new("instance-a").expect("initial");
    let command = PolicyUpdateCommand::new(
        "instance-a",
        0,
        PolicyCapability::CameraCapture,
        PolicyDecision::Allowed,
        PolicyResourceConstraint::Any,
    )
    .expect("command");
    match apply_policy_update(&initial, &command) {
        PolicyTransition::Applied { snapshot, .. } => snapshot,
        other => panic!("fixture transition: {other:?}"),
    }
}
