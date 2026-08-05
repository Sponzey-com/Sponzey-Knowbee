use std::sync::{Arc, Mutex};

use knowbee_yeonjang::authorization::AuthorizationReceipt;
use knowbee_yeonjang::completed_idempotency::{
    CompletedRequestKey, DurableCompletedRecord, DurableCompletedRecordStore,
    DurableFinalizeResult, DurableLoadResult, DurableReserveResult, DurableSaveResult,
    DurableTerminalOutcome,
};
use knowbee_yeonjang::durable_completed_store::{
    DurableRecordRepository, DurableRecordStorage, DurableStoreBootstrapError, RawStoreRead,
    RawStoreWrite,
};
use knowbee_yeonjang::protocol::{Request, RequestMetadata};
use serde_json::json;

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

    fn counts(&self) -> (usize, usize) {
        let state = self.state.lock().expect("fake storage");
        (state.reads, state.writes)
    }
}

impl DurableRecordStorage for FakeStorage {
    fn read(&self) -> RawStoreRead {
        let mut state = self.state.lock().expect("fake storage");
        state.reads += 1;
        RawStoreRead::Records {
            revision: state.revision,
            records: state.records.clone(),
        }
    }

    fn compare_and_swap(&self, expected_revision: u64, records: Vec<Vec<u8>>) -> RawStoreWrite {
        let mut state = self.state.lock().expect("fake storage");
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

#[test]
fn effect_receipt_repository_bootstrap_reads_without_writing_and_recovers_after_restart() {
    let storage = Arc::new(FakeStorage::default());
    let repository =
        DurableRecordRepository::bootstrap(2, storage.clone()).expect("empty bootstrap");
    assert_eq!(storage.counts(), (1, 0));
    let record = record("durable-key", target('a'));
    assert_eq!(repository.save(record.clone()), DurableSaveResult::Stored);
    assert_eq!(storage.counts(), (1, 1));
    drop(repository);

    let recovered =
        DurableRecordRepository::bootstrap(2, storage.clone()).expect("restart bootstrap");
    assert_eq!(storage.counts(), (2, 1));
    assert!(matches!(
        recovered.load(record.key()),
        DurableLoadResult::Exact(exact) if *exact == record
    ));
    let conflicting_terminal = DurableCompletedRecord::new(
        record.key().clone(),
        DurableTerminalOutcome::Failed {
            response_digest:
                "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
                    .to_string(),
            response_reference: "response:different".to_string(),
            error_code: "different_terminal".to_string(),
        },
        1_700_000_000_001,
    )
    .expect("immutable terminal collision");
    assert_eq!(
        recovered.save(conflicting_terminal),
        DurableSaveResult::AlreadyStored
    );
    assert_eq!(storage.counts(), (2, 1));
}

#[test]
fn injected_store_fails_closed_for_corruption_capacity_and_scope_collision() {
    assert!(matches!(
        DurableRecordRepository::bootstrap(
            2,
            Arc::new(FakeStorage::with_records(vec![b"corrupt".to_vec()]))
        ),
        Err(DurableStoreBootstrapError::Corrupt(_))
    ));
    let storage = Arc::new(FakeStorage::default());
    let repository =
        DurableRecordRepository::bootstrap(1, storage.clone()).expect("bounded bootstrap");
    let exact = record("shared-key", target('b'));
    let conflicting = record("shared-key", target('c'));
    assert_eq!(repository.save(exact), DurableSaveResult::Stored);
    assert_eq!(
        repository.save(conflicting),
        DurableSaveResult::ScopeMismatch
    );
    assert_eq!(
        repository.save(record("other-key", target('d'))),
        DurableSaveResult::Saturated
    );
    assert_eq!(storage.counts(), (1, 1));
}

#[test]
fn exact_reservation_is_atomically_finalized_and_completed_state_is_immutable() {
    let storage = Arc::new(FakeStorage::default());
    let repository =
        DurableRecordRepository::bootstrap(2, storage.clone()).expect("empty bootstrap");
    let completed = record("transition-key", target('e'));
    let reservation = DurableCompletedRecord::new(
        completed.key().clone(),
        DurableTerminalOutcome::EffectStateUnknown {
            observed_at_ms: 1_700_000_000_000,
        },
        1_700_000_000_000,
    )
    .expect("reservation");

    assert_eq!(
        repository.reserve(reservation.clone()),
        DurableReserveResult::Reserved
    );
    assert!(matches!(
        repository.load(reservation.key()),
        DurableLoadResult::Exact(record)
            if matches!(
                record.terminal(),
                DurableTerminalOutcome::EffectStateUnknown { .. }
            )
    ));
    assert_eq!(
        repository.finalize(completed.clone()),
        DurableFinalizeResult::Finalized
    );
    assert_eq!(
        repository.finalize(completed.clone()),
        DurableFinalizeResult::AlreadyFinalized
    );
    assert_eq!(
        repository.reserve(reservation),
        DurableReserveResult::AlreadyCompleted
    );
    assert!(matches!(
        repository.load(completed.key()),
        DurableLoadResult::Exact(record) if *record == completed
    ));
    assert_eq!(storage.counts(), (1, 2));
}

fn record(idempotency_key: &str, target_fingerprint: String) -> DurableCompletedRecord {
    let request = Request {
        id: Some("delivery".to_string()),
        method: "camera.capture".to_string(),
        params: json!({}),
        metadata: RequestMetadata {
            command_id: Some("command".to_string()),
            operation_id: Some("operation".to_string()),
            target_session_id: Some("session".to_string()),
            target_fingerprint: Some(target_fingerprint.clone()),
            idempotency_key: Some(idempotency_key.to_string()),
            expires_at: Some(4_000_000_000_000),
            cancel_token: Some("cancel".to_string()),
            authorization_receipt: Some(AuthorizationReceipt {
                schema_version: 1,
                authorization_id: "authorization".to_string(),
                issuer: "issuer".to_string(),
                issuer_key_id: "issuer-key".to_string(),
                audience: "audience".to_string(),
                method: "camera.capture".to_string(),
                resource_scope: "camera".to_string(),
                command_id: "command".to_string(),
                operation_id: "operation".to_string(),
                target_session_id: "session".to_string(),
                target_fingerprint,
                idempotency_key: idempotency_key.to_string(),
                expires_at: 4_000_000_000_000,
                proof: "not-persisted".to_string(),
            }),
            ..Default::default()
        },
    };
    DurableCompletedRecord::new(
        CompletedRequestKey::from_request(&request, "camera").expect("completed key"),
        DurableTerminalOutcome::Succeeded {
            response_digest:
                "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
                    .to_string(),
            response_reference: "response:opaque".to_string(),
        },
        1_700_000_000_000,
    )
    .expect("durable record")
}

fn target(character: char) -> String {
    format!("sha256:{}", character.to_string().repeat(64))
}
