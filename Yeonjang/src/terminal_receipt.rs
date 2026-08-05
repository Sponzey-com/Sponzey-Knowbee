//! Immutable terminal receipt contract with independent execution and delivery.

use std::fmt;

use serde::{Deserialize, Serialize};

use crate::platform_execution::{EffectState, ExecutionFailure, ExecutionStage};
use crate::platform_operation::{BoundPlatformOperation, PlatformResource, TargetPlatform};

const TERMINAL_RECEIPT_SCHEMA_VERSION: u16 = 1;

/// Final knowledge about the requested effect.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionOutcome {
    Blocked,
    Failed,
    Cancelled,
    EffectUnknown,
    Succeeded,
}

/// Delivery state of the terminal receipt, independent from execution.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeliveryOutcome {
    NotStarted,
    Queued,
    Published,
    ConsumerAcknowledged,
    PendingRetry,
    Failed,
    Expired,
}

impl DeliveryOutcome {
    fn requires_failure(self) -> bool {
        matches!(self, Self::PendingRetry | Self::Failed | Self::Expired)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct TerminalTarget {
    platform: TargetPlatform,
    instance_id: String,
    session_id: String,
    fingerprint: String,
}

/// Versioned exact-identity receipt suitable for durable storage and v2 projection.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TerminalReceipt {
    schema_version: u16,
    request_id: String,
    command_id: String,
    operation_id: String,
    requester_id: String,
    target: TerminalTarget,
    method: String,
    resource: PlatformResource,
    idempotency_key: String,
    binding_digest: String,
    execution_outcome: ExecutionOutcome,
    delivery_outcome: DeliveryOutcome,
    terminal_revision: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    failure: Option<ExecutionFailure>,
}

impl TerminalReceipt {
    /// Builds one receipt only when outcome and effect claims are consistent.
    pub fn new(
        operation: &BoundPlatformOperation,
        execution_outcome: ExecutionOutcome,
        delivery_outcome: DeliveryOutcome,
        terminal_revision: u64,
        failure: Option<ExecutionFailure>,
    ) -> Result<Self, TerminalReceiptError> {
        if terminal_revision == 0 {
            return Err(TerminalReceiptError::InvalidRevision);
        }
        if (execution_outcome != ExecutionOutcome::Succeeded || delivery_outcome.requires_failure())
            && failure.is_none()
        {
            return Err(TerminalReceiptError::MissingFailure);
        }
        if let Some(failure) = failure.as_ref() {
            if failure.correlation_id() != operation.binding_digest() {
                return Err(TerminalReceiptError::FailureBindingMismatch);
            }
            if execution_outcome == ExecutionOutcome::Blocked
                && !matches!(
                    failure.effect_state(),
                    EffectState::NotStarted | EffectState::ConfirmedNotApplied
                )
            {
                return Err(TerminalReceiptError::BlockedHasInvalidEffectState);
            }
            if execution_outcome == ExecutionOutcome::EffectUnknown
                && failure.effect_state() != EffectState::Unknown
            {
                return Err(TerminalReceiptError::EffectUnknownRequiresUnknownEffect);
            }
            if execution_outcome == ExecutionOutcome::Succeeded
                && (failure.effect_state() != EffectState::ConfirmedApplied
                    || !is_delivery_or_cleanup_stage(failure.stage()))
            {
                return Err(TerminalReceiptError::SucceededHasInvalidFailure);
            }
        }
        Ok(Self {
            schema_version: TERMINAL_RECEIPT_SCHEMA_VERSION,
            request_id: operation.request_id().to_string(),
            command_id: operation.command_id().to_string(),
            operation_id: operation.operation_id().to_string(),
            requester_id: operation.requester_id().to_string(),
            target: TerminalTarget {
                platform: operation.target_platform(),
                instance_id: operation.target_instance_id().to_string(),
                session_id: operation.target_session_id().to_string(),
                fingerprint: operation.target_fingerprint().to_string(),
            },
            method: operation.command().method_code().to_string(),
            resource: operation.command().resource(),
            idempotency_key: operation.idempotency_key().to_string(),
            binding_digest: operation.binding_digest().to_string(),
            execution_outcome,
            delivery_outcome,
            terminal_revision,
            failure,
        })
    }

    pub fn execution_outcome(&self) -> ExecutionOutcome {
        self.execution_outcome
    }

    pub fn delivery_outcome(&self) -> DeliveryOutcome {
        self.delivery_outcome
    }

    pub fn failure(&self) -> Option<&ExecutionFailure> {
        self.failure.as_ref()
    }

    pub fn binding_digest(&self) -> &str {
        &self.binding_digest
    }

    pub fn terminal_revision(&self) -> u64 {
        self.terminal_revision
    }

    pub(crate) fn validate_stored(&self) -> bool {
        if self.schema_version != TERMINAL_RECEIPT_SCHEMA_VERSION
            || self.terminal_revision == 0
            || !is_bounded_identity(&self.request_id)
            || !is_bounded_identity(&self.command_id)
            || !is_bounded_identity(&self.operation_id)
            || !is_bounded_identity(&self.requester_id)
            || !is_bounded_identity(&self.target.instance_id)
            || !is_bounded_identity(&self.target.session_id)
            || !is_sha256_digest(&self.target.fingerprint)
            || !is_bounded_identity(&self.method)
            || !is_bounded_identity(&self.idempotency_key)
            || !is_sha256_digest(&self.binding_digest)
            || ((self.execution_outcome != ExecutionOutcome::Succeeded
                || self.delivery_outcome.requires_failure())
                && self.failure.is_none())
        {
            return false;
        }
        let Some(failure) = self.failure.as_ref() else {
            return true;
        };
        if failure.validate().is_err() || failure.correlation_id() != self.binding_digest {
            return false;
        }
        if self.execution_outcome == ExecutionOutcome::Blocked
            && !matches!(
                failure.effect_state(),
                EffectState::NotStarted | EffectState::ConfirmedNotApplied
            )
        {
            return false;
        }
        if self.execution_outcome == ExecutionOutcome::EffectUnknown
            && failure.effect_state() != EffectState::Unknown
        {
            return false;
        }
        self.execution_outcome != ExecutionOutcome::Succeeded
            || (failure.effect_state() == EffectState::ConfirmedApplied
                && is_delivery_or_cleanup_stage(failure.stage()))
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
        &self.target.instance_id
    }

    pub(crate) fn target_session_id(&self) -> &str {
        &self.target.session_id
    }

    pub(crate) fn target_fingerprint(&self) -> &str {
        &self.target.fingerprint
    }

    pub(crate) fn idempotency_key(&self) -> &str {
        &self.idempotency_key
    }
}

/// Contradictory or incomplete terminal claims rejected before persistence.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TerminalReceiptError {
    InvalidRevision,
    MissingFailure,
    FailureBindingMismatch,
    BlockedHasInvalidEffectState,
    EffectUnknownRequiresUnknownEffect,
    SucceededHasInvalidFailure,
}

impl fmt::Display for TerminalReceiptError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::InvalidRevision => "terminal revision must be positive",
            Self::MissingFailure => "non-success terminal requires a typed failure",
            Self::FailureBindingMismatch => "failure correlation does not match the operation",
            Self::BlockedHasInvalidEffectState => "blocked terminal has an invalid effect state",
            Self::EffectUnknownRequiresUnknownEffect => {
                "effect-unknown terminal requires unknown effect evidence"
            }
            Self::SucceededHasInvalidFailure => {
                "successful execution can only carry a confirmed delivery or cleanup failure"
            }
        })
    }
}

impl std::error::Error for TerminalReceiptError {}

fn is_delivery_or_cleanup_stage(stage: ExecutionStage) -> bool {
    matches!(
        stage,
        ExecutionStage::ResponseEnqueue
            | ExecutionStage::ResponsePublish
            | ExecutionStage::ArtifactTransfer
            | ExecutionStage::CleanupRecovery
    )
}

fn is_bounded_identity(value: &str) -> bool {
    !value.trim().is_empty() && value.len() <= 256
}

fn is_sha256_digest(value: &str) -> bool {
    value.len() == 71
        && value
            .strip_prefix("sha256:")
            .is_some_and(|digest| digest.bytes().all(|byte| byte.is_ascii_hexdigit()))
}
