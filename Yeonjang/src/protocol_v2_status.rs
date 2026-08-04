//! Strict signed MQTT v2 instance-session liveness projection.
//!
//! Status is a retained read projection, not canonical workflow state and not
//! evidence that a command, permission, or effect succeeded. Online snapshots
//! have a short finite expiry. An offline Last Will uses `i64::MAX` because its
//! bytes are fixed before CONNECT and may be published much later by the broker;
//! a later online retained snapshot for the same exact session replaces it.

use std::fmt;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::mqtt_v2_topics::{MqttV2TopicSet, validate_identifier};
use crate::protocol_v2_terminal::{V2ResponseSigner, V2ResponseSigningContext};

const MAX_STATUS_BYTES: usize = 65_536;
const MAX_ONLINE_TTL_MS: i64 = 5 * 60_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum V2StatusState {
    Online,
    Offline,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum V2StatusReason {
    UnexpectedDisconnect,
    GracefulShutdown,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct V2StatusSnapshot {
    target_instance_id: String,
    target_session_id: String,
    target_fingerprint: String,
    state: V2StatusState,
    reason: Option<V2StatusReason>,
    observed_at: i64,
    expires_at: i64,
    sequence: u64,
}

impl V2StatusSnapshot {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        target_instance_id: &str,
        target_session_id: &str,
        target_fingerprint: &str,
        state: V2StatusState,
        observed_at: i64,
        expires_at: i64,
        sequence: u64,
    ) -> Result<Self, V2StatusBuildError> {
        validate_identifier(target_instance_id).map_err(|_| V2StatusBuildError::InvalidIdentity)?;
        validate_identifier(target_session_id).map_err(|_| V2StatusBuildError::InvalidIdentity)?;
        if !is_sha256_digest(target_fingerprint) || observed_at <= 0 || sequence == 0 {
            return Err(V2StatusBuildError::InvalidIdentity);
        }
        match state {
            V2StatusState::Online
                if expires_at <= observed_at
                    || expires_at.saturating_sub(observed_at) > MAX_ONLINE_TTL_MS =>
            {
                return Err(V2StatusBuildError::InvalidOnlineExpiry);
            }
            V2StatusState::Offline if expires_at != i64::MAX => {
                return Err(V2StatusBuildError::InvalidOfflineExpiry);
            }
            V2StatusState::Online | V2StatusState::Offline => {}
        }
        Ok(Self {
            target_instance_id: target_instance_id.to_string(),
            target_session_id: target_session_id.to_string(),
            target_fingerprint: target_fingerprint.to_string(),
            state,
            reason: (state == V2StatusState::Offline)
                .then_some(V2StatusReason::UnexpectedDisconnect),
            observed_at,
            expires_at,
            sequence,
        })
    }

    pub fn with_offline_reason(
        mut self,
        reason: V2StatusReason,
    ) -> Result<Self, V2StatusBuildError> {
        if self.state != V2StatusState::Offline {
            return Err(V2StatusBuildError::InvalidStateReason);
        }
        self.reason = Some(reason);
        Ok(self)
    }

    pub fn is_last_will_compatible(&self) -> bool {
        self.state == V2StatusState::Offline
            && self.reason == Some(V2StatusReason::UnexpectedDisconnect)
            && self.expires_at == i64::MAX
    }

    pub fn sign(
        self,
        context: V2ResponseSigningContext,
        signer: &dyn V2ResponseSigner,
    ) -> Result<V2StatusEnvelope, V2StatusBuildError> {
        if !valid_message_identity(&context.message_id)
            || !valid_message_identity(&context.nonce)
            || context.issuer != self.target_instance_id
            || context.audience != self.target_session_id
            || context.issued_at != self.observed_at
            || context.expires_at != self.expires_at
            || !valid_message_identity(&context.key_id)
        {
            return Err(V2StatusBuildError::InvalidSigningContext);
        }
        let payload = V2StatusPayload {
            state: self.state,
            reason: self.reason,
        };
        let payload_digest = Sha256::digest(
            serde_json::to_vec(&payload).map_err(|_| V2StatusBuildError::Serialization)?,
        )
        .into();
        let mut envelope = V2StatusEnvelope {
            protocol_version: 2,
            schema_id: "yeonjang.status.v2".to_string(),
            message_kind: "status".to_string(),
            message_id: context.message_id,
            target_instance_id: self.target_instance_id,
            target_session_id: self.target_session_id,
            target_fingerprint: self.target_fingerprint,
            observed_at: self.observed_at,
            expires_at: self.expires_at,
            sequence: self.sequence,
            payload,
            authorization: V2StatusAuthorization {
                schema_version: 1,
                issuer: context.issuer,
                key_id: context.key_id,
                audience: context.audience,
                scope: "status.publish".to_string(),
                nonce: context.nonce,
                signature: String::new(),
            },
            payload_digest,
        };
        let signature = signer
            .sign(
                &envelope.authorization.issuer,
                &envelope.authorization.key_id,
                &envelope.authorization_signing_bytes(),
            )
            .map_err(|_| V2StatusBuildError::SignerUnavailable)?;
        if !is_lower_hex_digest(&signature) {
            return Err(V2StatusBuildError::InvalidSignature);
        }
        envelope.authorization.signature = signature;
        Ok(envelope)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct V2StatusPayload {
    state: V2StatusState,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<V2StatusReason>,
}

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct V2StatusAuthorization {
    schema_version: u16,
    issuer: String,
    key_id: String,
    audience: String,
    scope: String,
    nonce: String,
    signature: String,
}

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct V2StatusEnvelope {
    protocol_version: u16,
    schema_id: String,
    message_kind: String,
    message_id: String,
    target_instance_id: String,
    target_session_id: String,
    target_fingerprint: String,
    observed_at: i64,
    expires_at: i64,
    sequence: u64,
    payload: V2StatusPayload,
    authorization: V2StatusAuthorization,
    #[serde(skip)]
    payload_digest: [u8; 32],
}

impl fmt::Debug for V2StatusEnvelope {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("V2StatusEnvelope")
            .field("state", &self.payload.state)
            .field("target_instance_id", &self.target_instance_id)
            .field("target_session_id", &self.target_session_id)
            .field("authorization", &"[REDACTED]")
            .finish_non_exhaustive()
    }
}

impl V2StatusEnvelope {
    pub fn state(&self) -> V2StatusState {
        self.payload.state
    }

    pub fn sequence(&self) -> u64 {
        self.sequence
    }

    pub fn target_instance_id(&self) -> &str {
        &self.target_instance_id
    }

    pub fn target_session_id(&self) -> &str {
        &self.target_session_id
    }

    pub fn authorization_signing_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::new();
        append(&mut bytes, "domain", b"yeonjang.status.authorization.v2");
        append(&mut bytes, "payload_sha256", &self.payload_digest);
        for (name, value) in [
            ("schema_id", self.schema_id.as_str()),
            ("message_kind", self.message_kind.as_str()),
            ("message_id", self.message_id.as_str()),
            ("target_instance_id", self.target_instance_id.as_str()),
            ("target_session_id", self.target_session_id.as_str()),
            ("target_fingerprint", self.target_fingerprint.as_str()),
            ("authorization_issuer", self.authorization.issuer.as_str()),
            ("authorization_key_id", self.authorization.key_id.as_str()),
            (
                "authorization_audience",
                self.authorization.audience.as_str(),
            ),
            ("authorization_scope", self.authorization.scope.as_str()),
            ("authorization_nonce", self.authorization.nonce.as_str()),
        ] {
            append(&mut bytes, name, value.as_bytes());
        }
        append(
            &mut bytes,
            "protocol_version",
            &self.protocol_version.to_be_bytes(),
        );
        append(&mut bytes, "observed_at", &self.observed_at.to_be_bytes());
        append(&mut bytes, "expires_at", &self.expires_at.to_be_bytes());
        append(&mut bytes, "sequence", &self.sequence.to_be_bytes());
        bytes
    }

    fn validate(&mut self, now_ms: i64, topics: &MqttV2TopicSet) -> Result<(), V2StatusParseError> {
        if self.protocol_version != 2
            || self.schema_id != "yeonjang.status.v2"
            || self.message_kind != "status"
            || !valid_message_identity(&self.message_id)
            || self.target_instance_id != topics.instance_id()
            || self.target_session_id != topics.session_id()
            || !is_sha256_digest(&self.target_fingerprint)
            || self.observed_at <= 0
            || self.observed_at > now_ms
            || self.sequence == 0
        {
            return Err(V2StatusParseError::UnknownOrInvalidField);
        }
        match (self.payload.state, self.payload.reason) {
            (V2StatusState::Online, None)
                if self.expires_at > now_ms
                    && self.expires_at > self.observed_at
                    && self.expires_at.saturating_sub(self.observed_at) <= MAX_ONLINE_TTL_MS => {}
            (V2StatusState::Offline, Some(_)) if self.expires_at == i64::MAX => {}
            _ => return Err(V2StatusParseError::ExpiredOrInvalidLiveness),
        }
        if self.authorization.schema_version != 1
            || self.authorization.issuer != self.target_instance_id
            || self.authorization.audience != self.target_session_id
            || self.authorization.scope != "status.publish"
            || !valid_message_identity(&self.authorization.key_id)
            || !valid_message_identity(&self.authorization.nonce)
            || !is_lower_hex_digest(&self.authorization.signature)
        {
            return Err(V2StatusParseError::AuthorizationMismatch);
        }
        self.payload_digest = Sha256::digest(
            serde_json::to_vec(&self.payload)
                .map_err(|_| V2StatusParseError::UnknownOrInvalidField)?,
        )
        .into();
        Ok(())
    }
}

pub fn parse_v2_status(
    topic: impl AsRef<str>,
    payload: &[u8],
    retained: bool,
    now_ms: i64,
    topics: &MqttV2TopicSet,
) -> Result<V2StatusEnvelope, V2StatusParseError> {
    if topic.as_ref() != topics.status() {
        return Err(V2StatusParseError::TopicMismatch);
    }
    if !retained {
        return Err(V2StatusParseError::NonRetained);
    }
    if payload.is_empty() || payload.len() > MAX_STATUS_BYTES {
        return Err(V2StatusParseError::PayloadSize);
    }
    let mut envelope: V2StatusEnvelope =
        serde_json::from_slice(payload).map_err(|_| V2StatusParseError::UnknownOrInvalidField)?;
    envelope.validate(now_ms, topics)?;
    Ok(envelope)
}

pub trait V2StatusSignatureVerifier: Send + Sync {
    fn verify(&self, issuer: &str, key_id: &str, signing_bytes: &[u8], signature_hex: &str)
    -> bool;
}

pub struct V2StatusAdmission<'a> {
    verifier: &'a dyn V2StatusSignatureVerifier,
}

impl<'a> V2StatusAdmission<'a> {
    pub fn new(verifier: &'a dyn V2StatusSignatureVerifier) -> Self {
        Self { verifier }
    }

    pub fn admit(&self, envelope: &V2StatusEnvelope) -> Result<(), V2StatusAdmissionError> {
        self.verifier
            .verify(
                &envelope.authorization.issuer,
                &envelope.authorization.key_id,
                &envelope.authorization_signing_bytes(),
                &envelope.authorization.signature,
            )
            .then_some(())
            .ok_or(V2StatusAdmissionError::SignatureRejected)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2StatusBuildError {
    InvalidIdentity,
    InvalidOnlineExpiry,
    InvalidOfflineExpiry,
    InvalidStateReason,
    InvalidSigningContext,
    Serialization,
    SignerUnavailable,
    InvalidSignature,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2StatusParseError {
    TopicMismatch,
    NonRetained,
    PayloadSize,
    UnknownOrInvalidField,
    ExpiredOrInvalidLiveness,
    AuthorizationMismatch,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2StatusAdmissionError {
    SignatureRejected,
}

fn append(target: &mut Vec<u8>, name: &str, value: &[u8]) {
    target.extend_from_slice(&(name.len() as u64).to_be_bytes());
    target.extend_from_slice(name.as_bytes());
    target.extend_from_slice(&(value.len() as u64).to_be_bytes());
    target.extend_from_slice(value);
}

fn valid_message_identity(value: &str) -> bool {
    !value.trim().is_empty()
        && value.len() <= 256
        && !value.bytes().any(|byte| byte.is_ascii_control())
}

fn is_sha256_digest(value: &str) -> bool {
    value
        .strip_prefix("sha256:")
        .is_some_and(is_lower_hex_digest)
}

fn is_lower_hex_digest(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}
