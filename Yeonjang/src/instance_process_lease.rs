use std::fs::{self, File, OpenOptions};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use directories::ProjectDirs;
use fs2::{FileExt, lock_contended_error};
const RUNTIME_LEASE_FILENAME: &str = "knowbee-yeonjang-runtime-v2.lock";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeLeaseError {
    UnsafeRoot,
    AlreadyRunning,
    Unavailable,
}

impl RuntimeLeaseError {
    /// Stable, redacted startup reason for CLI and GUI projections.
    pub const fn reason_code(self) -> &'static str {
        match self {
            Self::UnsafeRoot => "runtime_lease_unsafe",
            Self::AlreadyRunning => "already_running",
            Self::Unavailable => "runtime_lease_unavailable",
        }
    }
}

/// Process-lifetime ownership of the one effect-capable runtime in an OS
/// environment. The guard releases only through `Drop`.
pub trait RuntimeProcessLease: Send + Sync {}

/// Owns the OS-runtime lease for the full claimant process lifetime.
///
/// It can only be constructed by a `RuntimeLeaseProvider`; bootstrap code
/// keeps this value in its top-level runtime owner rather than recreating a
/// lease in every child composition.
#[derive(Clone)]
pub struct RuntimeLeaseGuard(#[allow(dead_code)] Arc<dyn RuntimeProcessLease>);

/// OS-runtime singleton port. Its API deliberately carries no executable,
/// configuration, or instance identity, so those values cannot split the
/// product-wide lease key.
pub trait RuntimeLeaseProvider: Send + Sync {
    fn acquire(&self) -> Result<RuntimeLeaseGuard, RuntimeLeaseError>;
}

/// Filesystem-backed implementation of the fixed Yeonjang runtime lease.
pub struct FilesystemRuntimeLeaseProvider {
    root: PathBuf,
}

impl FilesystemRuntimeLeaseProvider {
    pub fn new(root: PathBuf) -> Result<Self, RuntimeLeaseError> {
        let root = validate_lease_root(root)?;
        Ok(Self { root })
    }

    fn lease_path(&self) -> PathBuf {
        self.root.join(RUNTIME_LEASE_FILENAME)
    }
}

impl RuntimeLeaseProvider for FilesystemRuntimeLeaseProvider {
    fn acquire(&self) -> Result<RuntimeLeaseGuard, RuntimeLeaseError> {
        let path = self.lease_path();
        reject_symlink_if_present(&path)?;
        let file = open_lock_file(&path)?;
        let metadata = file
            .metadata()
            .map_err(|_| RuntimeLeaseError::Unavailable)?;
        if !metadata.is_file() {
            return Err(RuntimeLeaseError::UnsafeRoot);
        }
        file.try_lock_exclusive().map_err(|error| {
            if is_lock_contention(&error) {
                RuntimeLeaseError::AlreadyRunning
            } else {
                RuntimeLeaseError::Unavailable
            }
        })?;
        Ok(RuntimeLeaseGuard(Arc::new(FilesystemRuntimeProcessLease {
            file,
        })))
    }
}

/// Resolves the product-owned per-user OS runtime root once at bootstrap.
/// This root does not vary with executable path, settings/config root, or
/// instance ID. A missing platform root is unavailable rather than falling
/// back to a relative working-directory lock.
pub fn configured_runtime_lease_provider()
-> Result<Arc<dyn RuntimeLeaseProvider>, RuntimeLeaseError> {
    let directories =
        ProjectDirs::from("com", "Sponzey", "Knowbee").ok_or(RuntimeLeaseError::Unavailable)?;
    let root = directories
        .data_local_dir()
        .join("yeonjang")
        .join("runtime-leases");
    Ok(Arc::new(FilesystemRuntimeLeaseProvider::new(root)?))
}

struct FilesystemRuntimeProcessLease {
    file: File,
}

impl RuntimeProcessLease for FilesystemRuntimeProcessLease {}

impl Drop for FilesystemRuntimeProcessLease {
    fn drop(&mut self) {
        let _ = FileExt::unlock(&self.file);
    }
}

fn is_lock_contention(error: &std::io::Error) -> bool {
    error.kind() == std::io::ErrorKind::WouldBlock
        || error.raw_os_error() == lock_contended_error().raw_os_error()
}

fn reject_symlink_if_present(path: &Path) -> Result<(), RuntimeLeaseError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => Err(RuntimeLeaseError::UnsafeRoot),
        Ok(_) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err(RuntimeLeaseError::Unavailable),
    }
}

fn open_lock_file(path: &Path) -> Result<File, RuntimeLeaseError> {
    let mut options = OpenOptions::new();
    options.read(true).write(true).create(true);
    configure_secure_lock_open(&mut options);
    options
        .open(path)
        .map_err(|_| RuntimeLeaseError::Unavailable)
}

fn validate_lease_root(root: PathBuf) -> Result<PathBuf, RuntimeLeaseError> {
    if !root.is_absolute() {
        return Err(RuntimeLeaseError::UnsafeRoot);
    }
    fs::create_dir_all(&root).map_err(|_| RuntimeLeaseError::Unavailable)?;
    let metadata = fs::symlink_metadata(&root).map_err(|_| RuntimeLeaseError::Unavailable)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(RuntimeLeaseError::UnsafeRoot);
    }
    root.canonicalize()
        .map_err(|_| RuntimeLeaseError::Unavailable)
}

#[cfg(unix)]
fn configure_secure_lock_open(options: &mut OpenOptions) {
    use std::os::unix::fs::OpenOptionsExt;

    options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
}

#[cfg(not(unix))]
fn configure_secure_lock_open(_options: &mut OpenOptions) {}
