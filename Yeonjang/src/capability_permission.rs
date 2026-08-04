//! Read-only permission projection for capture capabilities.
//!
//! This module deliberately keeps platform availability, persisted local policy,
//! and an observed OS permission in separate fields. It never probes an OS
//! permission and never mutates policy; callers must supply an immutable
//! observation captured by the owning platform adapter.

use crate::automation::AutomationCapabilities;
use crate::method_descriptor::method_descriptor;
use crate::permission_policy::{
    PermissionPolicySnapshot, PolicyCapability, PolicyDecision, PolicyResourceConstraint,
};
use crate::platform_operation::PreflightPermissionState;
use crate::settings::PermissionSettings;

/// Capture capabilities that require both a local policy and platform evidence.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CaptureCapabilityKind {
    Camera,
    Screen,
}

/// Persisted local operator policy, independent from an OS permission decision.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LocalPolicyState {
    Allowed,
    Denied,
}

/// Current OS permission observation, including the absence of an observation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OsPermissionState {
    NotObserved,
    NotRequired,
    Granted,
    NotDetermined,
    Denied,
    Restricted,
}

/// Optional non-prompting observations supplied by platform adapters.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct CapturePermissionObservations {
    pub camera: Option<PreflightPermissionState>,
    pub screen: Option<PreflightPermissionState>,
}

/// OS-neutral executable availability supplied by the composition boundary.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct CaptureCapabilityAvailability {
    pub camera: bool,
    pub screen: bool,
}

/// Immutable read projection with exact method, resource, and setting identity.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CapturePermissionProjection {
    pub kind: CaptureCapabilityKind,
    pub method: &'static str,
    pub resource: &'static str,
    pub setting_name: &'static str,
    pub capability_available: bool,
    pub local_policy: LocalPolicyState,
    pub os_permission: OsPermissionState,
}

/// Canonical projection sourced from the versioned policy snapshot.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CanonicalCapturePermissionProjection {
    pub kind: CaptureCapabilityKind,
    pub method: &'static str,
    pub resource: &'static str,
    pub setting_name: &'static str,
    pub capability_available: bool,
    pub policy_revision: u64,
    pub local_policy: LocalPolicyState,
    pub policy_resource: PolicyResourceConstraint,
    pub os_permission: OsPermissionState,
}

/// Projects camera and screen in a stable order without performing I/O.
pub fn capture_permission_projection(
    capabilities: &AutomationCapabilities,
    permissions: &PermissionSettings,
    observations: CapturePermissionObservations,
) -> [CapturePermissionProjection; 2] {
    [
        project(
            CaptureCapabilityKind::Camera,
            "camera.capture",
            capabilities.camera_management,
            permissions.allow_camera_access,
            observations.camera,
        ),
        project(
            CaptureCapabilityKind::Screen,
            "screen.capture",
            capabilities.screen_capture,
            permissions.allow_screen_capture,
            observations.screen,
        ),
    ]
}

/// Projects the canonical policy read model without probing or writing.
pub fn capture_permission_projection_from_policy(
    capabilities: &AutomationCapabilities,
    policy: &PermissionPolicySnapshot,
    observations: CapturePermissionObservations,
) -> [CanonicalCapturePermissionProjection; 2] {
    capture_permission_projection_from_policy_availability(
        CaptureCapabilityAvailability {
            camera: capabilities.camera_management,
            screen: capabilities.screen_capture,
        },
        policy,
        observations,
    )
}

/// Projects canonical policy from an Application-owned availability value.
///
/// This keeps new read use cases independent from the legacy backend DTO.
pub fn capture_permission_projection_from_policy_availability(
    availability: CaptureCapabilityAvailability,
    policy: &PermissionPolicySnapshot,
    observations: CapturePermissionObservations,
) -> [CanonicalCapturePermissionProjection; 2] {
    [
        project_canonical(
            CaptureCapabilityKind::Camera,
            "camera.capture",
            availability.camera,
            policy,
            PolicyCapability::CameraCapture,
            observations.camera,
        ),
        project_canonical(
            CaptureCapabilityKind::Screen,
            "screen.capture",
            availability.screen,
            policy,
            PolicyCapability::ScreenCapture,
            observations.screen,
        ),
    ]
}

fn project(
    kind: CaptureCapabilityKind,
    method: &'static str,
    capability_available: bool,
    local_policy_allowed: bool,
    os_permission: Option<PreflightPermissionState>,
) -> CapturePermissionProjection {
    let descriptor = method_descriptor(method)
        .expect("capture permission projection methods must have canonical descriptors");
    let setting_name = descriptor
        .permission
        .expect("capture methods must have a local policy setting")
        .as_setting_name();

    CapturePermissionProjection {
        kind,
        method,
        resource: descriptor.resource.as_str(),
        setting_name,
        capability_available,
        local_policy: if local_policy_allowed {
            LocalPolicyState::Allowed
        } else {
            LocalPolicyState::Denied
        },
        os_permission: os_permission.map_or(OsPermissionState::NotObserved, Into::into),
    }
}

fn project_canonical(
    kind: CaptureCapabilityKind,
    method: &'static str,
    capability_available: bool,
    policy: &PermissionPolicySnapshot,
    capability: PolicyCapability,
    os_permission: Option<PreflightPermissionState>,
) -> CanonicalCapturePermissionProjection {
    let descriptor =
        method_descriptor(method).expect("capture methods must have canonical descriptors");
    let entry = policy.entry(capability);
    CanonicalCapturePermissionProjection {
        kind,
        method,
        resource: descriptor.resource.as_str(),
        setting_name: descriptor
            .permission
            .expect("capture methods must have local policy")
            .as_setting_name(),
        capability_available,
        policy_revision: policy.revision(),
        local_policy: if entry.decision() == PolicyDecision::Allowed {
            LocalPolicyState::Allowed
        } else {
            LocalPolicyState::Denied
        },
        policy_resource: entry.resource().clone(),
        os_permission: os_permission.map_or(OsPermissionState::NotObserved, Into::into),
    }
}

impl From<PreflightPermissionState> for OsPermissionState {
    fn from(value: PreflightPermissionState) -> Self {
        match value {
            PreflightPermissionState::NotRequired => Self::NotRequired,
            PreflightPermissionState::Granted => Self::Granted,
            PreflightPermissionState::NotDetermined => Self::NotDetermined,
            PreflightPermissionState::Denied => Self::Denied,
            PreflightPermissionState::Restricted => Self::Restricted,
        }
    }
}
