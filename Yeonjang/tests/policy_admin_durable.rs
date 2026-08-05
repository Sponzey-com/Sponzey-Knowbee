use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};

use knowbee_yeonjang::durable_completed_store::{
    DurableRecordStorage, RawStoreRead, RawStoreWrite,
};
use knowbee_yeonjang::permission_policy::{
    PolicyCapability, PolicyDecision, PolicyResourceConstraint, PolicyUpdateCommand,
};
use knowbee_yeonjang::policy_admin::{
    PolicyAdminActionBinding, PolicyAdminAuthorizationDecision, PolicyAdminAuthorizationGrant,
    PolicyAdminAuthorizationRejection, PolicyAdminAuthorizationScope,
    PolicyAdminAuthorizationVerifier, PolicyAdminResult, PolicyAdminUseCase, PolicyRollbackCommand,
};
use knowbee_yeonjang::policy_repository::{
    DurablePermissionPolicyRepository, PolicyRepositoryResult,
};

const FINGERPRINT: &str = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

#[derive(Default)]
struct ToggleStorage {
    state: Mutex<(u64, Vec<Vec<u8>>)>,
    fail_writes: AtomicBool,
}

impl ToggleStorage {
    fn records(&self) -> Vec<Vec<u8>> {
        self.state.lock().expect("storage").1.clone()
    }
}

impl DurableRecordStorage for ToggleStorage {
    fn read(&self) -> RawStoreRead {
        let state = self.state.lock().expect("storage");
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
        if self.fail_writes.load(Ordering::SeqCst) {
            return RawStoreWrite::Unavailable;
        }
        let mut state = self.state.lock().expect("storage");
        if state.0 != expected_revision {
            return RawStoreWrite::Conflict;
        }
        state.0 += 1;
        state.1 = records;
        RawStoreWrite::Written { revision: state.0 }
    }
}

struct AllowVerifier;

impl PolicyAdminAuthorizationVerifier for AllowVerifier {
    fn verify(&self, _grant: &PolicyAdminAuthorizationGrant) -> PolicyAdminAuthorizationDecision {
        PolicyAdminAuthorizationDecision::Authorized
    }
}

fn command(expected_revision: u64, decision: PolicyDecision) -> PolicyUpdateCommand {
    PolicyUpdateCommand::new(
        "instance-a",
        expected_revision,
        PolicyCapability::CameraCapture,
        decision,
        PolicyResourceConstraint::Any,
    )
    .expect("command")
}

fn grant(command: &PolicyUpdateCommand, nonce: &str) -> PolicyAdminAuthorizationGrant {
    PolicyAdminAuthorizationGrant::new(
        PolicyAdminAuthorizationScope::AdminPolicyWrite,
        "authorization-secret-id",
        "requester-private-id",
        "instance-a",
        "session-private-id",
        FINGERPRINT,
        nonce,
        20_000,
        PolicyAdminActionBinding::from_update(command),
    )
    .expect("grant")
}

fn use_case(repository: Arc<DurablePermissionPolicyRepository>) -> PolicyAdminUseCase {
    PolicyAdminUseCase::new(Arc::new(AllowVerifier), repository)
}

#[test]
fn applied_nonce_and_redacted_audit_survive_restart_and_block_replay() {
    let storage = Arc::new(ToggleStorage::default());
    let repository = Arc::new(
        DurablePermissionPolicyRepository::bootstrap("instance-a", 16, storage.clone())
            .expect("repository"),
    );
    let command = command(0, PolicyDecision::Allowed);
    let grant = grant(&command, "nonce-private-value");

    assert_eq!(
        use_case(repository).update(&command, &grant),
        PolicyAdminResult::Policy(PolicyRepositoryResult::Applied { revision: 1 })
    );

    let bytes = storage.records().concat();
    let serialized = String::from_utf8(bytes).expect("json records");
    assert!(!serialized.contains("nonce-private-value"));
    assert!(!serialized.contains("authorization-secret-id"));
    assert!(!serialized.contains("requester-private-id"));
    assert!(!serialized.contains("session-private-id"));

    let restarted = Arc::new(
        DurablePermissionPolicyRepository::bootstrap("instance-a", 16, storage).expect("restart"),
    );
    assert_eq!(
        use_case(restarted.clone()).update(&command, &grant),
        PolicyAdminResult::AuthorizationRejected(PolicyAdminAuthorizationRejection::Replayed)
    );
    assert_eq!(restarted.snapshot().expect("snapshot").revision(), 1);
}

#[test]
fn unchanged_and_revision_conflict_attempts_are_consumed_durably() {
    for command in [
        command(0, PolicyDecision::Denied),
        command(4, PolicyDecision::Allowed),
    ] {
        let storage = Arc::new(ToggleStorage::default());
        let repository = Arc::new(
            DurablePermissionPolicyRepository::bootstrap("instance-a", 16, storage.clone())
                .expect("repository"),
        );
        let grant = grant(&command, "nonce-once");
        let first = use_case(repository).update(&command, &grant);
        assert!(matches!(
            first,
            PolicyAdminResult::Policy(
                PolicyRepositoryResult::Unchanged { .. }
                    | PolicyRepositoryResult::RevisionConflict { .. }
            )
        ));

        let restarted = Arc::new(
            DurablePermissionPolicyRepository::bootstrap("instance-a", 16, storage)
                .expect("restart"),
        );
        assert_eq!(
            use_case(restarted).update(&command, &grant),
            PolicyAdminResult::AuthorizationRejected(PolicyAdminAuthorizationRejection::Replayed)
        );
    }
}

#[test]
fn failed_storage_cas_changes_neither_policy_nor_nonce_and_retry_can_commit() {
    let storage = Arc::new(ToggleStorage::default());
    storage.fail_writes.store(true, Ordering::SeqCst);
    let repository = Arc::new(
        DurablePermissionPolicyRepository::bootstrap("instance-a", 16, storage.clone())
            .expect("repository"),
    );
    let command = command(0, PolicyDecision::Allowed);
    let grant = grant(&command, "nonce-retry-after-storage");
    let use_case = use_case(repository.clone());

    assert_eq!(
        use_case.update(&command, &grant),
        PolicyAdminResult::Policy(PolicyRepositoryResult::Unavailable)
    );
    assert_eq!(repository.snapshot().expect("snapshot").revision(), 0);

    storage.fail_writes.store(false, Ordering::SeqCst);
    assert_eq!(
        use_case.update(&command, &grant),
        PolicyAdminResult::Policy(PolicyRepositoryResult::Applied { revision: 1 })
    );
}

#[test]
fn rollback_snapshot_and_nonce_are_committed_atomically_and_replayed_after_restart() {
    let storage = Arc::new(ToggleStorage::default());
    let repository = Arc::new(
        DurablePermissionPolicyRepository::bootstrap("instance-a", 24, storage.clone())
            .expect("repository"),
    );
    let allow = command(0, PolicyDecision::Allowed);
    let allow_grant = grant(&allow, "nonce-allow");
    assert!(matches!(
        use_case(repository.clone()).update(&allow, &allow_grant),
        PolicyAdminResult::Policy(PolicyRepositoryResult::Applied { revision: 1 })
    ));
    let deny = command(1, PolicyDecision::Denied);
    let deny_grant = grant(&deny, "nonce-deny");
    assert!(matches!(
        use_case(repository.clone()).update(&deny, &deny_grant),
        PolicyAdminResult::Policy(PolicyRepositoryResult::Applied { revision: 2 })
    ));

    let rollback = PolicyRollbackCommand::new("instance-a", 2, 0).expect("rollback");
    let rollback_grant = PolicyAdminAuthorizationGrant::new(
        PolicyAdminAuthorizationScope::AdminPolicyWrite,
        "authorization-rollback",
        "requester-private-id",
        "instance-a",
        "session-private-id",
        FINGERPRINT,
        "nonce-rollback",
        20_000,
        PolicyAdminActionBinding::from_rollback(&rollback),
    )
    .expect("grant");
    assert_eq!(
        use_case(repository).rollback(&rollback, &rollback_grant),
        PolicyAdminResult::Policy(PolicyRepositoryResult::Applied { revision: 3 })
    );

    let restarted = Arc::new(
        DurablePermissionPolicyRepository::bootstrap("instance-a", 24, storage).expect("restart"),
    );
    assert_eq!(
        use_case(restarted.clone()).rollback(&rollback, &rollback_grant),
        PolicyAdminResult::AuthorizationRejected(PolicyAdminAuthorizationRejection::Replayed)
    );
    assert_eq!(
        restarted
            .snapshot()
            .expect("snapshot")
            .entry(PolicyCapability::CameraCapture)
            .decision(),
        PolicyDecision::Denied
    );
}
