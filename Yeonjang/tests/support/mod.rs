use std::sync::Arc;
use std::time::Duration;

use knowbee_yeonjang::protocol::Response;
use knowbee_yeonjang::request_dispatcher::{
    DeliveryError, DispatchCompletion, DispatchError, ResponseDelivery, TokioRequestDispatcher,
};
use knowbee_yeonjang::request_schema::{RequestSchemaError, parse_canonical_request};
use tokio::task::JoinHandle;

pub mod terminal_assertions;

use terminal_assertions::{TerminalAssertionError, TerminalDeliveryOrder, TerminalResponseLedger};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TestProviderError {
    InvalidRequest(RequestSchemaError),
    DispatchRejected(DispatchError),
    TerminalContract(TerminalAssertionError),
}

#[derive(Clone)]
pub struct ControlledTestProvider {
    dispatcher: TokioRequestDispatcher,
    ledger: TerminalResponseLedger,
    order: Option<TerminalDeliveryOrder>,
}

struct RecordingDelivery {
    ledger: TerminalResponseLedger,
    order: Option<TerminalDeliveryOrder>,
}

impl ResponseDelivery for RecordingDelivery {
    fn deliver(&self, response: &Response) -> Result<(), DeliveryError> {
        match &self.order {
            Some(order) => order.record_terminal(&self.ledger, response),
            None => self.ledger.record_terminal(response),
        }
        .map_err(|_| DeliveryError::Unavailable)
    }
}

impl ControlledTestProvider {
    pub fn new(dispatcher: TokioRequestDispatcher) -> Self {
        Self {
            dispatcher,
            ledger: TerminalResponseLedger::default(),
            order: None,
        }
    }

    pub fn new_with_terminal_order(
        dispatcher: TokioRequestDispatcher,
        request_ids: Vec<String>,
    ) -> Result<Self, TerminalAssertionError> {
        Ok(Self {
            dispatcher,
            ledger: TerminalResponseLedger::default(),
            order: Some(TerminalDeliveryOrder::new(
                request_ids,
                Duration::from_secs(2),
            )?),
        })
    }

    pub fn submit(
        &self,
        payload: &[u8],
    ) -> Result<JoinHandle<DispatchCompletion>, TestProviderError> {
        let request = parse_canonical_request(payload)
            .map_err(TestProviderError::InvalidRequest)?
            .into_request();
        let request_id = self
            .ledger
            .accept_request(&request)
            .map_err(TestProviderError::TerminalContract)?;
        let dispatched = self
            .dispatcher
            .try_dispatch_and_deliver(
                request,
                Arc::new(RecordingDelivery {
                    ledger: self.ledger.clone(),
                    order: self.order.clone(),
                }),
            )
            .map_err(TestProviderError::DispatchRejected);
        if dispatched.is_err() {
            self.ledger.reject_request(&request_id);
        }
        dispatched
    }

    pub fn responses(&self) -> Vec<Response> {
        self.ledger
            .responses()
            .expect("test provider terminal ledger available")
    }

    pub fn response_by_id(&self, id: &str) -> Option<Response> {
        self.ledger.terminal(id).ok()
    }

    pub fn terminal_result(&self, id: &str) -> Result<Response, TerminalAssertionError> {
        self.ledger.terminal(id)
    }

    pub fn exact_terminals(
        &self,
        request_ids: &[String],
    ) -> Result<Vec<Response>, TerminalAssertionError> {
        self.ledger.exact_terminals(request_ids)
    }

    pub async fn shutdown(&self) {
        self.dispatcher.shutdown().await;
    }
}
