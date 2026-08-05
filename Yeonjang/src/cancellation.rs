use std::collections::HashMap;
use std::collections::VecDeque;
use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::task::{Context, Poll, Waker};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::protocol::{Request, RequestMetadata};
use crate::request_lifecycle::{
    CancellationReason, RequestEvent, RequestState, TerminalOutcome, TransitionOutcome,
    TransitionRejection, reduce,
};

const MAX_BINDING_LENGTH: usize = 256;
const MAX_TERMINAL_COMMANDS: usize = 512;
pub const CANCELLATION_ENVELOPE_SCHEMA_VERSION: u8 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct CommandTargetBinding {
    target_request_id: String,
    command_id: String,
    operation_id: String,
    target_session_id: String,
    target_fingerprint: String,
    idempotency_key: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CancellationReasonKind {
    UserRequested,
    DeadlineExceeded,
    RuntimeShutdown,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExactCancellationRequest {
    target: CommandTargetBinding,
    cancel_token: String,
    reason_kind: CancellationReasonKind,
    requested_at_ms: i64,
}

impl CommandTargetBinding {
    pub fn from_request(request: &Request) -> Option<Self> {
        Self::new(
            request.id.as_deref()?,
            request.metadata.command_id.as_deref()?,
            request.metadata.operation_id.as_deref()?,
            request.metadata.target_session_id.as_deref()?,
            request.metadata.target_fingerprint.as_deref()?,
            request.metadata.idempotency_key.as_deref()?,
        )
    }

    pub fn new(
        target_request_id: &str,
        command_id: &str,
        operation_id: &str,
        target_session_id: &str,
        target_fingerprint: &str,
        idempotency_key: &str,
    ) -> Option<Self> {
        Some(Self {
            target_request_id: bounded_binding(Some(target_request_id))?.to_string(),
            command_id: bounded_binding(Some(command_id))?.to_string(),
            operation_id: bounded_binding(Some(operation_id))?.to_string(),
            target_session_id: bounded_binding(Some(target_session_id))?.to_string(),
            target_fingerprint: bounded_binding(Some(target_fingerprint))?.to_string(),
            idempotency_key: bounded_binding(Some(idempotency_key))?.to_string(),
        })
    }

    pub fn command_id(&self) -> &str {
        &self.command_id
    }

    pub fn scope_digest(&self) -> String {
        let mut digest = Sha256::new();
        self.update_digest(&mut digest);
        format!("sha256:{:x}", digest.finalize())
    }

    fn update_digest(&self, digest: &mut Sha256) {
        for field in [
            &self.target_request_id,
            &self.command_id,
            &self.operation_id,
            &self.target_session_id,
            &self.target_fingerprint,
            &self.idempotency_key,
        ] {
            digest.update((field.len() as u64).to_be_bytes());
            digest.update(field.as_bytes());
        }
    }
}

impl ExactCancellationRequest {
    pub fn new(
        schema_version: u8,
        target: CommandTargetBinding,
        cancel_token: &str,
        reason_kind: CancellationReasonKind,
        requested_at_ms: i64,
    ) -> Option<Self> {
        if schema_version != CANCELLATION_ENVELOPE_SCHEMA_VERSION || requested_at_ms <= 0 {
            return None;
        }
        Some(Self {
            target,
            cancel_token: bounded_binding(Some(cancel_token))?.to_string(),
            reason_kind,
            requested_at_ms,
        })
    }

    pub fn target(&self) -> &CommandTargetBinding {
        &self.target
    }

    pub fn cancel_token(&self) -> &str {
        &self.cancel_token
    }

    pub fn reason_kind(&self) -> CancellationReasonKind {
        self.reason_kind
    }

    pub fn requested_at_ms(&self) -> i64 {
        self.requested_at_ms
    }

    pub fn scope_digest(&self) -> String {
        let mut digest = Sha256::new();
        digest.update(self.target.scope_digest().as_bytes());
        digest.update([self.reason_kind as u8]);
        digest.update(self.requested_at_ms.to_be_bytes());
        format!("sha256:{:x}", digest.finalize())
    }
}

impl From<CancellationReasonKind> for CancellationReason {
    fn from(reason: CancellationReasonKind) -> Self {
        match reason {
            CancellationReasonKind::UserRequested => Self::UserRequested,
            CancellationReasonKind::DeadlineExceeded => Self::DeadlineExceeded,
            CancellationReasonKind::RuntimeShutdown => Self::RuntimeShutdown,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SideEffectBinding {
    command_id: String,
    cancel_token: String,
}

impl SideEffectBinding {
    pub fn from_metadata(metadata: &RequestMetadata) -> Option<Self> {
        let command_id = bounded_binding(metadata.command_id.as_deref())?;
        bounded_binding(metadata.operation_id.as_deref())?;
        bounded_binding(metadata.target_session_id.as_deref())?;
        bounded_binding(metadata.target_fingerprint.as_deref())?;
        bounded_binding(metadata.idempotency_key.as_deref())?;
        let cancel_token = bounded_binding(metadata.cancel_token.as_deref())?;
        metadata.expires_at?;
        Some(Self {
            command_id: command_id.to_string(),
            cancel_token: cancel_token.to_string(),
        })
    }

    pub fn command_id(&self) -> &str {
        &self.command_id
    }

    pub fn cancel_token(&self) -> &str {
        &self.cancel_token
    }

    pub fn authorization_context(
        &self,
        method: &str,
        resource_scope: &str,
        metadata: &RequestMetadata,
    ) -> Option<crate::authorization::AuthorizationContext> {
        Some(crate::authorization::AuthorizationContext {
            method: method.to_string(),
            resource_scope: resource_scope.to_string(),
            command_id: self.command_id.clone(),
            operation_id: bounded_binding(metadata.operation_id.as_deref())?.to_string(),
            target_session_id: bounded_binding(metadata.target_session_id.as_deref())?.to_string(),
            target_fingerprint: bounded_binding(metadata.target_fingerprint.as_deref())?
                .to_string(),
            idempotency_key: bounded_binding(metadata.idempotency_key.as_deref())?.to_string(),
            expires_at: metadata.expires_at?,
        })
    }
}

#[derive(Debug, Clone)]
struct ActiveCommand {
    cancellation_id: Option<String>,
    cancel_token: String,
    target: Option<CommandTargetBinding>,
    handle: ActiveCommandHandle,
}

#[derive(Debug, Clone)]
pub struct ActiveCommandRegistry {
    state: Arc<Mutex<RegistryState>>,
    state_changed: Arc<Condvar>,
}

#[derive(Debug)]
struct RegistryState {
    active: HashMap<String, ActiveCommand>,
    terminal: HashMap<String, TerminalCommandReceipt>,
    terminal_order: VecDeque<String>,
    shutdown_requested: bool,
}

#[derive(Debug)]
struct TerminalCommandReceipt {
    cancel_token_digest: [u8; 32],
    target: Option<CommandTargetBinding>,
    outcome: TerminalOutcome,
}

#[derive(Debug, Clone)]
pub struct ActiveCommandHandle {
    cancellation: CancellationSignal,
    lifecycle: Arc<Mutex<RequestState>>,
}

#[derive(Debug, Clone)]
pub struct CancellationSignal {
    flag: Arc<AtomicBool>,
    waiter: Arc<Mutex<Option<Waker>>>,
}

pub struct CancellationWait {
    signal: CancellationSignal,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CancellationSignalError {
    Unavailable,
}

impl CancellationSignal {
    pub fn pending() -> Self {
        Self {
            flag: Arc::new(AtomicBool::new(false)),
            waiter: Arc::new(Mutex::new(None)),
        }
    }

    pub fn flag(&self) -> Arc<AtomicBool> {
        Arc::clone(&self.flag)
    }

    pub fn is_cancelled(&self) -> bool {
        self.flag.load(Ordering::Acquire)
    }

    pub fn cancelled(&self) -> CancellationWait {
        CancellationWait {
            signal: self.clone(),
        }
    }

    fn cancel(&self) {
        self.flag.store(true, Ordering::Release);
        if let Ok(mut waiter) = self.waiter.lock()
            && let Some(waiter) = waiter.take()
        {
            waiter.wake();
        }
    }
}

impl Future for CancellationWait {
    type Output = Result<(), CancellationSignalError>;

    fn poll(self: Pin<&mut Self>, context: &mut Context<'_>) -> Poll<Self::Output> {
        if self.signal.is_cancelled() {
            return Poll::Ready(Ok(()));
        }
        let Ok(mut waiter) = self.signal.waiter.lock() else {
            return Poll::Ready(Err(CancellationSignalError::Unavailable));
        };
        if self.signal.is_cancelled() {
            return Poll::Ready(Ok(()));
        }
        if !waiter
            .as_ref()
            .is_some_and(|waiter| waiter.will_wake(context.waker()))
        {
            *waiter = Some(context.waker().clone());
        }
        Poll::Pending
    }
}

impl ActiveCommandHandle {
    pub fn cancellation(&self) -> Arc<AtomicBool> {
        self.cancellation.flag()
    }

    pub fn cancellation_signal(&self) -> CancellationSignal {
        self.cancellation.clone()
    }

    pub fn transition(&self, event: RequestEvent) -> TransitionOutcome {
        let Ok(mut state) = self.lifecycle.lock() else {
            return TransitionOutcome::Rejected(TransitionRejection::InvalidTransition);
        };
        let outcome = reduce(*state, event);
        if let TransitionOutcome::Applied(next) = outcome {
            *state = next;
        }
        outcome
    }

    pub fn state(&self) -> Option<RequestState> {
        self.lifecycle.lock().ok().map(|state| *state)
    }
}

pub enum ActiveCommandRegistration {
    Registered(ActiveCommandHandle),
    AlreadyActive,
    Unbound,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CancellationRequestResult {
    Accepted,
    Duplicate,
    AlreadyTerminal,
    BindingMismatch,
    NotActive,
    Rejected,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CancellationProbeResult {
    Active,
    Duplicate,
    AlreadyTerminal,
    BindingMismatch,
    NotActive,
    Rejected,
}

impl ActiveCommandRegistry {
    pub fn register(
        &self,
        command_id: Option<&str>,
        cancel_token: Option<&str>,
    ) -> ActiveCommandRegistration {
        let Some(command_id) = bounded_binding(command_id) else {
            return ActiveCommandRegistration::Unbound;
        };
        let Some(cancel_token) = bounded_binding(cancel_token) else {
            return ActiveCommandRegistration::Unbound;
        };
        self.register_internal(command_id, None, cancel_token, None, false)
    }

    pub fn register_bound(
        &self,
        target: CommandTargetBinding,
        cancel_token: &str,
    ) -> ActiveCommandRegistration {
        let command_id = target.command_id().to_string();
        self.register_internal(&command_id, None, cancel_token, Some(target), false)
    }

    /// Registers the signed cancellation identity in the same canonical entry.
    pub fn register_bound_with_cancellation_id(
        &self,
        target: CommandTargetBinding,
        cancellation_id: &str,
        cancel_token: &str,
    ) -> ActiveCommandRegistration {
        let Some(cancellation_id) = bounded_binding(Some(cancellation_id)) else {
            return ActiveCommandRegistration::Unbound;
        };
        let command_id = target.command_id().to_string();
        self.register_internal(
            &command_id,
            Some(cancellation_id),
            cancel_token,
            Some(target),
            false,
        )
    }

    /// Publishes an already-admitted command as Running without a visible partial lifecycle.
    pub fn register_running_bound_with_cancellation_id(
        &self,
        target: CommandTargetBinding,
        cancellation_id: &str,
        cancel_token: &str,
    ) -> ActiveCommandRegistration {
        let Some(cancellation_id) = bounded_binding(Some(cancellation_id)) else {
            return ActiveCommandRegistration::Unbound;
        };
        let command_id = target.command_id().to_string();
        self.register_internal(
            &command_id,
            Some(cancellation_id),
            cancel_token,
            Some(target),
            true,
        )
    }

    fn register_internal(
        &self,
        command_id: &str,
        cancellation_id: Option<&str>,
        cancel_token: &str,
        target: Option<CommandTargetBinding>,
        start_running: bool,
    ) -> ActiveCommandRegistration {
        let Some(command_id) = bounded_binding(Some(command_id)) else {
            return ActiveCommandRegistration::Unbound;
        };
        let Some(cancel_token) = bounded_binding(Some(cancel_token)) else {
            return ActiveCommandRegistration::Unbound;
        };
        let handle = ActiveCommandHandle {
            cancellation: CancellationSignal::pending(),
            lifecycle: Arc::new(Mutex::new(RequestState::Received)),
        };
        if start_running {
            for event in [
                RequestEvent::Validate,
                RequestEvent::Authorize,
                RequestEvent::Admit,
                RequestEvent::Enqueue,
                RequestEvent::Start,
            ] {
                if !matches!(handle.transition(event), TransitionOutcome::Applied(_)) {
                    return ActiveCommandRegistration::Unbound;
                }
            }
        }
        let Ok(mut state) = self.state.lock() else {
            return ActiveCommandRegistration::Unbound;
        };
        if state.active.contains_key(command_id)
            || cancellation_id.is_some_and(|candidate| {
                state
                    .active
                    .values()
                    .any(|active| active.cancellation_id.as_deref() == Some(candidate))
            })
        {
            return ActiveCommandRegistration::AlreadyActive;
        }
        state.terminal.remove(command_id);
        state.terminal_order.retain(|entry| entry != command_id);
        state.active.insert(
            command_id.to_string(),
            ActiveCommand {
                cancellation_id: cancellation_id.map(str::to_string),
                cancel_token: cancel_token.to_string(),
                target,
                handle: handle.clone(),
            },
        );
        if state.shutdown_requested
            && let Some(active) = state.active.get(command_id)
        {
            let _ = request_active_cancellation(active, CancellationReason::RuntimeShutdown);
        }
        drop(state);
        self.state_changed.notify_all();
        ActiveCommandRegistration::Registered(handle)
    }

    /// Reads the exact active signal; poisoned state fails safe as cancelled.
    pub fn is_cancelled_id(&self, cancellation_id: &str) -> bool {
        let Some(cancellation_id) = bounded_binding(Some(cancellation_id)) else {
            return true;
        };
        let Ok(state) = self.state.lock() else {
            return true;
        };
        state
            .active
            .values()
            .find(|active| active.cancellation_id.as_deref() == Some(cancellation_id))
            .is_some_and(|active| active.handle.cancellation_signal().is_cancelled())
    }

    /// Returns the exact active operation's compatibility flag without
    /// creating a second cancellation registry or copied boolean state.
    pub fn cancellation_flag_id(&self, cancellation_id: &str) -> Option<Arc<AtomicBool>> {
        let cancellation_id = bounded_binding(Some(cancellation_id))?;
        let state = self.state.lock().ok()?;
        state
            .active
            .values()
            .find(|active| active.cancellation_id.as_deref() == Some(cancellation_id))
            .map(|active| active.handle.cancellation())
    }

    pub fn cancel(&self, command_id: &str, cancel_token: &str) -> bool {
        matches!(
            self.request_cancellation(command_id, cancel_token),
            CancellationRequestResult::Accepted
        )
    }

    pub fn request_cancellation(
        &self,
        command_id: &str,
        cancel_token: &str,
    ) -> CancellationRequestResult {
        let Some(command_id) = bounded_binding(Some(command_id)) else {
            return CancellationRequestResult::NotActive;
        };
        let Some(cancel_token) = bounded_binding(Some(cancel_token)) else {
            return CancellationRequestResult::NotActive;
        };
        let Ok(state) = self.state.lock() else {
            return CancellationRequestResult::Rejected;
        };
        let Some(active) = state.active.get(command_id) else {
            return CancellationRequestResult::NotActive;
        };
        if active.cancel_token != cancel_token {
            return CancellationRequestResult::NotActive;
        }
        request_active_cancellation(active, CancellationReason::UserRequested)
    }

    pub fn request_exact_cancellation(
        &self,
        cancellation: &ExactCancellationRequest,
    ) -> CancellationRequestResult {
        let command_id = cancellation.target().command_id();
        let Ok(state) = self.state.lock() else {
            return CancellationRequestResult::Rejected;
        };
        let Some(active) = state.active.get(command_id) else {
            return terminal_request_result(
                &state,
                cancellation.target(),
                cancellation.cancel_token(),
            );
        };
        if active.target.as_ref() != Some(cancellation.target())
            || active.cancel_token != cancellation.cancel_token()
        {
            return CancellationRequestResult::BindingMismatch;
        }
        request_active_cancellation(active, cancellation.reason_kind().into())
    }

    pub fn probe_cancellation(
        &self,
        command_id: &str,
        cancel_token: &str,
    ) -> CancellationProbeResult {
        let Some(command_id) = bounded_binding(Some(command_id)) else {
            return CancellationProbeResult::NotActive;
        };
        let Some(cancel_token) = bounded_binding(Some(cancel_token)) else {
            return CancellationProbeResult::NotActive;
        };
        let Ok(state) = self.state.lock() else {
            return CancellationProbeResult::Rejected;
        };
        let Some(active) = state.active.get(command_id) else {
            return CancellationProbeResult::NotActive;
        };
        if active.cancel_token != cancel_token {
            return CancellationProbeResult::NotActive;
        }
        probe_active_cancellation(active)
    }

    pub fn probe_exact_cancellation(
        &self,
        cancellation: &ExactCancellationRequest,
    ) -> CancellationProbeResult {
        let Ok(state) = self.state.lock() else {
            return CancellationProbeResult::Rejected;
        };
        exact_cancellation_probe(&state, cancellation)
    }

    /// Waits only for the canonical registry to observe a command whose MQTT
    /// ingress preceded its cancellation. The bounded coordination grace does
    /// not infer effect outcome and creates no second pending-command state.
    pub fn wait_for_exact_cancellation_target(
        &self,
        cancellation: &ExactCancellationRequest,
        grace: Duration,
    ) -> CancellationProbeResult {
        let deadline = Instant::now().checked_add(grace);
        let Ok(mut state) = self.state.lock() else {
            return CancellationProbeResult::Rejected;
        };
        loop {
            let observed = exact_cancellation_probe(&state, cancellation);
            if observed != CancellationProbeResult::NotActive {
                return observed;
            }
            let Some(remaining) =
                deadline.and_then(|deadline| deadline.checked_duration_since(Instant::now()))
            else {
                return CancellationProbeResult::NotActive;
            };
            if remaining.is_zero() {
                return CancellationProbeResult::NotActive;
            }
            let Ok((next, wait)) = self.state_changed.wait_timeout(state, remaining) else {
                return CancellationProbeResult::Rejected;
            };
            state = next;
            if wait.timed_out() {
                return exact_cancellation_probe(&state, cancellation);
            }
        }
    }

    pub fn remove(&self, command_id: Option<&str>) {
        let Some(command_id) = bounded_binding(command_id) else {
            return;
        };
        if let Ok(mut state) = self.state.lock() {
            state.active.remove(command_id);
            drop(state);
            self.state_changed.notify_all();
        }
    }

    pub fn finalize_and_remove(&self, command_id: Option<&str>) {
        let Some(command_id) = bounded_binding(command_id) else {
            return;
        };
        let Ok(mut state) = self.state.lock() else {
            return;
        };
        let Some(active) = state.active.remove(command_id) else {
            return;
        };
        let Some(outcome) = active.handle.state().and_then(terminal_outcome) else {
            return;
        };
        state.terminal.insert(
            command_id.to_string(),
            TerminalCommandReceipt {
                cancel_token_digest: cancel_token_digest(&active.cancel_token),
                target: active.target,
                outcome,
            },
        );
        state.terminal_order.retain(|entry| entry != command_id);
        state.terminal_order.push_back(command_id.to_string());
        while state.terminal_order.len() > MAX_TERMINAL_COMMANDS {
            if let Some(expired) = state.terminal_order.pop_front() {
                state.terminal.remove(&expired);
            }
        }
        drop(state);
        self.state_changed.notify_all();
    }

    pub fn request_runtime_shutdown(&self) {
        let Ok(mut state) = self.state.lock() else {
            return;
        };
        state.shutdown_requested = true;
        for active in state.active.values() {
            let _ = request_active_cancellation(active, CancellationReason::RuntimeShutdown);
        }
    }

    /// Read-only ownership evidence for supervisors and controlled shutdown
    /// tests. A poisoned canonical registry is reported as unavailable rather
    /// than as a misleading zero.
    pub fn active_count(&self) -> Option<usize> {
        self.state.lock().ok().map(|state| state.active.len())
    }
}

impl Default for ActiveCommandRegistry {
    fn default() -> Self {
        Self {
            state: Arc::new(Mutex::new(RegistryState {
                active: HashMap::new(),
                terminal: HashMap::new(),
                terminal_order: VecDeque::new(),
                shutdown_requested: false,
            })),
            state_changed: Arc::new(Condvar::new()),
        }
    }
}

fn exact_cancellation_probe(
    state: &RegistryState,
    cancellation: &ExactCancellationRequest,
) -> CancellationProbeResult {
    let command_id = cancellation.target().command_id();
    let Some(active) = state.active.get(command_id) else {
        return terminal_probe_result(state, cancellation.target(), cancellation.cancel_token());
    };
    if active.target.as_ref() != Some(cancellation.target())
        || active.cancel_token != cancellation.cancel_token()
    {
        return CancellationProbeResult::BindingMismatch;
    }
    probe_active_cancellation(active)
}

fn terminal_request_result(
    state: &RegistryState,
    target: &CommandTargetBinding,
    cancel_token: &str,
) -> CancellationRequestResult {
    match state.terminal.get(target.command_id()) {
        Some(receipt)
            if receipt.target.as_ref() == Some(target)
                && receipt.cancel_token_digest == cancel_token_digest(cancel_token) =>
        {
            terminal_request_outcome(receipt.outcome)
        }
        Some(_) => CancellationRequestResult::BindingMismatch,
        None => CancellationRequestResult::NotActive,
    }
}

fn terminal_probe_result(
    state: &RegistryState,
    target: &CommandTargetBinding,
    cancel_token: &str,
) -> CancellationProbeResult {
    match state.terminal.get(target.command_id()) {
        Some(receipt)
            if receipt.target.as_ref() == Some(target)
                && receipt.cancel_token_digest == cancel_token_digest(cancel_token) =>
        {
            terminal_probe_outcome(receipt.outcome)
        }
        Some(_) => CancellationProbeResult::BindingMismatch,
        None => CancellationProbeResult::NotActive,
    }
}

fn terminal_request_outcome(_: TerminalOutcome) -> CancellationRequestResult {
    CancellationRequestResult::AlreadyTerminal
}

fn terminal_probe_outcome(_: TerminalOutcome) -> CancellationProbeResult {
    CancellationProbeResult::AlreadyTerminal
}

fn request_active_cancellation(
    active: &ActiveCommand,
    reason: CancellationReason,
) -> CancellationRequestResult {
    match active
        .handle
        .transition(RequestEvent::RequestCancellation(reason))
    {
        TransitionOutcome::Applied(_) => {
            active.handle.cancellation.cancel();
            CancellationRequestResult::Accepted
        }
        TransitionOutcome::Rejected(TransitionRejection::DuplicateCancellation) => {
            CancellationRequestResult::Duplicate
        }
        TransitionOutcome::Rejected(TransitionRejection::AlreadyTerminal) => {
            CancellationRequestResult::AlreadyTerminal
        }
        TransitionOutcome::Rejected(_) => CancellationRequestResult::Rejected,
    }
}

fn probe_active_cancellation(active: &ActiveCommand) -> CancellationProbeResult {
    match active.handle.state() {
        Some(RequestState::CancellationRequested(_, _)) => CancellationProbeResult::Duplicate,
        Some(RequestState::Terminal(_)) => CancellationProbeResult::AlreadyTerminal,
        Some(_) => CancellationProbeResult::Active,
        None => CancellationProbeResult::Rejected,
    }
}

fn terminal_outcome(state: RequestState) -> Option<TerminalOutcome> {
    match state {
        RequestState::Terminal(outcome)
        | RequestState::ResponseQueued(outcome)
        | RequestState::Responded(outcome) => Some(outcome),
        _ => None,
    }
}

fn cancel_token_digest(cancel_token: &str) -> [u8; 32] {
    Sha256::digest(cancel_token.as_bytes()).into()
}

fn bounded_binding(value: Option<&str>) -> Option<&str> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty() && value.len() <= MAX_BINDING_LENGTH)
}

#[cfg(test)]
mod tests {
    use super::{
        ActiveCommandRegistration, ActiveCommandRegistry, CancellationReasonKind,
        CancellationRequestResult, CommandTargetBinding, ExactCancellationRequest,
        MAX_TERMINAL_COMMANDS, SideEffectBinding,
    };
    use crate::protocol::RequestMetadata;
    use crate::request_lifecycle::{
        ActiveStage, CancellationReason, RequestEvent, RequestState, TerminalOutcome,
        TransitionOutcome,
    };
    use std::sync::atomic::Ordering;

    #[test]
    fn cancellation_requires_exact_bounded_command_and_token() {
        let registry = ActiveCommandRegistry::default();
        let handle = match registry.register(Some("command-1"), Some("cancel-1")) {
            ActiveCommandRegistration::Registered(handle) => handle,
            _ => panic!("registered command"),
        };

        assert!(!registry.cancel("command-1", "wrong-token"));
        assert!(!handle.cancellation().load(Ordering::SeqCst));
        assert_eq!(
            registry.request_cancellation("command-1", "cancel-1"),
            CancellationRequestResult::Accepted
        );
        assert!(handle.cancellation().load(Ordering::SeqCst));
        assert_eq!(
            handle.state(),
            Some(RequestState::CancellationRequested(
                ActiveStage::Received,
                CancellationReason::UserRequested,
            ))
        );
        assert_eq!(
            registry.request_cancellation("command-1", "cancel-1"),
            CancellationRequestResult::Duplicate
        );
    }

    #[tokio::test]
    async fn cancellation_signal_wakes_the_single_waiter_without_polling() {
        let registry = ActiveCommandRegistry::default();
        let handle = match registry.register(Some("command-wait"), Some("cancel-wait")) {
            ActiveCommandRegistration::Registered(handle) => handle,
            _ => panic!("registered command"),
        };
        let signal = handle.cancellation_signal();
        let waiting = tokio::spawn(async move {
            signal.cancelled().await.expect("cancellation signal");
        });
        tokio::task::yield_now().await;

        assert_eq!(
            registry.request_cancellation("command-wait", "cancel-wait"),
            CancellationRequestResult::Accepted
        );
        waiting.await.expect("cancellation waiter");
        assert!(handle.cancellation_signal().is_cancelled());
    }

    #[test]
    fn exact_and_shutdown_cancellation_preserve_distinct_immutable_reasons() {
        let registry = ActiveCommandRegistry::default();
        let deadline = ExactCancellationRequest::new(
            1,
            CommandTargetBinding::new(
                "deadline-request",
                "deadline-command",
                "deadline-operation",
                "deadline-session",
                "deadline-fingerprint",
                "deadline-idempotency",
            )
            .expect("target"),
            "deadline-token",
            CancellationReasonKind::DeadlineExceeded,
            2_000,
        )
        .expect("deadline cancellation");
        let deadline_handle =
            match registry.register_bound(deadline.target().clone(), deadline.cancel_token()) {
                ActiveCommandRegistration::Registered(handle) => handle,
                _ => panic!("deadline command"),
            };
        assert_eq!(
            registry.request_exact_cancellation(&deadline),
            CancellationRequestResult::Accepted
        );
        assert_eq!(
            deadline_handle.state(),
            Some(RequestState::CancellationRequested(
                ActiveStage::Received,
                CancellationReason::DeadlineExceeded,
            ))
        );
        assert_eq!(
            registry.request_cancellation("deadline-command", "deadline-token"),
            CancellationRequestResult::Duplicate
        );
        assert_eq!(
            deadline_handle.state(),
            Some(RequestState::CancellationRequested(
                ActiveStage::Received,
                CancellationReason::DeadlineExceeded,
            ))
        );

        let shutdown_handle =
            match registry.register(Some("shutdown-command"), Some("shutdown-token")) {
                ActiveCommandRegistration::Registered(handle) => handle,
                _ => panic!("shutdown command"),
            };
        registry.request_runtime_shutdown();
        assert_eq!(
            shutdown_handle.state(),
            Some(RequestState::CancellationRequested(
                ActiveStage::Received,
                CancellationReason::RuntimeShutdown,
            ))
        );
    }

    #[test]
    fn registration_after_runtime_shutdown_is_immediately_cancelled_by_the_same_owner() {
        let registry = ActiveCommandRegistry::default();
        registry.request_runtime_shutdown();

        let handle = match registry.register_running_bound_with_cancellation_id(
            CommandTargetBinding::new(
                "queued-request",
                "queued-command",
                "queued-operation",
                "queued-session",
                "queued-fingerprint",
                "queued-idempotency",
            )
            .expect("queued target"),
            "queued-cancellation",
            "queued-token",
        ) {
            ActiveCommandRegistration::Registered(handle) => handle,
            _ => panic!("queued command"),
        };

        assert!(handle.cancellation_signal().is_cancelled());
        assert_eq!(
            handle.state(),
            Some(RequestState::CancellationRequested(
                ActiveStage::Running,
                CancellationReason::RuntimeShutdown,
            ))
        );
        assert!(registry.is_cancelled_id("queued-cancellation"));
    }

    #[test]
    fn duplicate_active_command_is_rejected_until_removed() {
        let registry = ActiveCommandRegistry::default();
        assert!(matches!(
            registry.register(Some("command-1"), Some("cancel-1")),
            ActiveCommandRegistration::Registered(_)
        ));
        assert!(matches!(
            registry.register(Some("command-1"), Some("cancel-2")),
            ActiveCommandRegistration::AlreadyActive
        ));

        registry.remove(Some("command-1"));

        assert!(matches!(
            registry.register(Some("command-1"), Some("cancel-2")),
            ActiveCommandRegistration::Registered(_)
        ));
    }

    #[test]
    fn exact_terminal_receipt_survives_active_cleanup_without_storing_the_raw_token() {
        let registry = ActiveCommandRegistry::default();
        let cancellation = exact_cancellation(1);
        let handle = match registry
            .register_bound(cancellation.target().clone(), cancellation.cancel_token())
        {
            ActiveCommandRegistration::Registered(handle) => handle,
            _ => panic!("registered command"),
        };
        for event in [
            RequestEvent::Validate,
            RequestEvent::Authorize,
            RequestEvent::Admit,
            RequestEvent::Enqueue,
            RequestEvent::Start,
            RequestEvent::Complete(TerminalOutcome::Succeeded),
        ] {
            assert!(matches!(
                handle.transition(event),
                TransitionOutcome::Applied(_)
            ));
        }
        registry.finalize_and_remove(Some(cancellation.target().command_id()));

        assert_eq!(
            registry.request_exact_cancellation(&cancellation),
            CancellationRequestResult::AlreadyTerminal
        );
        assert_eq!(
            registry.request_cancellation("terminal-command-1", "terminal-cancel-1"),
            CancellationRequestResult::NotActive
        );
        let wrong_token = exact_cancellation_with_token(1, "wrong-token");
        assert_eq!(
            registry.request_exact_cancellation(&wrong_token),
            CancellationRequestResult::BindingMismatch
        );
        assert!(matches!(
            registry.register(Some("terminal-command-1"), Some("new-cancel")),
            ActiveCommandRegistration::Registered(_)
        ));
    }

    #[test]
    fn terminal_receipts_are_bounded_and_evict_only_the_oldest_completed_command() {
        let registry = ActiveCommandRegistry::default();
        for index in 0..=MAX_TERMINAL_COMMANDS {
            let cancellation = exact_cancellation(index);
            let handle = match registry
                .register_bound(cancellation.target().clone(), cancellation.cancel_token())
            {
                ActiveCommandRegistration::Registered(handle) => handle,
                _ => panic!("registered command"),
            };
            assert!(matches!(
                handle.transition(RequestEvent::Complete(TerminalOutcome::Failed)),
                TransitionOutcome::Applied(_)
            ));
            registry.finalize_and_remove(Some(cancellation.target().command_id()));
        }

        assert_eq!(
            registry.request_exact_cancellation(&exact_cancellation(0)),
            CancellationRequestResult::NotActive
        );
        assert_eq!(
            registry.request_exact_cancellation(&exact_cancellation(MAX_TERMINAL_COMMANDS)),
            CancellationRequestResult::AlreadyTerminal
        );
    }

    fn exact_cancellation(index: usize) -> ExactCancellationRequest {
        exact_cancellation_with_token(index, &format!("terminal-cancel-{index}"))
    }

    fn exact_cancellation_with_token(index: usize, cancel_token: &str) -> ExactCancellationRequest {
        ExactCancellationRequest::new(
            1,
            CommandTargetBinding::new(
                &format!("terminal-request-{index}"),
                &format!("terminal-command-{index}"),
                &format!("terminal-operation-{index}"),
                &format!("terminal-session-{index}"),
                &format!("terminal-fingerprint-{index}"),
                &format!("terminal-idempotency-{index}"),
            )
            .expect("target"),
            cancel_token,
            CancellationReasonKind::UserRequested,
            2_000,
        )
        .expect("cancellation")
    }

    #[test]
    fn side_effect_binding_requires_every_bounded_contract_field() {
        let complete = RequestMetadata {
            command_id: Some("command-1".to_string()),
            operation_id: Some("operation-1".to_string()),
            target_session_id: Some("session-1".to_string()),
            target_fingerprint: Some("fingerprint-1".to_string()),
            idempotency_key: Some("idempotency-1".to_string()),
            expires_at: Some(4_000_000_000_000),
            cancel_token: Some("cancel-1".to_string()),
            ..Default::default()
        };
        assert!(SideEffectBinding::from_metadata(&complete).is_some());

        let missing_operation = RequestMetadata {
            operation_id: None,
            ..complete
        };
        assert!(SideEffectBinding::from_metadata(&missing_operation).is_none());
    }
}
