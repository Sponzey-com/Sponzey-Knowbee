//! Explicit local setup use case for one atomic camera/screen policy change.

use std::fmt;
use std::sync::Arc;

use crate::permission_policy::{
    CapturePolicySetupCommand, PermissionPolicySnapshot, PolicyCapability, PolicyDecision,
    PolicyRejectReason, PolicyStateError,
};
use crate::policy_repository::{
    LocalCapturePolicyWriter, PolicyAdminWriteResult, PolicyRepositoryResult,
};
use crate::settings::PermissionSettings;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LocalPolicySetupResult {
    Policy(PolicyRepositoryResult),
    Duplicate,
}

pub struct LocalCapturePolicySetupUseCase {
    writer: Arc<dyn LocalCapturePolicyWriter>,
}

impl LocalCapturePolicySetupUseCase {
    pub fn new(writer: Arc<dyn LocalCapturePolicyWriter>) -> Self {
        Self { writer }
    }

    pub fn execute(
        &self,
        command: &CapturePolicySetupCommand,
        change_id: &str,
    ) -> LocalPolicySetupResult {
        match self.writer.setup_capture(command, change_id) {
            PolicyAdminWriteResult::Policy(result) => LocalPolicySetupResult::Policy(result),
            PolicyAdminWriteResult::Replayed => LocalPolicySetupResult::Duplicate,
        }
    }
}

/// Closed presentation-facing outcome for the canonical capture-policy gate.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CapturePolicyCommitResult {
    Applied {
        revision: u64,
    },
    Unchanged {
        revision: u64,
    },
    Duplicate,
    RevisionConflict {
        expected_revision: u64,
        current_revision: u64,
    },
    Rejected {
        reason: PolicyRejectReason,
    },
    InvalidCommand(PolicyStateError),
    Saturated,
    StorageConflict,
    Unavailable,
}

impl CapturePolicyCommitResult {
    pub fn committed_revision(self) -> Option<u64> {
        match self {
            Self::Applied { revision } | Self::Unchanged { revision } => Some(revision),
            Self::Duplicate
            | Self::RevisionConflict { .. }
            | Self::Rejected { .. }
            | Self::InvalidCommand(_)
            | Self::Saturated
            | Self::StorageConflict
            | Self::Unavailable => None,
        }
    }
}

impl fmt::Display for CapturePolicyCommitResult {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::Applied { .. } => "capture_policy_applied",
            Self::Unchanged { .. } => "capture_policy_unchanged",
            Self::Duplicate => "capture_policy_change_duplicate",
            Self::RevisionConflict { .. } => "capture_policy_revision_conflict",
            Self::Rejected { .. } => "capture_policy_rejected",
            Self::InvalidCommand(_) => "capture_policy_command_invalid",
            Self::Saturated => "capture_policy_store_saturated",
            Self::StorageConflict => "capture_policy_storage_conflict",
            Self::Unavailable => "capture_policy_unavailable",
        })
    }
}

/// Projects only the two capture decisions. Other legacy settings remain
/// presentation staging values and are not canonical policy fields.
pub fn project_capture_policy_to_settings(
    snapshot: &PermissionPolicySnapshot,
    settings: &mut PermissionSettings,
) -> u64 {
    settings.allow_camera_access =
        snapshot.entry(PolicyCapability::CameraCapture).decision() == PolicyDecision::Allowed;
    settings.allow_screen_capture =
        snapshot.entry(PolicyCapability::ScreenCapture).decision() == PolicyDecision::Allowed;
    snapshot.revision()
}

pub fn capture_policy_matches_settings(
    snapshot: &PermissionPolicySnapshot,
    settings: &PermissionSettings,
) -> bool {
    snapshot.entry(PolicyCapability::CameraCapture).decision()
        == decision(settings.allow_camera_access)
        && snapshot.entry(PolicyCapability::ScreenCapture).decision()
            == decision(settings.allow_screen_capture)
}

/// Commits the camera/screen staging pair against the revision observed when
/// it was projected. A conflict is returned to the GUI rather than overwriting
/// a concurrent admin or local transition.
pub fn commit_capture_policy_settings(
    writer: Arc<dyn LocalCapturePolicyWriter>,
    observed: &PermissionPolicySnapshot,
    settings: &PermissionSettings,
    change_id: &str,
) -> CapturePolicyCommitResult {
    let command = match CapturePolicySetupCommand::new(
        observed.target_instance_id(),
        observed.revision(),
        decision(settings.allow_camera_access),
        observed
            .entry(PolicyCapability::CameraCapture)
            .resource()
            .clone(),
        decision(settings.allow_screen_capture),
        observed
            .entry(PolicyCapability::ScreenCapture)
            .resource()
            .clone(),
    ) {
        Ok(command) => command,
        Err(error) => return CapturePolicyCommitResult::InvalidCommand(error),
    };
    match LocalCapturePolicySetupUseCase::new(writer).execute(&command, change_id) {
        LocalPolicySetupResult::Duplicate => CapturePolicyCommitResult::Duplicate,
        LocalPolicySetupResult::Policy(PolicyRepositoryResult::Applied { revision }) => {
            CapturePolicyCommitResult::Applied { revision }
        }
        LocalPolicySetupResult::Policy(PolicyRepositoryResult::Unchanged { revision }) => {
            CapturePolicyCommitResult::Unchanged { revision }
        }
        LocalPolicySetupResult::Policy(PolicyRepositoryResult::RevisionConflict {
            expected_revision,
            current_revision,
        }) => CapturePolicyCommitResult::RevisionConflict {
            expected_revision,
            current_revision,
        },
        LocalPolicySetupResult::Policy(PolicyRepositoryResult::Rejected { reason }) => {
            CapturePolicyCommitResult::Rejected { reason }
        }
        LocalPolicySetupResult::Policy(PolicyRepositoryResult::Saturated) => {
            CapturePolicyCommitResult::Saturated
        }
        LocalPolicySetupResult::Policy(PolicyRepositoryResult::StorageConflict) => {
            CapturePolicyCommitResult::StorageConflict
        }
        LocalPolicySetupResult::Policy(
            PolicyRepositoryResult::HistoryNotFound | PolicyRepositoryResult::Unavailable,
        ) => CapturePolicyCommitResult::Unavailable,
    }
}

fn decision(allowed: bool) -> PolicyDecision {
    if allowed {
        PolicyDecision::Allowed
    } else {
        PolicyDecision::Denied
    }
}
