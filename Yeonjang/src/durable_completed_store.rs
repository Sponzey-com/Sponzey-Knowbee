use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

use crate::completed_idempotency::{
    CompletedRequestKey, DurableCompletedRecord, DurableCompletedRecordStore,
    DurableFinalizeResult, DurableLoadResult, DurableRecordError, DurableReserveResult,
    DurableSaveResult,
};

pub enum RawStoreRead {
    Missing {
        revision: u64,
    },
    Records {
        revision: u64,
        records: Vec<Vec<u8>>,
    },
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RawStoreWrite {
    Written { revision: u64 },
    Conflict,
    Unavailable,
}

pub trait DurableRecordStorage: Send + Sync {
    fn read(&self) -> RawStoreRead;
    fn compare_and_swap(&self, expected_revision: u64, records: Vec<Vec<u8>>) -> RawStoreWrite;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DurableStoreBootstrapError {
    InvalidCapacity,
    Corrupt(DurableRecordError),
    DuplicateRecord,
    Saturated,
    Unavailable,
}

struct RepositoryState {
    revision: u64,
    records: BTreeMap<String, DurableCompletedRecord>,
}

pub struct DurableRecordRepository {
    capacity: usize,
    storage: Arc<dyn DurableRecordStorage>,
    state: Mutex<RepositoryState>,
}

#[derive(Clone)]
pub(crate) struct RetentionRecord {
    pub key: CompletedRequestKey,
    pub response_reference: String,
    pub expires_at: i64,
    pub finalized_at_ms: i64,
}

pub(crate) enum RetentionRecordRemoveResult {
    Removed,
    Missing,
    Changed,
    Unavailable,
}

impl DurableRecordRepository {
    pub fn bootstrap(
        capacity: usize,
        storage: Arc<dyn DurableRecordStorage>,
    ) -> Result<Self, DurableStoreBootstrapError> {
        if capacity == 0 || capacity > u32::MAX as usize {
            return Err(DurableStoreBootstrapError::InvalidCapacity);
        }
        let (revision, encoded_records) = match storage.read() {
            RawStoreRead::Missing { revision } => (revision, Vec::new()),
            RawStoreRead::Records { revision, records } => (revision, records),
            RawStoreRead::Unavailable => return Err(DurableStoreBootstrapError::Unavailable),
        };
        if encoded_records.len() > capacity {
            return Err(DurableStoreBootstrapError::Saturated);
        }
        let mut records = BTreeMap::new();
        for encoded in encoded_records {
            let record = DurableCompletedRecord::decode(&encoded)
                .map_err(DurableStoreBootstrapError::Corrupt)?;
            let storage_key = record.key().storage_key().to_string();
            if records.insert(storage_key, record).is_some() {
                return Err(DurableStoreBootstrapError::DuplicateRecord);
            }
        }
        Ok(Self {
            capacity,
            storage,
            state: Mutex::new(RepositoryState { revision, records }),
        })
    }

    fn commit(
        &self,
        state: &mut RepositoryState,
        next_records: BTreeMap<String, DurableCompletedRecord>,
    ) -> bool {
        let mut encoded = Vec::with_capacity(next_records.len());
        for record in next_records.values() {
            let bytes = match record.encode() {
                Ok(bytes) => bytes,
                Err(_) => return false,
            };
            encoded.push(bytes);
        }
        match self.storage.compare_and_swap(state.revision, encoded) {
            RawStoreWrite::Written { revision } if revision > state.revision => {
                state.revision = revision;
                state.records = next_records;
                true
            }
            RawStoreWrite::Written { .. }
            | RawStoreWrite::Conflict
            | RawStoreWrite::Unavailable => false,
        }
    }

    pub(crate) fn retention_records(&self) -> Result<Vec<RetentionRecord>, ()> {
        let state = self.state.lock().map_err(|_| ())?;
        Ok(state
            .records
            .values()
            .filter_map(|record| {
                record
                    .response_reference()
                    .map(|response_reference| RetentionRecord {
                        key: record.key().clone(),
                        response_reference: response_reference.to_string(),
                        expires_at: record.key().expires_at(),
                        finalized_at_ms: record.finalized_at_ms(),
                    })
            })
            .collect())
    }

    pub(crate) fn has_unknown_reservations(&self) -> Result<bool, ()> {
        let state = self.state.lock().map_err(|_| ())?;
        Ok(state
            .records
            .values()
            .any(DurableCompletedRecord::is_effect_state_unknown))
    }

    pub(crate) fn remove_terminal_exact(
        &mut self,
        key: &CompletedRequestKey,
        response_reference: &str,
    ) -> RetentionRecordRemoveResult {
        let mut state = match self.state.lock() {
            Ok(state) => state,
            Err(_) => return RetentionRecordRemoveResult::Unavailable,
        };
        let Some(existing) = state.records.get(key.storage_key()) else {
            return RetentionRecordRemoveResult::Missing;
        };
        if existing.key() != key
            || existing.is_effect_state_unknown()
            || existing.response_reference() != Some(response_reference)
        {
            return RetentionRecordRemoveResult::Changed;
        }
        let mut next_records = state.records.clone();
        next_records.remove(key.storage_key());
        if self.commit(&mut state, next_records) {
            RetentionRecordRemoveResult::Removed
        } else {
            RetentionRecordRemoveResult::Unavailable
        }
    }
}

impl DurableCompletedRecordStore for DurableRecordRepository {
    fn load(&self, key: &CompletedRequestKey) -> DurableLoadResult {
        let state = match self.state.lock() {
            Ok(state) => state,
            Err(_) => return DurableLoadResult::Unavailable,
        };
        match state.records.get(key.storage_key()) {
            None => DurableLoadResult::Miss,
            Some(record) if record.key() == key => {
                DurableLoadResult::Exact(Box::new(record.clone()))
            }
            Some(_) => DurableLoadResult::ScopeMismatch,
        }
    }

    fn save(&self, record: DurableCompletedRecord) -> DurableSaveResult {
        let mut state = match self.state.lock() {
            Ok(state) => state,
            Err(_) => return DurableSaveResult::Unavailable,
        };
        let storage_key = record.key().storage_key().to_string();
        if let Some(existing) = state.records.get(&storage_key) {
            return if existing.key() == record.key() {
                DurableSaveResult::AlreadyStored
            } else {
                DurableSaveResult::ScopeMismatch
            };
        }
        if state.records.len() >= self.capacity {
            return DurableSaveResult::Saturated;
        }
        let mut next_records = state.records.clone();
        next_records.insert(storage_key, record);
        if self.commit(&mut state, next_records) {
            DurableSaveResult::Stored
        } else {
            DurableSaveResult::Unavailable
        }
    }

    fn reserve(&self, record: DurableCompletedRecord) -> DurableReserveResult {
        if !record.is_effect_state_unknown() {
            return DurableReserveResult::Unavailable;
        }
        let mut state = match self.state.lock() {
            Ok(state) => state,
            Err(_) => return DurableReserveResult::Unavailable,
        };
        let storage_key = record.key().storage_key().to_string();
        if let Some(existing) = state.records.get(&storage_key) {
            if existing.key() != record.key() {
                return DurableReserveResult::ScopeMismatch;
            }
            return if existing.is_effect_state_unknown() {
                DurableReserveResult::AlreadyReserved
            } else {
                DurableReserveResult::AlreadyCompleted
            };
        }
        if state.records.len() >= self.capacity {
            return DurableReserveResult::Saturated;
        }
        let mut next_records = state.records.clone();
        next_records.insert(storage_key, record);
        if self.commit(&mut state, next_records) {
            DurableReserveResult::Reserved
        } else {
            DurableReserveResult::Unavailable
        }
    }

    fn finalize(&self, record: DurableCompletedRecord) -> DurableFinalizeResult {
        if record.is_effect_state_unknown() {
            return DurableFinalizeResult::Unavailable;
        }
        let mut state = match self.state.lock() {
            Ok(state) => state,
            Err(_) => return DurableFinalizeResult::Unavailable,
        };
        let storage_key = record.key().storage_key().to_string();
        let Some(existing) = state.records.get(&storage_key) else {
            return DurableFinalizeResult::NotReserved;
        };
        if existing.key() != record.key() {
            return DurableFinalizeResult::ScopeMismatch;
        }
        if !existing.is_effect_state_unknown() {
            return DurableFinalizeResult::AlreadyFinalized;
        }
        let mut next_records = state.records.clone();
        next_records.insert(storage_key, record);
        if self.commit(&mut state, next_records) {
            DurableFinalizeResult::Finalized
        } else {
            DurableFinalizeResult::Unavailable
        }
    }
}
