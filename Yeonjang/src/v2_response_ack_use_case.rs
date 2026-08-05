//! Application use case for exact consumer processing acknowledgement.

use std::sync::Arc;

use serde::Serialize;

use crate::protocol_v2_response_ack::V2ResponseAckEnvelope;
use crate::protocol_v2_response_ack_admission::{
    AdmittedV2ResponseAck, VerifiedReplayV2ResponseAck,
};
use crate::v2_delivery_receipt::{
    V2DeliveryAckBinding, V2DeliveryAckStoreResult, V2DeliveryReceiptStore,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct V2ResponseAckOwnerScope {
    instance_id: String,
    session_id: String,
    target_fingerprint: String,
}

impl V2ResponseAckOwnerScope {
    pub fn new(
        instance_id: impl Into<String>,
        session_id: impl Into<String>,
        target_fingerprint: impl Into<String>,
    ) -> Result<Self, V2ResponseAckOwnerScopeError> {
        let scope = Self {
            instance_id: instance_id.into(),
            session_id: session_id.into(),
            target_fingerprint: target_fingerprint.into(),
        };
        if scope.instance_id.trim().is_empty()
            || scope.session_id.trim().is_empty()
            || !is_sha256_digest(&scope.target_fingerprint)
        {
            return Err(V2ResponseAckOwnerScopeError::InvalidIdentity);
        }
        Ok(scope)
    }

    fn matches(&self, ack: &V2ResponseAckEnvelope) -> bool {
        self.instance_id == ack.target_instance_id()
            && self.session_id == ack.target_session_id()
            && self.target_fingerprint == ack.target_fingerprint()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2ResponseAckOwnerScopeError {
    InvalidIdentity,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum V2ResponseAckOutcome {
    Accepted,
    Duplicate,
    NotReady,
    NotFound,
    BindingMismatch,
    RevisionMismatch,
    StateUnavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct V2ResponseAckResult {
    outcome: V2ResponseAckOutcome,
    delivery_revision: Option<u64>,
}

impl V2ResponseAckResult {
    pub fn outcome(&self) -> V2ResponseAckOutcome {
        self.outcome
    }

    pub fn delivery_revision(&self) -> Option<u64> {
        self.delivery_revision
    }
}

pub struct V2ResponseAckUseCase {
    receipts: Arc<dyn V2DeliveryReceiptStore>,
    owner_scope: V2ResponseAckOwnerScope,
}

impl V2ResponseAckUseCase {
    pub fn new(
        receipts: Arc<dyn V2DeliveryReceiptStore>,
        owner_scope: V2ResponseAckOwnerScope,
    ) -> Self {
        Self {
            receipts,
            owner_scope,
        }
    }

    pub fn execute(&self, ack: &AdmittedV2ResponseAck<'_>) -> V2ResponseAckResult {
        self.acknowledge(ack.ack())
    }

    pub fn replay(&self, ack: &VerifiedReplayV2ResponseAck<'_>) -> V2ResponseAckResult {
        self.acknowledge(ack.ack())
    }

    fn acknowledge(&self, ack: &V2ResponseAckEnvelope) -> V2ResponseAckResult {
        if !self.owner_scope.matches(ack) {
            return result(V2ResponseAckOutcome::BindingMismatch, None);
        }
        let Some(binding) = V2DeliveryAckBinding::new(
            ack.receipt_id(),
            ack.requester_id(),
            ack.target_request_id(),
            ack.target_command_id(),
            ack.target_operation_id(),
            ack.target_idempotency_key(),
            ack.target_instance_id(),
            ack.target_session_id(),
            ack.target_fingerprint(),
            ack.terminal_revision(),
            ack.response_digest(),
        ) else {
            return result(V2ResponseAckOutcome::BindingMismatch, None);
        };
        match self.receipts.acknowledge(&binding) {
            V2DeliveryAckStoreResult::Accepted { delivery_revision } => {
                result(V2ResponseAckOutcome::Accepted, Some(delivery_revision))
            }
            V2DeliveryAckStoreResult::Duplicate { delivery_revision } => {
                result(V2ResponseAckOutcome::Duplicate, Some(delivery_revision))
            }
            V2DeliveryAckStoreResult::NotReady => result(V2ResponseAckOutcome::NotReady, None),
            V2DeliveryAckStoreResult::NotFound => result(V2ResponseAckOutcome::NotFound, None),
            V2DeliveryAckStoreResult::BindingMismatch => {
                result(V2ResponseAckOutcome::BindingMismatch, None)
            }
            V2DeliveryAckStoreResult::RevisionMismatch => {
                result(V2ResponseAckOutcome::RevisionMismatch, None)
            }
            V2DeliveryAckStoreResult::Unavailable => {
                result(V2ResponseAckOutcome::StateUnavailable, None)
            }
        }
    }
}

fn result(outcome: V2ResponseAckOutcome, delivery_revision: Option<u64>) -> V2ResponseAckResult {
    V2ResponseAckResult {
        outcome,
        delivery_revision,
    }
}

fn is_sha256_digest(value: &str) -> bool {
    value.len() == 71
        && value.strip_prefix("sha256:").is_some_and(|digest| {
            digest.len() == 64 && digest.bytes().all(|b| b.is_ascii_hexdigit())
        })
}
