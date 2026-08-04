use std::fs::{self, File, OpenOptions};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use fs2::{FileExt, lock_contended_error};
use sha2::{Digest, Sha256};

use crate::settings::settings_path;

const MAX_INSTANCE_ID_BYTES: usize = 256;
const MAX_EXECUTABLE_IDENTITY_BYTES: usize = 4_096;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InstanceLeaseError {
    InvalidIdentity,
    UnsafeRoot,
    AlreadyRunning,
    Unavailable,
}

pub trait InstanceProcessLease: Send {}

pub trait InstanceLeaseProvider: Send + Sync {
    fn acquire(
        &self,
        instance_id: &str,
    ) -> Result<Box<dyn InstanceProcessLease>, InstanceLeaseError>;
}

pub struct FilesystemInstanceLeaseProvider {
    root: PathBuf,
    executable_digest: [u8; 32],
}

impl FilesystemInstanceLeaseProvider {
    pub fn new(root: PathBuf, executable_identity: &str) -> Result<Self, InstanceLeaseError> {
        let executable_identity = executable_identity.trim();
        if executable_identity.is_empty()
            || executable_identity.len() > MAX_EXECUTABLE_IDENTITY_BYTES
        {
            return Err(InstanceLeaseError::InvalidIdentity);
        }
        if !root.is_absolute() {
            return Err(InstanceLeaseError::UnsafeRoot);
        }
        fs::create_dir_all(&root).map_err(|_| InstanceLeaseError::Unavailable)?;
        let metadata = fs::symlink_metadata(&root).map_err(|_| InstanceLeaseError::Unavailable)?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err(InstanceLeaseError::UnsafeRoot);
        }
        let canonical_root = root
            .canonicalize()
            .map_err(|_| InstanceLeaseError::Unavailable)?;
        let executable_digest = Sha256::digest(executable_identity.as_bytes()).into();
        Ok(Self {
            root: canonical_root,
            executable_digest,
        })
    }

    fn lease_path(&self, instance_id: &str) -> Result<PathBuf, InstanceLeaseError> {
        let instance_id = instance_id.trim();
        if instance_id.is_empty() || instance_id.len() > MAX_INSTANCE_ID_BYTES {
            return Err(InstanceLeaseError::InvalidIdentity);
        }
        let mut digest = Sha256::new();
        digest.update(b"knowbee-yeonjang-instance-lease-v1\0");
        digest.update(self.executable_digest);
        digest.update(b"\0");
        digest.update(instance_id.as_bytes());
        Ok(self.root.join(format!("{:x}.lock", digest.finalize())))
    }
}

impl InstanceLeaseProvider for FilesystemInstanceLeaseProvider {
    fn acquire(
        &self,
        instance_id: &str,
    ) -> Result<Box<dyn InstanceProcessLease>, InstanceLeaseError> {
        let path = self.lease_path(instance_id)?;
        reject_symlink_if_present(&path)?;
        let file = open_lock_file(&path)?;
        let metadata = file
            .metadata()
            .map_err(|_| InstanceLeaseError::Unavailable)?;
        if !metadata.is_file() {
            return Err(InstanceLeaseError::UnsafeRoot);
        }
        file.try_lock_exclusive().map_err(|error| {
            if is_lock_contention(&error) {
                InstanceLeaseError::AlreadyRunning
            } else {
                InstanceLeaseError::Unavailable
            }
        })?;
        Ok(Box::new(FilesystemInstanceProcessLease { file }))
    }
}

fn is_lock_contention(error: &std::io::Error) -> bool {
    error.kind() == std::io::ErrorKind::WouldBlock
        || error.raw_os_error() == lock_contended_error().raw_os_error()
}

pub fn configured_instance_lease_provider()
-> Result<Arc<dyn InstanceLeaseProvider>, InstanceLeaseError> {
    let settings = settings_path();
    let config_root = settings.parent().ok_or(InstanceLeaseError::UnsafeRoot)?;
    configured_instance_lease_provider_at(config_root)
}

/// Binds the singleton lease to the same explicit config root as the other
/// managed-runtime durable owners.
///
/// The caller must supply its already validated absolute bootstrap root. The
/// provider still validates the derived lease root and binds it to the loaded
/// executable identity before any runtime can acquire an instance lease.
pub fn configured_instance_lease_provider_at(
    config_root: &Path,
) -> Result<Arc<dyn InstanceLeaseProvider>, InstanceLeaseError> {
    if !config_root.is_absolute() {
        return Err(InstanceLeaseError::UnsafeRoot);
    }
    let executable = std::env::current_exe()
        .and_then(|path| path.canonicalize())
        .map_err(|_| InstanceLeaseError::Unavailable)?;
    let root = config_root.join("runtime-leases");
    Ok(Arc::new(FilesystemInstanceLeaseProvider::new(
        root,
        &executable.to_string_lossy(),
    )?))
}

struct FilesystemInstanceProcessLease {
    file: File,
}

impl InstanceProcessLease for FilesystemInstanceProcessLease {}

impl Drop for FilesystemInstanceProcessLease {
    fn drop(&mut self) {
        let _ = FileExt::unlock(&self.file);
    }
}

fn reject_symlink_if_present(path: &Path) -> Result<(), InstanceLeaseError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => Err(InstanceLeaseError::UnsafeRoot),
        Ok(_) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err(InstanceLeaseError::Unavailable),
    }
}

fn open_lock_file(path: &Path) -> Result<File, InstanceLeaseError> {
    let mut options = OpenOptions::new();
    options.read(true).write(true).create(true);
    configure_secure_lock_open(&mut options);
    options
        .open(path)
        .map_err(|_| InstanceLeaseError::Unavailable)
}

#[cfg(unix)]
fn configure_secure_lock_open(options: &mut OpenOptions) {
    use std::os::unix::fs::OpenOptionsExt;

    options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
}

#[cfg(not(unix))]
fn configure_secure_lock_open(_options: &mut OpenOptions) {}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "knowbee-instance-lease-{label}-{}",
            std::process::id()
        ))
    }

    #[test]
    fn stale_file_is_reused_but_an_owned_lease_is_exclusive() {
        let root = temp_root("exclusive");
        fs::create_dir_all(&root).expect("temp root");
        let provider = FilesystemInstanceLeaseProvider::new(root.clone(), "test-executable")
            .expect("provider");
        let stale_path = provider.lease_path("instance-a").expect("lease path");
        File::create(&stale_path).expect("stale lock file");

        let first = provider.acquire("instance-a").expect("first lease");
        let duplicate = provider.acquire("instance-a");
        assert!(
            matches!(duplicate, Err(InstanceLeaseError::AlreadyRunning)),
            "duplicate lease result: {:?}",
            duplicate.err()
        );
        provider
            .acquire("instance-b")
            .expect("distinct instance lease");
        drop(first);
        provider.acquire("instance-a").expect("returned lease");
        fs::remove_dir_all(root).expect("remove temp root");
    }

    #[cfg(unix)]
    #[test]
    fn symlink_lock_file_is_rejected_without_following_it() {
        use std::os::unix::fs::symlink;

        let root = temp_root("symlink");
        fs::create_dir_all(&root).expect("temp root");
        let provider = FilesystemInstanceLeaseProvider::new(root.clone(), "test-executable")
            .expect("provider");
        let target = root.join("target");
        File::create(&target).expect("target");
        let lease_path = provider.lease_path("instance-a").expect("lease path");
        symlink(&target, lease_path).expect("symlink");

        assert!(matches!(
            provider.acquire("instance-a"),
            Err(InstanceLeaseError::UnsafeRoot)
        ));
        fs::remove_dir_all(root).expect("remove temp root");
    }
}
