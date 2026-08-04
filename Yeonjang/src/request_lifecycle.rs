#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActiveStage {
    Received,
    Validated,
    Authorized,
    Admitted,
    Queued,
    Running,
    PostChecking,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TerminalOutcome {
    Succeeded,
    Failed,
    Blocked,
    Cancelled,
    EffectStateUnknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CancellationReason {
    UserRequested,
    DeadlineExceeded,
    RuntimeShutdown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RequestState {
    Received,
    Validated,
    Authorized,
    Admitted,
    Queued,
    Running,
    PostChecking,
    CancellationRequested(ActiveStage, CancellationReason),
    Cancelling(ActiveStage, CancellationReason),
    Terminal(TerminalOutcome),
    ResponseQueued(TerminalOutcome),
    Responded(TerminalOutcome),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RequestEvent {
    Validate,
    Authorize,
    Admit,
    Enqueue,
    Start,
    BeginPostCheck,
    RequestCancellation(CancellationReason),
    BeginCancellation,
    Complete(TerminalOutcome),
    QueueResponse,
    MarkResponded,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransitionRejection {
    InvalidTransition,
    DuplicateCancellation,
    CancellationNotRequested,
    AlreadyTerminal,
    DuplicateResponse,
    AlreadyResponded,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransitionOutcome {
    Applied(RequestState),
    Rejected(TransitionRejection),
}

pub fn reduce(state: RequestState, event: RequestEvent) -> TransitionOutcome {
    match (state, event) {
        (RequestState::Responded(_), _) => {
            return TransitionOutcome::Rejected(TransitionRejection::AlreadyResponded);
        }
        (RequestState::Terminal(outcome), RequestEvent::QueueResponse) => {
            return applied(RequestState::ResponseQueued(outcome));
        }
        (RequestState::ResponseQueued(outcome), RequestEvent::MarkResponded) => {
            return applied(RequestState::Responded(outcome));
        }
        (RequestState::ResponseQueued(_), RequestEvent::QueueResponse) => {
            return TransitionOutcome::Rejected(TransitionRejection::DuplicateResponse);
        }
        (RequestState::Terminal(_) | RequestState::ResponseQueued(_), _) => {
            return TransitionOutcome::Rejected(TransitionRejection::AlreadyTerminal);
        }
        _ => {}
    }

    match (state, event) {
        (RequestState::Received, RequestEvent::Validate) => applied(RequestState::Validated),
        (RequestState::Validated, RequestEvent::Authorize) => applied(RequestState::Authorized),
        (RequestState::Authorized, RequestEvent::Admit) => applied(RequestState::Admitted),
        (RequestState::Admitted, RequestEvent::Enqueue) => applied(RequestState::Queued),
        (RequestState::Queued, RequestEvent::Start) => applied(RequestState::Running),
        (RequestState::Running, RequestEvent::BeginPostCheck) => {
            applied(RequestState::PostChecking)
        }
        (RequestState::CancellationRequested(_, _), RequestEvent::RequestCancellation(_))
        | (RequestState::Cancelling(_, _), RequestEvent::RequestCancellation(_)) => {
            TransitionOutcome::Rejected(TransitionRejection::DuplicateCancellation)
        }
        (current, RequestEvent::RequestCancellation(reason)) => applied(
            RequestState::CancellationRequested(active_stage(current), reason),
        ),
        (
            RequestState::CancellationRequested(interrupted, reason),
            RequestEvent::BeginCancellation,
        ) => applied(RequestState::Cancelling(interrupted, reason)),
        (
            RequestState::CancellationRequested(_, _) | RequestState::Cancelling(_, _),
            RequestEvent::Complete(outcome),
        ) => applied(RequestState::Terminal(outcome)),
        (
            RequestState::Received
            | RequestState::Validated
            | RequestState::Authorized
            | RequestState::Admitted
            | RequestState::Queued,
            RequestEvent::Complete(TerminalOutcome::Failed | TerminalOutcome::Blocked),
        )
        | (
            RequestState::Running | RequestState::PostChecking,
            RequestEvent::Complete(
                TerminalOutcome::Succeeded
                | TerminalOutcome::Failed
                | TerminalOutcome::Blocked
                | TerminalOutcome::EffectStateUnknown,
            ),
        ) => {
            let RequestEvent::Complete(outcome) = event else {
                unreachable!()
            };
            applied(RequestState::Terminal(outcome))
        }
        (
            RequestState::Received
            | RequestState::Validated
            | RequestState::Authorized
            | RequestState::Admitted
            | RequestState::Queued
            | RequestState::Running
            | RequestState::PostChecking,
            RequestEvent::Complete(TerminalOutcome::Cancelled),
        ) => TransitionOutcome::Rejected(TransitionRejection::CancellationNotRequested),
        _ => TransitionOutcome::Rejected(TransitionRejection::InvalidTransition),
    }
}

fn applied(state: RequestState) -> TransitionOutcome {
    TransitionOutcome::Applied(state)
}

fn active_stage(state: RequestState) -> ActiveStage {
    match state {
        RequestState::Received => ActiveStage::Received,
        RequestState::Validated => ActiveStage::Validated,
        RequestState::Authorized => ActiveStage::Authorized,
        RequestState::Admitted => ActiveStage::Admitted,
        RequestState::Queued => ActiveStage::Queued,
        RequestState::Running => ActiveStage::Running,
        RequestState::PostChecking => ActiveStage::PostChecking,
        RequestState::CancellationRequested(stage, _) | RequestState::Cancelling(stage, _) => stage,
        RequestState::Terminal(_)
        | RequestState::ResponseQueued(_)
        | RequestState::Responded(_) => {
            unreachable!("terminal states reject events before mapping")
        }
    }
}
