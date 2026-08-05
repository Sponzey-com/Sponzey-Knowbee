//! OS-runtime singleton filesystem adapter contract.

use std::fs::{self, File};
use std::path::PathBuf;

use knowbee_yeonjang::instance_process_lease::{
    FilesystemRuntimeLeaseProvider, RuntimeLeaseError, RuntimeLeaseGuard, RuntimeLeaseProvider,
};

fn temporary_root(label: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "knowbee-runtime-process-lease-{label}-{}",
        std::process::id()
    ))
}

#[test]
fn fixed_product_lease_is_exclusive_and_drop_releases_a_stale_artifact() {
    let root = temporary_root("exclusive");
    fs::create_dir_all(&root).expect("test root");
    let stale_path = root.join("knowbee-yeonjang-runtime-v2.lock");
    File::create(&stale_path).expect("stale lock artifact");

    let provider = FilesystemRuntimeLeaseProvider::new(root.clone()).expect("runtime lease");
    let first: RuntimeLeaseGuard = provider.acquire().expect("first runtime owner");
    assert!(matches!(
        provider.acquire(),
        Err(RuntimeLeaseError::AlreadyRunning)
    ));

    drop(first);
    provider.acquire().expect("drop returns runtime ownership");
    fs::remove_dir_all(root).expect("fixture cleanup");
}

#[cfg(unix)]
#[test]
fn runtime_lease_rejects_a_symlink_lock_file() {
    use std::os::unix::fs::symlink;

    let root = temporary_root("symlink");
    fs::create_dir_all(&root).expect("test root");
    let target = root.join("target");
    File::create(&target).expect("target");
    symlink(&target, root.join("knowbee-yeonjang-runtime-v2.lock")).expect("symlink");

    let provider = FilesystemRuntimeLeaseProvider::new(root.clone()).expect("runtime lease");
    assert!(matches!(
        provider.acquire(),
        Err(RuntimeLeaseError::UnsafeRoot)
    ));
    fs::remove_dir_all(root).expect("fixture cleanup");
}
