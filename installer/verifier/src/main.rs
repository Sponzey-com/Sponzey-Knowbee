use std::collections::HashSet;
use std::env;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use flate2::read::GzDecoder;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const MAX_MANIFEST_BYTES: u64 = 2 * 1024 * 1024;
const MAX_ARTIFACT_BYTES: u64 = 10 * 1024 * 1024 * 1024;
const MAX_EXPANDED_BYTES: u64 = 20 * 1024 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES: usize = 100_000;
const SUPPORTED_TARGETS: [&str; 5] = [
    "darwin-arm64",
    "darwin-x64",
    "linux-x64",
    "win32-arm64",
    "win32-x64",
];

#[derive(Debug)]
struct Arguments {
    manifest: PathBuf,
    target: String,
    output_format: OutputFormat,
    artifact: Option<PathBuf>,
    stage: Option<PathBuf>,
}

#[derive(Debug, Default, PartialEq, Eq)]
enum OutputFormat {
    #[default]
    Json,
    Shell,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Manifest {
    kind: String,
    schema_version: u32,
    release_version: String,
    channel: String,
    node: NodeRelease,
    artifacts: Vec<Artifact>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NodeRelease {
    version: String,
    module_abi: u32,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Artifact {
    target: String,
    archive: String,
    name: String,
    size_bytes: u64,
    sha256: String,
    entrypoint: String,
    node_module_abi: u32,
    #[serde(default)]
    libc: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VerifiedReceipt {
    status: &'static str,
    manifest_sha256: String,
    release_version: String,
    node_version: String,
    node_module_abi: u32,
    target: String,
    archive: String,
    name: String,
    size_bytes: u64,
    sha256: String,
    entrypoint: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    staged_entrypoint: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RejectedReceipt {
    status: &'static str,
    reason_code: &'static str,
}

fn main() -> ExitCode {
    match verify() {
        Ok((receipt, output_format)) => {
            match output_format {
                OutputFormat::Json => emit_json(&receipt),
                OutputFormat::Shell => emit_shell(&receipt),
            }
            ExitCode::SUCCESS
        }
        Err(reason_code) => {
            emit_json(&RejectedReceipt {
                status: "rejected",
                reason_code,
            });
            ExitCode::FAILURE
        }
    }
}

fn emit_json(value: &impl Serialize) {
    // These structs contain only bounded, already validated scalar fields.
    if let Ok(json) = serde_json::to_string(value) {
        println!("{json}");
    }
}

fn emit_shell(receipt: &VerifiedReceipt) {
    // Validators constrain every value to this line-oriented grammar. The bootstrap parses each
    // named field with `read`/`case`; it never evaluates this output as shell source.
    println!("manifest_sha256={}", receipt.manifest_sha256);
    println!("release_version={}", receipt.release_version);
    println!("node_version={}", receipt.node_version);
    println!("node_module_abi={}", receipt.node_module_abi);
    println!("target={}", receipt.target);
    println!("archive={}", receipt.archive);
    println!("name={}", receipt.name);
    println!("size_bytes={}", receipt.size_bytes);
    println!("sha256={}", receipt.sha256);
    println!("entrypoint={}", receipt.entrypoint);
    if let Some(staged_entrypoint) = &receipt.staged_entrypoint {
        println!("staged_entrypoint={staged_entrypoint}");
    }
}

fn verify() -> Result<(VerifiedReceipt, OutputFormat), &'static str> {
    let arguments = parse_arguments(env::args_os().skip(1))?;
    if !SUPPORTED_TARGETS.contains(&arguments.target.as_str()) {
        return Err("manifest_target_unsupported");
    }

    let manifest_bytes = read_bounded_regular_file(&arguments.manifest, MAX_MANIFEST_BYTES)
        .map_err(|_| "manifest_invalid")?;
    let manifest: Manifest =
        serde_json::from_slice(&manifest_bytes).map_err(|_| "manifest_invalid")?;
    let artifact = validate_manifest_and_select(&manifest, &arguments.target)?;

    let staged_entrypoint = match (&arguments.artifact, &arguments.stage) {
        (Some(artifact_path), Some(stage_path)) => {
            let mut archive_file = open_verified_artifact(artifact_path, &artifact)?;
            stage_archive(&mut archive_file, &artifact, stage_path)?;
            Some(artifact.entrypoint.clone())
        }
        (None, None) => None,
        _ => return Err("verifier_arguments_invalid"),
    };

    Ok((
        VerifiedReceipt {
            status: "verified",
            manifest_sha256: format!("sha256:{}", sha256_hex(&manifest_bytes)),
            release_version: manifest.release_version,
            node_version: manifest.node.version,
            node_module_abi: manifest.node.module_abi,
            target: artifact.target,
            archive: artifact.archive,
            name: artifact.name,
            size_bytes: artifact.size_bytes,
            sha256: artifact.sha256,
            entrypoint: artifact.entrypoint,
            staged_entrypoint,
        },
        arguments.output_format,
    ))
}

fn parse_arguments(
    arguments: impl Iterator<Item = std::ffi::OsString>,
) -> Result<Arguments, &'static str> {
    let values: Vec<_> = arguments.collect();
    if values.len() < 4 || values.len() > 10 || values.len() % 2 != 0 {
        return Err("verifier_arguments_invalid");
    }

    let mut manifest = None;
    let mut target = None;
    let mut output_format = None;
    let mut artifact = None;
    let mut stage = None;
    for pair in values.chunks_exact(2) {
        let flag = pair[0].to_str().ok_or("verifier_arguments_invalid")?;
        let value = pair[1].clone();
        match flag {
            "--manifest" if manifest.is_none() => manifest = Some(PathBuf::from(value)),
            "--target" if target.is_none() => {
                target = Some(
                    value
                        .into_string()
                        .map_err(|_| "verifier_arguments_invalid")?,
                )
            }
            "--output-format" if output_format.is_none() => {
                output_format = Some(match value.to_str() {
                    Some("shell") => OutputFormat::Shell,
                    _ => return Err("verifier_arguments_invalid"),
                })
            }
            "--artifact" if artifact.is_none() => artifact = Some(PathBuf::from(value)),
            "--stage" if stage.is_none() => stage = Some(PathBuf::from(value)),
            _ => return Err("verifier_arguments_invalid"),
        }
    }

    Ok(Arguments {
        manifest: manifest.ok_or("verifier_arguments_invalid")?,
        target: target.ok_or("verifier_arguments_invalid")?,
        output_format: output_format.unwrap_or_default(),
        artifact,
        stage,
    })
}

fn open_verified_artifact(path: &Path, artifact: &Artifact) -> Result<File, &'static str> {
    let link_metadata = fs::symlink_metadata(path).map_err(|_| "artifact_read_failed")?;
    if link_metadata.file_type().is_symlink() || !link_metadata.is_file() {
        return Err("artifact_read_failed");
    }
    if link_metadata.len() != artifact.size_bytes {
        return Err("artifact_size_mismatch");
    }

    let mut file = File::open(path).map_err(|_| "artifact_read_failed")?;
    let opened_metadata = file.metadata().map_err(|_| "artifact_read_failed")?;
    if !opened_metadata.is_file() || opened_metadata.len() != artifact.size_bytes {
        return Err("artifact_size_mismatch");
    }
    let mut hasher = Sha256::new();
    let copied = io::copy(
        &mut Read::by_ref(&mut file).take(artifact.size_bytes + 1),
        &mut hasher,
    )
    .map_err(|_| "artifact_read_failed")?;
    if copied != artifact.size_bytes {
        return Err("artifact_size_mismatch");
    }
    if format!("{:x}", hasher.finalize()) != artifact.sha256 {
        return Err("artifact_digest_mismatch");
    }
    file.seek(SeekFrom::Start(0))
        .map_err(|_| "artifact_read_failed")?;
    Ok(file)
}

fn stage_archive(
    archive_file: &mut File,
    artifact: &Artifact,
    stage_path: &Path,
) -> Result<(), &'static str> {
    if fs::symlink_metadata(stage_path).is_ok() {
        return Err("artifact_stage_exists");
    }
    fs::create_dir(stage_path).map_err(|_| "artifact_stage_create_failed")?;
    let result = if artifact.archive == "tar.gz" {
        stage_tar_gz(archive_file, stage_path)
    } else {
        stage_zip(archive_file, stage_path)
    };
    if result.is_err() {
        let _ = fs::remove_dir_all(stage_path);
        return result;
    }

    let entrypoint_path = stage_path.join(&artifact.entrypoint);
    let entrypoint_metadata =
        fs::symlink_metadata(entrypoint_path).map_err(|_| "artifact_entrypoint_missing")?;
    if entrypoint_metadata.file_type().is_symlink() || !entrypoint_metadata.is_file() {
        let _ = fs::remove_dir_all(stage_path);
        return Err("artifact_entrypoint_invalid");
    }
    Ok(())
}

fn stage_tar_gz(archive_file: &mut File, stage_path: &Path) -> Result<(), &'static str> {
    let decoder = GzDecoder::new(archive_file);
    let mut archive = tar::Archive::new(decoder);
    let entries = archive.entries().map_err(|_| "artifact_archive_invalid")?;
    let mut seen = HashSet::new();
    let mut expanded_bytes = 0_u64;

    for (index, item) in entries.enumerate() {
        if index >= MAX_ARCHIVE_ENTRIES {
            return Err("artifact_archive_unsafe");
        }
        let mut entry = item.map_err(|_| "artifact_archive_invalid")?;
        let entry_type = entry.header().entry_type();
        if !entry_type.is_dir() && !entry_type.is_file() {
            return Err("artifact_archive_unsafe");
        }
        let path = entry
            .path()
            .map_err(|_| "artifact_archive_unsafe")?
            .to_str()
            .ok_or("artifact_archive_unsafe")?
            .trim_end_matches('/')
            .to_owned();
        let relative = reserve_archive_path(&path, &mut seen)?;
        let destination = stage_path.join(relative);
        if entry_type.is_dir() {
            fs::create_dir_all(&destination).map_err(|_| "artifact_archive_unsafe")?;
            continue;
        }

        let size = entry.size();
        expanded_bytes = expanded_bytes
            .checked_add(size)
            .filter(|total| *total <= MAX_EXPANDED_BYTES)
            .ok_or("artifact_archive_unsafe")?;
        create_parent_directories(stage_path, &destination)?;
        let mut output = create_new_file(&destination)?;
        let copied = io::copy(&mut entry, &mut output).map_err(|_| "artifact_archive_invalid")?;
        if copied != size {
            return Err("artifact_archive_invalid");
        }
        output.flush().map_err(|_| "artifact_archive_invalid")?;
        set_safe_permissions(&destination, entry.header().mode().unwrap_or(0o644))?;
    }
    Ok(())
}

fn stage_zip(archive_file: &mut File, stage_path: &Path) -> Result<(), &'static str> {
    let mut archive = zip::ZipArchive::new(archive_file).map_err(|_| "artifact_archive_invalid")?;
    if archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err("artifact_archive_unsafe");
    }
    let mut seen = HashSet::new();
    let mut expanded_bytes = 0_u64;

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|_| "artifact_archive_invalid")?;
        let mode = entry
            .unix_mode()
            .unwrap_or(if entry.is_dir() { 0o755 } else { 0o644 });
        let file_type = mode & 0o170000;
        if file_type != 0 && file_type != 0o100000 && !(entry.is_dir() && file_type == 0o040000) {
            return Err("artifact_archive_unsafe");
        }
        if !entry.is_dir() && !entry.is_file() {
            return Err("artifact_archive_unsafe");
        }
        let path = entry.name().trim_end_matches('/');
        let relative = reserve_archive_path(path, &mut seen)?;
        let destination = stage_path.join(relative);
        if entry.is_dir() {
            fs::create_dir_all(&destination).map_err(|_| "artifact_archive_unsafe")?;
            continue;
        }

        expanded_bytes = expanded_bytes
            .checked_add(entry.size())
            .filter(|total| *total <= MAX_EXPANDED_BYTES)
            .ok_or("artifact_archive_unsafe")?;
        create_parent_directories(stage_path, &destination)?;
        let mut output = create_new_file(&destination)?;
        let copied = io::copy(&mut entry, &mut output).map_err(|_| "artifact_archive_invalid")?;
        if copied != entry.size() {
            return Err("artifact_archive_invalid");
        }
        output.flush().map_err(|_| "artifact_archive_invalid")?;
        set_safe_permissions(&destination, mode)?;
    }
    Ok(())
}

fn reserve_archive_path(value: &str, seen: &mut HashSet<String>) -> Result<PathBuf, &'static str> {
    if !is_safe_relative_path(value) {
        return Err("artifact_archive_unsafe");
    }
    let folded = value.to_ascii_lowercase();
    if !seen.insert(folded) {
        return Err("artifact_archive_unsafe");
    }
    Ok(PathBuf::from(value))
}

fn create_parent_directories(stage_path: &Path, destination: &Path) -> Result<(), &'static str> {
    let parent = destination.parent().ok_or("artifact_archive_unsafe")?;
    if !parent.starts_with(stage_path) {
        return Err("artifact_archive_unsafe");
    }
    fs::create_dir_all(parent).map_err(|_| "artifact_archive_unsafe")
}

fn create_new_file(path: &Path) -> Result<File, &'static str> {
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|_| "artifact_archive_unsafe")
}

#[cfg(unix)]
fn set_safe_permissions(path: &Path, archive_mode: u32) -> Result<(), &'static str> {
    use std::os::unix::fs::PermissionsExt;

    let mode = if archive_mode & 0o111 == 0 {
        0o644
    } else {
        0o755
    };
    fs::set_permissions(path, fs::Permissions::from_mode(mode))
        .map_err(|_| "artifact_archive_invalid")
}

#[cfg(not(unix))]
fn set_safe_permissions(_path: &Path, _archive_mode: u32) -> Result<(), &'static str> {
    Ok(())
}

fn read_bounded_regular_file(path: &Path, maximum: u64) -> Result<Vec<u8>, ()> {
    let link_metadata = fs::symlink_metadata(path).map_err(|_| ())?;
    if link_metadata.file_type().is_symlink() || !link_metadata.is_file() {
        return Err(());
    }

    let file = File::open(path).map_err(|_| ())?;
    let metadata = file.metadata().map_err(|_| ())?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > maximum {
        return Err(());
    }

    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.take(maximum + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| ())?;
    if bytes.is_empty() || bytes.len() as u64 > maximum {
        return Err(());
    }
    Ok(bytes)
}

fn validate_manifest_and_select(
    manifest: &Manifest,
    requested_target: &str,
) -> Result<Artifact, &'static str> {
    if manifest.schema_version != 2 {
        return Err("schema_version_unsupported");
    }
    if manifest.kind != "knowbee.install.manifest"
        || manifest.channel != "stable"
        || !is_bounded_version(&manifest.release_version)
        || !is_node_24_patch(&manifest.node.version)
        || manifest.node.module_abi == 0
        || manifest.artifacts.len() != SUPPORTED_TARGETS.len()
    {
        return Err("manifest_invalid");
    }

    let mut targets = HashSet::with_capacity(SUPPORTED_TARGETS.len());
    for artifact in &manifest.artifacts {
        if !SUPPORTED_TARGETS.contains(&artifact.target.as_str())
            || !targets.insert(artifact.target.as_str())
            || artifact.node_module_abi != manifest.node.module_abi
            || artifact.size_bytes == 0
            || artifact.size_bytes > MAX_ARTIFACT_BYTES
            || !is_lower_sha256(&artifact.sha256)
            || !is_safe_name(&artifact.name)
            || !is_safe_relative_path(&artifact.entrypoint)
            || !archive_matches_target(&artifact.target, &artifact.archive)
            || !libc_matches_target(&artifact.target, artifact.libc.as_deref())
        {
            return Err("manifest_invalid");
        }
    }
    if SUPPORTED_TARGETS
        .iter()
        .any(|target| !targets.contains(target))
    {
        return Err("manifest_invalid");
    }

    manifest
        .artifacts
        .iter()
        .find(|artifact| artifact.target == requested_target)
        .cloned()
        .ok_or("manifest_target_unsupported")
}

fn is_bounded_version(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'+'))
}

fn is_node_24_patch(value: &str) -> bool {
    let parts: Vec<_> = value.split('.').collect();
    parts.len() == 3
        && parts[0] == "24"
        && parts[1].parse::<u32>().is_ok()
        && parts[2].parse::<u32>().is_ok()
}

fn is_lower_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn is_safe_name(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 255
        && value.as_bytes()[0].is_ascii_alphanumeric()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
}

fn is_safe_relative_path(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 512
        && !value.starts_with('/')
        && !value.contains('\\')
        && value.split('/').all(|part| {
            !part.is_empty()
                && part != "."
                && part != ".."
                && part.bytes().all(|byte| {
                    byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-' | b'@' | b'+')
                })
        })
}

fn archive_matches_target(target: &str, archive: &str) -> bool {
    if target.starts_with("win32-") {
        archive == "zip"
    } else {
        archive == "tar.gz"
    }
}

fn libc_matches_target(target: &str, libc: Option<&str>) -> bool {
    if target == "linux-x64" {
        libc == Some("glibc")
    } else {
        libc.is_none()
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn entrypoint_must_be_a_safe_relative_path() {
        assert!(is_safe_relative_path("bin/knowbee"));
        assert!(!is_safe_relative_path("../bin/knowbee"));
        assert!(!is_safe_relative_path("bin\\knowbee"));
        assert!(!is_safe_relative_path("/bin/knowbee"));
    }

    #[test]
    fn archive_and_libc_are_bound_to_the_target() {
        assert!(archive_matches_target("win32-x64", "zip"));
        assert!(!archive_matches_target("win32-x64", "tar.gz"));
        assert!(libc_matches_target("linux-x64", Some("glibc")));
        assert!(!libc_matches_target("darwin-arm64", Some("glibc")));
    }

    #[test]
    fn archive_paths_reject_traversal_and_case_collisions() {
        let mut seen = HashSet::new();
        assert_eq!(
            reserve_archive_path("bin/knowbee", &mut seen).unwrap(),
            PathBuf::from("bin/knowbee")
        );
        assert!(reserve_archive_path("bin/Knowbee", &mut seen).is_err());
        assert!(reserve_archive_path("../outside", &mut seen).is_err());
        assert!(reserve_archive_path("bin\\outside", &mut seen).is_err());
    }
}
