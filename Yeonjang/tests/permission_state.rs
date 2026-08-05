use knowbee_yeonjang::permission_policy::{
    PermissionPolicySnapshot, PolicyCapability, PolicyDecision, PolicyRejectReason,
    PolicyResourceConstraint, PolicyTransition, PolicyUpdateCommand, apply_policy_update,
    rollback_policy,
};

fn applied(transition: PolicyTransition) -> PermissionPolicySnapshot {
    match transition {
        PolicyTransition::Applied { snapshot, .. } => snapshot,
        other => panic!("expected applied transition, got {other:?}"),
    }
}

#[test]
fn apply_uses_exact_target_and_expected_revision_then_advances_once() {
    let initial = PermissionPolicySnapshot::new("instance-a").expect("snapshot");
    let command = PolicyUpdateCommand::new(
        "instance-a",
        0,
        PolicyCapability::CameraCapture,
        PolicyDecision::Allowed,
        PolicyResourceConstraint::Any,
    )
    .expect("command");

    let updated = applied(apply_policy_update(&initial, &command));

    assert_eq!(updated.revision(), 1);
    assert_eq!(
        updated.entry(PolicyCapability::CameraCapture).decision(),
        PolicyDecision::Allowed
    );
    assert_eq!(
        updated.entry(PolicyCapability::ScreenCapture).decision(),
        PolicyDecision::Denied
    );
    assert_eq!(initial.revision(), 0, "input snapshot must stay immutable");
}

#[test]
fn same_value_is_unchanged_and_stale_revision_is_a_closed_conflict() {
    let initial = PermissionPolicySnapshot::new("instance-a").expect("snapshot");
    let deny = PolicyUpdateCommand::new(
        "instance-a",
        0,
        PolicyCapability::CameraCapture,
        PolicyDecision::Denied,
        PolicyResourceConstraint::Any,
    )
    .expect("command");
    assert!(matches!(
        apply_policy_update(&initial, &deny),
        PolicyTransition::Unchanged { revision: 0 }
    ));

    let allow = PolicyUpdateCommand::new(
        "instance-a",
        0,
        PolicyCapability::CameraCapture,
        PolicyDecision::Allowed,
        PolicyResourceConstraint::Any,
    )
    .expect("command");
    let updated = applied(apply_policy_update(&initial, &allow));
    assert!(matches!(
        apply_policy_update(&updated, &allow),
        PolicyTransition::RevisionConflict {
            expected_revision: 0,
            current_revision: 1
        }
    ));
}

#[test]
fn wrong_target_and_mismatched_resource_are_rejected_without_state_change() {
    let initial = PermissionPolicySnapshot::new("instance-a").expect("snapshot");
    let wrong_target = PolicyUpdateCommand::new(
        "instance-b",
        0,
        PolicyCapability::CameraCapture,
        PolicyDecision::Allowed,
        PolicyResourceConstraint::Any,
    )
    .expect("command");

    assert!(matches!(
        apply_policy_update(&initial, &wrong_target),
        PolicyTransition::Rejected {
            reason: PolicyRejectReason::WrongTarget
        }
    ));
    assert!(
        PolicyUpdateCommand::new(
            "instance-a",
            0,
            PolicyCapability::CameraCapture,
            PolicyDecision::Allowed,
            PolicyResourceConstraint::exact_display("display-main"),
        )
        .is_err()
    );
    assert_eq!(initial.revision(), 0);
}

#[test]
fn rollback_restores_historical_entries_as_a_new_monotonic_revision() {
    let initial = PermissionPolicySnapshot::new("instance-a").expect("snapshot");
    let allow_camera = PolicyUpdateCommand::new(
        "instance-a",
        0,
        PolicyCapability::CameraCapture,
        PolicyDecision::Allowed,
        PolicyResourceConstraint::exact_camera("camera-front"),
    )
    .expect("command");
    let revision_one = applied(apply_policy_update(&initial, &allow_camera));
    let allow_screen = PolicyUpdateCommand::new(
        "instance-a",
        1,
        PolicyCapability::ScreenCapture,
        PolicyDecision::Allowed,
        PolicyResourceConstraint::Any,
    )
    .expect("command");
    let revision_two = applied(apply_policy_update(&revision_one, &allow_screen));

    let restored = applied(rollback_policy(&revision_two, &initial, 2));

    assert_eq!(restored.revision(), 3);
    assert_eq!(
        restored.entry(PolicyCapability::CameraCapture).decision(),
        PolicyDecision::Denied
    );
    assert_eq!(
        restored.entry(PolicyCapability::ScreenCapture).decision(),
        PolicyDecision::Denied
    );
}

#[test]
fn rollback_rejects_wrong_target_stale_expected_or_nonhistorical_snapshot() {
    let initial = PermissionPolicySnapshot::new("instance-a").expect("snapshot");
    let other = PermissionPolicySnapshot::new("instance-b").expect("snapshot");

    assert!(matches!(
        rollback_policy(&initial, &other, 0),
        PolicyTransition::Rejected {
            reason: PolicyRejectReason::WrongTarget
        }
    ));
    assert!(matches!(
        rollback_policy(&initial, &initial, 1),
        PolicyTransition::RevisionConflict {
            expected_revision: 1,
            current_revision: 0
        }
    ));
    assert!(matches!(
        rollback_policy(&initial, &initial, 0),
        PolicyTransition::Rejected {
            reason: PolicyRejectReason::NotHistorical
        }
    ));
}
