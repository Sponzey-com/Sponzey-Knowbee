//! Signed response projection for a read-only v2 receipt query.

use std::fmt;

use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::protocol_v2_receipt_query::V2ReceiptQueryEnvelope;
use crate::protocol_v2_terminal::{
    V2ResponseSigner, V2ResponseSigningContext, V2TerminalResponseContent,
};
use crate::v2_receipt_query_use_case::{V2ReceiptLookupOutcome, V2ReceiptQueryResult};

const PROTOCOL_VERSION: u16 = 2;
const RESPONSE_SCHEMA_ID: &str = "yeonjang.receipt-response.v2";

#[derive(Clone, PartialEq, Eq, Serialize)]
struct V2ReceiptResponsePayload {
    schema_version: u16,
    outcome: V2ReceiptLookupOutcome,
    target_request_id: String,
    target_command_id: String,
    target_operation_id: String,
    target_idempotency_key: String,
    target_scope_digest: String,
    expected_terminal_revision: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    terminal: Option<Box<V2TerminalResponseContent>>,
}

#[derive(Clone, PartialEq, Eq, Serialize)]
struct V2ReceiptResponseAuthorization {
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
pub struct V2ReceiptResponseEnvelope {
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
    payload: V2ReceiptResponsePayload,
    authorization: V2ReceiptResponseAuthorization,
    #[serde(skip)]
    payload_digest: [u8; 32],
}

impl fmt::Debug for V2ReceiptResponseEnvelope {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("V2ReceiptResponseEnvelope")
            .field("request_id", &self.request_id)
            .field("target_request_id", &self.payload.target_request_id)
            .field("outcome", &self.payload.outcome)
            .field("signature", &"[REDACTED]")
            .finish_non_exhaustive()
    }
}

impl V2ReceiptResponseEnvelope {
    pub fn sign(
        query: &V2ReceiptQueryEnvelope,
        result: V2ReceiptQueryResult,
        context: V2ResponseSigningContext,
        signer: &dyn V2ResponseSigner,
    ) -> Result<Self, V2ReceiptResponseBuildError> {
        validate_context(query, &context)?;
        let payload = V2ReceiptResponsePayload {
            schema_version: 1,
            outcome: result.outcome(),
            target_request_id: query.target_request_id().to_string(),
            target_command_id: query.target_command_id().to_string(),
            target_operation_id: query.target_operation_id().to_string(),
            target_idempotency_key: query.target_idempotency_key().to_string(),
            target_scope_digest: query.target_scope_digest().to_string(),
            expected_terminal_revision: query.expected_terminal_revision(),
            terminal: result.terminal().cloned().map(Box::new),
        };
        let payload_digest = Sha256::digest(
            serde_json::to_vec(&payload).map_err(|_| V2ReceiptResponseBuildError::Serialization)?,
        )
        .into();
        let mut envelope = Self {
            protocol_version: PROTOCOL_VERSION,
            schema_id: RESPONSE_SCHEMA_ID,
            message_kind: "response",
            message_id: context.message_id,
            request_id: query.request_id().to_string(),
            command_id: query.command_id().to_string(),
            operation_id: query.operation_id().to_string(),
            correlation_id: query.correlation_id().to_string(),
            causation_id: query.message_id().to_string(),
            requester_id: query.requester_id().to_string(),
            target_instance_id: query.target_instance_id().to_string(),
            target_session_id: query.target_session_id().to_string(),
            target_fingerprint: query.target_fingerprint().to_string(),
            idempotency_key: query.idempotency_key().to_string(),
            issued_at: context.issued_at,
            expires_at: context.expires_at,
            sequence: query.expected_terminal_revision(),
            payload,
            authorization: V2ReceiptResponseAuthorization {
                schema_version: 1,
                issuer: context.issuer,
                key_id: context.key_id,
                audience: context.audience,
                scope: "receipt.response",
                requester_id: query.requester_id().to_string(),
                request_id: query.request_id().to_string(),
                command_id: query.command_id().to_string(),
                operation_id: query.operation_id().to_string(),
                target_instance_id: query.target_instance_id().to_string(),
                target_session_id: query.target_session_id().to_string(),
                target_fingerprint: query.target_fingerprint().to_string(),
                idempotency_key: query.idempotency_key().to_string(),
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
                &envelope.authorization_signing_bytes(),
            )
            .map_err(|_| V2ReceiptResponseBuildError::SignerUnavailable)?;
        if !is_hex_digest(&signature) {
            return Err(V2ReceiptResponseBuildError::InvalidSignature);
        }
        envelope.authorization.signature = signature;
        Ok(envelope)
    }

    fn authorization_signing_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::new();
        append_text(
            &mut bytes,
            "domain",
            "yeonjang.receipt-response.authorization.v2",
        );
        append_u64(
            &mut bytes,
            "protocol_version",
            u64::from(self.protocol_version),
        );
        append_text(&mut bytes, "schema_id", self.schema_id);
        append_text(&mut bytes, "message_kind", self.message_kind);
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
        ] {
            append_text(&mut bytes, name, value);
        }
        append_i64(&mut bytes, "issued_at", self.issued_at);
        append_i64(&mut bytes, "expires_at", self.expires_at);
        append_u64(&mut bytes, "sequence", self.sequence);
        for (name, value) in [
            ("authorization_issuer", self.authorization.issuer.as_str()),
            ("authorization_key_id", self.authorization.key_id.as_str()),
            (
                "authorization_audience",
                self.authorization.audience.as_str(),
            ),
            ("authorization_scope", self.authorization.scope),
            (
                "authorization_requester_id",
                self.authorization.requester_id.as_str(),
            ),
            (
                "authorization_request_id",
                self.authorization.request_id.as_str(),
            ),
            (
                "authorization_command_id",
                self.authorization.command_id.as_str(),
            ),
            (
                "authorization_operation_id",
                self.authorization.operation_id.as_str(),
            ),
            (
                "authorization_target_instance_id",
                self.authorization.target_instance_id.as_str(),
            ),
            (
                "authorization_target_session_id",
                self.authorization.target_session_id.as_str(),
            ),
            (
                "authorization_target_fingerprint",
                self.authorization.target_fingerprint.as_str(),
            ),
            (
                "authorization_idempotency_key",
                self.authorization.idempotency_key.as_str(),
            ),
        ] {
            append_text(&mut bytes, name, value);
        }
        append_i64(
            &mut bytes,
            "authorization_expires_at",
            self.authorization.expires_at,
        );
        append_text(&mut bytes, "authorization_nonce", &self.authorization.nonce);
        bytes
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2ReceiptResponseBuildError {
    InvalidContext,
    Serialization,
    SignerUnavailable,
    InvalidSignature,
}

fn validate_context(
    query: &V2ReceiptQueryEnvelope,
    context: &V2ResponseSigningContext,
) -> Result<(), V2ReceiptResponseBuildError> {
    if context.message_id.trim().is_empty()
        || context.issuer.trim().is_empty()
        || context.key_id.trim().is_empty()
        || context.nonce.trim().is_empty()
        || context.audience != query.requester_id()
        || context.issued_at <= 0
        || context.expires_at <= context.issued_at
    {
        return Err(V2ReceiptResponseBuildError::InvalidContext);
    }
    Ok(())
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
