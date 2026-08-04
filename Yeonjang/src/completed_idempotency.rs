use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::protocol::{Request, Response};

const MAX_ID_BYTES: usize = 256;
const MAX_METHOD_BYTES: usize = 128;
const MAX_RESOURCE_BYTES: usize = 128;
const MAX_TARGET_BYTES: usize = 512;
const MAX_RESPONSE_REFERENCE_BYTES: usize = 512;
const MAX_ERROR_CODE_BYTES: usize = 128;
const MAX_DURABLE_RECORD_BYTES: usize = 8 * 1024;
const DURABLE_RECORD_SCHEMA_VERSION: u16 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CompletedRequestKey {
    authorization_id: String,
    method: String,
    resource_scope: String,
    command_id: String,
    operation_id: String,
    target_session_id: String,
    target_fingerprint: String,
    idempotency_key: String,
    expires_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "outcome", rename_all = "snake_case", deny_unknown_fields)]
pub enum DurableTerminalOutcome {
    EffectStateUnknown {
        observed_at_ms: i64,
    },
    Succeeded {
        response_digest: String,
        response_reference: String,
    },
    Failed {
        response_digest: String,
        response_reference: String,
        error_code: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DurableCompletedRecord {
    key: CompletedRequestKey,
    terminal: DurableTerminalOutcome,
    finalized_at_ms: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DurableRecordError {
    TooLarge,
    Malformed,
    UnsupportedVersion,
    InvalidRecord,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DurableLoadResult {
    Miss,
    Exact(Box<DurableCompletedRecord>),
    ScopeMismatch,
    Corrupt(DurableRecordError),
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DurableSaveResult {
    Stored,
    AlreadyStored,
    ScopeMismatch,
    Saturated,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DurableReserveResult {
    Reserved,
    AlreadyReserved,
    AlreadyCompleted,
    ScopeMismatch,
    Saturated,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DurableFinalizeResult {
    Finalized,
    AlreadyFinalized,
    NotReserved,
    ScopeMismatch,
    Unavailable,
}

pub trait DurableCompletedRecordStore: Send + Sync {
    fn load(&self, key: &CompletedRequestKey) -> DurableLoadResult;
    fn save(&self, record: DurableCompletedRecord) -> DurableSaveResult;
    fn reserve(&self, _: DurableCompletedRecord) -> DurableReserveResult {
        DurableReserveResult::Unavailable
    }
    fn finalize(&self, _: DurableCompletedRecord) -> DurableFinalizeResult {
        DurableFinalizeResult::Unavailable
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DurableRecordWire {
    schema_version: u16,
    key: CompletedRequestKey,
    terminal: DurableTerminalOutcome,
    finalized_at_ms: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DurableVersionProbe {
    schema_version: u16,
}

impl DurableCompletedRecord {
    pub fn new(
        key: CompletedRequestKey,
        terminal: DurableTerminalOutcome,
        finalized_at_ms: i64,
    ) -> Result<Self, DurableRecordError> {
        if !key.is_valid() || !terminal.is_valid() || finalized_at_ms <= 0 {
            return Err(DurableRecordError::InvalidRecord);
        }
        Ok(Self {
            key,
            terminal,
            finalized_at_ms,
        })
    }

    pub fn encode(&self) -> Result<Vec<u8>, DurableRecordError> {
        let encoded = serde_json::to_vec(&DurableRecordWire {
            schema_version: DURABLE_RECORD_SCHEMA_VERSION,
            key: self.key.clone(),
            terminal: self.terminal.clone(),
            finalized_at_ms: self.finalized_at_ms,
        })
        .map_err(|_| DurableRecordError::Malformed)?;
        if encoded.len() > MAX_DURABLE_RECORD_BYTES {
            return Err(DurableRecordError::TooLarge);
        }
        Ok(encoded)
    }

    pub fn decode(encoded: &[u8]) -> Result<Self, DurableRecordError> {
        if encoded.len() > MAX_DURABLE_RECORD_BYTES {
            return Err(DurableRecordError::TooLarge);
        }
        let version = serde_json::from_slice::<DurableVersionProbe>(encoded)
            .map_err(|_| DurableRecordError::Malformed)?;
        if version.schema_version != DURABLE_RECORD_SCHEMA_VERSION {
            return Err(DurableRecordError::UnsupportedVersion);
        }
        let wire = serde_json::from_slice::<DurableRecordWire>(encoded)
            .map_err(|_| DurableRecordError::Malformed)?;
        Self::new(wire.key, wire.terminal, wire.finalized_at_ms)
    }

    pub fn key(&self) -> &CompletedRequestKey {
        &self.key
    }

    pub fn terminal(&self) -> &DurableTerminalOutcome {
        &self.terminal
    }

    pub fn finalized_at_ms(&self) -> i64 {
        self.finalized_at_ms
    }

    pub fn response_digest(&self) -> Option<&str> {
        match &self.terminal {
            DurableTerminalOutcome::EffectStateUnknown { .. } => None,
            DurableTerminalOutcome::Succeeded {
                response_digest, ..
            }
            | DurableTerminalOutcome::Failed {
                response_digest, ..
            } => Some(response_digest),
        }
    }

    pub fn response_reference(&self) -> Option<&str> {
        match &self.terminal {
            DurableTerminalOutcome::EffectStateUnknown { .. } => None,
            DurableTerminalOutcome::Succeeded {
                response_reference, ..
            }
            | DurableTerminalOutcome::Failed {
                response_reference, ..
            } => Some(response_reference),
        }
    }

    pub fn is_effect_state_unknown(&self) -> bool {
        matches!(
            self.terminal,
            DurableTerminalOutcome::EffectStateUnknown { .. }
        )
    }
}

impl CompletedRequestKey {
    fn is_valid(&self) -> bool {
        valid_required(&self.authorization_id, MAX_ID_BYTES)
            && valid_required(&self.method, MAX_METHOD_BYTES)
            && valid_required(&self.resource_scope, MAX_RESOURCE_BYTES)
            && valid_required(&self.command_id, MAX_ID_BYTES)
            && valid_required(&self.operation_id, MAX_ID_BYTES)
            && valid_required(&self.target_session_id, MAX_ID_BYTES)
            && valid_required(&self.target_fingerprint, MAX_TARGET_BYTES)
            && valid_required(&self.idempotency_key, MAX_ID_BYTES)
    }

    pub(crate) fn storage_key(&self) -> &str {
        &self.idempotency_key
    }

    pub(crate) fn expires_at(&self) -> i64 {
        self.expires_at
    }
}

impl DurableTerminalOutcome {
    fn is_valid(&self) -> bool {
        match self {
            Self::EffectStateUnknown { observed_at_ms } => *observed_at_ms > 0,
            Self::Succeeded {
                response_digest,
                response_reference,
            } => {
                valid_digest(response_digest)
                    && valid_required(response_reference, MAX_RESPONSE_REFERENCE_BYTES)
            }
            Self::Failed {
                response_digest,
                response_reference,
                error_code,
            } => {
                valid_digest(response_digest)
                    && valid_required(response_reference, MAX_RESPONSE_REFERENCE_BYTES)
                    && valid_required(error_code, MAX_ERROR_CODE_BYTES)
            }
        }
    }
}

fn valid_digest(value: &str) -> bool {
    value.strip_prefix("sha256:").is_some_and(|digest| {
        digest.len() == 64 && digest.bytes().all(|byte| byte.is_ascii_hexdigit())
    })
}

fn valid_required(value: &str, max_bytes: usize) -> bool {
    !value.is_empty() && value.len() <= max_bytes && value.trim() == value
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompletedKeyError {
    MissingBinding,
    InvalidField,
    ScopeMismatch,
}

impl CompletedRequestKey {
    pub fn from_request(
        request: &Request,
        resource_scope: &str,
    ) -> Result<Self, CompletedKeyError> {
        let receipt = request
            .metadata
            .authorization_receipt
            .as_ref()
            .ok_or(CompletedKeyError::MissingBinding)?;
        let command_id = required(request.metadata.command_id.as_deref(), MAX_ID_BYTES)?;
        let operation_id = required(request.metadata.operation_id.as_deref(), MAX_ID_BYTES)?;
        let target_session_id =
            required(request.metadata.target_session_id.as_deref(), MAX_ID_BYTES)?;
        let target_fingerprint = required(
            request.metadata.target_fingerprint.as_deref(),
            MAX_TARGET_BYTES,
        )?;
        let idempotency_key = required(request.metadata.idempotency_key.as_deref(), MAX_ID_BYTES)?;
        let expires_at = request
            .metadata
            .expires_at
            .ok_or(CompletedKeyError::MissingBinding)?;
        let method = required(Some(&request.method), MAX_METHOD_BYTES)?;
        let resource_scope = required(Some(resource_scope), MAX_RESOURCE_BYTES)?;
        let authorization_id = required(Some(&receipt.authorization_id), MAX_ID_BYTES)?;

        if receipt.method != method
            || receipt.resource_scope != resource_scope
            || receipt.command_id != command_id
            || receipt.operation_id != operation_id
            || receipt.target_session_id != target_session_id
            || receipt.target_fingerprint != target_fingerprint
            || receipt.idempotency_key != idempotency_key
            || receipt.expires_at != expires_at
        {
            return Err(CompletedKeyError::ScopeMismatch);
        }

        Ok(Self {
            authorization_id,
            method,
            resource_scope,
            command_id,
            operation_id,
            target_session_id,
            target_fingerprint,
            idempotency_key,
            expires_at,
        })
    }
}

fn required(value: Option<&str>, max_bytes: usize) -> Result<String, CompletedKeyError> {
    let value = value.ok_or(CompletedKeyError::MissingBinding)?;
    let normalized = value.trim();
    if normalized.is_empty() || normalized.len() > max_bytes || normalized != value {
        return Err(CompletedKeyError::InvalidField);
    }
    Ok(normalized.to_string())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompletedStoreBuildError {
    InvalidCapacity,
}

#[derive(Debug, Clone)]
pub enum LookupResult {
    Miss,
    InProgress,
    Exact(Box<Response>),
    ScopeMismatch,
    Unavailable,
}

#[derive(Debug, Clone)]
pub enum ClaimResult {
    Claimed,
    InProgress,
    Completed(Box<Response>),
    ScopeMismatch,
    Saturated,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompleteResult {
    Completed,
    AlreadyCompleted,
    NotClaimed,
    ScopeMismatch,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AbandonResult {
    Abandoned,
    NotClaimed,
    AlreadyCompleted,
    ScopeMismatch,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StoreResult {
    Stored,
    AlreadyStored,
    ScopeMismatch,
    Saturated,
    Unavailable,
}

pub trait CompletedResponseStore: Send + Sync {
    fn lookup(&self, key: &CompletedRequestKey) -> LookupResult;
    fn claim(&self, key: CompletedRequestKey) -> ClaimResult;
    fn complete(&self, key: &CompletedRequestKey, response: Response) -> CompleteResult;
    fn abandon(&self, key: &CompletedRequestKey) -> AbandonResult;
}

struct CompletedRecord {
    key: CompletedRequestKey,
    state: RecordState,
}

enum RecordState {
    Pending,
    Completed(Box<Response>),
}

pub struct CompletedResponseRepository {
    capacity: usize,
    records: Mutex<HashMap<String, CompletedRecord>>,
}

impl CompletedResponseRepository {
    pub fn new(capacity: usize) -> Result<Self, CompletedStoreBuildError> {
        if capacity == 0 || capacity > u32::MAX as usize {
            return Err(CompletedStoreBuildError::InvalidCapacity);
        }
        Ok(Self {
            capacity,
            records: Mutex::new(HashMap::new()),
        })
    }

    pub fn lookup(&self, key: &CompletedRequestKey) -> LookupResult {
        let records = match self.records.lock() {
            Ok(records) => records,
            Err(_) => return LookupResult::Unavailable,
        };
        match records.get(&key.idempotency_key) {
            None => LookupResult::Miss,
            Some(record) if record.key == *key => match &record.state {
                RecordState::Pending => LookupResult::InProgress,
                RecordState::Completed(response) => LookupResult::Exact(response.clone()),
            },
            Some(_) => LookupResult::ScopeMismatch,
        }
    }

    pub fn store(&self, key: CompletedRequestKey, response: Response) -> StoreResult {
        let mut records = match self.records.lock() {
            Ok(records) => records,
            Err(_) => return StoreResult::Unavailable,
        };
        if let Some(record) = records.get(&key.idempotency_key) {
            return if record.key == key {
                StoreResult::AlreadyStored
            } else {
                StoreResult::ScopeMismatch
            };
        }
        if records.len() >= self.capacity {
            return StoreResult::Saturated;
        }
        records.insert(
            key.idempotency_key.clone(),
            CompletedRecord {
                key,
                state: RecordState::Completed(Box::new(response)),
            },
        );
        StoreResult::Stored
    }

    pub fn claim(&self, key: CompletedRequestKey) -> ClaimResult {
        let mut records = match self.records.lock() {
            Ok(records) => records,
            Err(_) => return ClaimResult::Unavailable,
        };
        if let Some(record) = records.get(&key.idempotency_key) {
            if record.key != key {
                return ClaimResult::ScopeMismatch;
            }
            return match &record.state {
                RecordState::Pending => ClaimResult::InProgress,
                RecordState::Completed(response) => ClaimResult::Completed(response.clone()),
            };
        }
        if records.len() >= self.capacity {
            return ClaimResult::Saturated;
        }
        records.insert(
            key.idempotency_key.clone(),
            CompletedRecord {
                key,
                state: RecordState::Pending,
            },
        );
        ClaimResult::Claimed
    }

    pub fn complete(&self, key: &CompletedRequestKey, response: Response) -> CompleteResult {
        let mut records = match self.records.lock() {
            Ok(records) => records,
            Err(_) => return CompleteResult::Unavailable,
        };
        let Some(record) = records.get_mut(&key.idempotency_key) else {
            return CompleteResult::NotClaimed;
        };
        if record.key != *key {
            return CompleteResult::ScopeMismatch;
        }
        match record.state {
            RecordState::Pending => {
                record.state = RecordState::Completed(Box::new(response));
                CompleteResult::Completed
            }
            RecordState::Completed(_) => CompleteResult::AlreadyCompleted,
        }
    }

    pub fn abandon(&self, key: &CompletedRequestKey) -> AbandonResult {
        let mut records = match self.records.lock() {
            Ok(records) => records,
            Err(_) => return AbandonResult::Unavailable,
        };
        let Some(record) = records.get(&key.idempotency_key) else {
            return AbandonResult::NotClaimed;
        };
        if record.key != *key {
            return AbandonResult::ScopeMismatch;
        }
        if matches!(record.state, RecordState::Completed(_)) {
            return AbandonResult::AlreadyCompleted;
        }
        records.remove(&key.idempotency_key);
        AbandonResult::Abandoned
    }
}

impl CompletedResponseStore for CompletedResponseRepository {
    fn lookup(&self, key: &CompletedRequestKey) -> LookupResult {
        CompletedResponseRepository::lookup(self, key)
    }

    fn claim(&self, key: CompletedRequestKey) -> ClaimResult {
        CompletedResponseRepository::claim(self, key)
    }

    fn complete(&self, key: &CompletedRequestKey, response: Response) -> CompleteResult {
        CompletedResponseRepository::complete(self, key, response)
    }

    fn abandon(&self, key: &CompletedRequestKey) -> AbandonResult {
        CompletedResponseRepository::abandon(self, key)
    }
}
