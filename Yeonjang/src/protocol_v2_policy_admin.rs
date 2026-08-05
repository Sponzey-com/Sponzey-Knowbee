//! Strict signed MQTT v2 `admin.policy.write` contract.
//!
//! Parsing and admission are the only wire-to-Application conversion path.
//! Payload reason text is signed but is not copied into policy state or audit.

use std::fmt;

use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::mqtt_v2_topics::{MqttV2TopicSet, validate_identifier};
use crate::permission_policy::{
    PolicyCapability, PolicyDecision, PolicyResourceConstraint, PolicyUpdateCommand,
};
use crate::policy_admin::{
    PolicyAdminActionBinding, PolicyAdminAuthorizationGrant, PolicyAdminAuthorizationScope,
    PolicyAdminRequest, PolicyRollbackCommand,
};

const MAX_ADMIN_BYTES: usize = 65_536;
const MAX_REASON_BYTES: usize = 512;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
enum MessageKind {
    Admin,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
enum CapabilityWire {
    #[serde(rename = "camera.capture")]
    CameraCapture,
    #[serde(rename = "screen.capture")]
    ScreenCapture,
}

impl From<CapabilityWire> for PolicyCapability {
    fn from(value: CapabilityWire) -> Self {
        match value {
            CapabilityWire::CameraCapture => Self::CameraCapture,
            CapabilityWire::ScreenCapture => Self::ScreenCapture,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
enum DecisionWire {
    Allowed,
    Denied,
}

impl From<DecisionWire> for PolicyDecision {
    fn from(value: DecisionWire) -> Self {
        match value {
            DecisionWire::Allowed => Self::Allowed,
            DecisionWire::Denied => Self::Denied,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
enum ResourceWire {
    Any,
    ExactCamera { resource_id: String },
    ExactDisplay { resource_id: String },
}

impl ResourceWire {
    fn into_domain(self) -> PolicyResourceConstraint {
        match self {
            Self::Any => PolicyResourceConstraint::Any,
            Self::ExactCamera { resource_id } => {
                PolicyResourceConstraint::exact_camera(resource_id)
            }
            Self::ExactDisplay { resource_id } => {
                PolicyResourceConstraint::exact_display(resource_id)
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
struct UpdateParams {
    expected_revision: u64,
    capability: CapabilityWire,
    decision: DecisionWire,
    resource: ResourceWire,
    reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
struct RollbackParams {
    expected_current_revision: u64,
    restore_revision: u64,
    reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "admin", content = "params", deny_unknown_fields)]
enum AdminPayload {
    #[serde(rename = "policy.update")]
    Update(UpdateParams),
    #[serde(rename = "policy.rollback")]
    Rollback(RollbackParams),
}

impl AdminPayload {
    fn validate(&self) -> bool {
        match self {
            Self::Update(params) => {
                valid_reason(&params.reason)
                    && PolicyUpdateCommand::new(
                        "validation-target",
                        params.expected_revision,
                        params.capability.into(),
                        params.decision.into(),
                        params.resource.clone().into_domain(),
                    )
                    .is_ok()
            }
            Self::Rollback(params) => {
                valid_reason(&params.reason)
                    && params.restore_revision < params.expected_current_revision
            }
        }
    }

    fn digest(&self) -> [u8; 32] {
        let mut bytes = Vec::new();
        match self {
            Self::Update(params) => {
                append_text(&mut bytes, "admin", "policy.update");
                append_u64(&mut bytes, "expected_revision", params.expected_revision);
                append_text(
                    &mut bytes,
                    "capability",
                    match params.capability {
                        CapabilityWire::CameraCapture => "camera.capture",
                        CapabilityWire::ScreenCapture => "screen.capture",
                    },
                );
                append_text(
                    &mut bytes,
                    "decision",
                    match params.decision {
                        DecisionWire::Allowed => "allowed",
                        DecisionWire::Denied => "denied",
                    },
                );
                append_resource(&mut bytes, &params.resource);
                append_text(&mut bytes, "reason", &params.reason);
            }
            Self::Rollback(params) => {
                append_text(&mut bytes, "admin", "policy.rollback");
                append_u64(
                    &mut bytes,
                    "expected_current_revision",
                    params.expected_current_revision,
                );
                append_u64(&mut bytes, "restore_revision", params.restore_revision);
                append_text(&mut bytes, "reason", &params.reason);
            }
        }
        Sha256::digest(bytes).into()
    }
}

#[derive(Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
struct AdminAuthorization {
    schema_version: u16,
    authorization_id: String,
    issuer: String,
    key_id: String,
    audience: String,
    scope: String,
    requester_id: String,
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

#[derive(Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct V2PolicyAdminEnvelope {
    protocol_version: u16,
    schema_id: String,
    message_kind: MessageKind,
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
    payload: AdminPayload,
    authorization: AdminAuthorization,
}

impl fmt::Debug for V2PolicyAdminEnvelope {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("V2PolicyAdminEnvelope")
            .field("request_id", &self.request_id)
            .field("target_instance_id", &self.target_instance_id)
            .field("authorization", &"[REDACTED]")
            .finish_non_exhaustive()
    }
}

impl V2PolicyAdminEnvelope {
    pub(crate) fn message_id(&self) -> &str {
        &self.message_id
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
    pub(crate) fn correlation_id(&self) -> &str {
        &self.correlation_id
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
    pub(crate) fn idempotency_key(&self) -> &str {
        &self.idempotency_key
    }

    pub fn authorization_signing_bytes(&self) -> Vec<u8> {
        let authorization = &self.authorization;
        let mut bytes = Vec::new();
        append_text(
            &mut bytes,
            "domain",
            "yeonjang.policy-admin.authorization.v2",
        );
        append_u64(
            &mut bytes,
            "protocol_version",
            u64::from(self.protocol_version),
        );
        append_text(&mut bytes, "schema_id", &self.schema_id);
        append_text(&mut bytes, "message_kind", "admin");
        append_bytes(&mut bytes, "payload_sha256", &self.payload.digest());
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
        append_u64(
            &mut bytes,
            "authorization_schema_version",
            u64::from(authorization.schema_version),
        );
        for (name, value) in [
            ("authorization_id", authorization.authorization_id.as_str()),
            ("authorization_issuer", authorization.issuer.as_str()),
            ("authorization_key_id", authorization.key_id.as_str()),
            ("authorization_audience", authorization.audience.as_str()),
            ("authorization_scope", "admin.policy.write"),
            (
                "authorization_requester_id",
                authorization.requester_id.as_str(),
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

    fn validate(
        &self,
        now_ms: i64,
        topics: &MqttV2TopicSet,
    ) -> Result<(), V2PolicyAdminParseError> {
        if self.protocol_version != 2
            || self.schema_id != "yeonjang.admin.v2"
            || !matches!(self.message_kind, MessageKind::Admin)
            || self.sequence == 0
            || !self.payload.validate()
        {
            return Err(V2PolicyAdminParseError::UnknownOrInvalidField);
        }
        for value in [
            self.message_id.as_str(),
            self.request_id.as_str(),
            self.command_id.as_str(),
            self.operation_id.as_str(),
            self.correlation_id.as_str(),
            self.causation_id.as_str(),
            self.requester_id.as_str(),
            self.target_instance_id.as_str(),
            self.target_session_id.as_str(),
            self.idempotency_key.as_str(),
        ] {
            validate_identifier(value)
                .map_err(|_| V2PolicyAdminParseError::UnknownOrInvalidField)?;
        }
        if !is_sha256_digest(&self.target_fingerprint) {
            return Err(V2PolicyAdminParseError::UnknownOrInvalidField);
        }
        if self.issued_at > now_ms {
            return Err(V2PolicyAdminParseError::IssuedInFuture);
        }
        if self.expires_at <= now_ms || self.expires_at <= self.issued_at {
            return Err(V2PolicyAdminParseError::Expired);
        }
        if self.requester_id != topics.requester_id()
            || self.target_instance_id != topics.instance_id()
            || self.target_session_id != topics.session_id()
        {
            return Err(V2PolicyAdminParseError::IdentityMismatch);
        }
        self.validate_authorization()
    }

    fn validate_authorization(&self) -> Result<(), V2PolicyAdminParseError> {
        let authorization = &self.authorization;
        for value in [
            authorization.authorization_id.as_str(),
            authorization.issuer.as_str(),
            authorization.key_id.as_str(),
            authorization.audience.as_str(),
            authorization.requester_id.as_str(),
            authorization.command_id.as_str(),
            authorization.operation_id.as_str(),
            authorization.target_instance_id.as_str(),
            authorization.target_session_id.as_str(),
            authorization.idempotency_key.as_str(),
            authorization.nonce.as_str(),
        ] {
            validate_identifier(value)
                .map_err(|_| V2PolicyAdminParseError::AuthorizationMismatch)?;
        }
        if authorization.schema_version != 1
            || authorization.scope != "admin.policy.write"
            || authorization.audience != self.target_instance_id
            || authorization.requester_id != self.requester_id
            || authorization.command_id != self.command_id
            || authorization.operation_id != self.operation_id
            || authorization.target_instance_id != self.target_instance_id
            || authorization.target_session_id != self.target_session_id
            || authorization.target_fingerprint != self.target_fingerprint
            || authorization.idempotency_key != self.idempotency_key
            || authorization.expires_at != self.expires_at
            || !is_sha256_digest(&authorization.target_fingerprint)
            || !is_hex_digest(&authorization.signature)
        {
            return Err(V2PolicyAdminParseError::AuthorizationMismatch);
        }
        Ok(())
    }

    fn build_request(&self) -> PolicyAdminRequest {
        let authorization = &self.authorization;
        match &self.payload {
            AdminPayload::Update(params) => {
                let command = PolicyUpdateCommand::new(
                    &self.target_instance_id,
                    params.expected_revision,
                    params.capability.into(),
                    params.decision.into(),
                    params.resource.clone().into_domain(),
                )
                .expect("validated policy update");
                let action = PolicyAdminActionBinding::from_update(&command);
                PolicyAdminRequest::Update {
                    command,
                    grant: self.grant(action, authorization),
                }
            }
            AdminPayload::Rollback(params) => {
                let command = PolicyRollbackCommand::new(
                    &self.target_instance_id,
                    params.expected_current_revision,
                    params.restore_revision,
                )
                .expect("validated policy rollback");
                let action = PolicyAdminActionBinding::from_rollback(&command);
                PolicyAdminRequest::Rollback {
                    command,
                    grant: self.grant(action, authorization),
                }
            }
        }
    }

    fn grant(
        &self,
        action: PolicyAdminActionBinding,
        authorization: &AdminAuthorization,
    ) -> PolicyAdminAuthorizationGrant {
        PolicyAdminAuthorizationGrant::new(
            PolicyAdminAuthorizationScope::AdminPolicyWrite,
            &authorization.authorization_id,
            &self.requester_id,
            &self.target_instance_id,
            &self.target_session_id,
            &self.target_fingerprint,
            &authorization.nonce,
            self.expires_at,
            action,
        )
        .expect("validated admin grant")
    }
}

pub trait V2PolicyAdminSignatureVerifier: Send + Sync {
    fn verify(&self, issuer: &str, key_id: &str, signing_bytes: &[u8], signature_hex: &str)
    -> bool;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2PolicyAdminAdmissionError {
    SignatureRejected,
    Expired,
}

#[derive(Debug, PartialEq, Eq)]
pub struct AdmittedV2PolicyAdmin<'a> {
    envelope: &'a V2PolicyAdminEnvelope,
}

impl AdmittedV2PolicyAdmin<'_> {
    pub fn into_request(self) -> PolicyAdminRequest {
        self.envelope.build_request()
    }
}

pub struct V2PolicyAdminAdmission<'a> {
    verifier: &'a dyn V2PolicyAdminSignatureVerifier,
}

impl<'a> V2PolicyAdminAdmission<'a> {
    pub fn new(verifier: &'a dyn V2PolicyAdminSignatureVerifier) -> Self {
        Self { verifier }
    }

    pub fn admit<'envelope>(
        &self,
        envelope: &'envelope V2PolicyAdminEnvelope,
        now_ms: i64,
    ) -> Result<AdmittedV2PolicyAdmin<'envelope>, V2PolicyAdminAdmissionError> {
        if !self.verifier.verify(
            &envelope.authorization.issuer,
            &envelope.authorization.key_id,
            &envelope.authorization_signing_bytes(),
            &envelope.authorization.signature,
        ) {
            return Err(V2PolicyAdminAdmissionError::SignatureRejected);
        }
        if envelope.expires_at <= now_ms {
            return Err(V2PolicyAdminAdmissionError::Expired);
        }
        Ok(AdmittedV2PolicyAdmin { envelope })
    }
}

pub fn parse_v2_policy_admin(
    topic: impl AsRef<str>,
    bytes: &[u8],
    retained: bool,
    now_ms: i64,
    topics: &MqttV2TopicSet,
) -> Result<V2PolicyAdminEnvelope, V2PolicyAdminParseError> {
    if retained {
        return Err(V2PolicyAdminParseError::RetainedMessage);
    }
    if bytes.len() > MAX_ADMIN_BYTES {
        return Err(V2PolicyAdminParseError::PayloadTooLarge);
    }
    let probe: Value =
        serde_json::from_slice(bytes).map_err(|_| V2PolicyAdminParseError::Malformed)?;
    match probe.get("protocol_version").and_then(Value::as_u64) {
        Some(1) => return Err(V2PolicyAdminParseError::ProtocolUpgradeRequired),
        Some(2) => {}
        Some(_) => return Err(V2PolicyAdminParseError::ProtocolVersionUnsupported),
        None => return Err(V2PolicyAdminParseError::Malformed),
    }
    if topic.as_ref() != topics.admin() {
        return Err(V2PolicyAdminParseError::TopicMismatch);
    }
    let envelope = serde_json::from_value::<V2PolicyAdminEnvelope>(probe)
        .map_err(|_| V2PolicyAdminParseError::UnknownOrInvalidField)?;
    envelope.validate(now_ms, topics)?;
    Ok(envelope)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2PolicyAdminParseError {
    RetainedMessage,
    PayloadTooLarge,
    Malformed,
    ProtocolUpgradeRequired,
    ProtocolVersionUnsupported,
    TopicMismatch,
    UnknownOrInvalidField,
    IssuedInFuture,
    Expired,
    IdentityMismatch,
    AuthorizationMismatch,
}

fn valid_reason(reason: &str) -> bool {
    !reason.trim().is_empty()
        && reason.len() <= MAX_REASON_BYTES
        && !reason.chars().any(char::is_control)
}

fn append_resource(bytes: &mut Vec<u8>, resource: &ResourceWire) {
    match resource {
        ResourceWire::Any => append_text(bytes, "resource_kind", "any"),
        ResourceWire::ExactCamera { resource_id } => {
            append_text(bytes, "resource_kind", "exact_camera");
            append_text(bytes, "resource_id", resource_id);
        }
        ResourceWire::ExactDisplay { resource_id } => {
            append_text(bytes, "resource_kind", "exact_display");
            append_text(bytes, "resource_id", resource_id);
        }
    }
}

fn is_sha256_digest(value: &str) -> bool {
    value.len() == 71 && value.strip_prefix("sha256:").is_some_and(is_hex_digest)
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
