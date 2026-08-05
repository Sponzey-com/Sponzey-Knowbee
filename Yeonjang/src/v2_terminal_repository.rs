//! Atomic process-local claims and completed terminal content for MQTT v2 idempotency.

use std::collections::{BTreeMap, HashMap};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

use crate::durable_completed_store::{DurableRecordStorage, RawStoreRead, RawStoreWrite};
use crate::mqtt_v2_topics::validate_identifier;
use crate::protocol_v2::V2CommandEnvelope;
use crate::protocol_v2_terminal::V2TerminalResponseContent;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct V2TerminalScope {
    idempotency_key: String,
    exact_scope_digest: String,
}

impl V2TerminalScope {
    pub fn new(
        idempotency_key: String,
        exact_scope_digest: String,
    ) -> Result<Self, V2TerminalRepositoryBuildError> {
        validate_identifier(&idempotency_key)
            .map_err(|_| V2TerminalRepositoryBuildError::InvalidScope)?;
        if !is_sha256_digest(&exact_scope_digest) {
            return Err(V2TerminalRepositoryBuildError::InvalidScope);
        }
        Ok(Self {
            idempotency_key,
            exact_scope_digest,
        })
    }

    pub(crate) fn for_command(command: &V2CommandEnvelope) -> Self {
        Self {
            idempotency_key: command.idempotency_key().to_string(),
            exact_scope_digest: command.idempotency_scope_digest(),
        }
    }

    pub fn exact_scope_digest(&self) -> &str {
        &self.exact_scope_digest
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum V2TerminalClaim {
    Claimed,
    InProgress,
    Completed(Box<V2TerminalResponseContent>),
    ScopeConflict,
    Saturated,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum V2TerminalLookup {
    Miss,
    InProgress,
    Completed(Box<V2TerminalResponseContent>),
    ScopeConflict,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2TerminalComplete {
    Completed,
    AlreadyCompleted,
    Missing,
    ScopeConflict,
    Unavailable,
}

pub trait V2TerminalRepository: Send + Sync {
    fn prepare(
        &self,
        scope: &V2TerminalScope,
        restart_recovery: V2TerminalResponseContent,
    ) -> V2TerminalClaim;
    fn lookup(&self, scope: &V2TerminalScope) -> V2TerminalLookup;
    fn complete(
        &self,
        scope: &V2TerminalScope,
        content: V2TerminalResponseContent,
    ) -> V2TerminalComplete;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2TerminalRepositoryBuildError {
    InvalidCapacity,
    InvalidScope,
}

#[derive(Debug, Clone)]
enum StoredTerminal {
    Prepared {
        _restart_recovery: Box<V2TerminalResponseContent>,
    },
    Completed(Box<V2TerminalResponseContent>),
}

#[derive(Debug, Clone)]
struct StoredRecord {
    exact_scope_digest: String,
    terminal: StoredTerminal,
}

#[derive(Debug)]
pub struct InMemoryV2TerminalRepository {
    capacity: usize,
    records: Mutex<HashMap<String, StoredRecord>>,
}

impl InMemoryV2TerminalRepository {
    pub fn new(capacity: usize) -> Result<Self, V2TerminalRepositoryBuildError> {
        if capacity == 0 || capacity > u32::MAX as usize {
            return Err(V2TerminalRepositoryBuildError::InvalidCapacity);
        }
        Ok(Self {
            capacity,
            records: Mutex::new(HashMap::new()),
        })
    }
}

impl V2TerminalRepository for InMemoryV2TerminalRepository {
    fn prepare(
        &self,
        scope: &V2TerminalScope,
        restart_recovery: V2TerminalResponseContent,
    ) -> V2TerminalClaim {
        if !valid_restart_recovery(scope, &restart_recovery) {
            return V2TerminalClaim::Unavailable;
        }
        let Ok(mut records) = self.records.lock() else {
            return V2TerminalClaim::Unavailable;
        };
        if let Some(record) = records.get(&scope.idempotency_key) {
            if record.exact_scope_digest != scope.exact_scope_digest {
                return V2TerminalClaim::ScopeConflict;
            }
            return match &record.terminal {
                StoredTerminal::Prepared { .. } => V2TerminalClaim::InProgress,
                StoredTerminal::Completed(content) => V2TerminalClaim::Completed(content.clone()),
            };
        }
        if records.len() >= self.capacity {
            return V2TerminalClaim::Saturated;
        }
        records.insert(
            scope.idempotency_key.clone(),
            StoredRecord {
                exact_scope_digest: scope.exact_scope_digest.clone(),
                terminal: StoredTerminal::Prepared {
                    _restart_recovery: Box::new(restart_recovery),
                },
            },
        );
        V2TerminalClaim::Claimed
    }

    fn lookup(&self, scope: &V2TerminalScope) -> V2TerminalLookup {
        let Ok(records) = self.records.lock() else {
            return V2TerminalLookup::Unavailable;
        };
        let Some(record) = records.get(&scope.idempotency_key) else {
            return V2TerminalLookup::Miss;
        };
        if record.exact_scope_digest != scope.exact_scope_digest {
            return V2TerminalLookup::ScopeConflict;
        }
        match &record.terminal {
            StoredTerminal::Prepared { .. } => V2TerminalLookup::InProgress,
            StoredTerminal::Completed(content) => V2TerminalLookup::Completed(content.clone()),
        }
    }

    fn complete(
        &self,
        scope: &V2TerminalScope,
        content: V2TerminalResponseContent,
    ) -> V2TerminalComplete {
        if !content_matches_scope(scope, &content) {
            return V2TerminalComplete::Unavailable;
        }
        let Ok(mut records) = self.records.lock() else {
            return V2TerminalComplete::Unavailable;
        };
        let Some(record) = records.get_mut(&scope.idempotency_key) else {
            return V2TerminalComplete::Missing;
        };
        if record.exact_scope_digest != scope.exact_scope_digest {
            return V2TerminalComplete::ScopeConflict;
        }
        match record.terminal {
            StoredTerminal::Prepared { .. } => {
                record.terminal = StoredTerminal::Completed(Box::new(content));
                V2TerminalComplete::Completed
            }
            StoredTerminal::Completed(_) => V2TerminalComplete::AlreadyCompleted,
        }
    }
}

const DURABLE_V2_TERMINAL_SCHEMA_VERSION: u16 = 2;
const LEGACY_DURABLE_V2_TERMINAL_SCHEMA_VERSION: u16 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "state", rename_all = "snake_case", deny_unknown_fields)]
enum DurableTerminalState {
    #[serde(rename = "pending")]
    LegacyPending,
    Prepared {
        restart_recovery: Box<V2TerminalResponseContent>,
    },
    Completed {
        content: Box<V2TerminalResponseContent>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct DurableTerminalRecord {
    schema_version: u16,
    idempotency_key: String,
    exact_scope_digest: String,
    terminal: DurableTerminalState,
}

impl DurableTerminalRecord {
    fn scope(&self) -> Result<V2TerminalScope, DurableV2TerminalRepositoryError> {
        V2TerminalScope::new(
            self.idempotency_key.clone(),
            self.exact_scope_digest.clone(),
        )
        .map_err(|_| DurableV2TerminalRepositoryError::Corrupt)
    }

    fn validate(&self) -> Result<(), DurableV2TerminalRepositoryError> {
        if !matches!(
            self.schema_version,
            LEGACY_DURABLE_V2_TERMINAL_SCHEMA_VERSION | DURABLE_V2_TERMINAL_SCHEMA_VERSION
        ) {
            return Err(DurableV2TerminalRepositoryError::Corrupt);
        }
        let scope = self.scope()?;
        match &self.terminal {
            DurableTerminalState::LegacyPending
                if self.schema_version != LEGACY_DURABLE_V2_TERMINAL_SCHEMA_VERSION =>
            {
                return Err(DurableV2TerminalRepositoryError::Corrupt);
            }
            DurableTerminalState::Prepared { restart_recovery }
                if self.schema_version != DURABLE_V2_TERMINAL_SCHEMA_VERSION
                    || !valid_restart_recovery(&scope, restart_recovery) =>
            {
                return Err(DurableV2TerminalRepositoryError::Corrupt);
            }
            DurableTerminalState::Completed { content }
                if !content_matches_scope(&scope, content) =>
            {
                return Err(DurableV2TerminalRepositoryError::Corrupt);
            }
            _ => {}
        }
        Ok(())
    }
}

struct DurableRepositoryState {
    revision: u64,
    records: BTreeMap<String, DurableTerminalRecord>,
}

pub struct DurableV2TerminalRepository {
    capacity: usize,
    storage: Arc<dyn DurableRecordStorage>,
    state: Mutex<DurableRepositoryState>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DurableV2TerminalRepositoryError {
    InvalidCapacity,
    Corrupt,
    DuplicateRecord,
    RecoveryEvidenceMissing,
    RecoveryCommitFailed,
    Saturated,
    Unavailable,
}

impl DurableV2TerminalRepository {
    pub fn bootstrap(
        capacity: usize,
        storage: Arc<dyn DurableRecordStorage>,
    ) -> Result<Self, DurableV2TerminalRepositoryError> {
        if capacity == 0 || capacity > u32::MAX as usize {
            return Err(DurableV2TerminalRepositoryError::InvalidCapacity);
        }
        let (revision, encoded_records) = match storage.read() {
            RawStoreRead::Missing { revision } => (revision, Vec::new()),
            RawStoreRead::Records { revision, records } => (revision, records),
            RawStoreRead::Unavailable => {
                return Err(DurableV2TerminalRepositoryError::Unavailable);
            }
        };
        if encoded_records.len() > capacity {
            return Err(DurableV2TerminalRepositoryError::Saturated);
        }
        let mut records = BTreeMap::new();
        for encoded in encoded_records {
            let record: DurableTerminalRecord = serde_json::from_slice(&encoded)
                .map_err(|_| DurableV2TerminalRepositoryError::Corrupt)?;
            record.validate()?;
            if records
                .insert(record.idempotency_key.clone(), record)
                .is_some()
            {
                return Err(DurableV2TerminalRepositoryError::DuplicateRecord);
            }
        }
        if records
            .values()
            .any(|record| matches!(record.terminal, DurableTerminalState::LegacyPending))
        {
            return Err(DurableV2TerminalRepositoryError::RecoveryEvidenceMissing);
        }
        let mut state = DurableRepositoryState { revision, records };
        if state
            .records
            .values()
            .any(|record| matches!(record.terminal, DurableTerminalState::Prepared { .. }))
        {
            let mut recovered_records = state.records.clone();
            for record in recovered_records.values_mut() {
                if let DurableTerminalState::Prepared { restart_recovery } = &record.terminal {
                    record.terminal = DurableTerminalState::Completed {
                        content: restart_recovery.clone(),
                    };
                }
            }
            if !commit_records(storage.as_ref(), &mut state, recovered_records) {
                return Err(DurableV2TerminalRepositoryError::RecoveryCommitFailed);
            }
        }
        Ok(Self {
            capacity,
            storage,
            state: Mutex::new(state),
        })
    }

    fn commit(
        &self,
        state: &mut DurableRepositoryState,
        next_records: BTreeMap<String, DurableTerminalRecord>,
    ) -> bool {
        commit_records(self.storage.as_ref(), state, next_records)
    }
}

impl V2TerminalRepository for DurableV2TerminalRepository {
    fn prepare(
        &self,
        scope: &V2TerminalScope,
        restart_recovery: V2TerminalResponseContent,
    ) -> V2TerminalClaim {
        if !valid_restart_recovery(scope, &restart_recovery) {
            return V2TerminalClaim::Unavailable;
        }
        let Ok(mut state) = self.state.lock() else {
            return V2TerminalClaim::Unavailable;
        };
        if let Some(record) = state.records.get(&scope.idempotency_key) {
            if record.exact_scope_digest != scope.exact_scope_digest {
                return V2TerminalClaim::ScopeConflict;
            }
            return match &record.terminal {
                DurableTerminalState::Prepared { .. } => V2TerminalClaim::InProgress,
                DurableTerminalState::LegacyPending => V2TerminalClaim::Unavailable,
                DurableTerminalState::Completed { content } => {
                    V2TerminalClaim::Completed(content.clone())
                }
            };
        }
        if state.records.len() >= self.capacity {
            return V2TerminalClaim::Saturated;
        }
        let mut next_records = state.records.clone();
        next_records.insert(
            scope.idempotency_key.clone(),
            DurableTerminalRecord {
                schema_version: DURABLE_V2_TERMINAL_SCHEMA_VERSION,
                idempotency_key: scope.idempotency_key.clone(),
                exact_scope_digest: scope.exact_scope_digest.clone(),
                terminal: DurableTerminalState::Prepared {
                    restart_recovery: Box::new(restart_recovery),
                },
            },
        );
        if self.commit(&mut state, next_records) {
            V2TerminalClaim::Claimed
        } else {
            V2TerminalClaim::Unavailable
        }
    }

    fn lookup(&self, scope: &V2TerminalScope) -> V2TerminalLookup {
        let Ok(state) = self.state.lock() else {
            return V2TerminalLookup::Unavailable;
        };
        let Some(record) = state.records.get(&scope.idempotency_key) else {
            return V2TerminalLookup::Miss;
        };
        if record.exact_scope_digest != scope.exact_scope_digest {
            return V2TerminalLookup::ScopeConflict;
        }
        match &record.terminal {
            DurableTerminalState::Prepared { .. } => V2TerminalLookup::InProgress,
            DurableTerminalState::LegacyPending => V2TerminalLookup::Unavailable,
            DurableTerminalState::Completed { content } => {
                V2TerminalLookup::Completed(content.clone())
            }
        }
    }

    fn complete(
        &self,
        scope: &V2TerminalScope,
        content: V2TerminalResponseContent,
    ) -> V2TerminalComplete {
        if !content_matches_scope(scope, &content) {
            return V2TerminalComplete::Unavailable;
        }
        let Ok(mut state) = self.state.lock() else {
            return V2TerminalComplete::Unavailable;
        };
        let Some(existing) = state.records.get(&scope.idempotency_key) else {
            return V2TerminalComplete::Missing;
        };
        if existing.exact_scope_digest != scope.exact_scope_digest {
            return V2TerminalComplete::ScopeConflict;
        }
        if matches!(existing.terminal, DurableTerminalState::Completed { .. }) {
            return V2TerminalComplete::AlreadyCompleted;
        }
        if matches!(existing.terminal, DurableTerminalState::LegacyPending) {
            return V2TerminalComplete::Unavailable;
        }
        let mut next_records = state.records.clone();
        let Some(record) = next_records.get_mut(&scope.idempotency_key) else {
            return V2TerminalComplete::Missing;
        };
        record.terminal = DurableTerminalState::Completed {
            content: Box::new(content),
        };
        if self.commit(&mut state, next_records) {
            V2TerminalComplete::Completed
        } else {
            V2TerminalComplete::Unavailable
        }
    }
}

fn valid_restart_recovery(scope: &V2TerminalScope, content: &V2TerminalResponseContent) -> bool {
    content.validate_restart_recovery() && content_matches_scope(scope, content)
}

fn content_matches_scope(scope: &V2TerminalScope, content: &V2TerminalResponseContent) -> bool {
    content.validate_stored()
        && content.idempotency_key() == scope.idempotency_key
        && content
            .target_scope_digest()
            .is_none_or(|digest| digest == scope.exact_scope_digest)
}

fn commit_records(
    storage: &dyn DurableRecordStorage,
    state: &mut DurableRepositoryState,
    next_records: BTreeMap<String, DurableTerminalRecord>,
) -> bool {
    let mut encoded = Vec::with_capacity(next_records.len());
    for record in next_records.values() {
        let Ok(bytes) = serde_json::to_vec(record) else {
            return false;
        };
        encoded.push(bytes);
    }
    match storage.compare_and_swap(state.revision, encoded) {
        RawStoreWrite::Written { revision } if revision > state.revision => {
            state.revision = revision;
            state.records = next_records;
            true
        }
        RawStoreWrite::Written { .. } | RawStoreWrite::Conflict | RawStoreWrite::Unavailable => {
            false
        }
    }
}

fn is_sha256_digest(value: &str) -> bool {
    value.len() == 71
        && value
            .strip_prefix("sha256:")
            .is_some_and(|digest| digest.bytes().all(|byte| byte.is_ascii_hexdigit()))
}
