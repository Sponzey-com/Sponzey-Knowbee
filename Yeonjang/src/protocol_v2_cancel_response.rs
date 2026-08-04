//! Signed v2 response contract for a non-terminal cancellation acknowledgement.

use std::fmt;

use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::mqtt_v2_topics::validate_identifier;
use crate::protocol_v2_terminal::{
    V2ResponseSigner, V2ResponseSignerError, V2ResponseSigningContext,
};
use crate::v2_cancel_use_case::{V2CancelAcknowledgement, V2CancelOutcome};

const PROTOCOL_VERSION: u16 = 2;
const SCHEMA_ID: &str = "yeonjang.cancel-ack.v2";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
struct V2CancelAckPayload {
    target_request_id: String,
    target_command_id: String,
    target_operation_id: String,
    target_idempotency_key: String,
    cancellation_id: String,
    outcome: V2CancelOutcome,
    target_terminal: bool,
}

#[derive(Clone, PartialEq, Eq, Serialize)]
struct V2CancelResponseAuthorization {
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

/// Signed response for the cancel request; it is not the target command terminal.
#[derive(Clone, PartialEq, Eq, Serialize)]
pub struct V2CancelResponseEnvelope {
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
    payload: V2CancelAckPayload,
    authorization: V2CancelResponseAuthorization,
    #[serde(skip)]
    payload_digest: [u8; 32],
}

impl fmt::Debug for V2CancelResponseEnvelope {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("V2CancelResponseEnvelope")
            .field("message_id", &self.message_id)
            .field("request_id", &self.request_id)
            .field("command_id", &self.command_id)
            .field("signature", &"[REDACTED]")
            .finish_non_exhaustive()
    }
}

impl V2CancelResponseEnvelope {
    pub fn sign(
        acknowledgement: V2CancelAcknowledgement,
        context: V2ResponseSigningContext,
        signer: &dyn V2ResponseSigner,
    ) -> Result<Self, V2CancelResponseError> {
        validate_context(&context, &acknowledgement)?;
        let payload = V2CancelAckPayload {
            target_request_id: acknowledgement.target_request_id().to_string(),
            target_command_id: acknowledgement.target_command_id().to_string(),
            target_operation_id: acknowledgement.target_operation_id().to_string(),
            target_idempotency_key: acknowledgement.target_idempotency_key().to_string(),
            cancellation_id: acknowledgement.cancellation_id().to_string(),
            outcome: acknowledgement.outcome(),
            target_terminal: acknowledgement.target_terminal(),
        };
        let payload_digest = Sha256::digest(
            serde_json::to_vec(&payload).map_err(|_| V2CancelResponseError::Serialization)?,
        )
        .into();
        let mut envelope = Self {
            protocol_version: PROTOCOL_VERSION,
            schema_id: SCHEMA_ID,
            message_kind: "response",
            message_id: context.message_id,
            request_id: acknowledgement.request_id().to_string(),
            command_id: acknowledgement.command_id().to_string(),
            operation_id: acknowledgement.operation_id().to_string(),
            correlation_id: acknowledgement.correlation_id().to_string(),
            causation_id: acknowledgement.causation_id().to_string(),
            requester_id: acknowledgement.requester_id().to_string(),
            target_instance_id: acknowledgement.target_instance_id().to_string(),
            target_session_id: acknowledgement.target_session_id().to_string(),
            target_fingerprint: acknowledgement.target_fingerprint().to_string(),
            idempotency_key: acknowledgement.idempotency_key().to_string(),
            issued_at: context.issued_at,
            expires_at: context.expires_at,
            sequence: 1,
            authorization: V2CancelResponseAuthorization {
                schema_version: 1,
                issuer: context.issuer,
                key_id: context.key_id,
                audience: context.audience,
                scope: "response.publish",
                requester_id: acknowledgement.requester_id().to_string(),
                request_id: acknowledgement.request_id().to_string(),
                command_id: acknowledgement.command_id().to_string(),
                operation_id: acknowledgement.operation_id().to_string(),
                target_instance_id: acknowledgement.target_instance_id().to_string(),
                target_session_id: acknowledgement.target_session_id().to_string(),
                target_fingerprint: acknowledgement.target_fingerprint().to_string(),
                idempotency_key: acknowledgement.idempotency_key().to_string(),
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
            .map_err(map_signer_error)?;
        if !is_hex_digest(&signature) {
            return Err(V2CancelResponseError::InvalidSignature);
        }
        envelope.authorization.signature = signature;
        Ok(envelope)
    }

    pub fn authorization_signing_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::new();
        append_text(&mut bytes, "domain", "yeonjang.cancel-ack.authorization.v2");
        append_u64(
            &mut bytes,
            "protocol_version",
            u64::from(self.protocol_version),
        );
        append_text(&mut bytes, "schema_id", self.schema_id);
        append_text(&mut bytes, "message_kind", self.message_kind);
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
        append_bytes(&mut bytes, "payload_sha256", &self.payload_digest);
        let authorization = &self.authorization;
        append_u64(
            &mut bytes,
            "authorization_schema_version",
            u64::from(authorization.schema_version),
        );
        append_text(&mut bytes, "authorization_scope", authorization.scope);
        for (name, value) in [
            ("authorization_issuer", &authorization.issuer),
            ("authorization_key_id", &authorization.key_id),
            ("authorization_audience", &authorization.audience),
            ("authorization_requester_id", &authorization.requester_id),
            ("authorization_request_id", &authorization.request_id),
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
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2CancelResponseError {
    InvalidIdentity,
    IdentityMismatch,
    InvalidTiming,
    Serialization,
    SignerUnavailable,
    InvalidSignature,
}

fn validate_context(
    context: &V2ResponseSigningContext,
    acknowledgement: &V2CancelAcknowledgement,
) -> Result<(), V2CancelResponseError> {
    for value in [
        context.message_id.as_str(),
        context.issuer.as_str(),
        context.key_id.as_str(),
        context.audience.as_str(),
        context.nonce.as_str(),
    ] {
        validate_identifier(value).map_err(|_| V2CancelResponseError::InvalidIdentity)?;
    }
    if context.audience != acknowledgement.requester_id() {
        return Err(V2CancelResponseError::IdentityMismatch);
    }
    if context.issued_at < 0 || context.expires_at <= context.issued_at {
        return Err(V2CancelResponseError::InvalidTiming);
    }
    Ok(())
}

fn map_signer_error(_: V2ResponseSignerError) -> V2CancelResponseError {
    V2CancelResponseError::SignerUnavailable
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
