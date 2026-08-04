//! Pure capture capability projection for the production MQTT v2 entry.
//!
//! Only methods implemented by the strict v2 command schema are represented.
//! Platform availability, local policy and implementation status remain
//! separate; local policy denial does not pretend that an adapter is absent.

use serde::{Deserialize, Serialize};

use crate::method_descriptor::method_descriptor;
use crate::permission_policy::{
    PermissionPolicySnapshot, PolicyCapability, PolicyDecision, PolicyResourceConstraint,
};
use crate::platform_operation::TargetPlatform;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct V2PlatformCapabilitySnapshot {
    platform: TargetPlatform,
    camera_available: bool,
    screen_available: bool,
}

impl V2PlatformCapabilitySnapshot {
    pub fn new(platform: TargetPlatform, camera_available: bool, screen_available: bool) -> Self {
        let contract_only = matches!(platform, TargetPlatform::Android | TargetPlatform::Ios);
        Self {
            platform,
            camera_available: camera_available && !contract_only,
            screen_available: screen_available && !contract_only,
        }
    }

    pub fn platform(&self) -> TargetPlatform {
        self.platform
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum V2ImplementationStatus {
    Executable,
    Unavailable,
    ContractOnly,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum V2PolicyResourceProjection {
    Any,
    ExactCamera,
    ExactDisplay,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct V2CapabilityRow {
    pub method: String,
    pub resource: String,
    pub implementation_status: V2ImplementationStatus,
    pub platform_available: bool,
    pub local_policy: String,
    pub policy_resource: V2PolicyResourceProjection,
    pub authorization_scope: String,
    pub cancellable: bool,
    pub post_check_required: bool,
    pub artifact_delivery: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub known_limitation: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct V2CapabilityProjection {
    pub target_platform: TargetPlatform,
    pub policy_revision: u64,
    pub advertised_methods: Vec<String>,
    pub capabilities: Vec<V2CapabilityRow>,
}

pub fn project_v2_capture_capabilities(
    platform: &V2PlatformCapabilitySnapshot,
    policy: &PermissionPolicySnapshot,
) -> Result<V2CapabilityProjection, V2CapabilityProjectionError> {
    let contract_only = matches!(
        platform.platform,
        TargetPlatform::Android | TargetPlatform::Ios
    );
    let inputs = [
        (
            "camera.capture",
            PolicyCapability::CameraCapture,
            platform.camera_available,
        ),
        (
            "screen.capture",
            PolicyCapability::ScreenCapture,
            platform.screen_available,
        ),
    ];
    let mut rows = Vec::with_capacity(inputs.len());
    let mut advertised_methods = Vec::with_capacity(inputs.len());
    for (method, capability, available) in inputs {
        let descriptor =
            method_descriptor(method).ok_or(V2CapabilityProjectionError::DescriptorMissing)?;
        if !descriptor.executor_available
            || !descriptor.requires_side_effect_binding()
            || !descriptor.post_check_required
        {
            return Err(V2CapabilityProjectionError::DescriptorMismatch);
        }
        let implementation_status = if contract_only {
            V2ImplementationStatus::ContractOnly
        } else if available {
            V2ImplementationStatus::Executable
        } else {
            V2ImplementationStatus::Unavailable
        };
        if implementation_status == V2ImplementationStatus::Executable {
            advertised_methods.push(method.to_string());
        }
        let entry = policy.entry(capability);
        rows.push(V2CapabilityRow {
            method: method.to_string(),
            resource: descriptor.resource.as_str().to_string(),
            implementation_status,
            platform_available: available,
            local_policy: match entry.decision() {
                PolicyDecision::Allowed => "allowed",
                PolicyDecision::Denied => "denied",
            }
            .to_string(),
            policy_resource: match entry.resource() {
                PolicyResourceConstraint::Any => V2PolicyResourceProjection::Any,
                PolicyResourceConstraint::ExactCamera { .. } => {
                    V2PolicyResourceProjection::ExactCamera
                }
                PolicyResourceConstraint::ExactDisplay { .. } => {
                    V2PolicyResourceProjection::ExactDisplay
                }
            },
            authorization_scope: "effect.execute".to_string(),
            cancellable: descriptor.cancellable,
            post_check_required: descriptor.post_check_required,
            artifact_delivery: "mqtt.fetch_ack".to_string(),
            known_limitation: match implementation_status {
                V2ImplementationStatus::Executable => None,
                V2ImplementationStatus::Unavailable => {
                    Some("platform_capability_unavailable".to_string())
                }
                V2ImplementationStatus::ContractOnly => {
                    Some("contract_only_no_runtime_adapter".to_string())
                }
            },
        });
    }
    Ok(V2CapabilityProjection {
        target_platform: platform.platform,
        policy_revision: policy.revision(),
        advertised_methods,
        capabilities: rows,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2CapabilityProjectionError {
    DescriptorMissing,
    DescriptorMismatch,
}
