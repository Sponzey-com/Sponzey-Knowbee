use serde::{Deserialize, Serialize};
use serde_json::Value;

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
    #[serde(default, alias = "deliveryId")]
    pub delivery_id: Option<String>,
    #[serde(default, alias = "idempotencyKey")]
    pub idempotency_key: Option<String>,
    #[serde(default, alias = "expiresAt")]
    pub expires_at: Option<i64>,
    #[serde(default, alias = "cancelToken")]
    pub cancel_token: Option<String>,
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

#[derive(Debug, Clone, Serialize)]
pub struct ErrorBody {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Response {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ErrorBody>,
}

impl Response {
    pub fn ok(id: Option<String>, result: Value) -> Self {
        Self {
            id,
            ok: true,
            result: Some(result),
            error: None,
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
        }
    }
}
