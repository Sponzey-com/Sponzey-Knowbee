use knowbee_yeonjang::protocol_v2_terminal::V2TerminalResponseContent;
use knowbee_yeonjang::v2_terminal_repository::{
    InMemoryV2TerminalRepository, V2TerminalClaim, V2TerminalLookup, V2TerminalRepository,
    V2TerminalScope,
};

#[test]
fn repository_atomically_distinguishes_in_progress_conflict_and_saturation() {
    let repository = InMemoryV2TerminalRepository::new(1).expect("repository");
    let first = scope("same-key", 'a');
    let conflict = scope("same-key", 'b');
    let other = scope("other-key", 'c');

    assert_eq!(
        repository.prepare(&first, restart_recovery("same-key")),
        V2TerminalClaim::Claimed
    );
    assert_eq!(
        repository.prepare(&first, restart_recovery("same-key")),
        V2TerminalClaim::InProgress
    );
    assert!(matches!(
        repository.lookup(&first),
        V2TerminalLookup::InProgress
    ));
    assert_eq!(
        repository.prepare(&conflict, restart_recovery("same-key")),
        V2TerminalClaim::ScopeConflict
    );
    assert_eq!(
        repository.prepare(&other, restart_recovery("other-key")),
        V2TerminalClaim::Saturated
    );
}

fn restart_recovery(idempotency_key: &str) -> V2TerminalResponseContent {
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
        "idempotency_key": idempotency_key,
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
            "idempotency_key": idempotency_key,
            "binding_digest": format!("sha256:{}", "56".repeat(32)),
            "execution_outcome": "effect_unknown",
            "delivery_outcome": "not_started",
            "terminal_revision": 1,
            "failure": {
                "stage": "platform_dispatch",
                "reason_code": "restart_recovery_required",
                "effect_state": "unknown",
                "retry_safety": "manual_verification_required",
                "recovery_action": "manual_effect_verification",
                "correlation_id": format!("sha256:{}", "56".repeat(32))
            }
        }
    }))
    .expect("restart recovery content")
}

fn scope(key: &str, digest_character: char) -> V2TerminalScope {
    V2TerminalScope::new(
        key.to_string(),
        format!("sha256:{}", digest_character.to_string().repeat(64)),
    )
    .expect("scope")
}
