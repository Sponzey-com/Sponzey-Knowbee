use std::sync::{Arc, Mutex};

use knowbee_yeonjang::authorization::AuthorizationReceipt;
use knowbee_yeonjang::completed_idempotency::{
    CompletedRequestKey, DurableCompletedRecord, DurableCompletedRecordStore, DurableSaveResult,
    DurableTerminalOutcome,
};
use knowbee_yeonjang::durable_completed_store::{
    DurableRecordRepository, DurableRecordStorage, RawStoreRead, RawStoreWrite,
};
use knowbee_yeonjang::durable_response_archive::{
    RawResponseArchiveRead, RawResponseArchiveStorage, RawResponseArchiveWrite,
    ResponseArchiveRepository,
};
use knowbee_yeonjang::durable_retention::{
    DurableRetentionPolicy, DurableRetentionResult, LinkedDurableRetention,
};
use knowbee_yeonjang::protocol::{Request, RequestMetadata, Response};
use knowbee_yeonjang::runtime::{
    DurableResponseArchive, DurableResponseArchiveResult, DurableResponseResolveResult,
    DurableResponseResolver,
};
use serde_json::json;
use sha2::{Digest, Sha256};

#[derive(Default)]
struct RecordStorage {
    state: Mutex<(u64, Vec<Vec<u8>>, bool)>,
}

impl RecordStorage {
    fn fail_next_write(&self) {
        self.state.lock().expect("records").2 = true;
    }
}

impl DurableRecordStorage for RecordStorage {
    fn read(&self) -> RawStoreRead {
        let state = self.state.lock().expect("records");
        RawStoreRead::Records {
            revision: state.0,
            records: state.1.clone(),
        }
    }

    fn compare_and_swap(&self, expected_revision: u64, records: Vec<Vec<u8>>) -> RawStoreWrite {
        let mut state = self.state.lock().expect("records");
        if state.2 {
            state.2 = false;
            return RawStoreWrite::Conflict;
        }
        if state.0 != expected_revision {
            return RawStoreWrite::Conflict;
        }
        state.0 += 1;
        state.1 = records;
        RawStoreWrite::Written { revision: state.0 }
    }
}

#[derive(Default)]
struct ResponseStorage {
    state: Mutex<(u64, Vec<Vec<u8>>, bool)>,
}

impl ResponseStorage {
    fn fail_next_write(&self) {
        self.state.lock().expect("responses").2 = true;
    }
}

impl RawResponseArchiveStorage for ResponseStorage {
    fn read(&self) -> RawResponseArchiveRead {
        let state = self.state.lock().expect("responses");
        RawResponseArchiveRead::Entries {
            revision: state.0,
            entries: state.1.clone(),
        }
    }

    fn compare_and_swap(
        &self,
        expected_revision: u64,
        entries: Vec<Vec<u8>>,
    ) -> RawResponseArchiveWrite {
        let mut state = self.state.lock().expect("responses");
        if state.2 {
            state.2 = false;
            return RawResponseArchiveWrite::Conflict;
        }
        if state.0 != expected_revision {
            return RawResponseArchiveWrite::Conflict;
        }
        state.0 += 1;
        state.1 = entries;
        RawResponseArchiveWrite::Written { revision: state.0 }
    }
}

#[test]
fn retention_removes_only_old_expired_terminal_and_its_unreferenced_response() {
    let (mut records, mut archive, _, _) = repositories();
    let old_response = Response::ok(None, json!({ "value": "old" }));
    let current_response = Response::ok(None, json!({ "value": "current" }));
    let old_reference = archive_response(&archive, &old_response);
    let current_reference = archive_response(&archive, &current_response);
    let old = terminal_record("old", 100, 10, &old_response, &old_reference);
    let current = terminal_record("current", 300, 20, &current_response, &current_reference);
    let unknown = unknown_record("unknown", 50, 5);
    assert_eq!(records.save(old.clone()), DurableSaveResult::Stored);
    assert_eq!(records.save(current.clone()), DurableSaveResult::Stored);
    assert!(matches!(
        records.reserve(unknown.clone()),
        knowbee_yeonjang::completed_idempotency::DurableReserveResult::Reserved
    ));

    let result = LinkedDurableRetention::prune(
        &mut records,
        &mut archive,
        DurableRetentionPolicy::new(200, 1, 1).expect("policy"),
    );

    assert_eq!(
        result,
        DurableRetentionResult::Completed {
            receipts_removed: 1,
            responses_removed: 1,
            orphan_responses_removed: 0,
        }
    );
    assert!(matches!(
        records.load(old.key()),
        knowbee_yeonjang::completed_idempotency::DurableLoadResult::Miss
    ));
    assert!(matches!(
        records.load(current.key()),
        knowbee_yeonjang::completed_idempotency::DurableLoadResult::Exact(_)
    ));
    assert!(matches!(
        records.load(unknown.key()),
        knowbee_yeonjang::completed_idempotency::DurableLoadResult::Exact(_)
    ));
    assert!(matches!(
        archive.resolve(&old_reference),
        DurableResponseResolveResult::Missing
    ));
    assert!(matches!(
        archive.resolve(&current_reference),
        DurableResponseResolveResult::Found(_)
    ));
}

#[test]
fn shared_and_unknown_references_are_preserved_and_orphan_cleanup_is_explicit() {
    let (mut records, mut archive, _, _) = repositories();
    let shared_response = Response::ok(None, json!({ "value": "shared" }));
    let orphan_response = Response::ok(None, json!({ "value": "orphan" }));
    let shared_reference = archive_response(&archive, &shared_response);
    let orphan_reference = archive_response(&archive, &orphan_response);
    assert_eq!(
        records.save(terminal_record(
            "old-shared",
            100,
            10,
            &shared_response,
            &shared_reference,
        )),
        DurableSaveResult::Stored
    );
    assert_eq!(
        records.save(terminal_record(
            "kept-shared",
            300,
            20,
            &shared_response,
            &shared_reference,
        )),
        DurableSaveResult::Stored
    );

    let result = LinkedDurableRetention::prune(
        &mut records,
        &mut archive,
        DurableRetentionPolicy::new(200, 1, 2).expect("policy"),
    );

    assert_eq!(
        result,
        DurableRetentionResult::Completed {
            receipts_removed: 1,
            responses_removed: 0,
            orphan_responses_removed: 1,
        }
    );
    assert!(matches!(
        archive.resolve(&shared_reference),
        DurableResponseResolveResult::Found(_)
    ));
    assert!(matches!(
        archive.resolve(&orphan_reference),
        DurableResponseResolveResult::Missing
    ));
}

#[test]
fn record_cas_conflict_stops_before_response_removal() {
    let (mut records, mut archive, record_storage, _) = repositories();
    let response = Response::ok(None, json!({ "value": "conflict" }));
    let reference = archive_response(&archive, &response);
    let record = terminal_record("conflict", 100, 10, &response, &reference);
    assert_eq!(records.save(record.clone()), DurableSaveResult::Stored);
    record_storage.fail_next_write();

    assert_eq!(
        LinkedDurableRetention::prune(
            &mut records,
            &mut archive,
            DurableRetentionPolicy::new(200, 0, 1).expect("policy"),
        ),
        DurableRetentionResult::Unavailable {
            receipts_removed: 0,
            responses_removed: 0,
            orphan_responses_removed: 0,
        }
    );
    assert!(matches!(
        records.load(record.key()),
        knowbee_yeonjang::completed_idempotency::DurableLoadResult::Exact(_)
    ));
    assert!(matches!(
        archive.resolve(&reference),
        DurableResponseResolveResult::Found(_)
    ));
}

#[test]
fn response_cas_conflict_leaves_only_a_safe_orphan_after_receipt_removal() {
    let (mut records, mut archive, _, response_storage) = repositories();
    let response = Response::ok(None, json!({ "value": "archive-conflict" }));
    let reference = archive_response(&archive, &response);
    let record = terminal_record("archive-conflict", 100, 10, &response, &reference);
    assert_eq!(records.save(record.clone()), DurableSaveResult::Stored);
    response_storage.fail_next_write();

    assert_eq!(
        LinkedDurableRetention::prune(
            &mut records,
            &mut archive,
            DurableRetentionPolicy::new(200, 0, 1).expect("policy"),
        ),
        DurableRetentionResult::Unavailable {
            receipts_removed: 1,
            responses_removed: 0,
            orphan_responses_removed: 0,
        }
    );
    assert!(matches!(
        records.load(record.key()),
        knowbee_yeonjang::completed_idempotency::DurableLoadResult::Miss
    ));
    assert!(matches!(
        archive.resolve(&reference),
        DurableResponseResolveResult::Found(_)
    ));
}

#[test]
fn orphan_response_is_preserved_while_any_unknown_effect_reservation_exists() {
    let (mut records, mut archive, _, _) = repositories();
    let orphan_response = Response::ok(None, json!({ "value": "possible-unknown-evidence" }));
    let orphan_reference = archive_response(&archive, &orphan_response);
    let unknown = unknown_record("unknown-orphan", 50, 5);
    assert!(matches!(
        records.reserve(unknown),
        knowbee_yeonjang::completed_idempotency::DurableReserveResult::Reserved
    ));

    assert_eq!(
        LinkedDurableRetention::prune(
            &mut records,
            &mut archive,
            DurableRetentionPolicy::new(200, 0, 1).expect("policy"),
        ),
        DurableRetentionResult::Completed {
            receipts_removed: 0,
            responses_removed: 0,
            orphan_responses_removed: 0,
        }
    );
    assert!(matches!(
        archive.resolve(&orphan_reference),
        DurableResponseResolveResult::Found(_)
    ));
}

fn repositories() -> (
    DurableRecordRepository,
    ResponseArchiveRepository,
    Arc<RecordStorage>,
    Arc<ResponseStorage>,
) {
    let record_storage = Arc::new(RecordStorage::default());
    let response_storage = Arc::new(ResponseStorage::default());
    (
        DurableRecordRepository::bootstrap(8, record_storage.clone()).expect("records"),
        ResponseArchiveRepository::bootstrap(8, 1024, 8192, response_storage.clone())
            .expect("archive"),
        record_storage,
        response_storage,
    )
}

fn archive_response(archive: &ResponseArchiveRepository, response: &Response) -> String {
    match archive.archive(response) {
        DurableResponseArchiveResult::Archived { response_reference } => response_reference,
        DurableResponseArchiveResult::Unavailable => panic!("archive response"),
    }
}

fn terminal_record(
    idempotency_key: &str,
    expires_at: i64,
    finalized_at: i64,
    response: &Response,
    response_reference: &str,
) -> DurableCompletedRecord {
    let digest = format!(
        "sha256:{:x}",
        Sha256::digest(serde_json::to_vec(response).expect("response"))
    );
    DurableCompletedRecord::new(
        completed_key(idempotency_key, expires_at),
        DurableTerminalOutcome::Succeeded {
            response_digest: digest,
            response_reference: response_reference.to_string(),
        },
        finalized_at,
    )
    .expect("terminal")
}

fn unknown_record(
    idempotency_key: &str,
    expires_at: i64,
    observed_at: i64,
) -> DurableCompletedRecord {
    DurableCompletedRecord::new(
        completed_key(idempotency_key, expires_at),
        DurableTerminalOutcome::EffectStateUnknown {
            observed_at_ms: observed_at,
        },
        observed_at,
    )
    .expect("unknown")
}

fn completed_key(idempotency_key: &str, expires_at: i64) -> CompletedRequestKey {
    let target = format!("sha256:{}", "a".repeat(64));
    let request = Request {
        id: Some("delivery".to_string()),
        method: "camera.capture".to_string(),
        params: json!({}),
        metadata: RequestMetadata {
            command_id: Some(format!("command-{idempotency_key}")),
            operation_id: Some(format!("operation-{idempotency_key}")),
            target_session_id: Some("session".to_string()),
            target_fingerprint: Some(target.clone()),
            idempotency_key: Some(idempotency_key.to_string()),
            expires_at: Some(expires_at),
            authorization_receipt: Some(AuthorizationReceipt {
                schema_version: 1,
                authorization_id: format!("authorization-{idempotency_key}"),
                issuer: "issuer".to_string(),
                issuer_key_id: "issuer-key".to_string(),
                audience: "audience".to_string(),
                method: "camera.capture".to_string(),
                resource_scope: "camera".to_string(),
                command_id: format!("command-{idempotency_key}"),
                operation_id: format!("operation-{idempotency_key}"),
                target_session_id: "session".to_string(),
                target_fingerprint: target,
                idempotency_key: idempotency_key.to_string(),
                expires_at,
                proof: "not-persisted".to_string(),
            }),
            ..Default::default()
        },
    };
    CompletedRequestKey::from_request(&request, "camera").expect("key")
}
