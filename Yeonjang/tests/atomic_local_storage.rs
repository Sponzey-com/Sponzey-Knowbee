use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};

use knowbee_yeonjang::atomic_local_storage::{
    AtomicLocalStorage, LocalStorageBackupResult, LocalStorageBuildError, LocalStorageHealth,
    LocalStorageRollbackResult,
};
use knowbee_yeonjang::durable_completed_store::{
    DurableRecordStorage, RawStoreRead, RawStoreWrite,
};
use knowbee_yeonjang::durable_response_archive::{
    RawResponseArchiveRead, RawResponseArchiveStorage, RawResponseArchiveWrite,
};

static TEMP_SEQUENCE: AtomicUsize = AtomicUsize::new(0);

#[test]
fn exact_path_storage_is_non_destructive_and_survives_restart() {
    let paths = TempStoragePaths::new("restart");
    let storage =
        AtomicLocalStorage::open(paths.data.clone(), paths.lock.clone(), 4096).expect("storage");
    assert_eq!(storage.health(), LocalStorageHealth::Missing);
    assert!(matches!(
        DurableRecordStorage::read(&storage),
        RawStoreRead::Missing { revision: 0 }
    ));
    assert!(!paths.data.exists());

    assert_eq!(
        DurableRecordStorage::compare_and_swap(&storage, 0, vec![br#"{"record":"one"}"#.to_vec()]),
        RawStoreWrite::Written { revision: 1 }
    );
    let restarted =
        AtomicLocalStorage::open(paths.data.clone(), paths.lock.clone(), 4096).expect("restart");
    assert!(matches!(
        DurableRecordStorage::read(&restarted),
        RawStoreRead::Records {
            revision: 1,
            records
        } if records == vec![br#"{"record":"one"}"#.to_vec()]
    ));
}

#[test]
fn stale_instance_conflict_does_not_overwrite_committed_entries() {
    let paths = TempStoragePaths::new("conflict");
    let first =
        AtomicLocalStorage::open(paths.data.clone(), paths.lock.clone(), 4096).expect("first");
    let stale =
        AtomicLocalStorage::open(paths.data.clone(), paths.lock.clone(), 4096).expect("stale");

    assert!(matches!(
        DurableRecordStorage::read(&first),
        RawStoreRead::Missing { revision: 0 }
    ));
    assert!(matches!(
        DurableRecordStorage::read(&stale),
        RawStoreRead::Missing { revision: 0 }
    ));
    assert_eq!(
        DurableRecordStorage::compare_and_swap(&first, 0, vec![b"first".to_vec()]),
        RawStoreWrite::Written { revision: 1 }
    );
    assert_eq!(
        DurableRecordStorage::compare_and_swap(&stale, 0, vec![b"stale".to_vec()]),
        RawStoreWrite::Conflict
    );
    assert!(matches!(
        DurableRecordStorage::read(&stale),
        RawStoreRead::Records {
            revision: 1,
            records
        } if records == vec![b"first".to_vec()]
    ));
}

#[test]
fn same_exact_path_adapter_supports_the_response_archive_raw_contract() {
    let paths = TempStoragePaths::new("response");
    let storage =
        AtomicLocalStorage::open(paths.data.clone(), paths.lock.clone(), 4096).expect("storage");
    assert_eq!(
        RawResponseArchiveStorage::compare_and_swap(
            &storage,
            0,
            vec![br#"{"response":"one"}"#.to_vec()]
        ),
        RawResponseArchiveWrite::Written { revision: 1 }
    );
    assert!(matches!(
        RawResponseArchiveStorage::read(&storage),
        RawResponseArchiveRead::Entries {
            revision: 1,
            entries
        } if entries == vec![br#"{"response":"one"}"#.to_vec()]
    ));
}

#[test]
fn corrupt_oversized_or_symlink_target_fails_closed() {
    let corrupt = TempStoragePaths::new("corrupt");
    fs::write(&corrupt.data, b"{partial").expect("corrupt fixture");
    assert_eq!(
        AtomicLocalStorage::open(corrupt.data.clone(), corrupt.lock.clone(), 4096)
            .err()
            .expect("corrupt file"),
        LocalStorageBuildError::Corrupt
    );

    let oversized = TempStoragePaths::new("oversized");
    fs::write(&oversized.data, vec![b'x'; 65]).expect("oversized fixture");
    assert_eq!(
        AtomicLocalStorage::open(oversized.data.clone(), oversized.lock.clone(), 64)
            .err()
            .expect("oversized file"),
        LocalStorageBuildError::TooLarge
    );

    #[cfg(unix)]
    {
        let symlink = TempStoragePaths::new("symlink");
        let target = symlink.root.join("target.json");
        fs::write(&target, b"{}").expect("symlink target");
        std::os::unix::fs::symlink(&target, &symlink.data).expect("data symlink");
        assert_eq!(
            AtomicLocalStorage::open(symlink.data.clone(), symlink.lock.clone(), 4096)
                .err()
                .expect("symlink rejected"),
            LocalStorageBuildError::UnsafePath
        );
    }
}

#[test]
fn unsupported_schema_is_distinct_and_explicit_backup_rollback_preserves_primary() {
    let paths = TempStoragePaths::new("rollback");
    let backup = paths.root.join("durable.backup");
    let storage =
        AtomicLocalStorage::open(paths.data.clone(), paths.lock.clone(), 4096).expect("storage");
    assert_eq!(
        DurableRecordStorage::compare_and_swap(&storage, 0, vec![b"stable".to_vec()]),
        RawStoreWrite::Written { revision: 1 }
    );
    let stable_primary = fs::read(&paths.data).expect("stable primary");
    assert_eq!(
        storage.create_backup(backup.clone()),
        LocalStorageBackupResult::Created
    );
    assert_eq!(
        storage.create_backup(backup.clone()),
        LocalStorageBackupResult::AlreadyExists
    );
    assert_eq!(fs::read(&backup).expect("backup bytes"), stable_primary);

    fs::write(&paths.data, b"{partial").expect("corrupt primary");
    assert_eq!(
        AtomicLocalStorage::rollback_from_backup(
            paths.data.clone(),
            paths.lock.clone(),
            backup.clone(),
            4096,
        ),
        LocalStorageRollbackResult::Restored
    );
    assert_eq!(
        fs::read(&paths.data).expect("restored primary"),
        stable_primary
    );

    let unsupported = TempStoragePaths::new("unsupported");
    let storage =
        AtomicLocalStorage::open(unsupported.data.clone(), unsupported.lock.clone(), 4096)
            .expect("unsupported fixture storage");
    assert_eq!(
        DurableRecordStorage::compare_and_swap(&storage, 0, vec![b"versioned".to_vec()]),
        RawStoreWrite::Written { revision: 1 }
    );
    let encoded = fs::read_to_string(&unsupported.data).expect("versioned envelope");
    fs::write(
        &unsupported.data,
        encoded.replace("\"schemaVersion\":1", "\"schemaVersion\":9"),
    )
    .expect("unsupported fixture");
    assert_eq!(
        AtomicLocalStorage::open(unsupported.data.clone(), unsupported.lock.clone(), 4096)
            .err()
            .expect("unsupported schema"),
        LocalStorageBuildError::UnsupportedVersion
    );
}

struct TempStoragePaths {
    root: PathBuf,
    data: PathBuf,
    lock: PathBuf,
}

impl TempStoragePaths {
    fn new(label: &str) -> Self {
        let sequence = TEMP_SEQUENCE.fetch_add(1, Ordering::SeqCst);
        let root = std::env::temp_dir().join(format!(
            "knowbee-atomic-storage-{}-{label}-{sequence}",
            std::process::id()
        ));
        fs::create_dir(&root).expect("isolated temp directory");
        let root = fs::canonicalize(root).expect("canonical temp directory");
        Self {
            data: root.join("durable.json"),
            lock: root.join("durable.lock"),
            root,
        }
    }
}

impl Drop for TempStoragePaths {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.root).expect("remove isolated temp directory");
    }
}
