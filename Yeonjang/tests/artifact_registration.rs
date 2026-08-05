use std::sync::{Arc, Mutex};

use knowbee_yeonjang::artifact_lifecycle::{
    ArtifactBinding, ArtifactEvent, ArtifactLifecycleState,
};
use knowbee_yeonjang::artifact_registration::{
    ArtifactRegistrationReject, ArtifactRegistrationResult, ArtifactRegistrationUseCase,
};
use knowbee_yeonjang::artifact_repository::{
    ArtifactLifecycleList, ArtifactLifecycleRead, ArtifactLifecycleStore, ArtifactRepositoryResult,
    DurableArtifactLifecycleRepository,
};
use knowbee_yeonjang::artifact_sink::CaptureArtifactKind;
use knowbee_yeonjang::durable_completed_store::{
    DurableRecordStorage, RawStoreRead, RawStoreWrite,
};
use knowbee_yeonjang::platform_operation::{
    BoundPlatformOperation, BoundPlatformOperationInput, CapabilityCommand, TargetPlatform,
};
use knowbee_yeonjang::platform_port::{PlatformCaptureArtifactReceipt, PlatformEffectReceipt};

#[test]
fn verified_capture_receipt_registers_exact_owner_digest_and_delivery_descriptor() {
    let repository = repository();
    let use_case = ArtifactRegistrationUseCase::new(repository.clone(), 600_000)
        .expect("registration use case");
    let operation = operation("registered");
    let effect = capture_effect(&operation, 'a');

    let descriptor = match use_case.register(&operation, &effect) {
        ArtifactRegistrationResult::Registered(descriptor) => descriptor,
        other => panic!("expected registration, got {other:?}"),
    };

    assert_eq!(
        descriptor.artifact_ref(),
        effect.artifact().unwrap().artifact_ref()
    );
    assert_eq!(
        descriptor.full_digest(),
        effect.artifact().unwrap().full_digest()
    );
    assert_eq!(descriptor.lifecycle_revision(), 0);
    assert!(matches!(
        repository.read(descriptor.artifact_ref()),
        ArtifactLifecycleRead::Found(lifecycle)
            if lifecycle.state() == &ArtifactLifecycleState::Registered
                && lifecycle.binding().owner_requester_id() == operation.requester_id()
                && lifecycle.binding().owner_request_id() == operation.request_id()
                && lifecycle.binding().owner_operation_id() == operation.operation_id()
                && lifecycle.binding().expires_at_ms() == 601_000
    ));
}

#[test]
fn exact_redelivery_is_idempotent_but_missing_artifact_evidence_is_rejected() {
    let repository = repository();
    let use_case =
        ArtifactRegistrationUseCase::new(repository, 600_000).expect("registration use case");
    let operation = operation("duplicate");
    let effect = capture_effect(&operation, 'b');

    assert!(matches!(
        use_case.register(&operation, &effect),
        ArtifactRegistrationResult::Registered(_)
    ));
    assert!(matches!(
        use_case.register(&operation, &effect),
        ArtifactRegistrationResult::AlreadyRegistered(_)
    ));
    let generic =
        PlatformEffectReceipt::for_operation(&operation, "native-only".to_string(), 1_000)
            .expect("generic effect");
    assert_eq!(
        use_case.register(&operation, &generic),
        ArtifactRegistrationResult::Rejected {
            reason: ArtifactRegistrationReject::ArtifactEvidenceMissing
        }
    );
}

#[test]
fn binding_conflict_is_rejected_and_storage_unavailable_remains_retryable() {
    let repository = repository();
    let operation = operation("conflict");
    let effect = capture_effect(&operation, 'c');
    let artifact = effect.artifact().expect("artifact evidence");
    let conflicting = ArtifactBinding::new(
        artifact.artifact_ref(),
        "another-requester",
        operation.request_id(),
        operation.operation_id(),
        artifact.full_digest(),
        artifact.size_bytes(),
        1_000,
        601_000,
    )
    .expect("conflicting binding");
    assert!(matches!(
        repository.register(conflicting),
        ArtifactRepositoryResult::Registered { .. }
    ));
    let use_case =
        ArtifactRegistrationUseCase::new(repository, 600_000).expect("registration use case");
    assert_eq!(
        use_case.register(&operation, &effect),
        ArtifactRegistrationResult::Rejected {
            reason: ArtifactRegistrationReject::BindingConflict
        }
    );

    let unavailable = ArtifactRegistrationUseCase::new(Arc::new(UnavailableStore), 600_000)
        .expect("unavailable use case");
    assert_eq!(
        unavailable.register(&operation, &effect),
        ArtifactRegistrationResult::Deferred {
            reason: ArtifactRegistrationReject::StorageUnavailable
        }
    );
}

fn capture_effect(
    operation: &BoundPlatformOperation,
    digest_character: char,
) -> PlatformEffectReceipt {
    let artifact = PlatformCaptureArtifactReceipt::new(
        format!("capture:{}", digest_character.to_string().repeat(64)),
        CaptureArtifactKind::CameraJpeg,
        512,
        format!("sha256:{}", digest_character.to_string().repeat(64)),
    )
    .expect("artifact evidence");
    PlatformEffectReceipt::for_capture_operation(operation, artifact, 1_000)
        .expect("capture effect")
}

fn operation(suffix: &str) -> BoundPlatformOperation {
    BoundPlatformOperation::new(BoundPlatformOperationInput {
        request_id: format!("request-{suffix}"),
        command_id: format!("command-{suffix}"),
        operation_id: format!("operation-{suffix}"),
        requester_id: "requester-a".to_string(),
        target_platform: TargetPlatform::Macos,
        target_instance_id: "instance-a".to_string(),
        target_session_id: "session-a".to_string(),
        target_fingerprint: format!("sha256:{}", "34".repeat(32)),
        authorization_ref: format!("authorization-{suffix}"),
        policy_revision: 1,
        idempotency_key: format!("idempotency-{suffix}"),
        deadline_ms: 2_000,
        cancellation_id: format!("cancel-{suffix}"),
        artifact_lease_ref: Some(format!("lease-{suffix}")),
        command: CapabilityCommand::CameraCapture {
            device_id: None,
            capture_timeout_ms: Some(1_000),
        },
    })
    .expect("operation")
}

fn repository() -> Arc<DurableArtifactLifecycleRepository> {
    Arc::new(
        DurableArtifactLifecycleRepository::bootstrap(8, Arc::new(MemoryStorage::default()))
            .expect("repository"),
    )
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

struct UnavailableStore;

impl ArtifactLifecycleStore for UnavailableStore {
    fn read(&self, _: &str) -> ArtifactLifecycleRead {
        ArtifactLifecycleRead::Unavailable
    }

    fn list(&self) -> ArtifactLifecycleList {
        ArtifactLifecycleList::Unavailable
    }

    fn register(&self, _: ArtifactBinding) -> ArtifactRepositoryResult {
        ArtifactRepositoryResult::Unavailable
    }

    fn apply(&self, _: &str, _: u64, _: &ArtifactEvent) -> ArtifactRepositoryResult {
        ArtifactRepositoryResult::Unavailable
    }
}
