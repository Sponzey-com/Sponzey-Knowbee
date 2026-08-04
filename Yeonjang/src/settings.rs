use std::env;
use std::fmt;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result};
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const SETTINGS_SCHEMA_VERSION: u16 = 1;
const SETTINGS_MAX_FILE_BYTES: usize = 1024 * 1024;
const SETTINGS_MAX_IDENTITY_BYTES: usize = 256;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SettingsLoadError {
    Unavailable,
    Corrupt,
    UnsupportedVersion,
    InvalidValue,
}

impl std::fmt::Display for SettingsLoadError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(match self {
            Self::Unavailable => "settings_unavailable",
            Self::Corrupt => "settings_corrupt",
            Self::UnsupportedVersion => "settings_version_unsupported",
            Self::InvalidValue => "settings_value_invalid",
        })
    }
}

impl std::error::Error for SettingsLoadError {}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SettingsBackupResult {
    Created,
    Missing,
    AlreadyExists,
    InvalidPrimary,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SettingsRollbackResult {
    Restored,
    InvalidBackup,
    Unavailable,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum UiLanguage {
    Ko,
    #[default]
    En,
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct YeonjangSettings {
    pub schema_version: u16,
    pub ui_language: UiLanguage,
    #[serde(default)]
    pub permission_review_required: bool,
    pub instance_id: String,
    pub instance_alias: String,
    pub node_id: String,
    pub display_name: String,
    pub support_profile: String,
    pub workspace_scope_id: String,
    #[serde(default, skip_serializing)]
    pub pairing_secret: String,
    pub host_fingerprint: String,
    pub install_fingerprint: String,
    pub connection: BrokerConnectionSettings,
    pub mqtt_v2: MqttV2EnrollmentSettings,
    pub mqtt: MqttTopicSettings,
    pub permissions: PermissionSettings,
    pub path_access: PathAccessSettings,
    pub capture_artifact_root: String,
}

impl fmt::Debug for YeonjangSettings {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("YeonjangSettings")
            .field("schema_version", &self.schema_version)
            .field("ui_language", &self.ui_language)
            .field(
                "permission_review_required",
                &self.permission_review_required,
            )
            .field("identity", &"[REDACTED]")
            .field("pairing_secret", &"[REDACTED]")
            .field("connection", &self.connection)
            .field("mqtt_v2", &self.mqtt_v2)
            .field("permissions", &self.permissions)
            .field("path_access", &"[REDACTED]")
            .field("capture_artifact_root", &"[REDACTED]")
            .finish()
    }
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct BrokerConnectionSettings {
    pub host: String,
    pub port: u16,
    pub username: String,
    #[serde(default, skip_serializing)]
    pub password: String,
    pub auto_connect: bool,
    pub launch_on_system_start: bool,
}

/// Exact non-secret direct-MQTT-v2 enrollment selected by the local user.
///
/// These identities are not inferred from broker credentials or display
/// names. Empty values mean v2 activation is not configured.
#[derive(Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(default)]
pub struct MqttV2EnrollmentSettings {
    pub session_id: String,
    pub requester_id: String,
}

impl fmt::Debug for MqttV2EnrollmentSettings {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("MqttV2EnrollmentSettings")
            .field(
                "session_id",
                &if self.session_id.is_empty() {
                    "[EMPTY]"
                } else {
                    "[CONFIGURED]"
                },
            )
            .field(
                "requester_id",
                &if self.requester_id.is_empty() {
                    "[EMPTY]"
                } else {
                    "[CONFIGURED]"
                },
            )
            .finish()
    }
}

impl fmt::Debug for BrokerConnectionSettings {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("BrokerConnectionSettings")
            .field(
                "host",
                &if self.host.trim().is_empty() {
                    "[EMPTY]"
                } else {
                    "[CONFIGURED]"
                },
            )
            .field("port", &self.port)
            .field(
                "username",
                &if self.username.trim().is_empty() {
                    "[EMPTY]"
                } else {
                    "[CONFIGURED]"
                },
            )
            .field("password", &"[REDACTED]")
            .field("auto_connect", &self.auto_connect)
            .field("launch_on_system_start", &self.launch_on_system_start)
            .finish()
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct MqttTopicSettings {
    pub status_topic: String,
    pub capabilities_topic: String,
    pub request_topic: String,
    pub response_topic: String,
    pub event_topic: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct PathAccessSettings {
    pub allowed_read_paths: Vec<String>,
    pub allowed_write_paths: Vec<String>,
    pub denied_paths: Vec<String>,
    pub max_read_bytes: u64,
    pub max_write_bytes: u64,
    pub allow_hidden_files: bool,
    pub follow_symlinks: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct PermissionSettings {
    #[serde(default)]
    pub allow_file_read: bool,
    #[serde(default)]
    pub allow_file_write: bool,
    #[serde(default)]
    pub allow_file_delete: bool,
    #[serde(default)]
    pub allow_disk_read: bool,
    #[serde(default)]
    pub allow_camera_access: bool,
    #[serde(default)]
    pub allow_clipboard_read: bool,
    #[serde(default)]
    pub allow_clipboard_write: bool,
    #[serde(default)]
    pub allow_process_read: bool,
    #[serde(default)]
    pub allow_process_control: bool,
    #[serde(default)]
    pub allow_browser_read: bool,
    #[serde(default)]
    pub allow_browser_control: bool,
    #[serde(default)]
    pub allow_network_read: bool,
    #[serde(default)]
    pub allow_device_status: bool,
    #[serde(default)]
    pub allow_system_control: bool,
    #[serde(default)]
    pub allow_shell_exec: bool,
    #[serde(default)]
    pub allow_application_launch: bool,
    #[serde(default)]
    pub allow_screen_capture: bool,
    #[serde(default)]
    pub allow_keyboard_control: bool,
    #[serde(default)]
    pub allow_mouse_control: bool,
}

impl Default for YeonjangSettings {
    fn default() -> Self {
        let node_id = "yeonjang-main".to_string();
        let mut settings = Self {
            schema_version: SETTINGS_SCHEMA_VERSION,
            ui_language: UiLanguage::En,
            permission_review_required: false,
            instance_id: String::new(),
            instance_alias: String::new(),
            node_id,
            display_name: "Yeonjang".to_string(),
            support_profile: "desktop_interactive".to_string(),
            workspace_scope_id: String::new(),
            pairing_secret: String::new(),
            host_fingerprint: String::new(),
            install_fingerprint: String::new(),
            connection: BrokerConnectionSettings::default(),
            mqtt_v2: MqttV2EnrollmentSettings::default(),
            mqtt: MqttTopicSettings::default(),
            permissions: PermissionSettings::default(),
            path_access: PathAccessSettings::default(),
            capture_artifact_root: default_capture_artifact_root(),
        };
        settings.apply_identity_defaults();
        settings.reset_topics_from_node_id();
        settings
    }
}

impl Default for BrokerConnectionSettings {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".to_string(),
            port: 1883,
            username: String::new(),
            password: String::new(),
            auto_connect: true,
            launch_on_system_start: false,
        }
    }
}

impl Default for PathAccessSettings {
    fn default() -> Self {
        Self {
            allowed_read_paths: Vec::new(),
            allowed_write_paths: Vec::new(),
            denied_paths: Vec::new(),
            max_read_bytes: 1_048_576,
            max_write_bytes: 1_048_576,
            allow_hidden_files: false,
            follow_symlinks: false,
        }
    }
}

impl YeonjangSettings {
    pub fn reset_topics_from_node_id(&mut self) {
        let prefix = format!("knowbee/v1/node/{}", self.node_id.trim());
        self.mqtt.status_topic = format!("{prefix}/status");
        self.mqtt.capabilities_topic = format!("{prefix}/capabilities");
        self.mqtt.request_topic = format!("{prefix}/request");
        self.mqtt.response_topic = format!("{prefix}/response");
        self.mqtt.event_topic = format!("{prefix}/event");
    }

    pub fn apply_identity_defaults(&mut self) {
        if self.display_name.trim().is_empty() {
            self.display_name = "Yeonjang".to_string();
        }
        if self.instance_id.trim().is_empty() {
            self.instance_id = generate_instance_id();
        }
        if self.instance_alias.trim().is_empty() {
            self.instance_alias = default_instance_alias();
        }
        if self.node_id.trim().is_empty() {
            self.node_id = "yeonjang-main".to_string();
        }
        if self.support_profile.trim().is_empty() {
            self.support_profile = "desktop_interactive".to_string();
        }
        if self.workspace_scope_id.trim().is_empty() {
            self.workspace_scope_id = "workspace:local-default".to_string();
        }
        if self.host_fingerprint.trim().is_empty() {
            self.host_fingerprint = compute_host_fingerprint();
        }
        if self.install_fingerprint.trim().is_empty() {
            self.install_fingerprint = stable_hex_hash(&format!(
                "{}|{}",
                self.instance_id,
                settings_path().display()
            ));
        }
    }

    pub fn pairing_fingerprint(&self) -> Option<String> {
        let secret = self.pairing_secret.trim();
        if secret.is_empty() {
            None
        } else {
            let mut hasher = Sha256::new();
            hasher.update(secret.as_bytes());
            Some(format!("{:x}", hasher.finalize()))
        }
    }

    pub fn without_runtime_secrets(mut self) -> Self {
        self.pairing_secret.clear();
        self.connection.password.clear();
        self
    }

    pub fn runtime_snapshot(mut self) -> Self {
        if self.permission_review_required {
            self.permissions.disable_side_effects();
        }
        self
    }

    pub fn confirm_permission_review(&mut self) {
        self.permission_review_required = false;
    }

    fn validate(&self) -> Result<(), SettingsLoadError> {
        if self.schema_version != SETTINGS_SCHEMA_VERSION {
            return Err(SettingsLoadError::UnsupportedVersion);
        }
        if self.instance_id.trim().is_empty()
            || self.instance_id.len() > SETTINGS_MAX_IDENTITY_BYTES
            || self.node_id.trim().is_empty()
            || self.node_id.len() > SETTINGS_MAX_IDENTITY_BYTES
            || self.connection.port == 0
        {
            return Err(SettingsLoadError::InvalidValue);
        }
        Ok(())
    }
}

impl PermissionSettings {
    fn has_enabled_side_effect(&self) -> bool {
        self.allow_file_write
            || self.allow_file_delete
            || self.allow_camera_access
            || self.allow_clipboard_write
            || self.allow_process_control
            || self.allow_browser_control
            || self.allow_system_control
            || self.allow_shell_exec
            || self.allow_application_launch
            || self.allow_screen_capture
            || self.allow_keyboard_control
            || self.allow_mouse_control
    }

    fn disable_side_effects(&mut self) {
        self.allow_file_write = false;
        self.allow_file_delete = false;
        self.allow_camera_access = false;
        self.allow_clipboard_write = false;
        self.allow_process_control = false;
        self.allow_browser_control = false;
        self.allow_system_control = false;
        self.allow_shell_exec = false;
        self.allow_application_launch = false;
        self.allow_screen_capture = false;
        self.allow_keyboard_control = false;
        self.allow_mouse_control = false;
    }
}

pub fn settings_path() -> PathBuf {
    if let Some(project_dirs) = ProjectDirs::from("com", "Sponzey", "Knowbee") {
        return project_dirs
            .config_dir()
            .join("yeonjang")
            .join("settings.json");
    }

    PathBuf::from("Yeonjang").join("settings.json")
}

fn default_capture_artifact_root() -> String {
    if let Some(project_dirs) = ProjectDirs::from("com", "Sponzey", "Knowbee") {
        return project_dirs
            .data_local_dir()
            .join("yeonjang")
            .join("capture-artifacts")
            .display()
            .to_string();
    }
    PathBuf::from("Yeonjang")
        .join("capture-artifacts")
        .display()
        .to_string()
}

pub fn browser_focus_nonce_state_path() -> PathBuf {
    settings_path()
        .parent()
        .map(|parent| parent.join("browser-focus-consumed-nonces.json"))
        .unwrap_or_else(|| PathBuf::from("Yeonjang").join("browser-focus-consumed-nonces.json"))
}

pub fn load_settings() -> Result<YeonjangSettings, SettingsLoadError> {
    let path = settings_path();
    load_settings_at(&path)
}

pub fn load_runtime_settings() -> Result<YeonjangSettings, SettingsLoadError> {
    load_settings().map(YeonjangSettings::runtime_snapshot)
}

/// Loads one explicit bootstrap snapshot without changing the process default.
///
/// A missing regular file yields validated defaults. A symlink, unreadable
/// file, oversized input, unsupported schema, or invalid value fails closed;
/// this function never persists or migrates the supplied path.
pub fn load_settings_at(path: &Path) -> Result<YeonjangSettings, SettingsLoadError> {
    match path.symlink_metadata() {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            return Err(SettingsLoadError::Unavailable);
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(YeonjangSettings::default());
        }
        Err(_) => return Err(SettingsLoadError::Unavailable),
    }

    let raw = read_bounded_settings_file(path).map_err(|_| SettingsLoadError::Unavailable)?;
    decode_and_validate_settings(&raw)
}

#[cfg(test)]
fn load_settings_from_path(path: &Path) -> Result<YeonjangSettings, SettingsLoadError> {
    load_settings_at(path)
}

pub fn save_settings(settings: &YeonjangSettings) -> Result<PathBuf> {
    let path = settings_path();
    save_settings_to_path(settings, &path)?;
    Ok(path)
}

pub fn save_settings_to_path(settings: &YeonjangSettings, path: &Path) -> Result<()> {
    settings
        .validate()
        .map_err(|error| anyhow::anyhow!("invalid settings: {error}"))?;
    ensure_parent_dir(path)?;

    let content = serde_json::to_string_pretty(settings)?;
    atomic_replace_settings(path, content.as_bytes())
}

pub fn create_settings_backup(path: &Path, backup_path: &Path) -> SettingsBackupResult {
    if path == backup_path || reject_settings_symlink(path).is_err() {
        return SettingsBackupResult::Unavailable;
    }
    if backup_path.exists() {
        return SettingsBackupResult::AlreadyExists;
    }
    if reject_settings_symlink(backup_path).is_err() {
        return SettingsBackupResult::Unavailable;
    }
    let bytes = match read_bounded_settings_file(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return SettingsBackupResult::Missing;
        }
        Err(_) => return SettingsBackupResult::Unavailable,
    };
    if decode_current_and_validate_settings(&bytes).is_err() {
        return SettingsBackupResult::InvalidPrimary;
    }
    let mut file = match OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(backup_path)
    {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            return SettingsBackupResult::AlreadyExists;
        }
        Err(_) => return SettingsBackupResult::Unavailable,
    };
    if file
        .write_all(&bytes)
        .and_then(|()| file.sync_all())
        .is_err()
    {
        let _ = fs::remove_file(backup_path);
        return SettingsBackupResult::Unavailable;
    }
    SettingsBackupResult::Created
}

pub fn rollback_settings_from_backup(path: &Path, backup_path: &Path) -> SettingsRollbackResult {
    if path == backup_path
        || reject_settings_symlink(path).is_err()
        || reject_settings_symlink(backup_path).is_err()
    {
        return SettingsRollbackResult::Unavailable;
    }
    let bytes = match read_bounded_settings_file(backup_path) {
        Ok(bytes) => bytes,
        Err(_) => return SettingsRollbackResult::InvalidBackup,
    };
    if decode_current_and_validate_settings(&bytes).is_err() {
        return SettingsRollbackResult::InvalidBackup;
    }
    match ensure_parent_dir(path).and_then(|()| atomic_replace_settings(path, &bytes)) {
        Ok(()) => SettingsRollbackResult::Restored,
        Err(_) => SettingsRollbackResult::Unavailable,
    }
}

fn decode_settings(raw: &[u8]) -> Result<YeonjangSettings, SettingsLoadError> {
    if raw.len() > SETTINGS_MAX_FILE_BYTES {
        return Err(SettingsLoadError::Corrupt);
    }
    let value =
        serde_json::from_slice::<serde_json::Value>(raw).map_err(|_| SettingsLoadError::Corrupt)?;
    let is_legacy = value.get("schema_version").is_none();
    if let Some(version) = value.get("schema_version") {
        if version.as_u64() != Some(u64::from(SETTINGS_SCHEMA_VERSION)) {
            return Err(SettingsLoadError::UnsupportedVersion);
        }
        if value.get("pairing_secret").is_some()
            || value
                .get("connection")
                .and_then(serde_json::Value::as_object)
                .is_some_and(|connection| connection.contains_key("password"))
        {
            return Err(SettingsLoadError::InvalidValue);
        }
    }
    let mut settings = serde_json::from_value::<YeonjangSettings>(value)
        .map_err(|_| SettingsLoadError::Corrupt)?;
    if is_legacy && settings.permissions.has_enabled_side_effect() {
        settings.permission_review_required = true;
    }
    Ok(settings)
}

fn decode_and_validate_settings(raw: &[u8]) -> Result<YeonjangSettings, SettingsLoadError> {
    let mut settings = decode_settings(raw)?;
    settings.apply_identity_defaults();
    settings.schema_version = SETTINGS_SCHEMA_VERSION;
    settings.validate()?;
    Ok(settings)
}

fn decode_current_and_validate_settings(raw: &[u8]) -> Result<YeonjangSettings, SettingsLoadError> {
    let value =
        serde_json::from_slice::<serde_json::Value>(raw).map_err(|_| SettingsLoadError::Corrupt)?;
    if value
        .get("schema_version")
        .and_then(|version| version.as_u64())
        != Some(u64::from(SETTINGS_SCHEMA_VERSION))
    {
        return Err(SettingsLoadError::UnsupportedVersion);
    }
    decode_and_validate_settings(raw)
}

fn reject_settings_symlink(path: &Path) -> Result<(), ()> {
    match path.symlink_metadata() {
        Ok(metadata) if metadata.file_type().is_symlink() => Err(()),
        Ok(_) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err(()),
    }
}

fn read_bounded_settings_file(path: &Path) -> std::io::Result<Vec<u8>> {
    let mut options = OpenOptions::new();
    options.read(true);
    configure_settings_read_open(&mut options);
    let file = options.open(path)?;
    if file.metadata()?.len() > SETTINGS_MAX_FILE_BYTES as u64 {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "settings file exceeds size limit",
        ));
    }
    let mut bytes = Vec::new();
    file.take((SETTINGS_MAX_FILE_BYTES + 1) as u64)
        .read_to_end(&mut bytes)?;
    if bytes.len() > SETTINGS_MAX_FILE_BYTES {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "settings file exceeds size limit",
        ));
    }
    Ok(bytes)
}

#[cfg(unix)]
fn configure_settings_read_open(options: &mut OpenOptions) {
    use std::os::unix::fs::OpenOptionsExt;

    options.custom_flags(libc::O_NOFOLLOW);
}

#[cfg(not(unix))]
fn configure_settings_read_open(_options: &mut OpenOptions) {}

fn ensure_parent_dir(path: &Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_context(|| {
            format!("failed to create settings directory: {}", parent.display())
        })?;
        let metadata = parent.symlink_metadata().with_context(|| {
            format!("failed to inspect settings directory: {}", parent.display())
        })?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            anyhow::bail!("settings directory is unsafe");
        }
    }
    Ok(())
}

fn atomic_replace_settings(path: &Path, content: &[u8]) -> Result<()> {
    if path
        .symlink_metadata()
        .is_ok_and(|metadata| metadata.file_type().is_symlink())
    {
        anyhow::bail!("settings path must not be a symlink");
    }
    let parent = path
        .parent()
        .ok_or_else(|| anyhow::anyhow!("settings path has no parent"))?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| anyhow::anyhow!("settings path has no valid file name"))?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let temporary = parent.join(format!(".{file_name}.{}.{}.tmp", process::id(), nonce));
    let result = (|| -> Result<()> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .context("failed to create settings temporary file")?;
        file.write_all(content)
            .context("failed to write settings temporary file")?;
        file.sync_all()
            .context("failed to sync settings temporary file")?;
        fs::rename(&temporary, path).context("failed to replace settings file")?;
        File::open(parent)
            .and_then(|directory| directory.sync_all())
            .context("failed to sync settings directory")?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn hostname_candidate() -> String {
    env::var("KNOWBEE_HOSTNAME")
        .or_else(|_| env::var("COMPUTERNAME"))
        .or_else(|_| env::var("HOSTNAME"))
        .unwrap_or_else(|_| "localhost".to_string())
}

fn default_instance_alias() -> String {
    let slug = slugify(&hostname_candidate());
    if slug.is_empty() {
        "yeonjang-local".to_string()
    } else {
        slug
    }
}

fn generate_instance_id() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    let entropy = format!(
        "{}|{}|{}|{}|{}",
        hostname_candidate(),
        settings_path().display(),
        process::id(),
        now,
        env::consts::OS
    );
    format!("yi-{}", stable_hex_hash(&entropy))
}

fn compute_host_fingerprint() -> String {
    stable_hex_hash(&format!(
        "{}|{}|{}",
        hostname_candidate(),
        env::consts::OS,
        env::consts::ARCH
    ))
}

fn slugify(value: &str) -> String {
    let mut slug = String::new();
    let mut previous_hyphen = false;
    for ch in value.trim().chars() {
        let lowered = ch.to_ascii_lowercase();
        if lowered.is_ascii_alphanumeric() {
            slug.push(lowered);
            previous_hyphen = false;
        } else if !previous_hyphen {
            slug.push('-');
            previous_hyphen = true;
        }
    }
    slug.trim_matches('-').to_string()
}

fn stable_hex_hash(value: &str) -> String {
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in value.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;
    use std::time::Duration;

    fn settings_test_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "knowbee-yeonjang-settings-{name}-{}-{}.json",
            process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock")
                .as_nanos()
        ))
    }

    #[test]
    fn missing_settings_load_returns_defaults_without_creating_a_file() {
        let path = settings_test_path("missing");

        let settings = load_settings_from_path(&path).expect("missing settings load");

        assert!(!settings.instance_id.is_empty());
        assert!(!path.exists(), "read path must not create settings");
    }

    #[test]
    fn legacy_identity_defaults_do_not_rewrite_the_settings_file() {
        let path = settings_test_path("legacy");
        let mut legacy = YeonjangSettings::default();
        legacy.instance_id.clear();
        legacy.instance_alias.clear();
        legacy.host_fingerprint.clear();
        legacy.install_fingerprint.clear();
        let mut legacy_value = serde_json::to_value(&legacy).expect("legacy fixture value");
        legacy_value
            .as_object_mut()
            .expect("legacy settings object")
            .remove("schema_version");
        let original = serde_json::to_string_pretty(&legacy_value).expect("legacy fixture");
        fs::write(&path, &original).expect("write legacy fixture");

        let loaded = load_settings_from_path(&path).expect("legacy settings load");

        assert!(!loaded.instance_id.is_empty());
        assert!(!loaded.install_fingerprint.is_empty());
        assert_eq!(
            fs::read_to_string(&path).expect("read legacy fixture"),
            original,
            "read path must not persist identity defaults"
        );
        save_settings_to_path(&loaded, &path).expect("explicit legacy migration save");
        let migrated = fs::read_to_string(&path).expect("read migrated settings");
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&migrated)
                .expect("migrated JSON")
                .get("schema_version")
                .and_then(serde_json::Value::as_u64),
            Some(u64::from(SETTINGS_SCHEMA_VERSION))
        );
        fs::remove_file(&path).expect("remove legacy fixture");
    }

    #[test]
    fn unsupported_and_corrupt_settings_fail_with_distinct_typed_errors_without_rewrite() {
        let unsupported_path = settings_test_path("unsupported");
        let unsupported = r#"{"schema_version":99}"#;
        fs::write(&unsupported_path, unsupported).expect("write unsupported fixture");

        assert_eq!(
            load_settings_from_path(&unsupported_path).expect_err("unsupported settings"),
            SettingsLoadError::UnsupportedVersion
        );
        assert_eq!(
            fs::read_to_string(&unsupported_path).expect("read unsupported fixture"),
            unsupported
        );

        let corrupt_path = settings_test_path("corrupt");
        let corrupt = b"{not-json";
        fs::write(&corrupt_path, corrupt).expect("write corrupt fixture");
        assert_eq!(
            load_settings_from_path(&corrupt_path).expect_err("corrupt settings"),
            SettingsLoadError::Corrupt
        );
        assert_eq!(
            fs::read(&corrupt_path).expect("read corrupt fixture"),
            corrupt
        );
        fs::remove_file(unsupported_path).expect("remove unsupported fixture");
        fs::remove_file(corrupt_path).expect("remove corrupt fixture");
    }

    #[test]
    fn versioned_save_round_trips_without_persisting_runtime_secrets() {
        let path = settings_test_path("versioned-save");
        let mut settings = YeonjangSettings::default();
        settings.connection.password = "runtime-broker-secret".to_string();
        settings.pairing_secret = "runtime-pairing-secret".to_string();

        save_settings_to_path(&settings, &path).expect("versioned save");
        let raw = fs::read_to_string(&path).expect("saved settings");
        let value = serde_json::from_str::<serde_json::Value>(&raw).expect("settings JSON");
        assert_eq!(
            value
                .get("schema_version")
                .and_then(serde_json::Value::as_u64),
            Some(u64::from(SETTINGS_SCHEMA_VERSION))
        );
        assert!(!raw.contains("runtime-broker-secret"));
        assert!(!raw.contains("runtime-pairing-secret"));
        assert_eq!(
            load_settings_from_path(&path).expect("round trip"),
            settings.without_runtime_secrets()
        );
        fs::remove_file(path).expect("remove saved settings");
    }

    #[test]
    fn invalid_save_does_not_overwrite_the_last_valid_settings() {
        let path = settings_test_path("invalid-save");
        let original = YeonjangSettings {
            display_name: "Last Valid".to_string(),
            ..Default::default()
        };
        save_settings_to_path(&original, &path).expect("save original");
        let invalid = YeonjangSettings {
            schema_version: SETTINGS_SCHEMA_VERSION + 1,
            display_name: "Invalid Replacement".to_string(),
            ..original
        };

        save_settings_to_path(&invalid, &path).expect_err("invalid settings must not save");

        assert_eq!(
            load_settings_from_path(&path)
                .expect("last valid settings")
                .display_name,
            "Last Valid"
        );
        fs::remove_file(path).expect("remove saved settings");
    }

    #[test]
    fn explicit_backup_and_rollback_restore_only_a_valid_settings_snapshot() {
        let path = settings_test_path("rollback-primary");
        let backup = settings_test_path("rollback-backup");
        let original = YeonjangSettings {
            display_name: "Original".to_string(),
            ..Default::default()
        };
        save_settings_to_path(&original, &path).expect("save original");
        assert_eq!(
            create_settings_backup(&path, &backup),
            SettingsBackupResult::Created
        );
        let changed = YeonjangSettings {
            display_name: "Changed".to_string(),
            ..original.clone()
        };
        save_settings_to_path(&changed, &path).expect("save changed");

        assert_eq!(
            rollback_settings_from_backup(&path, &backup),
            SettingsRollbackResult::Restored
        );
        assert_eq!(
            load_settings_from_path(&path)
                .expect("restored settings")
                .display_name,
            "Original"
        );

        fs::write(&backup, r#"{"schema_version":99}"#).expect("corrupt backup version");
        assert_eq!(
            rollback_settings_from_backup(&path, &backup),
            SettingsRollbackResult::InvalidBackup
        );
        assert_eq!(
            load_settings_from_path(&path)
                .expect("primary remains valid")
                .display_name,
            "Original"
        );
        fs::remove_file(path).expect("remove primary");
        fs::remove_file(backup).expect("remove backup");
    }

    #[test]
    fn identity_defaults_fill_required_fields_and_preserve_existing_instance_id() {
        let mut settings = YeonjangSettings {
            instance_id: "yi-existing".to_string(),
            instance_alias: String::new(),
            display_name: String::new(),
            host_fingerprint: String::new(),
            install_fingerprint: String::new(),
            ..YeonjangSettings::default()
        };

        settings.apply_identity_defaults();

        assert_eq!(settings.instance_id, "yi-existing");
        assert!(!settings.instance_alias.trim().is_empty());
        assert!(!settings.display_name.trim().is_empty());
        assert!(!settings.host_fingerprint.trim().is_empty());
        assert!(!settings.install_fingerprint.trim().is_empty());
    }

    #[test]
    fn fresh_default_identity_generates_new_instance_id_for_new_installation() {
        let first = YeonjangSettings::default();
        thread::sleep(Duration::from_millis(2));
        let second = YeonjangSettings::default();

        assert_ne!(first.instance_id, second.instance_id);
        assert_ne!(first.install_fingerprint, second.install_fingerprint);
    }

    #[test]
    fn fresh_and_missing_side_effect_permissions_are_fail_closed() {
        let fresh = PermissionSettings::default();
        assert!(!fresh.allow_camera_access);
        assert!(!fresh.allow_system_control);
        assert!(!fresh.allow_shell_exec);
        assert!(!fresh.allow_application_launch);
        assert!(!fresh.allow_screen_capture);
        assert!(!fresh.allow_keyboard_control);
        assert!(!fresh.allow_mouse_control);

        let permissions = serde_json::from_str::<PermissionSettings>(
            r#"{
              "allow_shell_exec": true,
              "allow_screen_capture": true
            }"#,
        )
        .expect("legacy permissions should deserialize with defaults");

        assert!(!permissions.allow_camera_access);
        assert!(!permissions.allow_system_control);
        assert!(permissions.allow_shell_exec);
        assert!(!permissions.allow_application_launch);
        assert!(permissions.allow_screen_capture);
        assert!(!permissions.allow_keyboard_control);
        assert!(!permissions.allow_mouse_control);
        assert!(!permissions.allow_file_write);
        assert!(!permissions.allow_process_control);
    }

    #[test]
    fn legacy_true_side_effect_permissions_require_review_before_runtime_activation() {
        let path = settings_test_path("legacy-permission-review");
        let mut legacy = serde_json::to_value(YeonjangSettings::default()).expect("legacy value");
        let object = legacy.as_object_mut().expect("legacy object");
        object.remove("schema_version");
        object
            .get_mut("permissions")
            .and_then(serde_json::Value::as_object_mut)
            .expect("permissions")
            .insert(
                "allow_camera_access".to_string(),
                serde_json::Value::Bool(true),
            );
        let original = serde_json::to_vec_pretty(&legacy).expect("legacy bytes");
        fs::write(&path, &original).expect("legacy settings");

        let mut loaded = load_settings_from_path(&path).expect("legacy load");

        assert!(loaded.permission_review_required);
        assert!(
            loaded.permissions.allow_camera_access,
            "stored operator choice must be preserved for review"
        );
        assert!(
            !loaded
                .clone()
                .runtime_snapshot()
                .permissions
                .allow_camera_access,
            "runtime must fail closed before review"
        );
        assert_eq!(
            fs::read(&path).expect("legacy bytes remain"),
            original,
            "read must not persist migration state"
        );

        save_settings_to_path(&loaded, &path).expect("save pending review");
        assert!(
            load_settings_from_path(&path)
                .expect("pending review reload")
                .permission_review_required
        );
        loaded.confirm_permission_review();
        save_settings_to_path(&loaded, &path).expect("save confirmed review");
        let confirmed = load_settings_from_path(&path).expect("confirmed reload");
        assert!(!confirmed.permission_review_required);
        assert!(confirmed.runtime_snapshot().permissions.allow_camera_access);
        fs::remove_file(path).expect("remove settings");
    }

    #[test]
    fn settings_serialization_never_persists_secret_values() {
        let mut settings = YeonjangSettings {
            pairing_secret: "pairing-secret-value".to_string(),
            ..Default::default()
        };
        settings.connection.password = "broker-password-value".to_string();

        let serialized = serde_json::to_string(&settings).expect("serialize settings");

        assert!(!serialized.contains("pairing_secret"));
        assert!(!serialized.contains("pairing-secret-value"));
        assert!(!serialized.contains("\"password\""));
        assert!(!serialized.contains("broker-password-value"));

        let legacy = serde_json::from_value::<YeonjangSettings>(serde_json::json!({
            "pairing_secret": "legacy-pairing",
            "connection": {
                "password": "legacy-broker"
            }
        }))
        .expect("deserialize legacy secrets");
        assert_eq!(legacy.pairing_secret, "legacy-pairing");
        assert_eq!(legacy.connection.password, "legacy-broker");
    }

    #[test]
    fn direct_v2_enrollment_round_trips_without_reusing_broker_or_display_identity() {
        let mut settings = YeonjangSettings::default();
        settings.connection.username = "broker-login".to_string();
        settings.display_name = "Living Room Mac".to_string();
        settings.mqtt_v2.session_id = "session-main".to_string();
        settings.mqtt_v2.requester_id = "requester-main".to_string();

        let serialized = serde_json::to_string(&settings).expect("serialize");
        let restored: YeonjangSettings = serde_json::from_str(&serialized).expect("restore");

        assert_eq!(restored.mqtt_v2.session_id, "session-main");
        assert_eq!(restored.mqtt_v2.requester_id, "requester-main");
        assert_ne!(restored.mqtt_v2.requester_id, restored.connection.username);
        assert_ne!(restored.mqtt_v2.session_id, restored.display_name);
    }

    #[test]
    fn runtime_settings_debug_never_exposes_hydrated_secret_values() {
        let mut settings = YeonjangSettings::default();
        settings.connection.password = "debug-broker-secret-marker".to_string();
        settings.pairing_secret = "debug-pairing-secret-marker".to_string();

        let settings_debug = format!("{settings:?}");
        let connection_debug = format!("{:?}", settings.connection);

        for debug in [settings_debug, connection_debug] {
            assert!(!debug.contains("debug-broker-secret-marker"));
            assert!(!debug.contains("debug-pairing-secret-marker"));
            assert!(debug.contains("[REDACTED]"));
        }
    }

    #[test]
    fn default_path_access_is_fail_closed() {
        let path_access = PathAccessSettings::default();

        assert!(path_access.allowed_read_paths.is_empty());
        assert!(path_access.allowed_write_paths.is_empty());
        assert!(path_access.denied_paths.is_empty());
        assert!(!path_access.allow_hidden_files);
        assert!(!path_access.follow_symlinks);
        assert_eq!(path_access.max_read_bytes, 1_048_576);
        assert_eq!(path_access.max_write_bytes, 1_048_576);
    }
}
