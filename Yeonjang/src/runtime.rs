use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use sha2::{Digest, Sha256};
use tokio::sync::Semaphore;

use crate::artifact_sink::{CaptureArtifactSink, UnavailableCaptureArtifactSink};
use crate::authorization::{
    AuthorizationClock, AuthorizationRejection, AuthorizationVerifier,
    RejectAllAuthorizationVerifier,
};
use crate::automation::AutomationBackend;
use crate::cancellation::{
    ActiveCommandHandle, ActiveCommandRegistration, ActiveCommandRegistry, CancellationProbeResult,
    CancellationRequestResult, CommandTargetBinding, ExactCancellationRequest,
};
use crate::completed_idempotency::{
    ClaimResult, CompleteResult, CompletedRequestKey, CompletedResponseRepository,
    CompletedResponseStore, DurableCompletedRecord, DurableCompletedRecordStore,
    DurableFinalizeResult, DurableLoadResult, DurableReserveResult, DurableTerminalOutcome,
    LookupResult,
};
use crate::durable_cancellation::{
    CancellationBeginResult, CancellationFinalizeResult, CancellationLoadResult,
    CancellationReceiptKey, CancellationReceiptOutcome, CancellationStoreTerminalResult,
    DurableCancellationReceipt, DurableCancellationReceiptStore,
};
use crate::node::handle_request_with_settings_backend_sink_and_cancellation;
use crate::protocol::{CommandAttemptCancellationReason, Request, Response};
use crate::request_lifecycle::{
    CancellationReason, RequestEvent, RequestState, TerminalOutcome, TransitionOutcome,
};
use crate::resource_admission::ExecutionResourceKey;
use crate::settings::YeonjangSettings;
use crate::side_effect_admission::{AdmissionError, AdmissionOutcome, SideEffectAdmission};
use crate::tokio_resource_admission::{ResourceAdmissionError, TokioResourceAdmission};

const RESOURCE_SLOT_CAPACITY: usize = 512;
const RESOURCE_WAIT_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RuntimeConfig {
    pub max_in_flight: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeBuildError {
    InvalidMaxInFlight,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeSubmitError {
    Backpressure,
    ResourceBusy,
    ResourceStateUnavailable,
    CancelledBeforeExecution(CancellationReason),
    ShuttingDown,
    InvalidSideEffectBinding,
    InvalidParams,
    UnknownMethod,
    AuthorizationRequired,
    AuthorizationRejected(AuthorizationRejection),
    IdempotencyInProgress,
    IdempotencyConflict,
    IdempotencyUnavailable,
    EffectStateUnknown,
    DurableRecoveryUnavailable,
    AlreadyActive,
    WorkerFailed,
}

#[derive(Clone)]
pub enum DurableResponseResolveResult {
    Found(Box<Response>),
    Missing,
    Unavailable,
}

pub trait DurableResponseResolver: Send + Sync {
    fn resolve(&self, response_reference: &str) -> DurableResponseResolveResult;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DurableResponseArchiveResult {
    Archived { response_reference: String },
    Unavailable,
}

pub trait DurableResponseArchive: Send + Sync {
    fn archive(&self, response: &Response) -> DurableResponseArchiveResult;
}

#[derive(Clone)]
struct DurablePersistenceDependencies {
    archive: Arc<dyn DurableResponseArchive>,
    clock: Arc<dyn AuthorizationClock>,
}

#[derive(Clone)]
pub struct DurableRecoveryDependencies {
    records: Arc<dyn DurableCompletedRecordStore>,
    resolver: Arc<dyn DurableResponseResolver>,
    persistence: Option<DurablePersistenceDependencies>,
    cancellations: Option<DurableCancellationDependencies>,
}

#[derive(Clone)]
struct DurableCancellationDependencies {
    receipts: Arc<dyn DurableCancellationReceiptStore>,
    clock: Arc<dyn AuthorizationClock>,
}

impl DurableRecoveryDependencies {
    pub fn new(
        records: Arc<dyn DurableCompletedRecordStore>,
        resolver: Arc<dyn DurableResponseResolver>,
    ) -> Self {
        Self {
            records,
            resolver,
            persistence: None,
            cancellations: None,
        }
    }

    pub fn new_with_persistence(
        records: Arc<dyn DurableCompletedRecordStore>,
        resolver: Arc<dyn DurableResponseResolver>,
        archive: Arc<dyn DurableResponseArchive>,
        clock: Arc<dyn AuthorizationClock>,
    ) -> Self {
        Self {
            records,
            resolver,
            persistence: Some(DurablePersistenceDependencies { archive, clock }),
            cancellations: None,
        }
    }

    pub fn with_cancellations(
        mut self,
        receipts: Arc<dyn DurableCancellationReceiptStore>,
        clock: Arc<dyn AuthorizationClock>,
    ) -> Self {
        self.cancellations = Some(DurableCancellationDependencies { receipts, clock });
        self
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeCancelResult {
    Accepted,
    Duplicate,
    AlreadyTerminal,
    BindingMismatch,
    NotActive,
    Rejected,
    DurableUnavailable,
}

struct RuntimeInner {
    settings: YeonjangSettings,
    backend: Arc<dyn AutomationBackend>,
    artifact_sink: Arc<dyn CaptureArtifactSink>,
    in_flight: Arc<Semaphore>,
    accepting: AtomicBool,
    capacity: u32,
    active_commands: ActiveCommandRegistry,
    admission: SideEffectAdmission,
    completed: Arc<dyn CompletedResponseStore>,
    durable_recovery: Option<DurableRecoveryDependencies>,
    resources: TokioResourceAdmission,
}

struct CompletedClaimCleanup {
    repository: Arc<dyn CompletedResponseStore>,
    key: CompletedRequestKey,
    completed: bool,
}

struct DurableReservation {
    records: Arc<dyn DurableCompletedRecordStore>,
    archive: Arc<dyn DurableResponseArchive>,
    clock: Arc<dyn AuthorizationClock>,
    key: CompletedRequestKey,
}

struct DurableTerminalCommandRecorder {
    receipts: Arc<dyn DurableCancellationReceiptStore>,
    clock: Arc<dyn AuthorizationClock>,
    key: CancellationReceiptKey,
}

enum DurableReservationOutcome {
    NotConfigured,
    Reserved(DurableReservation),
    Completed(Response),
}

enum RuntimeCancellationBinding<'a> {
    Legacy {
        command_id: &'a str,
        cancel_token: &'a str,
    },
    Exact(&'a ExactCancellationRequest),
}

impl RuntimeCancellationBinding<'_> {
    fn receipt_key(
        &self,
        cancellation_id: &str,
    ) -> Result<CancellationReceiptKey, crate::durable_cancellation::CancellationReceiptError> {
        match self {
            Self::Legacy {
                command_id,
                cancel_token,
            } => CancellationReceiptKey::new(cancellation_id, command_id, cancel_token),
            Self::Exact(cancellation) => {
                CancellationReceiptKey::new_exact(cancellation_id, cancellation)
            }
        }
    }

    fn probe(&self, registry: &ActiveCommandRegistry) -> CancellationProbeResult {
        match self {
            Self::Legacy {
                command_id,
                cancel_token,
            } => registry.probe_cancellation(command_id, cancel_token),
            Self::Exact(cancellation) => registry.probe_exact_cancellation(cancellation),
        }
    }

    fn request(&self, registry: &ActiveCommandRegistry) -> CancellationRequestResult {
        match self {
            Self::Legacy {
                command_id,
                cancel_token,
            } => registry.request_cancellation(command_id, cancel_token),
            Self::Exact(cancellation) => registry.request_exact_cancellation(cancellation),
        }
    }

    fn scope_mismatch_result(&self) -> RuntimeCancelResult {
        match self {
            Self::Legacy { .. } => RuntimeCancelResult::Rejected,
            Self::Exact(_) => RuntimeCancelResult::BindingMismatch,
        }
    }

    fn terminal_command_key(&self) -> Option<CancellationReceiptKey> {
        match self {
            Self::Legacy { .. } => None,
            Self::Exact(cancellation) => CancellationReceiptKey::new_terminal_command(
                cancellation.target(),
                cancellation.cancel_token(),
            )
            .ok(),
        }
    }
}

impl DurableTerminalCommandRecorder {
    fn store(self) -> Result<(), RuntimeSubmitError> {
        let receipt = DurableCancellationReceipt::new(
            self.key,
            CancellationReceiptOutcome::AlreadyTerminal,
            self.clock.now_ms(),
        )
        .map_err(|_| RuntimeSubmitError::DurableRecoveryUnavailable)?;
        match self.receipts.store_terminal(receipt) {
            CancellationStoreTerminalResult::Stored
            | CancellationStoreTerminalResult::AlreadyStored => Ok(()),
            CancellationStoreTerminalResult::ScopeMismatch
            | CancellationStoreTerminalResult::Saturated
            | CancellationStoreTerminalResult::Unavailable => {
                Err(RuntimeSubmitError::DurableRecoveryUnavailable)
            }
        }
    }
}

impl DurableReservation {
    fn finalize(self, response: &Response) -> Result<(), RuntimeSubmitError> {
        let mut normalized = response.clone();
        normalized.id = None;
        let response_reference = match self.archive.archive(&normalized) {
            DurableResponseArchiveResult::Archived { response_reference } => response_reference,
            DurableResponseArchiveResult::Unavailable => {
                return Err(RuntimeSubmitError::DurableRecoveryUnavailable);
            }
        };
        let response_digest =
            response_digest(&normalized).ok_or(RuntimeSubmitError::DurableRecoveryUnavailable)?;
        let terminal = if normalized.ok {
            DurableTerminalOutcome::Succeeded {
                response_digest,
                response_reference,
            }
        } else {
            let error_code = normalized
                .error
                .as_ref()
                .map(|error| error.code.clone())
                .ok_or(RuntimeSubmitError::DurableRecoveryUnavailable)?;
            DurableTerminalOutcome::Failed {
                response_digest,
                response_reference,
                error_code,
            }
        };
        let record = DurableCompletedRecord::new(self.key, terminal, self.clock.now_ms())
            .map_err(|_| RuntimeSubmitError::DurableRecoveryUnavailable)?;
        match self.records.finalize(record) {
            DurableFinalizeResult::Finalized => Ok(()),
            DurableFinalizeResult::AlreadyFinalized
            | DurableFinalizeResult::NotReserved
            | DurableFinalizeResult::ScopeMismatch
            | DurableFinalizeResult::Unavailable => {
                Err(RuntimeSubmitError::DurableRecoveryUnavailable)
            }
        }
    }
}

impl CompletedClaimCleanup {
    fn complete(mut self, response: Response) -> Result<(), RuntimeSubmitError> {
        match self.repository.complete(&self.key, response) {
            CompleteResult::Completed => {
                self.completed = true;
                Ok(())
            }
            CompleteResult::AlreadyCompleted
            | CompleteResult::NotClaimed
            | CompleteResult::ScopeMismatch
            | CompleteResult::Unavailable => Err(RuntimeSubmitError::IdempotencyUnavailable),
        }
    }
}

impl Drop for CompletedClaimCleanup {
    fn drop(&mut self) {
        if !self.completed {
            let _ = self.repository.abandon(&self.key);
        }
    }
}

struct ActiveCommandCleanup {
    registry: ActiveCommandRegistry,
    command_id: String,
    handle: ActiveCommandHandle,
}

impl Drop for ActiveCommandCleanup {
    fn drop(&mut self) {
        if !matches!(self.handle.state(), Some(RequestState::Terminal(_))) {
            let _ = self
                .handle
                .transition(RequestEvent::Complete(TerminalOutcome::EffectStateUnknown));
        }
        self.registry.finalize_and_remove(Some(&self.command_id));
    }
}

#[derive(Clone)]
pub struct RuntimeSupervisor {
    inner: Arc<RuntimeInner>,
}

impl RuntimeSupervisor {
    pub fn new(
        config: RuntimeConfig,
        settings: YeonjangSettings,
        backend: Arc<dyn AutomationBackend>,
    ) -> Result<Self, RuntimeBuildError> {
        Self::new_with_authorization(
            config,
            settings,
            backend,
            Arc::new(RejectAllAuthorizationVerifier),
        )
    }

    pub fn new_with_authorization(
        config: RuntimeConfig,
        settings: YeonjangSettings,
        backend: Arc<dyn AutomationBackend>,
        authorization: Arc<dyn AuthorizationVerifier>,
    ) -> Result<Self, RuntimeBuildError> {
        Self::new_with_admission(
            config,
            settings,
            backend,
            SideEffectAdmission::new(authorization),
        )
    }

    pub fn new_with_authorization_and_artifact_sink(
        config: RuntimeConfig,
        settings: YeonjangSettings,
        backend: Arc<dyn AutomationBackend>,
        authorization: Arc<dyn AuthorizationVerifier>,
        artifact_sink: Arc<dyn CaptureArtifactSink>,
    ) -> Result<Self, RuntimeBuildError> {
        Self::new_with_admission_and_artifact_sink(
            config,
            settings,
            backend,
            SideEffectAdmission::new(authorization),
            artifact_sink,
        )
    }

    pub fn new_with_admission(
        config: RuntimeConfig,
        settings: YeonjangSettings,
        backend: Arc<dyn AutomationBackend>,
        admission: SideEffectAdmission,
    ) -> Result<Self, RuntimeBuildError> {
        let completed: Arc<dyn CompletedResponseStore> = Arc::new(
            CompletedResponseRepository::new(512)
                .expect("fixed completed response capacity is valid"),
        );
        Self::new_with_admission_completed_and_artifact_sink(
            config,
            settings,
            backend,
            admission,
            completed,
            Arc::new(UnavailableCaptureArtifactSink),
        )
    }

    pub fn new_with_admission_and_artifact_sink(
        config: RuntimeConfig,
        settings: YeonjangSettings,
        backend: Arc<dyn AutomationBackend>,
        admission: SideEffectAdmission,
        artifact_sink: Arc<dyn CaptureArtifactSink>,
    ) -> Result<Self, RuntimeBuildError> {
        let completed: Arc<dyn CompletedResponseStore> = Arc::new(
            CompletedResponseRepository::new(512)
                .expect("fixed completed response capacity is valid"),
        );
        Self::new_with_admission_completed_and_artifact_sink(
            config,
            settings,
            backend,
            admission,
            completed,
            artifact_sink,
        )
    }

    pub fn new_with_admission_and_completed(
        config: RuntimeConfig,
        settings: YeonjangSettings,
        backend: Arc<dyn AutomationBackend>,
        admission: SideEffectAdmission,
        completed: Arc<dyn CompletedResponseStore>,
    ) -> Result<Self, RuntimeBuildError> {
        Self::new_with_admission_completed_and_artifact_sink(
            config,
            settings,
            backend,
            admission,
            completed,
            Arc::new(UnavailableCaptureArtifactSink),
        )
    }

    pub fn new_with_admission_completed_and_artifact_sink(
        config: RuntimeConfig,
        settings: YeonjangSettings,
        backend: Arc<dyn AutomationBackend>,
        admission: SideEffectAdmission,
        completed: Arc<dyn CompletedResponseStore>,
        artifact_sink: Arc<dyn CaptureArtifactSink>,
    ) -> Result<Self, RuntimeBuildError> {
        Self::build(
            config,
            settings,
            backend,
            artifact_sink,
            admission,
            completed,
            None,
        )
    }

    pub fn new_with_admission_completed_and_recovery(
        config: RuntimeConfig,
        settings: YeonjangSettings,
        backend: Arc<dyn AutomationBackend>,
        admission: SideEffectAdmission,
        completed: Arc<dyn CompletedResponseStore>,
        durable_recovery: DurableRecoveryDependencies,
    ) -> Result<Self, RuntimeBuildError> {
        Self::build(
            config,
            settings,
            backend,
            Arc::new(UnavailableCaptureArtifactSink),
            admission,
            completed,
            Some(durable_recovery),
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn new_with_admission_completed_recovery_and_artifact_sink(
        config: RuntimeConfig,
        settings: YeonjangSettings,
        backend: Arc<dyn AutomationBackend>,
        admission: SideEffectAdmission,
        completed: Arc<dyn CompletedResponseStore>,
        durable_recovery: DurableRecoveryDependencies,
        artifact_sink: Arc<dyn CaptureArtifactSink>,
    ) -> Result<Self, RuntimeBuildError> {
        Self::build(
            config,
            settings,
            backend,
            artifact_sink,
            admission,
            completed,
            Some(durable_recovery),
        )
    }

    fn build(
        config: RuntimeConfig,
        settings: YeonjangSettings,
        backend: Arc<dyn AutomationBackend>,
        artifact_sink: Arc<dyn CaptureArtifactSink>,
        admission: SideEffectAdmission,
        completed: Arc<dyn CompletedResponseStore>,
        durable_recovery: Option<DurableRecoveryDependencies>,
    ) -> Result<Self, RuntimeBuildError> {
        if config.max_in_flight == 0 || config.max_in_flight > u32::MAX as usize {
            return Err(RuntimeBuildError::InvalidMaxInFlight);
        }
        Ok(Self {
            inner: Arc::new(RuntimeInner {
                settings,
                backend,
                artifact_sink,
                in_flight: Arc::new(Semaphore::new(config.max_in_flight)),
                accepting: AtomicBool::new(true),
                capacity: config.max_in_flight as u32,
                active_commands: ActiveCommandRegistry::default(),
                admission,
                completed,
                durable_recovery,
                resources: TokioResourceAdmission::new(
                    RESOURCE_SLOT_CAPACITY,
                    RESOURCE_WAIT_TIMEOUT,
                )
                .expect("fixed resource admission bounds are valid"),
            }),
        })
    }

    pub async fn execute(&self, request: Request) -> Result<Response, RuntimeSubmitError> {
        if !self.inner.accepting.load(Ordering::Acquire) {
            return Err(RuntimeSubmitError::ShuttingDown);
        }
        let admission = match self.inner.admission.admit(&request) {
            Ok(admission) => admission,
            Err(AdmissionError::AuthorizationRejected(AuthorizationRejection::Replayed)) => {
                return self.recover_verified_replay(&request);
            }
            Err(error) => return Err(map_admission_error(error)),
        };
        let side_effect_key = if matches!(&admission, AdmissionOutcome::SideEffect(_)) {
            let resource_scope = request
                .metadata
                .authorization_receipt
                .as_ref()
                .map(|receipt| receipt.resource_scope.as_str())
                .ok_or(RuntimeSubmitError::InvalidSideEffectBinding)?;
            Some(
                CompletedRequestKey::from_request(&request, resource_scope)
                    .map_err(|_| RuntimeSubmitError::InvalidSideEffectBinding)?,
            )
        } else {
            None
        };
        if let Some(key) = &side_effect_key
            && let Some(response) = self.recover_durable_if_present(key, &request)?
        {
            return Ok(response);
        }
        let completed_claim = if let Some(key) = side_effect_key.clone() {
            match self.inner.completed.claim(key.clone()) {
                ClaimResult::Claimed => Some(CompletedClaimCleanup {
                    repository: Arc::clone(&self.inner.completed),
                    key,
                    completed: false,
                }),
                ClaimResult::InProgress => return Err(RuntimeSubmitError::IdempotencyInProgress),
                ClaimResult::Completed(response) => {
                    return Ok(project_cached_response(*response, &request));
                }
                ClaimResult::ScopeMismatch => {
                    return Err(RuntimeSubmitError::IdempotencyConflict);
                }
                ClaimResult::Saturated | ClaimResult::Unavailable => {
                    return Err(RuntimeSubmitError::IdempotencyUnavailable);
                }
            }
        } else {
            None
        };
        let (active_command, terminal_recorder) =
            if let AdmissionOutcome::SideEffect(binding) = admission {
                let target = CommandTargetBinding::from_request(&request)
                    .ok_or(RuntimeSubmitError::InvalidSideEffectBinding)?;
                let terminal_recorder =
                    self.durable_terminal_recorder(&target, binding.cancel_token())?;
                match self
                    .inner
                    .active_commands
                    .register_bound(target, binding.cancel_token())
                {
                    ActiveCommandRegistration::Registered(handle) => {
                        transition_applied(&handle, RequestEvent::Validate)?;
                        transition_applied(&handle, RequestEvent::Authorize)?;
                        transition_applied(&handle, RequestEvent::Admit)?;
                        transition_applied(&handle, RequestEvent::Enqueue)?;
                        (
                            Some((
                                handle.clone(),
                                ActiveCommandCleanup {
                                    registry: self.inner.active_commands.clone(),
                                    command_id: binding.command_id().to_string(),
                                    handle,
                                },
                            )),
                            terminal_recorder,
                        )
                    }
                    ActiveCommandRegistration::AlreadyActive => {
                        return Err(RuntimeSubmitError::AlreadyActive);
                    }
                    ActiveCommandRegistration::Unbound => {
                        return Err(RuntimeSubmitError::InvalidSideEffectBinding);
                    }
                }
            } else {
                (None, None)
            };
        let cancellation_signal = active_command
            .as_ref()
            .map(|(handle, _)| handle.cancellation_signal());
        let resource_permit = match ExecutionResourceKey::for_request(&request) {
            Some(key) => {
                let signal = cancellation_signal
                    .as_ref()
                    .ok_or(RuntimeSubmitError::InvalidSideEffectBinding)?;
                match self.inner.resources.acquire(key, signal).await {
                    Ok(permit) => Some(permit),
                    Err(ResourceAdmissionError::Cancelled) => {
                        let reason = active_cancellation_reason(&active_command)
                            .ok_or(RuntimeSubmitError::WorkerFailed)?;
                        complete_before_execution(&active_command, TerminalOutcome::Cancelled)?;
                        return Err(RuntimeSubmitError::CancelledBeforeExecution(reason));
                    }
                    Err(ResourceAdmissionError::Busy) => {
                        complete_before_execution(&active_command, TerminalOutcome::Blocked)?;
                        return Err(RuntimeSubmitError::ResourceBusy);
                    }
                    Err(
                        ResourceAdmissionError::Saturated | ResourceAdmissionError::Unavailable,
                    ) => {
                        complete_before_execution(&active_command, TerminalOutcome::Blocked)?;
                        return Err(RuntimeSubmitError::ResourceStateUnavailable);
                    }
                }
            }
            None => None,
        };
        if cancellation_signal
            .as_ref()
            .is_some_and(|signal| signal.is_cancelled())
        {
            let reason = active_cancellation_reason(&active_command)
                .ok_or(RuntimeSubmitError::WorkerFailed)?;
            complete_before_execution(&active_command, TerminalOutcome::Cancelled)?;
            return Err(RuntimeSubmitError::CancelledBeforeExecution(reason));
        }
        let permit = match Arc::clone(&self.inner.in_flight).try_acquire_owned() {
            Ok(permit) => permit,
            Err(_) => {
                complete_before_execution(&active_command, TerminalOutcome::Blocked)?;
                return Err(RuntimeSubmitError::Backpressure);
            }
        };
        if !self.inner.accepting.load(Ordering::Acquire) {
            drop(permit);
            complete_before_execution(&active_command, TerminalOutcome::Blocked)?;
            return Err(RuntimeSubmitError::ShuttingDown);
        }
        let durable_reservation = if let Some(key) = side_effect_key.as_ref() {
            match self.reserve_durable(key, &request)? {
                DurableReservationOutcome::NotConfigured => None,
                DurableReservationOutcome::Reserved(reservation) => Some(reservation),
                DurableReservationOutcome::Completed(response) => return Ok(response),
            }
        } else {
            None
        };
        let cancellation = active_command
            .as_ref()
            .map(|(handle, _)| handle.cancellation())
            .unwrap_or_else(|| Arc::new(AtomicBool::new(false)));
        let active_command_handle = active_command.as_ref().map(|(handle, _)| handle.clone());
        let active_command_cleanup = active_command.map(|(_, cleanup)| cleanup);
        let settings = self.inner.settings.clone();
        let backend = Arc::clone(&self.inner.backend);
        let artifact_sink = Arc::clone(&self.inner.artifact_sink);
        let response = tokio::task::spawn_blocking(move || {
            let _permit = permit;
            let _resource_permit = resource_permit;
            let _active_command_cleanup = active_command_cleanup;
            if let Some(handle) = &active_command_handle {
                begin_execution(handle)?;
            }
            let mut response = handle_request_with_settings_backend_sink_and_cancellation(
                request,
                settings,
                backend.as_ref(),
                artifact_sink.as_ref(),
                cancellation,
            );
            if let Some(reservation) = durable_reservation {
                reservation.finalize(&response)?;
            }
            if let Some(handle) = &active_command_handle {
                complete_lifecycle(handle, &mut response)?;
            }
            if let Some(recorder) = terminal_recorder {
                recorder.store()?;
            }
            if let Some(claim) = completed_claim {
                claim.complete(response.clone())?;
            }
            Ok(response)
        })
        .await;
        match response {
            Ok(response) => response,
            Err(_) => Err(RuntimeSubmitError::WorkerFailed),
        }
    }

    fn durable_terminal_recorder(
        &self,
        target: &CommandTargetBinding,
        cancel_token: &str,
    ) -> Result<Option<DurableTerminalCommandRecorder>, RuntimeSubmitError> {
        let Some(dependencies) = self
            .inner
            .durable_recovery
            .as_ref()
            .and_then(|recovery| recovery.cancellations.as_ref())
        else {
            return Ok(None);
        };
        let key = CancellationReceiptKey::new_terminal_command(target, cancel_token)
            .map_err(|_| RuntimeSubmitError::DurableRecoveryUnavailable)?;
        Ok(Some(DurableTerminalCommandRecorder {
            receipts: Arc::clone(&dependencies.receipts),
            clock: Arc::clone(&dependencies.clock),
            key,
        }))
    }

    fn reserve_durable(
        &self,
        key: &CompletedRequestKey,
        request: &Request,
    ) -> Result<DurableReservationOutcome, RuntimeSubmitError> {
        let Some(recovery) = &self.inner.durable_recovery else {
            return Ok(DurableReservationOutcome::NotConfigured);
        };
        let Some(persistence) = &recovery.persistence else {
            return Err(RuntimeSubmitError::DurableRecoveryUnavailable);
        };
        let observed_at_ms = persistence.clock.now_ms();
        let record = DurableCompletedRecord::new(
            key.clone(),
            DurableTerminalOutcome::EffectStateUnknown { observed_at_ms },
            observed_at_ms,
        )
        .map_err(|_| RuntimeSubmitError::DurableRecoveryUnavailable)?;
        match recovery.records.reserve(record) {
            DurableReserveResult::Reserved => {
                Ok(DurableReservationOutcome::Reserved(DurableReservation {
                    records: Arc::clone(&recovery.records),
                    archive: Arc::clone(&persistence.archive),
                    clock: Arc::clone(&persistence.clock),
                    key: key.clone(),
                }))
            }
            DurableReserveResult::AlreadyCompleted => {
                match self.recover_durable_if_present(key, request)? {
                    Some(response) => Ok(DurableReservationOutcome::Completed(response)),
                    None => Err(RuntimeSubmitError::DurableRecoveryUnavailable),
                }
            }
            DurableReserveResult::AlreadyReserved => Err(RuntimeSubmitError::EffectStateUnknown),
            DurableReserveResult::ScopeMismatch => Err(RuntimeSubmitError::IdempotencyConflict),
            DurableReserveResult::Saturated | DurableReserveResult::Unavailable => {
                Err(RuntimeSubmitError::DurableRecoveryUnavailable)
            }
        }
    }

    pub fn cancel(&self, command_id: &str, cancel_token: &str) -> RuntimeCancelResult {
        match self
            .inner
            .active_commands
            .request_cancellation(command_id, cancel_token)
        {
            CancellationRequestResult::Accepted => RuntimeCancelResult::Accepted,
            CancellationRequestResult::Duplicate => RuntimeCancelResult::Duplicate,
            CancellationRequestResult::AlreadyTerminal => RuntimeCancelResult::AlreadyTerminal,
            CancellationRequestResult::BindingMismatch => RuntimeCancelResult::BindingMismatch,
            CancellationRequestResult::NotActive => RuntimeCancelResult::NotActive,
            CancellationRequestResult::Rejected => RuntimeCancelResult::Rejected,
        }
    }

    pub fn cancel_exact_with_request_id(
        &self,
        cancellation_id: Option<&str>,
        cancellation: &ExactCancellationRequest,
    ) -> RuntimeCancelResult {
        if self
            .inner
            .durable_recovery
            .as_ref()
            .and_then(|recovery| recovery.cancellations.as_ref())
            .is_none()
        {
            return cancellation_request_to_runtime(
                self.inner
                    .active_commands
                    .request_exact_cancellation(cancellation),
            );
        }
        self.cancel_bound_with_request_id(
            cancellation_id,
            RuntimeCancellationBinding::Exact(cancellation),
        )
    }

    pub fn cancel_with_request_id(
        &self,
        cancellation_id: Option<&str>,
        command_id: &str,
        cancel_token: &str,
    ) -> RuntimeCancelResult {
        if self
            .inner
            .durable_recovery
            .as_ref()
            .and_then(|recovery| recovery.cancellations.as_ref())
            .is_none()
        {
            return self.cancel(command_id, cancel_token);
        }
        self.cancel_bound_with_request_id(
            cancellation_id,
            RuntimeCancellationBinding::Legacy {
                command_id,
                cancel_token,
            },
        )
    }

    fn cancel_bound_with_request_id(
        &self,
        cancellation_id: Option<&str>,
        binding: RuntimeCancellationBinding<'_>,
    ) -> RuntimeCancelResult {
        let Some(dependencies) = self
            .inner
            .durable_recovery
            .as_ref()
            .and_then(|recovery| recovery.cancellations.as_ref())
        else {
            return cancellation_request_to_runtime(binding.request(&self.inner.active_commands));
        };
        let Some(cancellation_id) = cancellation_id else {
            return RuntimeCancelResult::Rejected;
        };
        let key = match binding.receipt_key(cancellation_id) {
            Ok(key) => key,
            Err(_) => return RuntimeCancelResult::Rejected,
        };
        match dependencies.receipts.load(&key) {
            CancellationLoadResult::Exact(receipt) => {
                return recover_cancellation_receipt(dependencies, receipt);
            }
            CancellationLoadResult::ScopeMismatch => return binding.scope_mismatch_result(),
            CancellationLoadResult::Corrupt(_) | CancellationLoadResult::Unavailable => {
                return RuntimeCancelResult::DurableUnavailable;
            }
            CancellationLoadResult::Miss => {}
        }
        if let Some(terminal_key) = binding.terminal_command_key() {
            match dependencies.receipts.load(&terminal_key) {
                CancellationLoadResult::Exact(receipt)
                    if receipt.outcome() == CancellationReceiptOutcome::AlreadyTerminal =>
                {
                    return RuntimeCancelResult::AlreadyTerminal;
                }
                CancellationLoadResult::Exact(_) => {
                    return RuntimeCancelResult::DurableUnavailable;
                }
                CancellationLoadResult::ScopeMismatch => {
                    return RuntimeCancelResult::BindingMismatch;
                }
                CancellationLoadResult::Corrupt(_) | CancellationLoadResult::Unavailable => {
                    return RuntimeCancelResult::DurableUnavailable;
                }
                CancellationLoadResult::Miss => {}
            }
        }
        let probed = binding.probe(&self.inner.active_commands);
        match probed {
            CancellationProbeResult::NotActive => return RuntimeCancelResult::NotActive,
            CancellationProbeResult::BindingMismatch => {
                return RuntimeCancelResult::BindingMismatch;
            }
            CancellationProbeResult::Rejected => return RuntimeCancelResult::Rejected,
            CancellationProbeResult::Active
            | CancellationProbeResult::Duplicate
            | CancellationProbeResult::AlreadyTerminal => {}
        }
        if probed == CancellationProbeResult::Active {
            let prepared = match DurableCancellationReceipt::new(
                key.clone(),
                CancellationReceiptOutcome::Prepared,
                dependencies.clock.now_ms(),
            ) {
                Ok(receipt) => receipt,
                Err(_) => return RuntimeCancelResult::DurableUnavailable,
            };
            match dependencies.receipts.begin(prepared) {
                CancellationBeginResult::Prepared => {}
                CancellationBeginResult::AlreadyPrepared => return RuntimeCancelResult::Accepted,
                CancellationBeginResult::AlreadyFinalized => {
                    return match dependencies.receipts.load(&key) {
                        CancellationLoadResult::Exact(receipt) => {
                            recover_cancellation_receipt(dependencies, receipt)
                        }
                        _ => RuntimeCancelResult::DurableUnavailable,
                    };
                }
                CancellationBeginResult::ScopeMismatch => return RuntimeCancelResult::Rejected,
                CancellationBeginResult::Saturated | CancellationBeginResult::Unavailable => {
                    return RuntimeCancelResult::DurableUnavailable;
                }
            }
        }
        let outcome = match if probed == CancellationProbeResult::Active {
            binding.request(&self.inner.active_commands)
        } else {
            probe_to_request_result(probed)
        } {
            CancellationRequestResult::Accepted => CancellationReceiptOutcome::Accepted,
            CancellationRequestResult::Duplicate => CancellationReceiptOutcome::Duplicate,
            CancellationRequestResult::AlreadyTerminal => {
                CancellationReceiptOutcome::AlreadyTerminal
            }
            CancellationRequestResult::NotActive | CancellationRequestResult::Rejected => {
                return RuntimeCancelResult::Rejected;
            }
            CancellationRequestResult::BindingMismatch => {
                return RuntimeCancelResult::BindingMismatch;
            }
        };
        let terminal =
            match DurableCancellationReceipt::new(key, outcome, dependencies.clock.now_ms()) {
                Ok(receipt) => receipt,
                Err(_) => return RuntimeCancelResult::DurableUnavailable,
            };
        let stored = if probed == CancellationProbeResult::Active {
            matches!(
                dependencies.receipts.finalize(terminal),
                CancellationFinalizeResult::Finalized
                    | CancellationFinalizeResult::AlreadyFinalized
            )
        } else {
            matches!(
                dependencies.receipts.store_terminal(terminal),
                CancellationStoreTerminalResult::Stored
                    | CancellationStoreTerminalResult::AlreadyStored
            )
        };
        if !stored {
            return RuntimeCancelResult::DurableUnavailable;
        }
        cancellation_outcome_to_runtime(outcome)
    }

    fn recover_verified_replay(&self, request: &Request) -> Result<Response, RuntimeSubmitError> {
        let resource_scope = request
            .metadata
            .authorization_receipt
            .as_ref()
            .map(|receipt| receipt.resource_scope.as_str())
            .ok_or(RuntimeSubmitError::InvalidSideEffectBinding)?;
        let key = CompletedRequestKey::from_request(request, resource_scope)
            .map_err(|_| RuntimeSubmitError::InvalidSideEffectBinding)?;
        match self.inner.completed.lookup(&key) {
            LookupResult::Exact(response) => Ok(project_cached_response(*response, request)),
            LookupResult::InProgress => Err(RuntimeSubmitError::IdempotencyInProgress),
            LookupResult::ScopeMismatch => Err(RuntimeSubmitError::IdempotencyConflict),
            LookupResult::Unavailable => Err(RuntimeSubmitError::IdempotencyUnavailable),
            LookupResult::Miss => self.recover_durable_replay(&key, request),
        }
    }

    fn recover_durable_replay(
        &self,
        key: &CompletedRequestKey,
        request: &Request,
    ) -> Result<Response, RuntimeSubmitError> {
        if self.inner.durable_recovery.is_none() {
            return Err(RuntimeSubmitError::AuthorizationRejected(
                AuthorizationRejection::Replayed,
            ));
        }
        match self.recover_durable_if_present(key, request)? {
            Some(response) => Ok(response),
            None => Err(RuntimeSubmitError::EffectStateUnknown),
        }
    }

    fn recover_durable_if_present(
        &self,
        key: &CompletedRequestKey,
        request: &Request,
    ) -> Result<Option<Response>, RuntimeSubmitError> {
        let Some(recovery) = &self.inner.durable_recovery else {
            return Ok(None);
        };
        match recovery.records.load(key) {
            DurableLoadResult::Exact(record) => {
                if matches!(
                    record.terminal(),
                    DurableTerminalOutcome::EffectStateUnknown { .. }
                ) {
                    return Err(RuntimeSubmitError::EffectStateUnknown);
                }
                let Some(response_reference) = record.response_reference() else {
                    return Err(RuntimeSubmitError::DurableRecoveryUnavailable);
                };
                match recovery.resolver.resolve(response_reference) {
                    DurableResponseResolveResult::Found(response)
                        if durable_response_matches(&record, &response) =>
                    {
                        Ok(Some(project_cached_response(*response, request)))
                    }
                    DurableResponseResolveResult::Found(_)
                    | DurableResponseResolveResult::Missing
                    | DurableResponseResolveResult::Unavailable => {
                        Err(RuntimeSubmitError::DurableRecoveryUnavailable)
                    }
                }
            }
            DurableLoadResult::Miss => Ok(None),
            DurableLoadResult::ScopeMismatch => Err(RuntimeSubmitError::IdempotencyConflict),
            DurableLoadResult::Corrupt(_) | DurableLoadResult::Unavailable => {
                Err(RuntimeSubmitError::DurableRecoveryUnavailable)
            }
        }
    }

    pub async fn shutdown(&self) {
        self.inner.accepting.store(false, Ordering::Release);
        self.inner.active_commands.request_runtime_shutdown();
        let permits = Arc::clone(&self.inner.in_flight)
            .acquire_many_owned(self.inner.capacity)
            .await
            .expect("runtime-owned semaphore is never closed");
        drop(permits);
    }
}

fn durable_response_matches(record: &DurableCompletedRecord, response: &Response) -> bool {
    let outcome_matches = match record.terminal() {
        DurableTerminalOutcome::EffectStateUnknown { .. } => false,
        DurableTerminalOutcome::Succeeded { .. } => response.ok,
        DurableTerminalOutcome::Failed { error_code, .. } => {
            !response.ok
                && response.error.as_ref().map(|error| error.code.as_str())
                    == Some(error_code.as_str())
        }
    };
    if !outcome_matches {
        return false;
    }
    let mut normalized = response.clone();
    normalized.id = None;
    let Some(digest) = response_digest(&normalized) else {
        return false;
    };
    record
        .response_digest()
        .is_some_and(|expected| digest.eq_ignore_ascii_case(expected))
}

fn recover_cancellation_receipt(
    dependencies: &DurableCancellationDependencies,
    receipt: DurableCancellationReceipt,
) -> RuntimeCancelResult {
    if receipt.outcome() == CancellationReceiptOutcome::Prepared {
        let accepted = match DurableCancellationReceipt::new(
            receipt.key().clone(),
            CancellationReceiptOutcome::Accepted,
            dependencies.clock.now_ms(),
        ) {
            Ok(receipt) => receipt,
            Err(_) => return RuntimeCancelResult::DurableUnavailable,
        };
        match dependencies.receipts.finalize(accepted) {
            CancellationFinalizeResult::Finalized
            | CancellationFinalizeResult::AlreadyFinalized => RuntimeCancelResult::Accepted,
            CancellationFinalizeResult::NotPrepared
            | CancellationFinalizeResult::ScopeMismatch
            | CancellationFinalizeResult::Unavailable => RuntimeCancelResult::DurableUnavailable,
        }
    } else {
        cancellation_outcome_to_runtime(receipt.outcome())
    }
}

fn probe_to_request_result(probe: CancellationProbeResult) -> CancellationRequestResult {
    match probe {
        CancellationProbeResult::Active => CancellationRequestResult::Rejected,
        CancellationProbeResult::Duplicate => CancellationRequestResult::Duplicate,
        CancellationProbeResult::AlreadyTerminal => CancellationRequestResult::AlreadyTerminal,
        CancellationProbeResult::BindingMismatch => CancellationRequestResult::BindingMismatch,
        CancellationProbeResult::NotActive => CancellationRequestResult::NotActive,
        CancellationProbeResult::Rejected => CancellationRequestResult::Rejected,
    }
}

fn cancellation_request_to_runtime(result: CancellationRequestResult) -> RuntimeCancelResult {
    match result {
        CancellationRequestResult::Accepted => RuntimeCancelResult::Accepted,
        CancellationRequestResult::Duplicate => RuntimeCancelResult::Duplicate,
        CancellationRequestResult::AlreadyTerminal => RuntimeCancelResult::AlreadyTerminal,
        CancellationRequestResult::BindingMismatch => RuntimeCancelResult::BindingMismatch,
        CancellationRequestResult::NotActive => RuntimeCancelResult::NotActive,
        CancellationRequestResult::Rejected => RuntimeCancelResult::Rejected,
    }
}

fn cancellation_outcome_to_runtime(outcome: CancellationReceiptOutcome) -> RuntimeCancelResult {
    match outcome {
        CancellationReceiptOutcome::Prepared | CancellationReceiptOutcome::Accepted => {
            RuntimeCancelResult::Accepted
        }
        CancellationReceiptOutcome::Duplicate => RuntimeCancelResult::Duplicate,
        CancellationReceiptOutcome::AlreadyTerminal => RuntimeCancelResult::AlreadyTerminal,
    }
}

fn response_digest(response: &Response) -> Option<String> {
    let encoded = serde_json::to_vec(response).ok()?;
    Some(format!("sha256:{:x}", Sha256::digest(encoded)))
}

fn project_cached_response(mut response: Response, request: &Request) -> Response {
    response.id = request.id.clone();
    response
}

fn transition_applied(
    handle: &ActiveCommandHandle,
    event: RequestEvent,
) -> Result<(), RuntimeSubmitError> {
    match handle.transition(event) {
        TransitionOutcome::Applied(_) => Ok(()),
        TransitionOutcome::Rejected(_) => Err(RuntimeSubmitError::WorkerFailed),
    }
}

fn complete_before_execution(
    active_command: &Option<(ActiveCommandHandle, ActiveCommandCleanup)>,
    outcome: TerminalOutcome,
) -> Result<(), RuntimeSubmitError> {
    let Some((handle, _)) = active_command else {
        return Ok(());
    };
    if outcome == TerminalOutcome::Cancelled {
        begin_cancellation(handle)?;
    }
    transition_applied(handle, RequestEvent::Complete(outcome))
}

fn begin_execution(handle: &ActiveCommandHandle) -> Result<(), RuntimeSubmitError> {
    match handle.state() {
        Some(RequestState::Queued) => transition_applied(handle, RequestEvent::Start),
        Some(RequestState::CancellationRequested(_, _) | RequestState::Cancelling(_, _)) => Ok(()),
        _ => Err(RuntimeSubmitError::WorkerFailed),
    }
}

fn begin_cancellation(handle: &ActiveCommandHandle) -> Result<(), RuntimeSubmitError> {
    match handle.state() {
        Some(RequestState::CancellationRequested(_, _)) => {
            transition_applied(handle, RequestEvent::BeginCancellation)
        }
        Some(RequestState::Cancelling(_, _)) => Ok(()),
        _ => Err(RuntimeSubmitError::WorkerFailed),
    }
}

fn active_cancellation_reason(
    active_command: &Option<(ActiveCommandHandle, ActiveCommandCleanup)>,
) -> Option<CancellationReason> {
    let (handle, _) = active_command.as_ref()?;
    cancellation_reason_from_state(handle.state())
}

fn cancellation_reason_from_state(state: Option<RequestState>) -> Option<CancellationReason> {
    match state {
        Some(
            RequestState::CancellationRequested(_, reason) | RequestState::Cancelling(_, reason),
        ) => Some(reason),
        _ => None,
    }
}

fn project_cancellation_reason(reason: CancellationReason) -> CommandAttemptCancellationReason {
    match reason {
        CancellationReason::UserRequested => CommandAttemptCancellationReason::UserRequested,
        CancellationReason::DeadlineExceeded => CommandAttemptCancellationReason::DeadlineExceeded,
        CancellationReason::RuntimeShutdown => CommandAttemptCancellationReason::RuntimeShutdown,
    }
}

fn map_admission_error(error: AdmissionError) -> RuntimeSubmitError {
    match error {
        AdmissionError::UnknownMethod => RuntimeSubmitError::UnknownMethod,
        AdmissionError::InvalidParams => RuntimeSubmitError::InvalidParams,
        AdmissionError::InvalidBinding => RuntimeSubmitError::InvalidSideEffectBinding,
        AdmissionError::AuthorizationRequired => RuntimeSubmitError::AuthorizationRequired,
        AdmissionError::AuthorizationRejected(reason) => {
            RuntimeSubmitError::AuthorizationRejected(reason)
        }
    }
}

fn complete_lifecycle(
    handle: &ActiveCommandHandle,
    response: &mut Response,
) -> Result<(), RuntimeSubmitError> {
    let outcome = if response.ok {
        TerminalOutcome::Succeeded
    } else if response
        .error
        .as_ref()
        .map(|error| error.code.as_str())
        .is_some_and(|code| matches!(code, "camera_capture_cancelled" | "command_cancelled"))
    {
        let reason = cancellation_reason_from_state(handle.state())
            .ok_or(RuntimeSubmitError::WorkerFailed)?;
        if let Some(attempt) = response.attempt.as_mut() {
            attempt.cancellation_reason = Some(project_cancellation_reason(reason));
        }
        begin_cancellation(handle)?;
        TerminalOutcome::Cancelled
    } else {
        TerminalOutcome::Failed
    };
    transition_applied(handle, RequestEvent::Complete(outcome))
}

#[cfg(test)]
mod durable_cancellation_tests {
    use std::sync::atomic::Ordering;
    use std::sync::{Arc, Mutex};

    use super::*;
    use crate::authorization::RejectAllAuthorizationVerifier;
    use crate::cancellation::{ActiveCommandRegistration, CancellationReasonKind};
    use crate::completed_idempotency::{CompletedResponseRepository, DurableSaveResult};
    use crate::durable_cancellation::DurableCancellationReceiptRepository;
    use crate::durable_completed_store::{DurableRecordStorage, RawStoreRead, RawStoreWrite};
    use crate::side_effect_admission::SideEffectAdmission;

    struct FixedClock;

    impl AuthorizationClock for FixedClock {
        fn now_ms(&self) -> i64 {
            1_700_000_000_000
        }
    }

    #[derive(Default)]
    struct MemoryStorage {
        state: Mutex<(u64, Vec<Vec<u8>>)>,
    }

    impl DurableRecordStorage for MemoryStorage {
        fn read(&self) -> RawStoreRead {
            let state = self.state.lock().expect("storage");
            RawStoreRead::Records {
                revision: state.0,
                records: state.1.clone(),
            }
        }

        fn compare_and_swap(&self, expected_revision: u64, records: Vec<Vec<u8>>) -> RawStoreWrite {
            let mut state = self.state.lock().expect("storage");
            if state.0 != expected_revision {
                return RawStoreWrite::Conflict;
            }
            state.0 += 1;
            state.1 = records;
            RawStoreWrite::Written { revision: state.0 }
        }
    }

    struct MissingRecords;

    impl DurableCompletedRecordStore for MissingRecords {
        fn load(&self, _: &CompletedRequestKey) -> DurableLoadResult {
            DurableLoadResult::Miss
        }

        fn save(&self, _: DurableCompletedRecord) -> DurableSaveResult {
            DurableSaveResult::Unavailable
        }
    }

    struct MissingResolver;

    impl DurableResponseResolver for MissingResolver {
        fn resolve(&self, _: &str) -> DurableResponseResolveResult {
            DurableResponseResolveResult::Missing
        }
    }

    #[test]
    fn accepted_cancellation_replays_after_supervisor_and_repository_restart() {
        let storage = Arc::new(MemoryStorage::default());
        let first_receipts = Arc::new(
            DurableCancellationReceiptRepository::bootstrap(4, storage.clone())
                .expect("first receipts"),
        );
        let first = supervisor(first_receipts);
        let handle = match first
            .inner
            .active_commands
            .register(Some("command-1"), Some("token-1"))
        {
            ActiveCommandRegistration::Registered(handle) => handle,
            _ => panic!("active command"),
        };

        assert_eq!(
            first.cancel_with_request_id(Some("cancel-request-1"), "command-1", "token-1"),
            RuntimeCancelResult::Accepted
        );
        assert!(handle.cancellation().load(Ordering::SeqCst));
        drop(first);

        let restarted_receipts = Arc::new(
            DurableCancellationReceiptRepository::bootstrap(4, storage)
                .expect("restarted receipts"),
        );
        let restarted = supervisor(restarted_receipts);
        assert_eq!(
            restarted.cancel_with_request_id(Some("cancel-request-1"), "command-1", "token-1",),
            RuntimeCancelResult::Accepted
        );
        assert_eq!(
            restarted.cancel_with_request_id(Some("cancel-request-1"), "command-1", "wrong-token",),
            RuntimeCancelResult::Rejected
        );
    }

    #[test]
    fn exact_cancellation_replays_only_for_the_same_complete_binding_after_restart() {
        let storage = Arc::new(MemoryStorage::default());
        let first_receipts = Arc::new(
            DurableCancellationReceiptRepository::bootstrap(4, storage.clone())
                .expect("first receipts"),
        );
        let first = supervisor(first_receipts);
        let exact = exact_cancellation("operation-1");
        let handle = match first
            .inner
            .active_commands
            .register_bound(exact.target().clone(), exact.cancel_token())
        {
            ActiveCommandRegistration::Registered(handle) => handle,
            _ => panic!("active exact command"),
        };

        assert_eq!(
            first.cancel_exact_with_request_id(Some("cancel-exact-1"), &exact),
            RuntimeCancelResult::Accepted
        );
        assert!(handle.cancellation().load(Ordering::SeqCst));
        drop(first);

        let restarted_receipts = Arc::new(
            DurableCancellationReceiptRepository::bootstrap(4, storage)
                .expect("restarted receipts"),
        );
        let restarted = supervisor(restarted_receipts);
        assert_eq!(
            restarted.cancel_exact_with_request_id(Some("cancel-exact-1"), &exact),
            RuntimeCancelResult::Accepted
        );
        assert_eq!(
            restarted.cancel_exact_with_request_id(
                Some("cancel-exact-1"),
                &exact_cancellation("operation-2"),
            ),
            RuntimeCancelResult::BindingMismatch
        );
    }

    #[test]
    fn prepared_cancellation_recovers_as_accepted_after_process_restart() {
        let storage = Arc::new(MemoryStorage::default());
        let first_receipts = DurableCancellationReceiptRepository::bootstrap(4, storage.clone())
            .expect("first receipts");
        let key =
            CancellationReceiptKey::new("prepared-cancel", "prepared-command", "prepared-token")
                .expect("key");
        assert_eq!(
            first_receipts.begin(
                DurableCancellationReceipt::new(
                    key,
                    CancellationReceiptOutcome::Prepared,
                    1_700_000_000_000,
                )
                .expect("prepared"),
            ),
            CancellationBeginResult::Prepared
        );
        drop(first_receipts);

        let restarted_receipts = Arc::new(
            DurableCancellationReceiptRepository::bootstrap(4, storage)
                .expect("restarted receipts"),
        );
        let restarted = supervisor(restarted_receipts);
        assert_eq!(
            restarted.cancel_with_request_id(
                Some("prepared-cancel"),
                "prepared-command",
                "prepared-token",
            ),
            RuntimeCancelResult::Accepted
        );
        assert_eq!(
            restarted.cancel_with_request_id(
                Some("prepared-cancel"),
                "prepared-command",
                "prepared-token",
            ),
            RuntimeCancelResult::Accepted
        );
    }

    #[test]
    fn unmatched_cancellation_does_not_consume_durable_capacity() {
        let storage = Arc::new(MemoryStorage::default());
        let receipts = Arc::new(
            DurableCancellationReceiptRepository::bootstrap(1, storage.clone()).expect("receipts"),
        );
        let supervisor = supervisor(receipts);

        assert_eq!(
            supervisor.cancel_with_request_id(
                Some("unmatched-cancel"),
                "missing-command",
                "unmatched-token",
            ),
            RuntimeCancelResult::NotActive
        );
        assert!(storage.state.lock().expect("storage").1.is_empty());
    }

    fn exact_cancellation(operation_id: &str) -> ExactCancellationRequest {
        ExactCancellationRequest::new(
            1,
            CommandTargetBinding::new(
                "request-1",
                "command-1",
                operation_id,
                "session-1",
                "fingerprint-1",
                "idempotency-1",
            )
            .expect("target"),
            "token-1",
            CancellationReasonKind::UserRequested,
            1_700_000_000_000,
        )
        .expect("exact cancellation")
    }

    fn supervisor(cancellations: Arc<DurableCancellationReceiptRepository>) -> RuntimeSupervisor {
        let admission = SideEffectAdmission::new(Arc::new(RejectAllAuthorizationVerifier));
        let completed: Arc<dyn CompletedResponseStore> =
            Arc::new(CompletedResponseRepository::new(4).expect("completed repository"));
        let backend: Arc<dyn AutomationBackend> = Arc::new(crate::platform::current_backend());
        RuntimeSupervisor::new_with_admission_completed_and_recovery(
            RuntimeConfig { max_in_flight: 1 },
            YeonjangSettings::default(),
            backend,
            admission,
            completed,
            DurableRecoveryDependencies::new(Arc::new(MissingRecords), Arc::new(MissingResolver))
                .with_cancellations(cancellations, Arc::new(FixedClock)),
        )
        .expect("supervisor")
    }
}
