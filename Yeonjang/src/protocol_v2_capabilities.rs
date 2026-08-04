//! Strict signed MQTT v2 retained capability projection.

use std::fmt;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::mqtt_v2_capability_projection::{V2CapabilityProjection, V2ImplementationStatus};
use crate::mqtt_v2_topics::{MqttV2TopicSet, validate_identifier};
use crate::protocol_v2_terminal::{V2ResponseSigner, V2ResponseSigningContext};

const MAX_CAPABILITIES_BYTES: usize = 65_536;
const MAX_CAPABILITIES_TTL_MS: i64 = 5 * 60_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct V2CapabilitiesIdentity {
    target_instance_id: String,
    target_session_id: String,
    target_fingerprint: String,
}

impl V2CapabilitiesIdentity {
    pub fn new(
        target_instance_id: &str,
        target_session_id: &str,
        target_fingerprint: &str,
    ) -> Result<Self, V2CapabilitiesBuildError> {
        validate_identifier(target_instance_id)
            .map_err(|_| V2CapabilitiesBuildError::InvalidIdentity)?;
        validate_identifier(target_session_id)
            .map_err(|_| V2CapabilitiesBuildError::InvalidIdentity)?;
        if !is_sha256_digest(target_fingerprint) {
            return Err(V2CapabilitiesBuildError::InvalidIdentity);
        }
        Ok(Self {
            target_instance_id: target_instance_id.to_string(),
            target_session_id: target_session_id.to_string(),
            target_fingerprint: target_fingerprint.to_string(),
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct V2CapabilitiesSnapshot {
    identity: V2CapabilitiesIdentity,
    projection: V2CapabilityProjection,
    observed_at: i64,
    expires_at: i64,
    sequence: u64,
}

impl V2CapabilitiesSnapshot {
    pub fn new(
        identity: V2CapabilitiesIdentity,
        projection: V2CapabilityProjection,
        observed_at: i64,
        expires_at: i64,
        sequence: u64,
    ) -> Result<Self, V2CapabilitiesBuildError> {
        if observed_at <= 0
            || expires_at <= observed_at
            || expires_at.saturating_sub(observed_at) > MAX_CAPABILITIES_TTL_MS
            || sequence == 0
            || !valid_projection(&projection)
        {
            return Err(V2CapabilitiesBuildError::InvalidProjection);
        }
        Ok(Self {
            identity,
            projection,
            observed_at,
            expires_at,
            sequence,
        })
    }

    pub fn sign(
        self,
        context: V2ResponseSigningContext,
        signer: &dyn V2ResponseSigner,
    ) -> Result<V2CapabilitiesEnvelope, V2CapabilitiesBuildError> {
        if context.issuer != self.identity.target_instance_id
            || context.audience != self.identity.target_session_id
            || context.issued_at != self.observed_at
            || context.expires_at != self.expires_at
            || !valid_text(&context.message_id)
            || !valid_text(&context.key_id)
            || !valid_text(&context.nonce)
        {
            return Err(V2CapabilitiesBuildError::InvalidSigningContext);
        }
        let payload_digest = Sha256::digest(
            serde_json::to_vec(&self.projection)
                .map_err(|_| V2CapabilitiesBuildError::Serialization)?,
        )
        .into();
        let mut envelope = V2CapabilitiesEnvelope {
            protocol_version: 2,
            schema_id: "yeonjang.capabilities.v2".to_string(),
            message_kind: "capabilities".to_string(),
            message_id: context.message_id,
            target_instance_id: self.identity.target_instance_id,
            target_session_id: self.identity.target_session_id,
            target_fingerprint: self.identity.target_fingerprint,
            observed_at: self.observed_at,
            expires_at: self.expires_at,
            sequence: self.sequence,
            payload: self.projection,
            authorization: V2CapabilitiesAuthorization {
                schema_version: 1,
                issuer: context.issuer,
                key_id: context.key_id,
                audience: context.audience,
                scope: "capabilities.publish".to_string(),
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
            .map_err(|_| V2CapabilitiesBuildError::SignerUnavailable)?;
        if !is_lower_hex_digest(&signature) {
            return Err(V2CapabilitiesBuildError::InvalidSignature);
        }
        envelope.authorization.signature = signature;
        Ok(envelope)
    }
}

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct V2CapabilitiesAuthorization {
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
pub struct V2CapabilitiesEnvelope {
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
    payload: V2CapabilityProjection,
    authorization: V2CapabilitiesAuthorization,
    #[serde(skip)]
    payload_digest: [u8; 32],
}

impl fmt::Debug for V2CapabilitiesEnvelope {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("V2CapabilitiesEnvelope")
            .field("target_instance_id", &self.target_instance_id)
            .field("target_session_id", &self.target_session_id)
            .field("policy_revision", &self.payload.policy_revision)
            .field("authorization", &"[REDACTED]")
            .finish_non_exhaustive()
    }
}

impl V2CapabilitiesEnvelope {
    pub fn projection(&self) -> &V2CapabilityProjection {
        &self.payload
    }

    pub fn authorization_signing_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::new();
        append(
            &mut bytes,
            "domain",
            b"yeonjang.capabilities.authorization.v2",
        );
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

    fn validate(
        &mut self,
        now_ms: i64,
        topics: &MqttV2TopicSet,
    ) -> Result<(), V2CapabilitiesParseError> {
        if self.protocol_version != 2
            || self.schema_id != "yeonjang.capabilities.v2"
            || self.message_kind != "capabilities"
            || !valid_text(&self.message_id)
            || self.target_instance_id != topics.instance_id()
            || self.target_session_id != topics.session_id()
            || !is_sha256_digest(&self.target_fingerprint)
            || self.observed_at <= 0
            || self.observed_at > now_ms
            || self.expires_at <= now_ms
            || self.expires_at <= self.observed_at
            || self.expires_at.saturating_sub(self.observed_at) > MAX_CAPABILITIES_TTL_MS
            || self.sequence == 0
            || !valid_projection(&self.payload)
        {
            return Err(if self.expires_at <= now_ms {
                V2CapabilitiesParseError::Expired
            } else {
                V2CapabilitiesParseError::UnknownOrInvalidField
            });
        }
        if self.authorization.schema_version != 1
            || self.authorization.issuer != self.target_instance_id
            || self.authorization.audience != self.target_session_id
            || self.authorization.scope != "capabilities.publish"
            || !valid_text(&self.authorization.key_id)
            || !valid_text(&self.authorization.nonce)
            || !is_lower_hex_digest(&self.authorization.signature)
        {
            return Err(V2CapabilitiesParseError::AuthorizationMismatch);
        }
        self.payload_digest = Sha256::digest(
            serde_json::to_vec(&self.payload)
                .map_err(|_| V2CapabilitiesParseError::UnknownOrInvalidField)?,
        )
        .into();
        Ok(())
    }
}

pub fn parse_v2_capabilities(
    topic: impl AsRef<str>,
    payload: &[u8],
    retained: bool,
    now_ms: i64,
    topics: &MqttV2TopicSet,
) -> Result<V2CapabilitiesEnvelope, V2CapabilitiesParseError> {
    if topic.as_ref() != topics.capabilities() {
        return Err(V2CapabilitiesParseError::TopicMismatch);
    }
    if !retained {
        return Err(V2CapabilitiesParseError::NonRetained);
    }
    if payload.is_empty() || payload.len() > MAX_CAPABILITIES_BYTES {
        return Err(V2CapabilitiesParseError::PayloadSize);
    }
    let mut envelope: V2CapabilitiesEnvelope = serde_json::from_slice(payload)
        .map_err(|_| V2CapabilitiesParseError::UnknownOrInvalidField)?;
    envelope.validate(now_ms, topics)?;
    Ok(envelope)
}

pub trait V2CapabilitiesSignatureVerifier: Send + Sync {
    fn verify(&self, issuer: &str, key_id: &str, signing_bytes: &[u8], signature_hex: &str)
    -> bool;
}

pub struct V2CapabilitiesAdmission<'a> {
    verifier: &'a dyn V2CapabilitiesSignatureVerifier,
}

impl<'a> V2CapabilitiesAdmission<'a> {
    pub fn new(verifier: &'a dyn V2CapabilitiesSignatureVerifier) -> Self {
        Self { verifier }
    }

    pub fn admit(
        &self,
        envelope: &V2CapabilitiesEnvelope,
    ) -> Result<(), V2CapabilitiesAdmissionError> {
        self.verifier
            .verify(
                &envelope.authorization.issuer,
                &envelope.authorization.key_id,
                &envelope.authorization_signing_bytes(),
                &envelope.authorization.signature,
            )
            .then_some(())
            .ok_or(V2CapabilitiesAdmissionError::SignatureRejected)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2CapabilitiesBuildError {
    InvalidIdentity,
    InvalidProjection,
    InvalidSigningContext,
    Serialization,
    SignerUnavailable,
    InvalidSignature,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2CapabilitiesParseError {
    TopicMismatch,
    NonRetained,
    PayloadSize,
    Expired,
    UnknownOrInvalidField,
    AuthorizationMismatch,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2CapabilitiesAdmissionError {
    SignatureRejected,
}

fn valid_projection(projection: &V2CapabilityProjection) -> bool {
    if projection.capabilities.len() != 2
        || projection.capabilities[0].method != "camera.capture"
        || projection.capabilities[1].method != "screen.capture"
    {
        return false;
    }
    let executable = projection
        .capabilities
        .iter()
        .filter(|row| row.implementation_status == V2ImplementationStatus::Executable)
        .map(|row| row.method.clone())
        .collect::<Vec<_>>();
    executable == projection.advertised_methods
        && projection.capabilities.iter().all(|row| {
            row.authorization_scope == "effect.execute"
                && row.cancellable
                && row.post_check_required
                && row.artifact_delivery == "mqtt.fetch_ack"
                && row.platform_available
                    == (row.implementation_status == V2ImplementationStatus::Executable)
        })
}

fn append(target: &mut Vec<u8>, name: &str, value: &[u8]) {
    target.extend_from_slice(&(name.len() as u64).to_be_bytes());
    target.extend_from_slice(name.as_bytes());
    target.extend_from_slice(&(value.len() as u64).to_be_bytes());
    target.extend_from_slice(value);
}

fn valid_text(value: &str) -> bool {
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
