//! Signed closed response for one MQTT v2 policy admin request.

use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::permission_policy::PolicyRejectReason;
use crate::policy_admin::{PolicyAdminAuthorizationRejection, PolicyAdminResult};
use crate::policy_repository::PolicyRepositoryResult;
use crate::protocol_v2_policy_admin::V2PolicyAdminEnvelope;
use crate::protocol_v2_terminal::{V2ResponseSigner, V2ResponseSigningContext};

#[derive(Serialize)]
struct PolicyAdminResultPayload {
    outcome: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason_code: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    revision: Option<u64>,
}

#[derive(Serialize)]
struct ResultAuthorization {
    schema_version: u16,
    issuer: String,
    key_id: String,
    audience: String,
    scope: &'static str,
    nonce: String,
    signature: String,
}

#[derive(Serialize)]
pub struct V2PolicyAdminResultEnvelope {
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
    payload: PolicyAdminResultPayload,
    authorization: ResultAuthorization,
    #[serde(skip)]
    payload_digest: [u8; 32],
}

impl V2PolicyAdminResultEnvelope {
    pub fn sign(
        request: &V2PolicyAdminEnvelope,
        result: PolicyAdminResult,
        context: V2ResponseSigningContext,
        signer: &dyn V2ResponseSigner,
    ) -> Result<Self, V2PolicyAdminResultBuildError> {
        if context.message_id.trim().is_empty()
            || context.issuer.trim().is_empty()
            || context.key_id.trim().is_empty()
            || context.nonce.trim().is_empty()
            || context.audience != request.requester_id()
            || context.issued_at <= 0
            || context.expires_at <= context.issued_at
        {
            return Err(V2PolicyAdminResultBuildError::InvalidContext);
        }
        let payload = result_payload(result);
        let payload_digest = Sha256::digest(
            serde_json::to_vec(&payload)
                .map_err(|_| V2PolicyAdminResultBuildError::Serialization)?,
        )
        .into();
        let sequence = payload.revision.unwrap_or(1).max(1);
        let mut envelope = Self {
            protocol_version: 2,
            schema_id: "yeonjang.policy-admin-result.v2",
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
            sequence,
            payload,
            authorization: ResultAuthorization {
                schema_version: 1,
                issuer: context.issuer,
                key_id: context.key_id,
                audience: context.audience,
                scope: "admin.policy.write.result",
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
            .map_err(|_| V2PolicyAdminResultBuildError::SignerUnavailable)?;
        if signature.len() != 64 || !signature.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err(V2PolicyAdminResultBuildError::InvalidSignature);
        }
        envelope.authorization.signature = signature;
        Ok(envelope)
    }

    fn signing_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::new();
        append(
            &mut bytes,
            "domain",
            b"yeonjang.policy-admin-result.authorization.v2",
        );
        append(&mut bytes, "payload_sha256", &self.payload_digest);
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
            ("authorization_scope", self.authorization.scope),
            ("authorization_nonce", self.authorization.nonce.as_str()),
        ] {
            append(&mut bytes, name, value.as_bytes());
        }
        append(&mut bytes, "issued_at", &self.issued_at.to_be_bytes());
        append(&mut bytes, "expires_at", &self.expires_at.to_be_bytes());
        append(&mut bytes, "sequence", &self.sequence.to_be_bytes());
        bytes
    }
}

fn result_payload(result: PolicyAdminResult) -> PolicyAdminResultPayload {
    match result {
        PolicyAdminResult::Policy(result) => match result {
            PolicyRepositoryResult::Applied { revision } => {
                payload("applied", None, Some(revision))
            }
            PolicyRepositoryResult::Unchanged { revision } => {
                payload("unchanged", None, Some(revision))
            }
            PolicyRepositoryResult::RevisionConflict {
                current_revision, ..
            } => payload(
                "revision_conflict",
                Some("revision_conflict"),
                Some(current_revision),
            ),
            PolicyRepositoryResult::Rejected { reason } => {
                payload("rejected", Some(policy_reject_code(reason)), None)
            }
            PolicyRepositoryResult::HistoryNotFound => {
                payload("rejected", Some("history_not_found"), None)
            }
            PolicyRepositoryResult::Saturated => {
                payload("unavailable", Some("repository_saturated"), None)
            }
            PolicyRepositoryResult::StorageConflict => {
                payload("unavailable", Some("storage_conflict"), None)
            }
            PolicyRepositoryResult::Unavailable => {
                payload("unavailable", Some("repository_unavailable"), None)
            }
        },
        PolicyAdminResult::AuthorizationRejected(reason) => payload(
            "authorization_rejected",
            Some(authorization_reject_code(reason)),
            None,
        ),
    }
}

fn payload(
    outcome: &'static str,
    reason_code: Option<&'static str>,
    revision: Option<u64>,
) -> PolicyAdminResultPayload {
    PolicyAdminResultPayload {
        outcome,
        reason_code,
        revision,
    }
}

fn policy_reject_code(reason: PolicyRejectReason) -> &'static str {
    match reason {
        PolicyRejectReason::WrongTarget => "wrong_target",
        PolicyRejectReason::NotHistorical => "not_historical",
        PolicyRejectReason::RevisionOverflow => "revision_overflow",
        PolicyRejectReason::InvalidState => "invalid_state",
    }
}

fn authorization_reject_code(reason: PolicyAdminAuthorizationRejection) -> &'static str {
    match reason {
        PolicyAdminAuthorizationRejection::Denied => "denied",
        PolicyAdminAuthorizationRejection::Invalid => "invalid",
        PolicyAdminAuthorizationRejection::Expired => "expired",
        PolicyAdminAuthorizationRejection::Replayed => "replayed",
        PolicyAdminAuthorizationRejection::ScopeMismatch => "scope_mismatch",
        PolicyAdminAuthorizationRejection::BindingMismatch => "binding_mismatch",
        PolicyAdminAuthorizationRejection::VerifierUnavailable => "verifier_unavailable",
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2PolicyAdminResultBuildError {
    InvalidContext,
    Serialization,
    SignerUnavailable,
    InvalidSignature,
}

fn append(output: &mut Vec<u8>, name: &str, value: &[u8]) {
    output.extend_from_slice(&(name.len() as u64).to_be_bytes());
    output.extend_from_slice(name.as_bytes());
    output.extend_from_slice(&(value.len() as u64).to_be_bytes());
    output.extend_from_slice(value);
}
