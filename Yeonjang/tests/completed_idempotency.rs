use knowbee_yeonjang::authorization::AuthorizationReceipt;
use knowbee_yeonjang::completed_idempotency::{
    AbandonResult, ClaimResult, CompleteResult, CompletedRequestKey, CompletedResponseRepository,
    CompletedStoreBuildError, DurableCompletedRecord, DurableRecordError, DurableTerminalOutcome,
    LookupResult, StoreResult,
};
use knowbee_yeonjang::protocol::{Request, RequestMetadata, Response};
use serde_json::json;

fn request(idempotency_key: &str, target: &str) -> Request {
    Request {
        id: Some("delivery-1".to_string()),
        method: "camera.capture".to_string(),
        params: json!({}),
        metadata: RequestMetadata {
            command_id: Some("command-1".to_string()),
            operation_id: Some("operation-1".to_string()),
            target_session_id: Some("session-1".to_string()),
            target_fingerprint: Some(target.to_string()),
            idempotency_key: Some(idempotency_key.to_string()),
            expires_at: Some(4_000_000_000_000),
            cancel_token: Some("cancel-1".to_string()),
            authorization_receipt: Some(AuthorizationReceipt {
                schema_version: 1,
                authorization_id: "authorization-1".to_string(),
                issuer: "test-issuer".to_string(),
                issuer_key_id: "test-key".to_string(),
                audience: "test-audience".to_string(),
                method: "camera.capture".to_string(),
                resource_scope: "camera".to_string(),
                command_id: "command-1".to_string(),
                operation_id: "operation-1".to_string(),
                target_session_id: "session-1".to_string(),
                target_fingerprint: target.to_string(),
                idempotency_key: idempotency_key.to_string(),
                expires_at: 4_000_000_000_000,
                proof: "must-never-be-stored".to_string(),
            }),
            ..Default::default()
        },
    }
}

#[test]
fn only_exact_pending_claim_can_be_abandoned_and_reclaimed() {
    let repository = CompletedResponseRepository::new(1).expect("repository");
    let exact = CompletedRequestKey::from_request(&request("abandon-key", "target-1"), "camera")
        .expect("key");
    let mismatched =
        CompletedRequestKey::from_request(&request("abandon-key", "target-2"), "camera")
            .expect("mismatched key");

    assert_eq!(repository.abandon(&exact), AbandonResult::NotClaimed);
    assert!(matches!(
        repository.claim(exact.clone()),
        ClaimResult::Claimed
    ));
    assert_eq!(
        repository.abandon(&mismatched),
        AbandonResult::ScopeMismatch
    );
    assert!(matches!(
        repository.claim(exact.clone()),
        ClaimResult::InProgress
    ));
    assert_eq!(repository.abandon(&exact), AbandonResult::Abandoned);
    assert!(matches!(
        repository.claim(exact.clone()),
        ClaimResult::Claimed
    ));
    assert_eq!(
        repository.complete(
            &exact,
            Response::ok(Some("terminal".to_string()), json!({}))
        ),
        CompleteResult::Completed
    );
    assert_eq!(repository.abandon(&exact), AbandonResult::AlreadyCompleted);
    assert!(matches!(repository.claim(exact), ClaimResult::Completed(_)));
}

#[test]
fn atomic_claim_prevents_concurrent_duplicate_execution_before_completion() {
    let repository = CompletedResponseRepository::new(1).expect("repository");
    let exact = CompletedRequestKey::from_request(&request("claim-key", "claim-target"), "camera")
        .expect("key");

    assert!(matches!(
        repository.claim(exact.clone()),
        ClaimResult::Claimed
    ));
    assert!(matches!(
        repository.claim(exact.clone()),
        ClaimResult::InProgress
    ));
    let conflicting =
        CompletedRequestKey::from_request(&request("claim-key", "other-target"), "camera")
            .expect("conflicting key");
    assert!(matches!(
        repository.claim(conflicting),
        ClaimResult::ScopeMismatch
    ));
    let mut different_operation_request = request("claim-key", "claim-target");
    different_operation_request.metadata.operation_id = Some("operation-2".to_string());
    different_operation_request
        .metadata
        .authorization_receipt
        .as_mut()
        .expect("authorization receipt")
        .operation_id = "operation-2".to_string();
    let different_operation =
        CompletedRequestKey::from_request(&different_operation_request, "camera")
            .expect("different operation key");
    assert!(matches!(
        repository.claim(different_operation),
        ClaimResult::ScopeMismatch
    ));
    let over_capacity =
        CompletedRequestKey::from_request(&request("other-key", "other-target"), "camera")
            .expect("other key");
    assert!(matches!(
        repository.claim(over_capacity),
        ClaimResult::Saturated
    ));

    assert_eq!(
        repository.complete(
            &exact,
            Response::ok(
                Some("completed-delivery".to_string()),
                json!({ "ok": true })
            )
        ),
        CompleteResult::Completed
    );
    let cached = match repository.claim(exact) {
        ClaimResult::Completed(response) => response,
        other => panic!("expected completed response, got {other:?}"),
    };
    assert_eq!(cached.id.as_deref(), Some("completed-delivery"));
}

#[test]
fn completed_repository_returns_only_exact_scope_and_fails_closed_at_capacity() {
    assert!(matches!(
        CompletedResponseRepository::new(0),
        Err(CompletedStoreBuildError::InvalidCapacity)
    ));
    assert!(matches!(
        CompletedResponseRepository::new(usize::MAX),
        Err(CompletedStoreBuildError::InvalidCapacity)
    ));
    let repository = CompletedResponseRepository::new(1).expect("bounded repository");
    let exact = CompletedRequestKey::from_request(&request("idempotency-1", "target-1"), "camera")
        .expect("completed key");
    assert!(!format!("{exact:?}").contains("must-never-be-stored"));
    let response = Response::ok(
        Some("delivery-1".to_string()),
        json!({ "artifact": "opaque:photo-1" }),
    );

    assert_eq!(
        repository.store(exact.clone(), response),
        StoreResult::Stored
    );
    assert_eq!(
        repository.store(
            exact.clone(),
            Response::ok(Some("must-not-replace".to_string()), json!({}))
        ),
        StoreResult::AlreadyStored
    );
    let replayed = match repository.lookup(&exact) {
        LookupResult::Exact(response) => response,
        other => panic!("expected exact cached response, got {other:?}"),
    };
    assert_eq!(replayed.id.as_deref(), Some("delivery-1"));
    assert_eq!(
        replayed.result,
        Some(json!({ "artifact": "opaque:photo-1" }))
    );

    let mismatched =
        CompletedRequestKey::from_request(&request("idempotency-1", "target-2"), "camera")
            .expect("different scope");
    assert!(matches!(
        repository.lookup(&mismatched),
        LookupResult::ScopeMismatch
    ));
    assert_eq!(
        repository.store(
            mismatched,
            Response::ok(Some("delivery-2".to_string()), json!({}))
        ),
        StoreResult::ScopeMismatch
    );

    let another =
        CompletedRequestKey::from_request(&request("idempotency-2", "target-3"), "camera")
            .expect("another key");
    assert_eq!(
        repository.store(
            another,
            Response::ok(Some("delivery-3".to_string()), json!({}))
        ),
        StoreResult::Saturated
    );
}

#[test]
fn durable_completed_record_round_trips_only_exact_binding_and_terminal_reference() {
    let key = CompletedRequestKey::from_request(
        &request(
            "durable-idempotency",
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ),
        "camera",
    )
    .expect("durable key");
    let record = DurableCompletedRecord::new(
        key,
        DurableTerminalOutcome::Succeeded {
            response_digest:
                "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
                    .to_string(),
            response_reference: "response:opaque-1".to_string(),
        },
        1_700_000_000_000,
    )
    .expect("durable record");

    let encoded = record.encode().expect("encoded durable record");
    let encoded_text = std::str::from_utf8(&encoded).expect("JSON record");
    assert!(!encoded_text.contains("must-never-be-stored"));
    assert!(!encoded_text.contains("base64"));
    let decoded = DurableCompletedRecord::decode(&encoded).expect("decoded durable record");
    assert_eq!(decoded, record);
    assert_eq!(decoded.finalized_at_ms(), 1_700_000_000_000);
    assert_eq!(decoded.key(), record.key());
    assert_eq!(decoded.terminal(), record.terminal());
}

#[test]
fn durable_completed_record_fails_closed_for_version_corruption_and_unbounded_input() {
    let key = CompletedRequestKey::from_request(
        &request(
            "durable-invalid",
            "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        ),
        "camera",
    )
    .expect("durable key");
    assert_eq!(
        DurableCompletedRecord::new(
            key,
            DurableTerminalOutcome::Failed {
                response_digest: "not-a-digest".to_string(),
                response_reference: "response:opaque-2".to_string(),
                error_code: "camera_failed".to_string(),
            },
            1_700_000_000_000,
        ),
        Err(DurableRecordError::InvalidRecord)
    );
    assert_eq!(
        DurableCompletedRecord::decode(br#"{"schemaVersion":2}"#),
        Err(DurableRecordError::UnsupportedVersion)
    );
    assert_eq!(
        DurableCompletedRecord::decode(b"not-json"),
        Err(DurableRecordError::Malformed)
    );
    assert_eq!(
        DurableCompletedRecord::decode(
            br#"{"schemaVersion":1,"key":{},"terminal":{},"finalizedAtMs":1,"rawPayload":"forbidden"}"#
        ),
        Err(DurableRecordError::Malformed)
    );
    assert_eq!(
        DurableCompletedRecord::decode(&vec![b'x'; 16 * 1024]),
        Err(DurableRecordError::TooLarge)
    );
}
