//! Direct MQTT v2 command-to-terminal Application path without Gateway dependencies.

use std::sync::Arc;

use crate::artifact_registration::{
    ArtifactDeliveryDescriptor, ArtifactRegistrationReject, ArtifactRegistrationResult,
    ArtifactRegistrationUseCase,
};
use crate::authorization::AuthorizationReplayGuard;
use crate::cancellation::{ActiveCommandRegistration, ActiveCommandRegistry, CommandTargetBinding};
use crate::execute_capability::{ExecuteCapabilityResult, ExecuteCapabilityUseCase};
use crate::mqtt_v2_topics::MqttV2TopicSet;
use crate::permission_policy::{
    PermissionPolicySnapshot, PolicyCapability, PolicyDecision, PolicyResourceConstraint,
};
use crate::platform_execution::{
    EffectState, ExecutionFailure, ExecutionFailureReason, ExecutionStage, RecoveryAction,
    RetrySafety,
};
use crate::policy_repository::{PermissionPolicyReader, PolicySnapshotRead};
use crate::protocol_v2::{
    V2CapabilityCommandData, V2CommandEnvelope, V2CommandMethod, V2CommandSignatureVerifier,
    parse_v2_command,
};
use crate::protocol_v2_admission::V2CommandAdmission;
use crate::protocol_v2_operation::{
    BoundV2Operation, V2OperationBindingContext, bind_admitted_v2_command,
};
use crate::protocol_v2_rejection::{map_v2_admission_rejection, map_v2_parse_rejection};
use crate::protocol_v2_terminal::V2TerminalResponseContent;
use crate::request_lifecycle::{
    RequestEvent, TerminalOutcome as LifecycleTerminalOutcome, TransitionOutcome,
};
use crate::stage_timing::{RuntimeStage, StageTimingRecorder, sha256_correlation};
use crate::terminal_receipt::{DeliveryOutcome, ExecutionOutcome, TerminalReceipt};
use crate::v2_terminal_repository::{
    V2TerminalClaim, V2TerminalComplete, V2TerminalLookup, V2TerminalRepository, V2TerminalScope,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MqttV2HandlerResult {
    Terminal(Box<V2TerminalResponseContent>),
    Rejected(ExecutionFailure),
    InternalContractFailure(ExecutionFailure),
}

pub struct MqttV2CommandHandler {
    topics: MqttV2TopicSet,
    signature_verifier: Arc<dyn V2CommandSignatureVerifier>,
    replay_guard: Arc<dyn AuthorizationReplayGuard>,
    terminal_repository: Arc<dyn V2TerminalRepository>,
    active_commands: Arc<ActiveCommandRegistry>,
    policy: Arc<dyn PermissionPolicyReader>,
    execute_capability: ExecuteCapabilityUseCase,
    artifact_registration: Option<Arc<ArtifactRegistrationUseCase>>,
    stage_timing: Option<StageTimingRecorder>,
}

fn policy_allows(policy: &PermissionPolicySnapshot, command: &V2CommandEnvelope) -> bool {
    let capability = match command.method() {
        V2CommandMethod::CameraCapture => PolicyCapability::CameraCapture,
        V2CommandMethod::ScreenCapture => PolicyCapability::ScreenCapture,
    };
    let entry = policy.entry(capability);
    if entry.decision() != PolicyDecision::Allowed {
        return false;
    }
    match (entry.resource(), command.capability_command_data()) {
        (PolicyResourceConstraint::Any, _) => true,
        (
            PolicyResourceConstraint::ExactCamera { resource_id },
            V2CapabilityCommandData::CameraCapture {
                device_id: Some(device_id),
                ..
            },
        ) => resource_id == &device_id,
        (
            PolicyResourceConstraint::ExactDisplay { resource_id },
            V2CapabilityCommandData::ScreenCapture {
                display: Some(display),
            },
        ) => resource_id == &display.to_string(),
        _ => false,
    }
}

fn local_policy_failure(
    reason: ExecutionFailureReason,
    recovery: RecoveryAction,
    correlation_id: String,
) -> ExecutionFailure {
    ExecutionFailure::new(
        ExecutionStage::LocalPolicy,
        reason,
        EffectState::NotStarted,
        if reason == ExecutionFailureReason::LocalPolicyDenied {
            RetrySafety::LocalActionRequired
        } else {
            RetrySafety::SafeRedeliverySameIdempotency
        },
        recovery,
        None,
        correlation_id,
    )
    .expect("local policy failure contract")
}

impl MqttV2CommandHandler {
    pub fn new(
        topics: MqttV2TopicSet,
        signature_verifier: Arc<dyn V2CommandSignatureVerifier>,
        replay_guard: Arc<dyn AuthorizationReplayGuard>,
        terminal_repository: Arc<dyn V2TerminalRepository>,
        active_commands: Arc<ActiveCommandRegistry>,
        policy: Arc<dyn PermissionPolicyReader>,
        execute_capability: ExecuteCapabilityUseCase,
    ) -> Self {
        Self {
            topics,
            signature_verifier,
            replay_guard,
            terminal_repository,
            active_commands,
            policy,
            execute_capability,
            artifact_registration: None,
            stage_timing: None,
        }
    }

    pub fn with_artifact_registration(
        mut self,
        artifact_registration: Arc<ArtifactRegistrationUseCase>,
    ) -> Self {
        self.artifact_registration = Some(artifact_registration);
        self
    }

    /// Adds path-free stage observation to authorization and the common
    /// platform use case without granting the observer outcome authority.
    pub fn with_stage_timing(mut self, recorder: StageTimingRecorder) -> Self {
        self.execute_capability = self.execute_capability.with_stage_timing(recorder.clone());
        self.stage_timing = Some(recorder);
        self
    }

    pub fn handle(
        &self,
        topic: &str,
        bytes: &[u8],
        now_ms: i64,
        binding_context: V2OperationBindingContext,
    ) -> MqttV2HandlerResult {
        let ingress_correlation = ingress_correlation(bytes);
        let authorization_timing = self.stage_timing.as_ref().and_then(|recorder| {
            recorder
                .start(RuntimeStage::Authorization, &ingress_correlation)
                .ok()
        });
        let authorized =
            self.authorize_and_bind(topic, bytes, now_ms, binding_context, &ingress_correlation);
        if let Some(timing) = authorization_timing {
            let _ = timing.complete();
        }
        let AuthorizedCommand {
            bound,
            terminal_scope,
            cancel_token,
        } = match authorized {
            Ok(authorized) => authorized,
            Err(result) => return result,
        };
        let restart_recovery = match restart_recovery_terminal(&bound, &terminal_scope) {
            Some(content) => content,
            None => {
                return MqttV2HandlerResult::InternalContractFailure(terminal_contract_failure(
                    bound.operation(),
                ));
            }
        };
        match self
            .terminal_repository
            .prepare(&terminal_scope, restart_recovery)
        {
            V2TerminalClaim::Claimed => {}
            V2TerminalClaim::InProgress => {
                return MqttV2HandlerResult::Rejected(idempotency_failure(
                    &ingress_correlation,
                    ExecutionFailureReason::IdempotencyInProgress,
                    RetrySafety::SafeRedeliverySameIdempotency,
                    RecoveryAction::RetryAdmission,
                ));
            }
            V2TerminalClaim::Completed(content) => {
                return MqttV2HandlerResult::Terminal(content);
            }
            V2TerminalClaim::ScopeConflict => {
                return MqttV2HandlerResult::Rejected(idempotency_failure(
                    &ingress_correlation,
                    ExecutionFailureReason::IdempotencyScopeConflict,
                    RetrySafety::NotRetryable,
                    RecoveryAction::CorrectRequest,
                ));
            }
            V2TerminalClaim::Saturated | V2TerminalClaim::Unavailable => {
                return MqttV2HandlerResult::Rejected(idempotency_failure(
                    &ingress_correlation,
                    ExecutionFailureReason::TerminalRepositoryUnavailable,
                    RetrySafety::SafeRedeliverySameIdempotency,
                    RecoveryAction::RetryAdmission,
                ));
            }
        }
        let operation = bound.operation();
        let Some(target) = CommandTargetBinding::new(
            operation.request_id(),
            operation.command_id(),
            operation.operation_id(),
            operation.target_session_id(),
            operation.target_fingerprint(),
            operation.idempotency_key(),
        ) else {
            return self.complete_terminal(
                &terminal_scope,
                &bound,
                ExecutionOutcome::Blocked,
                Some(pre_effect_binding_failure(
                    operation.binding_digest().to_string(),
                )),
                None,
            );
        };
        let active = match self
            .active_commands
            .register_running_bound_with_cancellation_id(
                target,
                operation.cancellation_id(),
                &cancel_token,
            ) {
            ActiveCommandRegistration::Registered(handle) => handle,
            ActiveCommandRegistration::AlreadyActive => {
                return self.complete_terminal(
                    &terminal_scope,
                    &bound,
                    ExecutionOutcome::Blocked,
                    Some(active_registration_failure(operation)),
                    None,
                );
            }
            ActiveCommandRegistration::Unbound => {
                return self.complete_terminal(
                    &terminal_scope,
                    &bound,
                    ExecutionOutcome::Blocked,
                    Some(pre_effect_binding_failure(
                        operation.binding_digest().to_string(),
                    )),
                    None,
                );
            }
        };
        let (execution_outcome, failure, artifact) =
            match self.execute_capability.execute(operation) {
                ExecuteCapabilityResult::Succeeded(effect) => {
                    match self.register_artifact(operation, &effect) {
                        ArtifactHandoff::NotApplicable => (ExecutionOutcome::Succeeded, None, None),
                        ArtifactHandoff::Registered(artifact) => {
                            (ExecutionOutcome::Succeeded, None, Some(artifact))
                        }
                        ArtifactHandoff::Failed(failure) => {
                            (ExecutionOutcome::Failed, Some(failure), None)
                        }
                    }
                }
                ExecuteCapabilityResult::Failed(failure) => {
                    let outcome = execution_outcome(&failure);
                    (outcome, Some(failure), None)
                }
            };
        let lifecycle_outcome = lifecycle_outcome(execution_outcome);
        let lifecycle_applied = matches!(
            active.transition(RequestEvent::Complete(lifecycle_outcome)),
            TransitionOutcome::Applied(_)
        );
        let result = if lifecycle_applied {
            self.complete_terminal(
                &terminal_scope,
                &bound,
                execution_outcome,
                failure,
                artifact,
            )
        } else {
            self.complete_terminal(
                &terminal_scope,
                &bound,
                ExecutionOutcome::EffectUnknown,
                Some(terminal_contract_failure(operation)),
                None,
            )
        };
        self.active_commands
            .finalize_and_remove(Some(operation.command_id()));
        result
    }

    fn authorize_and_bind(
        &self,
        topic: &str,
        bytes: &[u8],
        now_ms: i64,
        mut binding_context: V2OperationBindingContext,
        ingress_correlation: &str,
    ) -> Result<AuthorizedCommand, MqttV2HandlerResult> {
        let command = match parse_v2_command(topic, bytes, now_ms, &self.topics) {
            Ok(command) => command,
            Err(error) => {
                return Err(MqttV2HandlerResult::Rejected(
                    map_v2_parse_rejection(error, ingress_correlation.to_string())
                        .expect("a SHA-256 ingress correlation is contract-valid"),
                ));
            }
        };
        let terminal_scope = V2TerminalScope::for_command(&command);
        let cancel_token = command.cancel_token().to_string();
        let admitted = match V2CommandAdmission::new(
            self.signature_verifier.as_ref(),
            self.replay_guard.as_ref(),
        )
        .admit(&command, now_ms)
        {
            Ok(admitted) => admitted,
            Err(error) => {
                if matches!(
                    error,
                    crate::protocol_v2_admission::V2CommandAdmissionError::Replayed
                ) {
                    return Err(self.replay_or_reject(
                        &terminal_scope,
                        error,
                        ingress_correlation.to_string(),
                    ));
                }
                return Err(MqttV2HandlerResult::Rejected(
                    map_v2_admission_rejection(error, ingress_correlation.to_string())
                        .expect("a SHA-256 ingress correlation is contract-valid"),
                ));
            }
        };
        let policy = match self.policy.snapshot() {
            PolicySnapshotRead::Snapshot(policy) => policy,
            PolicySnapshotRead::Unavailable => {
                return Err(MqttV2HandlerResult::Rejected(local_policy_failure(
                    ExecutionFailureReason::LocalPolicyUnavailable,
                    RecoveryAction::RetryAdmission,
                    ingress_correlation.to_string(),
                )));
            }
        };
        if policy.target_instance_id() != command.target_instance_id() {
            return Err(MqttV2HandlerResult::Rejected(local_policy_failure(
                ExecutionFailureReason::LocalPolicyUnavailable,
                RecoveryAction::SelectSupportedTarget,
                ingress_correlation.to_string(),
            )));
        }
        if !policy_allows(&policy, &command) {
            return Err(MqttV2HandlerResult::Rejected(local_policy_failure(
                ExecutionFailureReason::LocalPolicyDenied,
                RecoveryAction::UpdateLocalPolicy,
                ingress_correlation.to_string(),
            )));
        }
        // The compatibility field is not authoritative. The snapshot reader is
        // the sole source of the revision bound to this operation.
        binding_context.policy_revision = policy.revision();
        let bound = match bind_admitted_v2_command(admitted, binding_context) {
            Ok(bound) => bound,
            Err(_) => {
                return Err(MqttV2HandlerResult::Rejected(pre_effect_binding_failure(
                    ingress_correlation.to_string(),
                )));
            }
        };
        Ok(AuthorizedCommand {
            bound,
            terminal_scope,
            cancel_token,
        })
    }

    fn complete_terminal(
        &self,
        terminal_scope: &V2TerminalScope,
        bound: &crate::protocol_v2_operation::BoundV2Operation,
        execution_outcome: ExecutionOutcome,
        failure: Option<ExecutionFailure>,
        artifact: Option<ArtifactDeliveryDescriptor>,
    ) -> MqttV2HandlerResult {
        let operation = bound.operation();
        let terminal = match TerminalReceipt::new(
            operation,
            execution_outcome,
            DeliveryOutcome::NotStarted,
            1,
            failure,
        ) {
            Ok(terminal) => terminal,
            Err(_) => {
                return MqttV2HandlerResult::InternalContractFailure(terminal_contract_failure(
                    operation,
                ));
            }
        };
        match V2TerminalResponseContent::new_with_artifact_and_scope(
            bound,
            terminal,
            terminal_scope.exact_scope_digest(),
            artifact,
        ) {
            Ok(content) => match self
                .terminal_repository
                .complete(terminal_scope, content.clone())
            {
                V2TerminalComplete::Completed | V2TerminalComplete::AlreadyCompleted => {
                    MqttV2HandlerResult::Terminal(Box::new(content))
                }
                V2TerminalComplete::Missing
                | V2TerminalComplete::ScopeConflict
                | V2TerminalComplete::Unavailable => MqttV2HandlerResult::InternalContractFailure(
                    terminal_contract_failure(operation),
                ),
            },
            Err(_) => {
                MqttV2HandlerResult::InternalContractFailure(terminal_contract_failure(operation))
            }
        }
    }

    fn register_artifact(
        &self,
        operation: &crate::platform_operation::BoundPlatformOperation,
        effect: &crate::platform_port::PlatformEffectReceipt,
    ) -> ArtifactHandoff {
        if effect.artifact().is_none() {
            return ArtifactHandoff::NotApplicable;
        }
        let Some(registration) = &self.artifact_registration else {
            return ArtifactHandoff::Failed(artifact_registration_failure(
                operation,
                ArtifactRegistrationReject::StorageUnavailable,
            ));
        };
        match registration.register(operation, effect) {
            ArtifactRegistrationResult::Registered(descriptor)
            | ArtifactRegistrationResult::AlreadyRegistered(descriptor) => {
                ArtifactHandoff::Registered(descriptor)
            }
            ArtifactRegistrationResult::Deferred { reason }
            | ArtifactRegistrationResult::Rejected { reason } => {
                ArtifactHandoff::Failed(artifact_registration_failure(operation, reason))
            }
        }
    }

    pub fn topics(&self) -> &MqttV2TopicSet {
        &self.topics
    }

    fn replay_or_reject(
        &self,
        scope: &V2TerminalScope,
        replay_error: crate::protocol_v2_admission::V2CommandAdmissionError,
        ingress_correlation: String,
    ) -> MqttV2HandlerResult {
        match self.terminal_repository.lookup(scope) {
            V2TerminalLookup::Completed(content) => MqttV2HandlerResult::Terminal(content),
            V2TerminalLookup::InProgress => MqttV2HandlerResult::Rejected(idempotency_failure(
                &ingress_correlation,
                ExecutionFailureReason::IdempotencyInProgress,
                RetrySafety::SafeRedeliverySameIdempotency,
                RecoveryAction::RetryAdmission,
            )),
            V2TerminalLookup::ScopeConflict => MqttV2HandlerResult::Rejected(idempotency_failure(
                &ingress_correlation,
                ExecutionFailureReason::IdempotencyScopeConflict,
                RetrySafety::NotRetryable,
                RecoveryAction::CorrectRequest,
            )),
            V2TerminalLookup::Unavailable => MqttV2HandlerResult::Rejected(idempotency_failure(
                &ingress_correlation,
                ExecutionFailureReason::TerminalRepositoryUnavailable,
                RetrySafety::SafeRedeliverySameIdempotency,
                RecoveryAction::RetryAdmission,
            )),
            V2TerminalLookup::Miss => MqttV2HandlerResult::Rejected(
                map_v2_admission_rejection(replay_error, ingress_correlation)
                    .expect("a SHA-256 ingress correlation is contract-valid"),
            ),
        }
    }
}

enum ArtifactHandoff {
    NotApplicable,
    Registered(ArtifactDeliveryDescriptor),
    Failed(ExecutionFailure),
}

struct AuthorizedCommand {
    bound: BoundV2Operation,
    terminal_scope: V2TerminalScope,
    cancel_token: String,
}

fn lifecycle_outcome(outcome: ExecutionOutcome) -> LifecycleTerminalOutcome {
    match outcome {
        ExecutionOutcome::Succeeded => LifecycleTerminalOutcome::Succeeded,
        ExecutionOutcome::Failed => LifecycleTerminalOutcome::Failed,
        ExecutionOutcome::Blocked => LifecycleTerminalOutcome::Blocked,
        ExecutionOutcome::Cancelled => LifecycleTerminalOutcome::Cancelled,
        ExecutionOutcome::EffectUnknown => LifecycleTerminalOutcome::EffectStateUnknown,
    }
}

fn execution_outcome(failure: &ExecutionFailure) -> ExecutionOutcome {
    if failure.effect_state() == EffectState::Unknown {
        ExecutionOutcome::EffectUnknown
    } else if failure.reason_code() == ExecutionFailureReason::Cancelled {
        ExecutionOutcome::Cancelled
    } else if failure.stage().is_before_effect() {
        ExecutionOutcome::Blocked
    } else {
        ExecutionOutcome::Failed
    }
}

fn pre_effect_binding_failure(correlation_id: String) -> ExecutionFailure {
    ExecutionFailure::new(
        ExecutionStage::ResourceAdmission,
        ExecutionFailureReason::InvalidRequest,
        EffectState::NotStarted,
        RetrySafety::MaterialChangeRequired,
        RecoveryAction::CorrectRequest,
        None,
        correlation_id,
    )
    .expect("a SHA-256 ingress correlation is contract-valid")
}

fn idempotency_failure(
    ingress_correlation: &str,
    reason: ExecutionFailureReason,
    retry_safety: RetrySafety,
    recovery_action: RecoveryAction,
) -> ExecutionFailure {
    ExecutionFailure::new(
        ExecutionStage::ResourceAdmission,
        reason,
        EffectState::NotStarted,
        retry_safety,
        recovery_action,
        None,
        ingress_correlation.to_string(),
    )
    .expect("a SHA-256 ingress correlation is contract-valid")
}

fn active_registration_failure(
    operation: &crate::platform_operation::BoundPlatformOperation,
) -> ExecutionFailure {
    ExecutionFailure::new(
        ExecutionStage::ResourceAdmission,
        ExecutionFailureReason::ResourceBusy,
        EffectState::NotStarted,
        RetrySafety::MaterialChangeRequired,
        RecoveryAction::ReleaseResource,
        None,
        operation.binding_digest().to_string(),
    )
    .expect("a bound operation digest is contract-valid")
}

fn terminal_contract_failure(
    operation: &crate::platform_operation::BoundPlatformOperation,
) -> ExecutionFailure {
    ExecutionFailure::new(
        ExecutionStage::PostCheck,
        ExecutionFailureReason::InternalUnclassified,
        EffectState::Unknown,
        RetrySafety::ManualVerificationRequired,
        RecoveryAction::ManualEffectVerification,
        None,
        operation.binding_digest().to_string(),
    )
    .expect("a bound operation digest is contract-valid")
}

/// Builds the exact terminal that a new process must publish when the prior
/// process durably prepared this operation but did not durably finalize its
/// effect. It is committed before dispatch and never authorizes a retry.
fn restart_recovery_terminal(
    bound: &crate::protocol_v2_operation::BoundV2Operation,
    terminal_scope: &V2TerminalScope,
) -> Option<V2TerminalResponseContent> {
    let operation = bound.operation();
    let failure = ExecutionFailure::new(
        ExecutionStage::PlatformDispatch,
        ExecutionFailureReason::RestartRecoveryRequired,
        EffectState::Unknown,
        RetrySafety::ManualVerificationRequired,
        RecoveryAction::ManualEffectVerification,
        None,
        operation.binding_digest().to_string(),
    )
    .ok()?;
    let terminal = TerminalReceipt::new(
        operation,
        ExecutionOutcome::EffectUnknown,
        DeliveryOutcome::NotStarted,
        1,
        Some(failure),
    )
    .ok()?;
    V2TerminalResponseContent::new_with_artifact_and_scope(
        bound,
        terminal,
        terminal_scope.exact_scope_digest(),
        None,
    )
    .ok()
}

fn artifact_registration_failure(
    operation: &crate::platform_operation::BoundPlatformOperation,
    reason: ArtifactRegistrationReject,
) -> ExecutionFailure {
    let (retry_safety, recovery_action) = match reason {
        ArtifactRegistrationReject::BindingConflict
        | ArtifactRegistrationReject::EffectBindingMismatch
        | ArtifactRegistrationReject::ArtifactEvidenceMissing
        | ArtifactRegistrationReject::InvalidBinding => (
            RetrySafety::MaterialChangeRequired,
            RecoveryAction::CorrectRequest,
        ),
        ArtifactRegistrationReject::StorageConflict
        | ArtifactRegistrationReject::StorageUnavailable => (
            RetrySafety::SafeRedeliverySameIdempotency,
            RecoveryAction::RetryAdmission,
        ),
    };
    ExecutionFailure::new(
        ExecutionStage::ArtifactCommit,
        ExecutionFailureReason::ArtifactCommitFailed,
        EffectState::ConfirmedApplied,
        retry_safety,
        recovery_action,
        None,
        operation.binding_digest().to_string(),
    )
    .expect("a bound operation digest is contract-valid")
}

fn ingress_correlation(bytes: &[u8]) -> String {
    sha256_correlation(bytes)
}
