//! Pure domain state and transitions for local capture policy.
//!
//! Authorization, persistence, MQTT, OS permission observation, and UI updates
//! are intentionally outside this module. A repository use case may commit one
//! accepted transition, but it must not mutate these immutable snapshots.

use std::collections::BTreeMap;
use std::fmt;

pub const PERMISSION_POLICY_SCHEMA_VERSION: u16 = 1;
const MAX_IDENTITY_BYTES: usize = 128;

/// Capabilities controlled by the first canonical local-policy slice.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum PolicyCapability {
    CameraCapture,
    ScreenCapture,
}

/// A local operator policy decision, independent from OS permission.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PolicyDecision {
    Allowed,
    Denied,
}

/// Optional exact native resource restriction for a capability.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PolicyResourceConstraint {
    Any,
    ExactCamera { resource_id: String },
    ExactDisplay { resource_id: String },
}

impl PolicyResourceConstraint {
    pub fn exact_camera(resource_id: impl Into<String>) -> Self {
        Self::ExactCamera {
            resource_id: resource_id.into(),
        }
    }

    pub fn exact_display(resource_id: impl Into<String>) -> Self {
        Self::ExactDisplay {
            resource_id: resource_id.into(),
        }
    }

    fn is_valid_for(&self, capability: PolicyCapability) -> bool {
        match (capability, self) {
            (_, Self::Any) => true,
            (PolicyCapability::CameraCapture, Self::ExactCamera { resource_id })
            | (PolicyCapability::ScreenCapture, Self::ExactDisplay { resource_id }) => {
                is_bounded_non_blank(resource_id)
            }
            _ => false,
        }
    }
}

/// One capability's current local policy and resource restriction.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyEntry {
    decision: PolicyDecision,
    resource: PolicyResourceConstraint,
}

impl PolicyEntry {
    pub fn decision(&self) -> PolicyDecision {
        self.decision
    }

    pub fn resource(&self) -> &PolicyResourceConstraint {
        &self.resource
    }
}

/// Versioned immutable policy state owned by exactly one target instance.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PermissionPolicySnapshot {
    schema_version: u16,
    target_instance_id: String,
    revision: u64,
    entries: BTreeMap<PolicyCapability, PolicyEntry>,
}

impl PermissionPolicySnapshot {
    pub fn new(target_instance_id: impl Into<String>) -> Result<Self, PolicyStateError> {
        let target_instance_id = target_instance_id.into();
        if !is_exact_identity(&target_instance_id) {
            return Err(PolicyStateError::InvalidTarget);
        }

        Ok(Self {
            schema_version: PERMISSION_POLICY_SCHEMA_VERSION,
            target_instance_id,
            revision: 0,
            entries: default_entries(),
        })
    }

    pub fn schema_version(&self) -> u16 {
        self.schema_version
    }

    pub fn target_instance_id(&self) -> &str {
        &self.target_instance_id
    }

    pub fn revision(&self) -> u64 {
        self.revision
    }

    pub fn entry(&self, capability: PolicyCapability) -> &PolicyEntry {
        self.entries
            .get(&capability)
            .expect("every policy snapshot must contain every closed capability")
    }

    pub(crate) fn restore(
        target_instance_id: String,
        revision: u64,
        camera: (PolicyDecision, PolicyResourceConstraint),
        screen: (PolicyDecision, PolicyResourceConstraint),
    ) -> Result<Self, PolicyStateError> {
        if !is_exact_identity(&target_instance_id) {
            return Err(PolicyStateError::InvalidTarget);
        }
        if !camera.1.is_valid_for(PolicyCapability::CameraCapture)
            || !screen.1.is_valid_for(PolicyCapability::ScreenCapture)
        {
            return Err(PolicyStateError::InvalidResourceConstraint);
        }
        Ok(Self {
            schema_version: PERMISSION_POLICY_SCHEMA_VERSION,
            target_instance_id,
            revision,
            entries: BTreeMap::from([
                (
                    PolicyCapability::CameraCapture,
                    PolicyEntry {
                        decision: camera.0,
                        resource: camera.1,
                    },
                ),
                (
                    PolicyCapability::ScreenCapture,
                    PolicyEntry {
                        decision: screen.0,
                        resource: screen.1,
                    },
                ),
            ]),
        })
    }
}

/// Validated desired transition before authorization and persistence.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyUpdateCommand {
    target_instance_id: String,
    expected_revision: u64,
    capability: PolicyCapability,
    decision: PolicyDecision,
    resource: PolicyResourceConstraint,
}

/// One local UI setup command for both capture capabilities.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CapturePolicySetupCommand {
    target_instance_id: String,
    expected_revision: u64,
    camera: PolicyEntry,
    screen: PolicyEntry,
}

impl CapturePolicySetupCommand {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        target_instance_id: impl Into<String>,
        expected_revision: u64,
        camera_decision: PolicyDecision,
        camera_resource: PolicyResourceConstraint,
        screen_decision: PolicyDecision,
        screen_resource: PolicyResourceConstraint,
    ) -> Result<Self, PolicyStateError> {
        let target_instance_id = target_instance_id.into();
        if !is_exact_identity(&target_instance_id) {
            return Err(PolicyStateError::InvalidTarget);
        }
        if !camera_resource.is_valid_for(PolicyCapability::CameraCapture)
            || !screen_resource.is_valid_for(PolicyCapability::ScreenCapture)
        {
            return Err(PolicyStateError::InvalidResourceConstraint);
        }
        Ok(Self {
            target_instance_id,
            expected_revision,
            camera: PolicyEntry {
                decision: camera_decision,
                resource: camera_resource,
            },
            screen: PolicyEntry {
                decision: screen_decision,
                resource: screen_resource,
            },
        })
    }

    pub fn target_instance_id(&self) -> &str {
        &self.target_instance_id
    }

    pub fn expected_revision(&self) -> u64 {
        self.expected_revision
    }
}

impl PolicyUpdateCommand {
    pub fn new(
        target_instance_id: impl Into<String>,
        expected_revision: u64,
        capability: PolicyCapability,
        decision: PolicyDecision,
        resource: PolicyResourceConstraint,
    ) -> Result<Self, PolicyStateError> {
        let target_instance_id = target_instance_id.into();
        if !is_exact_identity(&target_instance_id) {
            return Err(PolicyStateError::InvalidTarget);
        }
        if !resource.is_valid_for(capability) {
            return Err(PolicyStateError::InvalidResourceConstraint);
        }
        Ok(Self {
            target_instance_id,
            expected_revision,
            capability,
            decision,
            resource,
        })
    }

    pub fn target_instance_id(&self) -> &str {
        &self.target_instance_id
    }

    pub fn expected_revision(&self) -> u64 {
        self.expected_revision
    }

    pub fn capability(&self) -> PolicyCapability {
        self.capability
    }

    pub fn decision(&self) -> PolicyDecision {
        self.decision
    }

    pub fn resource(&self) -> &PolicyResourceConstraint {
        &self.resource
    }
}

/// Reasons a structurally valid policy transition is not admissible.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PolicyRejectReason {
    WrongTarget,
    NotHistorical,
    RevisionOverflow,
    InvalidState,
}

/// Exhaustive result of a pure policy update or rollback.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PolicyTransition {
    Applied {
        snapshot: PermissionPolicySnapshot,
        previous_revision: u64,
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
}

pub fn apply_policy_update(
    current: &PermissionPolicySnapshot,
    command: &PolicyUpdateCommand,
) -> PolicyTransition {
    if current.target_instance_id != command.target_instance_id {
        return PolicyTransition::Rejected {
            reason: PolicyRejectReason::WrongTarget,
        };
    }
    if current.revision != command.expected_revision {
        return PolicyTransition::RevisionConflict {
            expected_revision: command.expected_revision,
            current_revision: current.revision,
        };
    }
    if current.schema_version != PERMISSION_POLICY_SCHEMA_VERSION
        || !command.resource.is_valid_for(command.capability)
    {
        return PolicyTransition::Rejected {
            reason: PolicyRejectReason::InvalidState,
        };
    }

    let existing = current.entry(command.capability);
    if existing.decision == command.decision && existing.resource == command.resource {
        return PolicyTransition::Unchanged {
            revision: current.revision,
        };
    }
    let Some(next_revision) = current.revision.checked_add(1) else {
        return PolicyTransition::Rejected {
            reason: PolicyRejectReason::RevisionOverflow,
        };
    };

    let mut next = current.clone();
    next.revision = next_revision;
    next.entries.insert(
        command.capability,
        PolicyEntry {
            decision: command.decision,
            resource: command.resource.clone(),
        },
    );
    PolicyTransition::Applied {
        snapshot: next,
        previous_revision: current.revision,
    }
}

pub fn apply_capture_policy_setup(
    current: &PermissionPolicySnapshot,
    command: &CapturePolicySetupCommand,
) -> PolicyTransition {
    if current.target_instance_id != command.target_instance_id {
        return PolicyTransition::Rejected {
            reason: PolicyRejectReason::WrongTarget,
        };
    }
    if current.revision != command.expected_revision {
        return PolicyTransition::RevisionConflict {
            expected_revision: command.expected_revision,
            current_revision: current.revision,
        };
    }
    if current.schema_version != PERMISSION_POLICY_SCHEMA_VERSION {
        return PolicyTransition::Rejected {
            reason: PolicyRejectReason::InvalidState,
        };
    }
    if current.entry(PolicyCapability::CameraCapture) == &command.camera
        && current.entry(PolicyCapability::ScreenCapture) == &command.screen
    {
        return PolicyTransition::Unchanged {
            revision: current.revision,
        };
    }
    let Some(revision) = current.revision.checked_add(1) else {
        return PolicyTransition::Rejected {
            reason: PolicyRejectReason::RevisionOverflow,
        };
    };
    let mut snapshot = current.clone();
    snapshot.revision = revision;
    snapshot
        .entries
        .insert(PolicyCapability::CameraCapture, command.camera.clone());
    snapshot
        .entries
        .insert(PolicyCapability::ScreenCapture, command.screen.clone());
    PolicyTransition::Applied {
        snapshot,
        previous_revision: current.revision,
    }
}

/// Restores historical entries while preserving monotonic current revision.
pub fn rollback_policy(
    current: &PermissionPolicySnapshot,
    historical: &PermissionPolicySnapshot,
    expected_current_revision: u64,
) -> PolicyTransition {
    if current.target_instance_id != historical.target_instance_id {
        return PolicyTransition::Rejected {
            reason: PolicyRejectReason::WrongTarget,
        };
    }
    if current.revision != expected_current_revision {
        return PolicyTransition::RevisionConflict {
            expected_revision: expected_current_revision,
            current_revision: current.revision,
        };
    }
    if historical.revision >= current.revision {
        return PolicyTransition::Rejected {
            reason: PolicyRejectReason::NotHistorical,
        };
    }
    if current.schema_version != PERMISSION_POLICY_SCHEMA_VERSION
        || historical.schema_version != PERMISSION_POLICY_SCHEMA_VERSION
    {
        return PolicyTransition::Rejected {
            reason: PolicyRejectReason::InvalidState,
        };
    }
    let Some(next_revision) = current.revision.checked_add(1) else {
        return PolicyTransition::Rejected {
            reason: PolicyRejectReason::RevisionOverflow,
        };
    };

    let mut restored = historical.clone();
    restored.revision = next_revision;
    PolicyTransition::Applied {
        snapshot: restored,
        previous_revision: current.revision,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PolicyStateError {
    InvalidTarget,
    InvalidResourceConstraint,
}

impl fmt::Display for PolicyStateError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::InvalidTarget => "invalid policy target",
            Self::InvalidResourceConstraint => "invalid policy resource constraint",
        })
    }
}

impl std::error::Error for PolicyStateError {}

fn default_entries() -> BTreeMap<PolicyCapability, PolicyEntry> {
    [
        PolicyCapability::CameraCapture,
        PolicyCapability::ScreenCapture,
    ]
    .into_iter()
    .map(|capability| {
        (
            capability,
            PolicyEntry {
                decision: PolicyDecision::Denied,
                resource: PolicyResourceConstraint::Any,
            },
        )
    })
    .collect()
}

fn is_exact_identity(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_IDENTITY_BYTES
        && value.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'-' | b'_')
        })
}

fn is_bounded_non_blank(value: &str) -> bool {
    !value.trim().is_empty()
        && value.len() <= MAX_IDENTITY_BYTES
        && !value.chars().any(char::is_control)
}
