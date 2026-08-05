//! Explicit conversion from admitted MQTT v2 data to the common execution operation.

use crate::platform_operation::{
    BoundPlatformOperation, BoundPlatformOperationError, BoundPlatformOperationInput,
    CapabilityCommand, TargetPlatform,
};
use crate::protocol_v2::V2CapabilityCommandData;
use crate::protocol_v2_admission::AdmittedV2Command;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct V2OperationBindingContext {
    pub target_platform: TargetPlatform,
    pub policy_revision: u64,
    pub artifact_lease_ref: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct V2AcceptedResponseIdentity {
    pub correlation_id: String,
    pub causation_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BoundV2Operation {
    operation: BoundPlatformOperation,
    response_identity: V2AcceptedResponseIdentity,
}

impl BoundV2Operation {
    pub fn operation(&self) -> &BoundPlatformOperation {
        &self.operation
    }

    pub(crate) fn response_identity(&self) -> &V2AcceptedResponseIdentity {
        &self.response_identity
    }
}

/// Combines the admitted wire snapshot with explicit runtime-owned binding values.
pub fn bind_admitted_v2_command(
    admitted: AdmittedV2Command<'_>,
    context: V2OperationBindingContext,
) -> Result<BoundV2Operation, BoundPlatformOperationError> {
    let command = admitted.command();
    let capability_command = match command.capability_command_data() {
        V2CapabilityCommandData::CameraCapture {
            device_id,
            capture_timeout_ms,
        } => CapabilityCommand::CameraCapture {
            device_id,
            capture_timeout_ms,
        },
        V2CapabilityCommandData::ScreenCapture { display } => {
            CapabilityCommand::ScreenCapture { display }
        }
    };
    let operation = BoundPlatformOperation::new(BoundPlatformOperationInput {
        request_id: command.request_id().to_string(),
        command_id: command.command_id().to_string(),
        operation_id: command.operation_id().to_string(),
        requester_id: command.requester_id().to_string(),
        target_platform: context.target_platform,
        target_instance_id: command.target_instance_id().to_string(),
        target_session_id: command.target_session_id().to_string(),
        target_fingerprint: command.target_fingerprint().to_string(),
        authorization_ref: command.authorization_id().to_string(),
        policy_revision: context.policy_revision,
        idempotency_key: command.idempotency_key().to_string(),
        deadline_ms: command.expires_at(),
        cancellation_id: command.cancellation_id().to_string(),
        artifact_lease_ref: context.artifact_lease_ref,
        command: capability_command,
    })?;
    Ok(BoundV2Operation {
        operation,
        response_identity: V2AcceptedResponseIdentity {
            correlation_id: command.correlation_id().to_string(),
            causation_id: command.message_id().to_string(),
        },
    })
}
