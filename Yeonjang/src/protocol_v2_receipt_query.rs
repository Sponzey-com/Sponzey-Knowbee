//! Strict signed `receipt.get` control contract.
//!
//! This read-only contract is intentionally separate from cancellation: a
//! receipt query cannot carry a cancel token or mutate an active command.

use std::fmt;

use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::mqtt_v2_topics::{MqttV2TopicSet, validate_identifier};

const PROTOCOL_VERSION: u16 = 2;
const CONTROL_SCHEMA_ID: &str = "yeonjang.control.v2";
const MAX_CONTROL_BYTES: usize = 65_536;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
enum MessageKind {
    Control,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
enum ReceiptAuthorizationScope {
    #[serde(rename = "receipt.read")]
    ReceiptRead,
}

#[derive(Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
struct ReceiptGetParams {
    target_request_id: String,
    target_command_id: String,
    target_operation_id: String,
    target_idempotency_key: String,
    target_scope_digest: String,
    expected_terminal_revision: u64,
}

impl ReceiptGetParams {
    fn validate(&self) -> bool {
        [
            self.target_request_id.as_str(),
            self.target_command_id.as_str(),
            self.target_operation_id.as_str(),
            self.target_idempotency_key.as_str(),
        ]
        .into_iter()
        .all(|value| validate_identifier(value).is_ok())
            && is_sha256_digest(&self.target_scope_digest)
            && self.expected_terminal_revision > 0
    }

    fn signing_digest(&self) -> [u8; 32] {
        let mut bytes = Vec::new();
        append_text(&mut bytes, "control", "receipt.get");
        append_text(&mut bytes, "target_request_id", &self.target_request_id);
        append_text(&mut bytes, "target_command_id", &self.target_command_id);
        append_text(&mut bytes, "target_operation_id", &self.target_operation_id);
        append_text(
            &mut bytes,
            "target_idempotency_key",
            &self.target_idempotency_key,
        );
        append_text(&mut bytes, "target_scope_digest", &self.target_scope_digest);
        append_u64(
            &mut bytes,
            "expected_terminal_revision",
            self.expected_terminal_revision,
        );
        Sha256::digest(bytes).into()
    }
}

#[derive(Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields, tag = "control", content = "params")]
enum ReceiptQueryPayload {
    #[serde(rename = "receipt.get")]
    ReceiptGet(ReceiptGetParams),
}

impl ReceiptQueryPayload {
    fn query(&self) -> &ReceiptGetParams {
        match self {
            Self::ReceiptGet(query) => query,
        }
    }
}

#[derive(Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
struct ReceiptQueryAuthorization {
    schema_version: u16,
    authorization_id: String,
    issuer: String,
    key_id: String,
    audience: String,
    scope: ReceiptAuthorizationScope,
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
    target_scope_digest: String,
    expected_terminal_revision: u64,
    expires_at: i64,
    nonce: String,
    signature: String,
}

/// Immutable query snapshot accepted at the protocol boundary.
#[derive(Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct V2ReceiptQueryEnvelope {
    protocol_version: u16,
    schema_id: String,
    message_kind: MessageKind,
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
    payload: ReceiptQueryPayload,
    authorization: ReceiptQueryAuthorization,
}

impl fmt::Debug for V2ReceiptQueryEnvelope {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("V2ReceiptQueryEnvelope")
            .field("request_id", &self.request_id)
            .field("requester_id", &self.requester_id)
            .field("target_instance_id", &self.target_instance_id)
            .field("target_request_id", &self.target_request_id())
            .field(
                "expected_terminal_revision",
                &self.expected_terminal_revision(),
            )
            .finish_non_exhaustive()
    }
}

impl V2ReceiptQueryEnvelope {
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
        &self.payload.query().target_request_id
    }

    pub fn target_command_id(&self) -> &str {
        &self.payload.query().target_command_id
    }

    pub fn target_operation_id(&self) -> &str {
        &self.payload.query().target_operation_id
    }

    pub fn target_idempotency_key(&self) -> &str {
        &self.payload.query().target_idempotency_key
    }

    pub fn target_scope_digest(&self) -> &str {
        &self.payload.query().target_scope_digest
    }

    pub fn expected_terminal_revision(&self) -> u64 {
        self.payload.query().expected_terminal_revision
    }

    pub(crate) fn expires_at(&self) -> i64 {
        self.expires_at
    }

    pub(crate) fn authorization_replay_identity(&self) -> String {
        let mut bytes = Vec::new();
        append_text(&mut bytes, "domain", "yeonjang.receipt-query.replay.v2");
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

    /// Canonical bytes bind route identity, query target, revision and scope.
    pub fn authorization_signing_bytes(&self) -> Vec<u8> {
        let authorization = &self.authorization;
        let mut bytes = Vec::new();
        append_text(
            &mut bytes,
            "domain",
            "yeonjang.receipt-query.authorization.v2",
        );
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
            &self.payload.query().signing_digest(),
        );
        for (name, value) in [
            ("message_id", self.message_id.as_str()),
            ("request_id", self.request_id.as_str()),
            ("command_id", self.command_id.as_str()),
            ("operation_id", self.operation_id.as_str()),
            ("correlation_id", self.correlation_id.as_str()),
            ("causation_id", self.causation_id.as_str()),
            ("requester_id", self.requester_id.as_str()),
            ("target_instance_id", self.target_instance_id.as_str()),
            ("target_session_id", self.target_session_id.as_str()),
            ("target_fingerprint", self.target_fingerprint.as_str()),
            ("idempotency_key", self.idempotency_key.as_str()),
        ] {
            append_text(&mut bytes, name, value);
        }
        append_i64(&mut bytes, "issued_at", self.issued_at);
        append_i64(&mut bytes, "expires_at", self.expires_at);
        append_u64(&mut bytes, "sequence", self.sequence);
        append_u64(
            &mut bytes,
            "authorization_schema_version",
            u64::from(authorization.schema_version),
        );
        for (name, value) in [
            ("authorization_id", authorization.authorization_id.as_str()),
            ("authorization_issuer", authorization.issuer.as_str()),
            ("authorization_key_id", authorization.key_id.as_str()),
            ("authorization_audience", authorization.audience.as_str()),
            ("authorization_scope", "receipt.read"),
            (
                "authorization_requester_id",
                authorization.requester_id.as_str(),
            ),
            (
                "authorization_command_id",
                authorization.command_id.as_str(),
            ),
            (
                "authorization_operation_id",
                authorization.operation_id.as_str(),
            ),
            (
                "authorization_target_instance_id",
                authorization.target_instance_id.as_str(),
            ),
            (
                "authorization_target_session_id",
                authorization.target_session_id.as_str(),
            ),
            (
                "authorization_target_fingerprint",
                authorization.target_fingerprint.as_str(),
            ),
            (
                "authorization_idempotency_key",
                authorization.idempotency_key.as_str(),
            ),
            (
                "authorization_target_request_id",
                authorization.target_request_id.as_str(),
            ),
            (
                "authorization_target_command_id",
                authorization.target_command_id.as_str(),
            ),
            (
                "authorization_target_operation_id",
                authorization.target_operation_id.as_str(),
            ),
            (
                "authorization_target_idempotency_key",
                authorization.target_idempotency_key.as_str(),
            ),
            (
                "authorization_target_scope_digest",
                authorization.target_scope_digest.as_str(),
            ),
        ] {
            append_text(&mut bytes, name, value);
        }
        append_u64(
            &mut bytes,
            "authorization_expected_terminal_revision",
            authorization.expected_terminal_revision,
        );
        append_i64(
            &mut bytes,
            "authorization_expires_at",
            authorization.expires_at,
        );
        append_text(&mut bytes, "authorization_nonce", &authorization.nonce);
        bytes
    }

    fn validate(
        &self,
        now_ms: i64,
        topics: &MqttV2TopicSet,
    ) -> Result<(), V2ReceiptQueryParseError> {
        if self.protocol_version != PROTOCOL_VERSION
            || self.schema_id != CONTROL_SCHEMA_ID
            || !matches!(self.message_kind, MessageKind::Control)
            || self.sequence == 0
            || !self.payload.query().validate()
        {
            return Err(V2ReceiptQueryParseError::UnknownOrInvalidField);
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
            validate_identifier(value)
                .map_err(|_| V2ReceiptQueryParseError::UnknownOrInvalidField)?;
        }
        if !is_sha256_digest(&self.target_fingerprint) {
            return Err(V2ReceiptQueryParseError::UnknownOrInvalidField);
        }
        if self.issued_at > now_ms {
            return Err(V2ReceiptQueryParseError::IssuedInFuture);
        }
        if self.expires_at <= now_ms || self.expires_at <= self.issued_at {
            return Err(V2ReceiptQueryParseError::Expired);
        }
        if self.requester_id != topics.requester_id()
            || self.target_instance_id != topics.instance_id()
            || self.target_session_id != topics.session_id()
        {
            return Err(V2ReceiptQueryParseError::IdentityMismatch);
        }
        self.validate_authorization()
    }

    fn validate_authorization(&self) -> Result<(), V2ReceiptQueryParseError> {
        let query = self.payload.query();
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
            authorization.nonce.as_str(),
        ] {
            validate_identifier(value)
                .map_err(|_| V2ReceiptQueryParseError::AuthorizationMismatch)?;
        }
        if authorization.schema_version != 1
            || !matches!(authorization.scope, ReceiptAuthorizationScope::ReceiptRead)
            || authorization.audience != self.target_instance_id
            || authorization.requester_id != self.requester_id
            || authorization.command_id != self.command_id
            || authorization.operation_id != self.operation_id
            || authorization.target_instance_id != self.target_instance_id
            || authorization.target_session_id != self.target_session_id
            || authorization.target_fingerprint != self.target_fingerprint
            || authorization.idempotency_key != self.idempotency_key
            || authorization.target_request_id != query.target_request_id
            || authorization.target_command_id != query.target_command_id
            || authorization.target_operation_id != query.target_operation_id
            || authorization.target_idempotency_key != query.target_idempotency_key
            || authorization.target_scope_digest != query.target_scope_digest
            || authorization.expected_terminal_revision != query.expected_terminal_revision
            || authorization.expires_at != self.expires_at
            || !is_sha256_digest(&authorization.target_fingerprint)
            || !is_sha256_digest(&authorization.target_scope_digest)
            || !is_hex_digest(&authorization.signature)
        {
            return Err(V2ReceiptQueryParseError::AuthorizationMismatch);
        }
        Ok(())
    }
}

pub trait V2ReceiptQuerySignatureVerifier: Send + Sync {
    fn verify(&self, issuer: &str, key_id: &str, signing_bytes: &[u8], signature_hex: &str)
    -> bool;
}

pub(crate) fn verify_receipt_query_signature(
    query: &V2ReceiptQueryEnvelope,
    verifier: &dyn V2ReceiptQuerySignatureVerifier,
) -> bool {
    verifier.verify(
        &query.authorization.issuer,
        &query.authorization.key_id,
        &query.authorization_signing_bytes(),
        &query.authorization.signature,
    )
}

pub fn parse_v2_receipt_query(
    topic: impl AsRef<str>,
    bytes: &[u8],
    now_ms: i64,
    topics: &MqttV2TopicSet,
) -> Result<V2ReceiptQueryEnvelope, V2ReceiptQueryParseError> {
    if bytes.len() > MAX_CONTROL_BYTES {
        return Err(V2ReceiptQueryParseError::PayloadTooLarge);
    }
    let probe: Value =
        serde_json::from_slice(bytes).map_err(|_| V2ReceiptQueryParseError::Malformed)?;
    match probe.get("protocol_version").and_then(Value::as_u64) {
        Some(1) => return Err(V2ReceiptQueryParseError::ProtocolUpgradeRequired),
        Some(2) => {}
        Some(_) => return Err(V2ReceiptQueryParseError::ProtocolVersionUnsupported),
        None => return Err(V2ReceiptQueryParseError::Malformed),
    }
    if topic.as_ref() != topics.control() {
        return Err(V2ReceiptQueryParseError::TopicMismatch);
    }
    let envelope = serde_json::from_value::<V2ReceiptQueryEnvelope>(probe)
        .map_err(|_| V2ReceiptQueryParseError::UnknownOrInvalidField)?;
    envelope.validate(now_ms, topics)?;
    Ok(envelope)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2ReceiptQueryParseError {
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

fn is_sha256_digest(value: &str) -> bool {
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
