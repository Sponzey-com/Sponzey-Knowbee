//! Composition-root bootstrap for the canonical local capture policy.
//!
//! The reviewed legacy settings are a one-time compatibility input only when
//! the canonical atomic store is missing. Once a canonical store exists, its
//! target-bound snapshot is always authoritative.

use std::fmt;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;

use crate::atomic_local_storage::{AtomicLocalStorage, LocalStorageBuildError, LocalStorageHealth};
use crate::local_policy_setup::{LocalCapturePolicySetupUseCase, LocalPolicySetupResult};
use crate::permission_policy::{
    CapturePolicySetupCommand, PolicyCapability, PolicyDecision, PolicyStateError,
};
use crate::permission_policy_migration::{
    LegacyPolicyMigrationError, migrate_legacy_capture_policy,
};
use crate::policy_repository::{
    DurablePermissionPolicyRepository, PolicyRepositoryBootstrapError, PolicyRepositoryResult,
};
use crate::settings::{PermissionSettings, YeonjangSettings, settings_path};

const POLICY_STORAGE_MAX_BYTES: usize = 1024 * 1024;
const POLICY_RECORD_CAPACITY: usize = 1024;
const LEGACY_MIGRATION_CHANGE_ID: &str = "legacy-capture-policy-v1";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PermissionPolicyBootstrapError {
    InvalidStorage(LocalStorageBuildError),
    InvalidRepository(PolicyRepositoryBootstrapError),
    InvalidLegacyPolicy(LegacyPolicyMigrationError),
    InvalidSetup(PolicyStateError),
    MigrationConflict,
    MigrationUnavailable,
}

impl fmt::Display for PermissionPolicyBootstrapError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::InvalidStorage(LocalStorageBuildError::UnsafePath) => {
                "permission_policy_storage_path_invalid"
            }
            Self::InvalidStorage(LocalStorageBuildError::Corrupt) => {
                "permission_policy_storage_corrupt"
            }
            Self::InvalidStorage(LocalStorageBuildError::UnsupportedVersion) => {
                "permission_policy_storage_version_unsupported"
            }
            Self::InvalidStorage(
                LocalStorageBuildError::InvalidLimit
                | LocalStorageBuildError::TooLarge
                | LocalStorageBuildError::Unavailable,
            ) => "permission_policy_storage_unavailable",
            Self::InvalidRepository(PolicyRepositoryBootstrapError::WrongTarget) => {
                "permission_policy_target_mismatch"
            }
            Self::InvalidRepository(PolicyRepositoryBootstrapError::UnsupportedVersion) => {
                "permission_policy_repository_version_unsupported"
            }
            Self::InvalidRepository(
                PolicyRepositoryBootstrapError::InvalidCapacity
                | PolicyRepositoryBootstrapError::Corrupt
                | PolicyRepositoryBootstrapError::InvalidHistory
                | PolicyRepositoryBootstrapError::Saturated
                | PolicyRepositoryBootstrapError::Unavailable,
            ) => "permission_policy_repository_unavailable",
            Self::InvalidLegacyPolicy(_) => "permission_policy_legacy_migration_invalid",
            Self::InvalidSetup(_) => "permission_policy_setup_invalid",
            Self::MigrationConflict => "permission_policy_migration_conflict",
            Self::MigrationUnavailable => "permission_policy_migration_unavailable",
        })
    }
}

impl std::error::Error for PermissionPolicyBootstrapError {}

/// Opens one target-bound repository and performs a missing-only legacy
/// migration. Callers must supply absolute sibling data and lock paths.
pub fn open_permission_policy_repository(
    data_path: PathBuf,
    lock_path: PathBuf,
    target_instance_id: &str,
    legacy: &PermissionSettings,
    review_completed: bool,
) -> Result<Arc<DurablePermissionPolicyRepository>, PermissionPolicyBootstrapError> {
    let storage = Arc::new(
        AtomicLocalStorage::open(data_path, lock_path, POLICY_STORAGE_MAX_BYTES)
            .map_err(PermissionPolicyBootstrapError::InvalidStorage)?,
    );
    let store_was_missing = storage.health() == LocalStorageHealth::Missing;
    let repository = Arc::new(
        DurablePermissionPolicyRepository::bootstrap(
            target_instance_id,
            POLICY_RECORD_CAPACITY,
            storage,
        )
        .map_err(PermissionPolicyBootstrapError::InvalidRepository)?,
    );

    if !store_was_missing {
        return Ok(repository);
    }

    let desired = migrate_legacy_capture_policy(target_instance_id, legacy, review_completed)
        .map_err(PermissionPolicyBootstrapError::InvalidLegacyPolicy)?;
    let camera = desired.entry(PolicyCapability::CameraCapture);
    let screen = desired.entry(PolicyCapability::ScreenCapture);
    if camera.decision() == PolicyDecision::Denied && screen.decision() == PolicyDecision::Denied {
        return Ok(repository);
    }

    let command = CapturePolicySetupCommand::new(
        target_instance_id,
        0,
        camera.decision(),
        camera.resource().clone(),
        screen.decision(),
        screen.resource().clone(),
    )
    .map_err(PermissionPolicyBootstrapError::InvalidSetup)?;
    match LocalCapturePolicySetupUseCase::new(repository.clone())
        .execute(&command, LEGACY_MIGRATION_CHANGE_ID)
    {
        LocalPolicySetupResult::Policy(
            PolicyRepositoryResult::Applied { .. } | PolicyRepositoryResult::Unchanged { .. },
        )
        | LocalPolicySetupResult::Duplicate => Ok(repository),
        LocalPolicySetupResult::Policy(
            PolicyRepositoryResult::RevisionConflict { .. }
            | PolicyRepositoryResult::StorageConflict,
        ) => Err(PermissionPolicyBootstrapError::MigrationConflict),
        LocalPolicySetupResult::Policy(
            PolicyRepositoryResult::Rejected { .. }
            | PolicyRepositoryResult::HistoryNotFound
            | PolicyRepositoryResult::Saturated
            | PolicyRepositoryResult::Unavailable,
        ) => Err(PermissionPolicyBootstrapError::MigrationUnavailable),
    }
}

/// Builds the production paths once from validated startup settings.
pub fn configured_permission_policy_repository(
    settings: &YeonjangSettings,
) -> Result<Arc<DurablePermissionPolicyRepository>, PermissionPolicyBootstrapError> {
    let path = settings_path();
    let parent = path
        .parent()
        .ok_or(PermissionPolicyBootstrapError::InvalidStorage(
            LocalStorageBuildError::UnsafePath,
        ))?;
    configured_permission_policy_repository_at(settings, parent)
}

/// Uses one caller-validated config root for policy data and lock ownership.
///
/// Policy data and its lock remain under this exact absolute root. Existing
/// migration and revision checks are unchanged; no process default path is
/// consulted after the explicit boundary is selected.
pub fn configured_permission_policy_repository_at(
    settings: &YeonjangSettings,
    parent: &std::path::Path,
) -> Result<Arc<DurablePermissionPolicyRepository>, PermissionPolicyBootstrapError> {
    if !parent.is_absolute() {
        return Err(PermissionPolicyBootstrapError::InvalidStorage(
            LocalStorageBuildError::UnsafePath,
        ));
    }
    fs::create_dir_all(parent).map_err(|_| {
        PermissionPolicyBootstrapError::InvalidStorage(LocalStorageBuildError::Unavailable)
    })?;
    open_permission_policy_repository(
        parent.join("permission-policy.json"),
        parent.join("permission-policy.lock"),
        &settings.instance_id,
        &settings.permissions,
        !settings.permission_review_required,
    )
}
