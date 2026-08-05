//! Durable single-writer repository for local permission policy snapshots.
//!
//! Each accepted domain transition is encoded as a new immutable historical
//! snapshot. The repository swaps the whole bounded history with storage CAS
//! and changes its in-memory current state only after that CAS succeeds.

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::durable_completed_store::{DurableRecordStorage, RawStoreRead, RawStoreWrite};
use crate::permission_policy::{
    CapturePolicySetupCommand, PERMISSION_POLICY_SCHEMA_VERSION, PermissionPolicySnapshot,
    PolicyCapability, PolicyDecision, PolicyRejectReason, PolicyResourceConstraint,
    PolicyTransition, PolicyUpdateCommand, apply_capture_policy_setup, apply_policy_update,
    rollback_policy,
};

const POLICY_RECORD_SCHEMA_VERSION: u16 = 1;
const MAX_POLICY_RECORD_BYTES: usize = 8 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PolicyRepositoryBootstrapError {
    InvalidCapacity,
    Corrupt,
    UnsupportedVersion,
    WrongTarget,
    InvalidHistory,
    Saturated,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PolicyRepositoryResult {
    Applied {
        revision: u64,
    },
    Unchanged {
        revision: u64,
    },
    RevisionConflict {
        expected_revision: u64,
        current_revision: u64,
    },
    Rejected {
        reason: PolicyRejectReason,
    },
    HistoryNotFound,
    Saturated,
    StorageConflict,
    Unavailable,
}

/// Application-owned write port implemented by the canonical repository.
pub trait PermissionPolicyWriter: Send + Sync {
    fn update(&self, command: &PolicyUpdateCommand) -> PolicyRepositoryResult;
    fn rollback(
        &self,
        expected_current_revision: u64,
        restore_revision: u64,
    ) -> PolicyRepositoryResult;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PolicySnapshotRead {
    Snapshot(PermissionPolicySnapshot),
    Unavailable,
}

pub trait PermissionPolicyReader: Send + Sync {
    fn snapshot(&self) -> PolicySnapshotRead;
}

/// Redacted durable binding for one verified admin authorization.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyAdminAuditEvidence {
    authorization_digest: String,
    requester_digest: String,
    target_digest: String,
    session_digest: String,
    target_fingerprint: String,
    nonce_digest: String,
    expires_at: i64,
}

impl PolicyAdminAuditEvidence {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        authorization_id: &str,
        requester_id: &str,
        target_instance_id: &str,
        target_session_id: &str,
        target_fingerprint: &str,
        nonce: &str,
        expires_at: i64,
    ) -> Option<Self> {
        if [
            authorization_id,
            requester_id,
            target_instance_id,
            target_session_id,
            nonce,
        ]
        .into_iter()
        .any(|value| value.trim().is_empty() || value.len() > 256)
            || !is_sha256_digest(target_fingerprint)
            || expires_at <= 0
        {
            return None;
        }
        Some(Self {
            authorization_digest: digest(authorization_id),
            requester_digest: digest(requester_id),
            target_digest: digest(target_instance_id),
            session_digest: digest(target_session_id),
            target_fingerprint: target_fingerprint.to_string(),
            nonce_digest: digest(nonce),
            expires_at,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PolicyAdminWriteResult {
    Policy(PolicyRepositoryResult),
    Replayed,
}

/// Application port that atomically records admin replay/audit and policy state.
pub trait PermissionPolicyAdminWriter: Send + Sync {
    fn update_admin(
        &self,
        command: &PolicyUpdateCommand,
        evidence: &PolicyAdminAuditEvidence,
    ) -> PolicyAdminWriteResult;
    fn rollback_admin(
        &self,
        expected_current_revision: u64,
        restore_revision: u64,
        evidence: &PolicyAdminAuditEvidence,
    ) -> PolicyAdminWriteResult;
}

pub trait LocalCapturePolicyWriter: Send + Sync {
    fn setup_capture(
        &self,
        command: &CapturePolicySetupCommand,
        change_id: &str,
    ) -> PolicyAdminWriteResult;
}

struct RepositoryState {
    storage_revision: u64,
    current: PermissionPolicySnapshot,
    history: BTreeMap<u64, PermissionPolicySnapshot>,
    audits: BTreeMap<String, PolicyAdminAuditRecord>,
}

pub struct DurablePermissionPolicyRepository {
    capacity: usize,
    storage: Arc<dyn DurableRecordStorage>,
    state: Mutex<RepositoryState>,
}

impl DurablePermissionPolicyRepository {
    pub fn bootstrap(
        target_instance_id: &str,
        capacity: usize,
        storage: Arc<dyn DurableRecordStorage>,
    ) -> Result<Self, PolicyRepositoryBootstrapError> {
        if capacity < 2 || capacity > u32::MAX as usize {
            return Err(PolicyRepositoryBootstrapError::InvalidCapacity);
        }
        let (storage_revision, records) = match storage.read() {
            RawStoreRead::Missing { revision } => (revision, Vec::new()),
            RawStoreRead::Records { revision, records } => (revision, records),
            RawStoreRead::Unavailable => return Err(PolicyRepositoryBootstrapError::Unavailable),
        };
        if records.len() > capacity {
            return Err(PolicyRepositoryBootstrapError::Saturated);
        }

        let mut history = BTreeMap::new();
        let mut audits = BTreeMap::new();
        for record in records {
            match decode_record(&record)? {
                DecodedRecord::Snapshot(snapshot) => {
                    if snapshot.target_instance_id() != target_instance_id {
                        return Err(PolicyRepositoryBootstrapError::WrongTarget);
                    }
                    if history.insert(snapshot.revision(), snapshot).is_some() {
                        return Err(PolicyRepositoryBootstrapError::InvalidHistory);
                    }
                }
                DecodedRecord::AdminAudit(audit) => {
                    if audit.target_digest != digest(target_instance_id) {
                        return Err(PolicyRepositoryBootstrapError::WrongTarget);
                    }
                    if audits.insert(audit.nonce_digest.clone(), audit).is_some() {
                        return Err(PolicyRepositoryBootstrapError::InvalidHistory);
                    }
                }
            }
        }

        let current = if history.is_empty() {
            PermissionPolicySnapshot::new(target_instance_id)
                .map_err(|_| PolicyRepositoryBootstrapError::WrongTarget)?
        } else {
            validate_history(&history)?;
            history
                .last_key_value()
                .map(|(_, snapshot)| snapshot.clone())
                .ok_or(PolicyRepositoryBootstrapError::InvalidHistory)?
        };

        Ok(Self {
            capacity,
            storage,
            state: Mutex::new(RepositoryState {
                storage_revision,
                current,
                history,
                audits,
            }),
        })
    }

    pub fn snapshot(&self) -> Option<PermissionPolicySnapshot> {
        self.state.lock().ok().map(|state| state.current.clone())
    }

    pub fn update(&self, command: &PolicyUpdateCommand) -> PolicyRepositoryResult {
        let Ok(mut state) = self.state.lock() else {
            return PolicyRepositoryResult::Unavailable;
        };
        let transition = apply_policy_update(&state.current, command);
        self.commit_transition(&mut state, transition)
    }

    pub fn rollback(
        &self,
        expected_current_revision: u64,
        restore_revision: u64,
    ) -> PolicyRepositoryResult {
        let Ok(mut state) = self.state.lock() else {
            return PolicyRepositoryResult::Unavailable;
        };
        let Some(historical) = state.history.get(&restore_revision).cloned() else {
            return PolicyRepositoryResult::HistoryNotFound;
        };
        let transition = rollback_policy(&state.current, &historical, expected_current_revision);
        self.commit_transition(&mut state, transition)
    }

    fn commit_transition(
        &self,
        state: &mut RepositoryState,
        transition: PolicyTransition,
    ) -> PolicyRepositoryResult {
        let (snapshot, previous_revision) = match transition {
            PolicyTransition::Applied {
                snapshot,
                previous_revision,
            } => (snapshot, previous_revision),
            PolicyTransition::Unchanged { revision } => {
                return PolicyRepositoryResult::Unchanged { revision };
            }
            PolicyTransition::RevisionConflict {
                expected_revision,
                current_revision,
            } => {
                return PolicyRepositoryResult::RevisionConflict {
                    expected_revision,
                    current_revision,
                };
            }
            PolicyTransition::Rejected { reason } => {
                return PolicyRepositoryResult::Rejected { reason };
            }
        };

        let mut next_history = state.history.clone();
        next_history
            .entry(state.current.revision())
            .or_insert_with(|| state.current.clone());
        if next_history.len() + state.audits.len() >= self.capacity {
            return PolicyRepositoryResult::Saturated;
        }
        let revision = snapshot.revision();
        if previous_revision != state.current.revision()
            || next_history.insert(revision, snapshot.clone()).is_some()
        {
            return PolicyRepositoryResult::Unavailable;
        }
        let Some(records) = encode_records(&next_history, &state.audits) else {
            return PolicyRepositoryResult::Unavailable;
        };

        match self
            .storage
            .compare_and_swap(state.storage_revision, records)
        {
            RawStoreWrite::Written {
                revision: storage_revision,
            } if storage_revision > state.storage_revision => {
                state.storage_revision = storage_revision;
                state.current = snapshot;
                state.history = next_history;
                PolicyRepositoryResult::Applied { revision }
            }
            RawStoreWrite::Conflict => PolicyRepositoryResult::StorageConflict,
            RawStoreWrite::Written { .. } | RawStoreWrite::Unavailable => {
                PolicyRepositoryResult::Unavailable
            }
        }
    }

    pub fn update_admin(
        &self,
        command: &PolicyUpdateCommand,
        evidence: &PolicyAdminAuditEvidence,
    ) -> PolicyAdminWriteResult {
        let Ok(mut state) = self.state.lock() else {
            return PolicyAdminWriteResult::Policy(PolicyRepositoryResult::Unavailable);
        };
        if state.audits.contains_key(&evidence.nonce_digest) {
            return PolicyAdminWriteResult::Replayed;
        }
        let transition = apply_policy_update(&state.current, command);
        self.commit_admin_transition(
            &mut state,
            transition,
            evidence,
            PolicyAdminAuditAction::Update,
        )
    }

    pub fn rollback_admin(
        &self,
        expected_current_revision: u64,
        restore_revision: u64,
        evidence: &PolicyAdminAuditEvidence,
    ) -> PolicyAdminWriteResult {
        let Ok(mut state) = self.state.lock() else {
            return PolicyAdminWriteResult::Policy(PolicyRepositoryResult::Unavailable);
        };
        if state.audits.contains_key(&evidence.nonce_digest) {
            return PolicyAdminWriteResult::Replayed;
        }
        let Some(historical) = state.history.get(&restore_revision).cloned() else {
            return self.commit_admin_result(
                &mut state,
                PolicyRepositoryResult::HistoryNotFound,
                None,
                evidence,
                PolicyAdminAuditAction::Rollback,
            );
        };
        let transition = rollback_policy(&state.current, &historical, expected_current_revision);
        self.commit_admin_transition(
            &mut state,
            transition,
            evidence,
            PolicyAdminAuditAction::Rollback,
        )
    }

    pub fn setup_capture(
        &self,
        command: &CapturePolicySetupCommand,
        change_id: &str,
    ) -> PolicyAdminWriteResult {
        let Some(evidence) = PolicyAdminAuditEvidence::new(
            "local-policy-setup",
            "local-ui",
            command.target_instance_id(),
            "local-session",
            &digest(command.target_instance_id()),
            change_id,
            i64::MAX,
        ) else {
            return PolicyAdminWriteResult::Policy(PolicyRepositoryResult::Unavailable);
        };
        let Ok(mut state) = self.state.lock() else {
            return PolicyAdminWriteResult::Policy(PolicyRepositoryResult::Unavailable);
        };
        if state.audits.contains_key(&evidence.nonce_digest) {
            return PolicyAdminWriteResult::Replayed;
        }
        let transition = apply_capture_policy_setup(&state.current, command);
        if let PolicyTransition::Unchanged { revision } = transition {
            return PolicyAdminWriteResult::Policy(PolicyRepositoryResult::Unchanged { revision });
        }
        self.commit_admin_transition(
            &mut state,
            transition,
            &evidence,
            PolicyAdminAuditAction::LocalSetup,
        )
    }

    fn commit_admin_transition(
        &self,
        state: &mut RepositoryState,
        transition: PolicyTransition,
        evidence: &PolicyAdminAuditEvidence,
        action: PolicyAdminAuditAction,
    ) -> PolicyAdminWriteResult {
        let (result, applied) = match transition {
            PolicyTransition::Applied {
                snapshot,
                previous_revision,
            } => (
                PolicyRepositoryResult::Applied {
                    revision: snapshot.revision(),
                },
                Some((snapshot, previous_revision)),
            ),
            PolicyTransition::Unchanged { revision } => {
                (PolicyRepositoryResult::Unchanged { revision }, None)
            }
            PolicyTransition::RevisionConflict {
                expected_revision,
                current_revision,
            } => (
                PolicyRepositoryResult::RevisionConflict {
                    expected_revision,
                    current_revision,
                },
                None,
            ),
            PolicyTransition::Rejected { reason } => {
                (PolicyRepositoryResult::Rejected { reason }, None)
            }
        };
        self.commit_admin_result(state, result, applied, evidence, action)
    }

    fn commit_admin_result(
        &self,
        state: &mut RepositoryState,
        result: PolicyRepositoryResult,
        applied: Option<(PermissionPolicySnapshot, u64)>,
        evidence: &PolicyAdminAuditEvidence,
        action: PolicyAdminAuditAction,
    ) -> PolicyAdminWriteResult {
        let mut next_history = state.history.clone();
        next_history
            .entry(state.current.revision())
            .or_insert_with(|| state.current.clone());
        let mut next_current = state.current.clone();
        if let Some((snapshot, previous_revision)) = applied {
            if previous_revision != state.current.revision()
                || next_history
                    .insert(snapshot.revision(), snapshot.clone())
                    .is_some()
            {
                return PolicyAdminWriteResult::Policy(PolicyRepositoryResult::Unavailable);
            }
            next_current = snapshot;
        }

        let audit = PolicyAdminAuditRecord::new(
            evidence,
            action,
            PolicyAdminAuditOutcome::from_repository_result(result),
            state.current.revision(),
            next_current.revision(),
        );
        let mut next_audits = state.audits.clone();
        if next_audits
            .insert(evidence.nonce_digest.clone(), audit)
            .is_some()
        {
            return PolicyAdminWriteResult::Replayed;
        }
        if next_history.len() + next_audits.len() > self.capacity {
            return PolicyAdminWriteResult::Policy(PolicyRepositoryResult::Saturated);
        }
        let Some(records) = encode_records(&next_history, &next_audits) else {
            return PolicyAdminWriteResult::Policy(PolicyRepositoryResult::Unavailable);
        };

        match self
            .storage
            .compare_and_swap(state.storage_revision, records)
        {
            RawStoreWrite::Written {
                revision: storage_revision,
            } if storage_revision > state.storage_revision => {
                state.storage_revision = storage_revision;
                state.current = next_current;
                state.history = next_history;
                state.audits = next_audits;
                PolicyAdminWriteResult::Policy(result)
            }
            RawStoreWrite::Conflict => {
                PolicyAdminWriteResult::Policy(PolicyRepositoryResult::StorageConflict)
            }
            RawStoreWrite::Written { .. } | RawStoreWrite::Unavailable => {
                PolicyAdminWriteResult::Policy(PolicyRepositoryResult::Unavailable)
            }
        }
    }
}

impl PermissionPolicyWriter for DurablePermissionPolicyRepository {
    fn update(&self, command: &PolicyUpdateCommand) -> PolicyRepositoryResult {
        Self::update(self, command)
    }

    fn rollback(
        &self,
        expected_current_revision: u64,
        restore_revision: u64,
    ) -> PolicyRepositoryResult {
        Self::rollback(self, expected_current_revision, restore_revision)
    }
}

impl PermissionPolicyReader for DurablePermissionPolicyRepository {
    fn snapshot(&self) -> PolicySnapshotRead {
        Self::snapshot(self).map_or(
            PolicySnapshotRead::Unavailable,
            PolicySnapshotRead::Snapshot,
        )
    }
}

impl PermissionPolicyAdminWriter for DurablePermissionPolicyRepository {
    fn update_admin(
        &self,
        command: &PolicyUpdateCommand,
        evidence: &PolicyAdminAuditEvidence,
    ) -> PolicyAdminWriteResult {
        Self::update_admin(self, command, evidence)
    }

    fn rollback_admin(
        &self,
        expected_current_revision: u64,
        restore_revision: u64,
        evidence: &PolicyAdminAuditEvidence,
    ) -> PolicyAdminWriteResult {
        Self::rollback_admin(self, expected_current_revision, restore_revision, evidence)
    }
}

impl LocalCapturePolicyWriter for DurablePermissionPolicyRepository {
    fn setup_capture(
        &self,
        command: &CapturePolicySetupCommand,
        change_id: &str,
    ) -> PolicyAdminWriteResult {
        Self::setup_capture(self, command, change_id)
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum DecisionWire {
    Allowed,
    Denied,
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
enum ResourceWire {
    Any,
    ExactCamera { resource_id: String },
    ExactDisplay { resource_id: String },
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct EntryWire {
    decision: DecisionWire,
    resource: ResourceWire,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct PolicySnapshotWire {
    schema_version: u16,
    policy_schema_version: u16,
    target_instance_id: String,
    revision: u64,
    camera: EntryWire,
    screen: EntryWire,
}

#[derive(Deserialize)]
struct VersionProbe {
    schema_version: u16,
}

#[derive(Deserialize)]
struct RecordKindProbe {
    #[serde(default)]
    record_kind: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum PolicyAdminAuditAction {
    Update,
    Rollback,
    LocalSetup,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum PolicyAdminAuditOutcome {
    Applied,
    Unchanged,
    RevisionConflict,
    Rejected,
}

impl PolicyAdminAuditOutcome {
    fn from_repository_result(result: PolicyRepositoryResult) -> Self {
        match result {
            PolicyRepositoryResult::Applied { .. } => Self::Applied,
            PolicyRepositoryResult::Unchanged { .. } => Self::Unchanged,
            PolicyRepositoryResult::RevisionConflict { .. } => Self::RevisionConflict,
            PolicyRepositoryResult::Rejected { .. }
            | PolicyRepositoryResult::HistoryNotFound
            | PolicyRepositoryResult::Saturated
            | PolicyRepositoryResult::StorageConflict
            | PolicyRepositoryResult::Unavailable => Self::Rejected,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PolicyAdminAuditRecord {
    authorization_digest: String,
    requester_digest: String,
    target_digest: String,
    session_digest: String,
    target_fingerprint: String,
    nonce_digest: String,
    expires_at: i64,
    action: PolicyAdminAuditAction,
    outcome: PolicyAdminAuditOutcome,
    previous_revision: u64,
    resulting_revision: u64,
}

impl PolicyAdminAuditRecord {
    fn new(
        evidence: &PolicyAdminAuditEvidence,
        action: PolicyAdminAuditAction,
        outcome: PolicyAdminAuditOutcome,
        previous_revision: u64,
        resulting_revision: u64,
    ) -> Self {
        Self {
            authorization_digest: evidence.authorization_digest.clone(),
            requester_digest: evidence.requester_digest.clone(),
            target_digest: evidence.target_digest.clone(),
            session_digest: evidence.session_digest.clone(),
            target_fingerprint: evidence.target_fingerprint.clone(),
            nonce_digest: evidence.nonce_digest.clone(),
            expires_at: evidence.expires_at,
            action,
            outcome,
            previous_revision,
            resulting_revision,
        }
    }

    fn validate(&self) -> bool {
        [
            self.authorization_digest.as_str(),
            self.requester_digest.as_str(),
            self.target_digest.as_str(),
            self.session_digest.as_str(),
            self.target_fingerprint.as_str(),
            self.nonce_digest.as_str(),
        ]
        .into_iter()
        .all(is_sha256_digest)
            && self.expires_at > 0
            && self.resulting_revision >= self.previous_revision
            && (self.outcome != PolicyAdminAuditOutcome::Applied
                || self.resulting_revision == self.previous_revision.saturating_add(1))
    }
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct PolicyAdminAuditWire {
    schema_version: u16,
    record_kind: String,
    authorization_digest: String,
    requester_digest: String,
    target_digest: String,
    session_digest: String,
    target_fingerprint: String,
    nonce_digest: String,
    expires_at: i64,
    action: PolicyAdminAuditAction,
    outcome: PolicyAdminAuditOutcome,
    previous_revision: u64,
    resulting_revision: u64,
}

enum DecodedRecord {
    Snapshot(PermissionPolicySnapshot),
    AdminAudit(PolicyAdminAuditRecord),
}

fn encode_records(
    history: &BTreeMap<u64, PermissionPolicySnapshot>,
    audits: &BTreeMap<String, PolicyAdminAuditRecord>,
) -> Option<Vec<Vec<u8>>> {
    history
        .values()
        .map(encode_snapshot)
        .chain(audits.values().map(encode_audit))
        .collect()
}

fn encode_snapshot(snapshot: &PermissionPolicySnapshot) -> Option<Vec<u8>> {
    let wire = PolicySnapshotWire {
        schema_version: POLICY_RECORD_SCHEMA_VERSION,
        policy_schema_version: snapshot.schema_version(),
        target_instance_id: snapshot.target_instance_id().to_string(),
        revision: snapshot.revision(),
        camera: encode_entry(snapshot, PolicyCapability::CameraCapture),
        screen: encode_entry(snapshot, PolicyCapability::ScreenCapture),
    };
    let encoded = serde_json::to_vec(&wire).ok()?;
    (encoded.len() <= MAX_POLICY_RECORD_BYTES).then_some(encoded)
}

fn encode_entry(snapshot: &PermissionPolicySnapshot, capability: PolicyCapability) -> EntryWire {
    let entry = snapshot.entry(capability);
    EntryWire {
        decision: match entry.decision() {
            PolicyDecision::Allowed => DecisionWire::Allowed,
            PolicyDecision::Denied => DecisionWire::Denied,
        },
        resource: match entry.resource() {
            PolicyResourceConstraint::Any => ResourceWire::Any,
            PolicyResourceConstraint::ExactCamera { resource_id } => ResourceWire::ExactCamera {
                resource_id: resource_id.clone(),
            },
            PolicyResourceConstraint::ExactDisplay { resource_id } => ResourceWire::ExactDisplay {
                resource_id: resource_id.clone(),
            },
        },
    }
}

fn decode_snapshot(
    encoded: &[u8],
) -> Result<PermissionPolicySnapshot, PolicyRepositoryBootstrapError> {
    if encoded.len() > MAX_POLICY_RECORD_BYTES {
        return Err(PolicyRepositoryBootstrapError::Corrupt);
    }
    let probe: VersionProbe =
        serde_json::from_slice(encoded).map_err(|_| PolicyRepositoryBootstrapError::Corrupt)?;
    if probe.schema_version != POLICY_RECORD_SCHEMA_VERSION {
        return Err(PolicyRepositoryBootstrapError::UnsupportedVersion);
    }
    let wire: PolicySnapshotWire =
        serde_json::from_slice(encoded).map_err(|_| PolicyRepositoryBootstrapError::Corrupt)?;
    if wire.policy_schema_version != PERMISSION_POLICY_SCHEMA_VERSION {
        return Err(PolicyRepositoryBootstrapError::UnsupportedVersion);
    }
    PermissionPolicySnapshot::restore(
        wire.target_instance_id,
        wire.revision,
        decode_entry(wire.camera),
        decode_entry(wire.screen),
    )
    .map_err(|_| PolicyRepositoryBootstrapError::Corrupt)
}

fn encode_audit(audit: &PolicyAdminAuditRecord) -> Option<Vec<u8>> {
    let wire = PolicyAdminAuditWire {
        schema_version: POLICY_RECORD_SCHEMA_VERSION,
        record_kind: "admin_audit".to_string(),
        authorization_digest: audit.authorization_digest.clone(),
        requester_digest: audit.requester_digest.clone(),
        target_digest: audit.target_digest.clone(),
        session_digest: audit.session_digest.clone(),
        target_fingerprint: audit.target_fingerprint.clone(),
        nonce_digest: audit.nonce_digest.clone(),
        expires_at: audit.expires_at,
        action: audit.action,
        outcome: audit.outcome,
        previous_revision: audit.previous_revision,
        resulting_revision: audit.resulting_revision,
    };
    let encoded = serde_json::to_vec(&wire).ok()?;
    (encoded.len() <= MAX_POLICY_RECORD_BYTES).then_some(encoded)
}

fn decode_record(encoded: &[u8]) -> Result<DecodedRecord, PolicyRepositoryBootstrapError> {
    if encoded.len() > MAX_POLICY_RECORD_BYTES {
        return Err(PolicyRepositoryBootstrapError::Corrupt);
    }
    let kind: RecordKindProbe =
        serde_json::from_slice(encoded).map_err(|_| PolicyRepositoryBootstrapError::Corrupt)?;
    match kind.record_kind.as_deref() {
        None => decode_snapshot(encoded).map(DecodedRecord::Snapshot),
        Some("admin_audit") => decode_audit(encoded).map(DecodedRecord::AdminAudit),
        Some(_) => Err(PolicyRepositoryBootstrapError::Corrupt),
    }
}

fn decode_audit(encoded: &[u8]) -> Result<PolicyAdminAuditRecord, PolicyRepositoryBootstrapError> {
    let probe: VersionProbe =
        serde_json::from_slice(encoded).map_err(|_| PolicyRepositoryBootstrapError::Corrupt)?;
    if probe.schema_version != POLICY_RECORD_SCHEMA_VERSION {
        return Err(PolicyRepositoryBootstrapError::UnsupportedVersion);
    }
    let wire: PolicyAdminAuditWire =
        serde_json::from_slice(encoded).map_err(|_| PolicyRepositoryBootstrapError::Corrupt)?;
    if wire.record_kind != "admin_audit" {
        return Err(PolicyRepositoryBootstrapError::Corrupt);
    }
    let audit = PolicyAdminAuditRecord {
        authorization_digest: wire.authorization_digest,
        requester_digest: wire.requester_digest,
        target_digest: wire.target_digest,
        session_digest: wire.session_digest,
        target_fingerprint: wire.target_fingerprint,
        nonce_digest: wire.nonce_digest,
        expires_at: wire.expires_at,
        action: wire.action,
        outcome: wire.outcome,
        previous_revision: wire.previous_revision,
        resulting_revision: wire.resulting_revision,
    };
    audit
        .validate()
        .then_some(audit)
        .ok_or(PolicyRepositoryBootstrapError::Corrupt)
}

fn decode_entry(wire: EntryWire) -> (PolicyDecision, PolicyResourceConstraint) {
    let decision = match wire.decision {
        DecisionWire::Allowed => PolicyDecision::Allowed,
        DecisionWire::Denied => PolicyDecision::Denied,
    };
    let resource = match wire.resource {
        ResourceWire::Any => PolicyResourceConstraint::Any,
        ResourceWire::ExactCamera { resource_id } => {
            PolicyResourceConstraint::exact_camera(resource_id)
        }
        ResourceWire::ExactDisplay { resource_id } => {
            PolicyResourceConstraint::exact_display(resource_id)
        }
    };
    (decision, resource)
}

fn validate_history(
    history: &BTreeMap<u64, PermissionPolicySnapshot>,
) -> Result<(), PolicyRepositoryBootstrapError> {
    let mut expected = 0;
    for (revision, snapshot) in history {
        if *revision != expected || snapshot.revision() != *revision {
            return Err(PolicyRepositoryBootstrapError::InvalidHistory);
        }
        expected = expected
            .checked_add(1)
            .ok_or(PolicyRepositoryBootstrapError::InvalidHistory)?;
    }
    Ok(())
}

fn digest(value: &str) -> String {
    format!("sha256:{:x}", Sha256::digest(value.as_bytes()))
}

fn is_sha256_digest(value: &str) -> bool {
    value.strip_prefix("sha256:").is_some_and(|digest| {
        digest.len() == 64 && digest.bytes().all(|byte| byte.is_ascii_hexdigit())
    })
}
