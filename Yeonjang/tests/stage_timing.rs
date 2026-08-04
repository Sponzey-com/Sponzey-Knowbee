//! Contract tests for bounded, path-free direct MQTT stage evidence.

use std::sync::atomic::{AtomicI64, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use knowbee_yeonjang::stage_timing::{
    RuntimeStage, StageTimingClock, StageTimingError, StageTimingEvidence, StageTimingRecorder,
    StageTimingSink, StageTimingWriteError,
};
use serde_json::json;

const CORRELATION: &str = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

#[test]
fn direct_mqtt_stage_inventory_is_closed_and_ordered() {
    assert_eq!(
        RuntimeStage::ALL,
        [
            RuntimeStage::Queue,
            RuntimeStage::Authorization,
            RuntimeStage::Handler,
            RuntimeStage::PostCheck,
            RuntimeStage::Publish,
            RuntimeStage::Transfer,
            RuntimeStage::Acknowledgement,
        ]
    );
}

#[test]
fn timing_evidence_binds_safe_correlation_and_both_clock_domains() {
    let evidence = StageTimingEvidence::new(RuntimeStage::Handler, CORRELATION, 1_000, 1_001, 850)
        .expect("valid timing evidence");

    assert_eq!(evidence.stage(), RuntimeStage::Handler);
    assert_eq!(evidence.correlation_id(), CORRELATION);
    assert_eq!(evidence.started_at_ms(), 1_000);
    assert_eq!(evidence.completed_at_ms(), 1_001);
    assert_eq!(evidence.duration_us(), 850);
    assert_eq!(
        serde_json::to_value(evidence).expect("serialize timing evidence"),
        json!({
            "schema_version": 1,
            "stage": "handler",
            "correlation_id": CORRELATION,
            "started_at_ms": 1_000,
            "completed_at_ms": 1_001,
            "duration_us": 850
        })
    );
}

#[test]
fn timing_evidence_rejects_unbound_or_contradictory_values() {
    assert_eq!(
        StageTimingEvidence::new(RuntimeStage::Queue, "request-raw", 1_000, 1_001, 500),
        Err(StageTimingError::InvalidCorrelation)
    );
    assert_eq!(
        StageTimingEvidence::new(RuntimeStage::Queue, CORRELATION, 1_001, 1_000, 500),
        Err(StageTimingError::InvalidWallTime)
    );
    assert_eq!(
        StageTimingEvidence::new(RuntimeStage::Queue, CORRELATION, 1_000, 1_000, 1_001),
        Err(StageTimingError::InvalidDuration)
    );
}

#[test]
fn recorder_uses_injected_clocks_and_sink_without_owning_outcome() {
    let clock = Arc::new(TestClock::new(5_000, 1_000_000));
    let sink = Arc::new(RecordingSink::default());
    let recorder = StageTimingRecorder::new(clock.clone(), sink.clone());
    let span = recorder
        .start(RuntimeStage::PostCheck, CORRELATION)
        .expect("start stage timing");
    clock.advance(2, 1_250);

    let evidence = span.complete().expect("complete stage timing");

    assert_eq!(evidence.duration_us(), 1_250);
    assert_eq!(sink.values(), vec![evidence]);
}

struct TestClock {
    wall_ms: AtomicI64,
    monotonic_us: AtomicU64,
}

impl TestClock {
    fn new(wall_ms: i64, monotonic_us: u64) -> Self {
        Self {
            wall_ms: AtomicI64::new(wall_ms),
            monotonic_us: AtomicU64::new(monotonic_us),
        }
    }

    fn advance(&self, wall_ms: i64, monotonic_us: u64) {
        self.wall_ms.fetch_add(wall_ms, Ordering::SeqCst);
        self.monotonic_us.fetch_add(monotonic_us, Ordering::SeqCst);
    }
}

impl StageTimingClock for TestClock {
    fn wall_time_ms(&self) -> i64 {
        self.wall_ms.load(Ordering::SeqCst)
    }

    fn monotonic_time_us(&self) -> u64 {
        self.monotonic_us.load(Ordering::SeqCst)
    }
}

#[derive(Default)]
struct RecordingSink {
    values: Mutex<Vec<StageTimingEvidence>>,
}

impl RecordingSink {
    fn values(&self) -> Vec<StageTimingEvidence> {
        self.values.lock().expect("timing values").clone()
    }
}

impl StageTimingSink for RecordingSink {
    fn record(&self, evidence: StageTimingEvidence) -> Result<(), StageTimingWriteError> {
        self.values
            .lock()
            .map_err(|_| StageTimingWriteError::Unavailable)?
            .push(evidence);
        Ok(())
    }
}
