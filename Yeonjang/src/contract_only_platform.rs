//! Typed unavailable adapter for platforms without an executable implementation.

use crate::platform_execution::{
    EffectState, ExecutionFailure, ExecutionFailureReason, ExecutionStage, RecoveryAction,
    RetrySafety,
};
use crate::platform_operation::{BoundPlatformOperation, PlatformPreflightReceipt};
use crate::platform_port::{PlatformCapabilityPort, PlatformEffectReceipt};

/// Platforms represented in the common contract but not executable in this runtime.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContractOnlyPlatform {
    Android,
    Ios,
    Unknown,
}

/// Fail-closed adapter that never fabricates a native effect or artifact.
#[derive(Debug, Clone, Copy)]
pub struct ContractOnlyPlatformAdapter {
    platform: ContractOnlyPlatform,
}

impl ContractOnlyPlatformAdapter {
    pub fn new(platform: ContractOnlyPlatform) -> Self {
        Self { platform }
    }

    pub fn platform(&self) -> ContractOnlyPlatform {
        self.platform
    }

    fn unavailable(
        &self,
        operation: &BoundPlatformOperation,
        stage: ExecutionStage,
        effect_state: EffectState,
        retry_safety: RetrySafety,
    ) -> ExecutionFailure {
        ExecutionFailure::new(
            stage,
            ExecutionFailureReason::CapabilityUnavailable,
            effect_state,
            retry_safety,
            RecoveryAction::SelectSupportedTarget,
            None,
            operation.binding_digest().to_string(),
        )
        .expect("a validated binding digest is a bounded correlation ID")
    }
}

impl PlatformCapabilityPort for ContractOnlyPlatformAdapter {
    fn preflight(
        &self,
        operation: &BoundPlatformOperation,
    ) -> Result<PlatformPreflightReceipt, ExecutionFailure> {
        Err(self.unavailable(
            operation,
            ExecutionStage::OsPreflight,
            EffectState::NotStarted,
            RetrySafety::MaterialChangeRequired,
        ))
    }

    fn execute(
        &self,
        operation: &BoundPlatformOperation,
        _preflight: &PlatformPreflightReceipt,
    ) -> Result<PlatformEffectReceipt, ExecutionFailure> {
        Err(self.unavailable(
            operation,
            ExecutionStage::PlatformDispatch,
            EffectState::ConfirmedNotApplied,
            RetrySafety::NotRetryable,
        ))
    }
}
