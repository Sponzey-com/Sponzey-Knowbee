use serde::Deserialize;
use serde_json::json;

use crate::cancellation::{CancellationReasonKind, CommandTargetBinding, ExactCancellationRequest};
use crate::protocol::{
    CommandAttemptCancellationReason, CommandAttemptEvidence, CommandAttemptRetrySafety,
    CommandAttemptTerminalStage, Request, Response,
};
use crate::request_lifecycle::CancellationReason;
use crate::runtime::{RuntimeCancelResult, RuntimeSubmitError, RuntimeSupervisor};

const MAX_CONTROL_ID_BYTES: usize = 256;

#[derive(Clone)]
pub struct ManagedRequestService {
    runtime: RuntimeSupervisor,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct LegacyCancellationParams {
    command_id: String,
    cancel_token: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ExactCancellationParams {
    schema_version: u8,
    target_request_id: String,
    command_id: String,
    operation_id: String,
    target_session_id: String,
    target_fingerprint: String,
    idempotency_key: String,
    cancel_token: String,
    reason_kind: CancellationReasonKind,
    requested_at_ms: i64,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum CancellationParams {
    Exact(ExactCancellationParams),
    Legacy(LegacyCancellationParams),
}

enum ParsedCancellation {
    Exact(ExactCancellationRequest),
    Legacy(LegacyCancellationParams),
}

impl ManagedRequestService {
    pub fn new(runtime: RuntimeSupervisor) -> Self {
        Self { runtime }
    }

    pub async fn handle(&self, request: Request) -> Response {
        if request.method == "command.cancel" {
            return self.handle_cancellation(request);
        }
        let projection_request = request.clone();
        match self.runtime.execute(request).await {
            Ok(response) => response,
            Err(error) => project_submit_error(&projection_request, error),
        }
    }

    fn handle_cancellation(&self, request: Request) -> Response {
        let request_id = request.id;
        let params = match serde_json::from_value::<CancellationParams>(request.params) {
            Ok(CancellationParams::Exact(params)) => {
                let target = CommandTargetBinding::new(
                    &params.target_request_id,
                    &params.command_id,
                    &params.operation_id,
                    &params.target_session_id,
                    &params.target_fingerprint,
                    &params.idempotency_key,
                );
                match target.and_then(|target| {
                    ExactCancellationRequest::new(
                        params.schema_version,
                        target,
                        &params.cancel_token,
                        params.reason_kind,
                        params.requested_at_ms,
                    )
                }) {
                    Some(cancellation) => ParsedCancellation::Exact(cancellation),
                    None => {
                        return invalid_cancellation_response(request_id);
                    }
                }
            }
            Ok(CancellationParams::Legacy(params))
                if valid_control_id(&params.command_id)
                    && valid_control_id(&params.cancel_token) =>
            {
                ParsedCancellation::Legacy(params)
            }
            _ => {
                return invalid_cancellation_response(request_id);
            }
        };

        let command_id = match &params {
            ParsedCancellation::Exact(cancellation) => {
                cancellation.target().command_id().to_string()
            }
            ParsedCancellation::Legacy(params) => params.command_id.clone(),
        };
        let result = match &params {
            ParsedCancellation::Exact(cancellation) => self
                .runtime
                .cancel_exact_with_request_id(request_id.as_deref(), cancellation),
            ParsedCancellation::Legacy(params) => self.runtime.cancel_with_request_id(
                request_id.as_deref(),
                &params.command_id,
                &params.cancel_token,
            ),
        };
        match result {
            RuntimeCancelResult::Accepted => Response::ok(
                request_id,
                json!({
                    "accepted": true,
                    "duplicate": false,
                    "terminal": false,
                    "command_id": command_id,
                }),
            ),
            RuntimeCancelResult::Duplicate => Response::ok(
                request_id,
                json!({
                    "accepted": true,
                    "duplicate": true,
                    "terminal": false,
                    "command_id": command_id,
                }),
            ),
            RuntimeCancelResult::AlreadyTerminal => Response::error(
                request_id,
                "command_already_terminal",
                "Command already reached a terminal state.",
            ),
            RuntimeCancelResult::BindingMismatch => Response::error(
                request_id,
                "cancellation_binding_mismatch",
                "Cancellation target binding does not match the command.",
            ),
            RuntimeCancelResult::NotActive => Response::error(
                request_id,
                "command_cancellation_not_active",
                "Command cancellation did not match an active command.",
            ),
            RuntimeCancelResult::Rejected => Response::error(
                request_id,
                "invalid_command_cancellation",
                "Invalid command cancellation binding.",
            ),
            RuntimeCancelResult::DurableUnavailable => Response::error(
                request_id,
                "cancellation_state_unavailable",
                "Cancellation state could not be safely persisted or recovered.",
            ),
        }
    }
}

fn invalid_cancellation_response(request_id: Option<String>) -> Response {
    Response::error(
        request_id,
        "invalid_command_cancellation",
        "Invalid command cancellation binding.",
    )
}

fn valid_control_id(value: &str) -> bool {
    let normalized = value.trim();
    !normalized.is_empty() && normalized.len() <= MAX_CONTROL_ID_BYTES && normalized == value
}

fn project_submit_error(request: &Request, error: RuntimeSubmitError) -> Response {
    let request_id = request.id.clone();
    if let RuntimeSubmitError::CancelledBeforeExecution(reason) = error {
        let attempt = CommandAttemptEvidence::for_request(
            request,
            CommandAttemptTerminalStage::Cancelled,
            "command_cancelled_before_execution",
            CommandAttemptRetrySafety::Completed,
        )
        .map(|attempt| attempt.with_cancellation_reason(project_cancellation_reason(reason)));
        if let Some(attempt) = attempt {
            return Response::error_with_attempt(
                request_id,
                "command_cancelled_before_execution",
                "Command was cancelled before execution.",
                attempt,
            );
        }
    }
    if matches!(
        error,
        RuntimeSubmitError::ResourceBusy | RuntimeSubmitError::ResourceStateUnavailable
    ) {
        let (code, message, retry_safety) = if error == RuntimeSubmitError::ResourceBusy {
            (
                "resource_busy",
                "The requested resource is currently busy.",
                CommandAttemptRetrySafety::SafeSameCommand,
            )
        } else {
            (
                "resource_state_unavailable",
                "Resource admission state is currently unavailable.",
                CommandAttemptRetrySafety::ChangeStrategy,
            )
        };
        let attempt = CommandAttemptEvidence::for_request(
            request,
            CommandAttemptTerminalStage::Rejected,
            code,
            retry_safety,
        );
        if let Some(attempt) = attempt {
            return Response::error_with_attempt(request_id, code, message, attempt);
        }
    }
    if error == RuntimeSubmitError::EffectStateUnknown {
        let attempt = CommandAttemptEvidence::for_request(
            request,
            CommandAttemptTerminalStage::EffectStateUnknown,
            "effect_state_unknown",
            CommandAttemptRetrySafety::UnknownEffectState,
        );
        if let Some(attempt) = attempt {
            return Response::error_with_attempt(
                request_id,
                "effect_state_unknown",
                "The prior side effect state is unknown and was not re-executed.",
                attempt,
            );
        }
    }
    let (code, message) = match error {
        RuntimeSubmitError::Backpressure => (
            "runtime_backpressure",
            "Runtime capacity is currently full.",
        ),
        RuntimeSubmitError::ResourceBusy => {
            ("resource_busy", "The requested resource is currently busy.")
        }
        RuntimeSubmitError::ResourceStateUnavailable => (
            "resource_state_unavailable",
            "Resource admission state is currently unavailable.",
        ),
        RuntimeSubmitError::CancelledBeforeExecution(_) => (
            "command_cancelled_before_execution",
            "Command was cancelled before execution.",
        ),
        RuntimeSubmitError::ShuttingDown => ("runtime_shutting_down", "Runtime is shutting down."),
        RuntimeSubmitError::InvalidSideEffectBinding => (
            "side_effect_binding_required",
            "Side effect requires a valid exact binding.",
        ),
        RuntimeSubmitError::InvalidParams => {
            ("invalid_request_params", "Request parameters are invalid.")
        }
        RuntimeSubmitError::UnknownMethod => {
            ("unknown_method", "Requested method is not supported.")
        }
        RuntimeSubmitError::AuthorizationRequired => (
            "side_effect_authorization_required",
            "Side effect authorization is required.",
        ),
        RuntimeSubmitError::AuthorizationRejected(_) => (
            "side_effect_authorization_rejected",
            "Side effect authorization was rejected.",
        ),
        RuntimeSubmitError::IdempotencyInProgress => (
            "idempotency_in_progress",
            "An exact request with this idempotency binding is already in progress.",
        ),
        RuntimeSubmitError::IdempotencyConflict => (
            "idempotency_scope_conflict",
            "Idempotency binding conflicts with an existing request.",
        ),
        RuntimeSubmitError::IdempotencyUnavailable => (
            "idempotency_unavailable",
            "Idempotency protection is currently unavailable.",
        ),
        RuntimeSubmitError::EffectStateUnknown => (
            "effect_state_unknown",
            "The prior side effect state is unknown and was not re-executed.",
        ),
        RuntimeSubmitError::DurableRecoveryUnavailable => (
            "durable_recovery_unavailable",
            "The completed response could not be safely recovered.",
        ),
        RuntimeSubmitError::AlreadyActive => {
            ("command_already_active", "Command is already active.")
        }
        RuntimeSubmitError::WorkerFailed => ("request_failed", "Request could not be completed."),
    };
    if matches!(
        error,
        RuntimeSubmitError::InvalidSideEffectBinding
            | RuntimeSubmitError::InvalidParams
            | RuntimeSubmitError::UnknownMethod
            | RuntimeSubmitError::AuthorizationRequired
            | RuntimeSubmitError::AuthorizationRejected(_)
    ) && let Some(attempt) = CommandAttemptEvidence::for_request(
        request,
        CommandAttemptTerminalStage::Rejected,
        code,
        CommandAttemptRetrySafety::ChangeStrategy,
    ) {
        return Response::error_with_attempt(request_id, code, message, attempt);
    }
    Response::error(request_id, code, message)
}

fn project_cancellation_reason(reason: CancellationReason) -> CommandAttemptCancellationReason {
    match reason {
        CancellationReason::UserRequested => CommandAttemptCancellationReason::UserRequested,
        CancellationReason::DeadlineExceeded => CommandAttemptCancellationReason::DeadlineExceeded,
        CancellationReason::RuntimeShutdown => CommandAttemptCancellationReason::RuntimeShutdown,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::CommandAttemptCancellationReason;
    use crate::request_lifecycle::CancellationReason;

    #[test]
    fn durable_recovery_failures_have_distinct_bounded_public_codes() {
        let unknown_request = Request {
            id: Some("unknown-effect".to_string()),
            method: "camera.capture".to_string(),
            params: json!({}),
            metadata: crate::protocol::RequestMetadata {
                command_id: Some("command-1".to_string()),
                operation_id: Some("operation-1".to_string()),
                target_fingerprint: Some(
                    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                        .to_string(),
                ),
                ..Default::default()
            },
        };
        let unavailable_request = Request {
            id: Some("unavailable-response".to_string()),
            ..unknown_request.clone()
        };
        let unknown =
            project_submit_error(&unknown_request, RuntimeSubmitError::EffectStateUnknown);
        let unavailable = project_submit_error(
            &unavailable_request,
            RuntimeSubmitError::DurableRecoveryUnavailable,
        );

        assert_eq!(
            unknown.error.as_ref().map(|error| error.code.as_str()),
            Some("effect_state_unknown")
        );
        assert_eq!(
            unavailable.error.as_ref().map(|error| error.code.as_str()),
            Some("durable_recovery_unavailable")
        );
        assert_eq!(unknown.id.as_deref(), Some("unknown-effect"));
        assert_eq!(unavailable.id.as_deref(), Some("unavailable-response"));
        assert!(matches!(
            unknown
                .attempt
                .as_ref()
                .map(|attempt| attempt.retry_safety.clone()),
            Some(CommandAttemptRetrySafety::UnknownEffectState)
        ));
    }

    #[test]
    fn resource_busy_is_a_bound_terminal_attempt_not_an_execution_success() {
        let request = Request {
            id: Some("resource-busy".to_string()),
            method: "camera.capture".to_string(),
            params: json!({}),
            metadata: crate::protocol::RequestMetadata {
                command_id: Some("resource-command".to_string()),
                operation_id: Some("resource-operation".to_string()),
                target_fingerprint: Some(
                    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                        .to_string(),
                ),
                ..Default::default()
            },
        };

        let response = project_submit_error(&request, RuntimeSubmitError::ResourceBusy);

        assert!(!response.ok);
        assert_eq!(
            response.error.as_ref().map(|error| error.code.as_str()),
            Some("resource_busy")
        );
        let attempt = response.attempt.expect("bound terminal attempt");
        assert_eq!(attempt.command_id, "resource-command");
        assert_eq!(attempt.operation_id.as_deref(), Some("resource-operation"));
        assert!(matches!(
            attempt.retry_safety,
            CommandAttemptRetrySafety::SafeSameCommand
        ));
    }

    #[test]
    fn pre_effect_admission_rejections_preserve_a_bound_terminal_attempt() {
        let request = Request {
            id: Some("pre-effect-rejection".to_string()),
            method: "camera.capture".to_string(),
            params: json!({}),
            metadata: crate::protocol::RequestMetadata {
                command_id: Some("pre-effect-command".to_string()),
                operation_id: Some("pre-effect-operation".to_string()),
                target_fingerprint: Some(
                    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                        .to_string(),
                ),
                ..Default::default()
            },
        };

        for (error, expected_code) in [
            (
                RuntimeSubmitError::InvalidSideEffectBinding,
                "side_effect_binding_required",
            ),
            (
                RuntimeSubmitError::AuthorizationRequired,
                "side_effect_authorization_required",
            ),
            (RuntimeSubmitError::InvalidParams, "invalid_request_params"),
        ] {
            let response = project_submit_error(&request, error);
            assert_eq!(
                response.error.as_ref().map(|error| error.code.as_str()),
                Some(expected_code)
            );
            let attempt = response.attempt.expect("bound pre-effect attempt");
            assert_eq!(attempt.reason_code, expected_code);
            assert!(matches!(
                attempt.terminal_stage,
                CommandAttemptTerminalStage::Rejected
            ));
            assert!(matches!(
                attempt.retry_safety,
                CommandAttemptRetrySafety::ChangeStrategy
            ));
        }
    }

    #[test]
    fn cancelled_before_execution_preserves_each_canonical_cancellation_reason() {
        let request = Request {
            id: Some("cancelled-before-execution".to_string()),
            method: "camera.capture".to_string(),
            params: json!({}),
            metadata: crate::protocol::RequestMetadata {
                command_id: Some("cancelled-command".to_string()),
                operation_id: Some("cancelled-operation".to_string()),
                target_fingerprint: Some(
                    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                        .to_string(),
                ),
                ..Default::default()
            },
        };
        for (reason, expected) in [
            (
                CancellationReason::UserRequested,
                CommandAttemptCancellationReason::UserRequested,
            ),
            (
                CancellationReason::DeadlineExceeded,
                CommandAttemptCancellationReason::DeadlineExceeded,
            ),
            (
                CancellationReason::RuntimeShutdown,
                CommandAttemptCancellationReason::RuntimeShutdown,
            ),
        ] {
            let response = project_submit_error(
                &request,
                RuntimeSubmitError::CancelledBeforeExecution(reason),
            );
            assert_eq!(
                response
                    .attempt
                    .expect("typed cancellation attempt")
                    .cancellation_reason,
                Some(expected)
            );
        }
    }
}
