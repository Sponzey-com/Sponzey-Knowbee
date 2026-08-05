#[path = "support/terminal_assertions.rs"]
mod terminal_assertions;

use std::time::Duration;

use knowbee_yeonjang::protocol::{
    CommandAttemptEvidence, CommandAttemptRetrySafety, CommandAttemptTerminalStage, Request,
    RequestMetadata, Response,
};
use serde_json::json;
use terminal_assertions::{TerminalAssertionError, TerminalDeliveryOrder, TerminalResponseLedger};

#[test]
fn test_provider_e2e_distinguishes_acceptance_from_exactly_one_terminal() {
    let ledger = TerminalResponseLedger::default();
    let request = bound_request("request-1");
    ledger.accept_request(&request).expect("request accepted");

    assert!(matches!(
        ledger.terminal("request-1"),
        Err(TerminalAssertionError::MissingTerminal(id)) if id == "request-1"
    ));
    let response = bound_response("request-1", "command-1");
    ledger.record_terminal(&response).expect("terminal");
    assert_eq!(
        ledger.terminal("request-1").expect("recorded").id,
        response.id
    );
    assert_eq!(ledger.responses().expect("responses").len(), 1);
    assert_eq!(
        ledger.record_terminal(&response),
        Err(TerminalAssertionError::DuplicateTerminal(
            "request-1".to_string()
        ))
    );
    assert!(matches!(
        ledger.terminal("request-1"),
        Err(TerminalAssertionError::DuplicateTerminal(id)) if id == "request-1"
    ));
    let rejected = bound_request("request-rejected");
    ledger
        .accept_request(&rejected)
        .expect("accepted before dispatch");
    ledger.reject_request("request-rejected");
    assert!(matches!(
        ledger.terminal("request-rejected"),
        Err(TerminalAssertionError::UnexpectedResponseId(id)) if id == "request-rejected"
    ));
}

#[test]
fn provider_rejects_unexpected_id_and_canonical_binding_mismatch() {
    let ledger = TerminalResponseLedger::default();
    ledger
        .accept_request(&bound_request("request-binding"))
        .expect("request accepted");

    assert_eq!(
        ledger.record_terminal(&bound_response("wrong-id", "command-1")),
        Err(TerminalAssertionError::UnexpectedResponseId(
            "wrong-id".to_string()
        ))
    );
    assert_eq!(
        ledger.record_terminal(&bound_response("request-binding", "wrong-command")),
        Err(TerminalAssertionError::BindingMismatch {
            request_id: "request-binding".to_string(),
            field: "command_id",
        })
    );
}

#[test]
fn provider_terminal_set_and_delivery_order_are_bounded_and_complete() {
    let ledger = TerminalResponseLedger::default();
    let request_ids = vec!["request-1".to_string(), "request-2".to_string()];
    for request_id in &request_ids {
        ledger
            .accept_request(&bound_request(request_id))
            .expect("request accepted");
    }
    ledger
        .record_terminal(&bound_response("request-1", "command-1"))
        .expect("first terminal");
    assert!(matches!(
        ledger.exact_terminals(&request_ids),
        Err(TerminalAssertionError::TerminalCountMismatch {
            expected: 2,
            actual: 1,
        })
    ));

    assert!(matches!(
        TerminalDeliveryOrder::new(Vec::new(), Duration::from_secs(1)),
        Err(TerminalAssertionError::InvalidDeliveryOrder)
    ));
    assert!(matches!(
        TerminalDeliveryOrder::new(
            vec!["duplicate".to_string(), "duplicate".to_string()],
            Duration::from_secs(1),
        ),
        Err(TerminalAssertionError::InvalidDeliveryOrder)
    ));
    assert!(matches!(
        TerminalDeliveryOrder::new(
            (0..257).map(|index| format!("request-{index}")).collect(),
            Duration::from_secs(1),
        ),
        Err(TerminalAssertionError::InvalidDeliveryOrder)
    ));
}

fn bound_request(id: &str) -> Request {
    Request {
        id: Some(id.to_string()),
        method: "camera.capture".to_string(),
        params: json!({}),
        metadata: RequestMetadata {
            command_id: Some("command-1".to_string()),
            operation_id: Some("operation-1".to_string()),
            target_fingerprint: Some(
                "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                    .to_string(),
            ),
            ..Default::default()
        },
    }
}

fn bound_response(id: &str, command_id: &str) -> Response {
    Response::ok_with_attempt(
        Some(id.to_string()),
        json!({ "artifact": "opaque:test" }),
        CommandAttemptEvidence {
            schema_version: 1,
            method: "camera.capture".to_string(),
            command_id: command_id.to_string(),
            operation_id: Some("operation-1".to_string()),
            target_fingerprint: Some(
                "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                    .to_string(),
            ),
            terminal_stage: CommandAttemptTerminalStage::ResponseReady,
            reason_code: "response_ready".to_string(),
            retry_safety: CommandAttemptRetrySafety::Completed,
            cancellation_reason: None,
        },
    )
}
