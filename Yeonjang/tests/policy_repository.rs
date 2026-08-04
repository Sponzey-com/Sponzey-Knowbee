use std::sync::{Arc, Mutex};

use knowbee_yeonjang::durable_completed_store::{
    DurableRecordStorage, RawStoreRead, RawStoreWrite,
};
use knowbee_yeonjang::permission_policy::{
    PolicyCapability, PolicyDecision, PolicyResourceConstraint, PolicyUpdateCommand,
};
use knowbee_yeonjang::policy_repository::{
    DurablePermissionPolicyRepository, PolicyRepositoryBootstrapError, PolicyRepositoryResult,
};

#[derive(Default)]
struct MemoryStorage(Mutex<(u64, Vec<Vec<u8>>)>);

impl MemoryStorage {
    fn with_records(revision: u64, records: Vec<Vec<u8>>) -> Self {
        Self(Mutex::new((revision, records)))
    }

    fn records(&self) -> Vec<Vec<u8>> {
        self.0.lock().expect("storage").1.clone()
    }
}

impl DurableRecordStorage for MemoryStorage {
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
        RawStoreWrite::Written { revision: state.0 }
    }
}

fn update(
    expected_revision: u64,
    capability: PolicyCapability,
    decision: PolicyDecision,
    resource: PolicyResourceConstraint,
) -> PolicyUpdateCommand {
    PolicyUpdateCommand::new(
        "instance-a",
        expected_revision,
        capability,
        decision,
        resource,
    )
    .expect("command")
}

#[test]
fn update_commits_before_restart_exposes_the_exact_policy_snapshot() {
    let storage = Arc::new(MemoryStorage::default());
    let repository = DurablePermissionPolicyRepository::bootstrap("instance-a", 8, storage.clone())
        .expect("repository");

    let result = repository.update(&update(
        0,
        PolicyCapability::CameraCapture,
        PolicyDecision::Allowed,
        PolicyResourceConstraint::exact_camera("camera-front"),
    ));
    assert!(matches!(
        result,
        PolicyRepositoryResult::Applied { revision: 1 }
    ));

    let restarted =
        DurablePermissionPolicyRepository::bootstrap("instance-a", 8, storage).expect("restart");
    let snapshot = restarted.snapshot().expect("snapshot");
    assert_eq!(snapshot.revision(), 1);
    assert_eq!(
        snapshot.entry(PolicyCapability::CameraCapture).decision(),
        PolicyDecision::Allowed
    );
    assert_eq!(
        snapshot.entry(PolicyCapability::CameraCapture).resource(),
        &PolicyResourceConstraint::exact_camera("camera-front")
    );
}

#[test]
fn stale_repository_storage_conflict_never_overwrites_the_first_writer() {
    let storage = Arc::new(MemoryStorage::default());
    let first = DurablePermissionPolicyRepository::bootstrap("instance-a", 8, storage.clone())
        .expect("first");
    let stale = DurablePermissionPolicyRepository::bootstrap("instance-a", 8, storage.clone())
        .expect("stale");

    assert!(matches!(
        first.update(&update(
            0,
            PolicyCapability::CameraCapture,
            PolicyDecision::Allowed,
            PolicyResourceConstraint::Any,
        )),
        PolicyRepositoryResult::Applied { revision: 1 }
    ));
    assert!(matches!(
        stale.update(&update(
            0,
            PolicyCapability::ScreenCapture,
            PolicyDecision::Allowed,
            PolicyResourceConstraint::Any,
        )),
        PolicyRepositoryResult::StorageConflict
    ));
    assert_eq!(stale.snapshot().expect("stale snapshot").revision(), 0);

    let restarted =
        DurablePermissionPolicyRepository::bootstrap("instance-a", 8, storage).expect("restart");
    assert_eq!(restarted.snapshot().expect("snapshot").revision(), 1);
    assert_eq!(
        restarted
            .snapshot()
            .expect("snapshot")
            .entry(PolicyCapability::ScreenCapture)
            .decision(),
        PolicyDecision::Denied
    );
}

#[test]
fn rollback_uses_persisted_history_and_commits_a_new_revision() {
    let storage = Arc::new(MemoryStorage::default());
    let repository = DurablePermissionPolicyRepository::bootstrap("instance-a", 8, storage.clone())
        .expect("repository");
    assert!(matches!(
        repository.update(&update(
            0,
            PolicyCapability::CameraCapture,
            PolicyDecision::Allowed,
            PolicyResourceConstraint::Any,
        )),
        PolicyRepositoryResult::Applied { revision: 1 }
    ));
    assert!(matches!(
        repository.update(&update(
            1,
            PolicyCapability::ScreenCapture,
            PolicyDecision::Allowed,
            PolicyResourceConstraint::Any,
        )),
        PolicyRepositoryResult::Applied { revision: 2 }
    ));

    assert!(matches!(
        repository.rollback(2, 0),
        PolicyRepositoryResult::Applied { revision: 3 }
    ));

    let restarted =
        DurablePermissionPolicyRepository::bootstrap("instance-a", 8, storage).expect("restart");
    let snapshot = restarted.snapshot().expect("snapshot");
    assert_eq!(snapshot.revision(), 3);
    assert_eq!(
        snapshot.entry(PolicyCapability::CameraCapture).decision(),
        PolicyDecision::Denied
    );
    assert_eq!(
        snapshot.entry(PolicyCapability::ScreenCapture).decision(),
        PolicyDecision::Denied
    );
}

#[test]
fn bootstrap_rejects_malformed_or_wrong_target_records() {
    let malformed = Arc::new(MemoryStorage::with_records(1, vec![b"not-json".to_vec()]));
    assert!(matches!(
        DurablePermissionPolicyRepository::bootstrap("instance-a", 8, malformed),
        Err(PolicyRepositoryBootstrapError::Corrupt)
    ));

    let storage = Arc::new(MemoryStorage::default());
    let repository = DurablePermissionPolicyRepository::bootstrap("instance-a", 8, storage.clone())
        .expect("repository");
    assert!(matches!(
        repository.update(&update(
            0,
            PolicyCapability::CameraCapture,
            PolicyDecision::Allowed,
            PolicyResourceConstraint::Any,
        )),
        PolicyRepositoryResult::Applied { revision: 1 }
    ));
    assert!(matches!(
        DurablePermissionPolicyRepository::bootstrap("instance-b", 8, storage),
        Err(PolicyRepositoryBootstrapError::WrongTarget)
    ));
}

#[test]
fn bootstrap_rejects_unsupported_duplicate_and_revision_gap_history() {
    let source = Arc::new(MemoryStorage::default());
    let repository = DurablePermissionPolicyRepository::bootstrap("instance-a", 8, source.clone())
        .expect("repository");
    assert!(matches!(
        repository.update(&update(
            0,
            PolicyCapability::CameraCapture,
            PolicyDecision::Allowed,
            PolicyResourceConstraint::Any,
        )),
        PolicyRepositoryResult::Applied { revision: 1 }
    ));
    let records = source.records();

    let duplicate = Arc::new(MemoryStorage::with_records(
        1,
        vec![records[0].clone(), records[0].clone()],
    ));
    assert!(matches!(
        DurablePermissionPolicyRepository::bootstrap("instance-a", 8, duplicate),
        Err(PolicyRepositoryBootstrapError::InvalidHistory)
    ));

    let gap = Arc::new(MemoryStorage::with_records(1, vec![records[1].clone()]));
    assert!(matches!(
        DurablePermissionPolicyRepository::bootstrap("instance-a", 8, gap),
        Err(PolicyRepositoryBootstrapError::InvalidHistory)
    ));

    let mut unsupported: serde_json::Value =
        serde_json::from_slice(&records[0]).expect("record json");
    unsupported["schema_version"] = serde_json::json!(99);
    let unsupported = Arc::new(MemoryStorage::with_records(
        1,
        vec![serde_json::to_vec(&unsupported).expect("record")],
    ));
    assert!(matches!(
        DurablePermissionPolicyRepository::bootstrap("instance-a", 8, unsupported),
        Err(PolicyRepositoryBootstrapError::UnsupportedVersion)
    ));
}
