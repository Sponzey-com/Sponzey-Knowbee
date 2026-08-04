use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::cancellation::{CommandTargetBinding, ExactCancellationRequest};
use crate::durable_completed_store::{DurableRecordStorage, RawStoreRead, RawStoreWrite};

const CANCELLATION_SCHEMA_VERSION: u16 = 1;
const MAX_ID_BYTES: usize = 256;
const MAX_RECORD_BYTES: usize = 4 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CancellationReceiptKey {
    cancellation_id: String,
    command_id: String,
    cancel_token_digest: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    cancellation_scope_digest: Option<String>,
    #[serde(default, skip_serializing_if = "is_false")]
    terminal_command: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CancellationReceiptOutcome {
    Prepared,
    Accepted,
    Duplicate,
    AlreadyTerminal,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DurableCancellationReceipt {
    key: CancellationReceiptKey,
    outcome: CancellationReceiptOutcome,
    observed_at_ms: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CancellationReceiptError {
    TooLarge,
    Malformed,
    UnsupportedVersion,
    InvalidRecord,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CancellationLoadResult {
    Miss,
    Exact(DurableCancellationReceipt),
    ScopeMismatch,
    Corrupt(CancellationReceiptError),
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CancellationBeginResult {
    Prepared,
    AlreadyPrepared,
    AlreadyFinalized,
    ScopeMismatch,
    Saturated,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CancellationFinalizeResult {
    Finalized,
    AlreadyFinalized,
    NotPrepared,
    ScopeMismatch,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CancellationStoreTerminalResult {
    Stored,
    AlreadyStored,
    ScopeMismatch,
    Saturated,
    Unavailable,
}

pub trait DurableCancellationReceiptStore: Send + Sync {
    fn load(&self, key: &CancellationReceiptKey) -> CancellationLoadResult;
    fn begin(&self, receipt: DurableCancellationReceipt) -> CancellationBeginResult;
    fn finalize(&self, receipt: DurableCancellationReceipt) -> CancellationFinalizeResult;
    fn store_terminal(
        &self,
        receipt: DurableCancellationReceipt,
    ) -> CancellationStoreTerminalResult;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DurableCancellationStoreBootstrapError {
    InvalidCapacity,
    Corrupt(CancellationReceiptError),
    DuplicateRecord,
    Saturated,
    Unavailable,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CancellationReceiptWire {
    schema_version: u16,
    key: CancellationReceiptKey,
    outcome: CancellationReceiptOutcome,
    observed_at_ms: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CancellationVersionProbe {
    schema_version: u16,
}

struct RepositoryState {
    revision: u64,
    receipts: BTreeMap<String, DurableCancellationReceipt>,
}

pub struct DurableCancellationReceiptRepository {
    capacity: usize,
    storage: Arc<dyn DurableRecordStorage>,
    state: Mutex<RepositoryState>,
}

impl CancellationReceiptKey {
    pub fn new(
        cancellation_id: &str,
        command_id: &str,
        cancel_token: &str,
    ) -> Result<Self, CancellationReceiptError> {
        if !valid_id(cancellation_id) || !valid_id(command_id) || !valid_id(cancel_token) {
            return Err(CancellationReceiptError::InvalidRecord);
        }
        Ok(Self {
            cancellation_id: cancellation_id.to_string(),
            command_id: command_id.to_string(),
            cancel_token_digest: format!("sha256:{:x}", Sha256::digest(cancel_token.as_bytes())),
            cancellation_scope_digest: None,
            terminal_command: false,
        })
    }

    pub fn new_exact(
        cancellation_id: &str,
        cancellation: &ExactCancellationRequest,
    ) -> Result<Self, CancellationReceiptError> {
        let mut key = Self::new(
            cancellation_id,
            cancellation.target().command_id(),
            cancellation.cancel_token(),
        )?;
        key.cancellation_scope_digest = Some(cancellation.scope_digest());
        Ok(key)
    }

    pub fn new_terminal_command(
        target: &CommandTargetBinding,
        cancel_token: &str,
    ) -> Result<Self, CancellationReceiptError> {
        if !valid_id(cancel_token) {
            return Err(CancellationReceiptError::InvalidRecord);
        }
        let target_digest = target.scope_digest();
        Ok(Self {
            cancellation_id: format!(
                "sha256:{:x}",
                Sha256::digest(target.command_id().as_bytes())
            ),
            command_id: target_digest.clone(),
            cancel_token_digest: format!("sha256:{:x}", Sha256::digest(cancel_token.as_bytes())),
            cancellation_scope_digest: Some(target_digest),
            terminal_command: true,
        })
    }

    fn is_valid(&self) -> bool {
        let common = valid_id(&self.cancellation_id)
            && valid_id(&self.command_id)
            && valid_digest(&self.cancel_token_digest)
            && self
                .cancellation_scope_digest
                .as_deref()
                .is_none_or(valid_digest);
        common
            && (!self.terminal_command
                || (valid_digest(&self.cancellation_id)
                    && valid_digest(&self.command_id)
                    && self.cancellation_scope_digest.as_deref() == Some(&self.command_id)))
    }

    fn storage_key(&self) -> String {
        let namespace = if self.terminal_command {
            "terminal"
        } else {
            "cancellation"
        };
        format!("{namespace}:{}", self.cancellation_id)
    }
}

fn is_false(value: &bool) -> bool {
    !*value
}

impl DurableCancellationReceipt {
    pub fn new(
        key: CancellationReceiptKey,
        outcome: CancellationReceiptOutcome,
        observed_at_ms: i64,
    ) -> Result<Self, CancellationReceiptError> {
        if !key.is_valid() || observed_at_ms <= 0 {
            return Err(CancellationReceiptError::InvalidRecord);
        }
        Ok(Self {
            key,
            outcome,
            observed_at_ms,
        })
    }

    pub fn key(&self) -> &CancellationReceiptKey {
        &self.key
    }

    pub fn outcome(&self) -> CancellationReceiptOutcome {
        self.outcome
    }

    fn encode(&self) -> Result<Vec<u8>, CancellationReceiptError> {
        let encoded = serde_json::to_vec(&CancellationReceiptWire {
            schema_version: CANCELLATION_SCHEMA_VERSION,
            key: self.key.clone(),
            outcome: self.outcome,
            observed_at_ms: self.observed_at_ms,
        })
        .map_err(|_| CancellationReceiptError::Malformed)?;
        if encoded.len() > MAX_RECORD_BYTES {
            return Err(CancellationReceiptError::TooLarge);
        }
        Ok(encoded)
    }

    fn decode(encoded: &[u8]) -> Result<Self, CancellationReceiptError> {
        if encoded.len() > MAX_RECORD_BYTES {
            return Err(CancellationReceiptError::TooLarge);
        }
        let probe = serde_json::from_slice::<CancellationVersionProbe>(encoded)
            .map_err(|_| CancellationReceiptError::Malformed)?;
        if probe.schema_version != CANCELLATION_SCHEMA_VERSION {
            return Err(CancellationReceiptError::UnsupportedVersion);
        }
        let wire = serde_json::from_slice::<CancellationReceiptWire>(encoded)
            .map_err(|_| CancellationReceiptError::Malformed)?;
        Self::new(wire.key, wire.outcome, wire.observed_at_ms)
    }
}

impl DurableCancellationReceiptRepository {
    pub fn bootstrap(
        capacity: usize,
        storage: Arc<dyn DurableRecordStorage>,
    ) -> Result<Self, DurableCancellationStoreBootstrapError> {
        if capacity == 0 || capacity > u32::MAX as usize {
            return Err(DurableCancellationStoreBootstrapError::InvalidCapacity);
        }
        let (revision, encoded) = match storage.read() {
            RawStoreRead::Missing { revision } => (revision, Vec::new()),
            RawStoreRead::Records { revision, records } => (revision, records),
            RawStoreRead::Unavailable => {
                return Err(DurableCancellationStoreBootstrapError::Unavailable);
            }
        };
        if encoded.len() > capacity {
            return Err(DurableCancellationStoreBootstrapError::Saturated);
        }
        let mut receipts = BTreeMap::new();
        for encoded in encoded {
            let receipt = DurableCancellationReceipt::decode(&encoded)
                .map_err(DurableCancellationStoreBootstrapError::Corrupt)?;
            if receipts
                .insert(receipt.key.storage_key(), receipt)
                .is_some()
            {
                return Err(DurableCancellationStoreBootstrapError::DuplicateRecord);
            }
        }
        Ok(Self {
            capacity,
            storage,
            state: Mutex::new(RepositoryState { revision, receipts }),
        })
    }

    fn commit(
        &self,
        state: &mut RepositoryState,
        receipts: BTreeMap<String, DurableCancellationReceipt>,
    ) -> bool {
        let mut encoded = Vec::with_capacity(receipts.len());
        for receipt in receipts.values() {
            let bytes = match receipt.encode() {
                Ok(bytes) => bytes,
                Err(_) => return false,
            };
            encoded.push(bytes);
        }
        match self.storage.compare_and_swap(state.revision, encoded) {
            RawStoreWrite::Written { revision } if revision > state.revision => {
                state.revision = revision;
                state.receipts = receipts;
                true
            }
            RawStoreWrite::Written { .. }
            | RawStoreWrite::Conflict
            | RawStoreWrite::Unavailable => false,
        }
    }
}

impl DurableCancellationReceiptStore for DurableCancellationReceiptRepository {
    fn load(&self, key: &CancellationReceiptKey) -> CancellationLoadResult {
        let state = match self.state.lock() {
            Ok(state) => state,
            Err(_) => return CancellationLoadResult::Unavailable,
        };
        match state.receipts.get(&key.storage_key()) {
            None => CancellationLoadResult::Miss,
            Some(receipt) if receipt.key() == key => CancellationLoadResult::Exact(receipt.clone()),
            Some(_) => CancellationLoadResult::ScopeMismatch,
        }
    }

    fn begin(&self, receipt: DurableCancellationReceipt) -> CancellationBeginResult {
        if receipt.outcome != CancellationReceiptOutcome::Prepared {
            return CancellationBeginResult::Unavailable;
        }
        let mut state = match self.state.lock() {
            Ok(state) => state,
            Err(_) => return CancellationBeginResult::Unavailable,
        };
        if let Some(existing) = state.receipts.get(&receipt.key.storage_key()) {
            if existing.key() != receipt.key() {
                return CancellationBeginResult::ScopeMismatch;
            }
            return if existing.outcome == CancellationReceiptOutcome::Prepared {
                CancellationBeginResult::AlreadyPrepared
            } else {
                CancellationBeginResult::AlreadyFinalized
            };
        }
        if state.receipts.len() >= self.capacity {
            return CancellationBeginResult::Saturated;
        }
        let mut next = state.receipts.clone();
        next.insert(receipt.key.storage_key(), receipt);
        if self.commit(&mut state, next) {
            CancellationBeginResult::Prepared
        } else {
            CancellationBeginResult::Unavailable
        }
    }

    fn finalize(&self, receipt: DurableCancellationReceipt) -> CancellationFinalizeResult {
        if receipt.outcome == CancellationReceiptOutcome::Prepared {
            return CancellationFinalizeResult::Unavailable;
        }
        let mut state = match self.state.lock() {
            Ok(state) => state,
            Err(_) => return CancellationFinalizeResult::Unavailable,
        };
        let Some(existing) = state.receipts.get(&receipt.key.storage_key()) else {
            return CancellationFinalizeResult::NotPrepared;
        };
        if existing.key() != receipt.key() {
            return CancellationFinalizeResult::ScopeMismatch;
        }
        if existing.outcome != CancellationReceiptOutcome::Prepared {
            return CancellationFinalizeResult::AlreadyFinalized;
        }
        let mut next = state.receipts.clone();
        next.insert(receipt.key.storage_key(), receipt);
        if self.commit(&mut state, next) {
            CancellationFinalizeResult::Finalized
        } else {
            CancellationFinalizeResult::Unavailable
        }
    }

    fn store_terminal(
        &self,
        receipt: DurableCancellationReceipt,
    ) -> CancellationStoreTerminalResult {
        if receipt.outcome == CancellationReceiptOutcome::Prepared {
            return CancellationStoreTerminalResult::Unavailable;
        }
        let mut state = match self.state.lock() {
            Ok(state) => state,
            Err(_) => return CancellationStoreTerminalResult::Unavailable,
        };
        if let Some(existing) = state.receipts.get(&receipt.key.storage_key()) {
            return if existing.key() == receipt.key() && existing.outcome == receipt.outcome {
                CancellationStoreTerminalResult::AlreadyStored
            } else {
                CancellationStoreTerminalResult::ScopeMismatch
            };
        }
        if state.receipts.len() >= self.capacity {
            if !receipt.key.terminal_command {
                return CancellationStoreTerminalResult::Saturated;
            }
            let oldest_terminal = state
                .receipts
                .iter()
                .filter(|(_, candidate)| candidate.key.terminal_command)
                .min_by(|(left_key, left), (right_key, right)| {
                    left.observed_at_ms
                        .cmp(&right.observed_at_ms)
                        .then_with(|| left_key.cmp(right_key))
                })
                .map(|(key, _)| key.clone());
            let Some(oldest_terminal) = oldest_terminal else {
                return CancellationStoreTerminalResult::Saturated;
            };
            let mut next = state.receipts.clone();
            next.remove(&oldest_terminal);
            next.insert(receipt.key.storage_key(), receipt);
            return if self.commit(&mut state, next) {
                CancellationStoreTerminalResult::Stored
            } else {
                CancellationStoreTerminalResult::Unavailable
            };
        }
        let mut next = state.receipts.clone();
        next.insert(receipt.key.storage_key(), receipt);
        if self.commit(&mut state, next) {
            CancellationStoreTerminalResult::Stored
        } else {
            CancellationStoreTerminalResult::Unavailable
        }
    }
}

fn valid_id(value: &str) -> bool {
    !value.is_empty() && value.len() <= MAX_ID_BYTES && value.trim() == value
}

fn valid_digest(value: &str) -> bool {
    value.strip_prefix("sha256:").is_some_and(|digest| {
        digest.len() == 64 && digest.bytes().all(|byte| byte.is_ascii_hexdigit())
    })
}
