//! Infrastructure contract for bounded stage-duration Product evidence.

use std::io::{self, Write};
use std::sync::{Arc, Mutex};

use knowbee_yeonjang::stage_timing::{
    RuntimeStage, StageTimingEvidence, StageTimingSink, StageTimingWriteError,
};
use knowbee_yeonjang::stage_timing_jsonl::JsonlStageTimingSink;

const CORRELATION: &str = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

#[test]
fn jsonl_sink_writes_bounded_path_free_product_evidence() {
    let bytes = Arc::new(Mutex::new(Vec::new()));
    let sink = JsonlStageTimingSink::new(Box::new(SharedWriter(bytes.clone())), 1)
        .expect("JSONL stage sink");
    let evidence = StageTimingEvidence::new(RuntimeStage::Queue, CORRELATION, 1_000, 1_001, 500)
        .expect("timing evidence");

    sink.record(evidence).expect("first row");
    assert_eq!(
        sink.record(
            StageTimingEvidence::new(RuntimeStage::Publish, CORRELATION, 1_001, 1_002, 500)
                .expect("second evidence")
        ),
        Err(StageTimingWriteError::Saturated)
    );

    let output = String::from_utf8(bytes.lock().expect("output").clone()).expect("UTF-8");
    let row: serde_json::Value = serde_json::from_str(output.trim_end()).expect("one JSONL row");
    assert_eq!(row["log_class"], "product");
    assert_eq!(row["event"], "yeonjang.stage_duration");
    assert_eq!(row["evidence"]["stage"], "queue");
    assert_eq!(row["evidence"]["correlation_id"], CORRELATION);
    assert!(row.get("path").is_none());
    assert!(row.get("payload").is_none());
}

struct SharedWriter(Arc<Mutex<Vec<u8>>>);

impl Write for SharedWriter {
    fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
        self.0
            .lock()
            .map_err(|_| io::Error::other("output unavailable"))?
            .write(buffer)
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
