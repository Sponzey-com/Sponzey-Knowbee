use std::sync::{Arc, Mutex};

use knowbee_yeonjang::artifact_lifecycle::{
    ArtifactBinding, ArtifactEvent, ArtifactLifecycleState,
};
use knowbee_yeonjang::artifact_repository::{
    ArtifactLifecycleRead, ArtifactRepositoryResult, DurableArtifactLifecycleRepository,
};
use knowbee_yeonjang::durable_completed_store::{
    DurableRecordStorage, RawStoreRead, RawStoreWrite,
};

#[test]
fn register_transition_and_restart_restore_exact_lifecycle() {
    let storage = Arc::new(CountingStorage::default());
    let repository =
        DurableArtifactLifecycleRepository::bootstrap(16, storage.clone()).expect("repository");
    let binding = binding();
    assert_eq!(
        repository.register(binding.clone()),
        ArtifactRepositoryResult::Registered { revision: 0 }
    );
    assert_eq!(
        repository.apply(
            binding.artifact_ref(),
            0,
            &ArtifactEvent::BeginFetch {
                requester_id: "requester-a".to_string(),
                request_id: "request-a".to_string(),
                operation_id: "operation-a".to_string(),
                transfer_id: "transfer-a".to_string(),
                chunk_count: 2,
                now_ms: 2_000,
            },
        ),
        ArtifactRepositoryResult::Applied { revision: 1 }
    );
    assert_eq!(
        repository.apply(
            binding.artifact_ref(),
            0,
            &ArtifactEvent::BeginFetch {
                requester_id: "requester-a".to_string(),
                request_id: "request-a".to_string(),
                operation_id: "operation-a".to_string(),
                transfer_id: "transfer-a".to_string(),
                chunk_count: 2,
                now_ms: 2_000,
            },
        ),
        ArtifactRepositoryResult::Idempotent { revision: 1 }
    );

    let restarted =
        DurableArtifactLifecycleRepository::bootstrap(16, storage).expect("restart repository");
    let ArtifactLifecycleRead::Found(lifecycle) = restarted.read(binding.artifact_ref()) else {
        panic!("restored lifecycle")
    };
    assert_eq!(lifecycle.binding(), &binding);
    assert_eq!(lifecycle.revision(), 1);
    assert!(matches!(
        lifecycle.state(),
        ArtifactLifecycleState::Fetching {
            transfer_id,
            chunk_count: 2,
            ..
        } if transfer_id == "transfer-a"
    ));
}

#[test]
fn registration_and_revision_conflicts_do_not_overwrite_canonical_state() {
    let repository =
        DurableArtifactLifecycleRepository::bootstrap(16, Arc::new(CountingStorage::default()))
            .expect("repository");
    let binding = binding();
    assert_eq!(
        repository.register(binding.clone()),
        ArtifactRepositoryResult::Registered { revision: 0 }
    );
    assert_eq!(
        repository.register(binding.clone()),
        ArtifactRepositoryResult::Idempotent { revision: 0 }
    );
    let mismatched = ArtifactBinding::new(
        binding.artifact_ref(),
        "requester-b",
        "request-a",
        "operation-a",
        binding.full_digest(),
        binding.total_size(),
        binding.created_at_ms(),
        binding.expires_at_ms(),
    )
    .expect("mismatched binding");
    assert_eq!(
        repository.register(mismatched),
        ArtifactRepositoryResult::BindingConflict
    );
    assert_eq!(
        repository.apply(
            binding.artifact_ref(),
            5,
            &ArtifactEvent::Expire { now_ms: 601_000 },
        ),
        ArtifactRepositoryResult::RevisionConflict {
            expected_revision: 5,
            current_revision: 0,
        }
    );
}

#[test]
fn storage_failure_keeps_registration_and_transition_out_of_memory() {
    let repository =
        DurableArtifactLifecycleRepository::bootstrap(16, Arc::new(UnavailableWriteStorage))
            .expect("repository");
    let binding = binding();
    assert_eq!(
        repository.register(binding.clone()),
        ArtifactRepositoryResult::Unavailable
    );
    assert_eq!(
        repository.read(binding.artifact_ref()),
        ArtifactLifecycleRead::Missing
    );
}

#[test]
fn stale_repository_storage_conflict_and_corrupt_restart_fail_closed() {
    let storage = Arc::new(CountingStorage::default());
    let first = DurableArtifactLifecycleRepository::bootstrap(16, storage.clone()).expect("first");
    let stale = DurableArtifactLifecycleRepository::bootstrap(16, storage.clone()).expect("stale");
    let binding = binding();
    assert_eq!(
        first.register(binding.clone()),
        ArtifactRepositoryResult::Registered { revision: 0 }
    );
    assert_eq!(
        stale.register(binding.clone()),
        ArtifactRepositoryResult::StorageConflict
    );
    assert_eq!(
        stale.read(binding.artifact_ref()),
        ArtifactLifecycleRead::Missing
    );

    let corrupt = Arc::new(FixedReadStorage(RawStoreRead::Records {
        revision: 1,
        records: vec![br#"{"schemaVersion":1,"unexpected":true}"#.to_vec()],
    }));
    assert!(
        DurableArtifactLifecycleRepository::bootstrap(16, corrupt).is_err(),
        "corrupt strict record must not create a default lifecycle"
    );
}

#[test]
fn pre_cleanup_status_record_restores_as_pending_for_safe_recovery() {
    let record = serde_json::json!({
        "schemaVersion": 1,
        "artifactRef":
            "capture:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "ownerRequesterId": "requester-a",
        "ownerRequestId": "request-a",
        "ownerOperationId": "operation-a",
        "fullDigest":
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "totalSize": 1024,
        "createdAtMs": 1000,
        "expiresAtMs": 601000,
        "revision": 1,
        "state": {"kind": "expired", "expired_at_ms": 601000}
    });
    let storage = Arc::new(FixedReadStorage(RawStoreRead::Records {
        revision: 1,
        records: vec![serde_json::to_vec(&record).expect("old record")],
    }));
    let repository =
        DurableArtifactLifecycleRepository::bootstrap(4, storage).expect("compatible restart");
    assert!(matches!(
        repository.read(
            "capture:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        ),
        ArtifactLifecycleRead::Found(lifecycle)
            if lifecycle.cleanup_status()
                == knowbee_yeonjang::artifact_lifecycle::ArtifactCleanupStatus::Pending
    ));
}

#[test]
fn cancelled_transfer_identity_survives_restart_and_legacy_cancel_remains_unbound() {
    let storage = Arc::new(CountingStorage::default());
    let repository =
        DurableArtifactLifecycleRepository::bootstrap(4, storage.clone()).expect("repository");
    let binding = binding();
    assert!(matches!(
        repository.register(binding.clone()),
        ArtifactRepositoryResult::Registered { .. }
    ));
    assert!(matches!(
        repository.apply(
            binding.artifact_ref(),
            0,
            &ArtifactEvent::BeginFetch {
                requester_id: "requester-a".to_string(),
                request_id: "request-a".to_string(),
                operation_id: "operation-a".to_string(),
                transfer_id: "transfer-a".to_string(),
                chunk_count: 1,
                now_ms: 2_000,
            },
        ),
        ArtifactRepositoryResult::Applied { revision: 1 }
    ));
    assert!(matches!(
        repository.apply(
            binding.artifact_ref(),
            1,
            &ArtifactEvent::Cancel {
                requester_id: "requester-a".to_string(),
                transfer_id: "transfer-a".to_string(),
                now_ms: 2_100,
            },
        ),
        ArtifactRepositoryResult::Applied { revision: 2 }
    ));
    let restarted =
        DurableArtifactLifecycleRepository::bootstrap(4, storage).expect("restart repository");
    assert!(matches!(
        restarted.read(binding.artifact_ref()),
        ArtifactLifecycleRead::Found(lifecycle)
            if matches!(
                lifecycle.state(),
                ArtifactLifecycleState::Cancelled {
                    transfer_id: Some(transfer_id),
                    ..
                } if transfer_id == "transfer-a"
            )
    ));

    let legacy = serde_json::json!({
        "schemaVersion": 1,
        "artifactRef":
            "capture:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        "ownerRequesterId": "requester-a",
        "ownerRequestId": "request-a",
        "ownerOperationId": "operation-a",
        "fullDigest":
            "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        "totalSize": 1024,
        "createdAtMs": 1000,
        "expiresAtMs": 601000,
        "revision": 1,
        "state": {"kind": "cancelled", "cancelled_at_ms": 2000}
    });
    let legacy_store = Arc::new(FixedReadStorage(RawStoreRead::Records {
        revision: 1,
        records: vec![serde_json::to_vec(&legacy).expect("legacy record")],
    }));
    let legacy_repository =
        DurableArtifactLifecycleRepository::bootstrap(4, legacy_store).expect("legacy restart");
    assert!(matches!(
        legacy_repository.read(
            "capture:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        ),
        ArtifactLifecycleRead::Found(lifecycle)
            if matches!(
                lifecycle.state(),
                ArtifactLifecycleState::Cancelled {
                    transfer_id: None,
                    ..
                }
            )
    ));
}

fn binding() -> ArtifactBinding {
    ArtifactBinding::new(
        "capture:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "requester-a",
        "request-a",
        "operation-a",
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        1024,
        1_000,
        601_000,
    )
    .expect("binding")
}

#[derive(Default)]
struct CountingStorage(Mutex<(u64, Vec<Vec<u8>>)>);

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

struct FixedReadStorage(RawStoreRead);

impl DurableRecordStorage for FixedReadStorage {
    fn read(&self) -> RawStoreRead {
        match &self.0 {
            RawStoreRead::Missing { revision } => RawStoreRead::Missing {
                revision: *revision,
            },
            RawStoreRead::Records { revision, records } => RawStoreRead::Records {
                revision: *revision,
                records: records.clone(),
            },
            RawStoreRead::Unavailable => RawStoreRead::Unavailable,
        }
    }

    fn compare_and_swap(&self, _: u64, _: Vec<Vec<u8>>) -> RawStoreWrite {
        RawStoreWrite::Unavailable
    }
}
