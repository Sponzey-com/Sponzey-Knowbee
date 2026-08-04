//! Strict MQTT v2 command schema and pre-execution identity validation.

use std::fmt;

use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::mqtt_v2_topics::{MqttV2TopicSet, validate_identifier};

const PROTOCOL_VERSION: u64 = 2;
const COMMAND_SCHEMA_ID: &str = "yeonjang.command.v2";
const MAX_COMMAND_BYTES: usize = 65_536;
const MAX_BOUND_TEXT_BYTES: usize = 256;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub enum V2CommandMethod {
    #[serde(rename = "camera.capture")]
    CameraCapture,
    #[serde(rename = "screen.capture")]
    ScreenCapture,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum V2CapabilityCommandData {
    CameraCapture {
        device_id: Option<String>,
        capture_timeout_ms: Option<u64>,
    },
    ScreenCapture {
        display: Option<u32>,
    },
}

impl V2CommandMethod {
    fn resource(self) -> V2Resource {
        match self {
            Self::CameraCapture => V2Resource::Camera,
            Self::ScreenCapture => V2Resource::Screen,
        }
    }

    fn code(self) -> &'static str {
        match self {
            Self::CameraCapture => "camera.capture",
            Self::ScreenCapture => "screen.capture",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
enum V2Resource {
    Camera,
    Screen,
}

impl V2Resource {
    fn code(self) -> &'static str {
        match self {
            Self::Camera => "camera",
            Self::Screen => "screen",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
enum V2MessageKind {
    Command,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
enum V2AuthorizationScope {
    #[serde(rename = "effect.execute")]
    EffectExecute,
}

impl V2AuthorizationScope {
    fn code(self) -> &'static str {
        match self {
            Self::EffectExecute => "effect.execute",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields, tag = "method", content = "params")]
enum V2CommandPayload {
    #[serde(rename = "camera.capture")]
    CameraCapture(CameraCaptureParamsV2),
    #[serde(rename = "screen.capture")]
    ScreenCapture(ScreenCaptureParamsV2),
}

impl V2CommandPayload {
    fn method(&self) -> V2CommandMethod {
        match self {
            Self::CameraCapture(_) => V2CommandMethod::CameraCapture,
            Self::ScreenCapture(_) => V2CommandMethod::ScreenCapture,
        }
    }

    fn validate(&self) -> bool {
        match self {
            Self::CameraCapture(params) => {
                params.device_id.as_deref().is_none_or(is_bounded_non_blank)
                    && params
                        .capture_timeout_ms
                        .is_none_or(|value| (1..=60_000).contains(&value))
            }
            Self::ScreenCapture(_params) => true,
        }
    }

    fn signing_digest(&self) -> [u8; 32] {
        let mut bytes = Vec::new();
        append_text(&mut bytes, "method", self.method().code());
        match self {
            Self::CameraCapture(params) => {
                append_optional_text(&mut bytes, "device_id", params.device_id.as_deref());
                append_optional_u64(&mut bytes, "capture_timeout_ms", params.capture_timeout_ms);
            }
            Self::ScreenCapture(params) => {
                append_optional_u64(&mut bytes, "display", params.display.map(u64::from));
            }
        }
        Sha256::digest(bytes).into()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
struct CameraCaptureParamsV2 {
    #[serde(default)]
    device_id: Option<String>,
    #[serde(default)]
    capture_timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
struct ScreenCaptureParamsV2 {
    #[serde(default)]
    display: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
struct V2Authorization {
    schema_version: u16,
    authorization_id: String,
    issuer: String,
    key_id: String,
    audience: String,
    scope: V2AuthorizationScope,
    method: V2CommandMethod,
    resource: V2Resource,
    requester_id: String,
    command_id: String,
    operation_id: String,
    target_instance_id: String,
    target_session_id: String,
    target_fingerprint: String,
    idempotency_key: String,
    cancellation_id: String,
    cancel_token: String,
    expires_at: i64,
    nonce: String,
    signature: String,
}

#[derive(Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct V2CommandEnvelope {
    protocol_version: u16,
    schema_id: String,
    message_kind: V2MessageKind,
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
    cancellation_id: String,
    cancel_token: String,
    issued_at: i64,
    expires_at: i64,
    sequence: u64,
    payload: V2CommandPayload,
    authorization: V2Authorization,
}

impl fmt::Debug for V2CommandEnvelope {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("V2CommandEnvelope")
            .field("request_id", &self.request_id)
            .field("command_id", &self.command_id)
            .field("operation_id", &self.operation_id)
            .field("requester_id", &self.requester_id)
            .field("target_instance_id", &self.target_instance_id)
            .field("target_session_id", &self.target_session_id)
            .field("cancellation_id", &self.cancellation_id)
            .finish_non_exhaustive()
    }
}

impl V2CommandEnvelope {
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

    pub fn target_session_id(&self) -> &str {
        &self.target_session_id
    }

    pub(crate) fn target_instance_id(&self) -> &str {
        &self.target_instance_id
    }

    pub(crate) fn message_id(&self) -> &str {
        &self.message_id
    }

    pub(crate) fn correlation_id(&self) -> &str {
        &self.correlation_id
    }

    pub(crate) fn target_fingerprint(&self) -> &str {
        &self.target_fingerprint
    }

    pub(crate) fn idempotency_key(&self) -> &str {
        &self.idempotency_key
    }

    pub(crate) fn authorization_id(&self) -> &str {
        &self.authorization.authorization_id
    }

    pub(crate) fn capability_command_data(&self) -> V2CapabilityCommandData {
        match &self.payload {
            V2CommandPayload::CameraCapture(params) => V2CapabilityCommandData::CameraCapture {
                device_id: params.device_id.clone(),
                capture_timeout_ms: params.capture_timeout_ms,
            },
            V2CommandPayload::ScreenCapture(params) => V2CapabilityCommandData::ScreenCapture {
                display: params.display,
            },
        }
    }

    pub fn method(&self) -> V2CommandMethod {
        self.payload.method()
    }

    pub fn cancellation_id(&self) -> &str {
        &self.cancellation_id
    }

    pub(crate) fn cancel_token(&self) -> &str {
        &self.cancel_token
    }

    /// Builds the versioned, deterministic authorization input without the signature itself.
    pub fn authorization_signing_bytes(&self) -> Vec<u8> {
        let authorization = &self.authorization;
        let mut bytes = Vec::new();
        append_text(&mut bytes, "domain", "yeonjang.command.authorization.v2");
        append_u64(
            &mut bytes,
            "protocol_version",
            u64::from(self.protocol_version),
        );
        append_text(&mut bytes, "schema_id", &self.schema_id);
        append_text(&mut bytes, "message_kind", "command");
        append_text(&mut bytes, "method", self.payload.method().code());
        append_bytes(&mut bytes, "payload_sha256", &self.payload.signing_digest());
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
        append_text(&mut bytes, "cancellation_id", &self.cancellation_id);
        append_text(&mut bytes, "cancel_token", &self.cancel_token);
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
        append_text(
            &mut bytes,
            "authorization_scope",
            authorization.scope.code(),
        );
        append_text(
            &mut bytes,
            "authorization_method",
            authorization.method.code(),
        );
        append_text(
            &mut bytes,
            "authorization_resource",
            authorization.resource.code(),
        );
        append_text(
            &mut bytes,
            "authorization_requester_id",
            &authorization.requester_id,
        );
        append_text(
            &mut bytes,
            "authorization_command_id",
            &authorization.command_id,
        );
        append_text(
            &mut bytes,
            "authorization_operation_id",
            &authorization.operation_id,
        );
        append_text(
            &mut bytes,
            "authorization_target_instance_id",
            &authorization.target_instance_id,
        );
        append_text(
            &mut bytes,
            "authorization_target_session_id",
            &authorization.target_session_id,
        );
        append_text(
            &mut bytes,
            "authorization_target_fingerprint",
            &authorization.target_fingerprint,
        );
        append_text(
            &mut bytes,
            "authorization_idempotency_key",
            &authorization.idempotency_key,
        );
        append_text(
            &mut bytes,
            "authorization_cancellation_id",
            &authorization.cancellation_id,
        );
        append_text(
            &mut bytes,
            "authorization_cancel_token",
            &authorization.cancel_token,
        );
        append_i64(
            &mut bytes,
            "authorization_expires_at",
            authorization.expires_at,
        );
        append_text(&mut bytes, "authorization_nonce", &authorization.nonce);
        bytes
    }

    pub(crate) fn expires_at(&self) -> i64 {
        self.expires_at
    }

    pub(crate) fn authorization_replay_identity(&self) -> String {
        let mut bytes = Vec::new();
        append_text(&mut bytes, "domain", "yeonjang.command.replay.v2");
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
        Sha256::digest(bytes)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect()
    }

    pub(crate) fn idempotency_scope_digest(&self) -> String {
        let authorization = &self.authorization;
        let mut bytes = Vec::new();
        append_text(
            &mut bytes,
            "domain",
            "yeonjang.command.idempotency-scope.v2",
        );
        append_text(&mut bytes, "request_id", &self.request_id);
        append_text(&mut bytes, "command_id", &self.command_id);
        append_text(&mut bytes, "operation_id", &self.operation_id);
        append_text(&mut bytes, "requester_id", &self.requester_id);
        append_text(&mut bytes, "target_instance_id", &self.target_instance_id);
        append_text(&mut bytes, "target_session_id", &self.target_session_id);
        append_text(&mut bytes, "target_fingerprint", &self.target_fingerprint);
        append_text(&mut bytes, "idempotency_key", &self.idempotency_key);
        append_text(&mut bytes, "cancellation_id", &self.cancellation_id);
        append_text(&mut bytes, "cancel_token", &self.cancel_token);
        append_text(&mut bytes, "method", self.payload.method().code());
        append_bytes(&mut bytes, "payload_sha256", &self.payload.signing_digest());
        append_text(
            &mut bytes,
            "authorization_id",
            &authorization.authorization_id,
        );
        append_text(&mut bytes, "authorization_issuer", &authorization.issuer);
        append_text(
            &mut bytes,
            "authorization_scope",
            authorization.scope.code(),
        );
        append_text(
            &mut bytes,
            "authorization_cancellation_id",
            &authorization.cancellation_id,
        );
        append_text(
            &mut bytes,
            "authorization_cancel_token",
            &authorization.cancel_token,
        );
        append_text(
            &mut bytes,
            "authorization_method",
            authorization.method.code(),
        );
        append_text(
            &mut bytes,
            "authorization_resource",
            authorization.resource.code(),
        );
        append_i64(
            &mut bytes,
            "authorization_expires_at",
            authorization.expires_at,
        );
        append_text(&mut bytes, "authorization_nonce", &authorization.nonce);
        format!("sha256:{:x}", Sha256::digest(bytes))
    }

    fn validate(&self, now_ms: i64, topics: &MqttV2TopicSet) -> Result<(), V2CommandParseError> {
        if self.protocol_version != PROTOCOL_VERSION as u16
            || self.schema_id != COMMAND_SCHEMA_ID
            || !matches!(self.message_kind, V2MessageKind::Command)
            || self.sequence == 0
            || !self.payload.validate()
        {
            return Err(V2CommandParseError::UnknownOrInvalidField);
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
            self.cancellation_id.as_str(),
        ] {
            validate_identifier(value).map_err(|_| V2CommandParseError::UnknownOrInvalidField)?;
        }
        if !is_sha256_fingerprint(&self.target_fingerprint) {
            return Err(V2CommandParseError::UnknownOrInvalidField);
        }
        if !is_bounded_non_blank(&self.cancel_token) {
            return Err(V2CommandParseError::UnknownOrInvalidField);
        }
        if self.issued_at > now_ms {
            return Err(V2CommandParseError::IssuedInFuture);
        }
        if self.expires_at <= now_ms || self.expires_at <= self.issued_at {
            return Err(V2CommandParseError::Expired);
        }
        if self.requester_id != topics.requester_id()
            || self.target_instance_id != topics.instance_id()
            || self.target_session_id != topics.session_id()
        {
            return Err(V2CommandParseError::IdentityMismatch);
        }
        self.validate_authorization()
    }

    fn validate_authorization(&self) -> Result<(), V2CommandParseError> {
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
            authorization.cancellation_id.as_str(),
            authorization.nonce.as_str(),
        ] {
            validate_identifier(value).map_err(|_| V2CommandParseError::AuthorizationMismatch)?;
        }
        if authorization.schema_version != 1
            || !matches!(authorization.scope, V2AuthorizationScope::EffectExecute)
            || authorization.method != self.payload.method()
            || authorization.resource != self.payload.method().resource()
            || authorization.requester_id != self.requester_id
            || authorization.command_id != self.command_id
            || authorization.operation_id != self.operation_id
            || authorization.target_instance_id != self.target_instance_id
            || authorization.target_session_id != self.target_session_id
            || authorization.target_fingerprint != self.target_fingerprint
            || authorization.idempotency_key != self.idempotency_key
            || authorization.cancellation_id != self.cancellation_id
            || authorization.cancel_token != self.cancel_token
            || authorization.expires_at != self.expires_at
            || !is_bounded_non_blank(&authorization.cancel_token)
            || !is_sha256_fingerprint(&authorization.target_fingerprint)
            || !is_hex_digest(&authorization.signature)
        {
            return Err(V2CommandParseError::AuthorizationMismatch);
        }
        Ok(())
    }
}

/// Cryptographic verification remains an injected boundary so protocol parsing never owns keys.
pub trait V2CommandSignatureVerifier: Send + Sync {
    fn verify(&self, issuer: &str, key_id: &str, signing_bytes: &[u8], signature_hex: &str)
    -> bool;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2SignatureError {
    Rejected,
}

/// Verifies the exact validated command snapshot before any replay or execution decision.
pub fn verify_v2_command_signature(
    command: &V2CommandEnvelope,
    verifier: &dyn V2CommandSignatureVerifier,
) -> Result<(), V2SignatureError> {
    let authorization = &command.authorization;
    verifier
        .verify(
            &authorization.issuer,
            &authorization.key_id,
            &command.authorization_signing_bytes(),
            &authorization.signature,
        )
        .then_some(())
        .ok_or(V2SignatureError::Rejected)
}

/// Parses a command only after version, size, exact topic, and strict schema checks.
pub fn parse_v2_command(
    topic: impl AsRef<str>,
    bytes: &[u8],
    now_ms: i64,
    topics: &MqttV2TopicSet,
) -> Result<V2CommandEnvelope, V2CommandParseError> {
    if bytes.len() > MAX_COMMAND_BYTES {
        return Err(V2CommandParseError::PayloadTooLarge);
    }
    let probe: Value = serde_json::from_slice(bytes).map_err(|_| V2CommandParseError::Malformed)?;
    match probe.get("protocol_version").and_then(Value::as_u64) {
        Some(1) => return Err(V2CommandParseError::ProtocolUpgradeRequired),
        Some(PROTOCOL_VERSION) => {}
        Some(_) => return Err(V2CommandParseError::ProtocolVersionUnsupported),
        None => return Err(V2CommandParseError::Malformed),
    }
    if topic.as_ref() != topics.command() {
        return Err(V2CommandParseError::TopicMismatch);
    }
    let envelope = serde_json::from_value::<V2CommandEnvelope>(probe)
        .map_err(|_| V2CommandParseError::UnknownOrInvalidField)?;
    envelope.validate(now_ms, topics)?;
    Ok(envelope)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2CommandParseError {
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

impl fmt::Display for V2CommandParseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::PayloadTooLarge => "MQTT v2 command payload is too large",
            Self::Malformed => "MQTT v2 command is malformed",
            Self::ProtocolUpgradeRequired => "MQTT protocol upgrade is required",
            Self::ProtocolVersionUnsupported => "MQTT protocol version is unsupported",
            Self::TopicMismatch => "MQTT topic does not match the command route",
            Self::UnknownOrInvalidField => "MQTT v2 command has an unknown or invalid field",
            Self::IssuedInFuture => "MQTT v2 command issue time is in the future",
            Self::Expired => "MQTT v2 command is expired",
            Self::IdentityMismatch => "MQTT v2 command identity does not match the topic",
            Self::AuthorizationMismatch => "MQTT v2 authorization does not match the command",
        })
    }
}

impl std::error::Error for V2CommandParseError {}

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

fn append_optional_text(output: &mut Vec<u8>, name: &str, value: Option<&str>) {
    match value {
        Some(value) => {
            append_bytes(output, &format!("{name}_present"), &[1]);
            append_text(output, name, value);
        }
        None => append_bytes(output, &format!("{name}_present"), &[0]),
    }
}

fn append_optional_u64(output: &mut Vec<u8>, name: &str, value: Option<u64>) {
    match value {
        Some(value) => {
            append_bytes(output, &format!("{name}_present"), &[1]);
            append_u64(output, name, value);
        }
        None => append_bytes(output, &format!("{name}_present"), &[0]),
    }
}
