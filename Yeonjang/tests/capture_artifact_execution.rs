#[path = "support/system_info_test_backend.rs"]
mod system_info_test_backend;

use std::sync::{Arc, atomic::AtomicBool};
use std::time::{SystemTime, UNIX_EPOCH};

use knowbee_yeonjang::artifact_sink::{
    CaptureArtifactBinding, CaptureArtifactSink, FilesystemCaptureArtifactSink,
    execute_camera_capture, execute_screen_capture,
};
use knowbee_yeonjang::automation::{CameraCaptureRequest, ScreenCaptureRequest};
use system_info_test_backend::SystemInfoTestBackend;

#[test]
fn camera_use_case_returns_only_an_opaque_artifact_reference() {
    let root = std::env::temp_dir().join(format!(
        "knowbee-camera-use-case-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos()
    ));
    let sink = FilesystemCaptureArtifactSink::new(&root).expect("configured sink");
    let backend = SystemInfoTestBackend::default();
    let binding = binding("operation-camera-use-case");

    let result = execute_camera_capture(
        &sink,
        &backend,
        CameraCaptureRequest {
            device_id: None,
            output_path: None,
            inline_base64: false,
            capture_timeout_ms: Some(1_000),
            cancellation: Arc::new(AtomicBool::new(false)),
        },
        &binding,
    )
    .expect("capture result");

    assert_eq!(backend.camera_capture_calls(), 1);
    assert!(result.output_path.is_none());
    let artifact_ref = result.artifact_ref.expect("opaque artifact reference");
    let artifact = sink.resolve(&artifact_ref).expect("delivery resolution");
    artifact.remove().expect("delivery cleanup");
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn screen_use_case_returns_only_an_opaque_artifact_reference() {
    let root = std::env::temp_dir().join(format!(
        "knowbee-screen-use-case-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos()
    ));
    let sink = FilesystemCaptureArtifactSink::new(&root).expect("configured sink");
    let backend = SystemInfoTestBackend::default();
    let binding = binding("operation-screen-use-case");

    let result = execute_screen_capture(
        &sink,
        &backend,
        ScreenCaptureRequest {
            display: Some(0),
            output_path: None,
            inline_base64: false,
        },
        &binding,
    )
    .expect("capture result");

    assert!(result.output_path.is_none());
    let artifact_ref = result.artifact_ref.expect("opaque artifact reference");
    let artifact = sink.resolve(&artifact_ref).expect("delivery resolution");
    artifact.remove().expect("delivery cleanup");
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn inline_camera_result_cleans_the_sink_lease_after_binary_handoff() {
    let root = std::env::temp_dir().join(format!(
        "knowbee-camera-inline-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos()
    ));
    let sink = FilesystemCaptureArtifactSink::new(&root).expect("configured sink");
    let backend = SystemInfoTestBackend::default();
    let binding = binding("operation-camera-inline");

    let result = execute_camera_capture(
        &sink,
        &backend,
        CameraCaptureRequest {
            device_id: None,
            output_path: None,
            inline_base64: true,
            capture_timeout_ms: Some(1_000),
            cancellation: Arc::new(AtomicBool::new(false)),
        },
        &binding,
    )
    .expect("inline capture result");

    assert!(result.base64_data.is_some());
    assert!(result.output_path.is_none());
    assert!(result.artifact_ref.is_none());
    assert_eq!(std::fs::read_dir(&root).expect("artifact root").count(), 0);
    let _ = std::fs::remove_dir_all(root);
}

fn binding(operation_id: &str) -> CaptureArtifactBinding {
    CaptureArtifactBinding::new(
        &format!("command-{operation_id}"),
        operation_id,
        "target-session",
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        &format!("idempotency-{operation_id}"),
    )
    .expect("artifact binding")
}
