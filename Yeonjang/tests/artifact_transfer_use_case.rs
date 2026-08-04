use std::sync::{Arc, Mutex};

use knowbee_yeonjang::artifact_lifecycle::{ArtifactBinding, ArtifactLifecycleState};
use knowbee_yeonjang::artifact_repository::{
    ArtifactLifecycleRead, ArtifactRepositoryResult, DurableArtifactLifecycleRepository,
};
use knowbee_yeonjang::artifact_transfer::ArtifactChunkConfig;
use knowbee_yeonjang::artifact_transfer_use_case::{
    ArtifactAckCommand, ArtifactAckResult, ArtifactCancelCommand, ArtifactCancelResult,
    ArtifactFetchCommand, ArtifactFetchResult, ArtifactPublishCommand,
    ArtifactPublishFailureResult, ArtifactPublishResult, ArtifactTransferReject,
    ArtifactTransferUseCase, VerifiedArtifactBytes, VerifiedArtifactSource,
    VerifiedArtifactSourceError,
};
use knowbee_yeonjang::capture_artifact_postcheck::CaptureArtifactKind;
use knowbee_yeonjang::durable_completed_store::{
    DurableRecordStorage, RawStoreRead, RawStoreWrite,
};

#[test]
fn prepare_publish_and_ack_persist_before_each_follow_on_effect() {
    let bytes = camera_bytes();
    let binding = binding(&bytes);
    let repository = Arc::new(
        DurableArtifactLifecycleRepository::bootstrap(16, Arc::new(MemoryStorage::default()))
            .expect("repository"),
    );
    assert!(matches!(
        repository.register(binding.clone()),
        ArtifactRepositoryResult::Registered { revision: 0 }
    ));
    let source = Arc::new(RecordingSource::ready(
        binding.artifact_ref(),
        bytes.clone(),
    ));
    let use_case = ArtifactTransferUseCase::new(repository.clone(), source.clone());

    let ArtifactFetchResult::Prepared {
        chunks,
        lifecycle_revision,
    } = use_case.prepare_fetch(&fetch_command(binding.artifact_ref(), "requester-a", 0))
    else {
        panic!("prepared fetch")
    };
    assert_eq!(lifecycle_revision, 1);
    assert_eq!(chunks.len(), 1);
    assert_eq!(source.calls(), 1);
    assert!(matches!(
        repository.read(binding.artifact_ref()),
        ArtifactLifecycleRead::Found(lifecycle)
            if matches!(lifecycle.state(), ArtifactLifecycleState::Fetching { .. })
    ));

    assert_eq!(
        use_case.record_published(&ArtifactPublishCommand::new(
            binding.artifact_ref(),
            "transfer-a",
            1,
            lifecycle_revision,
            2_100,
        )),
        ArtifactPublishResult::AwaitingAcknowledgement {
            lifecycle_revision: 2
        }
    );
    let ack = ArtifactAckCommand::new(
        binding.artifact_ref(),
        "requester-a",
        "transfer-a",
        binding.full_digest(),
        2,
        2_200,
    );
    assert_eq!(
        use_case.acknowledge(&ack),
        ArtifactAckResult::CleanupRequired {
            lifecycle_revision: 3
        }
    );
    assert_eq!(
        use_case.acknowledge(&ack),
        ArtifactAckResult::AlreadyAcknowledged {
            lifecycle_revision: 3
        }
    );
}

#[test]
fn wrong_owner_and_unavailable_source_do_not_create_false_delivery_success() {
    let bytes = camera_bytes();
    let binding = binding(&bytes);
    let repository = Arc::new(
        DurableArtifactLifecycleRepository::bootstrap(16, Arc::new(MemoryStorage::default()))
            .expect("repository"),
    );
    repository.register(binding.clone());
    let ready = Arc::new(RecordingSource::ready(
        binding.artifact_ref(),
        bytes.clone(),
    ));
    let use_case = ArtifactTransferUseCase::new(repository.clone(), ready.clone());
    assert_eq!(
        use_case.prepare_fetch(&fetch_command(binding.artifact_ref(), "requester-b", 0)),
        ArtifactFetchResult::Rejected {
            reason: ArtifactTransferReject::WrongOwner
        }
    );
    assert_eq!(ready.calls(), 0);
    assert!(matches!(
        repository.read(binding.artifact_ref()),
        ArtifactLifecycleRead::Found(lifecycle)
            if matches!(lifecycle.state(), ArtifactLifecycleState::Registered)
    ));

    let unavailable = Arc::new(RecordingSource::unavailable());
    let use_case = ArtifactTransferUseCase::new(repository.clone(), unavailable);
    assert_eq!(
        use_case.prepare_fetch(&fetch_command(binding.artifact_ref(), "requester-a", 0)),
        ArtifactFetchResult::Rejected {
            reason: ArtifactTransferReject::SourceUnavailable
        }
    );
    assert!(matches!(
        repository.read(binding.artifact_ref()),
        ArtifactLifecycleRead::Found(lifecycle)
            if matches!(
                lifecycle.state(),
                ArtifactLifecycleState::Failed { .. }
            )
    ));
}

#[test]
fn publish_failure_is_durable_and_never_becomes_awaiting_ack() {
    let bytes = camera_bytes();
    let binding = binding(&bytes);
    let repository = Arc::new(
        DurableArtifactLifecycleRepository::bootstrap(16, Arc::new(MemoryStorage::default()))
            .expect("repository"),
    );
    repository.register(binding.clone());
    let use_case = ArtifactTransferUseCase::new(
        repository.clone(),
        Arc::new(RecordingSource::ready(binding.artifact_ref(), bytes)),
    );
    let ArtifactFetchResult::Prepared {
        lifecycle_revision, ..
    } = use_case.prepare_fetch(&fetch_command(binding.artifact_ref(), "requester-a", 0))
    else {
        panic!("prepared")
    };
    assert_eq!(
        use_case.record_publish_failed(&ArtifactPublishCommand::new(
            binding.artifact_ref(),
            "transfer-a",
            1,
            lifecycle_revision,
            2_100,
        )),
        ArtifactPublishFailureResult::Failed {
            lifecycle_revision: 2
        }
    );
    assert!(matches!(
        repository.read(binding.artifact_ref()),
        ArtifactLifecycleRead::Found(lifecycle)
            if matches!(lifecycle.state(), ArtifactLifecycleState::Failed { .. })
    ));
}

#[test]
fn exact_transfer_cancel_persists_and_only_its_redelivery_is_idempotent() {
    let bytes = camera_bytes();
    let binding = binding(&bytes);
    let repository = Arc::new(
        DurableArtifactLifecycleRepository::bootstrap(16, Arc::new(MemoryStorage::default()))
            .expect("repository"),
    );
    repository.register(binding.clone());
    let use_case = ArtifactTransferUseCase::new(
        repository.clone(),
        Arc::new(RecordingSource::ready(binding.artifact_ref(), bytes)),
    );
    let ArtifactFetchResult::Prepared {
        lifecycle_revision, ..
    } = use_case.prepare_fetch(&fetch_command(binding.artifact_ref(), "requester-a", 0))
    else {
        panic!("prepared")
    };
    let cancel = ArtifactCancelCommand::new(
        binding.artifact_ref(),
        "requester-a",
        "request-a",
        "operation-a",
        "transfer-a",
        lifecycle_revision,
        2_100,
    );
    assert_eq!(
        use_case.cancel(&cancel),
        ArtifactCancelResult::Cancelled {
            lifecycle_revision: 2
        }
    );
    assert_eq!(
        use_case.cancel(&cancel),
        ArtifactCancelResult::AlreadyCancelled {
            lifecycle_revision: 2
        }
    );
    assert!(matches!(
        repository.read(binding.artifact_ref()),
        ArtifactLifecycleRead::Found(lifecycle)
            if matches!(lifecycle.state(), ArtifactLifecycleState::Cancelled { .. })
    ));
}

#[test]
fn cancel_accepts_the_observed_fetch_revision_after_the_same_transfer_reaches_awaiting_ack() {
    let bytes = camera_bytes();
    let binding = binding(&bytes);
    let repository = Arc::new(
        DurableArtifactLifecycleRepository::bootstrap(16, Arc::new(MemoryStorage::default()))
            .expect("repository"),
    );
    repository.register(binding.clone());
    let use_case = ArtifactTransferUseCase::new(
        repository,
        Arc::new(RecordingSource::ready(binding.artifact_ref(), bytes)),
    );
    let ArtifactFetchResult::Prepared {
        lifecycle_revision, ..
    } = use_case.prepare_fetch(&fetch_command(binding.artifact_ref(), "requester-a", 0))
    else {
        panic!("prepared")
    };
    assert_eq!(
        use_case.record_published(&ArtifactPublishCommand::new(
            binding.artifact_ref(),
            "transfer-a",
            1,
            lifecycle_revision,
            2_100,
        )),
        ArtifactPublishResult::AwaitingAcknowledgement {
            lifecycle_revision: 2
        }
    );
    assert_eq!(
        use_case.cancel(&ArtifactCancelCommand::new(
            binding.artifact_ref(),
            "requester-a",
            "request-a",
            "operation-a",
            "transfer-a",
            lifecycle_revision,
            2_200,
        )),
        ArtifactCancelResult::Cancelled {
            lifecycle_revision: 3
        }
    );
}

#[test]
fn artifact_cancel_rejects_wrong_owner_revision_transfer_and_terminal_state() {
    let bytes = camera_bytes();
    let binding = binding(&bytes);
    let repository = Arc::new(
        DurableArtifactLifecycleRepository::bootstrap(16, Arc::new(MemoryStorage::default()))
            .expect("repository"),
    );
    repository.register(binding.clone());
    let use_case = ArtifactTransferUseCase::new(
        repository.clone(),
        Arc::new(RecordingSource::ready(binding.artifact_ref(), bytes)),
    );
    let ArtifactFetchResult::Prepared {
        lifecycle_revision, ..
    } = use_case.prepare_fetch(&fetch_command(binding.artifact_ref(), "requester-a", 0))
    else {
        panic!("prepared")
    };
    for (requester, transfer, revision, reason) in [
        (
            "requester-b",
            "transfer-a",
            lifecycle_revision,
            ArtifactTransferReject::WrongOwner,
        ),
        (
            "requester-a",
            "transfer-b",
            lifecycle_revision,
            ArtifactTransferReject::WrongTransfer,
        ),
        (
            "requester-a",
            "transfer-a",
            lifecycle_revision + 1,
            ArtifactTransferReject::RevisionConflict,
        ),
    ] {
        assert_eq!(
            use_case.cancel(&ArtifactCancelCommand::new(
                binding.artifact_ref(),
                requester,
                "request-a",
                "operation-a",
                transfer,
                revision,
                2_100,
            )),
            ArtifactCancelResult::Rejected { reason }
        );
    }
}

fn fetch_command(
    artifact_ref: &str,
    requester_id: &str,
    expected_revision: u64,
) -> ArtifactFetchCommand {
    ArtifactFetchCommand::new(
        artifact_ref,
        requester_id,
        "request-a",
        "operation-a",
        "transfer-a",
        expected_revision,
        2_000,
        ArtifactChunkConfig::new(256 * 1024).expect("config"),
    )
}

fn binding(bytes: &[u8]) -> ArtifactBinding {
    let verified = VerifiedArtifactBytes::new(
        "capture:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        CaptureArtifactKind::CameraJpeg,
        bytes.to_vec(),
    )
    .expect("verified");
    ArtifactBinding::new(
        verified.artifact_ref(),
        "requester-a",
        "request-a",
        "operation-a",
        verified.metadata().sha256_digest(),
        verified.metadata().size_bytes(),
        1_000,
        601_000,
    )
    .expect("binding")
}

fn camera_bytes() -> Vec<u8> {
    vec![
        0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x01, 0x00, 0x01, 0x03, 0x01, 0x11, 0x00,
        0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9,
    ]
}

struct RecordingSource {
    result: Result<VerifiedArtifactBytes, VerifiedArtifactSourceError>,
    calls: Mutex<usize>,
}

impl RecordingSource {
    fn ready(artifact_ref: &str, bytes: Vec<u8>) -> Self {
        Self {
            result: VerifiedArtifactBytes::new(
                artifact_ref,
                CaptureArtifactKind::CameraJpeg,
                bytes,
            ),
            calls: Mutex::new(0),
        }
    }

    fn unavailable() -> Self {
        Self {
            result: Err(VerifiedArtifactSourceError::Unavailable),
            calls: Mutex::new(0),
        }
    }

    fn calls(&self) -> usize {
        *self.calls.lock().expect("calls")
    }
}

impl VerifiedArtifactSource for RecordingSource {
    fn read_verified(&self, _: &str) -> Result<VerifiedArtifactBytes, VerifiedArtifactSourceError> {
        *self.calls.lock().expect("calls") += 1;
        self.result.clone()
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
