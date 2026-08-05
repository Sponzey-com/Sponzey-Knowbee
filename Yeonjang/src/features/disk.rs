use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, anyhow};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::path_policy::{
    PathAccessRequest, PathAccessSettings, PathOperation, authorize_path_access,
};

#[derive(Debug, Clone, Deserialize)]
pub struct DiskPathParams {
    pub path: String,
}

pub fn info(params: DiskPathParams, policy: &PathAccessSettings) -> Result<Value> {
    let canonical_path = allowed_existing_path(&params.path, policy, PathOperation::Metadata)?;
    let metadata = fs::metadata(&canonical_path)
        .with_context(|| format!("failed to read disk metadata: {}", canonical_path.display()))?;
    let usage = usage_for_path(&canonical_path)?;

    Ok(json!({
        "path": canonical_path.display().to_string(),
        "exists": true,
        "kind": path_kind(&metadata),
        "readonly": metadata.permissions().readonly(),
        "totalBytes": usage.total_bytes,
        "freeBytes": usage.free_bytes,
        "availableBytes": usage.available_bytes,
    }))
}

pub fn usage(params: DiskPathParams, policy: &PathAccessSettings) -> Result<Value> {
    let canonical_path = allowed_existing_path(&params.path, policy, PathOperation::Metadata)?;
    let usage = usage_for_path(&canonical_path)?;

    Ok(json!({
        "path": canonical_path.display().to_string(),
        "totalBytes": usage.total_bytes,
        "freeBytes": usage.free_bytes,
        "availableBytes": usage.available_bytes,
    }))
}

pub fn exists(params: DiskPathParams, policy: &PathAccessSettings) -> Result<Value> {
    let requested = PathBuf::from(params.path);
    if requested.exists() {
        let canonical_path =
            allowed_existing_path_path(&requested, policy, PathOperation::Metadata)?;
        let metadata = fs::metadata(&canonical_path).with_context(|| {
            format!("failed to read disk metadata: {}", canonical_path.display())
        })?;
        return Ok(json!({
            "path": canonical_path.display().to_string(),
            "exists": true,
            "kind": path_kind(&metadata),
            "readonly": metadata.permissions().readonly(),
        }));
    }

    let parent = requested
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .ok_or_else(|| anyhow!("path access denied: missing_parent"))?;
    let parent_canonical = allowed_existing_path_path(parent, policy, PathOperation::Metadata)?;
    let display_path = requested
        .file_name()
        .map(|name| parent_canonical.join(name))
        .unwrap_or(parent_canonical);

    Ok(json!({
        "path": display_path.display().to_string(),
        "exists": false,
    }))
}

struct DiskUsage {
    total_bytes: u64,
    free_bytes: u64,
    available_bytes: u64,
}

fn usage_for_path(path: &Path) -> Result<DiskUsage> {
    Ok(DiskUsage {
        total_bytes: fs2::total_space(path)
            .with_context(|| format!("failed to read total disk space: {}", path.display()))?,
        free_bytes: fs2::free_space(path)
            .with_context(|| format!("failed to read free disk space: {}", path.display()))?,
        available_bytes: fs2::available_space(path)
            .with_context(|| format!("failed to read available disk space: {}", path.display()))?,
    })
}

fn allowed_existing_path(
    path: &str,
    policy: &PathAccessSettings,
    operation: PathOperation,
) -> Result<PathBuf> {
    allowed_existing_path_path(&PathBuf::from(path), policy, operation)
}

fn allowed_existing_path_path(
    path: &Path,
    policy: &PathAccessSettings,
    operation: PathOperation,
) -> Result<PathBuf> {
    let decision = authorize_path_access(
        policy,
        PathAccessRequest {
            operation,
            requested_path: path,
        },
    );
    decision
        .canonical_path
        .ok_or_else(|| anyhow!("path access denied: {}", decision.reason_code))
}

fn path_kind(metadata: &fs::Metadata) -> &'static str {
    if metadata.is_dir() {
        "directory"
    } else if metadata.is_file() {
        "file"
    } else {
        "other"
    }
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
            "knowbee-disk-feature-{name}-{}-{now}",
            process::id()
        ));
        fs::create_dir_all(&root).expect("temp root");
        root
    }

    fn policy(root: &Path) -> PathAccessSettings {
        PathAccessSettings {
            allowed_read_paths: vec![root.display().to_string()],
            allowed_write_paths: Vec::new(),
            denied_paths: Vec::new(),
            max_read_bytes: 1024,
            max_write_bytes: 1024,
            allow_hidden_files: false,
            follow_symlinks: false,
        }
    }

    #[test]
    fn returns_disk_usage_for_allowed_path() {
        let root = temp_root("usage");

        let result = usage(
            DiskPathParams {
                path: root.display().to_string(),
            },
            &policy(&root),
        )
        .expect("disk usage");

        assert_eq!(
            result["path"],
            fs::canonicalize(&root).unwrap().display().to_string()
        );
        assert!(result["totalBytes"].as_u64().unwrap_or_default() > 0);
        assert!(result["availableBytes"].as_u64().unwrap_or_default() > 0);
    }

    #[test]
    fn returns_exists_false_when_parent_is_allowed() {
        let root = temp_root("exists-false");
        let missing = root.join("missing.txt");

        let result = exists(
            DiskPathParams {
                path: missing.display().to_string(),
            },
            &policy(&root),
        )
        .expect("disk exists");

        assert_eq!(result["exists"], false);
        assert!(
            result["path"]
                .as_str()
                .unwrap_or_default()
                .ends_with("missing.txt")
        );
    }

    #[test]
    fn blocks_disk_info_outside_allowed_path() {
        let root = temp_root("blocked-root");
        let outside = temp_root("blocked-outside");

        let error = info(
            DiskPathParams {
                path: outside.display().to_string(),
            },
            &policy(&root),
        )
        .expect_err("outside path should be denied");

        assert!(format!("{error:#}").contains("path access denied"));
    }
}
