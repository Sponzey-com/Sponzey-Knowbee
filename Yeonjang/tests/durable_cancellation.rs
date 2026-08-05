use std::sync::{Arc, Mutex};

use knowbee_yeonjang::cancellation::{
    CancellationReasonKind, CommandTargetBinding, ExactCancellationRequest,
};
use knowbee_yeonjang::durable_cancellation::{
    CancellationBeginResult, CancellationFinalizeResult, CancellationLoadResult,
    CancellationReceiptKey, CancellationReceiptOutcome, CancellationStoreTerminalResult,
    DurableCancellationReceipt, DurableCancellationReceiptRepository,
    DurableCancellationReceiptStore, DurableCancellationStoreBootstrapError,
};
use knowbee_yeonjang::durable_completed_store::{
    DurableRecordStorage, RawStoreRead, RawStoreWrite,
};

#[derive(Default)]
struct MemoryStorage {
    state: Mutex<(u64, Vec<Vec<u8>>)>,
}

impl MemoryStorage {
    fn seeded(records: Vec<Vec<u8>>) -> Self {
        Self {
            state: Mutex::new((0, records)),
        }
    }
}

impl DurableRecordStorage for MemoryStorage {
    fn read(&self) -> RawStoreRead {
        let state = self.state.lock().expect("storage");
        RawStoreRead::Records {
            revision: state.0,
            records: state.1.clone(),
        }
    }

    fn compare_and_swap(&self, expected_revision: u64, records: Vec<Vec<u8>>) -> RawStoreWrite {
        let mut state = self.state.lock().expect("storage");
        if state.0 != expected_revision {
            return RawStoreWrite::Conflict;
        }
        state.0 += 1;
        state.1 = records;
        RawStoreWrite::Written { revision: state.0 }
    }
}

#[test]
fn prepared_cancellation_is_exactly_finalized_and_recovered_after_restart() {
    let storage = Arc::new(MemoryStorage::default());
    let key =
        CancellationReceiptKey::new("cancel-request-1", "command-1", "private-token").expect("key");
    let prepared = DurableCancellationReceipt::new(
        key.clone(),
        CancellationReceiptOutcome::Prepared,
        1_700_000_000_000,
    )
    .expect("prepared");
    let repository =
        DurableCancellationReceiptRepository::bootstrap(4, storage.clone()).expect("repository");
    assert_eq!(
        repository.begin(prepared.clone()),
        CancellationBeginResult::Prepared
    );

    let persisted = storage.state.lock().expect("storage").1.clone();
    let serialized = String::from_utf8(persisted[0].clone()).expect("record JSON");
    assert!(!serialized.contains("private-token"));

    let restarted = DurableCancellationReceiptRepository::bootstrap(4, storage.clone())
        .expect("restart repository");
    assert!(matches!(
        restarted.load(&key),
        CancellationLoadResult::Exact(receipt)
            if receipt.outcome() == CancellationReceiptOutcome::Prepared
    ));
    let accepted = DurableCancellationReceipt::new(
        key.clone(),
        CancellationReceiptOutcome::Accepted,
        1_700_000_000_001,
    )
    .expect("accepted");
    assert_eq!(
        restarted.finalize(accepted.clone()),
        CancellationFinalizeResult::Finalized
    );
    assert_eq!(
        restarted.finalize(accepted),
        CancellationFinalizeResult::AlreadyFinalized
    );
    assert!(matches!(
        restarted.load(&key),
        CancellationLoadResult::Exact(receipt)
            if receipt.outcome() == CancellationReceiptOutcome::Accepted
    ));
}

#[test]
fn cancellation_id_scope_collision_and_corruption_fail_closed() {
    let storage = Arc::new(MemoryStorage::default());
    let repository =
        DurableCancellationReceiptRepository::bootstrap(2, storage).expect("repository");
    let key = CancellationReceiptKey::new("cancel-shared", "command-1", "token-1").expect("key");
    let collision =
        CancellationReceiptKey::new("cancel-shared", "command-1", "token-2").expect("collision");
    assert_eq!(
        repository.begin(
            DurableCancellationReceipt::new(
                key,
                CancellationReceiptOutcome::Prepared,
                1_700_000_000_000,
            )
            .expect("prepared")
        ),
        CancellationBeginResult::Prepared
    );
    assert_eq!(
        repository.load(&collision),
        CancellationLoadResult::ScopeMismatch
    );

    assert!(matches!(
        DurableCancellationReceiptRepository::bootstrap(
            2,
            Arc::new(MemoryStorage::seeded(vec![b"{corrupt".to_vec()]))
        ),
        Err(DurableCancellationStoreBootstrapError::Corrupt(_))
    ));
}

#[test]
fn exact_cancellation_scope_is_persisted_as_a_digest_and_mismatches_fail_closed() {
    let storage = Arc::new(MemoryStorage::default());
    let repository =
        DurableCancellationReceiptRepository::bootstrap(2, storage.clone()).expect("repository");
    let exact = exact_cancellation("operation-1");
    let wrong_operation = exact_cancellation("operation-2");
    let key = CancellationReceiptKey::new_exact("cancel-exact", &exact).expect("exact key");
    let collision =
        CancellationReceiptKey::new_exact("cancel-exact", &wrong_operation).expect("collision");

    assert_eq!(
        repository.begin(
            DurableCancellationReceipt::new(
                key,
                CancellationReceiptOutcome::Prepared,
                1_700_000_000_000,
            )
            .expect("prepared")
        ),
        CancellationBeginResult::Prepared
    );
    assert_eq!(
        repository.load(&collision),
        CancellationLoadResult::ScopeMismatch
    );

    let persisted = storage.state.lock().expect("storage").1.clone();
    let serialized = String::from_utf8(persisted[0].clone()).expect("record JSON");
    for sensitive in [
        "private-token",
        "request-1",
        "operation-1",
        "session-1",
        "fingerprint-1",
        "idempotency-1",
    ] {
        assert!(!serialized.contains(sensitive));
    }
}

#[test]
fn terminal_command_index_is_namespaced_and_persists_only_digests() {
    let storage = Arc::new(MemoryStorage::default());
    let repository =
        DurableCancellationReceiptRepository::bootstrap(2, storage.clone()).expect("repository");
    let exact = exact_cancellation("operation-1");
    let terminal_key =
        CancellationReceiptKey::new_terminal_command(exact.target(), exact.cancel_token())
            .expect("terminal key");
    let terminal = DurableCancellationReceipt::new(
        terminal_key.clone(),
        CancellationReceiptOutcome::AlreadyTerminal,
        1_700_000_000_000,
    )
    .expect("terminal");

    assert_eq!(
        repository.store_terminal(terminal),
        CancellationStoreTerminalResult::Stored
    );
    assert!(matches!(
        repository.load(&terminal_key),
        CancellationLoadResult::Exact(receipt)
            if receipt.outcome() == CancellationReceiptOutcome::AlreadyTerminal
    ));

    let persisted = storage.state.lock().expect("storage").1.clone();
    let serialized = String::from_utf8(persisted[0].clone()).expect("record JSON");
    for sensitive in [
        "private-token",
        "request-1",
        "command-1",
        "operation-1",
        "session-1",
        "fingerprint-1",
        "idempotency-1",
    ] {
        assert!(!serialized.contains(sensitive));
    }
}

#[test]
fn terminal_command_index_evicts_only_its_oldest_entry_at_capacity() {
    let storage = Arc::new(MemoryStorage::default());
    let repository =
        DurableCancellationReceiptRepository::bootstrap(2, storage).expect("repository");
    let entries = (0..3)
        .map(|index| {
            let cancellation = exact_cancellation_for_command(index);
            let key = CancellationReceiptKey::new_terminal_command(
                cancellation.target(),
                cancellation.cancel_token(),
            )
            .expect("terminal key");
            let receipt = DurableCancellationReceipt::new(
                key.clone(),
                CancellationReceiptOutcome::AlreadyTerminal,
                1_700_000_000_000 + index as i64,
            )
            .expect("terminal receipt");
            assert_eq!(
                repository.store_terminal(receipt),
                CancellationStoreTerminalResult::Stored
            );
            key
        })
        .collect::<Vec<_>>();

    assert_eq!(repository.load(&entries[0]), CancellationLoadResult::Miss);
    assert!(matches!(
        repository.load(&entries[1]),
        CancellationLoadResult::Exact(_)
    ));
    assert!(matches!(
        repository.load(&entries[2]),
        CancellationLoadResult::Exact(_)
    ));
}

fn exact_cancellation(operation_id: &str) -> ExactCancellationRequest {
    ExactCancellationRequest::new(
        1,
        CommandTargetBinding::new(
            "request-1",
            "command-1",
            operation_id,
            "session-1",
            "fingerprint-1",
            "idempotency-1",
        )
        .expect("target"),
        "private-token",
        CancellationReasonKind::UserRequested,
        1_700_000_000_000,
    )
    .expect("cancellation")
}

fn exact_cancellation_for_command(index: usize) -> ExactCancellationRequest {
    ExactCancellationRequest::new(
        1,
        CommandTargetBinding::new(
            &format!("request-{index}"),
            &format!("command-{index}"),
            &format!("operation-{index}"),
            &format!("session-{index}"),
            &format!("fingerprint-{index}"),
            &format!("idempotency-{index}"),
        )
        .expect("target"),
        &format!("private-token-{index}"),
        CancellationReasonKind::UserRequested,
        1_700_000_000_000,
    )
    .expect("cancellation")
}
