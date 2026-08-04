//! Signed response for one admitted capture permission read.
//!
//! The response maps Application-owned closed results into a bounded external
//! DTO. Exact local device identifiers, native errors, and prompt controls are
//! deliberately absent.

use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::capability_permission::{LocalPolicyState, OsPermissionState};
use crate::capture_permission_read::CapturePermissionReadResult;
use crate::permission_policy::PolicyResourceConstraint;
use crate::protocol_v2_permission_query::V2CapturePermissionQueryEnvelope;
use crate::protocol_v2_terminal::{V2ResponseSigner, V2ResponseSigningContext};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
enum PermissionReadOutcome {
    Available,
    BindingMismatch,
    PolicyUnavailable,
    ObservationUnavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
enum PermissionPolicyProjection {
    Allowed,
    Denied,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
enum PermissionOsProjection {
    NotObserved,
    NotRequired,
    Granted,
    NotDetermined,
    Denied,
    Restricted,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
enum PermissionResourceProjection {
    Any,
    ExactCamera,
    ExactDisplay,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct CapturePermissionResponseRow {
    method: String,
    resource: String,
    setting_name: String,
    platform_available: bool,
    local_policy: PermissionPolicyProjection,
    policy_resource: PermissionResourceProjection,
    os_permission: PermissionOsProjection,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct CapturePermissionResponsePayload {
    outcome: PermissionReadOutcome,
    #[serde(skip_serializing_if = "Option::is_none")]
    policy_revision: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    permissions: Option<Vec<CapturePermissionResponseRow>>,
}

#[derive(Clone, PartialEq, Eq, Serialize)]
struct CapturePermissionResponseAuthorization {
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
pub struct V2CapturePermissionResponseEnvelope {
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
    payload: CapturePermissionResponsePayload,
    authorization: CapturePermissionResponseAuthorization,
    #[serde(skip)]
    payload_digest: [u8; 32],
}

impl V2CapturePermissionResponseEnvelope {
    pub fn sign(
        query: &V2CapturePermissionQueryEnvelope,
        result: CapturePermissionReadResult,
        context: V2ResponseSigningContext,
        signer: &dyn V2ResponseSigner,
    ) -> Result<Self, V2CapturePermissionResponseError> {
        if context.issuer != query.target_instance_id()
            || context.audience != query.requester_id()
            || context.issued_at <= 0
            || context.expires_at <= context.issued_at
        {
            return Err(V2CapturePermissionResponseError::IdentityMismatch);
        }
        let payload = payload(result);
        let payload_digest = Sha256::digest(
            serde_json::to_vec(&payload)
                .map_err(|_| V2CapturePermissionResponseError::Serialization)?,
        )
        .into();
        let mut envelope = Self {
            protocol_version: 2,
            schema_id: "yeonjang.capture-permission-response.v2",
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
            sequence: 1,
            authorization: CapturePermissionResponseAuthorization {
                schema_version: 1,
                issuer: context.issuer,
                key_id: context.key_id,
                audience: context.audience,
                scope: "response.publish",
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
            payload,
            payload_digest,
        };
        let signature = signer
            .sign(
                &envelope.authorization.issuer,
                &envelope.authorization.key_id,
                &envelope.authorization_signing_bytes(),
            )
            .map_err(|_| V2CapturePermissionResponseError::SignerUnavailable)?;
        if !is_lower_hex_digest(&signature) {
            return Err(V2CapturePermissionResponseError::InvalidSignature);
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
            "yeonjang.capture-permission-response.authorization.v2",
        );
        append_bytes(&mut bytes, "payload_sha256", &self.payload_digest);
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
        for (name, value) in [
            ("protocol_version", u64::from(self.protocol_version)),
            ("sequence", self.sequence),
            (
                "authorization_schema_version",
                u64::from(authorization.schema_version),
            ),
        ] {
            append_u64(&mut bytes, name, value);
        }
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
pub enum V2CapturePermissionResponseError {
    IdentityMismatch,
    Serialization,
    SignerUnavailable,
    InvalidSignature,
}

fn payload(result: CapturePermissionReadResult) -> CapturePermissionResponsePayload {
    let CapturePermissionReadResult::Available { rows } = result else {
        return CapturePermissionResponsePayload {
            outcome: match result {
                CapturePermissionReadResult::BindingMismatch => {
                    PermissionReadOutcome::BindingMismatch
                }
                CapturePermissionReadResult::PolicyUnavailable => {
                    PermissionReadOutcome::PolicyUnavailable
                }
                CapturePermissionReadResult::ObservationUnavailable => {
                    PermissionReadOutcome::ObservationUnavailable
                }
                CapturePermissionReadResult::Available { .. } => unreachable!(),
            },
            policy_revision: None,
            permissions: None,
        };
    };
    let policy_revision = rows[0].policy_revision;
    debug_assert!(
        rows.iter()
            .all(|row| row.policy_revision == policy_revision)
    );
    CapturePermissionResponsePayload {
        outcome: PermissionReadOutcome::Available,
        policy_revision: Some(policy_revision),
        permissions: Some(
            rows.into_iter()
                .map(|row| CapturePermissionResponseRow {
                    method: row.method.to_string(),
                    resource: row.resource.to_string(),
                    setting_name: row.setting_name.to_string(),
                    platform_available: row.capability_available,
                    local_policy: match row.local_policy {
                        LocalPolicyState::Allowed => PermissionPolicyProjection::Allowed,
                        LocalPolicyState::Denied => PermissionPolicyProjection::Denied,
                    },
                    policy_resource: match row.policy_resource {
                        PolicyResourceConstraint::Any => PermissionResourceProjection::Any,
                        PolicyResourceConstraint::ExactCamera { .. } => {
                            PermissionResourceProjection::ExactCamera
                        }
                        PolicyResourceConstraint::ExactDisplay { .. } => {
                            PermissionResourceProjection::ExactDisplay
                        }
                    },
                    os_permission: match row.os_permission {
                        OsPermissionState::NotObserved => PermissionOsProjection::NotObserved,
                        OsPermissionState::NotRequired => PermissionOsProjection::NotRequired,
                        OsPermissionState::Granted => PermissionOsProjection::Granted,
                        OsPermissionState::NotDetermined => PermissionOsProjection::NotDetermined,
                        OsPermissionState::Denied => PermissionOsProjection::Denied,
                        OsPermissionState::Restricted => PermissionOsProjection::Restricted,
                    },
                })
                .collect(),
        ),
    }
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
