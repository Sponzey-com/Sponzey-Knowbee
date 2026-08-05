//! Strict signed, read-only capture permission query for MQTT v2.
//!
//! The query has no semantic selector: it always reads the closed camera and
//! screen projection. It cannot carry effect input, mutate policy, or request
//! an operating-system consent prompt.

use std::fmt;

use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::authorization::{AuthorizationReplayGuard, ReplayGuardResult};
use crate::mqtt_v2_topics::{MqttV2TopicSet, validate_identifier};

const MAX_CONTROL_BYTES: usize = 65_536;
const MAX_QUERY_TTL_MS: i64 = 5 * 60_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
enum MessageKind {
    Control,
}

#[derive(Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
struct CapturePermissionGetParams {}

#[derive(Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields, tag = "control", content = "params")]
enum CapturePermissionQueryPayload {
    #[serde(rename = "capture.permission.get")]
    CapturePermissionGet(CapturePermissionGetParams),
}

#[derive(Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
struct CapturePermissionQueryAuthorization {
    schema_version: u16,
    authorization_id: String,
    issuer: String,
    key_id: String,
    audience: String,
    scope: String,
    requester_id: String,
    command_id: String,
    operation_id: String,
    target_instance_id: String,
    target_session_id: String,
    target_fingerprint: String,
    idempotency_key: String,
    expires_at: i64,
    nonce: String,
    signature: String,
}

/// Parsed query identity before cryptographic and replay admission.
#[derive(Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct V2CapturePermissionQueryEnvelope {
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
    payload: CapturePermissionQueryPayload,
    authorization: CapturePermissionQueryAuthorization,
}

impl fmt::Debug for V2CapturePermissionQueryEnvelope {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("V2CapturePermissionQueryEnvelope")
            .field("request_id", &self.request_id)
            .field("requester_id", &self.requester_id)
            .field("target_instance_id", &self.target_instance_id)
            .field("authorization", &"[REDACTED]")
            .finish_non_exhaustive()
    }
}

impl V2CapturePermissionQueryEnvelope {
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

    pub fn message_id(&self) -> &str {
        &self.message_id
    }

    pub fn correlation_id(&self) -> &str {
        &self.correlation_id
    }

    pub(crate) fn expires_at(&self) -> i64 {
        self.expires_at
    }

    pub(crate) fn authorization_replay_identity(&self) -> String {
        let mut bytes = Vec::new();
        append_text(
            &mut bytes,
            "domain",
            "yeonjang.capture-permission-query.replay.v2",
        );
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

    /// Canonical bytes bind the empty read operation to one requester/target.
    pub fn authorization_signing_bytes(&self) -> Vec<u8> {
        let authorization = &self.authorization;
        let mut bytes = Vec::new();
        append_text(
            &mut bytes,
            "domain",
            "yeonjang.capture-permission-query.authorization.v2",
        );
        append_u64(
            &mut bytes,
            "protocol_version",
            u64::from(self.protocol_version),
        );
        append_text(&mut bytes, "schema_id", &self.schema_id);
        append_text(&mut bytes, "message_kind", "control");
        append_text(&mut bytes, "control", "capture.permission.get");
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
            ("authorization_scope", "permission.read"),
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

    fn validate(
        &self,
        now_ms: i64,
        topics: &MqttV2TopicSet,
    ) -> Result<(), V2CapturePermissionQueryParseError> {
        if self.protocol_version != 2
            || self.schema_id != "yeonjang.control.v2"
            || !matches!(self.message_kind, MessageKind::Control)
            || self.sequence == 0
        {
            return Err(V2CapturePermissionQueryParseError::UnknownOrInvalidField);
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
                .map_err(|_| V2CapturePermissionQueryParseError::UnknownOrInvalidField)?;
        }
        if !is_sha256_digest(&self.target_fingerprint) {
            return Err(V2CapturePermissionQueryParseError::UnknownOrInvalidField);
        }
        if self.issued_at > now_ms {
            return Err(V2CapturePermissionQueryParseError::IssuedInFuture);
        }
        if self.expires_at <= now_ms
            || self.expires_at <= self.issued_at
            || self.expires_at.saturating_sub(self.issued_at) > MAX_QUERY_TTL_MS
        {
            return Err(V2CapturePermissionQueryParseError::Expired);
        }
        if self.requester_id != topics.requester_id()
            || self.target_instance_id != topics.instance_id()
            || self.target_session_id != topics.session_id()
        {
            return Err(V2CapturePermissionQueryParseError::TargetMismatch);
        }
        self.validate_authorization()
    }

    fn validate_authorization(&self) -> Result<(), V2CapturePermissionQueryParseError> {
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
            authorization.nonce.as_str(),
        ] {
            validate_identifier(value)
                .map_err(|_| V2CapturePermissionQueryParseError::AuthorizationMismatch)?;
        }
        if authorization.schema_version != 1
            || authorization.scope != "permission.read"
            || authorization.issuer != self.requester_id
            || authorization.audience != self.target_instance_id
            || authorization.requester_id != self.requester_id
            || authorization.command_id != self.command_id
            || authorization.operation_id != self.operation_id
            || authorization.target_instance_id != self.target_instance_id
            || authorization.target_session_id != self.target_session_id
            || authorization.target_fingerprint != self.target_fingerprint
            || authorization.idempotency_key != self.idempotency_key
            || authorization.expires_at != self.expires_at
            || !is_sha256_digest(&authorization.target_fingerprint)
            || !is_lower_hex_digest(&authorization.signature)
        {
            return Err(V2CapturePermissionQueryParseError::AuthorizationMismatch);
        }
        Ok(())
    }
}

pub trait V2CapturePermissionQuerySignatureVerifier: Send + Sync {
    fn verify(&self, issuer: &str, key_id: &str, signing_bytes: &[u8], signature_hex: &str)
    -> bool;
}

pub(crate) fn verify_capture_permission_query_signature(
    query: &V2CapturePermissionQueryEnvelope,
    verifier: &dyn V2CapturePermissionQuerySignatureVerifier,
) -> bool {
    verifier.verify(
        &query.authorization.issuer,
        &query.authorization.key_id,
        &query.authorization_signing_bytes(),
        &query.authorization.signature,
    )
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2CapturePermissionQueryAdmissionError {
    SignatureRejected,
    Expired,
    ReplayUnavailable,
}

#[derive(Debug, PartialEq, Eq)]
pub enum V2CapturePermissionQueryAdmissionOutcome<'a> {
    Fresh(&'a V2CapturePermissionQueryEnvelope),
    VerifiedReplay(&'a V2CapturePermissionQueryEnvelope),
}

pub struct V2CapturePermissionQueryAdmission<'a> {
    signature_verifier: &'a dyn V2CapturePermissionQuerySignatureVerifier,
    replay_guard: &'a dyn AuthorizationReplayGuard,
}

impl<'a> V2CapturePermissionQueryAdmission<'a> {
    pub fn new(
        signature_verifier: &'a dyn V2CapturePermissionQuerySignatureVerifier,
        replay_guard: &'a dyn AuthorizationReplayGuard,
    ) -> Self {
        Self {
            signature_verifier,
            replay_guard,
        }
    }

    pub fn admit_or_replay<'query>(
        &self,
        query: &'query V2CapturePermissionQueryEnvelope,
        now_ms: i64,
    ) -> Result<
        V2CapturePermissionQueryAdmissionOutcome<'query>,
        V2CapturePermissionQueryAdmissionError,
    > {
        if !verify_capture_permission_query_signature(query, self.signature_verifier) {
            return Err(V2CapturePermissionQueryAdmissionError::SignatureRejected);
        }
        if query.expires_at() <= now_ms {
            return Err(V2CapturePermissionQueryAdmissionError::Expired);
        }
        match self.replay_guard.consume(
            &query.authorization_replay_identity(),
            query.expires_at(),
            now_ms,
        ) {
            ReplayGuardResult::Consumed => {
                Ok(V2CapturePermissionQueryAdmissionOutcome::Fresh(query))
            }
            ReplayGuardResult::Replayed => Ok(
                V2CapturePermissionQueryAdmissionOutcome::VerifiedReplay(query),
            ),
            ReplayGuardResult::Saturated | ReplayGuardResult::Unavailable => {
                Err(V2CapturePermissionQueryAdmissionError::ReplayUnavailable)
            }
        }
    }
}

pub fn parse_v2_capture_permission_query(
    topic: impl AsRef<str>,
    bytes: &[u8],
    retained: bool,
    now_ms: i64,
    topics: &MqttV2TopicSet,
) -> Result<V2CapturePermissionQueryEnvelope, V2CapturePermissionQueryParseError> {
    if retained {
        return Err(V2CapturePermissionQueryParseError::RetainedNotAllowed);
    }
    if bytes.len() > MAX_CONTROL_BYTES {
        return Err(V2CapturePermissionQueryParseError::PayloadTooLarge);
    }
    let probe: Value =
        serde_json::from_slice(bytes).map_err(|_| V2CapturePermissionQueryParseError::Malformed)?;
    match probe.get("protocol_version").and_then(Value::as_u64) {
        Some(1) => return Err(V2CapturePermissionQueryParseError::ProtocolUpgradeRequired),
        Some(2) => {}
        Some(_) => return Err(V2CapturePermissionQueryParseError::ProtocolVersionUnsupported),
        None => return Err(V2CapturePermissionQueryParseError::Malformed),
    }
    if topic.as_ref() != topics.control() {
        return Err(V2CapturePermissionQueryParseError::TopicMismatch);
    }
    let envelope = serde_json::from_value::<V2CapturePermissionQueryEnvelope>(probe)
        .map_err(|_| V2CapturePermissionQueryParseError::UnknownOrInvalidField)?;
    envelope.validate(now_ms, topics)?;
    Ok(envelope)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2CapturePermissionQueryParseError {
    RetainedNotAllowed,
    PayloadTooLarge,
    Malformed,
    ProtocolUpgradeRequired,
    ProtocolVersionUnsupported,
    TopicMismatch,
    UnknownOrInvalidField,
    IssuedInFuture,
    Expired,
    TargetMismatch,
    AuthorizationMismatch,
}

fn is_sha256_digest(value: &str) -> bool {
    value.len() == 71
        && value
            .strip_prefix("sha256:")
            .is_some_and(is_lower_hex_digest)
}

fn is_lower_hex_digest(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
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
