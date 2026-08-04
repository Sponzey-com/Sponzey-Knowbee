use std::time::{SystemTime, UNIX_EPOCH};

use knowbee_yeonjang::artifact_lifecycle::{
    ArtifactBinding, ArtifactCleanupStatus, ArtifactLifecycleState,
};
use knowbee_yeonjang::artifact_repository::{ArtifactLifecycleRead, ArtifactRepositoryResult};
use knowbee_yeonjang::artifact_runtime_composition::{
    ArtifactRuntimeBuildError, ArtifactRuntimeComposition, ArtifactRuntimeConfig,
};
use knowbee_yeonjang::artifact_sink::{
    CaptureArtifactBinding, CaptureArtifactError, CaptureArtifactKind, CaptureArtifactSink,
};

const MAX_STORAGE_BYTES: usize = 4 * 1024 * 1024;

#[test]
fn bootstrap_rejects_relative_capture_root_before_activation() {
    let config = ArtifactRuntimeConfig::new(
        "relative-root",
        "yeonjang-main",
        8,
        MAX_STORAGE_BYTES,
        600_000,
    );

    assert!(matches!(
        ArtifactRuntimeComposition::bootstrap(config, 1_000),
        Err(ArtifactRuntimeBuildError::ArtifactRoot(_))
    ));
}

#[test]
fn restart_recovers_expired_lifecycle_before_returning_composition() {
    let root = temporary_root("recover");
    let config = ArtifactRuntimeConfig::new(&root, "yeonjang-main", 8, MAX_STORAGE_BYTES, 600_000);
    let runtime =
        ArtifactRuntimeComposition::bootstrap(config.clone(), 1_000).expect("initial bootstrap");
    let binding = binding('a');
    assert!(matches!(
        runtime.lifecycle_store().register(binding.clone()),
        ArtifactRepositoryResult::Registered { .. }
    ));
    drop(runtime);

    let restarted =
        ArtifactRuntimeComposition::bootstrap(config, 601_000).expect("recovered bootstrap");
    assert!(matches!(
        restarted.lifecycle_store().read(binding.artifact_ref()),
        ArtifactLifecycleRead::Found(lifecycle)
            if matches!(lifecycle.state(), ArtifactLifecycleState::Expired { .. })
                && lifecycle.cleanup_status()
                    == ArtifactCleanupStatus::Completed { completed_at_ms: 601_000 }
    ));
    assert_eq!(restarted.recovery_report().completed, 1);

    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn deferred_cleanup_blocks_activation_instead_of_subscribing_with_split_state() {
    let root = temporary_root("deferred");
    let config = ArtifactRuntimeConfig::new(&root, "yeonjang-main", 8, MAX_STORAGE_BYTES, 600_000);
    let runtime =
        ArtifactRuntimeComposition::bootstrap(config.clone(), 1_000).expect("initial bootstrap");
    let capture_binding = CaptureArtifactBinding::new(
        "command-deferred",
        "operation-deferred",
        "session-deferred",
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "idempotency-deferred",
    )
    .expect("capture binding");
    let lease = runtime
        .artifact_store()
        .allocate(CaptureArtifactKind::CameraJpeg, &capture_binding)
        .expect("artifact lease");
    let artifact_directory = lease
        .output_path()
        .parent()
        .expect("lease directory")
        .to_path_buf();
    let artifact_ref = format!(
        "capture:{}",
        artifact_directory
            .file_name()
            .and_then(|name| name.to_str())
            .expect("lease identifier")
    );
    let binding = binding_with_ref(artifact_ref);
    assert!(matches!(
        runtime.lifecycle_store().register(binding),
        ArtifactRepositoryResult::Registered { .. }
    ));
    std::fs::write(artifact_directory.join("unexpected.bin"), b"not removable")
        .expect("unexpected entry");
    std::mem::forget(lease);
    drop(runtime);

    assert!(matches!(
        ArtifactRuntimeComposition::bootstrap(config, 601_000),
        Err(ArtifactRuntimeBuildError::RecoveryDeferred { count: 1 })
    ));

    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn restart_removes_post_checked_file_that_crashed_before_durable_registration() {
    let root = temporary_root("orphan");
    let config = ArtifactRuntimeConfig::new(&root, "yeonjang-main", 8, MAX_STORAGE_BYTES, 600_000);
    let runtime =
        ArtifactRuntimeComposition::bootstrap(config.clone(), 1_000).expect("initial bootstrap");
    let lease = runtime
        .artifact_store()
        .allocate(
            CaptureArtifactKind::ScreenPng,
            &CaptureArtifactBinding::new(
                "command-orphan",
                "operation-orphan",
                "session-orphan",
                "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                "idempotency-orphan",
            )
            .expect("capture binding"),
        )
        .expect("artifact lease");
    std::fs::write(lease.output_path(), one_pixel_png()).expect("artifact bytes");
    let orphan_ref = lease
        .commit()
        .expect("artifact commit")
        .artifact_ref()
        .to_string();
    drop(runtime);

    let restarted = ArtifactRuntimeComposition::bootstrap(config, 1_100).expect("orphan recovery");
    assert_eq!(restarted.recovery_report().orphan_completed, 1);
    assert!(matches!(
        restarted.artifact_store().resolve(&orphan_ref),
        Err(CaptureArtifactError::ArtifactMissing)
    ));

    let _ = std::fs::remove_dir_all(root);
}

fn binding(character: char) -> ArtifactBinding {
    binding_with_ref(format!("capture:{}", character.to_string().repeat(64)))
}

fn binding_with_ref(artifact_ref: String) -> ArtifactBinding {
    ArtifactBinding::new(
        artifact_ref,
        "requester-a",
        "request-a",
        "operation-a",
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        1,
        1_000,
        601_000,
    )
    .expect("binding")
}

fn temporary_root(label: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!(
        "knowbee-artifact-runtime-{label}-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos()
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
