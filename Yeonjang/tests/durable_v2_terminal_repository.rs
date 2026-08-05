use std::sync::{Arc, Mutex};

use knowbee_yeonjang::durable_completed_store::{
    DurableRecordStorage, RawStoreRead, RawStoreWrite,
};
use knowbee_yeonjang::protocol_v2_terminal::V2TerminalResponseContent;
use knowbee_yeonjang::v2_terminal_repository::{
    DurableV2TerminalRepository, DurableV2TerminalRepositoryError, V2TerminalClaim,
    V2TerminalComplete, V2TerminalLookup, V2TerminalRepository, V2TerminalScope,
};

#[test]
fn prepared_terminal_is_finalized_as_effect_unknown_on_restart_without_reexecution() {
    let storage = Arc::new(FakeStorage::default());
    let scope = terminal_scope();
    let first =
        DurableV2TerminalRepository::bootstrap(2, storage.clone()).expect("empty repository");
    assert_eq!(storage.counts(), (1, 0));
    assert_eq!(
        first.prepare(&scope, restart_recovery_content()),
        V2TerminalClaim::Claimed
    );
    assert_eq!(
        first.prepare(&scope, restart_recovery_content()),
        V2TerminalClaim::InProgress
    );
    assert_eq!(storage.counts(), (1, 1));
    drop(first);

    let recovered =
        DurableV2TerminalRepository::bootstrap(2, storage.clone()).expect("pending recovery");
    assert!(matches!(
        recovered.lookup(&scope),
        V2TerminalLookup::Completed(content)
            if *content == restart_recovery_content()
    ));
    assert_eq!(storage.counts(), (2, 2));
    drop(recovered);

    let completed =
        DurableV2TerminalRepository::bootstrap(2, storage.clone()).expect("completed recovery");
    assert!(matches!(
        completed.lookup(&scope),
        V2TerminalLookup::Completed(content)
            if *content == restart_recovery_content()
    ));
    assert_eq!(storage.counts(), (3, 2));
}

#[test]
fn completed_terminal_restarts_with_immutable_content() {
    let storage = Arc::new(FakeStorage::default());
    let scope = terminal_scope();
    let first =
        DurableV2TerminalRepository::bootstrap(2, storage.clone()).expect("empty repository");
    assert_eq!(
        first.prepare(&scope, restart_recovery_content()),
        V2TerminalClaim::Claimed
    );
    assert_eq!(
        first.complete(&scope, terminal_content()),
        V2TerminalComplete::Completed
    );
    drop(first);

    let restarted =
        DurableV2TerminalRepository::bootstrap(2, storage).expect("completed repository");
    assert!(matches!(
        restarted.lookup(&scope),
        V2TerminalLookup::Completed(content) if *content == terminal_content()
    ));
}

#[test]
fn schema_three_content_must_match_the_canonical_repository_scope() {
    let storage = Arc::new(FakeStorage::default());
    let scope = terminal_scope();
    let repository = DurableV2TerminalRepository::bootstrap(2, storage).expect("empty repository");
    assert_eq!(
        repository.prepare(&scope, restart_recovery_content()),
        V2TerminalClaim::Claimed
    );
    let mut wrong = serde_json::to_value(terminal_content()).expect("terminal JSON");
    wrong["schema_version"] = 3.into();
    wrong["target_scope_digest"] = format!("sha256:{}", "cd".repeat(32)).into();
    let wrong: V2TerminalResponseContent =
        serde_json::from_value(wrong).expect("schema-three terminal");
    assert_eq!(
        repository.complete(&scope, wrong),
        V2TerminalComplete::Unavailable
    );
}

#[test]
fn corrupt_record_fails_bootstrap_without_rewriting_storage() {
    let storage = Arc::new(FakeStorage::with_records(vec![b"corrupt".to_vec()]));
    assert!(matches!(
        DurableV2TerminalRepository::bootstrap(2, storage.clone()),
        Err(DurableV2TerminalRepositoryError::Corrupt)
    ));
    assert_eq!(storage.counts(), (1, 0));
}

#[test]
fn legacy_completed_is_read_compatible_but_legacy_pending_fails_closed() {
    let scope = terminal_scope();
    let completed_storage = Arc::new(FakeStorage::with_records(vec![
        serde_json::to_vec(&serde_json::json!({
            "schema_version": 1,
            "idempotency_key": "idempotency-v2",
            "exact_scope_digest": format!("sha256:{}", "ab".repeat(32)),
            "terminal": {
                "state": "completed",
                "content": terminal_content()
            }
        }))
        .expect("legacy completed record"),
    ]));
    let completed = DurableV2TerminalRepository::bootstrap(2, completed_storage.clone())
        .expect("legacy completed compatibility");
    assert!(matches!(
        completed.lookup(&scope),
        V2TerminalLookup::Completed(content) if *content == terminal_content()
    ));
    assert_eq!(completed_storage.counts(), (1, 0));

    let pending_storage = Arc::new(FakeStorage::with_records(vec![
        serde_json::to_vec(&serde_json::json!({
            "schema_version": 1,
            "idempotency_key": "idempotency-v2",
            "exact_scope_digest": format!("sha256:{}", "ab".repeat(32)),
            "terminal": {"state": "pending"}
        }))
        .expect("legacy pending record"),
    ]));
    assert!(matches!(
        DurableV2TerminalRepository::bootstrap(2, pending_storage.clone()),
        Err(DurableV2TerminalRepositoryError::RecoveryEvidenceMissing)
    ));
    assert_eq!(pending_storage.counts(), (1, 0));
}

#[test]
fn prepared_recovery_commit_failure_blocks_bootstrap_without_activation() {
    let storage = Arc::new(FakeStorage::with_unavailable_writes(vec![
        serde_json::to_vec(&serde_json::json!({
            "schema_version": 2,
            "idempotency_key": "idempotency-v2",
            "exact_scope_digest": format!("sha256:{}", "ab".repeat(32)),
            "terminal": {
                "state": "prepared",
                "restart_recovery": restart_recovery_content()
            }
        }))
        .expect("prepared record"),
    ]));
    assert!(matches!(
        DurableV2TerminalRepository::bootstrap(2, storage.clone()),
        Err(DurableV2TerminalRepositoryError::RecoveryCommitFailed)
    ));
    assert_eq!(storage.counts(), (1, 0));
}

#[derive(Default)]
struct FakeStorage {
    state: Mutex<FakeStorageState>,
}

#[derive(Default)]
struct FakeStorageState {
    revision: u64,
    records: Vec<Vec<u8>>,
    reads: usize,
    writes: usize,
    writes_unavailable: bool,
}

impl FakeStorage {
    fn with_records(records: Vec<Vec<u8>>) -> Self {
        Self {
            state: Mutex::new(FakeStorageState {
                records,
                ..Default::default()
            }),
        }
    }

    fn with_unavailable_writes(records: Vec<Vec<u8>>) -> Self {
        Self {
            state: Mutex::new(FakeStorageState {
                records,
                writes_unavailable: true,
                ..Default::default()
            }),
        }
    }

    fn counts(&self) -> (usize, usize) {
        let state = self.state.lock().expect("storage");
        (state.reads, state.writes)
    }
}

impl DurableRecordStorage for FakeStorage {
    fn read(&self) -> RawStoreRead {
        let mut state = self.state.lock().expect("storage");
        state.reads += 1;
        RawStoreRead::Records {
            revision: state.revision,
            records: state.records.clone(),
        }
    }

    fn compare_and_swap(&self, expected_revision: u64, records: Vec<Vec<u8>>) -> RawStoreWrite {
        let mut state = self.state.lock().expect("storage");
        if state.writes_unavailable {
            return RawStoreWrite::Unavailable;
        }
        if state.revision != expected_revision {
            return RawStoreWrite::Conflict;
        }
        state.revision += 1;
        state.records = records;
        state.writes += 1;
        RawStoreWrite::Written {
            revision: state.revision,
        }
    }
}

fn terminal_scope() -> V2TerminalScope {
    V2TerminalScope::new(
        "idempotency-v2".to_string(),
        format!("sha256:{}", "ab".repeat(32)),
    )
    .expect("scope")
}

fn terminal_content() -> V2TerminalResponseContent {
    serde_json::from_value(serde_json::json!({
        "schema_version": 1,
        "request_id": "request-v2",
        "command_id": "command-v2",
        "operation_id": "operation-v2",
        "requester_id": "requester-a",
        "correlation_id": "correlation-v2",
        "causation_id": "message-v2",
        "target_instance_id": "instance-a",
        "target_session_id": "session-a",
        "target_fingerprint": format!("sha256:{}", "34".repeat(32)),
        "idempotency_key": "idempotency-v2",
        "terminal": {
            "schema_version": 1,
            "request_id": "request-v2",
            "command_id": "command-v2",
            "operation_id": "operation-v2",
            "requester_id": "requester-a",
            "target": {
                "platform": "macos",
                "instance_id": "instance-a",
                "session_id": "session-a",
                "fingerprint": format!("sha256:{}", "34".repeat(32))
            },
            "method": "camera.capture",
            "resource": "camera",
            "idempotency_key": "idempotency-v2",
            "binding_digest": format!("sha256:{}", "56".repeat(32)),
            "execution_outcome": "succeeded",
            "delivery_outcome": "not_started",
            "terminal_revision": 1
        }
    }))
    .expect("valid terminal content")
}

fn restart_recovery_content() -> V2TerminalResponseContent {
    serde_json::from_value(serde_json::json!({
        "schema_version": 2,
        "request_id": "request-v2",
        "command_id": "command-v2",
        "operation_id": "operation-v2",
        "requester_id": "requester-a",
        "correlation_id": "correlation-v2",
        "causation_id": "message-v2",
        "target_instance_id": "instance-a",
        "target_session_id": "session-a",
        "target_fingerprint": format!("sha256:{}", "34".repeat(32)),
        "idempotency_key": "idempotency-v2",
        "terminal": {
            "schema_version": 1,
            "request_id": "request-v2",
            "command_id": "command-v2",
            "operation_id": "operation-v2",
            "requester_id": "requester-a",
            "target": {
                "platform": "macos",
                "instance_id": "instance-a",
                "session_id": "session-a",
                "fingerprint": format!("sha256:{}", "34".repeat(32))
            },
            "method": "camera.capture",
            "resource": "camera",
            "idempotency_key": "idempotency-v2",
            "binding_digest": format!("sha256:{}", "56".repeat(32)),
            "execution_outcome": "effect_unknown",
            "delivery_outcome": "not_started",
            "terminal_revision": 1,
            "failure": {
                "stage": "platform_dispatch",
                "reason_code": "internal_unclassified",
                "effect_state": "unknown",
                "retry_safety": "manual_verification_required",
                "recovery_action": "manual_effect_verification",
                "correlation_id": format!("sha256:{}", "56".repeat(32))
            }
        }
    }))
    .expect("valid restart recovery content")
}
