use std::collections::HashMap;
use std::sync::{Arc, Mutex, Weak};
use std::time::Duration;

use tokio::sync::{OwnedSemaphorePermit, Semaphore};
use tokio::time::timeout;

use crate::cancellation::CancellationSignal;
use crate::resource_admission::ExecutionResourceKey;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResourceAdmissionError {
    Busy,
    Cancelled,
    Saturated,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResourceAdmissionBuildError {
    InvalidMaxSlots,
    InvalidWaitTimeout,
}

pub struct TokioResourceAdmission {
    slots: Mutex<HashMap<ExecutionResourceKey, Weak<Semaphore>>>,
    max_slots: usize,
    wait_timeout: Duration,
}

impl TokioResourceAdmission {
    pub fn new(
        max_slots: usize,
        wait_timeout: Duration,
    ) -> Result<Self, ResourceAdmissionBuildError> {
        if max_slots == 0 || max_slots > u32::MAX as usize {
            return Err(ResourceAdmissionBuildError::InvalidMaxSlots);
        }
        if wait_timeout.is_zero() {
            return Err(ResourceAdmissionBuildError::InvalidWaitTimeout);
        }
        Ok(Self {
            slots: Mutex::new(HashMap::new()),
            max_slots,
            wait_timeout,
        })
    }

    pub async fn acquire(
        &self,
        key: ExecutionResourceKey,
        cancellation: &CancellationSignal,
    ) -> Result<OwnedSemaphorePermit, ResourceAdmissionError> {
        let slot = {
            let mut slots = self
                .slots
                .lock()
                .map_err(|_| ResourceAdmissionError::Unavailable)?;
            slots.retain(|_, slot| slot.strong_count() > 0);
            if let Some(slot) = slots.get(&key).and_then(Weak::upgrade) {
                slot
            } else {
                if slots.len() >= self.max_slots {
                    return Err(ResourceAdmissionError::Saturated);
                }
                let slot = Arc::new(Semaphore::new(1));
                slots.insert(key, Arc::downgrade(&slot));
                slot
            }
        };
        tokio::select! {
            biased;
            cancellation = cancellation.cancelled() => match cancellation {
                Ok(()) => Err(ResourceAdmissionError::Cancelled),
                Err(_) => Err(ResourceAdmissionError::Unavailable),
            },
            result = timeout(self.wait_timeout, slot.acquire_owned()) => {
                result
                    .map_err(|_| ResourceAdmissionError::Busy)?
                    .map_err(|_| ResourceAdmissionError::Unavailable)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::cancellation::{
        ActiveCommandRegistration, ActiveCommandRegistry, CancellationRequestResult,
    };
    use crate::protocol::{Request, RequestMetadata};

    #[tokio::test]
    async fn keyed_slots_are_exclusive_bounded_and_recover_after_release() {
        let admission =
            TokioResourceAdmission::new(1, Duration::from_millis(5)).expect("bounded scheduler");
        let camera_1 = resource_key("camera-1");
        let camera_2 = resource_key("camera-2");
        let active = CancellationSignal::pending();

        let first = admission
            .acquire(camera_1.clone(), &active)
            .await
            .expect("first camera permit");
        assert!(matches!(
            admission.acquire(camera_1, &active).await,
            Err(ResourceAdmissionError::Busy)
        ));
        assert!(matches!(
            admission.acquire(camera_2.clone(), &active).await,
            Err(ResourceAdmissionError::Saturated)
        ));

        drop(first);
        assert!(admission.acquire(camera_2, &active).await.is_ok());
    }

    #[tokio::test]
    async fn cancellation_removes_a_waiter_before_resource_entry() {
        let admission = Arc::new(
            TokioResourceAdmission::new(1, Duration::from_secs(1)).expect("bounded scheduler"),
        );
        let key = resource_key("camera-1");
        let active = CancellationSignal::pending();
        let first = admission
            .acquire(key.clone(), &active)
            .await
            .expect("first permit");
        let registry = ActiveCommandRegistry::default();
        let handle = match registry.register(Some("waiting-command"), Some("waiting-cancel")) {
            ActiveCommandRegistration::Registered(handle) => handle,
            _ => panic!("waiting command registered"),
        };
        let cancellation = handle.cancellation_signal();
        let waiting_admission = Arc::clone(&admission);
        let waiting_key = key.clone();
        let waiting_signal = cancellation.clone();
        let waiting = tokio::spawn(async move {
            waiting_admission
                .acquire(waiting_key, &waiting_signal)
                .await
        });
        tokio::task::yield_now().await;

        assert_eq!(
            registry.request_cancellation("waiting-command", "waiting-cancel"),
            CancellationRequestResult::Accepted
        );
        assert!(matches!(
            waiting.await.expect("waiting task"),
            Err(ResourceAdmissionError::Cancelled)
        ));
        drop(first);
        assert!(admission.acquire(key, &active).await.is_ok());
    }

    fn resource_key(device_id: &str) -> ExecutionResourceKey {
        ExecutionResourceKey::for_request(&Request {
            id: Some(device_id.to_string()),
            method: "camera.capture".to_string(),
            params: json!({ "device_id": device_id }),
            metadata: RequestMetadata::default(),
        })
        .expect("camera resource key")
    }
}
