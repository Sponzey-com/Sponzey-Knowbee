//! Compatibility mapping from existing typed backend errors to the common contract.
//!
//! This is an outer boundary adapter. Domain and Application code consume only
//! the resulting [`ExecutionFailure`], never `anyhow` or native error text.

use crate::artifact_sink::CaptureArtifactError;
use crate::automation::{
    CameraCaptureFailure, CameraCaptureProcessError, ScreenCaptureFailure,
    ScreenCaptureProcessError,
};
use crate::platform_execution::{
    EffectState, ExecutionFailure, ExecutionFailureReason, ExecutionStage, RecoveryAction,
    RetrySafety,
};
use crate::platform_operation::BoundPlatformOperation;

/// Owning stage and effect knowledge established before mapping a native error.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NativeFailureContext {
    stage: ExecutionStage,
    effect_state: EffectState,
}

impl NativeFailureContext {
    pub fn new(stage: ExecutionStage, effect_state: EffectState) -> Self {
        Self {
            stage,
            effect_state,
        }
    }
}

/// Maps all currently typed capture errors and redacts genuinely unknown errors.
pub fn map_legacy_platform_error(
    operation: &BoundPlatformOperation,
    context: NativeFailureContext,
    error: &anyhow::Error,
) -> ExecutionFailure {
    if let Some(camera) = error.downcast_ref::<CameraCaptureProcessError>() {
        return map_camera_failure(operation, context, camera.failure());
    }
    if let Some(screen) = error.downcast_ref::<ScreenCaptureProcessError>() {
        return map_screen_failure(operation, context, screen.failure());
    }
    if let Some(artifact) = error.downcast_ref::<CaptureArtifactError>() {
        return map_artifact_failure(operation, context, *artifact);
    }
    let (retry, recovery) = disposition_for_effect(
        context.effect_state,
        RetrySafety::MaterialChangeRequired,
        RecoveryAction::None,
    );
    known_failure(
        operation,
        context.stage,
        ExecutionFailureReason::InternalUnclassified,
        context.effect_state,
        retry,
        recovery,
    )
}

fn map_screen_failure(
    operation: &BoundPlatformOperation,
    context: NativeFailureContext,
    failure: ScreenCaptureFailure,
) -> ExecutionFailure {
    match failure {
        ScreenCaptureFailure::DisplaySelectionUnsupported => known_failure(
            operation,
            ExecutionStage::IngressValidation,
            ExecutionFailureReason::InvalidRequest,
            EffectState::NotStarted,
            RetrySafety::MaterialChangeRequired,
            RecoveryAction::CorrectRequest,
        ),
        ScreenCaptureFailure::OutputPathUnsupported => known_failure(
            operation,
            ExecutionStage::OsPreflight,
            ExecutionFailureReason::ArtifactCommitFailed,
            EffectState::NotStarted,
            RetrySafety::MaterialChangeRequired,
            RecoveryAction::None,
        ),
        ScreenCaptureFailure::PermissionNotGranted => {
            permission_failure(operation, ExecutionFailureReason::PermissionNotGranted)
        }
        ScreenCaptureFailure::HelperSpawnFailed => helper_failure(
            operation,
            context,
            ExecutionFailureReason::HelperSpawnFailed,
        ),
        ScreenCaptureFailure::HelperExited => {
            helper_failure(operation, context, ExecutionFailureReason::HelperExited)
        }
        ScreenCaptureFailure::HelperProtocolInvalid => helper_failure(
            operation,
            context,
            ExecutionFailureReason::HelperProtocolInvalid,
        ),
    }
}

fn helper_failure(
    operation: &BoundPlatformOperation,
    context: NativeFailureContext,
    reason: ExecutionFailureReason,
) -> ExecutionFailure {
    let (retry, recovery) = disposition_for_effect(
        context.effect_state,
        RetrySafety::MaterialChangeRequired,
        RecoveryAction::None,
    );
    known_failure(
        operation,
        ExecutionStage::HelperExecution,
        reason,
        context.effect_state,
        retry,
        recovery,
    )
}

fn map_camera_failure(
    operation: &BoundPlatformOperation,
    context: NativeFailureContext,
    failure: CameraCaptureFailure,
) -> ExecutionFailure {
    match failure {
        CameraCaptureFailure::PermissionDenied => {
            permission_failure(operation, ExecutionFailureReason::PermissionDenied)
        }
        CameraCaptureFailure::PermissionRestricted => {
            permission_failure(operation, ExecutionFailureReason::PermissionRestricted)
        }
        CameraCaptureFailure::HelperSpawnFailed => helper_failure(
            operation,
            context,
            ExecutionFailureReason::HelperSpawnFailed,
        ),
        CameraCaptureFailure::HelperExited => {
            helper_failure(operation, context, ExecutionFailureReason::HelperExited)
        }
        CameraCaptureFailure::HelperProtocolInvalid => helper_failure(
            operation,
            context,
            ExecutionFailureReason::HelperProtocolInvalid,
        ),
        CameraCaptureFailure::OutputPathUnsupported => known_failure(
            operation,
            ExecutionStage::OsPreflight,
            ExecutionFailureReason::ArtifactCommitFailed,
            EffectState::NotStarted,
            RetrySafety::MaterialChangeRequired,
            RecoveryAction::None,
        ),
        CameraCaptureFailure::HelperTimeout => {
            let (retry, recovery) = disposition_for_effect(
                context.effect_state,
                RetrySafety::MaterialChangeRequired,
                RecoveryAction::None,
            );
            known_failure(
                operation,
                ExecutionStage::HelperExecution,
                ExecutionFailureReason::HelperTimedOut,
                context.effect_state,
                retry,
                recovery,
            )
        }
        CameraCaptureFailure::Cancelled => {
            let (retry, recovery) = disposition_for_effect(
                context.effect_state,
                RetrySafety::NotRetryable,
                RecoveryAction::None,
            );
            known_failure(
                operation,
                ExecutionStage::HelperExecution,
                ExecutionFailureReason::Cancelled,
                context.effect_state,
                retry,
                recovery,
            )
        }
    }
}

fn map_artifact_failure(
    operation: &BoundPlatformOperation,
    context: NativeFailureContext,
    failure: CaptureArtifactError,
) -> ExecutionFailure {
    match failure {
        CaptureArtifactError::InvalidOperation | CaptureArtifactError::CallerPathNotAllowed => {
            known_failure(
                operation,
                ExecutionStage::IngressValidation,
                ExecutionFailureReason::InvalidRequest,
                EffectState::NotStarted,
                RetrySafety::MaterialChangeRequired,
                RecoveryAction::CorrectRequest,
            )
        }
        CaptureArtifactError::LeaseConflict => known_failure(
            operation,
            ExecutionStage::ResourceAdmission,
            ExecutionFailureReason::ResourceBusy,
            EffectState::NotStarted,
            RetrySafety::LocalActionRequired,
            RecoveryAction::ReleaseResource,
        ),
        CaptureArtifactError::InvalidRoot => known_failure(
            operation,
            ExecutionStage::ArtifactCommit,
            ExecutionFailureReason::ArtifactCommitFailed,
            EffectState::NotStarted,
            RetrySafety::LocalActionRequired,
            RecoveryAction::UpdateLocalPolicy,
        ),
        CaptureArtifactError::StorageUnavailable => artifact_context_failure(
            operation,
            context,
            ExecutionFailureReason::ArtifactCommitFailed,
            RecoveryAction::FetchArtifactAgain,
        ),
        CaptureArtifactError::InvalidReference => artifact_context_failure(
            operation,
            context,
            ExecutionFailureReason::ArtifactInvalid,
            RecoveryAction::FetchArtifactAgain,
        ),
        CaptureArtifactError::ArtifactMissing => artifact_context_failure(
            operation,
            context,
            ExecutionFailureReason::ArtifactMissing,
            RecoveryAction::FetchArtifactAgain,
        ),
        CaptureArtifactError::ArtifactInvalid
        | CaptureArtifactError::ArtifactWrongFormat
        | CaptureArtifactError::ArtifactDigestMismatch => artifact_context_failure(
            operation,
            context,
            ExecutionFailureReason::ArtifactInvalid,
            RecoveryAction::FetchArtifactAgain,
        ),
    }
}

fn artifact_context_failure(
    operation: &BoundPlatformOperation,
    context: NativeFailureContext,
    reason: ExecutionFailureReason,
    recovery: RecoveryAction,
) -> ExecutionFailure {
    let (retry, recovery) = disposition_for_effect(
        context.effect_state,
        RetrySafety::LocalActionRequired,
        recovery,
    );
    known_failure(
        operation,
        ExecutionStage::ArtifactCommit,
        reason,
        context.effect_state,
        retry,
        recovery,
    )
}

fn permission_failure(
    operation: &BoundPlatformOperation,
    reason: ExecutionFailureReason,
) -> ExecutionFailure {
    known_failure(
        operation,
        ExecutionStage::OsPreflight,
        reason,
        EffectState::NotStarted,
        RetrySafety::LocalActionRequired,
        RecoveryAction::CompleteLocalOsSetup,
    )
}

fn disposition_for_effect(
    effect_state: EffectState,
    known_retry: RetrySafety,
    known_recovery: RecoveryAction,
) -> (RetrySafety, RecoveryAction) {
    if effect_state == EffectState::Unknown {
        (
            RetrySafety::ManualVerificationRequired,
            RecoveryAction::ManualEffectVerification,
        )
    } else {
        (known_retry, known_recovery)
    }
}

fn known_failure(
    operation: &BoundPlatformOperation,
    stage: ExecutionStage,
    reason: ExecutionFailureReason,
    effect_state: EffectState,
    retry_safety: RetrySafety,
    recovery_action: RecoveryAction,
) -> ExecutionFailure {
    ExecutionFailure::new(
        stage,
        reason,
        effect_state,
        retry_safety,
        recovery_action,
        None,
        operation.binding_digest().to_string(),
    )
    .expect("a validated binding digest satisfies the failure correlation contract")
}
