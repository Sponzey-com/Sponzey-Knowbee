//! Scoped resource admission for blocking OS effects owned by Tokio workers.

use std::collections::HashMap;
use std::sync::{Arc, Condvar, Mutex, Weak};
use std::time::{Duration, Instant};

use crate::execute_capability::{
    ExecutionCancellation, ExecutionClock, ExecutionResourceAdmission,
    ExecutionResourceAdmissionError, ExecutionResourcePermit,
};
use crate::platform_operation::BoundPlatformOperation;
use crate::resource_admission::ExecutionResourceKey;

const CANCELLATION_POLL: Duration = Duration::from_millis(20);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BlockingResourceAdmissionBuildError {
    InvalidMaxSlots,
}

/// Coordinates blocking camera/screen effects without blocking the Tokio event loop.
pub struct BlockingExecutionResourceAdmission {
    slots: Mutex<HashMap<ExecutionResourceKey, Weak<ResourceSlot>>>,
    max_slots: usize,
}

impl BlockingExecutionResourceAdmission {
    pub fn new(max_slots: usize) -> Result<Self, BlockingResourceAdmissionBuildError> {
        if max_slots == 0 {
            return Err(BlockingResourceAdmissionBuildError::InvalidMaxSlots);
        }
        Ok(Self {
            slots: Mutex::new(HashMap::new()),
            max_slots,
        })
    }
}

impl ExecutionResourceAdmission for BlockingExecutionResourceAdmission {
    fn acquire(
        &self,
        operation: &BoundPlatformOperation,
        cancellation: &dyn ExecutionCancellation,
        clock: &dyn ExecutionClock,
    ) -> Result<Box<dyn ExecutionResourcePermit>, ExecutionResourceAdmissionError> {
        let remaining_ms = operation
            .deadline_ms()
            .checked_sub(clock.now_ms())
            .filter(|remaining| *remaining > 0)
            .ok_or(ExecutionResourceAdmissionError::DeadlineExceeded)?;
        let remaining_ms = u64::try_from(remaining_ms)
            .map_err(|_| ExecutionResourceAdmissionError::Unavailable)?;
        let deadline = Instant::now()
            .checked_add(Duration::from_millis(remaining_ms))
            .ok_or(ExecutionResourceAdmissionError::Unavailable)?;
        let key = ExecutionResourceKey::for_operation(operation);
        let slot = {
            let mut slots = self
                .slots
                .lock()
                .map_err(|_| ExecutionResourceAdmissionError::Unavailable)?;
            slots.retain(|_, slot| slot.strong_count() > 0);
            if let Some(slot) = slots.get(&key).and_then(Weak::upgrade) {
                slot
            } else {
                if slots.len() >= self.max_slots {
                    return Err(ExecutionResourceAdmissionError::Saturated);
                }
                let slot = Arc::new(ResourceSlot::default());
                slots.insert(key, Arc::downgrade(&slot));
                slot
            }
        };
        let mut occupied = slot
            .occupied
            .lock()
            .map_err(|_| ExecutionResourceAdmissionError::Unavailable)?;
        loop {
            if cancellation.is_cancelled(operation.cancellation_id()) {
                return Err(ExecutionResourceAdmissionError::Cancelled);
            }
            if clock.now_ms() >= operation.deadline_ms() || Instant::now() >= deadline {
                return Err(ExecutionResourceAdmissionError::DeadlineExceeded);
            }
            if !*occupied {
                *occupied = true;
                drop(occupied);
                return Ok(Box::new(BlockingResourcePermit { slot }));
            }
            let wait = deadline
                .saturating_duration_since(Instant::now())
                .min(CANCELLATION_POLL);
            let (next, _) = slot
                .available
                .wait_timeout(occupied, wait)
                .map_err(|_| ExecutionResourceAdmissionError::Unavailable)?;
            occupied = next;
        }
    }
}

#[derive(Default)]
struct ResourceSlot {
    occupied: Mutex<bool>,
    available: Condvar,
}

struct BlockingResourcePermit {
    slot: Arc<ResourceSlot>,
}

impl ExecutionResourcePermit for BlockingResourcePermit {}

impl Drop for BlockingResourcePermit {
    fn drop(&mut self) {
        let mut occupied = self
            .slot
            .occupied
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        *occupied = false;
        self.slot.available.notify_one();
    }
}
