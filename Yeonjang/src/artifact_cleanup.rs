//! Application owner for artifact file cleanup and restart recovery.
//!
//! The port receives only an opaque artifact reference. A durable terminal
//! transition precedes removal, and durable cleanup completion follows a
//! removed or already-absent result.

use std::collections::BTreeSet;
use std::sync::Arc;

use crate::artifact_lifecycle::{
    ArtifactCleanupStatus, ArtifactEvent, ArtifactLifecycle, ArtifactTransitionReject,
};
use crate::artifact_repository::{
    ArtifactLifecycleList, ArtifactLifecycleRead, ArtifactLifecycleStore, ArtifactRepositoryResult,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArtifactRemovalResult {
    Removed,
    AlreadyMissing,
    Rejected,
    Unavailable,
}

pub trait ArtifactCleanupPort: Send + Sync {
    fn remove(&self, artifact_ref: &str) -> ArtifactRemovalResult;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ArtifactInventoryResult {
    References(Vec<String>),
    Unavailable,
}

pub trait ArtifactInventoryPort: Send + Sync {
    fn references(&self) -> ArtifactInventoryResult;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArtifactCleanupReject {
    Missing,
    RevisionConflict,
    NotTerminal,
    RemovalRejected,
    RemovalUnavailable,
    StorageUnavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArtifactCleanupOutcome {
    Completed {
        lifecycle_revision: u64,
        already_missing: bool,
    },
    AlreadyCompleted {
        lifecycle_revision: u64,
    },
    Deferred {
        reason: ArtifactCleanupReject,
    },
    Rejected {
        reason: ArtifactCleanupReject,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct ArtifactCleanupRecoveryReport {
    pub completed: usize,
    pub already_completed: usize,
    pub deferred: usize,
    pub skipped_active: usize,
    pub orphan_completed: usize,
}

pub struct ArtifactCleanupUseCase {
    store: Arc<dyn ArtifactLifecycleStore>,
    cleanup: Arc<dyn ArtifactCleanupPort>,
    inventory: Option<Arc<dyn ArtifactInventoryPort>>,
}

impl ArtifactCleanupUseCase {
    pub fn new(
        store: Arc<dyn ArtifactLifecycleStore>,
        cleanup: Arc<dyn ArtifactCleanupPort>,
    ) -> Self {
        Self {
            store,
            cleanup,
            inventory: None,
        }
    }

    pub fn with_inventory(mut self, inventory: Arc<dyn ArtifactInventoryPort>) -> Self {
        self.inventory = Some(inventory);
        self
    }

    pub fn cleanup(
        &self,
        artifact_ref: &str,
        expected_revision: u64,
        now_ms: i64,
    ) -> ArtifactCleanupOutcome {
        let lifecycle = match self.store.read(artifact_ref) {
            ArtifactLifecycleRead::Found(lifecycle) => lifecycle,
            ArtifactLifecycleRead::Missing => {
                return rejected(ArtifactCleanupReject::Missing);
            }
            ArtifactLifecycleRead::Unavailable => {
                return deferred(ArtifactCleanupReject::StorageUnavailable);
            }
        };
        if lifecycle.revision() != expected_revision {
            return rejected(ArtifactCleanupReject::RevisionConflict);
        }
        if let ArtifactCleanupStatus::Completed { .. } = lifecycle.cleanup_status() {
            return ArtifactCleanupOutcome::AlreadyCompleted {
                lifecycle_revision: lifecycle.revision(),
            };
        }
        if !lifecycle.state().is_terminal() {
            return rejected(ArtifactCleanupReject::NotTerminal);
        }
        let already_missing = match self.cleanup.remove(artifact_ref) {
            ArtifactRemovalResult::Removed => false,
            ArtifactRemovalResult::AlreadyMissing => true,
            ArtifactRemovalResult::Rejected => {
                return rejected(ArtifactCleanupReject::RemovalRejected);
            }
            ArtifactRemovalResult::Unavailable => {
                return deferred(ArtifactCleanupReject::RemovalUnavailable);
            }
        };
        match self.store.apply(
            artifact_ref,
            expected_revision,
            &ArtifactEvent::CleanupCompleted { now_ms },
        ) {
            ArtifactRepositoryResult::Applied { revision } => ArtifactCleanupOutcome::Completed {
                lifecycle_revision: revision,
                already_missing,
            },
            ArtifactRepositoryResult::Idempotent { revision } => {
                ArtifactCleanupOutcome::AlreadyCompleted {
                    lifecycle_revision: revision,
                }
            }
            result => map_store_result(result),
        }
    }

    /// Reconciles durable state before cleanup. Active records are expired by
    /// canonical CAS only after their bound TTL, then become removable.
    pub fn recover(&self, now_ms: i64) -> ArtifactCleanupRecoveryReport {
        let ArtifactLifecycleList::Snapshots(snapshots) = self.store.list() else {
            return ArtifactCleanupRecoveryReport {
                deferred: 1,
                ..ArtifactCleanupRecoveryReport::default()
            };
        };
        let mut report = ArtifactCleanupRecoveryReport::default();
        let canonical_refs = snapshots
            .iter()
            .map(|lifecycle| lifecycle.binding().artifact_ref().to_string())
            .collect::<BTreeSet<_>>();
        for lifecycle in snapshots {
            let Some(candidate) = self.recovery_candidate(lifecycle, now_ms) else {
                report.skipped_active += 1;
                continue;
            };
            match self.cleanup(
                candidate.binding().artifact_ref(),
                candidate.revision(),
                now_ms,
            ) {
                ArtifactCleanupOutcome::Completed { .. } => report.completed += 1,
                ArtifactCleanupOutcome::AlreadyCompleted { .. } => {
                    report.already_completed += 1;
                }
                ArtifactCleanupOutcome::Deferred { .. }
                | ArtifactCleanupOutcome::Rejected { .. } => report.deferred += 1,
            }
        }
        self.recover_orphans(&canonical_refs, &mut report);
        report
    }

    fn recover_orphans(
        &self,
        canonical_refs: &BTreeSet<String>,
        report: &mut ArtifactCleanupRecoveryReport,
    ) {
        let Some(inventory) = &self.inventory else {
            return;
        };
        let ArtifactInventoryResult::References(references) = inventory.references() else {
            report.deferred += 1;
            return;
        };
        for artifact_ref in references {
            if canonical_refs.contains(&artifact_ref) {
                continue;
            }
            match self.cleanup.remove(&artifact_ref) {
                ArtifactRemovalResult::Removed | ArtifactRemovalResult::AlreadyMissing => {
                    report.orphan_completed += 1;
                }
                ArtifactRemovalResult::Rejected | ArtifactRemovalResult::Unavailable => {
                    report.deferred += 1;
                }
            }
        }
    }

    fn recovery_candidate(
        &self,
        lifecycle: ArtifactLifecycle,
        now_ms: i64,
    ) -> Option<ArtifactLifecycle> {
        if matches!(
            lifecycle.cleanup_status(),
            ArtifactCleanupStatus::Completed { .. }
        ) {
            return None;
        }
        if lifecycle.state().is_terminal() {
            return Some(lifecycle);
        }
        if now_ms < lifecycle.binding().expires_at_ms() {
            return None;
        }
        match self.store.apply(
            lifecycle.binding().artifact_ref(),
            lifecycle.revision(),
            &ArtifactEvent::Expire { now_ms },
        ) {
            ArtifactRepositoryResult::Applied { .. }
            | ArtifactRepositoryResult::Idempotent { .. } => {
                match self.store.read(lifecycle.binding().artifact_ref()) {
                    ArtifactLifecycleRead::Found(expired) => Some(expired),
                    ArtifactLifecycleRead::Missing | ArtifactLifecycleRead::Unavailable => None,
                }
            }
            ArtifactRepositoryResult::RevisionConflict { .. }
            | ArtifactRepositoryResult::TransitionRejected { .. }
            | ArtifactRepositoryResult::BindingConflict
            | ArtifactRepositoryResult::Missing
            | ArtifactRepositoryResult::Saturated
            | ArtifactRepositoryResult::StorageConflict
            | ArtifactRepositoryResult::Unavailable
            | ArtifactRepositoryResult::Registered { .. } => None,
        }
    }
}

fn map_store_result(result: ArtifactRepositoryResult) -> ArtifactCleanupOutcome {
    match result {
        ArtifactRepositoryResult::RevisionConflict { .. } => {
            rejected(ArtifactCleanupReject::RevisionConflict)
        }
        ArtifactRepositoryResult::TransitionRejected { reason } => rejected(match reason {
            ArtifactTransitionReject::InvalidState
            | ArtifactTransitionReject::TerminalState
            | ArtifactTransitionReject::InvalidEvent
            | ArtifactTransitionReject::WrongOwner
            | ArtifactTransitionReject::WrongTransfer
            | ArtifactTransitionReject::DigestMismatch
            | ArtifactTransitionReject::Expired
            | ArtifactTransitionReject::NotExpired
            | ArtifactTransitionReject::RevisionOverflow => ArtifactCleanupReject::NotTerminal,
        }),
        ArtifactRepositoryResult::Missing => rejected(ArtifactCleanupReject::Missing),
        ArtifactRepositoryResult::StorageConflict
        | ArtifactRepositoryResult::Unavailable
        | ArtifactRepositoryResult::Saturated
        | ArtifactRepositoryResult::BindingConflict => {
            deferred(ArtifactCleanupReject::StorageUnavailable)
        }
        ArtifactRepositoryResult::Registered { .. }
        | ArtifactRepositoryResult::Applied { .. }
        | ArtifactRepositoryResult::Idempotent { .. } => {
            deferred(ArtifactCleanupReject::StorageUnavailable)
        }
    }
}

fn rejected(reason: ArtifactCleanupReject) -> ArtifactCleanupOutcome {
    ArtifactCleanupOutcome::Rejected { reason }
}

fn deferred(reason: ArtifactCleanupReject) -> ArtifactCleanupOutcome {
    ArtifactCleanupOutcome::Deferred { reason }
}
