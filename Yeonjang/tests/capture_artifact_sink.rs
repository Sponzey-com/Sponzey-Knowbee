use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

use knowbee_yeonjang::artifact_cleanup::{ArtifactCleanupPort, ArtifactRemovalResult};
use knowbee_yeonjang::artifact_sink::{
    CaptureArtifactBinding, CaptureArtifactError, CaptureArtifactKind, CaptureArtifactSink,
    CaptureImageFormat, FilesystemCaptureArtifactSink,
};
use knowbee_yeonjang::artifact_transfer_use_case::VerifiedArtifactSource;

#[test]
fn filesystem_sink_owns_exact_operation_path_and_cleans_uncommitted_artifacts() {
    let root = unique_root("lease");
    let sink = FilesystemCaptureArtifactSink::new(&root).expect("configured sink");
    let binding = binding("operation-camera-1");
    let lease = sink
        .allocate(CaptureArtifactKind::CameraJpeg, &binding)
        .expect("camera lease");
    let output_path = lease.output_path().to_path_buf();
    let canonical_root = fs::canonicalize(&root).expect("canonical configured root");

    assert!(output_path.starts_with(&canonical_root));
    assert_eq!(
        output_path.extension().and_then(|value| value.to_str()),
        Some("jpg")
    );
    assert!(!format!("{lease:?}").contains(&root.display().to_string()));

    fs::write(&output_path, b"partial").expect("partial artifact");
    drop(lease);
    assert!(!output_path.exists());
    let _ = fs::remove_dir_all(root);
}

#[test]
fn filesystem_sink_fails_closed_for_duplicate_operation_and_symlink_root() {
    let root = unique_root("duplicate");
    let sink = FilesystemCaptureArtifactSink::new(&root).expect("configured sink");
    let binding = binding("operation-screen-1");
    let _lease = sink
        .allocate(CaptureArtifactKind::ScreenPng, &binding)
        .expect("first lease");
    assert!(
        sink.allocate(CaptureArtifactKind::ScreenPng, &binding)
            .is_err()
    );

    #[cfg(unix)]
    {
        let target = unique_root("target");
        let link = unique_root("link");
        fs::create_dir_all(&target).expect("target");
        std::os::unix::fs::symlink(&target, &link).expect("symlink");
        assert!(FilesystemCaptureArtifactSink::new(&link).is_err());
        let _ = fs::remove_file(link);
        let _ = fs::remove_dir_all(target);
    }

    let _ = fs::remove_dir_all(root);
}

#[test]
fn same_operation_with_distinct_exact_bindings_receives_independent_leases() {
    let root = unique_root("exact-binding");
    let sink = FilesystemCaptureArtifactSink::new(&root).expect("configured sink");
    let first = CaptureArtifactBinding::new(
        "command-1",
        "shared-operation",
        "target-session",
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "idempotency-1",
    )
    .expect("first binding");
    let second = CaptureArtifactBinding::new(
        "command-2",
        "shared-operation",
        "target-session",
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "idempotency-2",
    )
    .expect("second binding");

    let first_lease = sink
        .allocate(CaptureArtifactKind::CameraJpeg, &first)
        .expect("first lease");
    let second_lease = sink
        .allocate(CaptureArtifactKind::CameraJpeg, &second)
        .expect("second lease");
    assert_ne!(first_lease.output_path(), second_lease.output_path());

    drop(first_lease);
    drop(second_lease);
    let _ = fs::remove_dir_all(root);
}

#[test]
fn committed_artifact_has_bounded_reference_and_explicit_delivery_cleanup() {
    let root = unique_root("commit");
    let sink = FilesystemCaptureArtifactSink::new(&root).expect("configured sink");
    let binding = binding("operation-screen-commit");
    let lease = sink
        .allocate(CaptureArtifactKind::ScreenPng, &binding)
        .expect("screen lease");
    fs::write(lease.output_path(), one_pixel_png()).expect("capture artifact");

    let committed = lease.commit().expect("verified artifact");
    let artifact_ref = committed.artifact_ref().to_string();
    let output_path = committed.output_path().to_path_buf();
    assert!(artifact_ref.starts_with("capture:"));
    assert_eq!(committed.size_bytes(), one_pixel_png().len() as u64);
    assert_eq!(committed.metadata().format(), CaptureImageFormat::Png);
    assert_eq!(
        (committed.metadata().width(), committed.metadata().height()),
        (1, 1)
    );
    assert!(committed.metadata().sha256_digest().starts_with("sha256:"));
    assert!(!format!("{committed:?}").contains(&root.display().to_string()));
    assert!(output_path.exists());

    drop(committed);
    let restarted_sink = FilesystemCaptureArtifactSink::new(&root).expect("restarted sink");
    let verified = restarted_sink
        .read_verified(&artifact_ref)
        .expect("path-free verified source");
    assert_eq!(verified.bytes(), one_pixel_png());
    assert_eq!(verified.metadata().format(), CaptureImageFormat::Png);
    assert!(!format!("{verified:?}").contains("PNG"));
    let resolved = restarted_sink
        .resolve(&artifact_ref)
        .expect("opaque delivery resolution");
    assert_eq!(resolved.output_path(), output_path);
    resolved.remove().expect("delivery cleanup");
    assert!(!output_path.exists());
    let _ = fs::remove_dir_all(root);
}

#[test]
fn restart_detects_tampered_bytes_and_wrong_kind_before_delivery() {
    let root = unique_root("tamper");
    let sink = FilesystemCaptureArtifactSink::new(&root).expect("configured sink");
    let screen_binding = binding("operation-screen-tamper");
    let lease = sink
        .allocate(CaptureArtifactKind::ScreenPng, &screen_binding)
        .expect("screen lease");
    fs::write(lease.output_path(), one_pixel_png()).expect("capture artifact");
    let committed = lease.commit().expect("verified artifact");
    let artifact_ref = committed.artifact_ref().to_string();
    let output_path = committed.output_path().to_path_buf();
    drop(committed);

    let mut changed = one_pixel_png().to_vec();
    let last = changed.len() - 1;
    changed[last] ^= 1;
    fs::write(&output_path, changed).expect("tamper fixture");
    assert_eq!(
        sink.resolve(&artifact_ref).err(),
        Some(CaptureArtifactError::ArtifactDigestMismatch)
    );
    fs::write(&output_path, one_pixel_png()).expect("restore fixture");
    sink.resolve(&artifact_ref)
        .expect("restored artifact")
        .remove()
        .expect("cleanup");

    let camera_binding = binding("operation-camera-wrong-kind");
    let camera_lease = sink
        .allocate(CaptureArtifactKind::CameraJpeg, &camera_binding)
        .expect("camera lease");
    fs::write(camera_lease.output_path(), one_pixel_png()).expect("wrong kind fixture");
    assert_eq!(
        camera_lease.commit().err(),
        Some(CaptureArtifactError::ArtifactWrongFormat)
    );
    let _ = fs::remove_dir_all(root);
}

#[test]
fn cleanup_port_removes_only_exact_contained_artifact_and_missing_is_idempotent() {
    let root = unique_root("cleanup-port");
    let sink = FilesystemCaptureArtifactSink::new(&root).expect("configured sink");
    let lease = sink
        .allocate(
            CaptureArtifactKind::ScreenPng,
            &binding("operation-cleanup-port"),
        )
        .expect("lease");
    fs::write(lease.output_path(), one_pixel_png()).expect("capture artifact");
    let committed = lease.commit().expect("commit");
    let artifact_ref = committed.artifact_ref().to_string();
    let output_path = committed.output_path().to_path_buf();
    drop(committed);

    assert_eq!(sink.remove(&artifact_ref), ArtifactRemovalResult::Removed);
    assert!(!output_path.exists());
    assert_eq!(
        sink.remove(&artifact_ref),
        ArtifactRemovalResult::AlreadyMissing
    );
    assert_eq!(
        sink.remove("capture:not-a-digest"),
        ArtifactRemovalResult::Rejected
    );

    #[cfg(unix)]
    {
        let outside = unique_root("cleanup-outside");
        fs::create_dir_all(&outside).expect("outside");
        let digest = "c".repeat(64);
        std::os::unix::fs::symlink(&outside, root.join(&digest)).expect("lease symlink");
        assert_eq!(
            sink.remove(&format!("capture:{digest}")),
            ArtifactRemovalResult::Rejected
        );
        fs::remove_file(root.join(digest)).expect("remove symlink");
        fs::remove_dir_all(outside).expect("remove outside");
    }
    fs::remove_dir_all(root).expect("remove root");
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

fn unique_root(label: &str) -> std::path::PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    std::env::temp_dir().join(format!(
        "knowbee-artifact-sink-{label}-{}-{stamp}",
        std::process::id()
    ))
}

fn one_pixel_png() -> &'static [u8] {
    &[
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
        0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8,
        0xcf, 0xc0, 0xf0, 0x1f, 0x00, 0x05, 0x00, 0x01, 0xff, 0x89, 0x99, 0x3d, 0x1d, 0x00, 0x00,
        0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]
}
