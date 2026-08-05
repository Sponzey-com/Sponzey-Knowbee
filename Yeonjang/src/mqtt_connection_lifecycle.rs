#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ConnectionState {
    Starting,
    Connected,
    RetryBackoff,
    AuthenticationFailed,
    Stopped,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ConnectionEvent {
    ConnectionAccepted,
    RetryableFailure,
    AuthenticationRejected,
    BackoffElapsed,
    StopRequested,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ConnectionAction {
    None,
    ScheduleRetry,
    Reconnect,
    Stop,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct ConnectionTransition {
    pub state: ConnectionState,
    pub action: ConnectionAction,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct RejectedConnectionTransition {
    pub state: ConnectionState,
    pub event: ConnectionEvent,
}

pub(crate) fn transition(
    state: ConnectionState,
    event: ConnectionEvent,
) -> Result<ConnectionTransition, RejectedConnectionTransition> {
    use ConnectionAction::{None, Reconnect, ScheduleRetry, Stop};
    use ConnectionEvent::{
        AuthenticationRejected, BackoffElapsed, ConnectionAccepted, RetryableFailure, StopRequested,
    };
    use ConnectionState::{AuthenticationFailed, Connected, RetryBackoff, Starting, Stopped};

    let transition = match (state, event) {
        (Starting, ConnectionAccepted) => ConnectionTransition {
            state: Connected,
            action: None,
        },
        (Starting | Connected, RetryableFailure) => ConnectionTransition {
            state: RetryBackoff,
            action: ScheduleRetry,
        },
        (Starting | Connected, AuthenticationRejected) => ConnectionTransition {
            state: AuthenticationFailed,
            action: Stop,
        },
        (RetryBackoff, BackoffElapsed) => ConnectionTransition {
            state: Starting,
            action: Reconnect,
        },
        (Starting | Connected | RetryBackoff, StopRequested) => ConnectionTransition {
            state: Stopped,
            action: Stop,
        },
        _ => return Err(RejectedConnectionTransition { state, event }),
    };
    Ok(transition)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn connection_lifecycle_accepts_only_the_canonical_transitions() {
        use ConnectionAction::{None, Reconnect, ScheduleRetry, Stop};
        use ConnectionEvent::{
            AuthenticationRejected, BackoffElapsed, ConnectionAccepted, RetryableFailure,
            StopRequested,
        };
        use ConnectionState::{AuthenticationFailed, Connected, RetryBackoff, Starting, Stopped};

        let allowed = [
            (Starting, ConnectionAccepted, Connected, None),
            (Starting, RetryableFailure, RetryBackoff, ScheduleRetry),
            (Connected, RetryableFailure, RetryBackoff, ScheduleRetry),
            (Starting, AuthenticationRejected, AuthenticationFailed, Stop),
            (
                Connected,
                AuthenticationRejected,
                AuthenticationFailed,
                Stop,
            ),
            (RetryBackoff, BackoffElapsed, Starting, Reconnect),
            (Starting, StopRequested, Stopped, Stop),
            (Connected, StopRequested, Stopped, Stop),
            (RetryBackoff, StopRequested, Stopped, Stop),
        ];
        for (state, event, expected_state, expected_action) in allowed {
            assert_eq!(
                transition(state, event),
                Ok(ConnectionTransition {
                    state: expected_state,
                    action: expected_action,
                })
            );
        }

        let states = [
            Starting,
            Connected,
            RetryBackoff,
            AuthenticationFailed,
            Stopped,
        ];
        let events = [
            ConnectionAccepted,
            RetryableFailure,
            AuthenticationRejected,
            BackoffElapsed,
            StopRequested,
        ];
        for state in states {
            for event in events {
                let is_allowed = allowed.iter().any(|(allowed_state, allowed_event, _, _)| {
                    *allowed_state == state && *allowed_event == event
                });
                assert_eq!(
                    transition(state, event).is_ok(),
                    is_allowed,
                    "unexpected transition result for {state:?} + {event:?}"
                );
            }
        }
    }
}
