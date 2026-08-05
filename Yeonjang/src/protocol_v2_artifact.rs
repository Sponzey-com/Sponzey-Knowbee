//! Strict MQTT v2 artifact fetch and acknowledgement boundary.
//!
//! Artifact bytes are transferred separately. This control envelope binds a
//! read or cancellation to the immutable producing operation and a single
//! transfer identity.

use std::fmt;

use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::authorization::{AuthorizationReplayGuard, ReplayGuardResult};
use crate::mqtt_v2_topics::{MqttV2TopicSet, RoutedInboundTopic, validate_identifier};

const PROTOCOL_VERSION: u16 = 2;
const SCHEMA_ID: &str = "yeonjang.artifact-control.v2";
const MAX_CONTROL_BYTES: usize = 65_536;
const MAX_CHUNK_PAYLOAD_BYTES: u32 = 262_144;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
enum MessageKind {
    Control,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2ArtifactControlKind {
    Fetch,
    Ack,
    Cancel,
}

#[derive(Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
struct ArtifactFetchParams {
    artifact_ref: String,
    owner_request_id: String,
    owner_operation_id: String,
    expected_revision: u64,
    transfer_id: String,
    chunk_payload_bytes: u32,
}

#[derive(Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
struct ArtifactAckParams {
    artifact_ref: String,
    owner_request_id: String,
    owner_operation_id: String,
    expected_revision: u64,
    transfer_id: String,
    full_digest: String,
}

#[derive(Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
struct ArtifactCancelParams {
    artifact_ref: String,
    owner_request_id: String,
    owner_operation_id: String,
    expected_revision: u64,
    transfer_id: String,
}

#[derive(Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields, tag = "artifact", content = "params")]
enum ArtifactPayload {
    #[serde(rename = "artifact.fetch")]
    Fetch(ArtifactFetchParams),
    #[serde(rename = "artifact.ack")]
    Ack(ArtifactAckParams),
    #[serde(rename = "artifact.cancel")]
    Cancel(ArtifactCancelParams),
}

impl ArtifactPayload {
    fn kind(&self) -> V2ArtifactControlKind {
        match self {
            Self::Fetch(_) => V2ArtifactControlKind::Fetch,
            Self::Ack(_) => V2ArtifactControlKind::Ack,
            Self::Cancel(_) => V2ArtifactControlKind::Cancel,
        }
    }

    fn artifact_ref(&self) -> &str {
        match self {
            Self::Fetch(value) => &value.artifact_ref,
            Self::Ack(value) => &value.artifact_ref,
            Self::Cancel(value) => &value.artifact_ref,
        }
    }

    fn owner_request_id(&self) -> &str {
        match self {
            Self::Fetch(value) => &value.owner_request_id,
            Self::Ack(value) => &value.owner_request_id,
            Self::Cancel(value) => &value.owner_request_id,
        }
    }

    fn owner_operation_id(&self) -> &str {
        match self {
            Self::Fetch(value) => &value.owner_operation_id,
            Self::Ack(value) => &value.owner_operation_id,
            Self::Cancel(value) => &value.owner_operation_id,
        }
    }

    fn expected_revision(&self) -> u64 {
        match self {
            Self::Fetch(value) => value.expected_revision,
            Self::Ack(value) => value.expected_revision,
            Self::Cancel(value) => value.expected_revision,
        }
    }

    fn transfer_id(&self) -> &str {
        match self {
            Self::Fetch(value) => &value.transfer_id,
            Self::Ack(value) => &value.transfer_id,
            Self::Cancel(value) => &value.transfer_id,
        }
    }

    fn full_digest(&self) -> Option<&str> {
        match self {
            Self::Fetch(_) => None,
            Self::Ack(value) => Some(&value.full_digest),
            Self::Cancel(_) => None,
        }
    }

    fn chunk_payload_bytes(&self) -> Option<u32> {
        match self {
            Self::Fetch(value) => Some(value.chunk_payload_bytes),
            Self::Ack(_) => None,
            Self::Cancel(_) => None,
        }
    }

    fn signing_digest(&self) -> [u8; 32] {
        let mut bytes = Vec::new();
        append_text(
            &mut bytes,
            "artifact",
            match self.kind() {
                V2ArtifactControlKind::Fetch => "artifact.fetch",
                V2ArtifactControlKind::Ack => "artifact.ack",
                V2ArtifactControlKind::Cancel => "artifact.cancel",
            },
        );
        for (name, value) in [
            ("artifact_ref", self.artifact_ref()),
            ("owner_request_id", self.owner_request_id()),
            ("owner_operation_id", self.owner_operation_id()),
            ("transfer_id", self.transfer_id()),
        ] {
            append_text(&mut bytes, name, value);
        }
        append_u64(&mut bytes, "expected_revision", self.expected_revision());
        append_optional_text(&mut bytes, "full_digest", self.full_digest());
        append_optional_u32(
            &mut bytes,
            "chunk_payload_bytes",
            self.chunk_payload_bytes(),
        );
        Sha256::digest(bytes).into()
    }
}

#[derive(Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
struct ArtifactAuthorization {
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
    artifact_ref: String,
    owner_request_id: String,
    owner_operation_id: String,
    transfer_id: String,
    expected_revision: u64,
    full_digest: Option<String>,
    chunk_payload_bytes: Option<u32>,
    expires_at: i64,
    nonce: String,
    signature: String,
}

/// Parsed and structurally validated artifact control message.
#[derive(Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct V2ArtifactEnvelope {
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
    payload: ArtifactPayload,
    authorization: ArtifactAuthorization,
}

impl fmt::Debug for V2ArtifactEnvelope {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("V2ArtifactEnvelope")
            .field("kind", &self.kind())
            .field("request_id", &self.request_id)
            .field("artifact_ref", &self.artifact_ref())
            .field("transfer_id", &self.transfer_id())
            .field("expected_revision", &self.expected_revision())
            .finish_non_exhaustive()
    }
}

impl V2ArtifactEnvelope {
    pub fn kind(&self) -> V2ArtifactControlKind {
        self.payload.kind()
    }

    pub fn artifact_ref(&self) -> &str {
        self.payload.artifact_ref()
    }

    pub fn owner_request_id(&self) -> &str {
        self.payload.owner_request_id()
    }

    pub fn owner_operation_id(&self) -> &str {
        self.payload.owner_operation_id()
    }

    pub fn expected_revision(&self) -> u64 {
        self.payload.expected_revision()
    }

    pub fn transfer_id(&self) -> &str {
        self.payload.transfer_id()
    }

    pub fn full_digest(&self) -> Option<&str> {
        self.payload.full_digest()
    }

    pub fn chunk_payload_bytes(&self) -> Option<u32> {
        self.payload.chunk_payload_bytes()
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

    pub(crate) fn message_id(&self) -> &str {
        &self.message_id
    }

    pub(crate) fn correlation_id(&self) -> &str {
        &self.correlation_id
    }

    pub(crate) fn target_instance_id(&self) -> &str {
        &self.target_instance_id
    }

    pub(crate) fn target_session_id(&self) -> &str {
        &self.target_session_id
    }

    pub(crate) fn target_fingerprint(&self) -> &str {
        &self.target_fingerprint
    }

    pub(crate) fn idempotency_key(&self) -> &str {
        &self.idempotency_key
    }

    pub fn expires_at(&self) -> i64 {
        self.expires_at
    }

    fn required_scope(&self) -> &'static str {
        match self.kind() {
            V2ArtifactControlKind::Fetch | V2ArtifactControlKind::Ack => "artifact.read",
            V2ArtifactControlKind::Cancel => "artifact.cancel",
        }
    }

    /// Canonical bytes bind the wire route, immutable owner, transfer and the
    /// exact operation scope. JSON object ordering is deliberately irrelevant.
    pub fn authorization_signing_bytes(&self) -> Vec<u8> {
        let authorization = &self.authorization;
        let mut bytes = Vec::new();
        append_text(&mut bytes, "domain", "yeonjang.artifact.authorization.v2");
        append_u64(
            &mut bytes,
            "protocol_version",
            u64::from(self.protocol_version),
        );
        append_text(&mut bytes, "schema_id", &self.schema_id);
        append_text(&mut bytes, "message_kind", "control");
        append_bytes(&mut bytes, "payload_sha256", &self.payload.signing_digest());
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
            ("authorization_scope", self.required_scope()),
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
                "authorization_artifact_ref",
                authorization.artifact_ref.as_str(),
            ),
            (
                "authorization_owner_request_id",
                authorization.owner_request_id.as_str(),
            ),
            (
                "authorization_owner_operation_id",
                authorization.owner_operation_id.as_str(),
            ),
            (
                "authorization_transfer_id",
                authorization.transfer_id.as_str(),
            ),
        ] {
            append_text(&mut bytes, name, value);
        }
        append_u64(
            &mut bytes,
            "authorization_expected_revision",
            authorization.expected_revision,
        );
        append_optional_text(
            &mut bytes,
            "authorization_full_digest",
            authorization.full_digest.as_deref(),
        );
        append_optional_u32(
            &mut bytes,
            "authorization_chunk_payload_bytes",
            authorization.chunk_payload_bytes,
        );
        append_i64(
            &mut bytes,
            "authorization_expires_at",
            authorization.expires_at,
        );
        append_text(&mut bytes, "authorization_nonce", &authorization.nonce);
        bytes
    }

    fn replay_identity(&self) -> String {
        let mut bytes = Vec::new();
        append_text(&mut bytes, "domain", "yeonjang.artifact.replay.v2");
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

    fn validate(
        &self,
        topic: &str,
        now_ms: i64,
        topics: &MqttV2TopicSet,
    ) -> Result<(), V2ArtifactParseError> {
        if self.protocol_version != PROTOCOL_VERSION
            || self.schema_id != SCHEMA_ID
            || !matches!(self.message_kind, MessageKind::Control)
            || self.sequence == 0
        {
            return Err(V2ArtifactParseError::UnknownOrInvalidField);
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
            self.owner_request_id(),
            self.owner_operation_id(),
            self.transfer_id(),
        ] {
            validate_identifier(value).map_err(|_| V2ArtifactParseError::UnknownOrInvalidField)?;
        }
        if !is_sha256_digest(&self.target_fingerprint)
            || !is_artifact_ref(self.artifact_ref())
            || self
                .full_digest()
                .is_some_and(|value| !is_sha256_digest(value))
            || self
                .chunk_payload_bytes()
                .is_some_and(|value| value == 0 || value > MAX_CHUNK_PAYLOAD_BYTES)
        {
            return Err(V2ArtifactParseError::UnknownOrInvalidField);
        }
        if self.issued_at > now_ms {
            return Err(V2ArtifactParseError::IssuedInFuture);
        }
        if self.expires_at <= now_ms || self.expires_at <= self.issued_at {
            return Err(V2ArtifactParseError::Expired);
        }
        if self.requester_id != topics.requester_id()
            || self.target_instance_id != topics.instance_id()
            || self.target_session_id != topics.session_id()
        {
            return Err(V2ArtifactParseError::IdentityMismatch);
        }
        self.validate_topic(topic, topics)?;
        self.validate_authorization()
    }

    fn validate_topic(
        &self,
        topic: &str,
        topics: &MqttV2TopicSet,
    ) -> Result<(), V2ArtifactParseError> {
        let route = topics
            .route_inbound(topic)
            .map_err(|_| V2ArtifactParseError::TopicMismatch)?;
        match (self.kind(), route) {
            (V2ArtifactControlKind::Fetch, RoutedInboundTopic::Control) => Ok(()),
            (V2ArtifactControlKind::Cancel, RoutedInboundTopic::Control) => Ok(()),
            (V2ArtifactControlKind::Ack, RoutedInboundTopic::ArtifactAck { transfer_id })
                if transfer_id == self.transfer_id() =>
            {
                Ok(())
            }
            _ => Err(V2ArtifactParseError::TopicMismatch),
        }
    }

    fn validate_authorization(&self) -> Result<(), V2ArtifactParseError> {
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
            authorization.owner_request_id.as_str(),
            authorization.owner_operation_id.as_str(),
            authorization.transfer_id.as_str(),
            authorization.nonce.as_str(),
        ] {
            validate_identifier(value).map_err(|_| V2ArtifactParseError::AuthorizationMismatch)?;
        }
        if authorization.schema_version != 1
            || authorization.scope != self.required_scope()
            || authorization.audience != self.target_instance_id
            || authorization.requester_id != self.requester_id
            || authorization.command_id != self.command_id
            || authorization.operation_id != self.operation_id
            || authorization.target_instance_id != self.target_instance_id
            || authorization.target_session_id != self.target_session_id
            || authorization.target_fingerprint != self.target_fingerprint
            || authorization.idempotency_key != self.idempotency_key
            || authorization.artifact_ref != self.artifact_ref()
            || authorization.owner_request_id != self.owner_request_id()
            || authorization.owner_operation_id != self.owner_operation_id()
            || authorization.transfer_id != self.transfer_id()
            || authorization.expected_revision != self.expected_revision()
            || authorization.full_digest.as_deref() != self.full_digest()
            || authorization.chunk_payload_bytes != self.chunk_payload_bytes()
            || authorization.expires_at != self.expires_at
            || !is_sha256_digest(&authorization.target_fingerprint)
            || !is_artifact_ref(&authorization.artifact_ref)
            || !is_hex_digest(&authorization.signature)
        {
            return Err(V2ArtifactParseError::AuthorizationMismatch);
        }
        Ok(())
    }
}

pub trait V2ArtifactSignatureVerifier: Send + Sync {
    fn verify(&self, issuer: &str, key_id: &str, signing_bytes: &[u8], signature_hex: &str)
    -> bool;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2ArtifactParseError {
    PayloadTooLarge,
    Malformed,
    ProtocolUpgradeRequired,
    ProtocolVersionUnsupported,
    RetainedNotAllowed,
    TopicMismatch,
    UnknownOrInvalidField,
    IssuedInFuture,
    Expired,
    IdentityMismatch,
    AuthorizationMismatch,
}

pub fn parse_v2_artifact_control(
    topic: impl AsRef<str>,
    bytes: &[u8],
    retained: bool,
    now_ms: i64,
    topics: &MqttV2TopicSet,
) -> Result<V2ArtifactEnvelope, V2ArtifactParseError> {
    if retained {
        return Err(V2ArtifactParseError::RetainedNotAllowed);
    }
    if bytes.len() > MAX_CONTROL_BYTES {
        return Err(V2ArtifactParseError::PayloadTooLarge);
    }
    let probe: Value =
        serde_json::from_slice(bytes).map_err(|_| V2ArtifactParseError::Malformed)?;
    match probe.get("protocol_version").and_then(Value::as_u64) {
        Some(1) => return Err(V2ArtifactParseError::ProtocolUpgradeRequired),
        Some(2) => {}
        Some(_) => return Err(V2ArtifactParseError::ProtocolVersionUnsupported),
        None => return Err(V2ArtifactParseError::Malformed),
    }
    let envelope = serde_json::from_value::<V2ArtifactEnvelope>(probe)
        .map_err(|_| V2ArtifactParseError::UnknownOrInvalidField)?;
    envelope.validate(topic.as_ref(), now_ms, topics)?;
    Ok(envelope)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2ArtifactAdmissionError {
    SignatureRejected,
    Expired,
    Replayed,
    ReplayUnavailable,
}

#[derive(Debug, PartialEq, Eq)]
pub struct AdmittedV2Artifact<'a> {
    envelope: &'a V2ArtifactEnvelope,
}

impl AdmittedV2Artifact<'_> {
    pub fn envelope(&self) -> &V2ArtifactEnvelope {
        self.envelope
    }
}

#[derive(Debug, PartialEq, Eq)]
pub struct VerifiedReplayV2Artifact<'a> {
    envelope: &'a V2ArtifactEnvelope,
}

impl VerifiedReplayV2Artifact<'_> {
    pub fn envelope(&self) -> &V2ArtifactEnvelope {
        self.envelope
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum V2ArtifactAdmissionOutcome<'a> {
    Fresh(AdmittedV2Artifact<'a>),
    VerifiedReplay(VerifiedReplayV2Artifact<'a>),
}

pub struct V2ArtifactAdmission<'a> {
    verifier: &'a dyn V2ArtifactSignatureVerifier,
    replay: &'a dyn AuthorizationReplayGuard,
}

impl<'a> V2ArtifactAdmission<'a> {
    pub fn new(
        verifier: &'a dyn V2ArtifactSignatureVerifier,
        replay: &'a dyn AuthorizationReplayGuard,
    ) -> Self {
        Self { verifier, replay }
    }

    pub fn admit<'message>(
        &self,
        envelope: &'message V2ArtifactEnvelope,
        now_ms: i64,
    ) -> Result<AdmittedV2Artifact<'message>, V2ArtifactAdmissionError> {
        match self.admit_or_replay(envelope, now_ms)? {
            V2ArtifactAdmissionOutcome::Fresh(admitted) => Ok(admitted),
            V2ArtifactAdmissionOutcome::VerifiedReplay(_) => {
                Err(V2ArtifactAdmissionError::Replayed)
            }
        }
    }

    /// QoS 1 redelivery remains distinguishable from a fresh authorization.
    /// The adapter may re-enter only an idempotent use-case transition.
    pub fn admit_or_replay<'message>(
        &self,
        envelope: &'message V2ArtifactEnvelope,
        now_ms: i64,
    ) -> Result<V2ArtifactAdmissionOutcome<'message>, V2ArtifactAdmissionError> {
        if !self.verifier.verify(
            &envelope.authorization.issuer,
            &envelope.authorization.key_id,
            &envelope.authorization_signing_bytes(),
            &envelope.authorization.signature,
        ) {
            return Err(V2ArtifactAdmissionError::SignatureRejected);
        }
        if envelope.expires_at() <= now_ms {
            return Err(V2ArtifactAdmissionError::Expired);
        }
        match self
            .replay
            .consume(&envelope.replay_identity(), envelope.expires_at(), now_ms)
        {
            ReplayGuardResult::Consumed => {
                Ok(V2ArtifactAdmissionOutcome::Fresh(AdmittedV2Artifact {
                    envelope,
                }))
            }
            ReplayGuardResult::Replayed => Ok(V2ArtifactAdmissionOutcome::VerifiedReplay(
                VerifiedReplayV2Artifact { envelope },
            )),
            ReplayGuardResult::Saturated | ReplayGuardResult::Unavailable => {
                Err(V2ArtifactAdmissionError::ReplayUnavailable)
            }
        }
    }
}

fn is_artifact_ref(value: &str) -> bool {
    value.strip_prefix("capture:").is_some_and(is_hex_digest)
}

fn is_sha256_digest(value: &str) -> bool {
    value.strip_prefix("sha256:").is_some_and(is_hex_digest)
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
            append_u64(output, &format!("{name}_present"), 1);
            append_text(output, name, value);
        }
        None => append_u64(output, &format!("{name}_present"), 0),
    }
}

fn append_optional_u32(output: &mut Vec<u8>, name: &str, value: Option<u32>) {
    match value {
        Some(value) => {
            append_u64(output, &format!("{name}_present"), 1);
            append_u64(output, name, u64::from(value));
        }
        None => append_u64(output, &format!("{name}_present"), 0),
    }
}
