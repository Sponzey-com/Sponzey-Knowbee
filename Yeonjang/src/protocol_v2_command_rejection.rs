//! Signed response for a command rejected before an exact operation is bound.
//!
//! Rejected input is untrusted, so this DTO never reconstructs request,
//! command, operation, or idempotency identities from it. The exact configured
//! MQTT topic identity and a bounded SHA-256 correlation are the only bindings.

use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::mqtt_v2_topics::{MqttV2TopicSet, validate_identifier};
use crate::platform_execution::ExecutionFailure;
use crate::protocol_v2_terminal::{V2ResponseSigner, V2ResponseSigningContext};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
struct V2CommandRejectionPayload {
    failure: ExecutionFailure,
}

#[derive(Clone, PartialEq, Eq, Serialize)]
struct V2CommandRejectionAuthorization {
    schema_version: u16,
    issuer: String,
    key_id: String,
    audience: String,
    scope: &'static str,
    requester_id: String,
    target_instance_id: String,
    target_session_id: String,
    correlation_id: String,
    expires_at: i64,
    nonce: String,
    signature: String,
}

#[derive(Clone, PartialEq, Eq, Serialize)]
pub struct V2CommandRejectionEnvelope {
    protocol_version: u16,
    schema_id: &'static str,
    message_kind: &'static str,
    message_id: String,
    correlation_id: String,
    requester_id: String,
    target_instance_id: String,
    target_session_id: String,
    issued_at: i64,
    expires_at: i64,
    payload: V2CommandRejectionPayload,
    authorization: V2CommandRejectionAuthorization,
    #[serde(skip)]
    payload_digest: [u8; 32],
}

impl V2CommandRejectionEnvelope {
    pub fn sign(
        failure: ExecutionFailure,
        topics: &MqttV2TopicSet,
        context: V2ResponseSigningContext,
        signer: &dyn V2ResponseSigner,
    ) -> Result<Self, V2CommandRejectionBuildError> {
        if context.issuer != topics.instance_id()
            || context.audience != topics.requester_id()
            || context.issued_at < 0
            || context.expires_at <= context.issued_at
        {
            return Err(V2CommandRejectionBuildError::IdentityOrTiming);
        }
        for identity in [
            context.message_id.as_str(),
            context.issuer.as_str(),
            context.key_id.as_str(),
            context.audience.as_str(),
            context.nonce.as_str(),
        ] {
            validate_identifier(identity)
                .map_err(|_| V2CommandRejectionBuildError::IdentityOrTiming)?;
        }
        let correlation_id = failure.correlation_id().to_string();
        let payload = V2CommandRejectionPayload { failure };
        let payload_digest = Sha256::digest(
            serde_json::to_vec(&payload)
                .map_err(|_| V2CommandRejectionBuildError::Serialization)?,
        )
        .into();
        let mut envelope = Self {
            protocol_version: 2,
            schema_id: "yeonjang.command-rejection.v2",
            message_kind: "response",
            message_id: context.message_id,
            correlation_id: correlation_id.clone(),
            requester_id: topics.requester_id().to_string(),
            target_instance_id: topics.instance_id().to_string(),
            target_session_id: topics.session_id().to_string(),
            issued_at: context.issued_at,
            expires_at: context.expires_at,
            authorization: V2CommandRejectionAuthorization {
                schema_version: 1,
                issuer: context.issuer,
                key_id: context.key_id,
                audience: context.audience,
                scope: "response.publish",
                requester_id: topics.requester_id().to_string(),
                target_instance_id: topics.instance_id().to_string(),
                target_session_id: topics.session_id().to_string(),
                correlation_id,
                expires_at: context.expires_at,
                nonce: context.nonce,
                signature: String::new(),
            },
            payload,
            payload_digest,
        };
        let signature = signer
            .sign(
                &envelope.authorization.issuer,
                &envelope.authorization.key_id,
                &envelope.authorization_signing_bytes(),
            )
            .map_err(|_| V2CommandRejectionBuildError::SignerUnavailable)?;
        if !is_lower_hex_digest(&signature) {
            return Err(V2CommandRejectionBuildError::InvalidSignature);
        }
        envelope.authorization.signature = signature;
        Ok(envelope)
    }

    pub fn authorization_signing_bytes(&self) -> Vec<u8> {
        let authorization = &self.authorization;
        let mut bytes = Vec::new();
        append_text(
            &mut bytes,
            "domain",
            "yeonjang.command-rejection.authorization.v2",
        );
        append_bytes(&mut bytes, "payload_sha256", &self.payload_digest);
        for (name, value) in [
            ("schema_id", self.schema_id),
            ("message_kind", self.message_kind),
            ("message_id", self.message_id.as_str()),
            ("correlation_id", self.correlation_id.as_str()),
            ("requester_id", self.requester_id.as_str()),
            ("target_instance_id", self.target_instance_id.as_str()),
            ("target_session_id", self.target_session_id.as_str()),
            ("authorization_issuer", authorization.issuer.as_str()),
            ("authorization_key_id", authorization.key_id.as_str()),
            ("authorization_audience", authorization.audience.as_str()),
            ("authorization_scope", authorization.scope),
            (
                "authorization_requester_id",
                authorization.requester_id.as_str(),
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
                "authorization_correlation_id",
                authorization.correlation_id.as_str(),
            ),
            ("authorization_nonce", authorization.nonce.as_str()),
        ] {
            append_text(&mut bytes, name, value);
        }
        append_u64(
            &mut bytes,
            "protocol_version",
            u64::from(self.protocol_version),
        );
        append_u64(
            &mut bytes,
            "authorization_schema_version",
            u64::from(authorization.schema_version),
        );
        for (name, value) in [
            ("issued_at", self.issued_at),
            ("expires_at", self.expires_at),
            ("authorization_expires_at", authorization.expires_at),
        ] {
            append_i64(&mut bytes, name, value);
        }
        bytes
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2CommandRejectionBuildError {
    IdentityOrTiming,
    Serialization,
    SignerUnavailable,
    InvalidSignature,
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
