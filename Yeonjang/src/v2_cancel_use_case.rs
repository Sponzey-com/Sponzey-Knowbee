//! Application use case for exact v2 command cancellation.

use std::fmt;
use std::sync::Arc;
use std::time::Duration;

use serde::Serialize;

use crate::cancellation::{
    ActiveCommandRegistry, CancellationProbeResult, CancellationReasonKind,
    CancellationRequestResult, CommandTargetBinding, ExactCancellationRequest,
};
use crate::durable_cancellation::{
    CancellationBeginResult, CancellationFinalizeResult, CancellationLoadResult,
    CancellationReceiptKey, CancellationReceiptOutcome, CancellationStoreTerminalResult,
    DurableCancellationReceipt, DurableCancellationReceiptStore,
};
use crate::protocol_v2_control::{V2CancelReason, V2ControlEnvelope};
use crate::protocol_v2_control_admission::{AdmittedV2Control, VerifiedReplayV2Control};

const COMMAND_REGISTRATION_GRACE: Duration = Duration::from_millis(500);

/// Immutable composition scope for the one active-command registry owned by an instance.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct V2CancelOwnerScope {
    instance_id: String,
    session_id: String,
    target_fingerprint: String,
}

impl V2CancelOwnerScope {
    pub fn new(
        instance_id: impl Into<String>,
        session_id: impl Into<String>,
        target_fingerprint: impl Into<String>,
    ) -> Result<Self, V2CancelOwnerScopeError> {
        let scope = Self {
            instance_id: instance_id.into(),
            session_id: session_id.into(),
            target_fingerprint: target_fingerprint.into(),
        };
        if !is_bounded_non_blank(&scope.instance_id)
            || !is_bounded_non_blank(&scope.session_id)
            || !is_sha256_fingerprint(&scope.target_fingerprint)
        {
            return Err(V2CancelOwnerScopeError::InvalidIdentity);
        }
        Ok(scope)
    }

    fn matches(&self, control: &V2ControlEnvelope) -> bool {
        self.instance_id == control.target_instance_id()
            && self.session_id == control.target_session_id()
            && self.target_fingerprint == control.target_fingerprint()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2CancelOwnerScopeError {
    InvalidIdentity,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum V2CancelOutcome {
    Accepted,
    Duplicate,
    AlreadyTerminal,
    BindingMismatch,
    TargetMismatch,
    NotActive,
    StateUnavailable,
    InternalContractFailure,
}

pub trait V2CancelClock: Send + Sync {
    fn now_ms(&self) -> i64;
}

enum V2CancelPersistence {
    ProcessLocal,
    Durable {
        receipts: Arc<dyn DurableCancellationReceiptStore>,
        clock: Arc<dyn V2CancelClock>,
    },
}

/// Non-terminal acknowledgement of the cancellation request itself.
#[derive(Clone, PartialEq, Eq, Serialize)]
pub struct V2CancelAcknowledgement {
    request_id: String,
    command_id: String,
    operation_id: String,
    correlation_id: String,
    causation_id: String,
    requester_id: String,
    target_instance_id: String,
    target_session_id: String,
    target_fingerprint: String,
    idempotency_key: String,
    target_request_id: String,
    target_command_id: String,
    target_operation_id: String,
    target_idempotency_key: String,
    cancellation_id: String,
    outcome: V2CancelOutcome,
    target_terminal: bool,
}

impl fmt::Debug for V2CancelAcknowledgement {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("V2CancelAcknowledgement")
            .field("request_id", &self.request_id)
            .field("command_id", &self.command_id)
            .field("target_command_id", &self.target_command_id)
            .field("outcome", &self.outcome)
            .field("target_terminal", &self.target_terminal)
            .finish_non_exhaustive()
    }
}

impl V2CancelAcknowledgement {
    pub fn outcome(&self) -> V2CancelOutcome {
        self.outcome
    }

    pub fn target_terminal(&self) -> bool {
        self.target_terminal
    }

    pub(crate) fn request_id(&self) -> &str {
        &self.request_id
    }

    pub(crate) fn command_id(&self) -> &str {
        &self.command_id
    }

    pub(crate) fn operation_id(&self) -> &str {
        &self.operation_id
    }

    pub(crate) fn correlation_id(&self) -> &str {
        &self.correlation_id
    }

    pub(crate) fn causation_id(&self) -> &str {
        &self.causation_id
    }

    pub(crate) fn requester_id(&self) -> &str {
        &self.requester_id
    }

    pub(crate) fn target_instance_id(&self) -> &str {
        &self.target_instance_id
    }

    pub(crate) fn target_session_id(&self) -> &str {
        &self.target_session_id
    }

    pub(crate) fn target_fingerprint(&self) -> &str {
        &self.target_fingerprint
    }

    pub(crate) fn idempotency_key(&self) -> &str {
        &self.idempotency_key
    }

    pub(crate) fn target_request_id(&self) -> &str {
        &self.target_request_id
    }

    pub(crate) fn target_command_id(&self) -> &str {
        &self.target_command_id
    }

    pub(crate) fn target_operation_id(&self) -> &str {
        &self.target_operation_id
    }

    pub(crate) fn target_idempotency_key(&self) -> &str {
        &self.target_idempotency_key
    }

    pub(crate) fn cancellation_id(&self) -> &str {
        &self.cancellation_id
    }
}

/// Maps admitted v2 control into the existing exact active-command state owner.
pub struct V2CancelUseCase {
    registry: Arc<ActiveCommandRegistry>,
    owner_scope: V2CancelOwnerScope,
    persistence: V2CancelPersistence,
}

impl V2CancelUseCase {
    pub fn new(registry: Arc<ActiveCommandRegistry>, owner_scope: V2CancelOwnerScope) -> Self {
        Self {
            registry,
            owner_scope,
            persistence: V2CancelPersistence::ProcessLocal,
        }
    }

    pub fn new_durable(
        registry: Arc<ActiveCommandRegistry>,
        owner_scope: V2CancelOwnerScope,
        receipts: Arc<dyn DurableCancellationReceiptStore>,
        clock: Arc<dyn V2CancelClock>,
    ) -> Self {
        Self {
            registry,
            owner_scope,
            persistence: V2CancelPersistence::Durable { receipts, clock },
        }
    }

    pub fn execute(&self, admitted: &AdmittedV2Control<'_>) -> V2CancelAcknowledgement {
        let control = admitted.control();
        let outcome = if !self.owner_scope.matches(control) {
            V2CancelOutcome::TargetMismatch
        } else {
            self.apply_exact(control)
        };
        acknowledgement(control, outcome)
    }

    pub fn replay(&self, replay: &VerifiedReplayV2Control<'_>) -> V2CancelAcknowledgement {
        let control = replay.control();
        let outcome = if !self.owner_scope.matches(control) {
            V2CancelOutcome::TargetMismatch
        } else {
            self.replay_durable(control)
        };
        acknowledgement(control, outcome)
    }

    fn replay_durable(&self, control: &V2ControlEnvelope) -> V2CancelOutcome {
        let Some(cancellation) = exact_cancellation(control) else {
            return V2CancelOutcome::InternalContractFailure;
        };
        let V2CancelPersistence::Durable { receipts, clock } = &self.persistence else {
            return V2CancelOutcome::StateUnavailable;
        };
        let Ok(key) = CancellationReceiptKey::new_exact(control.request_id(), &cancellation) else {
            return V2CancelOutcome::InternalContractFailure;
        };
        match receipts.load(&key) {
            CancellationLoadResult::Exact(receipt) => {
                recover_receipt(receipts.as_ref(), clock.as_ref(), receipt)
            }
            CancellationLoadResult::ScopeMismatch => V2CancelOutcome::BindingMismatch,
            CancellationLoadResult::Miss
            | CancellationLoadResult::Corrupt(_)
            | CancellationLoadResult::Unavailable => V2CancelOutcome::StateUnavailable,
        }
    }

    fn apply_exact(&self, control: &V2ControlEnvelope) -> V2CancelOutcome {
        let Some(cancellation) = exact_cancellation(control) else {
            return V2CancelOutcome::InternalContractFailure;
        };
        match &self.persistence {
            V2CancelPersistence::ProcessLocal => {
                map_request_result(self.registry.request_exact_cancellation(&cancellation))
            }
            V2CancelPersistence::Durable { receipts, clock } => self.apply_durable(
                control.request_id(),
                &cancellation,
                receipts.as_ref(),
                clock.as_ref(),
            ),
        }
    }

    fn apply_durable(
        &self,
        cancellation_request_id: &str,
        cancellation: &ExactCancellationRequest,
        receipts: &dyn DurableCancellationReceiptStore,
        clock: &dyn V2CancelClock,
    ) -> V2CancelOutcome {
        let Ok(key) = CancellationReceiptKey::new_exact(cancellation_request_id, cancellation)
        else {
            return V2CancelOutcome::InternalContractFailure;
        };
        match receipts.load(&key) {
            CancellationLoadResult::Exact(receipt) => {
                return recover_receipt(receipts, clock, receipt);
            }
            CancellationLoadResult::ScopeMismatch => return V2CancelOutcome::BindingMismatch,
            CancellationLoadResult::Corrupt(_) | CancellationLoadResult::Unavailable => {
                return V2CancelOutcome::StateUnavailable;
            }
            CancellationLoadResult::Miss => {}
        }
        let mut probed = self.registry.probe_exact_cancellation(cancellation);
        if probed == CancellationProbeResult::NotActive {
            // MQTT ingress preserves command-before-control order, while their
            // blocking workers may start in the opposite order. Observe the
            // canonical registry briefly so that scheduling does not lose an
            // exact cancellation; this never decides the command terminal.
            probed = self
                .registry
                .wait_for_exact_cancellation_target(cancellation, COMMAND_REGISTRATION_GRACE);
        }
        match probed {
            CancellationProbeResult::NotActive => return V2CancelOutcome::NotActive,
            CancellationProbeResult::BindingMismatch => {
                return V2CancelOutcome::BindingMismatch;
            }
            CancellationProbeResult::Rejected => return V2CancelOutcome::StateUnavailable,
            CancellationProbeResult::Active
            | CancellationProbeResult::Duplicate
            | CancellationProbeResult::AlreadyTerminal => {}
        }
        if probed == CancellationProbeResult::Active {
            let Ok(prepared) = DurableCancellationReceipt::new(
                key.clone(),
                CancellationReceiptOutcome::Prepared,
                clock.now_ms(),
            ) else {
                return V2CancelOutcome::StateUnavailable;
            };
            match receipts.begin(prepared) {
                CancellationBeginResult::Prepared => {}
                CancellationBeginResult::AlreadyPrepared => return V2CancelOutcome::Accepted,
                CancellationBeginResult::AlreadyFinalized => {
                    return match receipts.load(&key) {
                        CancellationLoadResult::Exact(receipt) => {
                            recover_receipt(receipts, clock, receipt)
                        }
                        _ => V2CancelOutcome::StateUnavailable,
                    };
                }
                CancellationBeginResult::ScopeMismatch => {
                    return V2CancelOutcome::BindingMismatch;
                }
                CancellationBeginResult::Saturated | CancellationBeginResult::Unavailable => {
                    return V2CancelOutcome::StateUnavailable;
                }
            }
        }
        let request_result = if probed == CancellationProbeResult::Active {
            self.registry.request_exact_cancellation(cancellation)
        } else {
            probe_to_request_result(probed)
        };
        let Some(receipt_outcome) = receipt_outcome(request_result) else {
            return map_request_result(request_result);
        };
        let Ok(terminal) = DurableCancellationReceipt::new(key, receipt_outcome, clock.now_ms())
        else {
            return V2CancelOutcome::StateUnavailable;
        };
        let stored = if probed == CancellationProbeResult::Active {
            matches!(
                receipts.finalize(terminal),
                CancellationFinalizeResult::Finalized
                    | CancellationFinalizeResult::AlreadyFinalized
            )
        } else {
            matches!(
                receipts.store_terminal(terminal),
                CancellationStoreTerminalResult::Stored
                    | CancellationStoreTerminalResult::AlreadyStored
            )
        };
        if !stored {
            return V2CancelOutcome::StateUnavailable;
        }
        map_receipt_outcome(receipt_outcome)
    }
}

fn acknowledgement(
    control: &V2ControlEnvelope,
    outcome: V2CancelOutcome,
) -> V2CancelAcknowledgement {
    V2CancelAcknowledgement {
        request_id: control.request_id().to_string(),
        command_id: control.command_id().to_string(),
        operation_id: control.operation_id().to_string(),
        correlation_id: control.correlation_id().to_string(),
        causation_id: control.message_id().to_string(),
        requester_id: control.requester_id().to_string(),
        target_instance_id: control.target_instance_id().to_string(),
        target_session_id: control.target_session_id().to_string(),
        target_fingerprint: control.target_fingerprint().to_string(),
        idempotency_key: control.idempotency_key().to_string(),
        target_request_id: control.target_request_id().to_string(),
        target_command_id: control.target_command_id().to_string(),
        target_operation_id: control.target_operation_id().to_string(),
        target_idempotency_key: control.target_idempotency_key().to_string(),
        cancellation_id: control.cancellation_id().to_string(),
        outcome,
        target_terminal: false,
    }
}

fn exact_cancellation(control: &V2ControlEnvelope) -> Option<ExactCancellationRequest> {
    let target = CommandTargetBinding::new(
        control.target_request_id(),
        control.target_command_id(),
        control.target_operation_id(),
        control.target_session_id(),
        control.target_fingerprint(),
        control.target_idempotency_key(),
    )?;
    ExactCancellationRequest::new(
        1,
        target,
        control.cancel_token(),
        map_reason(control.reason()),
        control.issued_at(),
    )
}

fn map_request_result(result: CancellationRequestResult) -> V2CancelOutcome {
    match result {
        CancellationRequestResult::Accepted => V2CancelOutcome::Accepted,
        CancellationRequestResult::Duplicate => V2CancelOutcome::Duplicate,
        CancellationRequestResult::AlreadyTerminal => V2CancelOutcome::AlreadyTerminal,
        CancellationRequestResult::BindingMismatch => V2CancelOutcome::BindingMismatch,
        CancellationRequestResult::NotActive => V2CancelOutcome::NotActive,
        CancellationRequestResult::Rejected => V2CancelOutcome::StateUnavailable,
    }
}

fn probe_to_request_result(probe: CancellationProbeResult) -> CancellationRequestResult {
    match probe {
        CancellationProbeResult::Active | CancellationProbeResult::Rejected => {
            CancellationRequestResult::Rejected
        }
        CancellationProbeResult::Duplicate => CancellationRequestResult::Duplicate,
        CancellationProbeResult::AlreadyTerminal => CancellationRequestResult::AlreadyTerminal,
        CancellationProbeResult::BindingMismatch => CancellationRequestResult::BindingMismatch,
        CancellationProbeResult::NotActive => CancellationRequestResult::NotActive,
    }
}

fn receipt_outcome(result: CancellationRequestResult) -> Option<CancellationReceiptOutcome> {
    match result {
        CancellationRequestResult::Accepted => Some(CancellationReceiptOutcome::Accepted),
        CancellationRequestResult::Duplicate => Some(CancellationReceiptOutcome::Duplicate),
        CancellationRequestResult::AlreadyTerminal => {
            Some(CancellationReceiptOutcome::AlreadyTerminal)
        }
        CancellationRequestResult::BindingMismatch
        | CancellationRequestResult::NotActive
        | CancellationRequestResult::Rejected => None,
    }
}

fn map_receipt_outcome(outcome: CancellationReceiptOutcome) -> V2CancelOutcome {
    match outcome {
        CancellationReceiptOutcome::Prepared | CancellationReceiptOutcome::Accepted => {
            V2CancelOutcome::Accepted
        }
        CancellationReceiptOutcome::Duplicate => V2CancelOutcome::Duplicate,
        CancellationReceiptOutcome::AlreadyTerminal => V2CancelOutcome::AlreadyTerminal,
    }
}

fn recover_receipt(
    receipts: &dyn DurableCancellationReceiptStore,
    clock: &dyn V2CancelClock,
    receipt: DurableCancellationReceipt,
) -> V2CancelOutcome {
    if receipt.outcome() != CancellationReceiptOutcome::Prepared {
        return map_receipt_outcome(receipt.outcome());
    }
    let Ok(accepted) = DurableCancellationReceipt::new(
        receipt.key().clone(),
        CancellationReceiptOutcome::Accepted,
        clock.now_ms(),
    ) else {
        return V2CancelOutcome::StateUnavailable;
    };
    match receipts.finalize(accepted) {
        CancellationFinalizeResult::Finalized | CancellationFinalizeResult::AlreadyFinalized => {
            V2CancelOutcome::Accepted
        }
        CancellationFinalizeResult::NotPrepared
        | CancellationFinalizeResult::ScopeMismatch
        | CancellationFinalizeResult::Unavailable => V2CancelOutcome::StateUnavailable,
    }
}

fn map_reason(reason: V2CancelReason) -> CancellationReasonKind {
    match reason {
        V2CancelReason::UserRequested => CancellationReasonKind::UserRequested,
        V2CancelReason::DeadlineExceeded => CancellationReasonKind::DeadlineExceeded,
        V2CancelReason::RuntimeShutdown => CancellationReasonKind::RuntimeShutdown,
    }
}

fn is_bounded_non_blank(value: &str) -> bool {
    !value.trim().is_empty() && value.len() <= 256
}

fn is_sha256_fingerprint(value: &str) -> bool {
    value.len() == 71
        && value
            .strip_prefix("sha256:")
            .is_some_and(|digest| digest.bytes().all(|byte| byte.is_ascii_hexdigit()))
}
