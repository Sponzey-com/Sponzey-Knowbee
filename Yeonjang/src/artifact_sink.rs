use std::fmt;
#[cfg(unix)]
use std::fs::File;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::artifact_cleanup::{
    ArtifactCleanupPort, ArtifactInventoryPort, ArtifactInventoryResult, ArtifactRemovalResult,
};
use crate::artifact_transfer_use_case::{
    VerifiedArtifactBytes, VerifiedArtifactSource, VerifiedArtifactSourceError,
};
use crate::automation::{
    AutomationBackend, CameraCaptureRequest, CameraCaptureResult, ScreenCaptureRequest,
    ScreenCaptureResult,
};
pub use crate::capture_artifact_postcheck::{
    CaptureArtifactKind, CaptureArtifactMetadata, CaptureImageFormat,
};
use crate::capture_artifact_postcheck::{
    CapturePostCheckError, MAX_CAPTURE_ARTIFACT_BYTES, post_check_capture_bytes,
};

const MAX_BINDING_FIELD_BYTES: usize = 512;
const ARTIFACT_MANIFEST_SCHEMA_VERSION: u16 = 1;
const MAX_ARTIFACT_MANIFEST_BYTES: usize = 4096;
const ARTIFACT_MANIFEST_FILE: &str = "artifact.json";

pub struct CaptureArtifactBinding {
    digest: [u8; 32],
}

impl CaptureArtifactBinding {
    pub fn new(
        command_id: &str,
        operation_id: &str,
        target_session_id: &str,
        target_fingerprint: &str,
        idempotency_key: &str,
    ) -> Result<Self, CaptureArtifactError> {
        let fields = [
            command_id,
            operation_id,
            target_session_id,
            target_fingerprint,
            idempotency_key,
        ];
        if fields
            .iter()
            .any(|field| field.trim().is_empty() || field.len() > MAX_BINDING_FIELD_BYTES)
        {
            return Err(CaptureArtifactError::InvalidOperation);
        }
        let mut digest = Sha256::new();
        for field in fields {
            digest.update(field.len().to_be_bytes());
            digest.update(field.as_bytes());
        }
        Ok(Self {
            digest: digest.finalize().into(),
        })
    }
}

impl fmt::Debug for CaptureArtifactBinding {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("CaptureArtifactBinding")
            .field("exact_binding", &"[REDACTED]")
            .finish()
    }
}

#[derive(Debug, Clone, Copy)]
pub struct CaptureArtifactBindingInput<'a> {
    pub command_id: Option<&'a str>,
    pub operation_id: Option<&'a str>,
    pub target_session_id: Option<&'a str>,
    pub target_fingerprint: Option<&'a str>,
    pub idempotency_key: Option<&'a str>,
}

impl CaptureArtifactBindingInput<'_> {
    pub fn validate(self) -> Result<CaptureArtifactBinding, CaptureArtifactError> {
        CaptureArtifactBinding::new(
            self.command_id
                .ok_or(CaptureArtifactError::InvalidOperation)?,
            self.operation_id
                .ok_or(CaptureArtifactError::InvalidOperation)?,
            self.target_session_id
                .ok_or(CaptureArtifactError::InvalidOperation)?,
            self.target_fingerprint
                .ok_or(CaptureArtifactError::InvalidOperation)?,
            self.idempotency_key
                .ok_or(CaptureArtifactError::InvalidOperation)?,
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CaptureArtifactError {
    InvalidRoot,
    InvalidOperation,
    LeaseConflict,
    StorageUnavailable,
    InvalidReference,
    CallerPathNotAllowed,
    ArtifactMissing,
    ArtifactInvalid,
    ArtifactWrongFormat,
    ArtifactDigestMismatch,
}

impl CaptureArtifactError {
    pub fn code(self) -> &'static str {
        match self {
            Self::InvalidRoot => "artifact_root_invalid",
            Self::InvalidOperation => "artifact_operation_invalid",
            Self::LeaseConflict => "artifact_lease_conflict",
            Self::StorageUnavailable => "artifact_storage_unavailable",
            Self::InvalidReference => "artifact_reference_invalid",
            Self::CallerPathNotAllowed => "caller_output_path_not_allowed",
            Self::ArtifactMissing => "artifact_missing",
            Self::ArtifactInvalid => "artifact_invalid",
            Self::ArtifactWrongFormat => "artifact_wrong_format",
            Self::ArtifactDigestMismatch => "artifact_digest_mismatch",
        }
    }

    pub fn public_message(self) -> &'static str {
        match self {
            Self::CallerPathNotAllowed => "Caller-provided capture output path is not allowed.",
            Self::InvalidRoot | Self::StorageUnavailable => {
                "Capture artifact storage is unavailable."
            }
            Self::InvalidOperation => "Capture operation binding is invalid.",
            Self::LeaseConflict => "Capture operation already owns an artifact lease.",
            Self::InvalidReference
            | Self::ArtifactMissing
            | Self::ArtifactInvalid
            | Self::ArtifactWrongFormat
            | Self::ArtifactDigestMismatch => "Capture artifact is unavailable.",
        }
    }
}

impl fmt::Display for CaptureArtifactError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.code())
    }
}

impl std::error::Error for CaptureArtifactError {}

pub trait CaptureArtifactSink: Send + Sync {
    fn allocate(
        &self,
        kind: CaptureArtifactKind,
        binding: &CaptureArtifactBinding,
    ) -> Result<CaptureArtifactLease, CaptureArtifactError>;

    fn resolve(&self, artifact_ref: &str)
    -> Result<PersistedCaptureArtifact, CaptureArtifactError>;
}

pub fn configured_filesystem_sink(
    configured_root: impl AsRef<Path>,
    instance_id: &str,
) -> Result<Arc<dyn CaptureArtifactSink>, CaptureArtifactError> {
    Ok(configured_filesystem_artifact_store(
        configured_root,
        instance_id,
    )?)
}

/// Resolves the immutable, instance-scoped artifact root at bootstrap.
///
/// Returning the concrete store lets a composition root share one filesystem
/// owner across capture, verified reads and cleanup without re-discovering the
/// configured path or constructing three independent adapters.
pub fn configured_filesystem_artifact_store(
    configured_root: impl AsRef<Path>,
    instance_id: &str,
) -> Result<Arc<FilesystemCaptureArtifactSink>, CaptureArtifactError> {
    if instance_id.trim().is_empty() || instance_id.len() > MAX_BINDING_FIELD_BYTES {
        return Err(CaptureArtifactError::InvalidRoot);
    }
    let configured_root = configured_root.as_ref();
    if !configured_root.is_absolute() {
        return Err(CaptureArtifactError::InvalidRoot);
    }
    if let Ok(metadata) = fs::symlink_metadata(configured_root)
        && (metadata.file_type().is_symlink() || !metadata.is_dir())
    {
        return Err(CaptureArtifactError::InvalidRoot);
    }
    fs::create_dir_all(configured_root).map_err(|_| CaptureArtifactError::StorageUnavailable)?;
    let canonical_configured_root =
        fs::canonicalize(configured_root).map_err(|_| CaptureArtifactError::StorageUnavailable)?;
    let mut digest = Sha256::new();
    digest.update(b"instance");
    digest.update([0]);
    digest.update(instance_id.as_bytes());
    let instance_scope = format!("{:x}", digest.finalize());
    Ok(Arc::new(FilesystemCaptureArtifactSink::new(
        canonical_configured_root.join(instance_scope),
    )?))
}

pub struct UnavailableCaptureArtifactSink;

impl CaptureArtifactSink for UnavailableCaptureArtifactSink {
    fn allocate(
        &self,
        _kind: CaptureArtifactKind,
        _binding: &CaptureArtifactBinding,
    ) -> Result<CaptureArtifactLease, CaptureArtifactError> {
        Err(CaptureArtifactError::StorageUnavailable)
    }

    fn resolve(
        &self,
        _artifact_ref: &str,
    ) -> Result<PersistedCaptureArtifact, CaptureArtifactError> {
        Err(CaptureArtifactError::StorageUnavailable)
    }
}

pub struct FilesystemCaptureArtifactSink {
    canonical_root: PathBuf,
}

impl FilesystemCaptureArtifactSink {
    pub fn new(root: impl AsRef<Path>) -> Result<Self, CaptureArtifactError> {
        let root = root.as_ref();
        if !root.is_absolute() {
            return Err(CaptureArtifactError::InvalidRoot);
        }
        if let Ok(metadata) = fs::symlink_metadata(root)
            && metadata.file_type().is_symlink()
        {
            return Err(CaptureArtifactError::InvalidRoot);
        }
        fs::create_dir_all(root).map_err(|_| CaptureArtifactError::StorageUnavailable)?;
        let metadata =
            fs::symlink_metadata(root).map_err(|_| CaptureArtifactError::StorageUnavailable)?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Err(CaptureArtifactError::InvalidRoot);
        }
        let canonical_root =
            fs::canonicalize(root).map_err(|_| CaptureArtifactError::StorageUnavailable)?;
        Ok(Self { canonical_root })
    }
}

impl fmt::Debug for FilesystemCaptureArtifactSink {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("FilesystemCaptureArtifactSink")
            .field("canonical_root", &"[REDACTED]")
            .finish()
    }
}

impl CaptureArtifactSink for FilesystemCaptureArtifactSink {
    fn allocate(
        &self,
        kind: CaptureArtifactKind,
        binding: &CaptureArtifactBinding,
    ) -> Result<CaptureArtifactLease, CaptureArtifactError> {
        let lease_id = lease_id(kind, binding);
        let lease_directory = self.canonical_root.join(&lease_id);
        fs::create_dir(&lease_directory).map_err(|error| {
            if error.kind() == std::io::ErrorKind::AlreadyExists {
                CaptureArtifactError::LeaseConflict
            } else {
                CaptureArtifactError::StorageUnavailable
            }
        })?;
        let canonical_directory = fs::canonicalize(&lease_directory)
            .map_err(|_| CaptureArtifactError::StorageUnavailable)?;
        if canonical_directory.parent() != Some(self.canonical_root.as_path()) {
            let _ = fs::remove_dir(&lease_directory);
            return Err(CaptureArtifactError::InvalidRoot);
        }
        Ok(CaptureArtifactLease {
            output_path: canonical_directory.join(kind.file_name()),
            lease_directory: canonical_directory,
            lease_id,
            kind,
            cleanup: true,
        })
    }

    fn resolve(
        &self,
        artifact_ref: &str,
    ) -> Result<PersistedCaptureArtifact, CaptureArtifactError> {
        let lease_id = parse_artifact_ref(artifact_ref)?;
        let lease_directory = self.canonical_root.join(lease_id);
        let directory_metadata = fs::symlink_metadata(&lease_directory)
            .map_err(|_| CaptureArtifactError::ArtifactMissing)?;
        if !directory_metadata.is_dir() || directory_metadata.file_type().is_symlink() {
            return Err(CaptureArtifactError::ArtifactInvalid);
        }
        let canonical_directory = fs::canonicalize(&lease_directory)
            .map_err(|_| CaptureArtifactError::ArtifactMissing)?;
        if canonical_directory.parent() != Some(self.canonical_root.as_path()) {
            return Err(CaptureArtifactError::ArtifactInvalid);
        }
        let candidates = [
            (
                CaptureArtifactKind::CameraJpeg,
                canonical_directory.join(CaptureArtifactKind::CameraJpeg.file_name()),
            ),
            (
                CaptureArtifactKind::ScreenPng,
                canonical_directory.join(CaptureArtifactKind::ScreenPng.file_name()),
            ),
        ];
        let mut existing = candidates.into_iter().filter(|(_, path)| path.exists());
        let (kind, output_path) = existing
            .next()
            .ok_or(CaptureArtifactError::ArtifactMissing)?;
        if existing.next().is_some() {
            return Err(CaptureArtifactError::ArtifactInvalid);
        }
        let manifest = read_manifest(&canonical_directory)?;
        let artifact = persisted_artifact(
            output_path,
            canonical_directory,
            artifact_ref.to_string(),
            kind,
        )?;
        if !manifest.matches(artifact.metadata()) {
            return Err(CaptureArtifactError::ArtifactDigestMismatch);
        }
        Ok(artifact)
    }
}

impl VerifiedArtifactSource for FilesystemCaptureArtifactSink {
    fn read_verified(
        &self,
        artifact_ref: &str,
    ) -> Result<VerifiedArtifactBytes, VerifiedArtifactSourceError> {
        let artifact = self.resolve(artifact_ref).map_err(|error| match error {
            CaptureArtifactError::ArtifactMissing | CaptureArtifactError::InvalidReference => {
                VerifiedArtifactSourceError::Missing
            }
            CaptureArtifactError::ArtifactInvalid
            | CaptureArtifactError::ArtifactWrongFormat
            | CaptureArtifactError::ArtifactDigestMismatch => VerifiedArtifactSourceError::Invalid,
            CaptureArtifactError::InvalidRoot
            | CaptureArtifactError::InvalidOperation
            | CaptureArtifactError::LeaseConflict
            | CaptureArtifactError::StorageUnavailable
            | CaptureArtifactError::CallerPathNotAllowed => {
                VerifiedArtifactSourceError::Unavailable
            }
        })?;
        let bytes = fs::read(artifact.output_path())
            .map_err(|_| VerifiedArtifactSourceError::Unavailable)?;
        let verified =
            VerifiedArtifactBytes::new(artifact.artifact_ref(), artifact.metadata().kind(), bytes)?;
        if verified.metadata() != artifact.metadata() {
            return Err(VerifiedArtifactSourceError::Invalid);
        }
        Ok(verified)
    }
}

impl ArtifactCleanupPort for FilesystemCaptureArtifactSink {
    fn remove(&self, artifact_ref: &str) -> ArtifactRemovalResult {
        let lease_id = match parse_artifact_ref(artifact_ref) {
            Ok(lease_id) => lease_id,
            Err(_) => return ArtifactRemovalResult::Rejected,
        };
        let lease_directory = self.canonical_root.join(lease_id);
        let metadata = match fs::symlink_metadata(&lease_directory) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return ArtifactRemovalResult::AlreadyMissing;
            }
            Err(_) => return ArtifactRemovalResult::Unavailable,
        };
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return ArtifactRemovalResult::Rejected;
        }
        let canonical_directory = match fs::canonicalize(&lease_directory) {
            Ok(directory) => directory,
            Err(_) => return ArtifactRemovalResult::Unavailable,
        };
        if canonical_directory.parent() != Some(self.canonical_root.as_path()) {
            return ArtifactRemovalResult::Rejected;
        }
        let entries = match fs::read_dir(&canonical_directory) {
            Ok(entries) => entries,
            Err(_) => return ArtifactRemovalResult::Unavailable,
        };
        let mut paths = Vec::new();
        for entry in entries {
            let Ok(entry) = entry else {
                return ArtifactRemovalResult::Unavailable;
            };
            let Ok(file_type) = entry.file_type() else {
                return ArtifactRemovalResult::Unavailable;
            };
            let name = entry.file_name();
            let allowed = name == CaptureArtifactKind::CameraJpeg.file_name()
                || name == CaptureArtifactKind::ScreenPng.file_name()
                || name == ARTIFACT_MANIFEST_FILE;
            if !allowed || !file_type.is_file() || file_type.is_symlink() {
                return ArtifactRemovalResult::Rejected;
            }
            paths.push(entry.path());
        }
        for path in paths {
            if let Err(error) = fs::remove_file(path)
                && error.kind() != std::io::ErrorKind::NotFound
            {
                return ArtifactRemovalResult::Unavailable;
            }
        }
        match fs::remove_dir(&canonical_directory) {
            Ok(()) => ArtifactRemovalResult::Removed,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                ArtifactRemovalResult::AlreadyMissing
            }
            Err(_) => ArtifactRemovalResult::Unavailable,
        }
    }
}

impl ArtifactInventoryPort for FilesystemCaptureArtifactSink {
    fn references(&self) -> ArtifactInventoryResult {
        let entries = match fs::read_dir(&self.canonical_root) {
            Ok(entries) => entries,
            Err(_) => return ArtifactInventoryResult::Unavailable,
        };
        let mut references = Vec::new();
        for entry in entries {
            let Ok(entry) = entry else {
                return ArtifactInventoryResult::Unavailable;
            };
            let Ok(file_type) = entry.file_type() else {
                return ArtifactInventoryResult::Unavailable;
            };
            let Some(name) = entry.file_name().to_str().map(str::to_string) else {
                return ArtifactInventoryResult::Unavailable;
            };
            if !file_type.is_dir()
                || file_type.is_symlink()
                || name.len() != 64
                || !name.bytes().all(|byte| byte.is_ascii_hexdigit())
            {
                return ArtifactInventoryResult::Unavailable;
            }
            references.push(format!("capture:{name}"));
        }
        references.sort();
        ArtifactInventoryResult::References(references)
    }
}

pub fn execute_camera_capture(
    sink: &dyn CaptureArtifactSink,
    backend: &dyn AutomationBackend,
    mut request: CameraCaptureRequest,
    binding: &CaptureArtifactBinding,
) -> Result<CameraCaptureResult> {
    if request.output_path.is_some() {
        return Err(CaptureArtifactError::CallerPathNotAllowed.into());
    }
    let inline_base64 = request.inline_base64;
    let lease = sink.allocate(CaptureArtifactKind::CameraJpeg, binding)?;
    request.output_path = Some(
        lease
            .output_path()
            .to_str()
            .ok_or(CaptureArtifactError::StorageUnavailable)?
            .to_string(),
    );
    let mut result = backend.capture_camera(request)?;
    result.output_path = None;
    if inline_base64 {
        result.artifact_ref = None;
        return Ok(result);
    }
    result.base64_data = None;
    let artifact = lease.commit()?;
    result.size_bytes = Some(artifact.size_bytes());
    result.artifact_ref = Some(artifact.artifact_ref().to_string());
    Ok(result)
}

pub fn execute_screen_capture(
    sink: &dyn CaptureArtifactSink,
    backend: &dyn AutomationBackend,
    mut request: ScreenCaptureRequest,
    binding: &CaptureArtifactBinding,
) -> Result<ScreenCaptureResult> {
    if request.output_path.is_some() {
        return Err(CaptureArtifactError::CallerPathNotAllowed.into());
    }
    let inline_base64 = request.inline_base64;
    let lease = sink.allocate(CaptureArtifactKind::ScreenPng, binding)?;
    request.output_path = Some(
        lease
            .output_path()
            .to_str()
            .ok_or(CaptureArtifactError::StorageUnavailable)?
            .to_string(),
    );
    let mut result = backend.capture_screen(request)?;
    result.output_path = None;
    if inline_base64 {
        result.artifact_ref = None;
        return Ok(result);
    }
    result.base64_data = None;
    let artifact = lease.commit()?;
    result.size_bytes = Some(artifact.size_bytes());
    result.artifact_ref = Some(artifact.artifact_ref().to_string());
    Ok(result)
}

pub struct CaptureArtifactLease {
    output_path: PathBuf,
    lease_directory: PathBuf,
    lease_id: String,
    kind: CaptureArtifactKind,
    cleanup: bool,
}

impl CaptureArtifactLease {
    pub fn output_path(&self) -> &Path {
        &self.output_path
    }

    pub fn artifact_ref(&self) -> String {
        format!("capture:{}", self.lease_id)
    }

    pub fn commit(mut self) -> Result<PersistedCaptureArtifact, CaptureArtifactError> {
        let artifact = persisted_artifact(
            self.output_path.clone(),
            self.lease_directory.clone(),
            self.artifact_ref(),
            self.kind,
        )?;
        write_manifest(&self.lease_directory, artifact.metadata())?;
        self.cleanup = false;
        Ok(artifact)
    }
}

impl fmt::Debug for CaptureArtifactLease {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("CaptureArtifactLease")
            .field("output_path", &"[REDACTED]")
            .field("lease_id", &"[REDACTED]")
            .finish()
    }
}

impl Drop for CaptureArtifactLease {
    fn drop(&mut self) {
        if self.cleanup {
            let _ = fs::remove_file(&self.output_path);
            let _ = fs::remove_file(self.lease_directory.join(ARTIFACT_MANIFEST_FILE));
            let _ = fs::remove_dir(&self.lease_directory);
        }
    }
}

pub struct PersistedCaptureArtifact {
    output_path: PathBuf,
    lease_directory: PathBuf,
    artifact_ref: String,
    metadata: CaptureArtifactMetadata,
}

impl PersistedCaptureArtifact {
    pub fn output_path(&self) -> &Path {
        &self.output_path
    }

    pub fn artifact_ref(&self) -> &str {
        &self.artifact_ref
    }

    pub fn size_bytes(&self) -> u64 {
        self.metadata.size_bytes()
    }

    pub fn metadata(&self) -> &CaptureArtifactMetadata {
        &self.metadata
    }

    pub fn remove(self) -> Result<(), CaptureArtifactError> {
        fs::remove_file(&self.output_path).map_err(|_| CaptureArtifactError::StorageUnavailable)?;
        fs::remove_file(self.lease_directory.join(ARTIFACT_MANIFEST_FILE))
            .map_err(|_| CaptureArtifactError::StorageUnavailable)?;
        fs::remove_dir(&self.lease_directory).map_err(|_| CaptureArtifactError::StorageUnavailable)
    }
}

impl fmt::Debug for PersistedCaptureArtifact {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("PersistedCaptureArtifact")
            .field("output_path", &"[REDACTED]")
            .field("artifact_ref", &self.artifact_ref)
            .field("metadata", &self.metadata)
            .finish()
    }
}

fn lease_id(kind: CaptureArtifactKind, binding: &CaptureArtifactBinding) -> String {
    let mut digest = Sha256::new();
    digest.update(kind.scope());
    digest.update([0]);
    digest.update(binding.digest);
    format!("{:x}", digest.finalize())
}

fn parse_artifact_ref(artifact_ref: &str) -> Result<&str, CaptureArtifactError> {
    let digest = artifact_ref
        .strip_prefix("capture:")
        .ok_or(CaptureArtifactError::InvalidReference)?;
    if digest.len() != 64 || !digest.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(CaptureArtifactError::InvalidReference);
    }
    Ok(digest)
}

fn persisted_artifact(
    output_path: PathBuf,
    lease_directory: PathBuf,
    artifact_ref: String,
    kind: CaptureArtifactKind,
) -> Result<PersistedCaptureArtifact, CaptureArtifactError> {
    let metadata =
        fs::symlink_metadata(&output_path).map_err(|_| CaptureArtifactError::ArtifactMissing)?;
    if !metadata.is_file()
        || metadata.file_type().is_symlink()
        || metadata.len() == 0
        || metadata.len() > MAX_CAPTURE_ARTIFACT_BYTES as u64
    {
        return Err(CaptureArtifactError::ArtifactInvalid);
    }
    let canonical_output =
        fs::canonicalize(&output_path).map_err(|_| CaptureArtifactError::ArtifactMissing)?;
    if canonical_output.parent() != Some(lease_directory.as_path()) {
        return Err(CaptureArtifactError::ArtifactInvalid);
    }
    let bytes = fs::read(&canonical_output).map_err(|_| CaptureArtifactError::ArtifactMissing)?;
    let image_metadata = post_check_capture_bytes(kind, &bytes).map_err(map_post_check_error)?;
    Ok(PersistedCaptureArtifact {
        output_path: canonical_output,
        lease_directory,
        artifact_ref,
        metadata: image_metadata,
    })
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum CaptureArtifactKindWire {
    CameraJpeg,
    ScreenPng,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum CaptureImageFormatWire {
    Jpeg,
    Png,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CaptureArtifactManifest {
    schema_version: u16,
    kind: CaptureArtifactKindWire,
    format: CaptureImageFormatWire,
    width: u32,
    height: u32,
    size_bytes: u64,
    sha256_digest: String,
}

impl CaptureArtifactManifest {
    fn from_metadata(metadata: &CaptureArtifactMetadata) -> Self {
        Self {
            schema_version: ARTIFACT_MANIFEST_SCHEMA_VERSION,
            kind: match metadata.kind() {
                CaptureArtifactKind::CameraJpeg => CaptureArtifactKindWire::CameraJpeg,
                CaptureArtifactKind::ScreenPng => CaptureArtifactKindWire::ScreenPng,
            },
            format: match metadata.format() {
                CaptureImageFormat::Jpeg => CaptureImageFormatWire::Jpeg,
                CaptureImageFormat::Png => CaptureImageFormatWire::Png,
            },
            width: metadata.width(),
            height: metadata.height(),
            size_bytes: metadata.size_bytes(),
            sha256_digest: metadata.sha256_digest().to_string(),
        }
    }

    fn matches(&self, metadata: &CaptureArtifactMetadata) -> bool {
        self.schema_version == ARTIFACT_MANIFEST_SCHEMA_VERSION
            && matches!(
                (&self.kind, metadata.kind()),
                (
                    CaptureArtifactKindWire::CameraJpeg,
                    CaptureArtifactKind::CameraJpeg
                ) | (
                    CaptureArtifactKindWire::ScreenPng,
                    CaptureArtifactKind::ScreenPng
                )
            )
            && matches!(
                (&self.format, metadata.format()),
                (CaptureImageFormatWire::Jpeg, CaptureImageFormat::Jpeg)
                    | (CaptureImageFormatWire::Png, CaptureImageFormat::Png)
            )
            && self.width == metadata.width()
            && self.height == metadata.height()
            && self.size_bytes == metadata.size_bytes()
            && self.sha256_digest == metadata.sha256_digest()
    }
}

fn write_manifest(
    directory: &Path,
    metadata: &CaptureArtifactMetadata,
) -> Result<(), CaptureArtifactError> {
    let path = directory.join(ARTIFACT_MANIFEST_FILE);
    let bytes = serde_json::to_vec(&CaptureArtifactManifest::from_metadata(metadata))
        .map_err(|_| CaptureArtifactError::StorageUnavailable)?;
    if bytes.len() > MAX_ARTIFACT_MANIFEST_BYTES {
        return Err(CaptureArtifactError::StorageUnavailable);
    }
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let write_result = (|| {
        let mut file = options
            .open(&path)
            .map_err(|_| CaptureArtifactError::StorageUnavailable)?;
        file.write_all(&bytes)
            .and_then(|()| file.sync_all())
            .map_err(|_| CaptureArtifactError::StorageUnavailable)?;
        sync_directory_metadata(directory).map_err(|_| CaptureArtifactError::StorageUnavailable)
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(path);
    }
    write_result
}

#[cfg(unix)]
fn sync_directory_metadata(directory: &Path) -> std::io::Result<()> {
    File::open(directory)?.sync_all()
}

#[cfg(windows)]
fn sync_directory_metadata(_directory: &Path) -> std::io::Result<()> {
    // Windows does not allow a directory to be opened through the ordinary
    // `File::open` contract used above on Unix. The manifest file itself was
    // already flushed with `sync_all`; closing that handle is the supported
    // durability boundary for this create-new artifact entry.
    Ok(())
}

#[cfg(not(any(unix, windows)))]
fn sync_directory_metadata(_directory: &Path) -> std::io::Result<()> {
    Ok(())
}

fn read_manifest(directory: &Path) -> Result<CaptureArtifactManifest, CaptureArtifactError> {
    let path = directory.join(ARTIFACT_MANIFEST_FILE);
    let metadata =
        fs::symlink_metadata(&path).map_err(|_| CaptureArtifactError::ArtifactMissing)?;
    if !metadata.is_file()
        || metadata.file_type().is_symlink()
        || metadata.len() as usize > MAX_ARTIFACT_MANIFEST_BYTES
    {
        return Err(CaptureArtifactError::ArtifactInvalid);
    }
    let bytes = fs::read(path).map_err(|_| CaptureArtifactError::ArtifactMissing)?;
    let manifest = serde_json::from_slice::<CaptureArtifactManifest>(&bytes)
        .map_err(|_| CaptureArtifactError::ArtifactInvalid)?;
    if manifest.schema_version != ARTIFACT_MANIFEST_SCHEMA_VERSION {
        return Err(CaptureArtifactError::ArtifactInvalid);
    }
    Ok(manifest)
}

fn map_post_check_error(error: CapturePostCheckError) -> CaptureArtifactError {
    match error {
        CapturePostCheckError::WrongFormat => CaptureArtifactError::ArtifactWrongFormat,
        CapturePostCheckError::Empty
        | CapturePostCheckError::TooLarge
        | CapturePostCheckError::Truncated
        | CapturePostCheckError::InvalidDimensions => CaptureArtifactError::ArtifactInvalid,
    }
}
