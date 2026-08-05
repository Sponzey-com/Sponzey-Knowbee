use knowbee_yeonjang::durable_completed_store::{
    DurableRecordStorage, RawStoreRead, RawStoreWrite,
};
use knowbee_yeonjang::local_policy_setup::{
    CapturePolicyCommitResult, LocalCapturePolicySetupUseCase, LocalPolicySetupResult,
    capture_policy_matches_settings, commit_capture_policy_settings,
    project_capture_policy_to_settings,
};
use knowbee_yeonjang::permission_policy::{
    CapturePolicySetupCommand, PermissionPolicySnapshot, PolicyCapability, PolicyDecision,
    PolicyResourceConstraint, PolicyTransition, PolicyUpdateCommand, apply_capture_policy_setup,
};
use knowbee_yeonjang::policy_repository::{
    DurablePermissionPolicyRepository, PolicyRepositoryResult,
};
use std::sync::{Arc, Mutex};

use knowbee_yeonjang::settings::PermissionSettings;

#[test]
fn camera_and_screen_desired_state_changes_in_one_logical_revision() {
    let initial = PermissionPolicySnapshot::new("instance-a").expect("policy");
    let command = CapturePolicySetupCommand::new(
        "instance-a",
        0,
        PolicyDecision::Allowed,
        PolicyResourceConstraint::Any,
        PolicyDecision::Allowed,
        PolicyResourceConstraint::exact_display("1"),
    )
    .expect("command");

    let PolicyTransition::Applied {
        snapshot,
        previous_revision,
    } = apply_capture_policy_setup(&initial, &command)
    else {
        panic!("applied")
    };
    assert_eq!(previous_revision, 0);
    assert_eq!(snapshot.revision(), 1);
}

#[test]
fn pair_setup_is_unchanged_or_conflict_without_partial_transition() {
    let initial = PermissionPolicySnapshot::new("instance-a").expect("policy");
    let unchanged = CapturePolicySetupCommand::new(
        "instance-a",
        0,
        PolicyDecision::Denied,
        PolicyResourceConstraint::Any,
        PolicyDecision::Denied,
        PolicyResourceConstraint::Any,
    )
    .expect("command");
    assert!(matches!(
        apply_capture_policy_setup(&initial, &unchanged),
        PolicyTransition::Unchanged { revision: 0 }
    ));

    let stale = CapturePolicySetupCommand::new(
        "instance-a",
        2,
        PolicyDecision::Allowed,
        PolicyResourceConstraint::Any,
        PolicyDecision::Allowed,
        PolicyResourceConstraint::Any,
    )
    .expect("command");
    assert!(matches!(
        apply_capture_policy_setup(&initial, &stale),
        PolicyTransition::RevisionConflict {
            expected_revision: 2,
            current_revision: 0
        }
    ));
}

#[test]
fn pair_setup_rejects_cross_capability_resource_constraints() {
    assert!(
        CapturePolicySetupCommand::new(
            "instance-a",
            0,
            PolicyDecision::Allowed,
            PolicyResourceConstraint::exact_display("1"),
            PolicyDecision::Denied,
            PolicyResourceConstraint::Any,
        )
        .is_err()
    );
}

#[test]
fn local_use_case_commits_pair_and_audit_in_one_cas_then_restart_deduplicates_change() {
    let storage = Arc::new(CountingStorage::default());
    let repository = Arc::new(
        DurablePermissionPolicyRepository::bootstrap("instance-a", 16, storage.clone())
            .expect("repository"),
    );
    let use_case = LocalCapturePolicySetupUseCase::new(repository);
    let command = CapturePolicySetupCommand::new(
        "instance-a",
        0,
        PolicyDecision::Allowed,
        PolicyResourceConstraint::Any,
        PolicyDecision::Allowed,
        PolicyResourceConstraint::Any,
    )
    .expect("command");

    assert_eq!(
        use_case.execute(&command, "local-change-1"),
        LocalPolicySetupResult::Policy(PolicyRepositoryResult::Applied { revision: 1 })
    );
    assert_eq!(storage.0.lock().expect("storage").2, 1);

    let restarted = Arc::new(
        DurablePermissionPolicyRepository::bootstrap("instance-a", 16, storage).expect("restart"),
    );
    assert_eq!(
        LocalCapturePolicySetupUseCase::new(restarted).execute(&command, "local-change-1"),
        LocalPolicySetupResult::Duplicate
    );
}

#[test]
fn storage_failure_preserves_both_previous_decisions() {
    let repository = Arc::new(
        DurablePermissionPolicyRepository::bootstrap(
            "instance-a",
            16,
            Arc::new(UnavailableWriteStorage),
        )
        .expect("repository"),
    );
    let command = CapturePolicySetupCommand::new(
        "instance-a",
        0,
        PolicyDecision::Allowed,
        PolicyResourceConstraint::Any,
        PolicyDecision::Allowed,
        PolicyResourceConstraint::Any,
    )
    .expect("command");
    assert_eq!(
        LocalCapturePolicySetupUseCase::new(repository.clone())
            .execute(&command, "local-change-failed"),
        LocalPolicySetupResult::Policy(PolicyRepositoryResult::Unavailable)
    );
    let snapshot = repository.snapshot().expect("snapshot");
    assert_eq!(snapshot.revision(), 0);
    assert_eq!(
        snapshot
            .entry(knowbee_yeonjang::permission_policy::PolicyCapability::CameraCapture)
            .decision(),
        PolicyDecision::Denied
    );
    assert_eq!(
        snapshot
            .entry(knowbee_yeonjang::permission_policy::PolicyCapability::ScreenCapture)
            .decision(),
        PolicyDecision::Denied
    );
}

#[test]
fn canonical_snapshot_projects_only_capture_fields_into_gui_staging() {
    let repository = DurablePermissionPolicyRepository::bootstrap(
        "instance-a",
        16,
        Arc::new(CountingStorage::default()),
    )
    .expect("repository");
    assert!(matches!(
        repository.update(
            &PolicyUpdateCommand::new(
                "instance-a",
                0,
                PolicyCapability::CameraCapture,
                PolicyDecision::Allowed,
                PolicyResourceConstraint::Any,
            )
            .expect("update")
        ),
        PolicyRepositoryResult::Applied { revision: 1 }
    ));
    let snapshot = repository.snapshot().expect("snapshot");
    let mut settings = PermissionSettings {
        allow_browser_control: true,
        allow_camera_access: false,
        allow_screen_capture: true,
        ..PermissionSettings::default()
    };

    let revision = project_capture_policy_to_settings(&snapshot, &mut settings);

    assert_eq!(revision, 1);
    assert!(settings.allow_browser_control);
    assert!(settings.allow_camera_access);
    assert!(!settings.allow_screen_capture);
    assert!(capture_policy_matches_settings(&snapshot, &settings));
}

#[test]
fn gui_commit_uses_observed_revision_and_rejects_concurrent_policy_change() {
    let repository = Arc::new(
        DurablePermissionPolicyRepository::bootstrap(
            "instance-a",
            32,
            Arc::new(CountingStorage::default()),
        )
        .expect("repository"),
    );
    let observed_revision = repository.snapshot().expect("snapshot").revision();
    assert!(matches!(
        repository.update(
            &PolicyUpdateCommand::new(
                "instance-a",
                observed_revision,
                PolicyCapability::ScreenCapture,
                PolicyDecision::Allowed,
                PolicyResourceConstraint::Any,
            )
            .expect("concurrent update")
        ),
        PolicyRepositoryResult::Applied { revision: 1 }
    ));
    let desired = PermissionSettings {
        allow_camera_access: true,
        allow_screen_capture: false,
        ..PermissionSettings::default()
    };

    assert_eq!(
        commit_capture_policy_settings(
            repository,
            &PermissionPolicySnapshot::new("instance-a").expect("observed"),
            &desired,
            "gui-save-stale",
        ),
        CapturePolicyCommitResult::RevisionConflict {
            expected_revision: 0,
            current_revision: 1,
        }
    );
}

#[test]
fn gui_commit_reports_applied_and_unavailable_as_closed_gate_results() {
    let repository = Arc::new(
        DurablePermissionPolicyRepository::bootstrap(
            "instance-a",
            16,
            Arc::new(CountingStorage::default()),
        )
        .expect("repository"),
    );
    let desired = PermissionSettings {
        allow_camera_access: true,
        allow_screen_capture: true,
        ..PermissionSettings::default()
    };
    assert_eq!(
        commit_capture_policy_settings(
            repository,
            &PermissionPolicySnapshot::new("instance-a").expect("observed"),
            &desired,
            "gui-save-applied",
        ),
        CapturePolicyCommitResult::Applied { revision: 1 }
    );

    let unavailable = Arc::new(
        DurablePermissionPolicyRepository::bootstrap(
            "instance-a",
            16,
            Arc::new(UnavailableWriteStorage),
        )
        .expect("repository"),
    );
    assert_eq!(
        commit_capture_policy_settings(
            unavailable,
            &PermissionPolicySnapshot::new("instance-a").expect("observed"),
            &desired,
            "gui-save-unavailable",
        ),
        CapturePolicyCommitResult::Unavailable
    );
}

#[test]
fn gui_commit_preserves_exact_resources_and_skips_storage_for_no_change() {
    let storage = Arc::new(CountingStorage::default());
    let repository = Arc::new(
        DurablePermissionPolicyRepository::bootstrap("instance-a", 16, storage.clone())
            .expect("repository"),
    );
    let unchanged = PermissionSettings::default();
    let observed = repository.snapshot().expect("observed");
    assert_eq!(
        commit_capture_policy_settings(repository.clone(), &observed, &unchanged, "gui-no-change",),
        CapturePolicyCommitResult::Unchanged { revision: 0 }
    );
    assert_eq!(
        storage.0.lock().expect("storage").2,
        0,
        "an unrelated settings save must not consume policy audit capacity"
    );

    assert!(matches!(
        repository.update(
            &PolicyUpdateCommand::new(
                "instance-a",
                0,
                PolicyCapability::CameraCapture,
                PolicyDecision::Denied,
                PolicyResourceConstraint::exact_camera("front"),
            )
            .expect("resource update")
        ),
        PolicyRepositoryResult::Applied { revision: 1 }
    ));
    let observed = repository.snapshot().expect("observed exact resource");
    let desired = PermissionSettings {
        allow_camera_access: true,
        ..PermissionSettings::default()
    };
    assert_eq!(
        commit_capture_policy_settings(
            repository.clone(),
            &observed,
            &desired,
            "gui-resource-preserving-change",
        ),
        CapturePolicyCommitResult::Applied { revision: 2 }
    );
    assert_eq!(
        repository
            .snapshot()
            .expect("current")
            .entry(PolicyCapability::CameraCapture)
            .resource(),
        &PolicyResourceConstraint::exact_camera("front")
    );
}

#[derive(Default)]
struct CountingStorage(Mutex<(u64, Vec<Vec<u8>>, usize)>);

impl DurableRecordStorage for CountingStorage {
    fn read(&self) -> RawStoreRead {
        let state = self.0.lock().expect("storage");
        if state.1.is_empty() {
            RawStoreRead::Missing { revision: state.0 }
        } else {
            RawStoreRead::Records {
                revision: state.0,
                records: state.1.clone(),
            }
        }
    }

    fn compare_and_swap(&self, expected_revision: u64, records: Vec<Vec<u8>>) -> RawStoreWrite {
        let mut state = self.0.lock().expect("storage");
        if state.0 != expected_revision {
            return RawStoreWrite::Conflict;
        }
        state.0 += 1;
        state.1 = records;
        state.2 += 1;
        RawStoreWrite::Written { revision: state.0 }
    }
}

struct UnavailableWriteStorage;
impl DurableRecordStorage for UnavailableWriteStorage {
    fn read(&self) -> RawStoreRead {
        RawStoreRead::Missing { revision: 0 }
    }

    fn compare_and_swap(&self, _: u64, _: Vec<Vec<u8>>) -> RawStoreWrite {
        RawStoreWrite::Unavailable
    }
}
