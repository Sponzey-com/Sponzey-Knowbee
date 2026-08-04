use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use tokio::runtime::Handle;
use tokio::sync::{OwnedSemaphorePermit, Semaphore};
use tokio::task::JoinHandle;

use crate::managed_request::ManagedRequestService;
use crate::protocol::{Request, Response};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DispatchConfig {
    pub max_pending: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DispatchBuildError {
    InvalidMaxPending,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DispatchError {
    Backpressure,
    ShuttingDown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeliveryError {
    Unavailable,
    WorkerFailed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DispatchCompletion {
    Delivered,
    DeliveryFailed(DeliveryError),
}

pub trait ResponseDelivery: Send + Sync {
    fn deliver(&self, response: &Response) -> Result<(), DeliveryError>;
}

#[derive(Clone)]
pub struct TokioRequestDispatcher {
    runtime: Handle,
    service: ManagedRequestService,
    pending: Arc<Semaphore>,
    accepting: Arc<AtomicBool>,
    capacity: u32,
}

impl TokioRequestDispatcher {
    pub fn new(
        config: DispatchConfig,
        runtime: Handle,
        service: ManagedRequestService,
    ) -> Result<Self, DispatchBuildError> {
        if config.max_pending == 0 || config.max_pending > u32::MAX as usize {
            return Err(DispatchBuildError::InvalidMaxPending);
        }
        Ok(Self {
            runtime,
            service,
            pending: Arc::new(Semaphore::new(config.max_pending)),
            accepting: Arc::new(AtomicBool::new(true)),
            capacity: config.max_pending as u32,
        })
    }

    pub(crate) fn runtime_handle(&self) -> Handle {
        self.runtime.clone()
    }

    pub fn try_dispatch(&self, request: Request) -> Result<JoinHandle<Response>, DispatchError> {
        let permit = self.try_acquire_permit()?;
        let service = self.service.clone();
        Ok(self.runtime.spawn(async move {
            let _permit = permit;
            service.handle(request).await
        }))
    }

    pub fn try_dispatch_and_deliver(
        &self,
        request: Request,
        delivery: Arc<dyn ResponseDelivery>,
    ) -> Result<JoinHandle<DispatchCompletion>, DispatchError> {
        let permit = self.try_acquire_permit()?;
        let service = self.service.clone();
        Ok(self.runtime.spawn(async move {
            let _permit = permit;
            let response = service.handle(request).await;
            match tokio::task::spawn_blocking(move || delivery.deliver(&response)).await {
                Ok(Ok(())) => DispatchCompletion::Delivered,
                Ok(Err(error)) => DispatchCompletion::DeliveryFailed(error),
                Err(_) => DispatchCompletion::DeliveryFailed(DeliveryError::WorkerFailed),
            }
        }))
    }

    pub async fn shutdown(&self) {
        self.accepting.store(false, Ordering::Release);
        let permits = Arc::clone(&self.pending)
            .acquire_many_owned(self.capacity)
            .await
            .expect("dispatcher-owned semaphore is never closed");
        drop(permits);
    }

    fn try_acquire_permit(&self) -> Result<OwnedSemaphorePermit, DispatchError> {
        if !self.accepting.load(Ordering::Acquire) {
            return Err(DispatchError::ShuttingDown);
        }
        let permit = Arc::clone(&self.pending)
            .try_acquire_owned()
            .map_err(|_| DispatchError::Backpressure)?;
        if !self.accepting.load(Ordering::Acquire) {
            drop(permit);
            return Err(DispatchError::ShuttingDown);
        }
        Ok(permit)
    }
}
