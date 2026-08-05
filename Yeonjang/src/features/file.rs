use std::fs;
use std::path::PathBuf;
use std::time::UNIX_EPOCH;

use anyhow::{Context, Result, anyhow};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::path_policy::{
    PathAccessRequest, PathAccessSettings, PathOperation, authorize_path_access,
};

#[derive(Debug, Clone, Deserialize)]
pub struct FilePathParams {
    pub path: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FileReadParams {
    pub path: String,
    pub max_bytes: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FileSearchParams {
    pub path: String,
    pub query: String,
    pub max_results: Option<usize>,
    pub max_preview_chars: Option<usize>,
    pub max_bytes_per_file: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FileWriteParams {
    pub path: String,
    pub text: String,
    #[serde(default)]
    pub overwrite: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FilePatchParams {
    pub path: String,
    pub expected_text: String,
    pub replacement_text: String,
    pub max_bytes: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FileDeleteParams {
    pub path: String,
}

pub fn metadata(params: FilePathParams, policy: &PathAccessSettings) -> Result<Value> {
    let path = PathBuf::from(params.path);
    let decision = authorize_path_access(
        policy,
        PathAccessRequest {
            operation: PathOperation::Metadata,
            requested_path: &path,
        },
    );
    let canonical_path = decision
        .canonical_path
        .ok_or_else(|| anyhow!("path access denied: {}", decision.reason_code))?;
    let metadata = fs::metadata(&canonical_path)
        .with_context(|| format!("failed to read metadata: {}", canonical_path.display()))?;

    Ok(json!({
        "path": canonical_path.display().to_string(),
        "kind": file_kind(&metadata),
        "bytes": metadata.len(),
        "readonly": metadata.permissions().readonly(),
        "modifiedAt": metadata.modified().ok().and_then(unix_millis),
    }))
}

pub fn list_path(params: FilePathParams, policy: &PathAccessSettings) -> Result<Value> {
    let path = PathBuf::from(params.path);
    let decision = authorize_path_access(
        policy,
        PathAccessRequest {
            operation: PathOperation::List,
            requested_path: &path,
        },
    );
    let canonical_path = decision
        .canonical_path
        .ok_or_else(|| anyhow!("path access denied: {}", decision.reason_code))?;
    let mut entries = fs::read_dir(&canonical_path)
        .with_context(|| format!("failed to list directory: {}", canonical_path.display()))?
        .map(|entry| {
            let entry = entry?;
            let metadata = entry.metadata()?;
            Ok(json!({
                "name": entry.file_name().to_string_lossy(),
                "kind": file_kind(&metadata),
                "bytes": metadata.len(),
                "readonly": metadata.permissions().readonly(),
                "modifiedAt": metadata.modified().ok().and_then(unix_millis),
            }))
        })
        .collect::<Result<Vec<_>>>()?;
    entries.sort_by(|left, right| {
        left["name"]
            .as_str()
            .unwrap_or_default()
            .cmp(right["name"].as_str().unwrap_or_default())
    });

    Ok(json!({
        "path": canonical_path.display().to_string(),
        "entries": entries,
    }))
}

pub fn read_file(params: FileReadParams, policy: &PathAccessSettings) -> Result<Value> {
    let path = PathBuf::from(params.path);
    let decision = authorize_path_access(
        policy,
        PathAccessRequest {
            operation: PathOperation::Read,
            requested_path: &path,
        },
    );
    let canonical_path = decision
        .canonical_path
        .ok_or_else(|| anyhow!("path access denied: {}", decision.reason_code))?;
    let total_bytes = fs::metadata(&canonical_path)
        .with_context(|| format!("failed to read metadata: {}", canonical_path.display()))?
        .len();
    let max_bytes = params
        .max_bytes
        .unwrap_or(policy.max_read_bytes)
        .min(policy.max_read_bytes);
    let bytes = fs::read(&canonical_path)
        .with_context(|| format!("failed to read file: {}", canonical_path.display()))?;
    let truncated = bytes.len() as u64 > max_bytes;
    let selected = &bytes[..bytes.len().min(max_bytes as usize)];
    let text = std::str::from_utf8(selected).context("file.read currently supports utf-8 text")?;

    Ok(json!({
        "path": canonical_path.display().to_string(),
        "encoding": "utf8",
        "text": text,
        "bytesRead": selected.len(),
        "totalBytes": total_bytes,
        "truncated": truncated,
    }))
}

pub fn search_files(params: FileSearchParams, policy: &PathAccessSettings) -> Result<Value> {
    let query = params.query.trim().to_string();
    if query.is_empty() {
        anyhow::bail!("file.search requires non-empty query");
    }
    let path = PathBuf::from(params.path);
    let decision = authorize_path_access(
        policy,
        PathAccessRequest {
            operation: PathOperation::Read,
            requested_path: &path,
        },
    );
    let canonical_path = decision
        .canonical_path
        .ok_or_else(|| anyhow!("path access denied: {}", decision.reason_code))?;
    let metadata = fs::metadata(&canonical_path)
        .with_context(|| format!("failed to read metadata: {}", canonical_path.display()))?;

    let max_results = params.max_results.unwrap_or(50).clamp(1, 200);
    let max_preview_chars = params.max_preview_chars.unwrap_or(160).clamp(40, 400);
    let max_bytes_per_file = params
        .max_bytes_per_file
        .unwrap_or(policy.max_read_bytes)
        .min(policy.max_read_bytes);
    let mut matches = Vec::new();
    let mut skipped_files = 0usize;
    let mut truncated = false;

    if metadata.is_file() {
        search_file_path(
            &canonical_path,
            &query,
            max_results,
            max_preview_chars,
            max_bytes_per_file,
            policy,
            &mut matches,
            &mut skipped_files,
            &mut truncated,
        )?;
    } else if metadata.is_dir() {
        search_directory_path(
            &canonical_path,
            &query,
            max_results,
            max_preview_chars,
            max_bytes_per_file,
            policy,
            &mut matches,
            &mut skipped_files,
            &mut truncated,
        )?;
    } else {
        anyhow::bail!("file.search supports files and directories only");
    }

    Ok(json!({
        "path": canonical_path.display().to_string(),
        "query": query,
        "matches": matches,
        "resultCount": matches.len(),
        "skippedFiles": skipped_files,
        "truncated": truncated,
    }))
}

#[allow(clippy::too_many_arguments)]
fn search_directory_path(
    directory: &PathBuf,
    query: &str,
    max_results: usize,
    max_preview_chars: usize,
    max_bytes_per_file: u64,
    policy: &PathAccessSettings,
    matches: &mut Vec<Value>,
    skipped_files: &mut usize,
    truncated: &mut bool,
) -> Result<()> {
    let mut entries = fs::read_dir(directory)
        .with_context(|| format!("failed to search directory: {}", directory.display()))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    entries.sort_by_key(|entry| entry.path());

    for entry in entries {
        if matches.len() >= max_results {
            *truncated = true;
            break;
        }
        let path = entry.path();
        let decision = authorize_path_access(
            policy,
            PathAccessRequest {
                operation: PathOperation::Read,
                requested_path: &path,
            },
        );
        let Some(canonical_path) = decision.canonical_path else {
            *skipped_files += 1;
            continue;
        };
        let metadata = match fs::metadata(&canonical_path) {
            Ok(metadata) => metadata,
            Err(_) => {
                *skipped_files += 1;
                continue;
            }
        };
        if metadata.is_dir() {
            search_directory_path(
                &canonical_path,
                query,
                max_results,
                max_preview_chars,
                max_bytes_per_file,
                policy,
                matches,
                skipped_files,
                truncated,
            )?;
        } else if metadata.is_file() {
            search_file_path(
                &canonical_path,
                query,
                max_results,
                max_preview_chars,
                max_bytes_per_file,
                policy,
                matches,
                skipped_files,
                truncated,
            )?;
        }
    }

    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn search_file_path(
    file: &PathBuf,
    query: &str,
    max_results: usize,
    max_preview_chars: usize,
    max_bytes_per_file: u64,
    policy: &PathAccessSettings,
    matches: &mut Vec<Value>,
    skipped_files: &mut usize,
    truncated: &mut bool,
) -> Result<()> {
    let decision = authorize_path_access(
        policy,
        PathAccessRequest {
            operation: PathOperation::Read,
            requested_path: file,
        },
    );
    let canonical_path = match decision.canonical_path {
        Some(path) => path,
        None => {
            *skipped_files += 1;
            return Ok(());
        }
    };
    let bytes = fs::read(&canonical_path).with_context(|| {
        format!(
            "failed to read file for search: {}",
            canonical_path.display()
        )
    })?;
    let file_truncated = bytes.len() as u64 > max_bytes_per_file;
    let selected = &bytes[..bytes.len().min(max_bytes_per_file as usize)];
    let Ok(text) = std::str::from_utf8(selected) else {
        *skipped_files += 1;
        return Ok(());
    };

    let mut byte_offset = 0usize;
    for (line_index, line) in text.lines().enumerate() {
        if matches.len() >= max_results {
            *truncated = true;
            break;
        }
        if let Some(column) = line.find(query) {
            matches.push(json!({
                "path": canonical_path.display().to_string(),
                "lineNumber": line_index + 1,
                "byteOffset": byte_offset + column,
                "preview": preview_line(line, max_preview_chars),
                "truncated": file_truncated || line.chars().count() > max_preview_chars,
            }));
        }
        byte_offset += line.len() + 1;
    }
    if file_truncated {
        *truncated = true;
    }

    Ok(())
}

fn preview_line(line: &str, max_chars: usize) -> String {
    line.chars().take(max_chars).collect()
}

pub fn write_file(params: FileWriteParams, policy: &PathAccessSettings) -> Result<Value> {
    let path = PathBuf::from(params.path);
    let decision = authorize_path_access(
        policy,
        PathAccessRequest {
            operation: PathOperation::Write,
            requested_path: &path,
        },
    );
    let canonical_path = decision
        .canonical_path
        .ok_or_else(|| anyhow!("path access denied: {}", decision.reason_code))?;
    let bytes = params.text.as_bytes();
    if bytes.len() as u64 > policy.max_write_bytes {
        anyhow::bail!(
            "write size exceeds max_write_bytes: {} > {}",
            bytes.len(),
            policy.max_write_bytes
        );
    }
    if canonical_path.exists() && !params.overwrite {
        anyhow::bail!("file already exists and overwrite is false");
    }
    fs::write(&canonical_path, bytes)
        .with_context(|| format!("failed to write file: {}", canonical_path.display()))?;
    let metadata = fs::metadata(&canonical_path).with_context(|| {
        format!(
            "failed to verify written file: {}",
            canonical_path.display()
        )
    })?;
    let post_check_verified = metadata.is_file() && metadata.len() == bytes.len() as u64;

    Ok(json!({
        "path": canonical_path.display().to_string(),
        "bytesWritten": bytes.len(),
        "overwrite": params.overwrite,
        "postCheck": {
            "verified": post_check_verified,
            "exists": canonical_path.exists(),
            "bytes": metadata.len(),
        },
    }))
}

pub fn patch_file(params: FilePatchParams, policy: &PathAccessSettings) -> Result<Value> {
    if params.expected_text.is_empty() {
        anyhow::bail!("file.patch requires non-empty expected_text");
    }
    let path = PathBuf::from(params.path);
    let decision = authorize_path_access(
        policy,
        PathAccessRequest {
            operation: PathOperation::Write,
            requested_path: &path,
        },
    );
    let canonical_path = decision
        .canonical_path
        .ok_or_else(|| anyhow!("path access denied: {}", decision.reason_code))?;
    let max_bytes = params
        .max_bytes
        .unwrap_or(policy.max_write_bytes)
        .min(policy.max_write_bytes);
    let original_bytes = fs::read(&canonical_path).with_context(|| {
        format!(
            "failed to read file before patch: {}",
            canonical_path.display()
        )
    })?;
    if original_bytes.len() as u64 > max_bytes {
        anyhow::bail!(
            "file size exceeds max_bytes: {} > {}",
            original_bytes.len(),
            max_bytes
        );
    }
    let original_text =
        std::str::from_utf8(&original_bytes).context("file.patch currently supports utf-8 text")?;
    let match_count = original_text.matches(&params.expected_text).count();
    if match_count != 1 {
        return Ok(json!({
            "path": canonical_path.display().to_string(),
            "changed": false,
            "reason": if match_count == 0 { "PATCH_MATCH_NOT_FOUND" } else { "PATCH_MATCH_NOT_UNIQUE" },
            "matchCount": match_count,
            "bytesBefore": original_bytes.len(),
            "bytesAfter": original_bytes.len(),
            "postCheck": {
                "verified": false,
                "exists": canonical_path.exists(),
                "bytes": original_bytes.len(),
            },
        }));
    }
    let patched_text = original_text.replacen(&params.expected_text, &params.replacement_text, 1);
    let patched_bytes = patched_text.as_bytes();
    if patched_bytes.len() as u64 > policy.max_write_bytes {
        anyhow::bail!(
            "patched size exceeds max_write_bytes: {} > {}",
            patched_bytes.len(),
            policy.max_write_bytes
        );
    }
    fs::write(&canonical_path, patched_bytes)
        .with_context(|| format!("failed to patch file: {}", canonical_path.display()))?;
    let verified_text = fs::read_to_string(&canonical_path).with_context(|| {
        format!(
            "failed to verify patched file: {}",
            canonical_path.display()
        )
    })?;
    let metadata = fs::metadata(&canonical_path).with_context(|| {
        format!(
            "failed to read patched metadata: {}",
            canonical_path.display()
        )
    })?;
    let post_check_verified = verified_text == patched_text
        && !verified_text.contains(&params.expected_text)
        && verified_text.contains(&params.replacement_text);

    Ok(json!({
        "path": canonical_path.display().to_string(),
        "changed": true,
        "reason": "PATCH_APPLIED",
        "matchCount": match_count,
        "bytesBefore": original_bytes.len(),
        "bytesAfter": patched_bytes.len(),
        "postCheck": {
            "verified": post_check_verified,
            "exists": canonical_path.exists(),
            "bytes": metadata.len(),
        },
    }))
}

pub fn delete_path(params: FileDeleteParams, policy: &PathAccessSettings) -> Result<Value> {
    let path = PathBuf::from(params.path);
    let decision = authorize_path_access(
        policy,
        PathAccessRequest {
            operation: PathOperation::Delete,
            requested_path: &path,
        },
    );
    let canonical_path = decision
        .canonical_path
        .ok_or_else(|| anyhow!("path access denied: {}", decision.reason_code))?;
    let metadata = fs::metadata(&canonical_path).with_context(|| {
        format!(
            "failed to read metadata before delete: {}",
            canonical_path.display()
        )
    })?;
    let kind = file_kind(&metadata);
    if metadata.is_dir() {
        fs::remove_dir(&canonical_path).with_context(|| {
            format!(
                "failed to delete empty directory: {}",
                canonical_path.display()
            )
        })?;
    } else if metadata.is_file() {
        fs::remove_file(&canonical_path)
            .with_context(|| format!("failed to delete file: {}", canonical_path.display()))?;
    } else {
        anyhow::bail!("file.delete supports files and empty directories only");
    }
    let exists = canonical_path.exists();

    Ok(json!({
        "path": canonical_path.display().to_string(),
        "deleted": !exists,
        "kind": kind,
        "postCheck": {
            "verified": !exists,
            "exists": exists,
        },
    }))
}

fn file_kind(metadata: &fs::Metadata) -> &'static str {
    if metadata.is_dir() {
        "directory"
    } else if metadata.is_file() {
        "file"
    } else {
        "other"
    }
}

fn unix_millis(time: std::time::SystemTime) -> Option<u64> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| u64::try_from(duration.as_millis()).unwrap_or(u64::MAX))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::PathAccessSettings;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::process;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_root(name: &str) -> PathBuf {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or_default();
        let root = std::env::temp_dir().join(format!(
            "knowbee-file-feature-{name}-{}-{now}",
            process::id()
        ));
        fs::create_dir_all(&root).expect("temp root");
        root
    }

    fn policy(root: &Path, max_read_bytes: u64) -> PathAccessSettings {
        PathAccessSettings {
            allowed_read_paths: vec![root.display().to_string()],
            allowed_write_paths: Vec::new(),
            denied_paths: Vec::new(),
            max_read_bytes,
            max_write_bytes: 1024,
            allow_hidden_files: false,
            follow_symlinks: false,
        }
    }

    #[test]
    fn reads_utf8_file_with_truncation_receipt() {
        let root = temp_root("read");
        let file = root.join("note.txt");
        fs::write(&file, "abcdef").expect("fixture write");

        let result = read_file(
            FileReadParams {
                path: file.display().to_string(),
                max_bytes: None,
            },
            &policy(&root, 3),
        )
        .expect("read file");

        assert_eq!(result["text"], "abc");
        assert_eq!(result["truncated"], true);
        assert_eq!(result["bytesRead"], 3);
        assert_eq!(result["totalBytes"], 6);
    }

    #[test]
    fn lists_directory_entries_without_file_contents() {
        let root = temp_root("list");
        fs::write(root.join("b.txt"), "b").expect("fixture write");
        fs::write(root.join("a.txt"), "a").expect("fixture write");

        let result = list_path(
            FilePathParams {
                path: root.display().to_string(),
            },
            &policy(&root, 1024),
        )
        .expect("list path");

        let names = result["entries"]
            .as_array()
            .expect("entries")
            .iter()
            .map(|entry| entry["name"].as_str().unwrap_or_default().to_string())
            .collect::<Vec<_>>();
        assert_eq!(names, vec!["a.txt", "b.txt"]);
        assert!(result.to_string().contains("bytes"));
        assert!(!result.to_string().contains("\"a\""));
        assert!(!result.to_string().contains("\"b\""));
    }

    #[test]
    fn returns_metadata_for_allowed_path() {
        let root = temp_root("metadata");
        let file = root.join("note.txt");
        fs::write(&file, "hello").expect("fixture write");

        let result = metadata(
            FilePathParams {
                path: file.display().to_string(),
            },
            &policy(&root, 1024),
        )
        .expect("metadata");

        assert_eq!(result["kind"], "file");
        assert_eq!(result["bytes"], 5);
    }

    #[test]
    fn blocks_read_outside_path_policy() {
        let root = temp_root("allowed");
        let outside = temp_root("outside");
        let file = outside.join("secret.txt");
        fs::write(&file, "secret").expect("fixture write");

        let error = read_file(
            FileReadParams {
                path: file.display().to_string(),
                max_bytes: None,
            },
            &policy(&root, 1024),
        )
        .expect_err("outside path should be denied");

        assert!(format!("{error:#}").contains("path_not_allowed"));
    }

    #[test]
    fn searches_allowed_utf8_files_with_bounded_previews() {
        let root = temp_root("search");
        let nested = root.join("nested");
        fs::create_dir_all(&nested).expect("nested dir");
        fs::write(root.join("a.txt"), "alpha\nneedle one\nomega").expect("fixture write");
        fs::write(nested.join("b.txt"), "needle two is here").expect("fixture write");

        let result = search_files(
            FileSearchParams {
                path: root.display().to_string(),
                query: "needle".to_string(),
                max_results: Some(10),
                max_preview_chars: Some(80),
                max_bytes_per_file: None,
            },
            &policy(&root, 1024),
        )
        .expect("search files");

        assert_eq!(result["resultCount"], 2);
        assert_eq!(result["matches"][0]["lineNumber"], 2);
        assert!(
            result["matches"][0]["preview"]
                .as_str()
                .unwrap_or_default()
                .contains("needle")
        );
        assert!(!result.to_string().contains("alpha\\nomega"));
    }

    #[test]
    fn search_blocks_outside_path_policy() {
        let root = temp_root("search-allowed");
        let outside = temp_root("search-outside");
        let file = outside.join("secret.txt");
        fs::write(&file, "needle secret").expect("fixture write");

        let error = search_files(
            FileSearchParams {
                path: file.display().to_string(),
                query: "needle".to_string(),
                max_results: None,
                max_preview_chars: None,
                max_bytes_per_file: None,
            },
            &policy(&root, 1024),
        )
        .expect_err("outside search should be denied");

        assert!(format!("{error:#}").contains("path_not_allowed"));
    }

    fn write_policy(root: &Path, max_write_bytes: u64) -> PathAccessSettings {
        PathAccessSettings {
            allowed_read_paths: vec![root.display().to_string()],
            allowed_write_paths: vec![root.display().to_string()],
            denied_paths: Vec::new(),
            max_read_bytes: 1024,
            max_write_bytes,
            allow_hidden_files: false,
            follow_symlinks: false,
        }
    }

    #[test]
    fn writes_utf8_file_with_post_check() {
        let root = temp_root("write");
        let file = root.join("note.txt");

        let result = write_file(
            FileWriteParams {
                path: file.display().to_string(),
                text: "hello".to_string(),
                overwrite: false,
            },
            &write_policy(&root, 1024),
        )
        .expect("write file");

        assert_eq!(fs::read_to_string(&file).expect("written text"), "hello");
        assert_eq!(result["bytesWritten"], 5);
        assert_eq!(result["postCheck"]["verified"], true);
    }

    #[test]
    fn patch_replaces_exact_single_match_with_post_check() {
        let root = temp_root("patch");
        let file = root.join("note.txt");
        fs::write(&file, "alpha beta gamma").expect("fixture write");

        let result = patch_file(
            FilePatchParams {
                path: file.display().to_string(),
                expected_text: "beta".to_string(),
                replacement_text: "BETA".to_string(),
                max_bytes: None,
            },
            &write_policy(&root, 1024),
        )
        .expect("patch file");

        assert_eq!(result["changed"], true);
        assert_eq!(result["reason"], "PATCH_APPLIED");
        assert_eq!(result["postCheck"]["verified"], true);
        assert_eq!(
            fs::read_to_string(&file).expect("patched file"),
            "alpha BETA gamma"
        );
    }

    #[test]
    fn patch_does_not_modify_missing_or_duplicate_match() {
        let root = temp_root("patch-noop");
        let missing = root.join("missing.txt");
        let duplicate = root.join("duplicate.txt");
        fs::write(&missing, "alpha beta").expect("fixture write");
        fs::write(&duplicate, "alpha beta beta").expect("fixture write");

        let missing_result = patch_file(
            FilePatchParams {
                path: missing.display().to_string(),
                expected_text: "delta".to_string(),
                replacement_text: "DELTA".to_string(),
                max_bytes: None,
            },
            &write_policy(&root, 1024),
        )
        .expect("missing patch");
        let duplicate_result = patch_file(
            FilePatchParams {
                path: duplicate.display().to_string(),
                expected_text: "beta".to_string(),
                replacement_text: "BETA".to_string(),
                max_bytes: None,
            },
            &write_policy(&root, 1024),
        )
        .expect("duplicate patch");

        assert_eq!(missing_result["changed"], false);
        assert_eq!(missing_result["reason"], "PATCH_MATCH_NOT_FOUND");
        assert_eq!(duplicate_result["changed"], false);
        assert_eq!(duplicate_result["reason"], "PATCH_MATCH_NOT_UNIQUE");
        assert_eq!(
            fs::read_to_string(&missing).expect("missing file"),
            "alpha beta"
        );
        assert_eq!(
            fs::read_to_string(&duplicate).expect("duplicate file"),
            "alpha beta beta"
        );
    }

    #[test]
    fn patch_requires_write_path_policy() {
        let root = temp_root("patch-policy");
        let file = root.join("note.txt");
        fs::write(&file, "alpha beta").expect("fixture write");

        let result = patch_file(
            FilePatchParams {
                path: file.display().to_string(),
                expected_text: "beta".to_string(),
                replacement_text: "BETA".to_string(),
                max_bytes: None,
            },
            &policy(&root, 1024),
        );

        assert!(
            result
                .expect_err("policy denial")
                .to_string()
                .contains("path access denied")
        );
        assert_eq!(
            fs::read_to_string(&file).expect("unchanged file"),
            "alpha beta"
        );
    }

    #[test]
    fn write_respects_max_write_bytes() {
        let root = temp_root("write-limit");
        let file = root.join("note.txt");

        let error = write_file(
            FileWriteParams {
                path: file.display().to_string(),
                text: "hello".to_string(),
                overwrite: false,
            },
            &write_policy(&root, 3),
        )
        .expect_err("oversized write should fail");

        assert!(format!("{error:#}").contains("max_write_bytes"));
    }

    #[test]
    fn delete_file_returns_post_check() {
        let root = temp_root("delete");
        let file = root.join("remove.txt");
        fs::write(&file, "delete").expect("fixture write");

        let result = delete_path(
            FileDeleteParams {
                path: file.display().to_string(),
            },
            &write_policy(&root, 1024),
        )
        .expect("delete file");

        assert!(!file.exists());
        assert_eq!(result["deleted"], true);
        assert_eq!(result["postCheck"]["verified"], true);
    }

    #[test]
    fn write_and_delete_require_write_path_policy() {
        let root = temp_root("write-denied-root");
        let outside = temp_root("write-denied-outside");
        let file = outside.join("note.txt");

        let write_error = write_file(
            FileWriteParams {
                path: file.display().to_string(),
                text: "hello".to_string(),
                overwrite: false,
            },
            &write_policy(&root, 1024),
        )
        .expect_err("outside write should be denied");
        assert!(format!("{write_error:#}").contains("path access denied"));

        fs::write(&file, "delete").expect("fixture write");
        let delete_error = delete_path(
            FileDeleteParams {
                path: file.display().to_string(),
            },
            &write_policy(&root, 1024),
        )
        .expect_err("outside delete should be denied");
        assert!(format!("{delete_error:#}").contains("path access denied"));
    }
}
