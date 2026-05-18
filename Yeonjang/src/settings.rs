use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result};
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum UiLanguage {
    Ko,
    #[default]
    En,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct YeonjangSettings {
    pub ui_language: UiLanguage,
    pub instance_id: String,
    pub instance_alias: String,
    pub node_id: String,
    pub display_name: String,
    pub support_profile: String,
    pub workspace_scope_id: String,
    pub pairing_secret: String,
    pub host_fingerprint: String,
    pub install_fingerprint: String,
    pub connection: BrokerConnectionSettings,
    pub mqtt: MqttTopicSettings,
    pub permissions: PermissionSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct BrokerConnectionSettings {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub auto_connect: bool,
    pub launch_on_system_start: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
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
pub struct PermissionSettings {
    pub allow_system_control: bool,
    pub allow_shell_exec: bool,
    pub allow_application_launch: bool,
    pub allow_screen_capture: bool,
    pub allow_keyboard_control: bool,
    pub allow_mouse_control: bool,
}

impl Default for YeonjangSettings {
    fn default() -> Self {
        let node_id = "yeonjang-main".to_string();
        let mut settings = Self {
            ui_language: UiLanguage::En,
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
            mqtt: MqttTopicSettings::default(),
            permissions: PermissionSettings::default(),
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

impl Default for MqttTopicSettings {
    fn default() -> Self {
        Self {
            status_topic: String::new(),
            capabilities_topic: String::new(),
            request_topic: String::new(),
            response_topic: String::new(),
            event_topic: String::new(),
        }
    }
}

impl Default for PermissionSettings {
    fn default() -> Self {
        Self {
            allow_system_control: true,
            allow_shell_exec: true,
            allow_application_launch: true,
            allow_screen_capture: true,
            allow_keyboard_control: true,
            allow_mouse_control: true,
        }
    }
}

impl YeonjangSettings {
    pub fn reset_topics_from_node_id(&mut self) {
        let prefix = format!("nobie/v1/node/{}", self.node_id.trim());
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
}

pub fn settings_path() -> PathBuf {
    if let Some(project_dirs) = ProjectDirs::from("com", "Sponzey", "Nobie") {
        return project_dirs
            .config_dir()
            .join("yeonjang")
            .join("settings.json");
    }

    PathBuf::from("Yeonjang").join("settings.json")
}

pub fn load_settings() -> Result<YeonjangSettings> {
    let path = settings_path();
    if !path.exists() {
        let settings = YeonjangSettings::default();
        let _ = save_settings(&settings);
        return Ok(settings);
    }

    let raw = fs::read_to_string(&path)
        .with_context(|| format!("failed to read settings file: {}", path.display()))?;
    let mut settings = serde_json::from_str::<YeonjangSettings>(&raw)
        .with_context(|| format!("failed to parse settings file: {}", path.display()))?;
    let before = settings.clone();
    settings.apply_identity_defaults();
    if settings != before {
        let _ = save_settings(&settings);
    }
    Ok(settings)
}

pub fn save_settings(settings: &YeonjangSettings) -> Result<PathBuf> {
    let path = settings_path();
    ensure_parent_dir(&path)?;

    let content = serde_json::to_string_pretty(settings)?;
    fs::write(&path, content)
        .with_context(|| format!("failed to write settings file: {}", path.display()))?;

    Ok(path)
}

fn ensure_parent_dir(path: &Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_context(|| {
            format!("failed to create settings directory: {}", parent.display())
        })?;
    }
    Ok(())
}

fn hostname_candidate() -> String {
    env::var("NOBIE_HOSTNAME")
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
}
