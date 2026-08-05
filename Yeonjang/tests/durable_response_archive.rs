use std::sync::{Arc, Mutex};

use knowbee_yeonjang::durable_response_archive::{
    RawResponseArchiveRead, RawResponseArchiveStorage, RawResponseArchiveWrite,
    ResponseArchiveBootstrapError, ResponseArchiveRepository,
};
use knowbee_yeonjang::protocol::Response;
use knowbee_yeonjang::runtime::{
    DurableResponseArchive, DurableResponseArchiveResult, DurableResponseResolveResult,
    DurableResponseResolver,
};
use serde_json::json;

#[derive(Default)]
struct MemoryArchiveStorage {
    state: Mutex<(u64, Option<Vec<Vec<u8>>>)>,
    writes: Mutex<usize>,
}

impl MemoryArchiveStorage {
    fn seeded(revision: u64, entries: Vec<Vec<u8>>) -> Self {
        Self {
            state: Mutex::new((revision, Some(entries))),
            writes: Mutex::new(0),
        }
    }

    fn writes(&self) -> usize {
        *self.writes.lock().expect("writes")
    }
}

impl RawResponseArchiveStorage for MemoryArchiveStorage {
    fn read(&self) -> RawResponseArchiveRead {
        let state = self.state.lock().expect("storage");
        match &state.1 {
            Some(entries) => RawResponseArchiveRead::Entries {
                revision: state.0,
                entries: entries.clone(),
            },
            None => RawResponseArchiveRead::Missing { revision: state.0 },
        }
    }

    fn compare_and_swap(
        &self,
        expected_revision: u64,
        entries: Vec<Vec<u8>>,
    ) -> RawResponseArchiveWrite {
        let mut state = self.state.lock().expect("storage");
        if state.0 != expected_revision {
            return RawResponseArchiveWrite::Conflict;
        }
        state.0 += 1;
        state.1 = Some(entries);
        *self.writes.lock().expect("writes") += 1;
        RawResponseArchiveWrite::Written { revision: state.0 }
    }
}

#[test]
fn archived_response_is_normalized_bounded_and_resolved_after_restart() {
    let storage = Arc::new(MemoryArchiveStorage::default());
    let archive = ResponseArchiveRepository::bootstrap(2, 1024, 2048, storage.clone())
        .expect("empty archive");
    let response = Response::ok(
        Some("delivery-id-is-not-persisted".to_string()),
        json!({ "artifact": "opaque:camera-1" }),
    );

    let reference = match archive.archive(&response) {
        DurableResponseArchiveResult::Archived { response_reference } => response_reference,
        DurableResponseArchiveResult::Unavailable => panic!("archive unavailable"),
    };
    assert_eq!(storage.writes(), 1);
    assert_eq!(
        archive.archive(&response),
        DurableResponseArchiveResult::Archived {
            response_reference: reference.clone()
        }
    );
    assert_eq!(storage.writes(), 1);

    let restarted = ResponseArchiveRepository::bootstrap(2, 1024, 2048, storage.clone())
        .expect("restart archive");
    let resolved = match restarted.resolve(&reference) {
        DurableResponseResolveResult::Found(response) => response,
        DurableResponseResolveResult::Missing | DurableResponseResolveResult::Unavailable => {
            panic!("archived response missing")
        }
    };

    assert_eq!(resolved.id, None);
    assert!(resolved.ok);
    assert_eq!(resolved.result, response.result);
    assert_eq!(storage.writes(), 1);
}

#[test]
fn archive_capacity_and_entry_bytes_fail_closed_without_overwriting_state() {
    let storage = Arc::new(MemoryArchiveStorage::default());
    let archive =
        ResponseArchiveRepository::bootstrap(1, 96, 96, storage.clone()).expect("empty archive");
    let first = Response::ok(None, json!({ "value": "small" }));
    let first_reference = match archive.archive(&first) {
        DurableResponseArchiveResult::Archived { response_reference } => response_reference,
        DurableResponseArchiveResult::Unavailable => panic!("first archive unavailable"),
    };

    assert_eq!(
        archive.archive(&Response::ok(None, json!({ "value": "different" }))),
        DurableResponseArchiveResult::Unavailable
    );
    assert_eq!(
        archive.archive(&Response::ok(None, json!({ "value": "x".repeat(512) }))),
        DurableResponseArchiveResult::Unavailable
    );
    assert!(matches!(
        archive.resolve(&first_reference),
        DurableResponseResolveResult::Found(_)
    ));
    assert_eq!(storage.writes(), 1);
}

#[test]
fn corrupt_or_reference_mismatched_archive_never_bootstraps_or_rewrites_storage() {
    let corrupt_storage = Arc::new(MemoryArchiveStorage::seeded(
        4,
        vec![br#"{"schemaVersion":999}"#.to_vec()],
    ));
    assert_eq!(
        ResponseArchiveRepository::bootstrap(2, 1024, 2048, corrupt_storage.clone())
            .err()
            .expect("unsupported archive"),
        ResponseArchiveBootstrapError::UnsupportedVersion
    );
    assert_eq!(corrupt_storage.writes(), 0);

    let mismatch_storage = Arc::new(MemoryArchiveStorage::seeded(
        7,
        vec![br#"{"schemaVersion":1,"responseReference":"response:v1:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","response":{"ok":true,"result":{"value":"actual"}}}"#.to_vec()],
    ));
    assert_eq!(
        ResponseArchiveRepository::bootstrap(2, 1024, 2048, mismatch_storage.clone())
            .err()
            .expect("reference mismatch"),
        ResponseArchiveBootstrapError::ReferenceMismatch
    );
    assert_eq!(mismatch_storage.writes(), 0);

    let delivery_id_storage = Arc::new(MemoryArchiveStorage::seeded(
        9,
        vec![br#"{"schemaVersion":1,"responseReference":"response:v1:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","response":{"id":"must-not-persist","ok":true,"result":{"value":"actual"}}}"#.to_vec()],
    ));
    assert_eq!(
        ResponseArchiveRepository::bootstrap(2, 1024, 2048, delivery_id_storage.clone())
            .err()
            .expect("delivery ID is not durable response data"),
        ResponseArchiveBootstrapError::InvalidResponse
    );
    assert_eq!(delivery_id_storage.writes(), 0);
}
