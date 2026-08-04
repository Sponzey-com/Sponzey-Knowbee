use knowbee_yeonjang::request_lifecycle::{
    ActiveStage, CancellationReason, RequestEvent, RequestState, TerminalOutcome,
    TransitionOutcome, TransitionRejection, reduce,
};

#[test]
fn normal_request_lifecycle_reaches_one_immutable_terminal_outcome() {
    let state = applied(RequestState::Received, RequestEvent::Validate);
    let state = applied(state, RequestEvent::Authorize);
    let state = applied(state, RequestEvent::Admit);
    let state = applied(state, RequestEvent::Enqueue);
    let state = applied(state, RequestEvent::Start);
    let state = applied(state, RequestEvent::BeginPostCheck);
    let terminal = applied(state, RequestEvent::Complete(TerminalOutcome::Succeeded));
    assert_eq!(terminal, RequestState::Terminal(TerminalOutcome::Succeeded));

    for event in execution_events() {
        assert_eq!(
            reduce(terminal, event),
            TransitionOutcome::Rejected(TransitionRejection::AlreadyTerminal)
        );
    }

    let response_queued = applied(terminal, RequestEvent::QueueResponse);
    assert_eq!(
        response_queued,
        RequestState::ResponseQueued(TerminalOutcome::Succeeded)
    );
    assert_eq!(
        reduce(response_queued, RequestEvent::QueueResponse),
        TransitionOutcome::Rejected(TransitionRejection::DuplicateResponse)
    );
    let responded = applied(response_queued, RequestEvent::MarkResponded);
    assert_eq!(
        responded,
        RequestState::Responded(TerminalOutcome::Succeeded)
    );
    for event in all_events() {
        assert_eq!(
            reduce(responded, event),
            TransitionOutcome::Rejected(TransitionRejection::AlreadyResponded)
        );
    }
}

#[test]
fn cancellation_retains_the_interrupted_stage_and_completion_race_evidence_wins() {
    let requested = applied(
        RequestState::Running,
        RequestEvent::RequestCancellation(CancellationReason::DeadlineExceeded),
    );
    assert_eq!(
        requested,
        RequestState::CancellationRequested(
            ActiveStage::Running,
            CancellationReason::DeadlineExceeded,
        )
    );
    assert_eq!(
        reduce(
            requested,
            RequestEvent::RequestCancellation(CancellationReason::UserRequested),
        ),
        TransitionOutcome::Rejected(TransitionRejection::DuplicateCancellation)
    );

    let cancelling = applied(requested, RequestEvent::BeginCancellation);
    assert_eq!(
        cancelling,
        RequestState::Cancelling(ActiveStage::Running, CancellationReason::DeadlineExceeded,)
    );
    let terminal = applied(
        cancelling,
        RequestEvent::Complete(TerminalOutcome::EffectStateUnknown),
    );
    assert_eq!(
        terminal,
        RequestState::Terminal(TerminalOutcome::EffectStateUnknown)
    );
}

#[test]
fn queued_cancellation_can_finish_cancelled_but_invalid_stage_skips_are_rejected() {
    let queued = applied(
        applied(
            applied(
                applied(RequestState::Received, RequestEvent::Validate),
                RequestEvent::Authorize,
            ),
            RequestEvent::Admit,
        ),
        RequestEvent::Enqueue,
    );
    let requested = applied(
        queued,
        RequestEvent::RequestCancellation(CancellationReason::UserRequested),
    );
    assert_eq!(
        requested,
        RequestState::CancellationRequested(ActiveStage::Queued, CancellationReason::UserRequested,)
    );
    let cancelling = applied(requested, RequestEvent::BeginCancellation);
    assert_eq!(
        applied(
            cancelling,
            RequestEvent::Complete(TerminalOutcome::Cancelled),
        ),
        RequestState::Terminal(TerminalOutcome::Cancelled)
    );

    assert_eq!(
        reduce(RequestState::Received, RequestEvent::Start),
        TransitionOutcome::Rejected(TransitionRejection::InvalidTransition)
    );
    assert_eq!(
        reduce(RequestState::Validated, RequestEvent::Admit),
        TransitionOutcome::Rejected(TransitionRejection::InvalidTransition)
    );
    assert_eq!(
        reduce(
            RequestState::Running,
            RequestEvent::Complete(TerminalOutcome::Cancelled),
        ),
        TransitionOutcome::Rejected(TransitionRejection::CancellationNotRequested)
    );
}

#[test]
fn every_active_stage_and_terminal_outcome_obeys_the_same_cancel_guards() {
    for (state, stage) in active_states() {
        let requested =
            RequestState::CancellationRequested(stage, CancellationReason::UserRequested);
        assert_eq!(
            reduce(
                state,
                RequestEvent::RequestCancellation(CancellationReason::UserRequested),
            ),
            TransitionOutcome::Applied(requested)
        );
        assert_eq!(
            reduce(
                requested,
                RequestEvent::RequestCancellation(CancellationReason::RuntimeShutdown),
            ),
            TransitionOutcome::Rejected(TransitionRejection::DuplicateCancellation)
        );
        let cancelling = RequestState::Cancelling(stage, CancellationReason::UserRequested);
        assert_eq!(
            reduce(requested, RequestEvent::BeginCancellation),
            TransitionOutcome::Applied(cancelling)
        );
        for terminal in terminal_outcomes() {
            assert_eq!(
                reduce(cancelling, RequestEvent::Complete(terminal)),
                TransitionOutcome::Applied(RequestState::Terminal(terminal))
            );
        }
    }

    for terminal in terminal_outcomes() {
        for event in execution_events() {
            assert_eq!(
                reduce(RequestState::Terminal(terminal), event),
                TransitionOutcome::Rejected(TransitionRejection::AlreadyTerminal)
            );
        }
    }
}

fn applied(state: RequestState, event: RequestEvent) -> RequestState {
    match reduce(state, event) {
        TransitionOutcome::Applied(next) => next,
        TransitionOutcome::Rejected(reason) => {
            panic!("expected applied transition, got {reason:?}")
        }
    }
}

fn all_events() -> Vec<RequestEvent> {
    vec![
        RequestEvent::Validate,
        RequestEvent::Authorize,
        RequestEvent::Admit,
        RequestEvent::Enqueue,
        RequestEvent::Start,
        RequestEvent::BeginPostCheck,
        RequestEvent::RequestCancellation(CancellationReason::UserRequested),
        RequestEvent::BeginCancellation,
        RequestEvent::Complete(TerminalOutcome::Succeeded),
        RequestEvent::Complete(TerminalOutcome::Failed),
        RequestEvent::Complete(TerminalOutcome::Blocked),
        RequestEvent::Complete(TerminalOutcome::Cancelled),
        RequestEvent::Complete(TerminalOutcome::EffectStateUnknown),
        RequestEvent::QueueResponse,
        RequestEvent::MarkResponded,
    ]
}

fn execution_events() -> Vec<RequestEvent> {
    all_events()
        .into_iter()
        .filter(|event| {
            !matches!(
                event,
                RequestEvent::QueueResponse | RequestEvent::MarkResponded
            )
        })
        .collect()
}

fn active_states() -> Vec<(RequestState, ActiveStage)> {
    vec![
        (RequestState::Received, ActiveStage::Received),
        (RequestState::Validated, ActiveStage::Validated),
        (RequestState::Authorized, ActiveStage::Authorized),
        (RequestState::Admitted, ActiveStage::Admitted),
        (RequestState::Queued, ActiveStage::Queued),
        (RequestState::Running, ActiveStage::Running),
        (RequestState::PostChecking, ActiveStage::PostChecking),
    ]
}

fn terminal_outcomes() -> Vec<TerminalOutcome> {
    vec![
        TerminalOutcome::Succeeded,
        TerminalOutcome::Failed,
        TerminalOutcome::Blocked,
        TerminalOutcome::Cancelled,
        TerminalOutcome::EffectStateUnknown,
    ]
}
