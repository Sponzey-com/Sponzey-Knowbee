use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use fs2::FileExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::durable_completed_store::{DurableRecordStorage, RawStoreRead, RawStoreWrite};
use crate::durable_response_archive::{
    RawResponseArchiveRead, RawResponseArchiveStorage, RawResponseArchiveWrite,
};

const LOCAL_STORAGE_SCHEMA_VERSION: u16 = 1;
const MAX_LOCAL_STORAGE_BYTES: usize = 128 * 1024 * 1024;
static TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);
type StoredEntries = (u64, Vec<Vec<u8>>);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LocalStorageBuildError {
    InvalidLimit,
    UnsafePath,
    TooLarge,
    UnsupportedVersion,
    Corrupt,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LocalStorageBackupResult {
    Created,
    Missing,
    AlreadyExists,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LocalStorageRollbackResult {
    Restored,
    InvalidBackup,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LocalStorageHealth {
    Missing,
    Ready { revision: u64, entries: usize },
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LocalStorageEnvelope {
    schema_version: u16,
    revision: u64,
    entries: Vec<String>,
    digest: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalStorageVersionProbe {
    schema_version: u16,
}

pub struct AtomicLocalStorage {
    data_path: PathBuf,
    lock_path: PathBuf,
    max_file_bytes: usize,
    startup_health: LocalStorageHealth,
}

impl AtomicLocalStorage {
    pub fn open(
        data_path: PathBuf,
        lock_path: PathBuf,
        max_file_bytes: usize,
    ) -> Result<Self, LocalStorageBuildError> {
        if max_file_bytes == 0 || max_file_bytes > MAX_LOCAL_STORAGE_BYTES {
            return Err(LocalStorageBuildError::InvalidLimit);
        }
        validate_paths(&data_path, &lock_path)?;
        let startup_health = match read_envelope(&data_path, max_file_bytes)? {
            None => LocalStorageHealth::Missing,
            Some((revision, entries)) => LocalStorageHealth::Ready {
                revision,
                entries: entries.len(),
            },
        };
        Ok(Self {
            data_path,
            lock_path,
            max_file_bytes,
            startup_health,
        })
    }

    pub fn health(&self) -> LocalStorageHealth {
        self.startup_health
    }

    pub fn create_backup(&self, backup_path: PathBuf) -> LocalStorageBackupResult {
        if validate_auxiliary_path(&self.data_path, &self.lock_path, &backup_path).is_err() {
            return LocalStorageBackupResult::Unavailable;
        }
        let lock = match open_and_lock(&self.lock_path) {
            Ok(lock) => lock,
            Err(_) => return LocalStorageBackupResult::Unavailable,
        };
        if backup_path.exists() {
            let _ = FileExt::unlock(&lock);
            return LocalStorageBackupResult::AlreadyExists;
        }
        let bytes = match fs::read(&self.data_path) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                let _ = FileExt::unlock(&lock);
                return LocalStorageBackupResult::Missing;
            }
            Err(_) => {
                let _ = FileExt::unlock(&lock);
                return LocalStorageBackupResult::Unavailable;
            }
        };
        if validate_envelope_bytes(&bytes, self.max_file_bytes).is_err() {
            let _ = FileExt::unlock(&lock);
            return LocalStorageBackupResult::Unavailable;
        }
        let result = atomic_create_new(&backup_path, &bytes);
        let _ = FileExt::unlock(&lock);
        match result {
            Ok(()) => LocalStorageBackupResult::Created,
            Err(_) if backup_path.exists() => LocalStorageBackupResult::AlreadyExists,
            Err(_) => LocalStorageBackupResult::Unavailable,
        }
    }

    pub fn rollback_from_backup(
        data_path: PathBuf,
        lock_path: PathBuf,
        backup_path: PathBuf,
        max_file_bytes: usize,
    ) -> LocalStorageRollbackResult {
        if max_file_bytes == 0
            || max_file_bytes > MAX_LOCAL_STORAGE_BYTES
            || validate_paths(&data_path, &lock_path).is_err()
            || validate_auxiliary_path(&data_path, &lock_path, &backup_path).is_err()
        {
            return LocalStorageRollbackResult::Unavailable;
        }
        let lock = match open_and_lock(&lock_path) {
            Ok(lock) => lock,
            Err(_) => return LocalStorageRollbackResult::Unavailable,
        };
        let backup = match fs::read(&backup_path) {
            Ok(backup) => backup,
            Err(_) => {
                let _ = FileExt::unlock(&lock);
                return LocalStorageRollbackResult::InvalidBackup;
            }
        };
        if validate_envelope_bytes(&backup, max_file_bytes).is_err() {
            let _ = FileExt::unlock(&lock);
            return LocalStorageRollbackResult::InvalidBackup;
        }
        let result = atomic_replace(&data_path, &backup);
        let _ = FileExt::unlock(&lock);
        match result {
            Ok(()) => LocalStorageRollbackResult::Restored,
            Err(_) => LocalStorageRollbackResult::Unavailable,
        }
    }

    fn read_entries(&self) -> Result<Option<StoredEntries>, LocalStorageBuildError> {
        read_envelope(&self.data_path, self.max_file_bytes)
    }

    fn compare_and_swap_entries(
        &self,
        expected_revision: u64,
        entries: Vec<Vec<u8>>,
    ) -> Result<Result<u64, ()>, LocalStorageBuildError> {
        let raw_bytes = entries
            .iter()
            .try_fold(0usize, |total, entry| total.checked_add(entry.len()));
        if raw_bytes.is_none_or(|bytes| bytes > self.max_file_bytes / 2) {
            return Err(LocalStorageBuildError::TooLarge);
        }
        reject_symlink(&self.lock_path)?;
        let lock = open_and_lock(&self.lock_path)?;
        let current_revision = match self.read_entries()? {
            Some((revision, _)) => revision,
            None => 0,
        };
        if current_revision != expected_revision {
            let _ = FileExt::unlock(&lock);
            return Ok(Err(()));
        }
        let revision = expected_revision
            .checked_add(1)
            .ok_or(LocalStorageBuildError::Unavailable)?;
        let encoded = encode_envelope(revision, entries)?;
        if encoded.len() > self.max_file_bytes {
            let _ = FileExt::unlock(&lock);
            return Err(LocalStorageBuildError::TooLarge);
        }
        let write_result = atomic_replace(&self.data_path, &encoded);
        let _ = FileExt::unlock(&lock);
        write_result?;
        Ok(Ok(revision))
    }
}

impl DurableRecordStorage for AtomicLocalStorage {
    fn read(&self) -> RawStoreRead {
        match self.read_entries() {
            Ok(None) => RawStoreRead::Missing { revision: 0 },
            Ok(Some((revision, records))) => RawStoreRead::Records { revision, records },
            Err(_) => RawStoreRead::Unavailable,
        }
    }

    fn compare_and_swap(&self, expected_revision: u64, records: Vec<Vec<u8>>) -> RawStoreWrite {
        match self.compare_and_swap_entries(expected_revision, records) {
            Ok(Ok(revision)) => RawStoreWrite::Written { revision },
            Ok(Err(())) => RawStoreWrite::Conflict,
            Err(_) => RawStoreWrite::Unavailable,
        }
    }
}

impl RawResponseArchiveStorage for AtomicLocalStorage {
    fn read(&self) -> RawResponseArchiveRead {
        match self.read_entries() {
            Ok(None) => RawResponseArchiveRead::Missing { revision: 0 },
            Ok(Some((revision, entries))) => RawResponseArchiveRead::Entries { revision, entries },
            Err(_) => RawResponseArchiveRead::Unavailable,
        }
    }

    fn compare_and_swap(
        &self,
        expected_revision: u64,
        entries: Vec<Vec<u8>>,
    ) -> RawResponseArchiveWrite {
        match self.compare_and_swap_entries(expected_revision, entries) {
            Ok(Ok(revision)) => RawResponseArchiveWrite::Written { revision },
            Ok(Err(())) => RawResponseArchiveWrite::Conflict,
            Err(_) => RawResponseArchiveWrite::Unavailable,
        }
    }
}

fn validate_paths(data_path: &Path, lock_path: &Path) -> Result<(), LocalStorageBuildError> {
    if !data_path.is_absolute()
        || !lock_path.is_absolute()
        || data_path == lock_path
        || data_path.parent().is_none()
        || data_path.parent() != lock_path.parent()
    {
        return Err(LocalStorageBuildError::UnsafePath);
    }
    validate_existing_ancestors(data_path.parent().expect("parent checked"))?;
    reject_symlink(data_path)?;
    reject_symlink(lock_path)?;
    Ok(())
}

fn validate_auxiliary_path(
    data_path: &Path,
    lock_path: &Path,
    auxiliary_path: &Path,
) -> Result<(), LocalStorageBuildError> {
    if !auxiliary_path.is_absolute()
        || auxiliary_path == data_path
        || auxiliary_path == lock_path
        || auxiliary_path.parent() != data_path.parent()
    {
        return Err(LocalStorageBuildError::UnsafePath);
    }
    reject_symlink(auxiliary_path)
}

fn open_and_lock(lock_path: &Path) -> Result<File, LocalStorageBuildError> {
    reject_symlink(lock_path)?;
    let lock = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(lock_path)
        .map_err(|_| LocalStorageBuildError::Unavailable)?;
    lock.lock_exclusive()
        .map_err(|_| LocalStorageBuildError::Unavailable)?;
    Ok(lock)
}

fn validate_existing_ancestors(path: &Path) -> Result<(), LocalStorageBuildError> {
    let mut current = Some(path);
    while let Some(candidate) = current {
        let metadata =
            fs::symlink_metadata(candidate).map_err(|_| LocalStorageBuildError::UnsafePath)?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err(LocalStorageBuildError::UnsafePath);
        }
        current = candidate.parent();
    }
    Ok(())
}

fn reject_symlink(path: &Path) -> Result<(), LocalStorageBuildError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
            Err(LocalStorageBuildError::UnsafePath)
        }
        Ok(_) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err(LocalStorageBuildError::Unavailable),
    }
}

fn read_envelope(
    path: &Path,
    max_file_bytes: usize,
) -> Result<Option<StoredEntries>, LocalStorageBuildError> {
    reject_symlink(path)?;
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(LocalStorageBuildError::Unavailable),
    };
    if bytes.len() > max_file_bytes {
        return Err(LocalStorageBuildError::TooLarge);
    }
    validate_envelope_bytes(&bytes, max_file_bytes).map(Some)
}

fn validate_envelope_bytes(
    bytes: &[u8],
    max_file_bytes: usize,
) -> Result<(u64, Vec<Vec<u8>>), LocalStorageBuildError> {
    if bytes.len() > max_file_bytes {
        return Err(LocalStorageBuildError::TooLarge);
    }
    let probe = serde_json::from_slice::<LocalStorageVersionProbe>(bytes)
        .map_err(|_| LocalStorageBuildError::Corrupt)?;
    if probe.schema_version != LOCAL_STORAGE_SCHEMA_VERSION {
        return Err(LocalStorageBuildError::UnsupportedVersion);
    }
    let envelope = serde_json::from_slice::<LocalStorageEnvelope>(bytes)
        .map_err(|_| LocalStorageBuildError::Corrupt)?;
    if envelope.revision == 0
        || envelope.digest != envelope_digest(envelope.revision, &envelope.entries)
    {
        return Err(LocalStorageBuildError::Corrupt);
    }
    let entries = envelope
        .entries
        .iter()
        .map(|entry| decode_hex(entry))
        .collect::<Option<Vec<_>>>()
        .ok_or(LocalStorageBuildError::Corrupt)?;
    Ok((envelope.revision, entries))
}

fn encode_envelope(
    revision: u64,
    entries: Vec<Vec<u8>>,
) -> Result<Vec<u8>, LocalStorageBuildError> {
    let entries = entries
        .into_iter()
        .map(|entry| encode_hex(&entry))
        .collect::<Vec<_>>();
    serde_json::to_vec(&LocalStorageEnvelope {
        schema_version: LOCAL_STORAGE_SCHEMA_VERSION,
        revision,
        digest: envelope_digest(revision, &entries),
        entries,
    })
    .map_err(|_| LocalStorageBuildError::Unavailable)
}

fn envelope_digest(revision: u64, entries: &[String]) -> String {
    let mut digest = Sha256::new();
    digest.update(revision.to_be_bytes());
    for entry in entries {
        digest.update((entry.len() as u64).to_be_bytes());
        digest.update(entry.as_bytes());
    }
    format!("sha256:{:x}", digest.finalize())
}

fn encode_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn decode_hex(value: &str) -> Option<Vec<u8>> {
    if !value.len().is_multiple_of(2) || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    (0..value.len())
        .step_by(2)
        .map(|index| u8::from_str_radix(&value[index..index + 2], 16).ok())
        .collect()
}

fn atomic_replace(path: &Path, bytes: &[u8]) -> Result<(), LocalStorageBuildError> {
    let parent = path.parent().ok_or(LocalStorageBuildError::UnsafePath)?;
    let temporary = temporary_path(path)?;
    let result = (|| {
        write_new_synced(&temporary, bytes)?;
        replace_synced(&temporary, path, parent)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

#[cfg(unix)]
fn replace_synced(
    temporary: &Path,
    path: &Path,
    parent: &Path,
) -> Result<(), LocalStorageBuildError> {
    fs::rename(temporary, path).map_err(|_| LocalStorageBuildError::Unavailable)?;
    File::open(parent)
        .and_then(|directory| directory.sync_all())
        .map_err(|_| LocalStorageBuildError::Unavailable)
}

#[cfg(target_os = "windows")]
fn replace_synced(
    temporary: &Path,
    path: &Path,
    _parent: &Path,
) -> Result<(), LocalStorageBuildError> {
    use std::os::windows::ffi::OsStrExt;

    use windows_sys::Win32::Storage::FileSystem::{
        MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH, MoveFileExW,
    };

    let temporary = temporary
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect::<Vec<_>>();
    let path = path
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect::<Vec<_>>();
    // Both pointers remain backed by the local UTF-16 buffers for the duration
    // of this synchronous Win32 call. WRITE_THROUGH replaces the Unix parent
    // directory fsync contract, which Windows directory handles do not expose
    // through std::fs::File.
    let moved = unsafe {
        MoveFileExW(
            temporary.as_ptr(),
            path.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if moved == 0 {
        Err(LocalStorageBuildError::Unavailable)
    } else {
        Ok(())
    }
}

#[cfg(not(any(unix, target_os = "windows")))]
fn replace_synced(
    temporary: &Path,
    path: &Path,
    _parent: &Path,
) -> Result<(), LocalStorageBuildError> {
    fs::rename(temporary, path).map_err(|_| LocalStorageBuildError::Unavailable)
}

fn temporary_path(path: &Path) -> Result<PathBuf, LocalStorageBuildError> {
    let parent = path.parent().ok_or(LocalStorageBuildError::UnsafePath)?;
    let sequence = TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or(LocalStorageBuildError::UnsafePath)?;
    Ok(parent.join(format!(
        ".{file_name}.{}.{}.tmp",
        std::process::id(),
        sequence
    )))
}

fn write_new_synced(path: &Path, bytes: &[u8]) -> Result<(), LocalStorageBuildError> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(path)
        .map_err(|_| LocalStorageBuildError::Unavailable)?;
    file.write_all(bytes)
        .map_err(|_| LocalStorageBuildError::Unavailable)?;
    file.sync_all()
        .map_err(|_| LocalStorageBuildError::Unavailable)
}

fn atomic_create_new(path: &Path, bytes: &[u8]) -> Result<(), LocalStorageBuildError> {
    if path.exists() {
        return Err(LocalStorageBuildError::Unavailable);
    }
    let parent = path.parent().ok_or(LocalStorageBuildError::UnsafePath)?;
    let temporary = temporary_path(path)?;
    let result = (|| {
        write_new_synced(&temporary, bytes)?;
        fs::hard_link(&temporary, path).map_err(|_| LocalStorageBuildError::Unavailable)?;
        fs::remove_file(&temporary).map_err(|_| LocalStorageBuildError::Unavailable)?;
        File::open(parent)
            .and_then(|directory| directory.sync_all())
            .map_err(|_| LocalStorageBuildError::Unavailable)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}
