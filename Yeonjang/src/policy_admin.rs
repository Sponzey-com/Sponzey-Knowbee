//! Application use case for explicitly authorized local-policy administration.
//!
//! The use case performs exact structural scope/action/target binding before
//! invoking a purpose-specific cryptographic verifier. It never observes or
//! changes OS permission and never invokes a platform effect.

use std::fmt;
use std::sync::Arc;

use crate::permission_policy::{
    PolicyCapability, PolicyDecision, PolicyResourceConstraint, PolicyUpdateCommand,
};
use crate::policy_repository::{
    PermissionPolicyAdminWriter, PolicyAdminAuditEvidence, PolicyAdminWriteResult,
    PolicyRepositoryResult,
};

const MAX_ID_BYTES: usize = 256;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PolicyAdminAuthorizationScope {
    AdminPolicyWrite,
    EffectExecute,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PolicyAdminActionBinding {
    Update {
        expected_revision: u64,
        capability: PolicyCapability,
        decision: PolicyDecision,
        resource: PolicyResourceConstraint,
    },
    Rollback {
        expected_current_revision: u64,
        restore_revision: u64,
    },
}

impl PolicyAdminActionBinding {
    pub fn from_update(command: &PolicyUpdateCommand) -> Self {
        Self::Update {
            expected_revision: command.expected_revision(),
            capability: command.capability(),
            decision: command.decision(),
            resource: command.resource().clone(),
        }
    }

    pub fn from_rollback(command: &PolicyRollbackCommand) -> Self {
        Self::Rollback {
            expected_current_revision: command.expected_current_revision,
            restore_revision: command.restore_revision,
        }
    }
}

#[derive(Clone, PartialEq, Eq)]
pub struct PolicyAdminAuthorizationGrant {
    scope: PolicyAdminAuthorizationScope,
    authorization_id: String,
    requester_id: String,
    target_instance_id: String,
    target_session_id: String,
    target_fingerprint: String,
    nonce: String,
    expires_at: i64,
    action: PolicyAdminActionBinding,
}

impl fmt::Debug for PolicyAdminAuthorizationGrant {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("PolicyAdminAuthorizationGrant")
            .field("scope", &self.scope)
            .field("authorization_id", &self.authorization_id)
            .field("requester_id", &self.requester_id)
            .field("target_instance_id", &self.target_instance_id)
            .field("target_session_id", &self.target_session_id)
            .field("target_fingerprint", &"[REDACTED]")
            .field("nonce", &"[REDACTED]")
            .field("expires_at", &self.expires_at)
            .field("action", &self.action)
            .finish()
    }
}

impl PolicyAdminAuthorizationGrant {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        scope: PolicyAdminAuthorizationScope,
        authorization_id: &str,
        requester_id: &str,
        target_instance_id: &str,
        target_session_id: &str,
        target_fingerprint: &str,
        nonce: &str,
        expires_at: i64,
        action: PolicyAdminActionBinding,
    ) -> Result<Self, PolicyAdminBuildError> {
        if [
            authorization_id,
            requester_id,
            target_instance_id,
            target_session_id,
            nonce,
        ]
        .into_iter()
        .any(|value| !is_bounded_identity(value))
            || !is_sha256_fingerprint(target_fingerprint)
            || expires_at <= 0
        {
            return Err(PolicyAdminBuildError::InvalidGrant);
        }
        Ok(Self {
            scope,
            authorization_id: authorization_id.to_string(),
            requester_id: requester_id.to_string(),
            target_instance_id: target_instance_id.to_string(),
            target_session_id: target_session_id.to_string(),
            target_fingerprint: target_fingerprint.to_string(),
            nonce: nonce.to_string(),
            expires_at,
            action,
        })
    }

    pub fn scope(&self) -> PolicyAdminAuthorizationScope {
        self.scope
    }

    pub fn authorization_id(&self) -> &str {
        &self.authorization_id
    }

    pub fn requester_id(&self) -> &str {
        &self.requester_id
    }

    pub fn target_instance_id(&self) -> &str {
        &self.target_instance_id
    }

    pub fn target_session_id(&self) -> &str {
        &self.target_session_id
    }

    pub fn target_fingerprint(&self) -> &str {
        &self.target_fingerprint
    }

    pub fn nonce(&self) -> &str {
        &self.nonce
    }

    pub fn expires_at(&self) -> i64 {
        self.expires_at
    }

    pub fn action(&self) -> &PolicyAdminActionBinding {
        &self.action
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyRollbackCommand {
    target_instance_id: String,
    expected_current_revision: u64,
    restore_revision: u64,
}

/// Closed Application input produced only by an admitted admin protocol.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PolicyAdminRequest {
    Update {
        command: PolicyUpdateCommand,
        grant: PolicyAdminAuthorizationGrant,
    },
    Rollback {
        command: PolicyRollbackCommand,
        grant: PolicyAdminAuthorizationGrant,
    },
}

impl PolicyRollbackCommand {
    pub fn new(
        target_instance_id: &str,
        expected_current_revision: u64,
        restore_revision: u64,
    ) -> Result<Self, PolicyAdminBuildError> {
        if !is_bounded_identity(target_instance_id) || restore_revision >= expected_current_revision
        {
            return Err(PolicyAdminBuildError::InvalidRollback);
        }
        Ok(Self {
            target_instance_id: target_instance_id.to_string(),
            expected_current_revision,
            restore_revision,
        })
    }

    pub fn target_instance_id(&self) -> &str {
        &self.target_instance_id
    }

    pub fn expected_current_revision(&self) -> u64 {
        self.expected_current_revision
    }

    pub fn restore_revision(&self) -> u64 {
        self.restore_revision
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PolicyAdminAuthorizationRejection {
    Denied,
    Invalid,
    Expired,
    Replayed,
    ScopeMismatch,
    BindingMismatch,
    VerifierUnavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PolicyAdminAuthorizationDecision {
    Authorized,
    Rejected(PolicyAdminAuthorizationRejection),
}

pub trait PolicyAdminAuthorizationVerifier: Send + Sync {
    fn verify(&self, grant: &PolicyAdminAuthorizationGrant) -> PolicyAdminAuthorizationDecision;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PolicyAdminResult {
    Policy(PolicyRepositoryResult),
    AuthorizationRejected(PolicyAdminAuthorizationRejection),
}

pub struct PolicyAdminUseCase {
    authorization: Arc<dyn PolicyAdminAuthorizationVerifier>,
    writer: Arc<dyn PermissionPolicyAdminWriter>,
}

impl PolicyAdminUseCase {
    pub fn new(
        authorization: Arc<dyn PolicyAdminAuthorizationVerifier>,
        writer: Arc<dyn PermissionPolicyAdminWriter>,
    ) -> Self {
        Self {
            authorization,
            writer,
        }
    }

    pub fn update(
        &self,
        command: &PolicyUpdateCommand,
        grant: &PolicyAdminAuthorizationGrant,
    ) -> PolicyAdminResult {
        let expected_action = PolicyAdminActionBinding::from_update(command);
        if grant.scope != PolicyAdminAuthorizationScope::AdminPolicyWrite {
            return PolicyAdminResult::AuthorizationRejected(
                PolicyAdminAuthorizationRejection::ScopeMismatch,
            );
        }
        if grant.target_instance_id != command.target_instance_id()
            || grant.action != expected_action
        {
            return PolicyAdminResult::AuthorizationRejected(
                PolicyAdminAuthorizationRejection::BindingMismatch,
            );
        }
        self.authorize_then(
            |evidence| self.writer.update_admin(command, evidence),
            grant,
        )
    }

    pub fn rollback(
        &self,
        command: &PolicyRollbackCommand,
        grant: &PolicyAdminAuthorizationGrant,
    ) -> PolicyAdminResult {
        let expected_action = PolicyAdminActionBinding::from_rollback(command);
        if grant.scope != PolicyAdminAuthorizationScope::AdminPolicyWrite {
            return PolicyAdminResult::AuthorizationRejected(
                PolicyAdminAuthorizationRejection::ScopeMismatch,
            );
        }
        if grant.target_instance_id != command.target_instance_id || grant.action != expected_action
        {
            return PolicyAdminResult::AuthorizationRejected(
                PolicyAdminAuthorizationRejection::BindingMismatch,
            );
        }
        self.authorize_then(
            |evidence| {
                self.writer.rollback_admin(
                    command.expected_current_revision,
                    command.restore_revision,
                    evidence,
                )
            },
            grant,
        )
    }

    fn authorize_then(
        &self,
        write: impl FnOnce(&PolicyAdminAuditEvidence) -> PolicyAdminWriteResult,
        grant: &PolicyAdminAuthorizationGrant,
    ) -> PolicyAdminResult {
        match self.authorization.verify(grant) {
            PolicyAdminAuthorizationDecision::Authorized => {
                let Some(evidence) = PolicyAdminAuditEvidence::new(
                    grant.authorization_id(),
                    grant.requester_id(),
                    grant.target_instance_id(),
                    grant.target_session_id(),
                    grant.target_fingerprint(),
                    grant.nonce(),
                    grant.expires_at(),
                ) else {
                    return PolicyAdminResult::AuthorizationRejected(
                        PolicyAdminAuthorizationRejection::VerifierUnavailable,
                    );
                };
                match write(&evidence) {
                    PolicyAdminWriteResult::Policy(result) => PolicyAdminResult::Policy(result),
                    PolicyAdminWriteResult::Replayed => PolicyAdminResult::AuthorizationRejected(
                        PolicyAdminAuthorizationRejection::Replayed,
                    ),
                }
            }
            PolicyAdminAuthorizationDecision::Rejected(reason) => {
                PolicyAdminResult::AuthorizationRejected(reason)
            }
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PolicyAdminBuildError {
    InvalidGrant,
    InvalidRollback,
}

fn is_bounded_identity(value: &str) -> bool {
    !value.trim().is_empty() && value.len() <= MAX_ID_BYTES && !value.chars().any(char::is_control)
}

fn is_sha256_fingerprint(value: &str) -> bool {
    value.strip_prefix("sha256:").is_some_and(|digest| {
        digest.len() == 64 && digest.bytes().all(|byte| byte.is_ascii_hexdigit())
    })
}
