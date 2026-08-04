//! Strict, transport-neutral MQTT v2 control contract.
//!
//! Parsing validates exact identity and authorization binding only. It never
//! mutates cancellation state or decides whether the target command is active.

use std::fmt;

use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::mqtt_v2_topics::{MqttV2TopicSet, validate_identifier};

const PROTOCOL_VERSION: u64 = 2;
const CONTROL_SCHEMA_ID: &str = "yeonjang.control.v2";
const MAX_CONTROL_BYTES: usize = 65_536;
const MAX_BOUND_TEXT_BYTES: usize = 256;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
enum V2ControlMessageKind {
    Control,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
enum V2ControlAuthorizationScope {
    #[serde(rename = "effect.cancel")]
    EffectCancel,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum V2CancelReason {
    UserRequested,
    DeadlineExceeded,
    RuntimeShutdown,
}

impl V2CancelReason {
    fn code(self) -> &'static str {
        match self {
            Self::UserRequested => "user_requested",
            Self::DeadlineExceeded => "deadline_exceeded",
            Self::RuntimeShutdown => "runtime_shutdown",
        }
    }
}

#[derive(Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
struct V2CancelParams {
    target_request_id: String,
    target_command_id: String,
    target_operation_id: String,
    target_idempotency_key: String,
    cancellation_id: String,
    cancel_token: String,
    reason: V2CancelReason,
}

impl V2CancelParams {
    fn validate(&self) -> bool {
        [
            self.target_request_id.as_str(),
            self.target_command_id.as_str(),
            self.target_operation_id.as_str(),
            self.target_idempotency_key.as_str(),
            self.cancellation_id.as_str(),
        ]
        .into_iter()
        .all(|value| validate_identifier(value).is_ok())
            && is_bounded_non_blank(&self.cancel_token)
    }

    fn signing_digest(&self) -> [u8; 32] {
        let mut bytes = Vec::new();
        append_text(&mut bytes, "control", "command.cancel");
        append_text(&mut bytes, "target_request_id", &self.target_request_id);
        append_text(&mut bytes, "target_command_id", &self.target_command_id);
        append_text(&mut bytes, "target_operation_id", &self.target_operation_id);
        append_text(
            &mut bytes,
            "target_idempotency_key",
            &self.target_idempotency_key,
        );
        append_text(&mut bytes, "cancellation_id", &self.cancellation_id);
        append_text(&mut bytes, "cancel_token", &self.cancel_token);
        append_text(&mut bytes, "reason", self.reason.code());
        Sha256::digest(bytes).into()
    }
}

#[derive(Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields, tag = "control", content = "params")]
enum V2ControlPayload {
    #[serde(rename = "command.cancel")]
    CommandCancel(V2CancelParams),
}

impl V2ControlPayload {
    fn cancel(&self) -> &V2CancelParams {
        match self {
            Self::CommandCancel(cancel) => cancel,
        }
    }
}

#[derive(Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
struct V2ControlAuthorization {
    schema_version: u16,
    authorization_id: String,
    issuer: String,
    key_id: String,
    audience: String,
    scope: V2ControlAuthorizationScope,
    requester_id: String,
    command_id: String,
    operation_id: String,
    target_instance_id: String,
    target_session_id: String,
    target_fingerprint: String,
    idempotency_key: String,
    target_request_id: String,
    target_command_id: String,
    target_operation_id: String,
    target_idempotency_key: String,
    cancellation_id: String,
    cancel_token: String,
    expires_at: i64,
    nonce: String,
    signature: String,
}

/// A validated immutable control snapshot. Debug intentionally omits secrets.
#[derive(Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct V2ControlEnvelope {
    protocol_version: u16,
    schema_id: String,
    message_kind: V2ControlMessageKind,
    message_id: String,
    request_id: String,
    command_id: String,
    operation_id: String,
    correlation_id: String,
    causation_id: String,
    requester_id: String,
    target_instance_id: String,
    target_session_id: String,
    target_fingerprint: String,
    idempotency_key: String,
    issued_at: i64,
    expires_at: i64,
    sequence: u64,
    payload: V2ControlPayload,
    authorization: V2ControlAuthorization,
}

impl fmt::Debug for V2ControlEnvelope {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("V2ControlEnvelope")
            .field("request_id", &self.request_id)
            .field("requester_id", &self.requester_id)
            .field("target_instance_id", &self.target_instance_id)
            .field("target_session_id", &self.target_session_id)
            .field("target_request_id", &self.target_request_id())
            .field("target_command_id", &self.target_command_id())
            .finish_non_exhaustive()
    }
}

impl V2ControlEnvelope {
    pub(crate) fn message_id(&self) -> &str {
        &self.message_id
    }

    pub(crate) fn correlation_id(&self) -> &str {
        &self.correlation_id
    }

    pub fn request_id(&self) -> &str {
        &self.request_id
    }

    pub fn command_id(&self) -> &str {
        &self.command_id
    }

    pub fn operation_id(&self) -> &str {
        &self.operation_id
    }

    pub fn requester_id(&self) -> &str {
        &self.requester_id
    }

    pub fn target_instance_id(&self) -> &str {
        &self.target_instance_id
    }

    pub fn target_session_id(&self) -> &str {
        &self.target_session_id
    }

    pub fn target_fingerprint(&self) -> &str {
        &self.target_fingerprint
    }

    pub fn idempotency_key(&self) -> &str {
        &self.idempotency_key
    }

    pub fn target_request_id(&self) -> &str {
        &self.payload.cancel().target_request_id
    }

    pub fn target_command_id(&self) -> &str {
        &self.payload.cancel().target_command_id
    }

    pub fn target_operation_id(&self) -> &str {
        &self.payload.cancel().target_operation_id
    }

    pub fn target_idempotency_key(&self) -> &str {
        &self.payload.cancel().target_idempotency_key
    }

    pub fn cancellation_id(&self) -> &str {
        &self.payload.cancel().cancellation_id
    }

    pub fn cancel_token(&self) -> &str {
        &self.payload.cancel().cancel_token
    }

    pub fn reason(&self) -> V2CancelReason {
        self.payload.cancel().reason
    }

    pub(crate) fn issued_at(&self) -> i64 {
        self.issued_at
    }

    pub(crate) fn expires_at(&self) -> i64 {
        self.expires_at
    }

    pub(crate) fn authorization_replay_identity(&self) -> String {
        let mut bytes = Vec::new();
        append_text(&mut bytes, "domain", "yeonjang.control.replay.v2");
        append_text(
            &mut bytes,
            "authorization_issuer",
            &self.authorization.issuer,
        );
        append_text(
            &mut bytes,
            "authorization_id",
            &self.authorization.authorization_id,
        );
        append_text(&mut bytes, "authorization_nonce", &self.authorization.nonce);
        format!("sha256:{:x}", Sha256::digest(bytes))
    }

    /// Canonical authorization input binds payload, routing and target identity.
    pub fn authorization_signing_bytes(&self) -> Vec<u8> {
        let authorization = &self.authorization;
        let mut bytes = Vec::new();
        append_text(&mut bytes, "domain", "yeonjang.control.authorization.v2");
        append_u64(
            &mut bytes,
            "protocol_version",
            u64::from(self.protocol_version),
        );
        append_text(&mut bytes, "schema_id", &self.schema_id);
        append_text(&mut bytes, "message_kind", "control");
        append_bytes(
            &mut bytes,
            "payload_sha256",
            &self.payload.cancel().signing_digest(),
        );
        append_text(&mut bytes, "message_id", &self.message_id);
        append_text(&mut bytes, "request_id", &self.request_id);
        append_text(&mut bytes, "command_id", &self.command_id);
        append_text(&mut bytes, "operation_id", &self.operation_id);
        append_text(&mut bytes, "correlation_id", &self.correlation_id);
        append_text(&mut bytes, "causation_id", &self.causation_id);
        append_text(&mut bytes, "requester_id", &self.requester_id);
        append_text(&mut bytes, "target_instance_id", &self.target_instance_id);
        append_text(&mut bytes, "target_session_id", &self.target_session_id);
        append_text(&mut bytes, "target_fingerprint", &self.target_fingerprint);
        append_text(&mut bytes, "idempotency_key", &self.idempotency_key);
        append_i64(&mut bytes, "issued_at", self.issued_at);
        append_i64(&mut bytes, "expires_at", self.expires_at);
        append_u64(&mut bytes, "sequence", self.sequence);
        append_u64(
            &mut bytes,
            "authorization_schema_version",
            u64::from(authorization.schema_version),
        );
        append_text(
            &mut bytes,
            "authorization_id",
            &authorization.authorization_id,
        );
        append_text(&mut bytes, "authorization_issuer", &authorization.issuer);
        append_text(&mut bytes, "authorization_key_id", &authorization.key_id);
        append_text(
            &mut bytes,
            "authorization_audience",
            &authorization.audience,
        );
        append_text(&mut bytes, "authorization_scope", "effect.cancel");
        for (name, value) in [
            ("authorization_requester_id", &authorization.requester_id),
            ("authorization_command_id", &authorization.command_id),
            ("authorization_operation_id", &authorization.operation_id),
            (
                "authorization_target_instance_id",
                &authorization.target_instance_id,
            ),
            (
                "authorization_target_session_id",
                &authorization.target_session_id,
            ),
            (
                "authorization_target_fingerprint",
                &authorization.target_fingerprint,
            ),
            (
                "authorization_idempotency_key",
                &authorization.idempotency_key,
            ),
            (
                "authorization_target_request_id",
                &authorization.target_request_id,
            ),
            (
                "authorization_target_command_id",
                &authorization.target_command_id,
            ),
            (
                "authorization_target_operation_id",
                &authorization.target_operation_id,
            ),
            (
                "authorization_target_idempotency_key",
                &authorization.target_idempotency_key,
            ),
            (
                "authorization_cancellation_id",
                &authorization.cancellation_id,
            ),
            ("authorization_cancel_token", &authorization.cancel_token),
        ] {
            append_text(&mut bytes, name, value);
        }
        append_i64(
            &mut bytes,
            "authorization_expires_at",
            authorization.expires_at,
        );
        append_text(&mut bytes, "authorization_nonce", &authorization.nonce);
        bytes
    }

    fn validate(&self, now_ms: i64, topics: &MqttV2TopicSet) -> Result<(), V2ControlParseError> {
        if self.protocol_version != PROTOCOL_VERSION as u16
            || self.schema_id != CONTROL_SCHEMA_ID
            || !matches!(self.message_kind, V2ControlMessageKind::Control)
            || self.sequence == 0
            || !self.payload.cancel().validate()
        {
            return Err(V2ControlParseError::UnknownOrInvalidField);
        }
        for value in [
            self.message_id.as_str(),
            self.request_id.as_str(),
            self.command_id.as_str(),
            self.operation_id.as_str(),
            self.correlation_id.as_str(),
            self.causation_id.as_str(),
            self.requester_id.as_str(),
            self.target_instance_id.as_str(),
            self.target_session_id.as_str(),
            self.idempotency_key.as_str(),
        ] {
            validate_identifier(value).map_err(|_| V2ControlParseError::UnknownOrInvalidField)?;
        }
        if !is_sha256_fingerprint(&self.target_fingerprint) {
            return Err(V2ControlParseError::UnknownOrInvalidField);
        }
        if self.issued_at > now_ms {
            return Err(V2ControlParseError::IssuedInFuture);
        }
        if self.expires_at <= now_ms || self.expires_at <= self.issued_at {
            return Err(V2ControlParseError::Expired);
        }
        if self.requester_id != topics.requester_id()
            || self.target_instance_id != topics.instance_id()
            || self.target_session_id != topics.session_id()
        {
            return Err(V2ControlParseError::IdentityMismatch);
        }
        self.validate_authorization()
    }

    fn validate_authorization(&self) -> Result<(), V2ControlParseError> {
        let cancel = self.payload.cancel();
        let authorization = &self.authorization;
        for value in [
            authorization.authorization_id.as_str(),
            authorization.issuer.as_str(),
            authorization.key_id.as_str(),
            authorization.audience.as_str(),
            authorization.requester_id.as_str(),
            authorization.command_id.as_str(),
            authorization.operation_id.as_str(),
            authorization.target_instance_id.as_str(),
            authorization.target_session_id.as_str(),
            authorization.idempotency_key.as_str(),
            authorization.target_request_id.as_str(),
            authorization.target_command_id.as_str(),
            authorization.target_operation_id.as_str(),
            authorization.target_idempotency_key.as_str(),
            authorization.cancellation_id.as_str(),
            authorization.nonce.as_str(),
        ] {
            validate_identifier(value).map_err(|_| V2ControlParseError::AuthorizationMismatch)?;
        }
        if authorization.schema_version != 1
            || !matches!(
                authorization.scope,
                V2ControlAuthorizationScope::EffectCancel
            )
            || authorization.audience != self.target_instance_id
            || authorization.requester_id != self.requester_id
            || authorization.command_id != self.command_id
            || authorization.operation_id != self.operation_id
            || authorization.target_instance_id != self.target_instance_id
            || authorization.target_session_id != self.target_session_id
            || authorization.target_fingerprint != self.target_fingerprint
            || authorization.idempotency_key != self.idempotency_key
            || authorization.target_request_id != cancel.target_request_id
            || authorization.target_command_id != cancel.target_command_id
            || authorization.target_operation_id != cancel.target_operation_id
            || authorization.target_idempotency_key != cancel.target_idempotency_key
            || authorization.cancellation_id != cancel.cancellation_id
            || authorization.cancel_token != cancel.cancel_token
            || authorization.expires_at != self.expires_at
            || !is_bounded_non_blank(&authorization.cancel_token)
            || !is_sha256_fingerprint(&authorization.target_fingerprint)
            || !is_hex_digest(&authorization.signature)
        {
            return Err(V2ControlParseError::AuthorizationMismatch);
        }
        Ok(())
    }
}

/// Cryptographic control verification is injected; parser code never owns keys.
pub trait V2ControlSignatureVerifier: Send + Sync {
    fn verify(&self, issuer: &str, key_id: &str, signing_bytes: &[u8], signature_hex: &str)
    -> bool;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2ControlSignatureError {
    Rejected,
}

/// Verifies exactly the immutable control snapshot accepted by the parser.
pub fn verify_v2_control_signature(
    control: &V2ControlEnvelope,
    verifier: &dyn V2ControlSignatureVerifier,
) -> Result<(), V2ControlSignatureError> {
    verifier
        .verify(
            &control.authorization.issuer,
            &control.authorization.key_id,
            &control.authorization_signing_bytes(),
            &control.authorization.signature,
        )
        .then_some(())
        .ok_or(V2ControlSignatureError::Rejected)
}

/// Parses only the exact requester control route and rejects v1 before v2 schema decoding.
pub fn parse_v2_control(
    topic: impl AsRef<str>,
    bytes: &[u8],
    now_ms: i64,
    topics: &MqttV2TopicSet,
) -> Result<V2ControlEnvelope, V2ControlParseError> {
    if bytes.len() > MAX_CONTROL_BYTES {
        return Err(V2ControlParseError::PayloadTooLarge);
    }
    let probe: Value = serde_json::from_slice(bytes).map_err(|_| V2ControlParseError::Malformed)?;
    match probe.get("protocol_version").and_then(Value::as_u64) {
        Some(1) => return Err(V2ControlParseError::ProtocolUpgradeRequired),
        Some(PROTOCOL_VERSION) => {}
        Some(_) => return Err(V2ControlParseError::ProtocolVersionUnsupported),
        None => return Err(V2ControlParseError::Malformed),
    }
    if topic.as_ref() != topics.control() {
        return Err(V2ControlParseError::TopicMismatch);
    }
    let envelope = serde_json::from_value::<V2ControlEnvelope>(probe)
        .map_err(|_| V2ControlParseError::UnknownOrInvalidField)?;
    envelope.validate(now_ms, topics)?;
    Ok(envelope)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2ControlParseError {
    PayloadTooLarge,
    Malformed,
    ProtocolUpgradeRequired,
    ProtocolVersionUnsupported,
    TopicMismatch,
    UnknownOrInvalidField,
    IssuedInFuture,
    Expired,
    IdentityMismatch,
    AuthorizationMismatch,
}

impl fmt::Display for V2ControlParseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::PayloadTooLarge => "MQTT v2 control payload is too large",
            Self::Malformed => "MQTT v2 control is malformed",
            Self::ProtocolUpgradeRequired => "MQTT protocol upgrade is required",
            Self::ProtocolVersionUnsupported => "MQTT protocol version is unsupported",
            Self::TopicMismatch => "MQTT topic does not match the control route",
            Self::UnknownOrInvalidField => "MQTT v2 control has an unknown or invalid field",
            Self::IssuedInFuture => "MQTT v2 control issue time is in the future",
            Self::Expired => "MQTT v2 control is expired",
            Self::IdentityMismatch => "MQTT v2 control identity does not match the topic",
            Self::AuthorizationMismatch => {
                "MQTT v2 control authorization does not match the target"
            }
        })
    }
}

impl std::error::Error for V2ControlParseError {}

fn is_bounded_non_blank(value: &str) -> bool {
    !value.trim().is_empty() && value.len() <= MAX_BOUND_TEXT_BYTES
}

fn is_sha256_fingerprint(value: &str) -> bool {
    value.len() == 71 && value.strip_prefix("sha256:").is_some_and(is_hex_digest)
}

fn is_hex_digest(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn append_text(output: &mut Vec<u8>, name: &str, value: &str) {
    append_bytes(output, name, value.as_bytes());
}

fn append_bytes(output: &mut Vec<u8>, name: &str, value: &[u8]) {
    output.extend_from_slice(&(name.len() as u64).to_be_bytes());
    output.extend_from_slice(name.as_bytes());
    output.extend_from_slice(&(value.len() as u64).to_be_bytes());
    output.extend_from_slice(value);
}

fn append_u64(output: &mut Vec<u8>, name: &str, value: u64) {
    append_bytes(output, name, &value.to_be_bytes());
}

fn append_i64(output: &mut Vec<u8>, name: &str, value: i64) {
    append_bytes(output, name, &value.to_be_bytes());
}
