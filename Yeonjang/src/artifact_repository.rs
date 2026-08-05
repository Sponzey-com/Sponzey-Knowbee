//! Durable single writer for canonical artifact lifecycle records.
//!
//! A transition is visible in memory only after the strict whole-store CAS is
//! durable. File cleanup and MQTT publication must occur after this repository
//! result, never as part of persistence decoding or a failed transition.

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

use crate::artifact_lifecycle::{
    ArtifactBinding, ArtifactCleanupStatus, ArtifactEvent, ArtifactFailureReason,
    ArtifactLifecycle, ArtifactLifecycleState, ArtifactTransition, ArtifactTransitionReject,
    apply_artifact_event,
};
use crate::durable_completed_store::{DurableRecordStorage, RawStoreRead, RawStoreWrite};

const ARTIFACT_RECORD_SCHEMA_VERSION: u16 = 1;
const MAX_ARTIFACT_RECORD_BYTES: usize = 8 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArtifactRepositoryBootstrapError {
    InvalidCapacity,
    Corrupt,
    UnsupportedVersion,
    Duplicate,
    Saturated,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ArtifactLifecycleRead {
    Found(ArtifactLifecycle),
    Missing,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ArtifactLifecycleList {
    Snapshots(Vec<ArtifactLifecycle>),
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArtifactRepositoryResult {
    Registered {
        revision: u64,
    },
    Applied {
        revision: u64,
    },
    Idempotent {
        revision: u64,
    },
    RevisionConflict {
        expected_revision: u64,
        current_revision: u64,
    },
    TransitionRejected {
        reason: ArtifactTransitionReject,
    },
    BindingConflict,
    Missing,
    Saturated,
    StorageConflict,
    Unavailable,
}

pub trait ArtifactLifecycleStore: Send + Sync {
    fn read(&self, artifact_ref: &str) -> ArtifactLifecycleRead;
    fn list(&self) -> ArtifactLifecycleList;
    fn register(&self, binding: ArtifactBinding) -> ArtifactRepositoryResult;
    fn apply(
        &self,
        artifact_ref: &str,
        expected_revision: u64,
        event: &ArtifactEvent,
    ) -> ArtifactRepositoryResult;
}

struct RepositoryState {
    storage_revision: u64,
    lifecycles: BTreeMap<String, ArtifactLifecycle>,
}

pub struct DurableArtifactLifecycleRepository {
    capacity: usize,
    storage: Arc<dyn DurableRecordStorage>,
    state: Mutex<RepositoryState>,
}

impl DurableArtifactLifecycleRepository {
    pub fn bootstrap(
        capacity: usize,
        storage: Arc<dyn DurableRecordStorage>,
    ) -> Result<Self, ArtifactRepositoryBootstrapError> {
        if capacity == 0 || capacity > u32::MAX as usize {
            return Err(ArtifactRepositoryBootstrapError::InvalidCapacity);
        }
        let (storage_revision, records) = match storage.read() {
            RawStoreRead::Missing { revision } => (revision, Vec::new()),
            RawStoreRead::Records { revision, records } => (revision, records),
            RawStoreRead::Unavailable => return Err(ArtifactRepositoryBootstrapError::Unavailable),
        };
        if records.len() > capacity {
            return Err(ArtifactRepositoryBootstrapError::Saturated);
        }
        let mut lifecycles = BTreeMap::new();
        for record in records {
            let lifecycle = decode_record(&record)?;
            if lifecycles
                .insert(lifecycle.binding().artifact_ref().to_string(), lifecycle)
                .is_some()
            {
                return Err(ArtifactRepositoryBootstrapError::Duplicate);
            }
        }
        Ok(Self {
            capacity,
            storage,
            state: Mutex::new(RepositoryState {
                storage_revision,
                lifecycles,
            }),
        })
    }

    pub fn read(&self, artifact_ref: &str) -> ArtifactLifecycleRead {
        let Ok(state) = self.state.lock() else {
            return ArtifactLifecycleRead::Unavailable;
        };
        state
            .lifecycles
            .get(artifact_ref)
            .cloned()
            .map_or(ArtifactLifecycleRead::Missing, ArtifactLifecycleRead::Found)
    }

    pub fn list(&self) -> ArtifactLifecycleList {
        let Ok(state) = self.state.lock() else {
            return ArtifactLifecycleList::Unavailable;
        };
        ArtifactLifecycleList::Snapshots(state.lifecycles.values().cloned().collect())
    }

    pub fn register(&self, binding: ArtifactBinding) -> ArtifactRepositoryResult {
        let Ok(mut state) = self.state.lock() else {
            return ArtifactRepositoryResult::Unavailable;
        };
        if let Some(existing) = state.lifecycles.get(binding.artifact_ref()) {
            return if existing.binding() == &binding {
                ArtifactRepositoryResult::Idempotent {
                    revision: existing.revision(),
                }
            } else {
                ArtifactRepositoryResult::BindingConflict
            };
        }
        if state.lifecycles.len() >= self.capacity {
            return ArtifactRepositoryResult::Saturated;
        }
        let Ok(lifecycle) = ArtifactLifecycle::new(binding) else {
            return ArtifactRepositoryResult::Unavailable;
        };
        let revision = lifecycle.revision();
        let mut next = state.lifecycles.clone();
        next.insert(lifecycle.binding().artifact_ref().to_string(), lifecycle);
        match self.commit(&mut state, next) {
            ArtifactRepositoryResult::Applied { .. } => {
                ArtifactRepositoryResult::Registered { revision }
            }
            result => result,
        }
    }

    pub fn apply(
        &self,
        artifact_ref: &str,
        expected_revision: u64,
        event: &ArtifactEvent,
    ) -> ArtifactRepositoryResult {
        let Ok(mut state) = self.state.lock() else {
            return ArtifactRepositoryResult::Unavailable;
        };
        let Some(current) = state.lifecycles.get(artifact_ref) else {
            return ArtifactRepositoryResult::Missing;
        };
        let transition = apply_artifact_event(current, event);
        if let ArtifactTransition::Idempotent { revision } = transition {
            return ArtifactRepositoryResult::Idempotent { revision };
        }
        if current.revision() != expected_revision {
            return ArtifactRepositoryResult::RevisionConflict {
                expected_revision,
                current_revision: current.revision(),
            };
        }
        match transition {
            ArtifactTransition::Applied { lifecycle, .. } => {
                let revision = lifecycle.revision();
                let mut next = state.lifecycles.clone();
                next.insert(artifact_ref.to_string(), lifecycle);
                match self.commit(&mut state, next) {
                    ArtifactRepositoryResult::Applied { .. } => {
                        ArtifactRepositoryResult::Applied { revision }
                    }
                    result => result,
                }
            }
            ArtifactTransition::Idempotent { .. } => unreachable!("returned before revision guard"),
            ArtifactTransition::Rejected { reason } => {
                ArtifactRepositoryResult::TransitionRejected { reason }
            }
        }
    }

    fn commit(
        &self,
        state: &mut RepositoryState,
        next: BTreeMap<String, ArtifactLifecycle>,
    ) -> ArtifactRepositoryResult {
        let Some(records) = encode_records(&next) else {
            return ArtifactRepositoryResult::Unavailable;
        };
        match self
            .storage
            .compare_and_swap(state.storage_revision, records)
        {
            RawStoreWrite::Written {
                revision: storage_revision,
            } if storage_revision > state.storage_revision => {
                state.storage_revision = storage_revision;
                state.lifecycles = next;
                ArtifactRepositoryResult::Applied {
                    revision: storage_revision,
                }
            }
            RawStoreWrite::Conflict => ArtifactRepositoryResult::StorageConflict,
            RawStoreWrite::Written { .. } | RawStoreWrite::Unavailable => {
                ArtifactRepositoryResult::Unavailable
            }
        }
    }
}

impl ArtifactLifecycleStore for DurableArtifactLifecycleRepository {
    fn read(&self, artifact_ref: &str) -> ArtifactLifecycleRead {
        Self::read(self, artifact_ref)
    }

    fn list(&self) -> ArtifactLifecycleList {
        Self::list(self)
    }

    fn register(&self, binding: ArtifactBinding) -> ArtifactRepositoryResult {
        Self::register(self, binding)
    }

    fn apply(
        &self,
        artifact_ref: &str,
        expected_revision: u64,
        event: &ArtifactEvent,
    ) -> ArtifactRepositoryResult {
        Self::apply(self, artifact_ref, expected_revision, event)
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ArtifactLifecycleWire {
    schema_version: u16,
    artifact_ref: String,
    owner_requester_id: String,
    owner_request_id: String,
    owner_operation_id: String,
    full_digest: String,
    total_size: u64,
    created_at_ms: i64,
    expires_at_ms: i64,
    revision: u64,
    state: ArtifactStateWire,
    #[serde(default)]
    cleanup_status: ArtifactCleanupStatusWire,
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
enum ArtifactStateWire {
    Registered,
    Fetching {
        transfer_id: String,
        chunk_count: u32,
        started_at_ms: i64,
    },
    AwaitingAck {
        transfer_id: String,
        chunk_count: u32,
        published_at_ms: i64,
    },
    Acknowledged {
        transfer_id: String,
        acknowledged_at_ms: i64,
    },
    Expired {
        expired_at_ms: i64,
    },
    Cancelled {
        // Optional only for schema-1 records written before exact cancel
        // identity was persisted. New cancellations always write `Some`;
        // missing identity remains readable but cannot authorize replay.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        transfer_id: Option<String>,
        cancelled_at_ms: i64,
    },
    Failed {
        reason: ArtifactFailureReasonWire,
        failed_at_ms: i64,
    },
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum ArtifactFailureReasonWire {
    SourceUnavailable,
    PublishFailed,
    VerificationFailed,
    CleanupFailed,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
enum ArtifactCleanupStatusWire {
    #[default]
    Pending,
    Completed {
        completed_at_ms: i64,
    },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VersionProbe {
    schema_version: u16,
}

fn encode_records(lifecycles: &BTreeMap<String, ArtifactLifecycle>) -> Option<Vec<Vec<u8>>> {
    lifecycles
        .values()
        .map(|lifecycle| {
            let encoded = serde_json::to_vec(&ArtifactLifecycleWire::from(lifecycle)).ok()?;
            (encoded.len() <= MAX_ARTIFACT_RECORD_BYTES).then_some(encoded)
        })
        .collect()
}

fn decode_record(record: &[u8]) -> Result<ArtifactLifecycle, ArtifactRepositoryBootstrapError> {
    if record.len() > MAX_ARTIFACT_RECORD_BYTES {
        return Err(ArtifactRepositoryBootstrapError::Corrupt);
    }
    let probe = serde_json::from_slice::<VersionProbe>(record)
        .map_err(|_| ArtifactRepositoryBootstrapError::Corrupt)?;
    if probe.schema_version != ARTIFACT_RECORD_SCHEMA_VERSION {
        return Err(ArtifactRepositoryBootstrapError::UnsupportedVersion);
    }
    let wire = serde_json::from_slice::<ArtifactLifecycleWire>(record)
        .map_err(|_| ArtifactRepositoryBootstrapError::Corrupt)?;
    let binding = ArtifactBinding::new(
        wire.artifact_ref,
        wire.owner_requester_id,
        wire.owner_request_id,
        wire.owner_operation_id,
        wire.full_digest,
        wire.total_size,
        wire.created_at_ms,
        wire.expires_at_ms,
    )
    .map_err(|_| ArtifactRepositoryBootstrapError::Corrupt)?;
    ArtifactLifecycle::restore(
        binding,
        wire.revision,
        wire.state.into_state(),
        wire.cleanup_status.into_status(),
    )
    .map_err(|_| ArtifactRepositoryBootstrapError::Corrupt)
}

impl From<&ArtifactLifecycle> for ArtifactLifecycleWire {
    fn from(lifecycle: &ArtifactLifecycle) -> Self {
        let binding = lifecycle.binding();
        Self {
            schema_version: ARTIFACT_RECORD_SCHEMA_VERSION,
            artifact_ref: binding.artifact_ref().to_string(),
            owner_requester_id: binding.owner_requester_id().to_string(),
            owner_request_id: binding.owner_request_id().to_string(),
            owner_operation_id: binding.owner_operation_id().to_string(),
            full_digest: binding.full_digest().to_string(),
            total_size: binding.total_size(),
            created_at_ms: binding.created_at_ms(),
            expires_at_ms: binding.expires_at_ms(),
            revision: lifecycle.revision(),
            state: ArtifactStateWire::from_state(lifecycle.state()),
            cleanup_status: ArtifactCleanupStatusWire::from_status(lifecycle.cleanup_status()),
        }
    }
}

impl ArtifactCleanupStatusWire {
    fn from_status(status: ArtifactCleanupStatus) -> Self {
        match status {
            ArtifactCleanupStatus::Pending => Self::Pending,
            ArtifactCleanupStatus::Completed { completed_at_ms } => {
                Self::Completed { completed_at_ms }
            }
        }
    }

    fn into_status(self) -> ArtifactCleanupStatus {
        match self {
            Self::Pending => ArtifactCleanupStatus::Pending,
            Self::Completed { completed_at_ms } => {
                ArtifactCleanupStatus::Completed { completed_at_ms }
            }
        }
    }
}

impl ArtifactStateWire {
    fn from_state(state: &ArtifactLifecycleState) -> Self {
        match state {
            ArtifactLifecycleState::Registered => Self::Registered,
            ArtifactLifecycleState::Fetching {
                transfer_id,
                chunk_count,
                started_at_ms,
            } => Self::Fetching {
                transfer_id: transfer_id.clone(),
                chunk_count: *chunk_count,
                started_at_ms: *started_at_ms,
            },
            ArtifactLifecycleState::AwaitingAck {
                transfer_id,
                chunk_count,
                published_at_ms,
            } => Self::AwaitingAck {
                transfer_id: transfer_id.clone(),
                chunk_count: *chunk_count,
                published_at_ms: *published_at_ms,
            },
            ArtifactLifecycleState::Acknowledged {
                transfer_id,
                acknowledged_at_ms,
            } => Self::Acknowledged {
                transfer_id: transfer_id.clone(),
                acknowledged_at_ms: *acknowledged_at_ms,
            },
            ArtifactLifecycleState::Expired { expired_at_ms } => Self::Expired {
                expired_at_ms: *expired_at_ms,
            },
            ArtifactLifecycleState::Cancelled {
                transfer_id,
                cancelled_at_ms,
            } => Self::Cancelled {
                transfer_id: transfer_id.clone(),
                cancelled_at_ms: *cancelled_at_ms,
            },
            ArtifactLifecycleState::Failed {
                reason,
                failed_at_ms,
            } => Self::Failed {
                reason: match reason {
                    ArtifactFailureReason::SourceUnavailable => {
                        ArtifactFailureReasonWire::SourceUnavailable
                    }
                    ArtifactFailureReason::PublishFailed => {
                        ArtifactFailureReasonWire::PublishFailed
                    }
                    ArtifactFailureReason::VerificationFailed => {
                        ArtifactFailureReasonWire::VerificationFailed
                    }
                    ArtifactFailureReason::CleanupFailed => {
                        ArtifactFailureReasonWire::CleanupFailed
                    }
                },
                failed_at_ms: *failed_at_ms,
            },
        }
    }

    fn into_state(self) -> ArtifactLifecycleState {
        match self {
            Self::Registered => ArtifactLifecycleState::Registered,
            Self::Fetching {
                transfer_id,
                chunk_count,
                started_at_ms,
            } => ArtifactLifecycleState::Fetching {
                transfer_id,
                chunk_count,
                started_at_ms,
            },
            Self::AwaitingAck {
                transfer_id,
                chunk_count,
                published_at_ms,
            } => ArtifactLifecycleState::AwaitingAck {
                transfer_id,
                chunk_count,
                published_at_ms,
            },
            Self::Acknowledged {
                transfer_id,
                acknowledged_at_ms,
            } => ArtifactLifecycleState::Acknowledged {
                transfer_id,
                acknowledged_at_ms,
            },
            Self::Expired { expired_at_ms } => ArtifactLifecycleState::Expired { expired_at_ms },
            Self::Cancelled {
                transfer_id,
                cancelled_at_ms,
            } => ArtifactLifecycleState::Cancelled {
                transfer_id,
                cancelled_at_ms,
            },
            Self::Failed {
                reason,
                failed_at_ms,
            } => ArtifactLifecycleState::Failed {
                reason: match reason {
                    ArtifactFailureReasonWire::SourceUnavailable => {
                        ArtifactFailureReason::SourceUnavailable
                    }
                    ArtifactFailureReasonWire::PublishFailed => {
                        ArtifactFailureReason::PublishFailed
                    }
                    ArtifactFailureReasonWire::VerificationFailed => {
                        ArtifactFailureReason::VerificationFailed
                    }
                    ArtifactFailureReasonWire::CleanupFailed => {
                        ArtifactFailureReason::CleanupFailed
                    }
                },
                failed_at_ms,
            },
        }
    }
}
