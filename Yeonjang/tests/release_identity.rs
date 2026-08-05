use std::time::{SystemTime, UNIX_EPOCH};

use knowbee_yeonjang::release_identity::{
    RELEASE_IDENTITY_SCHEMA_ID, ReleaseBinaryIdentity, ReleaseIdentityError,
};

#[test]
fn explicit_binary_identity_is_versioned_path_free_and_content_bound() {
    let root = std::env::temp_dir().join(format!(
        "knowbee-release-identity-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos()
    ));
    std::fs::create_dir_all(&root).expect("test root");
    let binary = root.join("private-build-name");
    std::fs::write(&binary, b"abc").expect("binary fixture");

    let identity =
        ReleaseBinaryIdentity::from_path(&binary, "9.8.7", "macos", "aarch64").expect("identity");
    assert_eq!(identity.schema_id(), RELEASE_IDENTITY_SCHEMA_ID);
    assert_eq!(identity.schema_version(), 1);
    assert_eq!(identity.package_version(), "9.8.7");
    assert_eq!(identity.target_os(), "macos");
    assert_eq!(identity.target_arch(), "aarch64");
    assert_eq!(identity.binary_size_bytes(), 3);
    assert_eq!(
        identity.binary_sha256(),
        "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    let json = serde_json::to_string(&identity).expect("identity JSON");
    assert!(!json.contains("private-build-name"));
    assert!(!json.contains(root.to_string_lossy().as_ref()));

    assert_eq!(
        ReleaseBinaryIdentity::from_path(&root, "9.8.7", "macos", "aarch64"),
        Err(ReleaseIdentityError::NotRegularFile)
    );
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn invalid_public_identity_fields_fail_before_file_access() {
    let missing = std::path::Path::new("/does/not/exist");
    assert_eq!(
        ReleaseBinaryIdentity::from_path(missing, "", "macos", "aarch64"),
        Err(ReleaseIdentityError::InvalidPackageVersion)
    );
    assert_eq!(
        ReleaseBinaryIdentity::from_path(missing, "1.0.0", "unknown", "aarch64"),
        Err(ReleaseIdentityError::InvalidTarget)
    );
}

#[test]
fn packaged_executable_reports_the_bytes_that_are_actually_loaded() {
    let executable = std::path::Path::new(env!("CARGO_BIN_EXE_knowbee-yeonjang"));
    let output = std::process::Command::new(executable)
        .arg("--release-identity")
        .output()
        .expect("release identity process");
    assert!(output.status.success());
    assert!(output.stderr.is_empty());

    let value: serde_json::Value =
        serde_json::from_slice(&output.stdout).expect("release identity JSON");
    let expected = ReleaseBinaryIdentity::from_path(
        executable,
        env!("CARGO_PKG_VERSION"),
        std::env::consts::OS,
        std::env::consts::ARCH,
    )
    .expect("expected loaded binary");
    assert_eq!(value["schema_id"], RELEASE_IDENTITY_SCHEMA_ID);
    assert_eq!(value["schema_version"], 1);
    assert_eq!(value["binary_sha256"], expected.binary_sha256());
    assert_eq!(
        value["binary_size_bytes"],
        serde_json::json!(expected.binary_size_bytes())
    );
    assert!(value.get("path").is_none());
}
