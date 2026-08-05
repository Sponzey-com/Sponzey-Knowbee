//! Fail-closed compatibility mapping from reviewed legacy capture settings.
//!
//! This pure adapter does not persist, activate, or delete either format. A
//! bootstrap owner may use it only when no canonical policy already exists.

use crate::permission_policy::{
    PermissionPolicySnapshot, PolicyCapability, PolicyDecision, PolicyResourceConstraint,
    PolicyStateError, PolicyTransition, PolicyUpdateCommand, apply_policy_update,
};
use crate::settings::PermissionSettings;

pub fn migrate_legacy_capture_policy(
    target_instance_id: &str,
    legacy: &PermissionSettings,
    review_completed: bool,
) -> Result<PermissionPolicySnapshot, LegacyPolicyMigrationError> {
    let mut snapshot = PermissionPolicySnapshot::new(target_instance_id)
        .map_err(LegacyPolicyMigrationError::InvalidPolicy)?;
    if !review_completed {
        return Ok(snapshot);
    }
    for (capability, allowed) in [
        (PolicyCapability::CameraCapture, legacy.allow_camera_access),
        (PolicyCapability::ScreenCapture, legacy.allow_screen_capture),
    ] {
        if !allowed {
            continue;
        }
        let command = PolicyUpdateCommand::new(
            target_instance_id,
            snapshot.revision(),
            capability,
            PolicyDecision::Allowed,
            PolicyResourceConstraint::Any,
        )
        .map_err(LegacyPolicyMigrationError::InvalidPolicy)?;
        snapshot = match apply_policy_update(&snapshot, &command) {
            PolicyTransition::Applied { snapshot, .. } => snapshot,
            PolicyTransition::Unchanged { .. }
            | PolicyTransition::RevisionConflict { .. }
            | PolicyTransition::Rejected { .. } => {
                return Err(LegacyPolicyMigrationError::TransitionRejected);
            }
        };
    }
    Ok(snapshot)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LegacyPolicyMigrationError {
    InvalidPolicy(PolicyStateError),
    TransitionRejected,
}
