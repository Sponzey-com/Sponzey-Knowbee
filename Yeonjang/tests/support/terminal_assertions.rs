#![allow(dead_code)]

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

use knowbee_yeonjang::protocol::{Request, Response};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TerminalAssertionError {
    MissingRequestId,
    DuplicateRequestId(String),
    UnexpectedResponseId(String),
    MissingTerminal(String),
    DuplicateTerminal(String),
    TerminalCountMismatch {
        expected: usize,
        actual: usize,
    },
    UnexpectedDeliveryOrderId(String),
    DeliveryOrderTimeout(String),
    InvalidDeliveryOrder,
    BindingMismatch {
        request_id: String,
        field: &'static str,
    },
    Unavailable,
}

#[derive(Clone, Default)]
pub struct TerminalResponseLedger {
    state: Arc<Mutex<LedgerState>>,
}

#[derive(Clone)]
pub struct TerminalDeliveryOrder {
    state: Arc<(Mutex<DeliveryOrderState>, Condvar)>,
    timeout: Duration,
}

struct DeliveryOrderState {
    request_ids: Vec<String>,
    next: usize,
}

#[derive(Default)]
struct LedgerState {
    expectations: HashMap<String, TerminalExpectation>,
    responses: Vec<Response>,
    terminal_ids: HashSet<String>,
    violations: HashMap<String, TerminalAssertionError>,
}

#[derive(Clone)]
struct TerminalExpectation {
    method: String,
    command_id: Option<String>,
    operation_id: Option<String>,
    target_fingerprint: Option<String>,
}

impl TerminalResponseLedger {
    pub fn accept_request(&self, request: &Request) -> Result<String, TerminalAssertionError> {
        let request_id = request
            .id
            .as_deref()
            .filter(|id| !id.trim().is_empty())
            .ok_or(TerminalAssertionError::MissingRequestId)?
            .to_string();
        let mut state = self
            .state
            .lock()
            .map_err(|_| TerminalAssertionError::Unavailable)?;
        if state.expectations.contains_key(&request_id) {
            return Err(TerminalAssertionError::DuplicateRequestId(request_id));
        }
        state.expectations.insert(
            request_id.clone(),
            TerminalExpectation {
                method: request.method.clone(),
                command_id: request.metadata.command_id.clone(),
                operation_id: request.metadata.operation_id.clone(),
                target_fingerprint: request.metadata.target_fingerprint.clone(),
            },
        );
        Ok(request_id)
    }

    pub fn reject_request(&self, request_id: &str) {
        if let Ok(mut state) = self.state.lock() {
            state.expectations.remove(request_id);
        }
    }

    pub fn record_terminal(&self, response: &Response) -> Result<(), TerminalAssertionError> {
        let request_id = response
            .id
            .clone()
            .ok_or(TerminalAssertionError::MissingRequestId)?;
        let mut state = self
            .state
            .lock()
            .map_err(|_| TerminalAssertionError::Unavailable)?;
        let result = validate_terminal(&state, &request_id, response);
        if let Err(error) = &result {
            state.violations.insert(request_id, error.clone());
            return result;
        }
        state.terminal_ids.insert(request_id);
        state.responses.push(response.clone());
        Ok(())
    }

    pub fn terminal(&self, request_id: &str) -> Result<Response, TerminalAssertionError> {
        let state = self
            .state
            .lock()
            .map_err(|_| TerminalAssertionError::Unavailable)?;
        if let Some(error) = state.violations.get(request_id) {
            return Err(error.clone());
        }
        if !state.expectations.contains_key(request_id) {
            return Err(TerminalAssertionError::UnexpectedResponseId(
                request_id.to_string(),
            ));
        }
        state
            .responses
            .iter()
            .find(|response| response.id.as_deref() == Some(request_id))
            .cloned()
            .ok_or_else(|| TerminalAssertionError::MissingTerminal(request_id.to_string()))
    }

    pub fn responses(&self) -> Result<Vec<Response>, TerminalAssertionError> {
        let state = self
            .state
            .lock()
            .map_err(|_| TerminalAssertionError::Unavailable)?;
        Ok(state.responses.clone())
    }

    pub fn exact_terminals(
        &self,
        request_ids: &[String],
    ) -> Result<Vec<Response>, TerminalAssertionError> {
        let responses = self.responses()?;
        if responses.len() != request_ids.len() {
            return Err(TerminalAssertionError::TerminalCountMismatch {
                expected: request_ids.len(),
                actual: responses.len(),
            });
        }
        request_ids
            .iter()
            .map(|request_id| self.terminal(request_id))
            .collect()
    }
}

impl TerminalDeliveryOrder {
    pub fn new(
        request_ids: Vec<String>,
        timeout: Duration,
    ) -> Result<Self, TerminalAssertionError> {
        let unique = request_ids.iter().collect::<HashSet<_>>();
        if request_ids.is_empty()
            || request_ids.len() > 256
            || unique.len() != request_ids.len()
            || request_ids
                .iter()
                .any(|request_id| request_id.trim().is_empty())
            || timeout.is_zero()
        {
            return Err(TerminalAssertionError::InvalidDeliveryOrder);
        }
        Ok(Self {
            state: Arc::new((
                Mutex::new(DeliveryOrderState {
                    request_ids,
                    next: 0,
                }),
                Condvar::new(),
            )),
            timeout,
        })
    }

    pub fn record_terminal(
        &self,
        ledger: &TerminalResponseLedger,
        response: &Response,
    ) -> Result<(), TerminalAssertionError> {
        let request_id = response
            .id
            .as_deref()
            .ok_or(TerminalAssertionError::MissingRequestId)?;
        let (state_lock, changed) = self.state.as_ref();
        let mut state = state_lock
            .lock()
            .map_err(|_| TerminalAssertionError::Unavailable)?;
        if !state.request_ids[state.next..]
            .iter()
            .any(|expected| expected == request_id)
        {
            return Err(TerminalAssertionError::UnexpectedDeliveryOrderId(
                request_id.to_string(),
            ));
        }
        let deadline = Instant::now() + self.timeout;
        while state.request_ids.get(state.next).map(String::as_str) != Some(request_id) {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Err(TerminalAssertionError::DeliveryOrderTimeout(
                    request_id.to_string(),
                ));
            }
            let (next_state, timeout) = changed
                .wait_timeout(state, remaining)
                .map_err(|_| TerminalAssertionError::Unavailable)?;
            state = next_state;
            if timeout.timed_out()
                && state.request_ids.get(state.next).map(String::as_str) != Some(request_id)
            {
                return Err(TerminalAssertionError::DeliveryOrderTimeout(
                    request_id.to_string(),
                ));
            }
        }
        ledger.record_terminal(response)?;
        state.next += 1;
        changed.notify_all();
        Ok(())
    }
}

fn validate_terminal(
    state: &LedgerState,
    request_id: &str,
    response: &Response,
) -> Result<(), TerminalAssertionError> {
    let expectation = state
        .expectations
        .get(request_id)
        .ok_or_else(|| TerminalAssertionError::UnexpectedResponseId(request_id.to_string()))?;
    if state.terminal_ids.contains(request_id) {
        return Err(TerminalAssertionError::DuplicateTerminal(
            request_id.to_string(),
        ));
    }
    let Some(expected_command_id) = expectation.command_id.as_deref() else {
        return Ok(());
    };
    let attempt =
        response
            .attempt
            .as_ref()
            .ok_or_else(|| TerminalAssertionError::BindingMismatch {
                request_id: request_id.to_string(),
                field: "attempt",
            })?;
    if attempt.method != expectation.method {
        return Err(binding_mismatch(request_id, "method"));
    }
    if attempt.command_id != expected_command_id {
        return Err(binding_mismatch(request_id, "command_id"));
    }
    if attempt.operation_id.as_deref() != expectation.operation_id.as_deref() {
        return Err(binding_mismatch(request_id, "operation_id"));
    }
    if attempt.target_fingerprint.as_deref() != expectation.target_fingerprint.as_deref() {
        return Err(binding_mismatch(request_id, "target_fingerprint"));
    }
    Ok(())
}

fn binding_mismatch(request_id: &str, field: &'static str) -> TerminalAssertionError {
    TerminalAssertionError::BindingMismatch {
        request_id: request_id.to_string(),
        field,
    }
}
