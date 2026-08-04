//! Bounded observation contract for direct MQTT stage durations.
//!
//! Timing evidence is diagnostic product evidence. It binds only a SHA-256
//! correlation and never decides execution, effect, retry, or delivery state.

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const STAGE_TIMING_SCHEMA_VERSION: u16 = 1;
const MAX_STAGE_DURATION_US: u64 = 24 * 60 * 60 * 1_000_000;

/// Closed stage inventory measured by the direct MQTT package release gate.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeStage {
    Queue,
    Authorization,
    Handler,
    PostCheck,
    Publish,
    Transfer,
    #[serde(rename = "ack")]
    Acknowledgement,
}

impl RuntimeStage {
    pub const ALL: [Self; 7] = [
        Self::Queue,
        Self::Authorization,
        Self::Handler,
        Self::PostCheck,
        Self::Publish,
        Self::Transfer,
        Self::Acknowledgement,
    ];
}

/// One stage observation using wall-clock endpoints and monotonic duration.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StageTimingEvidence {
    schema_version: u16,
    stage: RuntimeStage,
    correlation_id: String,
    started_at_ms: i64,
    completed_at_ms: i64,
    duration_us: u64,
}

impl StageTimingEvidence {
    pub fn new(
        stage: RuntimeStage,
        correlation_id: &str,
        started_at_ms: i64,
        completed_at_ms: i64,
        duration_us: u64,
    ) -> Result<Self, StageTimingError> {
        if !is_sha256_digest(correlation_id) {
            return Err(StageTimingError::InvalidCorrelation);
        }
        if started_at_ms < 0 || completed_at_ms < started_at_ms {
            return Err(StageTimingError::InvalidWallTime);
        }
        let wall_window_us = completed_at_ms
            .checked_sub(started_at_ms)
            .and_then(|delta| delta.checked_add(1))
            .and_then(|delta| u64::try_from(delta).ok())
            .and_then(|delta| delta.checked_mul(1_000))
            .ok_or(StageTimingError::InvalidWallTime)?;
        if duration_us > MAX_STAGE_DURATION_US || duration_us >= wall_window_us {
            return Err(StageTimingError::InvalidDuration);
        }
        Ok(Self {
            schema_version: STAGE_TIMING_SCHEMA_VERSION,
            stage,
            correlation_id: correlation_id.to_string(),
            started_at_ms,
            completed_at_ms,
            duration_us,
        })
    }

    pub fn stage(&self) -> RuntimeStage {
        self.stage
    }

    pub fn correlation_id(&self) -> &str {
        &self.correlation_id
    }

    pub fn started_at_ms(&self) -> i64 {
        self.started_at_ms
    }

    pub fn completed_at_ms(&self) -> i64 {
        self.completed_at_ms
    }

    pub fn duration_us(&self) -> u64 {
        self.duration_us
    }
}

/// Invalid or contradictory stage evidence rejected before observation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StageTimingError {
    InvalidCorrelation,
    InvalidWallTime,
    InvalidDuration,
}

/// Optional observation boundary implemented at the runtime composition edge.
pub trait StageTimingSink: Send + Sync {
    fn record(&self, evidence: StageTimingEvidence) -> Result<(), StageTimingWriteError>;
}

/// Observation failure never rewrites the operation's canonical outcome.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StageTimingWriteError {
    Saturated,
    Unavailable,
}

/// Injected wall and monotonic clocks keep Application timing deterministic.
pub trait StageTimingClock: Send + Sync {
    fn wall_time_ms(&self) -> i64;
    fn monotonic_time_us(&self) -> u64;
}

/// Starts exact-correlated spans and writes only completed bounded evidence.
#[derive(Clone)]
pub struct StageTimingRecorder {
    clock: Arc<dyn StageTimingClock>,
    sink: Arc<dyn StageTimingSink>,
}

impl StageTimingRecorder {
    pub fn new(clock: Arc<dyn StageTimingClock>, sink: Arc<dyn StageTimingSink>) -> Self {
        Self { clock, sink }
    }

    pub fn start(
        &self,
        stage: RuntimeStage,
        correlation_id: &str,
    ) -> Result<StageTimingSpan, StageTimingError> {
        if !is_sha256_digest(correlation_id) {
            return Err(StageTimingError::InvalidCorrelation);
        }
        Ok(StageTimingSpan {
            stage,
            correlation_id: correlation_id.to_string(),
            started_at_ms: self.clock.wall_time_ms(),
            started_at_monotonic_us: self.clock.monotonic_time_us(),
            clock: Arc::clone(&self.clock),
            sink: Arc::clone(&self.sink),
        })
    }
}

/// One explicitly completed observation; dropping it produces no fake row.
pub struct StageTimingSpan {
    stage: RuntimeStage,
    correlation_id: String,
    started_at_ms: i64,
    started_at_monotonic_us: u64,
    clock: Arc<dyn StageTimingClock>,
    sink: Arc<dyn StageTimingSink>,
}

impl StageTimingSpan {
    pub fn complete(self) -> Result<StageTimingEvidence, StageTimingRecordError> {
        let completed_at_ms = self.clock.wall_time_ms();
        let completed_at_monotonic_us = self.clock.monotonic_time_us();
        let duration_us = completed_at_monotonic_us
            .checked_sub(self.started_at_monotonic_us)
            .ok_or(StageTimingRecordError::ClockRegressed)?;
        let evidence = StageTimingEvidence::new(
            self.stage,
            &self.correlation_id,
            self.started_at_ms,
            completed_at_ms,
            duration_us,
        )
        .map_err(StageTimingRecordError::InvalidEvidence)?;
        self.sink
            .record(evidence.clone())
            .map_err(StageTimingRecordError::Write)?;
        Ok(evidence)
    }
}

/// Observation errors remain separate from the operation's canonical result.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StageTimingRecordError {
    ClockRegressed,
    InvalidEvidence(StageTimingError),
    Write(StageTimingWriteError),
}

/// Creates the path-free correlation used before an operation can be bound.
pub fn sha256_correlation(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}

/// Correlates one exact artifact transfer without exposing either identifier.
pub fn artifact_stage_correlation(artifact_ref: &str, transfer_id: &str) -> String {
    let mut bytes = Vec::with_capacity(24 + artifact_ref.len() + transfer_id.len());
    bytes.extend_from_slice(b"yeonjang-artifact-stage\0");
    bytes.extend_from_slice(artifact_ref.as_bytes());
    bytes.push(0);
    bytes.extend_from_slice(transfer_id.as_bytes());
    sha256_correlation(&bytes)
}

fn is_sha256_digest(value: &str) -> bool {
    value.len() == 71
        && value
            .strip_prefix("sha256:")
            .is_some_and(|digest| digest.bytes().all(|byte| byte.is_ascii_hexdigit()))
}
