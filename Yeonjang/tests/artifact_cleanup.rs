use std::sync::{Arc, Mutex};

use knowbee_yeonjang::artifact_cleanup::{
    ArtifactCleanupOutcome, ArtifactCleanupPort, ArtifactCleanupReject, ArtifactCleanupUseCase,
    ArtifactRemovalResult,
};
use knowbee_yeonjang::artifact_lifecycle::{
    ArtifactBinding, ArtifactCleanupStatus, ArtifactEvent, ArtifactLifecycleState,
};
use knowbee_yeonjang::artifact_repository::{
    ArtifactLifecycleRead, ArtifactRepositoryResult, DurableArtifactLifecycleRepository,
};
use knowbee_yeonjang::durable_completed_store::{
    DurableRecordStorage, RawStoreRead, RawStoreWrite,
};

#[test]
fn restart_expires_active_artifact_before_remove_and_durably_completes_cleanup() {
    let repository = repository();
    let binding = binding("a");
    repository.register(binding.clone());
    let remover = Arc::new(ControlledRemover::new(ArtifactRemovalResult::Removed));
    let use_case = ArtifactCleanupUseCase::new(repository.clone(), remover.clone());

    let report = use_case.recover(601_000);
    assert_eq!(report.completed, 1);
    assert_eq!(report.deferred, 0);
    assert_eq!(remover.refs(), vec![binding.artifact_ref().to_string()]);
    assert!(matches!(
        repository.read(binding.artifact_ref()),
        ArtifactLifecycleRead::Found(lifecycle)
            if matches!(lifecycle.state(), ArtifactLifecycleState::Expired { .. })
                && lifecycle.cleanup_status()
                    == ArtifactCleanupStatus::Completed { completed_at_ms: 601_000 }
                && lifecycle.revision() == 2
    ));
}

#[test]
fn cleanup_failure_stays_pending_and_next_recovery_retries_same_exact_ref() {
    let repository = repository();
    let binding = binding("b");
    repository.register(binding.clone());
    acknowledge(&repository, &binding);
    let remover = Arc::new(ControlledRemover::new(ArtifactRemovalResult::Unavailable));
    let use_case = ArtifactCleanupUseCase::new(repository.clone(), remover.clone());

    assert_eq!(
        use_case.cleanup(binding.artifact_ref(), 3, 2_300),
        ArtifactCleanupOutcome::Deferred {
            reason: ArtifactCleanupReject::RemovalUnavailable
        }
    );
    assert!(matches!(
        repository.read(binding.artifact_ref()),
        ArtifactLifecycleRead::Found(lifecycle)
            if lifecycle.cleanup_status() == ArtifactCleanupStatus::Pending
                && lifecycle.revision() == 3
    ));

    remover.set(ArtifactRemovalResult::AlreadyMissing);
    let report = use_case.recover(2_400);
    assert_eq!(report.completed, 1);
    assert_eq!(remover.refs().len(), 2);
    assert!(matches!(
        repository.read(binding.artifact_ref()),
        ArtifactLifecycleRead::Found(lifecycle)
            if matches!(
                lifecycle.cleanup_status(),
                ArtifactCleanupStatus::Completed { .. }
            )
                && lifecycle.revision() == 4
    ));
}

fn acknowledge(repository: &DurableArtifactLifecycleRepository, binding: &ArtifactBinding) {
    for (revision, event) in [
        (
            0,
            ArtifactEvent::BeginFetch {
                requester_id: "requester-a".to_string(),
                request_id: "request-a".to_string(),
                operation_id: "operation-a".to_string(),
                transfer_id: "transfer-a".to_string(),
                chunk_count: 1,
                now_ms: 2_000,
            },
        ),
        (
            1,
            ArtifactEvent::ChunksPublished {
                transfer_id: "transfer-a".to_string(),
                chunk_count: 1,
                now_ms: 2_100,
            },
        ),
        (
            2,
            ArtifactEvent::Acknowledge {
                requester_id: "requester-a".to_string(),
                transfer_id: "transfer-a".to_string(),
                full_digest: binding.full_digest().to_string(),
                now_ms: 2_200,
            },
        ),
    ] {
        assert!(matches!(
            repository.apply(binding.artifact_ref(), revision, &event),
            ArtifactRepositoryResult::Applied { .. }
        ));
    }
}

fn repository() -> Arc<DurableArtifactLifecycleRepository> {
    Arc::new(
        DurableArtifactLifecycleRepository::bootstrap(8, Arc::new(MemoryStorage::default()))
            .expect("repository"),
    )
}

fn binding(character: &str) -> ArtifactBinding {
    ArtifactBinding::new(
        format!("capture:{}", character.repeat(64)),
        "requester-a",
        "request-a",
        "operation-a",
        format!("sha256:{}", character.repeat(64)),
        1024,
        1_000,
        601_000,
    )
    .expect("binding")
}

struct ControlledRemover {
    result: Mutex<ArtifactRemovalResult>,
    refs: Mutex<Vec<String>>,
}

impl ControlledRemover {
    fn new(result: ArtifactRemovalResult) -> Self {
        Self {
            result: Mutex::new(result),
            refs: Mutex::new(Vec::new()),
        }
    }

    fn set(&self, result: ArtifactRemovalResult) {
        *self.result.lock().expect("result") = result;
    }

    fn refs(&self) -> Vec<String> {
        self.refs.lock().expect("refs").clone()
    }
}

impl ArtifactCleanupPort for ControlledRemover {
    fn remove(&self, artifact_ref: &str) -> ArtifactRemovalResult {
        self.refs
            .lock()
            .expect("refs")
            .push(artifact_ref.to_string());
        *self.result.lock().expect("result")
    }
}

#[derive(Default)]
struct MemoryStorage(Mutex<(u64, Vec<Vec<u8>>)>);

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
