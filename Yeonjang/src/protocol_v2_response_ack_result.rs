//! Signed result for a consumer `response.ack` control.

use std::fmt;

use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::protocol_v2_response_ack::V2ResponseAckEnvelope;
use crate::protocol_v2_terminal::{V2ResponseSigner, V2ResponseSigningContext};
use crate::v2_response_ack_use_case::{V2ResponseAckOutcome, V2ResponseAckResult};

#[derive(Clone, PartialEq, Eq, Serialize)]
struct AckResultPayload {
    schema_version: u16,
    receipt_id: String,
    target_request_id: String,
    target_command_id: String,
    target_operation_id: String,
    target_idempotency_key: String,
    terminal_revision: u64,
    response_digest: String,
    outcome: V2ResponseAckOutcome,
    #[serde(skip_serializing_if = "Option::is_none")]
    delivery_revision: Option<u64>,
}

#[derive(Clone, PartialEq, Eq, Serialize)]
struct AckResultAuthorization {
    schema_version: u16,
    issuer: String,
    key_id: String,
    audience: String,
    scope: &'static str,
    requester_id: String,
    request_id: String,
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

#[derive(Clone, PartialEq, Eq, Serialize)]
pub struct V2ResponseAckResultEnvelope {
    protocol_version: u16,
    schema_id: &'static str,
    message_kind: &'static str,
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
    payload: AckResultPayload,
    authorization: AckResultAuthorization,
    #[serde(skip)]
    payload_digest: [u8; 32],
}

impl fmt::Debug for V2ResponseAckResultEnvelope {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("V2ResponseAckResultEnvelope")
            .field("request_id", &self.request_id)
            .field("receipt_id", &self.payload.receipt_id)
            .field("outcome", &self.payload.outcome)
            .field("signature", &"[REDACTED]")
            .finish_non_exhaustive()
    }
}

impl V2ResponseAckResultEnvelope {
    pub fn sign(
        ack: &V2ResponseAckEnvelope,
        result: V2ResponseAckResult,
        context: V2ResponseSigningContext,
        signer: &dyn V2ResponseSigner,
    ) -> Result<Self, V2ResponseAckResultBuildError> {
        if context.message_id.trim().is_empty()
            || context.issuer.trim().is_empty()
            || context.key_id.trim().is_empty()
            || context.nonce.trim().is_empty()
            || context.audience != ack.requester_id()
            || context.issued_at <= 0
            || context.expires_at <= context.issued_at
        {
            return Err(V2ResponseAckResultBuildError::InvalidContext);
        }
        let payload = AckResultPayload {
            schema_version: 1,
            receipt_id: ack.receipt_id().to_string(),
            target_request_id: ack.target_request_id().to_string(),
            target_command_id: ack.target_command_id().to_string(),
            target_operation_id: ack.target_operation_id().to_string(),
            target_idempotency_key: ack.target_idempotency_key().to_string(),
            terminal_revision: ack.terminal_revision(),
            response_digest: ack.response_digest().to_string(),
            outcome: result.outcome(),
            delivery_revision: result.delivery_revision(),
        };
        let payload_digest = Sha256::digest(
            serde_json::to_vec(&payload)
                .map_err(|_| V2ResponseAckResultBuildError::Serialization)?,
        )
        .into();
        let mut envelope = Self {
            protocol_version: 2,
            schema_id: "yeonjang.response-ack-result.v2",
            message_kind: "response",
            message_id: context.message_id,
            request_id: ack.request_id().to_string(),
            command_id: ack.command_id().to_string(),
            operation_id: ack.operation_id().to_string(),
            correlation_id: ack.correlation_id().to_string(),
            causation_id: ack.message_id().to_string(),
            requester_id: ack.requester_id().to_string(),
            target_instance_id: ack.target_instance_id().to_string(),
            target_session_id: ack.target_session_id().to_string(),
            target_fingerprint: ack.target_fingerprint().to_string(),
            idempotency_key: ack.idempotency_key().to_string(),
            issued_at: context.issued_at,
            expires_at: context.expires_at,
            sequence: result
                .delivery_revision()
                .unwrap_or(ack.terminal_revision()),
            payload,
            authorization: AckResultAuthorization {
                schema_version: 1,
                issuer: context.issuer,
                key_id: context.key_id,
                audience: context.audience,
                scope: "response.ack.result",
                requester_id: ack.requester_id().to_string(),
                request_id: ack.request_id().to_string(),
                command_id: ack.command_id().to_string(),
                operation_id: ack.operation_id().to_string(),
                target_instance_id: ack.target_instance_id().to_string(),
                target_session_id: ack.target_session_id().to_string(),
                target_fingerprint: ack.target_fingerprint().to_string(),
                idempotency_key: ack.idempotency_key().to_string(),
                expires_at: context.expires_at,
                nonce: context.nonce,
                signature: String::new(),
            },
            payload_digest,
        };
        let signature = signer
            .sign(
                &envelope.authorization.issuer,
                &envelope.authorization.key_id,
                &envelope.signing_bytes(),
            )
            .map_err(|_| V2ResponseAckResultBuildError::SignerUnavailable)?;
        if signature.len() != 64 || !signature.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err(V2ResponseAckResultBuildError::InvalidSignature);
        }
        envelope.authorization.signature = signature;
        Ok(envelope)
    }

    fn signing_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::new();
        append_text(
            &mut bytes,
            "domain",
            "yeonjang.response-ack-result.authorization.v2",
        );
        append_bytes(&mut bytes, "payload_sha256", &self.payload_digest);
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
            ("authorization_issuer", self.authorization.issuer.as_str()),
            ("authorization_key_id", self.authorization.key_id.as_str()),
            (
                "authorization_audience",
                self.authorization.audience.as_str(),
            ),
            ("authorization_scope", self.authorization.scope),
            ("authorization_nonce", self.authorization.nonce.as_str()),
        ] {
            append_text(&mut bytes, name, value);
        }
        append_i64(&mut bytes, "issued_at", self.issued_at);
        append_i64(&mut bytes, "expires_at", self.expires_at);
        append_u64(&mut bytes, "sequence", self.sequence);
        bytes
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2ResponseAckResultBuildError {
    InvalidContext,
    Serialization,
    SignerUnavailable,
    InvalidSignature,
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
fn append_i64(output: &mut Vec<u8>, name: &str, value: i64) {
    append_bytes(output, name, &value.to_be_bytes());
}
fn append_u64(output: &mut Vec<u8>, name: &str, value: u64) {
    append_bytes(output, name, &value.to_be_bytes());
}
