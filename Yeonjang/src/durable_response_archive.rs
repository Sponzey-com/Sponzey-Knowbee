use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::protocol::Response;
use crate::runtime::{
    DurableResponseArchive, DurableResponseArchiveResult, DurableResponseResolveResult,
    DurableResponseResolver,
};

const ARCHIVE_SCHEMA_VERSION: u16 = 1;
const MAX_ARCHIVE_CAPACITY: usize = 65_536;
const MAX_ENTRY_BYTES: usize = 16 * 1024 * 1024;
const MAX_TOTAL_BYTES: usize = 64 * 1024 * 1024;
const MAX_WIRE_OVERHEAD_BYTES: usize = 512;
const RESPONSE_REFERENCE_PREFIX: &str = "response:v1:sha256:";

pub enum RawResponseArchiveRead {
    Missing {
        revision: u64,
    },
    Entries {
        revision: u64,
        entries: Vec<Vec<u8>>,
    },
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RawResponseArchiveWrite {
    Written { revision: u64 },
    Conflict,
    Unavailable,
}

pub trait RawResponseArchiveStorage: Send + Sync {
    fn read(&self) -> RawResponseArchiveRead;
    fn compare_and_swap(
        &self,
        expected_revision: u64,
        entries: Vec<Vec<u8>>,
    ) -> RawResponseArchiveWrite;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResponseArchiveBootstrapError {
    InvalidLimits,
    TooManyEntries,
    TooManyBytes,
    Malformed,
    UnsupportedVersion,
    InvalidResponse,
    DuplicateReference,
    ReferenceMismatch,
    Unavailable,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ArchivedResponseWire {
    schema_version: u16,
    response_reference: String,
    response: Response,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArchiveVersionProbe {
    schema_version: u16,
}

struct ArchiveState {
    revision: u64,
    responses: BTreeMap<String, Vec<u8>>,
    total_response_bytes: usize,
}

pub struct ResponseArchiveRepository {
    capacity: usize,
    max_entry_bytes: usize,
    max_total_bytes: usize,
    storage: Arc<dyn RawResponseArchiveStorage>,
    state: Mutex<ArchiveState>,
}

pub(crate) enum RetentionResponseRemoveResult {
    Removed,
    Missing,
    Unavailable,
}

impl ResponseArchiveRepository {
    pub fn bootstrap(
        capacity: usize,
        max_entry_bytes: usize,
        max_total_bytes: usize,
        storage: Arc<dyn RawResponseArchiveStorage>,
    ) -> Result<Self, ResponseArchiveBootstrapError> {
        if capacity == 0
            || capacity > MAX_ARCHIVE_CAPACITY
            || max_entry_bytes == 0
            || max_entry_bytes > MAX_ENTRY_BYTES
            || max_total_bytes < max_entry_bytes
            || max_total_bytes > MAX_TOTAL_BYTES
        {
            return Err(ResponseArchiveBootstrapError::InvalidLimits);
        }
        let (revision, entries) = match storage.read() {
            RawResponseArchiveRead::Missing { revision } => (revision, Vec::new()),
            RawResponseArchiveRead::Entries { revision, entries } => (revision, entries),
            RawResponseArchiveRead::Unavailable => {
                return Err(ResponseArchiveBootstrapError::Unavailable);
            }
        };
        if entries.len() > capacity {
            return Err(ResponseArchiveBootstrapError::TooManyEntries);
        }
        let max_wire_bytes = max_entry_bytes
            .checked_add(MAX_WIRE_OVERHEAD_BYTES)
            .ok_or(ResponseArchiveBootstrapError::InvalidLimits)?;
        let mut responses = BTreeMap::new();
        let mut total_response_bytes = 0usize;
        for entry in entries {
            if entry.len() > max_wire_bytes {
                return Err(ResponseArchiveBootstrapError::TooManyBytes);
            }
            let probe = serde_json::from_slice::<ArchiveVersionProbe>(&entry)
                .map_err(|_| ResponseArchiveBootstrapError::Malformed)?;
            if probe.schema_version != ARCHIVE_SCHEMA_VERSION {
                return Err(ResponseArchiveBootstrapError::UnsupportedVersion);
            }
            let wire = serde_json::from_slice::<ArchivedResponseWire>(&entry)
                .map_err(|_| ResponseArchiveBootstrapError::Malformed)?;
            if wire.response.id.is_some() {
                return Err(ResponseArchiveBootstrapError::InvalidResponse);
            }
            let response_bytes = canonical_response_bytes(&wire.response)
                .ok_or(ResponseArchiveBootstrapError::InvalidResponse)?;
            if response_bytes.len() > max_entry_bytes {
                return Err(ResponseArchiveBootstrapError::TooManyBytes);
            }
            total_response_bytes = total_response_bytes
                .checked_add(response_bytes.len())
                .ok_or(ResponseArchiveBootstrapError::TooManyBytes)?;
            if total_response_bytes > max_total_bytes {
                return Err(ResponseArchiveBootstrapError::TooManyBytes);
            }
            if response_reference(&response_bytes) != wire.response_reference {
                return Err(ResponseArchiveBootstrapError::ReferenceMismatch);
            }
            if responses
                .insert(wire.response_reference, response_bytes)
                .is_some()
            {
                return Err(ResponseArchiveBootstrapError::DuplicateReference);
            }
        }
        Ok(Self {
            capacity,
            max_entry_bytes,
            max_total_bytes,
            storage,
            state: Mutex::new(ArchiveState {
                revision,
                responses,
                total_response_bytes,
            }),
        })
    }

    fn commit(
        &self,
        state: &mut ArchiveState,
        next_responses: BTreeMap<String, Vec<u8>>,
        next_total_response_bytes: usize,
    ) -> bool {
        let mut entries = Vec::with_capacity(next_responses.len());
        for (response_reference, response_bytes) in &next_responses {
            let response = match serde_json::from_slice::<Response>(response_bytes) {
                Ok(response) => response,
                Err(_) => return false,
            };
            let entry = match serde_json::to_vec(&ArchivedResponseWire {
                schema_version: ARCHIVE_SCHEMA_VERSION,
                response_reference: response_reference.clone(),
                response,
            }) {
                Ok(entry) => entry,
                Err(_) => return false,
            };
            entries.push(entry);
        }
        match self.storage.compare_and_swap(state.revision, entries) {
            RawResponseArchiveWrite::Written { revision } if revision > state.revision => {
                state.revision = revision;
                state.responses = next_responses;
                state.total_response_bytes = next_total_response_bytes;
                true
            }
            RawResponseArchiveWrite::Written { .. }
            | RawResponseArchiveWrite::Conflict
            | RawResponseArchiveWrite::Unavailable => false,
        }
    }

    pub(crate) fn retention_references(&self) -> Result<Vec<String>, ()> {
        let state = self.state.lock().map_err(|_| ())?;
        Ok(state.responses.keys().cloned().collect())
    }

    pub(crate) fn remove_exact(
        &mut self,
        response_reference: &str,
    ) -> RetentionResponseRemoveResult {
        let mut state = match self.state.lock() {
            Ok(state) => state,
            Err(_) => return RetentionResponseRemoveResult::Unavailable,
        };
        let Some(response_bytes) = state.responses.get(response_reference) else {
            return RetentionResponseRemoveResult::Missing;
        };
        let next_total_response_bytes =
            match state.total_response_bytes.checked_sub(response_bytes.len()) {
                Some(total) => total,
                None => return RetentionResponseRemoveResult::Unavailable,
            };
        let mut next_responses = state.responses.clone();
        next_responses.remove(response_reference);
        if self.commit(&mut state, next_responses, next_total_response_bytes) {
            RetentionResponseRemoveResult::Removed
        } else {
            RetentionResponseRemoveResult::Unavailable
        }
    }
}

impl DurableResponseArchive for ResponseArchiveRepository {
    fn archive(&self, response: &Response) -> DurableResponseArchiveResult {
        let Some(response_bytes) = canonical_response_bytes(response) else {
            return DurableResponseArchiveResult::Unavailable;
        };
        if response_bytes.len() > self.max_entry_bytes {
            return DurableResponseArchiveResult::Unavailable;
        }
        let response_reference = response_reference(&response_bytes);
        let mut state = match self.state.lock() {
            Ok(state) => state,
            Err(_) => return DurableResponseArchiveResult::Unavailable,
        };
        if state.responses.contains_key(&response_reference) {
            return DurableResponseArchiveResult::Archived { response_reference };
        }
        if state.responses.len() >= self.capacity {
            return DurableResponseArchiveResult::Unavailable;
        }
        let Some(next_total_response_bytes) =
            state.total_response_bytes.checked_add(response_bytes.len())
        else {
            return DurableResponseArchiveResult::Unavailable;
        };
        if next_total_response_bytes > self.max_total_bytes {
            return DurableResponseArchiveResult::Unavailable;
        }
        let mut next_responses = state.responses.clone();
        next_responses.insert(response_reference.clone(), response_bytes);
        if !self.commit(&mut state, next_responses, next_total_response_bytes) {
            return DurableResponseArchiveResult::Unavailable;
        }
        DurableResponseArchiveResult::Archived { response_reference }
    }
}

impl DurableResponseResolver for ResponseArchiveRepository {
    fn resolve(&self, response_reference: &str) -> DurableResponseResolveResult {
        if !valid_response_reference(response_reference) {
            return DurableResponseResolveResult::Missing;
        }
        let state = match self.state.lock() {
            Ok(state) => state,
            Err(_) => return DurableResponseResolveResult::Unavailable,
        };
        let Some(response_bytes) = state.responses.get(response_reference) else {
            return DurableResponseResolveResult::Missing;
        };
        match serde_json::from_slice(response_bytes) {
            Ok(response) => DurableResponseResolveResult::Found(Box::new(response)),
            Err(_) => DurableResponseResolveResult::Unavailable,
        }
    }
}

fn canonical_response_bytes(response: &Response) -> Option<Vec<u8>> {
    let shape_is_valid = if response.ok {
        response.result.is_some() && response.error.is_none()
    } else {
        response.result.is_none()
            && response.error.as_ref().is_some_and(|error| {
                !error.code.trim().is_empty()
                    && error.code.len() <= 128
                    && !error.message.trim().is_empty()
            })
    };
    if !shape_is_valid {
        return None;
    }
    let mut normalized = response.clone();
    normalized.id = None;
    serde_json::to_vec(&normalized).ok()
}

fn response_reference(response_bytes: &[u8]) -> String {
    format!(
        "{RESPONSE_REFERENCE_PREFIX}{:x}",
        Sha256::digest(response_bytes)
    )
}

fn valid_response_reference(reference: &str) -> bool {
    reference
        .strip_prefix(RESPONSE_REFERENCE_PREFIX)
        .is_some_and(|digest| {
            digest.len() == 64 && digest.bytes().all(|byte| byte.is_ascii_hexdigit())
        })
}
