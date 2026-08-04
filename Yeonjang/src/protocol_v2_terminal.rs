//! Exact terminal content and signed MQTT v2 response envelope.

use std::fmt;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::artifact_registration::ArtifactDeliveryDescriptor;
use crate::mqtt_v2_topics::validate_identifier;
use crate::protocol_v2_operation::BoundV2Operation;
use crate::terminal_receipt::TerminalReceipt;
use crate::v2_delivery_receipt::V2DeliveryReceipt;

const TERMINAL_RESPONSE_CONTENT_SCHEMA_VERSION: u16 = 3;
const LEGACY_TERMINAL_RESPONSE_CONTENT_SCHEMA_V2: u16 = 2;
const LEGACY_TERMINAL_RESPONSE_CONTENT_SCHEMA_V1: u16 = 1;
const PROTOCOL_VERSION: u16 = 2;
const RESPONSE_SCHEMA_ID: &str = "yeonjang.response.v2";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct V2TerminalResponseContent {
    schema_version: u16,
    request_id: String,
    command_id: String,
    operation_id: String,
    requester_id: String,
    correlation_id: String,
    causation_id: String,
    target_instance_id: String,
    target_session_id: String,
    target_fingerprint: String,
    idempotency_key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    target_scope_digest: Option<String>,
    terminal: TerminalReceipt,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    artifact: Option<ArtifactDeliveryDescriptor>,
}

impl V2TerminalResponseContent {
    pub fn new(
        bound: &BoundV2Operation,
        terminal: TerminalReceipt,
    ) -> Result<Self, V2TerminalResponseError> {
        Self::new_with_artifact(bound, terminal, None)
    }

    pub fn new_with_artifact(
        bound: &BoundV2Operation,
        terminal: TerminalReceipt,
        artifact: Option<ArtifactDeliveryDescriptor>,
    ) -> Result<Self, V2TerminalResponseError> {
        Self::build(
            LEGACY_TERMINAL_RESPONSE_CONTENT_SCHEMA_V2,
            bound,
            terminal,
            None,
            artifact,
        )
    }

    /// Creates the production schema that lets a requester construct an exact
    /// `receipt.get` without knowing the terminal repository's internal state.
    pub fn new_with_artifact_and_scope(
        bound: &BoundV2Operation,
        terminal: TerminalReceipt,
        target_scope_digest: &str,
        artifact: Option<ArtifactDeliveryDescriptor>,
    ) -> Result<Self, V2TerminalResponseError> {
        if !is_sha256_digest(target_scope_digest) {
            return Err(V2TerminalResponseError::InvalidTargetScopeDigest);
        }
        Self::build(
            TERMINAL_RESPONSE_CONTENT_SCHEMA_VERSION,
            bound,
            terminal,
            Some(target_scope_digest.to_string()),
            artifact,
        )
    }

    fn build(
        schema_version: u16,
        bound: &BoundV2Operation,
        terminal: TerminalReceipt,
        target_scope_digest: Option<String>,
        artifact: Option<ArtifactDeliveryDescriptor>,
    ) -> Result<Self, V2TerminalResponseError> {
        let operation = bound.operation();
        if terminal.binding_digest() != operation.binding_digest() {
            return Err(V2TerminalResponseError::BindingMismatch);
        }
        let identity = bound.response_identity();
        Ok(Self {
            schema_version,
            request_id: operation.request_id().to_string(),
            command_id: operation.command_id().to_string(),
            operation_id: operation.operation_id().to_string(),
            requester_id: operation.requester_id().to_string(),
            correlation_id: identity.correlation_id.clone(),
            causation_id: identity.causation_id.clone(),
            target_instance_id: operation.target_instance_id().to_string(),
            target_session_id: operation.target_session_id().to_string(),
            target_fingerprint: operation.target_fingerprint().to_string(),
            idempotency_key: operation.idempotency_key().to_string(),
            target_scope_digest,
            terminal,
            artifact,
        })
    }

    pub(crate) fn validate_stored(&self) -> bool {
        matches!(
            self.schema_version,
            LEGACY_TERMINAL_RESPONSE_CONTENT_SCHEMA_V1
                | LEGACY_TERMINAL_RESPONSE_CONTENT_SCHEMA_V2
                | TERMINAL_RESPONSE_CONTENT_SCHEMA_VERSION
        ) && (self.schema_version != LEGACY_TERMINAL_RESPONSE_CONTENT_SCHEMA_V1
            || self.artifact.is_none())
            && match self.schema_version {
                LEGACY_TERMINAL_RESPONSE_CONTENT_SCHEMA_V1
                | LEGACY_TERMINAL_RESPONSE_CONTENT_SCHEMA_V2 => self.target_scope_digest.is_none(),
                TERMINAL_RESPONSE_CONTENT_SCHEMA_VERSION => self
                    .target_scope_digest
                    .as_deref()
                    .is_some_and(is_sha256_digest),
                _ => false,
            }
            && self
                .artifact
                .as_ref()
                .is_none_or(|artifact| artifact.validate())
            && self.terminal.validate_stored()
            && self.request_id == self.terminal.request_id()
            && self.command_id == self.terminal.command_id()
            && self.operation_id == self.terminal.operation_id()
            && self.requester_id == self.terminal.requester_id()
            && self.target_instance_id == self.terminal.target_instance_id()
            && self.target_session_id == self.terminal.target_session_id()
            && self.target_fingerprint == self.terminal.target_fingerprint()
            && self.idempotency_key == self.terminal.idempotency_key()
            && is_bounded_content_identity(&self.correlation_id)
            && is_bounded_content_identity(&self.causation_id)
    }

    /// A prepared crash fallback is deliberately stricter than an ordinary
    /// terminal: it may never claim an artifact or invite automatic retry.
    pub(crate) fn validate_restart_recovery(&self) -> bool {
        self.validate_stored()
            && self.artifact.is_none()
            && self.terminal.execution_outcome()
                == crate::terminal_receipt::ExecutionOutcome::EffectUnknown
            && self.terminal.failure().is_some_and(|failure| {
                failure.effect_state() == crate::platform_execution::EffectState::Unknown
                    && failure.retry_safety()
                        == crate::platform_execution::RetrySafety::ManualVerificationRequired
                    && failure.recovery_action()
                        == crate::platform_execution::RecoveryAction::ManualEffectVerification
            })
    }

    pub(crate) fn idempotency_key(&self) -> &str {
        &self.idempotency_key
    }

    pub(crate) fn target_scope_digest(&self) -> Option<&str> {
        self.target_scope_digest.as_deref()
    }

    pub(crate) fn request_id(&self) -> &str {
        &self.request_id
    }

    pub(crate) fn command_id(&self) -> &str {
        &self.command_id
    }

    pub(crate) fn operation_id(&self) -> &str {
        &self.operation_id
    }

    pub(crate) fn requester_id(&self) -> &str {
        &self.requester_id
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

    pub(crate) fn terminal_revision(&self) -> u64 {
        self.terminal.terminal_revision()
    }

    pub fn artifact(&self) -> Option<&ArtifactDeliveryDescriptor> {
        self.artifact.as_ref()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2TerminalResponseError {
    BindingMismatch,
    InvalidTargetScopeDigest,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct V2ResponseSigningContext {
    pub message_id: String,
    pub issued_at: i64,
    pub expires_at: i64,
    pub issuer: String,
    pub key_id: String,
    pub audience: String,
    pub nonce: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2ResponseSignerError {
    Unavailable,
}

pub trait V2ResponseSigner: Send + Sync {
    fn sign(
        &self,
        issuer: &str,
        key_id: &str,
        signing_bytes: &[u8],
    ) -> Result<String, V2ResponseSignerError>;
}

#[derive(Clone, PartialEq, Eq, Serialize)]
struct V2ResponseAuthorization {
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
pub struct V2TerminalResponseEnvelope {
    protocol_version: u16,
    schema_id: &'static str,
    message_kind: &'static str,
    message_id: String,
    receipt_id: String,
    response_digest: String,
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
    payload: V2TerminalResponseContent,
    authorization: V2ResponseAuthorization,
    #[serde(skip)]
    payload_digest: [u8; 32],
}

impl fmt::Debug for V2TerminalResponseEnvelope {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("V2TerminalResponseEnvelope")
            .field("message_id", &self.message_id)
            .field("request_id", &self.request_id)
            .field("operation_id", &self.operation_id)
            .field("signature", &"[REDACTED]")
            .finish_non_exhaustive()
    }
}

impl V2TerminalResponseEnvelope {
    pub fn sign(
        payload: V2TerminalResponseContent,
        context: V2ResponseSigningContext,
        signer: &dyn V2ResponseSigner,
    ) -> Result<Self, V2ResponseEnvelopeBuildError> {
        Self::sign_inner(payload, context, None, signer)
    }

    pub(crate) fn sign_with_receipt_id(
        payload: V2TerminalResponseContent,
        context: V2ResponseSigningContext,
        receipt_id: &str,
        signer: &dyn V2ResponseSigner,
    ) -> Result<Self, V2ResponseEnvelopeBuildError> {
        Self::sign_inner(payload, context, Some(receipt_id), signer)
    }

    fn sign_inner(
        payload: V2TerminalResponseContent,
        context: V2ResponseSigningContext,
        existing_receipt_id: Option<&str>,
        signer: &dyn V2ResponseSigner,
    ) -> Result<Self, V2ResponseEnvelopeBuildError> {
        validate_signing_context(&context)?;
        let payload_bytes = serde_json::to_vec(&payload)
            .map_err(|_| V2ResponseEnvelopeBuildError::PayloadSerialization)?;
        let payload_hash = Sha256::digest(payload_bytes);
        let payload_hex = format!("{payload_hash:x}");
        let response_digest = format!("sha256:{payload_hex}");
        let payload_digest = payload_hash.into();
        // Message IDs and signing nonces are publication identities and reset
        // when the runtime restarts. Delivery identity instead derives from
        // the immutable terminal content so an exact replay registers and
        // acknowledges the same durable receipt. The 224-bit prefix keeps the
        // opaque ID inside the shared 64-byte identifier bound.
        let receipt_id = existing_receipt_id
            .map(str::to_string)
            .unwrap_or_else(|| format!("receipt-{}", &payload_hex[..56]));
        let mut envelope = Self {
            protocol_version: PROTOCOL_VERSION,
            schema_id: RESPONSE_SCHEMA_ID,
            message_kind: "response",
            message_id: context.message_id,
            receipt_id,
            response_digest,
            request_id: payload.request_id.clone(),
            command_id: payload.command_id.clone(),
            operation_id: payload.operation_id.clone(),
            correlation_id: payload.correlation_id.clone(),
            causation_id: payload.causation_id.clone(),
            requester_id: payload.requester_id.clone(),
            target_instance_id: payload.target_instance_id.clone(),
            target_session_id: payload.target_session_id.clone(),
            target_fingerprint: payload.target_fingerprint.clone(),
            idempotency_key: payload.idempotency_key.clone(),
            issued_at: context.issued_at,
            expires_at: context.expires_at,
            sequence: payload.terminal.terminal_revision(),
            authorization: V2ResponseAuthorization {
                schema_version: 1,
                issuer: context.issuer,
                key_id: context.key_id,
                audience: context.audience,
                scope: "response.publish",
                requester_id: payload.requester_id.clone(),
                request_id: payload.request_id.clone(),
                command_id: payload.command_id.clone(),
                operation_id: payload.operation_id.clone(),
                target_instance_id: payload.target_instance_id.clone(),
                target_session_id: payload.target_session_id.clone(),
                target_fingerprint: payload.target_fingerprint.clone(),
                idempotency_key: payload.idempotency_key.clone(),
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
            .map_err(|_| V2ResponseEnvelopeBuildError::SignerUnavailable)?;
        if !is_hex_digest(&signature) {
            return Err(V2ResponseEnvelopeBuildError::InvalidSignature);
        }
        envelope.authorization.signature = signature;
        Ok(envelope)
    }

    /// Builds queued delivery metadata without copying response bytes or signature.
    pub fn delivery_receipt(&self) -> Result<V2DeliveryReceipt, V2ResponseEnvelopeBuildError> {
        V2DeliveryReceipt::queued(
            &self.receipt_id,
            &self.requester_id,
            &self.request_id,
            &self.command_id,
            &self.operation_id,
            &self.idempotency_key,
            &self.target_instance_id,
            &self.target_session_id,
            &self.target_fingerprint,
            self.sequence,
            &self.response_digest,
        )
        .map_err(|_| V2ResponseEnvelopeBuildError::DeliveryReceipt)
    }

    pub fn authorization_signing_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::new();
        append_text(&mut bytes, "domain", "yeonjang.response.authorization.v2");
        append_u64(
            &mut bytes,
            "protocol_version",
            u64::from(self.protocol_version),
        );
        append_text(&mut bytes, "schema_id", self.schema_id);
        append_text(&mut bytes, "message_kind", self.message_kind);
        append_text(&mut bytes, "message_id", &self.message_id);
        append_text(&mut bytes, "receipt_id", &self.receipt_id);
        append_text(&mut bytes, "response_digest", &self.response_digest);
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
        append_text(&mut bytes, "authorization_issuer", &authorization.issuer);
        append_text(&mut bytes, "authorization_key_id", &authorization.key_id);
        append_text(
            &mut bytes,
            "authorization_audience",
            &authorization.audience,
        );
        append_text(&mut bytes, "authorization_scope", authorization.scope);
        append_text(
            &mut bytes,
            "authorization_requester_id",
            &authorization.requester_id,
        );
        append_text(
            &mut bytes,
            "authorization_request_id",
            &authorization.request_id,
        );
        append_text(
            &mut bytes,
            "authorization_command_id",
            &authorization.command_id,
        );
        append_text(
            &mut bytes,
            "authorization_operation_id",
            &authorization.operation_id,
        );
        append_text(
            &mut bytes,
            "authorization_target_instance_id",
            &authorization.target_instance_id,
        );
        append_text(
            &mut bytes,
            "authorization_target_session_id",
            &authorization.target_session_id,
        );
        append_text(
            &mut bytes,
            "authorization_target_fingerprint",
            &authorization.target_fingerprint,
        );
        append_text(
            &mut bytes,
            "authorization_idempotency_key",
            &authorization.idempotency_key,
        );
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
pub enum V2ResponseEnvelopeBuildError {
    InvalidIdentity,
    InvalidTiming,
    PayloadSerialization,
    SignerUnavailable,
    InvalidSignature,
    DeliveryReceipt,
}

fn validate_signing_context(
    context: &V2ResponseSigningContext,
) -> Result<(), V2ResponseEnvelopeBuildError> {
    for value in [
        context.message_id.as_str(),
        context.issuer.as_str(),
        context.key_id.as_str(),
        context.audience.as_str(),
        context.nonce.as_str(),
    ] {
        validate_identifier(value).map_err(|_| V2ResponseEnvelopeBuildError::InvalidIdentity)?;
    }
    if context.issued_at < 0 || context.expires_at <= context.issued_at {
        return Err(V2ResponseEnvelopeBuildError::InvalidTiming);
    }
    Ok(())
}

fn is_hex_digest(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn is_sha256_digest(value: &str) -> bool {
    value.len() == 71 && value.strip_prefix("sha256:").is_some_and(is_hex_digest)
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

fn is_bounded_content_identity(value: &str) -> bool {
    !value.trim().is_empty() && value.len() <= 256
}
