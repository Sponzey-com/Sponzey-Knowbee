//! Path-free identity for a concrete Yeonjang executable.
//!
//! Release tooling compares this observation with the staged package
//! manifest. The digest identifies bytes only; it is not evidence that an OS
//! permission, MQTT request, or device effect succeeded.

use std::fs::File;
use std::io::Read;
use std::path::Path;

use serde::Serialize;
use sha2::{Digest, Sha256};

pub const RELEASE_IDENTITY_SCHEMA_ID: &str = "yeonjang.release-identity.v1";
const RELEASE_IDENTITY_SCHEMA_VERSION: u16 = 1;
const MAX_PUBLIC_IDENTITY_BYTES: usize = 64;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ReleaseBinaryIdentity {
    schema_id: &'static str,
    schema_version: u16,
    package_version: String,
    target_os: String,
    target_arch: String,
    binary_size_bytes: u64,
    binary_sha256: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReleaseIdentityError {
    InvalidPackageVersion,
    InvalidTarget,
    CurrentExecutableUnavailable,
    FileUnavailable,
    NotRegularFile,
    ReadFailed,
}

impl ReleaseBinaryIdentity {
    pub fn current() -> Result<Self, ReleaseIdentityError> {
        let executable = std::env::current_exe()
            .map_err(|_| ReleaseIdentityError::CurrentExecutableUnavailable)?;
        Self::from_path(
            &executable,
            env!("CARGO_PKG_VERSION"),
            std::env::consts::OS,
            std::env::consts::ARCH,
        )
    }

    pub fn from_path(
        path: &Path,
        package_version: &str,
        target_os: &str,
        target_arch: &str,
    ) -> Result<Self, ReleaseIdentityError> {
        if !is_public_identity(package_version) {
            return Err(ReleaseIdentityError::InvalidPackageVersion);
        }
        if !matches!(target_os, "macos" | "windows" | "linux")
            || !matches!(target_arch, "aarch64" | "x86_64")
        {
            return Err(ReleaseIdentityError::InvalidTarget);
        }
        let metadata = path
            .metadata()
            .map_err(|_| ReleaseIdentityError::FileUnavailable)?;
        if !metadata.is_file() {
            return Err(ReleaseIdentityError::NotRegularFile);
        }
        let mut file = File::open(path).map_err(|_| ReleaseIdentityError::FileUnavailable)?;
        let mut digest = Sha256::new();
        let mut buffer = [0_u8; 64 * 1024];
        loop {
            let read = file
                .read(&mut buffer)
                .map_err(|_| ReleaseIdentityError::ReadFailed)?;
            if read == 0 {
                break;
            }
            digest.update(&buffer[..read]);
        }
        Ok(Self {
            schema_id: RELEASE_IDENTITY_SCHEMA_ID,
            schema_version: RELEASE_IDENTITY_SCHEMA_VERSION,
            package_version: package_version.to_string(),
            target_os: target_os.to_string(),
            target_arch: target_arch.to_string(),
            binary_size_bytes: metadata.len(),
            binary_sha256: format!("sha256:{:x}", digest.finalize()),
        })
    }

    pub fn schema_id(&self) -> &str {
        self.schema_id
    }

    pub fn schema_version(&self) -> u16 {
        self.schema_version
    }

    pub fn package_version(&self) -> &str {
        &self.package_version
    }

    pub fn target_os(&self) -> &str {
        &self.target_os
    }

    pub fn target_arch(&self) -> &str {
        &self.target_arch
    }

    pub fn binary_size_bytes(&self) -> u64 {
        self.binary_size_bytes
    }

    pub fn binary_sha256(&self) -> &str {
        &self.binary_sha256
    }
}

fn is_public_identity(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_PUBLIC_IDENTITY_BYTES
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'_' | b'+'))
}
