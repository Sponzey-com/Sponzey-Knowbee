use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::authorization::AuthorizationReceipt;

#[allow(dead_code)]
#[derive(Debug, Clone, Default, Deserialize)]
pub struct RequestMetadata {
    #[serde(default, alias = "runId")]
    pub run_id: Option<String>,
    #[serde(default, alias = "requestGroupId")]
    pub request_group_id: Option<String>,
    #[serde(default, alias = "sessionId")]
    pub session_id: Option<String>,
    #[serde(default, alias = "targetSessionId")]
    pub target_session_id: Option<String>,
    #[serde(default, alias = "commandId")]
    pub command_id: Option<String>,
    #[serde(default, alias = "operationId")]
    pub operation_id: Option<String>,
    #[serde(default, alias = "targetFingerprint")]
    pub target_fingerprint: Option<String>,
    #[serde(default, alias = "deliveryId")]
    pub delivery_id: Option<String>,
    #[serde(default, alias = "idempotencyKey")]
    pub idempotency_key: Option<String>,
    #[serde(default, alias = "expiresAt")]
    pub expires_at: Option<i64>,
    #[serde(default, alias = "cancelToken")]
    pub cancel_token: Option<String>,
    #[serde(default, alias = "authorizationReceipt")]
    pub authorization_receipt: Option<AuthorizationReceipt>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Request {
    #[serde(default)]
    pub id: Option<String>,
    pub method: String,
    #[serde(default)]
    pub params: Value,
    #[serde(default)]
    pub metadata: RequestMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ErrorBody {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommandAttemptTerminalStage {
    Rejected,
    HandlerFailed,
    HelperTimeout,
    EffectStateUnknown,
    Cancelled,
    ResponseReady,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommandAttemptRetrySafety {
    SafeSameCommand,
    ChangeStrategy,
    UnknownEffectState,
    Completed,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CommandAttemptCancellationReason {
    UserRequested,
    DeadlineExceeded,
    RuntimeShutdown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CommandAttemptEvidence {
    pub schema_version: u8,
    pub method: String,
    pub command_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub operation_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_fingerprint: Option<String>,
    pub terminal_stage: CommandAttemptTerminalStage,
    pub reason_code: String,
    pub retry_safety: CommandAttemptRetrySafety,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cancellation_reason: Option<CommandAttemptCancellationReason>,
}

impl CommandAttemptEvidence {
    pub fn for_request(
        request: &Request,
        terminal_stage: CommandAttemptTerminalStage,
        reason_code: impl Into<String>,
        retry_safety: CommandAttemptRetrySafety,
    ) -> Option<Self> {
        let method = bounded_identity(&request.method, 128)?;
        let command_id = bounded_optional_identity(request.metadata.command_id.as_deref(), 256)?;
        let operation_id =
            bounded_absent_or_identity(request.metadata.operation_id.as_deref(), 256)?;
        let target_fingerprint =
            bounded_absent_or_target_fingerprint(request.metadata.target_fingerprint.as_deref())?;
        let reason_code = bounded_identity(&reason_code.into(), 128)?;
        Some(Self {
            schema_version: 1,
            method,
            command_id,
            operation_id,
            target_fingerprint,
            terminal_stage,
            reason_code,
            retry_safety,
            cancellation_reason: None,
        })
    }

    pub fn with_cancellation_reason(
        mut self,
        cancellation_reason: CommandAttemptCancellationReason,
    ) -> Self {
        self.cancellation_reason = Some(cancellation_reason);
        self
    }
}

fn bounded_identity(value: &str, max_len: usize) -> Option<String> {
    let normalized = value.trim();
    (!normalized.is_empty() && normalized.len() <= max_len).then(|| normalized.to_string())
}

fn bounded_optional_identity(value: Option<&str>, max_len: usize) -> Option<String> {
    bounded_identity(value?, max_len)
}

fn bounded_absent_or_identity(value: Option<&str>, max_len: usize) -> Option<Option<String>> {
    match value {
        Some(value) => bounded_identity(value, max_len).map(Some),
        None => Some(None),
    }
}

fn bounded_absent_or_target_fingerprint(value: Option<&str>) -> Option<Option<String>> {
    let Some(value) = value else {
        return Some(None);
    };
    let normalized = value.trim();
    let digest = normalized.strip_prefix("sha256:")?;
    (digest.len() == 64 && digest.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .then(|| Some(normalized.to_ascii_lowercase()))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Response {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ErrorBody>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attempt: Option<CommandAttemptEvidence>,
}

impl Response {
    pub fn ok(id: Option<String>, result: Value) -> Self {
        Self {
            id,
            ok: true,
            result: Some(result),
            error: None,
            attempt: None,
        }
    }

    pub fn error(id: Option<String>, code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            id,
            ok: false,
            result: None,
            error: Some(ErrorBody {
                code: code.into(),
                message: message.into(),
            }),
            attempt: None,
        }
    }

    pub fn error_with_attempt(
        id: Option<String>,
        code: impl Into<String>,
        message: impl Into<String>,
        attempt: CommandAttemptEvidence,
    ) -> Self {
        Self {
            id,
            ok: false,
            result: None,
            error: Some(ErrorBody {
                code: code.into(),
                message: message.into(),
            }),
            attempt: Some(attempt),
        }
    }

    pub fn ok_with_attempt(
        id: Option<String>,
        result: Value,
        attempt: CommandAttemptEvidence,
    ) -> Self {
        Self {
            id,
            ok: true,
            result: Some(result),
            error: None,
            attempt: Some(attempt),
        }
    }
}

#[cfg(test)]
mod command_attempt_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn command_attempt_evidence_keeps_canonical_binding_and_terminal_stage() {
        let request = Request {
            id: Some("delivery-1".to_string()),
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
        };

        let attempt = CommandAttemptEvidence::for_request(
            &request,
            CommandAttemptTerminalStage::HelperTimeout,
            "camera_helper_timeout",
            CommandAttemptRetrySafety::ChangeStrategy,
        )
        .expect("bound commands produce attempt evidence");

        assert_eq!(
            serde_json::to_value(attempt).unwrap(),
            json!({
                "schema_version": 1,
                "method": "camera.capture",
                "command_id": "command-1",
                "operation_id": "operation-1",
                "target_fingerprint":
                    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                "terminal_stage": "helper_timeout",
              "reason_code": "camera_helper_timeout",
                "retry_safety": "change_strategy",
            }),
        );
    }
}

#[cfg(test)]
mod protocol_compatibility_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn request_metadata_accepts_exact_operation_and_target_binding() {
        let request: Request = serde_json::from_value(json!({
            "id": "delivery-1",
            "method": "camera.capture",
            "params": {},
            "metadata": {
                "commandId": "command-1",
                "operationId": "operation-1",
                "targetFingerprint":
                    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            }
        }))
        .expect("request");

        assert_eq!(
            request.metadata.operation_id.as_deref(),
            Some("operation-1")
        );
        assert_eq!(
            request.metadata.target_fingerprint.as_deref(),
            Some("sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
        );
    }

    #[test]
    fn response_serializes_bounded_versioned_attempt_evidence() {
        let response = Response::error_with_attempt(
            Some("delivery-1".to_string()),
            "camera_helper_timeout",
            "Camera capture timed out before completion.",
            CommandAttemptEvidence {
                schema_version: 1,
                method: "camera.capture".to_string(),
                command_id: "command-1".to_string(),
                operation_id: Some("operation-1".to_string()),
                target_fingerprint: Some(
                    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                        .to_string(),
                ),
                terminal_stage: CommandAttemptTerminalStage::HelperTimeout,
                reason_code: "camera_helper_timeout".to_string(),
                retry_safety: CommandAttemptRetrySafety::ChangeStrategy,
                cancellation_reason: None,
            },
        );

        let value = serde_json::to_value(response).expect("response");
        assert_eq!(value["attempt"]["schema_version"], 1);
        assert_eq!(value["attempt"]["terminal_stage"], "helper_timeout");
        assert_eq!(value["attempt"]["retry_safety"], "change_strategy");
        assert!(value["attempt"].get("message").is_none());
        assert!(value["attempt"].get("payload").is_none());
        assert!(value["attempt"].get("output_path").is_none());
    }

    #[test]
    fn legacy_response_omits_attempt_for_mixed_version_rollback() {
        let value = serde_json::to_value(Response::error(
            Some("delivery-1".to_string()),
            "request_failed",
            "failed",
        ))
        .expect("response");

        assert!(value.get("attempt").is_none());
    }

    #[test]
    fn cancellation_reason_is_typed_and_optional_for_protocol_compatibility() {
        let legacy: Response = serde_json::from_value(json!({
            "id": "delivery-legacy",
            "ok": false,
            "error": {
                "code": "command_cancelled_before_execution",
                "message": "cancelled"
            },
            "attempt": {
                "schema_version": 1,
                "method": "camera.capture",
                "command_id": "command-legacy",
                "terminal_stage": "cancelled",
                "reason_code": "command_cancelled_before_execution",
                "retry_safety": "completed"
            }
        }))
        .expect("legacy response");
        assert_eq!(
            legacy
                .attempt
                .as_ref()
                .expect("legacy attempt")
                .cancellation_reason,
            None
        );

        let typed = CommandAttemptEvidence::for_request(
            &Request {
                id: Some("delivery-typed".to_string()),
                method: "camera.capture".to_string(),
                params: json!({}),
                metadata: RequestMetadata {
                    command_id: Some("command-typed".to_string()),
                    ..Default::default()
                },
            },
            CommandAttemptTerminalStage::Cancelled,
            "command_cancelled_before_execution",
            CommandAttemptRetrySafety::Completed,
        )
        .expect("attempt")
        .with_cancellation_reason(CommandAttemptCancellationReason::DeadlineExceeded);
        let value = serde_json::to_value(typed).expect("typed attempt");
        assert_eq!(value["cancellation_reason"], "deadline_exceeded");
    }
}
