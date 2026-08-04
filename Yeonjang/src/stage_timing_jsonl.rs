//! Opt-in bounded JSONL adapter for stage-duration Product evidence.
//!
//! The adapter owns its writer and row budget. It emits only the typed timing
//! contract and never raw requests, responses, artifact paths, or secrets.

use std::io::{self, Write};
use std::sync::Mutex;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;

use crate::stage_timing::{
    StageTimingClock, StageTimingEvidence, StageTimingSink, StageTimingWriteError,
};

const MAX_STAGE_TIMING_ROWS: usize = 4_096;

pub struct JsonlStageTimingSink {
    state: Mutex<JsonlStageTimingState>,
}

struct JsonlStageTimingState {
    writer: Box<dyn Write + Send>,
    remaining: usize,
}

impl JsonlStageTimingSink {
    pub fn new(
        writer: Box<dyn Write + Send>,
        max_rows: usize,
    ) -> Result<Self, JsonlStageTimingBuildError> {
        if max_rows == 0 || max_rows > MAX_STAGE_TIMING_ROWS {
            return Err(JsonlStageTimingBuildError::InvalidCapacity);
        }
        Ok(Self {
            state: Mutex::new(JsonlStageTimingState {
                writer,
                remaining: max_rows,
            }),
        })
    }

    /// Uses the process diagnostic stream only when the composition root
    /// explicitly enables the stage-evidence release gate.
    pub fn stderr(max_rows: usize) -> Result<Self, JsonlStageTimingBuildError> {
        Self::new(Box::new(io::stderr()), max_rows)
    }
}

impl StageTimingSink for JsonlStageTimingSink {
    fn record(&self, evidence: StageTimingEvidence) -> Result<(), StageTimingWriteError> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| StageTimingWriteError::Unavailable)?;
        if state.remaining == 0 {
            return Err(StageTimingWriteError::Saturated);
        }
        serde_json::to_writer(
            &mut state.writer,
            &ProductStageTimingRow {
                log_class: "product",
                event: "yeonjang.stage_duration",
                evidence: &evidence,
            },
        )
        .map_err(|_| StageTimingWriteError::Unavailable)?;
        state
            .writer
            .write_all(b"\n")
            .and_then(|_| state.writer.flush())
            .map_err(|_| StageTimingWriteError::Unavailable)?;
        state.remaining -= 1;
        Ok(())
    }
}

#[derive(Serialize)]
struct ProductStageTimingRow<'a> {
    log_class: &'static str,
    event: &'static str,
    evidence: &'a StageTimingEvidence,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JsonlStageTimingBuildError {
    InvalidCapacity,
}

/// Bootstrap-owned system clock with one process-local monotonic origin.
pub struct SystemStageTimingClock {
    monotonic_origin: Instant,
}

impl SystemStageTimingClock {
    pub fn new() -> Self {
        Self {
            monotonic_origin: Instant::now(),
        }
    }
}

impl Default for SystemStageTimingClock {
    fn default() -> Self {
        Self::new()
    }
}

impl StageTimingClock for SystemStageTimingClock {
    fn wall_time_ms(&self) -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .ok()
            .and_then(|duration| i64::try_from(duration.as_millis()).ok())
            .unwrap_or(i64::MAX)
    }

    fn monotonic_time_us(&self) -> u64 {
        u64::try_from(self.monotonic_origin.elapsed().as_micros()).unwrap_or(u64::MAX)
    }
}
