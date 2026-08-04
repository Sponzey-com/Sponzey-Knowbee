//! Durable delivery receipt state, independent from execution terminal state.

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

use crate::durable_completed_store::{DurableRecordStorage, RawStoreRead, RawStoreWrite};
use crate::mqtt_v2_topics::validate_identifier;

const SCHEMA_VERSION: u16 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum V2DeliveryReceiptState {
    Queued,
    Published,
    ConsumerAcknowledged,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct V2DeliveryReceipt {
    schema_version: u16,
    receipt_id: String,
    requester_id: String,
    request_id: String,
    command_id: String,
    operation_id: String,
    idempotency_key: String,
    target_instance_id: String,
    target_session_id: String,
    target_fingerprint: String,
    terminal_revision: u64,
    response_digest: String,
    state: V2DeliveryReceiptState,
    delivery_revision: u64,
}

impl V2DeliveryReceipt {
    #[allow(clippy::too_many_arguments)]
    pub fn published(
        receipt_id: &str,
        requester_id: &str,
        request_id: &str,
        command_id: &str,
        operation_id: &str,
        idempotency_key: &str,
        target_instance_id: &str,
        target_session_id: &str,
        target_fingerprint: &str,
        terminal_revision: u64,
        response_digest: &str,
    ) -> Result<Self, V2DeliveryReceiptBuildError> {
        Self::build(
            receipt_id,
            requester_id,
            request_id,
            command_id,
            operation_id,
            idempotency_key,
            target_instance_id,
            target_session_id,
            target_fingerprint,
            terminal_revision,
            response_digest,
            V2DeliveryReceiptState::Published,
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn queued(
        receipt_id: &str,
        requester_id: &str,
        request_id: &str,
        command_id: &str,
        operation_id: &str,
        idempotency_key: &str,
        target_instance_id: &str,
        target_session_id: &str,
        target_fingerprint: &str,
        terminal_revision: u64,
        response_digest: &str,
    ) -> Result<Self, V2DeliveryReceiptBuildError> {
        Self::build(
            receipt_id,
            requester_id,
            request_id,
            command_id,
            operation_id,
            idempotency_key,
            target_instance_id,
            target_session_id,
            target_fingerprint,
            terminal_revision,
            response_digest,
            V2DeliveryReceiptState::Queued,
        )
    }

    #[allow(clippy::too_many_arguments)]
    fn build(
        receipt_id: &str,
        requester_id: &str,
        request_id: &str,
        command_id: &str,
        operation_id: &str,
        idempotency_key: &str,
        target_instance_id: &str,
        target_session_id: &str,
        target_fingerprint: &str,
        terminal_revision: u64,
        response_digest: &str,
        state: V2DeliveryReceiptState,
    ) -> Result<Self, V2DeliveryReceiptBuildError> {
        let receipt = Self {
            schema_version: SCHEMA_VERSION,
            receipt_id: receipt_id.to_string(),
            requester_id: requester_id.to_string(),
            request_id: request_id.to_string(),
            command_id: command_id.to_string(),
            operation_id: operation_id.to_string(),
            idempotency_key: idempotency_key.to_string(),
            target_instance_id: target_instance_id.to_string(),
            target_session_id: target_session_id.to_string(),
            target_fingerprint: target_fingerprint.to_string(),
            terminal_revision,
            response_digest: response_digest.to_string(),
            state,
            delivery_revision: 1,
        };
        receipt
            .validate()
            .then_some(receipt)
            .ok_or(V2DeliveryReceiptBuildError::InvalidIdentity)
    }

    pub fn state(&self) -> V2DeliveryReceiptState {
        self.state
    }

    pub fn delivery_revision(&self) -> u64 {
        self.delivery_revision
    }

    pub fn response_digest(&self) -> &str {
        &self.response_digest
    }

    pub fn receipt_id(&self) -> &str {
        &self.receipt_id
    }

    fn has_same_immutable_binding(&self, other: &Self) -> bool {
        self.schema_version == other.schema_version
            && self.receipt_id == other.receipt_id
            && self.requester_id == other.requester_id
            && self.request_id == other.request_id
            && self.command_id == other.command_id
            && self.operation_id == other.operation_id
            && self.idempotency_key == other.idempotency_key
            && self.target_instance_id == other.target_instance_id
            && self.target_session_id == other.target_session_id
            && self.target_fingerprint == other.target_fingerprint
            && self.terminal_revision == other.terminal_revision
            && self.response_digest == other.response_digest
    }

    fn has_same_terminal_delivery_binding(&self, other: &Self) -> bool {
        self.schema_version == other.schema_version
            && self.requester_id == other.requester_id
            && self.request_id == other.request_id
            && self.command_id == other.command_id
            && self.operation_id == other.operation_id
            && self.idempotency_key == other.idempotency_key
            && self.target_instance_id == other.target_instance_id
            && self.target_session_id == other.target_session_id
            && self.target_fingerprint == other.target_fingerprint
            && self.terminal_revision == other.terminal_revision
            && self.response_digest == other.response_digest
    }

    fn validate(&self) -> bool {
        self.schema_version == SCHEMA_VERSION
            && [
                self.receipt_id.as_str(),
                self.requester_id.as_str(),
                self.request_id.as_str(),
                self.command_id.as_str(),
                self.operation_id.as_str(),
                self.idempotency_key.as_str(),
                self.target_instance_id.as_str(),
                self.target_session_id.as_str(),
            ]
            .into_iter()
            .all(|value| validate_identifier(value).is_ok())
            && is_sha256_digest(&self.target_fingerprint)
            && is_sha256_digest(&self.response_digest)
            && self.terminal_revision > 0
            && self.delivery_revision > 0
            && (self.state != V2DeliveryReceiptState::ConsumerAcknowledged
                || self.delivery_revision >= 2)
    }

    fn exact_ack_binding(&self, binding: &V2DeliveryAckBinding) -> V2DeliveryAckStoreResult {
        if self.requester_id != binding.requester_id
            || self.request_id != binding.request_id
            || self.command_id != binding.command_id
            || self.operation_id != binding.operation_id
            || self.idempotency_key != binding.idempotency_key
            || self.target_instance_id != binding.target_instance_id
            || self.target_session_id != binding.target_session_id
            || self.target_fingerprint != binding.target_fingerprint
            || self.response_digest != binding.response_digest
        {
            V2DeliveryAckStoreResult::BindingMismatch
        } else if self.terminal_revision != binding.terminal_revision {
            V2DeliveryAckStoreResult::RevisionMismatch
        } else {
            V2DeliveryAckStoreResult::Accepted {
                delivery_revision: self.delivery_revision,
            }
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2DeliveryReceiptBuildError {
    InvalidIdentity,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct V2DeliveryAckBinding {
    receipt_id: String,
    requester_id: String,
    request_id: String,
    command_id: String,
    operation_id: String,
    idempotency_key: String,
    target_instance_id: String,
    target_session_id: String,
    target_fingerprint: String,
    terminal_revision: u64,
    response_digest: String,
}

impl V2DeliveryAckBinding {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        receipt_id: &str,
        requester_id: &str,
        request_id: &str,
        command_id: &str,
        operation_id: &str,
        idempotency_key: &str,
        target_instance_id: &str,
        target_session_id: &str,
        target_fingerprint: &str,
        terminal_revision: u64,
        response_digest: &str,
    ) -> Option<Self> {
        let binding = Self {
            receipt_id: receipt_id.to_string(),
            requester_id: requester_id.to_string(),
            request_id: request_id.to_string(),
            command_id: command_id.to_string(),
            operation_id: operation_id.to_string(),
            idempotency_key: idempotency_key.to_string(),
            target_instance_id: target_instance_id.to_string(),
            target_session_id: target_session_id.to_string(),
            target_fingerprint: target_fingerprint.to_string(),
            terminal_revision,
            response_digest: response_digest.to_string(),
        };
        ([
            binding.receipt_id.as_str(),
            binding.requester_id.as_str(),
            binding.request_id.as_str(),
            binding.command_id.as_str(),
            binding.operation_id.as_str(),
            binding.idempotency_key.as_str(),
            binding.target_instance_id.as_str(),
            binding.target_session_id.as_str(),
        ]
        .into_iter()
        .all(|value| validate_identifier(value).is_ok())
            && is_sha256_digest(&binding.target_fingerprint)
            && is_sha256_digest(&binding.response_digest)
            && binding.terminal_revision > 0)
            .then_some(binding)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2DeliveryRegisterResult {
    Registered,
    Duplicate,
    BindingMismatch,
    Saturated,
    Unavailable,
}

impl V2DeliveryRegisterResult {
    pub fn is_registered(self) -> bool {
        matches!(self, Self::Registered)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2DeliveryAckStoreResult {
    Accepted { delivery_revision: u64 },
    Duplicate { delivery_revision: u64 },
    NotReady,
    NotFound,
    BindingMismatch,
    RevisionMismatch,
    Unavailable,
}

pub trait V2DeliveryReceiptStore: Send + Sync {
    fn register(&self, receipt: V2DeliveryReceipt) -> V2DeliveryRegisterResult;
    fn mark_published(&self, receipt_id: &str) -> V2DeliveryPublishResult;
    fn acknowledge(&self, binding: &V2DeliveryAckBinding) -> V2DeliveryAckStoreResult;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum V2DeliveryIdentityResolution {
    Candidate,
    Existing(String),
    Conflict,
}

/// Resolves publication-independent delivery identity at the durable owner.
///
/// A legacy sequence-derived receipt remains canonical for its immutable
/// terminal binding so an upgrade neither creates a second receipt nor
/// invalidates an acknowledgement already issued to a consumer.
pub trait V2DeliveryIdentityResolver: Send + Sync {
    fn resolve_receipt_id(&self, candidate: &V2DeliveryReceipt) -> V2DeliveryIdentityResolution;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2DeliveryPublishResult {
    Published { delivery_revision: u64 },
    Duplicate { delivery_revision: u64 },
    AlreadyAcknowledged { delivery_revision: u64 },
    NotFound,
    Unavailable,
}

struct RepositoryState {
    storage_revision: u64,
    receipts: BTreeMap<String, V2DeliveryReceipt>,
}

pub struct DurableV2DeliveryRepository {
    capacity: usize,
    storage: Arc<dyn DurableRecordStorage>,
    state: Mutex<RepositoryState>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DurableV2DeliveryRepositoryError {
    InvalidCapacity,
    Corrupt,
    Duplicate,
    Saturated,
    Unavailable,
}

impl DurableV2DeliveryRepository {
    pub fn bootstrap(
        capacity: usize,
        storage: Arc<dyn DurableRecordStorage>,
    ) -> Result<Self, DurableV2DeliveryRepositoryError> {
        if capacity == 0 || capacity > u32::MAX as usize {
            return Err(DurableV2DeliveryRepositoryError::InvalidCapacity);
        }
        let (storage_revision, records) = match storage.read() {
            RawStoreRead::Missing { revision } => (revision, Vec::new()),
            RawStoreRead::Records { revision, records } => (revision, records),
            RawStoreRead::Unavailable => return Err(DurableV2DeliveryRepositoryError::Unavailable),
        };
        if records.len() > capacity {
            return Err(DurableV2DeliveryRepositoryError::Saturated);
        }
        let mut receipts = BTreeMap::new();
        for bytes in records {
            let receipt: V2DeliveryReceipt = serde_json::from_slice(&bytes)
                .map_err(|_| DurableV2DeliveryRepositoryError::Corrupt)?;
            if !receipt.validate() {
                return Err(DurableV2DeliveryRepositoryError::Corrupt);
            }
            if receipts
                .insert(receipt.receipt_id.clone(), receipt)
                .is_some()
            {
                return Err(DurableV2DeliveryRepositoryError::Duplicate);
            }
        }
        Ok(Self {
            capacity,
            storage,
            state: Mutex::new(RepositoryState {
                storage_revision,
                receipts,
            }),
        })
    }

    pub fn register(&self, receipt: V2DeliveryReceipt) -> V2DeliveryRegisterResult {
        if !receipt.validate() {
            return V2DeliveryRegisterResult::Unavailable;
        }
        let Ok(mut state) = self.state.lock() else {
            return V2DeliveryRegisterResult::Unavailable;
        };
        if let Some(existing) = state.receipts.get(&receipt.receipt_id) {
            return if existing.has_same_immutable_binding(&receipt) {
                V2DeliveryRegisterResult::Duplicate
            } else {
                V2DeliveryRegisterResult::BindingMismatch
            };
        }
        if state.receipts.len() >= self.capacity {
            return V2DeliveryRegisterResult::Saturated;
        }
        let mut next = state.receipts.clone();
        next.insert(receipt.receipt_id.clone(), receipt);
        if commit(self.storage.as_ref(), &mut state, next) {
            V2DeliveryRegisterResult::Registered
        } else {
            V2DeliveryRegisterResult::Unavailable
        }
    }

    pub fn load_exact(&self, receipt_id: &str) -> Option<V2DeliveryReceipt> {
        self.state.lock().ok()?.receipts.get(receipt_id).cloned()
    }

    pub fn resolve_receipt_id(
        &self,
        candidate: &V2DeliveryReceipt,
    ) -> V2DeliveryIdentityResolution {
        let Ok(state) = self.state.lock() else {
            return V2DeliveryIdentityResolution::Conflict;
        };
        let mut matches = state
            .receipts
            .values()
            .filter(|receipt| receipt.has_same_terminal_delivery_binding(candidate));
        let Some(existing) = matches.next() else {
            return V2DeliveryIdentityResolution::Candidate;
        };
        if matches.next().is_some() {
            return V2DeliveryIdentityResolution::Conflict;
        }
        V2DeliveryIdentityResolution::Existing(existing.receipt_id.clone())
    }
}

impl V2DeliveryIdentityResolver for DurableV2DeliveryRepository {
    fn resolve_receipt_id(&self, candidate: &V2DeliveryReceipt) -> V2DeliveryIdentityResolution {
        Self::resolve_receipt_id(self, candidate)
    }
}

impl V2DeliveryReceiptStore for DurableV2DeliveryRepository {
    fn register(&self, receipt: V2DeliveryReceipt) -> V2DeliveryRegisterResult {
        Self::register(self, receipt)
    }

    fn mark_published(&self, receipt_id: &str) -> V2DeliveryPublishResult {
        let Ok(mut state) = self.state.lock() else {
            return V2DeliveryPublishResult::Unavailable;
        };
        let Some(receipt) = state.receipts.get(receipt_id) else {
            return V2DeliveryPublishResult::NotFound;
        };
        match receipt.state {
            V2DeliveryReceiptState::Published => V2DeliveryPublishResult::Duplicate {
                delivery_revision: receipt.delivery_revision,
            },
            V2DeliveryReceiptState::ConsumerAcknowledged => {
                V2DeliveryPublishResult::AlreadyAcknowledged {
                    delivery_revision: receipt.delivery_revision,
                }
            }
            V2DeliveryReceiptState::Queued => {
                let delivery_revision = receipt.delivery_revision + 1;
                let mut next = state.receipts.clone();
                let Some(next_receipt) = next.get_mut(receipt_id) else {
                    return V2DeliveryPublishResult::Unavailable;
                };
                next_receipt.state = V2DeliveryReceiptState::Published;
                next_receipt.delivery_revision = delivery_revision;
                if commit(self.storage.as_ref(), &mut state, next) {
                    V2DeliveryPublishResult::Published { delivery_revision }
                } else {
                    V2DeliveryPublishResult::Unavailable
                }
            }
        }
    }

    fn acknowledge(&self, binding: &V2DeliveryAckBinding) -> V2DeliveryAckStoreResult {
        let Ok(mut state) = self.state.lock() else {
            return V2DeliveryAckStoreResult::Unavailable;
        };
        let Some(receipt) = state.receipts.get(&binding.receipt_id) else {
            return V2DeliveryAckStoreResult::NotFound;
        };
        let exact = receipt.exact_ack_binding(binding);
        if !matches!(exact, V2DeliveryAckStoreResult::Accepted { .. }) {
            return exact;
        }
        match receipt.state {
            V2DeliveryReceiptState::Queued => V2DeliveryAckStoreResult::NotReady,
            V2DeliveryReceiptState::ConsumerAcknowledged => V2DeliveryAckStoreResult::Duplicate {
                delivery_revision: receipt.delivery_revision,
            },
            V2DeliveryReceiptState::Published => {
                let delivery_revision = receipt.delivery_revision + 1;
                let mut next = state.receipts.clone();
                let Some(next_receipt) = next.get_mut(&binding.receipt_id) else {
                    return V2DeliveryAckStoreResult::Unavailable;
                };
                next_receipt.state = V2DeliveryReceiptState::ConsumerAcknowledged;
                next_receipt.delivery_revision += 1;
                if commit(self.storage.as_ref(), &mut state, next) {
                    V2DeliveryAckStoreResult::Accepted { delivery_revision }
                } else {
                    V2DeliveryAckStoreResult::Unavailable
                }
            }
        }
    }
}

fn commit(
    storage: &dyn DurableRecordStorage,
    state: &mut RepositoryState,
    next: BTreeMap<String, V2DeliveryReceipt>,
) -> bool {
    let records = match next
        .values()
        .map(serde_json::to_vec)
        .collect::<Result<Vec<_>, _>>()
    {
        Ok(records) => records,
        Err(_) => return false,
    };
    match storage.compare_and_swap(state.storage_revision, records) {
        RawStoreWrite::Written { revision } if revision > state.storage_revision => {
            state.storage_revision = revision;
            state.receipts = next;
            true
        }
        RawStoreWrite::Written { .. } | RawStoreWrite::Conflict | RawStoreWrite::Unavailable => {
            false
        }
    }
}

fn is_sha256_digest(value: &str) -> bool {
    value.len() == 71
        && value.strip_prefix("sha256:").is_some_and(|digest| {
            digest.len() == 64 && digest.bytes().all(|b| b.is_ascii_hexdigit())
        })
}
