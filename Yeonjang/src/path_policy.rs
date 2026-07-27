use std::fs;
use std::path::{Component, Path, PathBuf};

pub use crate::settings::PathAccessSettings;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PathOperation {
    Read,
    Write,
    Delete,
    List,
    Metadata,
}

#[derive(Debug, Clone, Copy)]
pub struct PathAccessRequest<'a> {
    pub operation: PathOperation,
    pub requested_path: &'a Path,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PathAccessDecision {
    pub allowed: bool,
    pub canonical_path: Option<PathBuf>,
    pub reason_code: &'static str,
}

impl PathAccessDecision {
    pub fn allowed(path: PathBuf) -> Self {
        Self {
            allowed: true,
            canonical_path: Some(path),
            reason_code: "allowed",
        }
    }

    pub fn denied(reason_code: &'static str) -> Self {
        Self {
            allowed: false,
            canonical_path: None,
            reason_code,
        }
    }
}

pub fn authorize_path_access(
    policy: &PathAccessSettings,
    request: PathAccessRequest<'_>,
) -> PathAccessDecision {
    if request.requested_path.as_os_str().is_empty() {
        return PathAccessDecision::denied("empty_path");
    }
    if !policy.allow_hidden_files && contains_hidden_component(request.requested_path) {
        return PathAccessDecision::denied("hidden_path_denied");
    }
    if !policy.follow_symlinks && contains_symlink_component(request.requested_path) {
        return PathAccessDecision::denied("symlink_denied");
    }

    let candidate = match canonical_path_for_operation(request.operation, request.requested_path) {
        Some(path) => path,
        None => return PathAccessDecision::denied("path_not_found"),
    };

    if is_under_any(&candidate, &policy.denied_paths) {
        return PathAccessDecision::denied("path_denied");
    }

    let allowed_paths = match request.operation {
        PathOperation::Read | PathOperation::List | PathOperation::Metadata => {
            &policy.allowed_read_paths
        }
        PathOperation::Write | PathOperation::Delete => &policy.allowed_write_paths,
    };

    if !is_under_any(&candidate, allowed_paths) {
        return PathAccessDecision::denied("path_not_allowed");
    }

    PathAccessDecision::allowed(candidate)
}

fn canonical_path_for_operation(
    operation: PathOperation,
    requested_path: &Path,
) -> Option<PathBuf> {
    match operation {
        PathOperation::Write => {
            if requested_path.exists() {
                fs::canonicalize(requested_path).ok()
            } else {
                requested_path
                    .parent()
                    .and_then(|parent| fs::canonicalize(parent).ok())
                    .and_then(|parent| {
                        requested_path
                            .file_name()
                            .map(|file_name| parent.join(file_name))
                    })
            }
        }
        PathOperation::Read
        | PathOperation::Delete
        | PathOperation::List
        | PathOperation::Metadata => fs::canonicalize(requested_path).ok(),
    }
}

fn is_under_any(candidate: &Path, roots: &[String]) -> bool {
    roots
        .iter()
        .filter_map(|root| canonical_root(root))
        .any(|root| candidate == root || candidate.starts_with(root))
}

fn canonical_root(root: &str) -> Option<PathBuf> {
    let trimmed = root.trim();
    if trimmed.is_empty() {
        return None;
    }
    fs::canonicalize(trimmed).ok()
}

fn contains_hidden_component(path: &Path) -> bool {
    path.components().any(|component| match component {
        Component::Normal(value) => value
            .to_str()
            .map(|text| text.starts_with('.') && text != "." && text != "..")
            .unwrap_or(false),
        _ => false,
    })
}

fn contains_symlink_component(path: &Path) -> bool {
    fs::symlink_metadata(path)
        .map(|metadata| metadata.file_type().is_symlink())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
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
            "knowbee-path-policy-{name}-{}-{now}",
            process::id()
        ));
        fs::create_dir_all(&root).expect("temp root should be created");
        root
    }

    fn policy(read: &[&Path], write: &[&Path], denied: &[&Path]) -> PathAccessSettings {
        PathAccessSettings {
            allowed_read_paths: read.iter().map(|path| path.display().to_string()).collect(),
            allowed_write_paths: write
                .iter()
                .map(|path| path.display().to_string())
                .collect(),
            denied_paths: denied
                .iter()
                .map(|path| path.display().to_string())
                .collect(),
            max_read_bytes: 1024,
            max_write_bytes: 1024,
            allow_hidden_files: false,
            follow_symlinks: false,
        }
    }

    #[test]
    fn default_path_policy_is_fail_closed() {
        let root = temp_root("default");
        let file = root.join("note.txt");
        fs::write(&file, "hello").expect("fixture write");

        let decision = authorize_path_access(
            &PathAccessSettings::default(),
            PathAccessRequest {
                operation: PathOperation::Read,
                requested_path: &file,
            },
        );

        assert_eq!(decision, PathAccessDecision::denied("path_not_allowed"));
    }

    #[test]
    fn allows_read_inside_allowed_read_path() {
        let root = temp_root("allowed-read");
        let file = root.join("note.txt");
        fs::write(&file, "hello").expect("fixture write");

        let decision = authorize_path_access(
            &policy(&[&root], &[], &[]),
            PathAccessRequest {
                operation: PathOperation::Read,
                requested_path: &file,
            },
        );

        assert_eq!(
            decision,
            PathAccessDecision::allowed(fs::canonicalize(file).expect("canonical fixture"))
        );
    }

    #[test]
    fn denied_path_overrides_allowed_read_path() {
        let root = temp_root("denied");
        let blocked = root.join("blocked");
        fs::create_dir_all(&blocked).expect("blocked dir");
        let file = blocked.join("secret.txt");
        fs::write(&file, "secret").expect("fixture write");

        let decision = authorize_path_access(
            &policy(&[&root], &[], &[&blocked]),
            PathAccessRequest {
                operation: PathOperation::Read,
                requested_path: &file,
            },
        );

        assert_eq!(decision, PathAccessDecision::denied("path_denied"));
    }

    #[test]
    fn write_requires_write_allow_path() {
        let root = temp_root("write");
        let file = root.join("new.txt");

        let decision = authorize_path_access(
            &policy(&[&root], &[], &[]),
            PathAccessRequest {
                operation: PathOperation::Write,
                requested_path: &file,
            },
        );

        assert_eq!(decision, PathAccessDecision::denied("path_not_allowed"));
    }

    #[test]
    fn delete_requires_write_allow_path_and_list_uses_read_allow_path() {
        let root = temp_root("operation-split");
        let file = root.join("delete-me.txt");
        fs::write(&file, "delete").expect("fixture write");

        let delete_decision = authorize_path_access(
            &policy(&[&root], &[], &[]),
            PathAccessRequest {
                operation: PathOperation::Delete,
                requested_path: &file,
            },
        );
        let list_decision = authorize_path_access(
            &policy(&[&root], &[], &[]),
            PathAccessRequest {
                operation: PathOperation::List,
                requested_path: &root,
            },
        );
        let metadata_decision = authorize_path_access(
            &policy(&[&root], &[], &[]),
            PathAccessRequest {
                operation: PathOperation::Metadata,
                requested_path: &file,
            },
        );

        assert_eq!(
            delete_decision,
            PathAccessDecision::denied("path_not_allowed")
        );
        assert!(list_decision.allowed);
        assert!(metadata_decision.allowed);
    }

    #[test]
    fn hidden_path_is_blocked_by_default() {
        let root = temp_root("hidden");
        let file = root.join(".secret");
        fs::write(&file, "secret").expect("fixture write");

        let decision = authorize_path_access(
            &policy(&[&root], &[], &[]),
            PathAccessRequest {
                operation: PathOperation::Read,
                requested_path: &file,
            },
        );

        assert_eq!(decision, PathAccessDecision::denied("hidden_path_denied"));
    }

    #[cfg(unix)]
    #[test]
    fn symlink_escape_is_blocked_when_follow_symlinks_is_false() {
        use std::os::unix::fs::symlink;

        let allowed = temp_root("symlink-allowed");
        let outside = temp_root("symlink-outside");
        let outside_file = outside.join("secret.txt");
        fs::write(&outside_file, "secret").expect("fixture write");
        let link = allowed.join("link.txt");
        symlink(&outside_file, &link).expect("symlink");

        let decision = authorize_path_access(
            &policy(&[&allowed], &[], &[]),
            PathAccessRequest {
                operation: PathOperation::Read,
                requested_path: &link,
            },
        );

        assert_eq!(decision, PathAccessDecision::denied("symlink_denied"));
    }
}
