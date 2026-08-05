//! Signed v2 failure result for one admitted artifact fetch.
//!
//! Chunk bytes remain on the artifact chunk route. This response is emitted
//! only after the fetch envelope passed structural and authorization admission
//! but the Application use case could not prepare the exact transfer.

use std::fmt;

use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::artifact_transfer_use_case::ArtifactTransferReject;
use crate::mqtt_v2_topics::validate_identifier;
use crate::protocol_v2_artifact::V2ArtifactEnvelope;
use crate::protocol_v2_terminal::{
    V2ResponseSigner, V2ResponseSignerError, V2ResponseSigningContext,
};

const PROTOCOL_VERSION: u16 = 2;
const SCHEMA_ID: &str = "yeonjang.artifact-fetch-result.v2";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
enum V2ArtifactFetchOutcome {
    Rejected,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
enum V2ArtifactFetchRejectReason {
    Missing,
    WrongOwner,
    WrongTransfer,
    RevisionConflict,
    DigestMismatch,
    InvalidState,
    Expired,
    SourceUnavailable,
    VerificationFailed,
    StorageConflict,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
struct V2ArtifactFetchResultPayload {
    artifact_ref: String,
    owner_request_id: String,
    owner_operation_id: String,
    transfer_id: String,
    observed_revision: u64,
    outcome: V2ArtifactFetchOutcome,
    reason: V2ArtifactFetchRejectReason,
}

#[derive(Clone, PartialEq, Eq, Serialize)]
struct V2ArtifactFetchResponseAuthorization {
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
pub struct V2ArtifactFetchResponseEnvelope {
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
    payload: V2ArtifactFetchResultPayload,
    authorization: V2ArtifactFetchResponseAuthorization,
    #[serde(skip)]
    payload_digest: [u8; 32],
}

impl fmt::Debug for V2ArtifactFetchResponseEnvelope {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("V2ArtifactFetchResponseEnvelope")
            .field("request_id", &self.request_id)
            .field("artifact_ref", &self.payload.artifact_ref)
            .field("transfer_id", &self.payload.transfer_id)
            .field("reason", &self.payload.reason)
            .field("signature", &"[REDACTED]")
            .finish_non_exhaustive()
    }
}

impl V2ArtifactFetchResponseEnvelope {
    pub fn sign_rejection(
        request: &V2ArtifactEnvelope,
        reason: ArtifactTransferReject,
        context: V2ResponseSigningContext,
        signer: &dyn V2ResponseSigner,
    ) -> Result<Self, V2ArtifactFetchResponseError> {
        validate_context(request, &context)?;
        let payload = V2ArtifactFetchResultPayload {
            artifact_ref: request.artifact_ref().to_string(),
            owner_request_id: request.owner_request_id().to_string(),
            owner_operation_id: request.owner_operation_id().to_string(),
            transfer_id: request.transfer_id().to_string(),
            observed_revision: request.expected_revision(),
            outcome: V2ArtifactFetchOutcome::Rejected,
            reason: map_rejection(reason),
        };
        let payload_digest = Sha256::digest(
            serde_json::to_vec(&payload)
                .map_err(|_| V2ArtifactFetchResponseError::Serialization)?,
        )
        .into();
        let mut response = Self {
            protocol_version: PROTOCOL_VERSION,
            schema_id: SCHEMA_ID,
            message_kind: "response",
            message_id: context.message_id,
            request_id: request.request_id().to_string(),
            command_id: request.command_id().to_string(),
            operation_id: request.operation_id().to_string(),
            correlation_id: request.correlation_id().to_string(),
            causation_id: request.message_id().to_string(),
            requester_id: request.requester_id().to_string(),
            target_instance_id: request.target_instance_id().to_string(),
            target_session_id: request.target_session_id().to_string(),
            target_fingerprint: request.target_fingerprint().to_string(),
            idempotency_key: request.idempotency_key().to_string(),
            issued_at: context.issued_at,
            expires_at: context.expires_at,
            sequence: 1,
            authorization: V2ArtifactFetchResponseAuthorization {
                schema_version: 1,
                issuer: context.issuer,
                key_id: context.key_id,
                audience: context.audience,
                scope: "response.publish",
                requester_id: request.requester_id().to_string(),
                request_id: request.request_id().to_string(),
                command_id: request.command_id().to_string(),
                operation_id: request.operation_id().to_string(),
                target_instance_id: request.target_instance_id().to_string(),
                target_session_id: request.target_session_id().to_string(),
                target_fingerprint: request.target_fingerprint().to_string(),
                idempotency_key: request.idempotency_key().to_string(),
                expires_at: context.expires_at,
                nonce: context.nonce,
                signature: String::new(),
            },
            payload,
            payload_digest,
        };
        let signature = signer
            .sign(
                &response.authorization.issuer,
                &response.authorization.key_id,
                &response.authorization_signing_bytes(),
            )
            .map_err(map_signer_error)?;
        if !is_hex_digest(&signature) {
            return Err(V2ArtifactFetchResponseError::InvalidSignature);
        }
        response.authorization.signature = signature;
        Ok(response)
    }

    pub fn authorization_signing_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::new();
        append_text(
            &mut bytes,
            "domain",
            "yeonjang.artifact-fetch-result.authorization.v2",
        );
        append_u64(
            &mut bytes,
            "protocol_version",
            u64::from(self.protocol_version),
        );
        for (name, value) in [
            ("schema_id", self.schema_id),
            ("message_kind", self.message_kind),
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
        append_bytes(&mut bytes, "payload_sha256", &self.payload_digest);
        let authorization = &self.authorization;
        append_u64(
            &mut bytes,
            "authorization_schema_version",
            u64::from(authorization.schema_version),
        );
        for (name, value) in [
            ("authorization_issuer", authorization.issuer.as_str()),
            ("authorization_key_id", authorization.key_id.as_str()),
            ("authorization_audience", authorization.audience.as_str()),
            ("authorization_scope", authorization.scope),
            (
                "authorization_requester_id",
                authorization.requester_id.as_str(),
            ),
            (
                "authorization_request_id",
                authorization.request_id.as_str(),
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
            ("authorization_nonce", authorization.nonce.as_str()),
        ] {
            append_text(&mut bytes, name, value);
        }
        append_i64(
            &mut bytes,
            "authorization_expires_at",
            authorization.expires_at,
        );
        bytes
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2ArtifactFetchResponseError {
    InvalidIdentity,
    IdentityMismatch,
    InvalidTiming,
    Serialization,
    SignerUnavailable,
    InvalidSignature,
}

fn validate_context(
    request: &V2ArtifactEnvelope,
    context: &V2ResponseSigningContext,
) -> Result<(), V2ArtifactFetchResponseError> {
    for value in [
        context.message_id.as_str(),
        context.issuer.as_str(),
        context.key_id.as_str(),
        context.audience.as_str(),
        context.nonce.as_str(),
    ] {
        validate_identifier(value).map_err(|_| V2ArtifactFetchResponseError::InvalidIdentity)?;
    }
    if context.audience != request.requester_id() {
        return Err(V2ArtifactFetchResponseError::IdentityMismatch);
    }
    if context.issued_at < 0 || context.expires_at <= context.issued_at {
        return Err(V2ArtifactFetchResponseError::InvalidTiming);
    }
    Ok(())
}

fn map_rejection(reason: ArtifactTransferReject) -> V2ArtifactFetchRejectReason {
    match reason {
        ArtifactTransferReject::Missing => V2ArtifactFetchRejectReason::Missing,
        ArtifactTransferReject::WrongOwner => V2ArtifactFetchRejectReason::WrongOwner,
        ArtifactTransferReject::WrongTransfer => V2ArtifactFetchRejectReason::WrongTransfer,
        ArtifactTransferReject::DigestMismatch => V2ArtifactFetchRejectReason::DigestMismatch,
        ArtifactTransferReject::RevisionConflict => V2ArtifactFetchRejectReason::RevisionConflict,
        ArtifactTransferReject::InvalidState => V2ArtifactFetchRejectReason::InvalidState,
        ArtifactTransferReject::Expired => V2ArtifactFetchRejectReason::Expired,
        ArtifactTransferReject::SourceUnavailable => V2ArtifactFetchRejectReason::SourceUnavailable,
        ArtifactTransferReject::VerificationFailed => {
            V2ArtifactFetchRejectReason::VerificationFailed
        }
        ArtifactTransferReject::StorageConflict => V2ArtifactFetchRejectReason::StorageConflict,
        ArtifactTransferReject::Unavailable => V2ArtifactFetchRejectReason::Unavailable,
    }
}

fn map_signer_error(_: V2ResponseSignerError) -> V2ArtifactFetchResponseError {
    V2ArtifactFetchResponseError::SignerUnavailable
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
