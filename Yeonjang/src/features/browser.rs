use anyhow::{Result, anyhow};
use serde::Deserialize;
use serde_json::{Value, json};
use std::process::Command;
use sysinfo::System;

const DEFAULT_BROWSER_LIMIT: usize = 50;
const MAX_BROWSER_LIMIT: usize = 1_000;

#[derive(Debug, Clone, Deserialize)]
pub struct BrowserListParams {
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BrowserActiveHintParams {}

#[derive(Debug, Clone, Deserialize)]
pub struct BrowserOpenUrlParams {
    pub url: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BrowserKind {
    Chrome,
    Safari,
    Firefox,
    Edge,
    Brave,
    Arc,
    Opera,
    Vivaldi,
}

impl BrowserKind {
    fn label(self) -> &'static str {
        match self {
            BrowserKind::Chrome => "Google Chrome",
            BrowserKind::Safari => "Safari",
            BrowserKind::Firefox => "Firefox",
            BrowserKind::Edge => "Microsoft Edge",
            BrowserKind::Brave => "Brave",
            BrowserKind::Arc => "Arc",
            BrowserKind::Opera => "Opera",
            BrowserKind::Vivaldi => "Vivaldi",
        }
    }
}

pub fn list_browsers(params: BrowserListParams) -> Result<Value> {
    let limit = params
        .limit
        .unwrap_or(DEFAULT_BROWSER_LIMIT)
        .clamp(1, MAX_BROWSER_LIMIT);
    let mut browsers = browser_candidates();
    let total_count = browsers.len();
    browsers.truncate(limit);

    Ok(json!({
        "browsers": browsers,
        "count": browsers.len(),
        "totalCount": total_count,
        "truncated": total_count > limit,
        "limit": limit,
    }))
}

pub fn active_hint(_params: BrowserActiveHintParams) -> Result<Value> {
    let mut browsers = browser_candidates();
    let active_browser = browsers.drain(..).next();
    let available = active_browser.is_some();

    Ok(json!({
        "activeBrowser": active_browser,
        "available": available,
        "reason": if available {
            "browser_candidate_found"
        } else {
            "no_browser_candidate"
        },
    }))
}

pub fn open_url(params: BrowserOpenUrlParams) -> Result<Value> {
    let url = normalize_http_url(&params.url)?;
    open_url_with_platform_default(&url)?;

    Ok(json!({
        "urlScheme": url.split_once(':').map(|(scheme, _)| scheme).unwrap_or("unknown"),
        "opened": true,
        "postCheck": {
            "verified": false,
            "reason": "llm_goal_validation_required"
        },
        "message": "URL open command was accepted by the platform browser launcher."
    }))
}

pub fn classify_browser_name(name: &str) -> Option<BrowserKind> {
    let normalized = normalize_process_name(name);
    if normalized.is_empty() {
        return None;
    }
    if normalized.contains("google chrome") || normalized == "chrome" || normalized == "chrome.exe"
    {
        return Some(BrowserKind::Chrome);
    }
    if normalized == "safari" || normalized == "safari.exe" {
        return Some(BrowserKind::Safari);
    }
    if normalized.contains("firefox") {
        return Some(BrowserKind::Firefox);
    }
    if normalized == "msedge" || normalized == "msedge.exe" || normalized.contains("microsoft edge")
    {
        return Some(BrowserKind::Edge);
    }
    if normalized.contains("brave browser") || normalized == "brave" || normalized == "brave.exe" {
        return Some(BrowserKind::Brave);
    }
    if normalized == "arc" || normalized == "arc.exe" {
        return Some(BrowserKind::Arc);
    }
    if normalized == "opera" || normalized == "opera.exe" || normalized.contains("opera browser") {
        return Some(BrowserKind::Opera);
    }
    if normalized == "vivaldi" || normalized == "vivaldi.exe" {
        return Some(BrowserKind::Vivaldi);
    }
    None
}

fn browser_candidates() -> Vec<Value> {
    let system = System::new_all();
    let mut browsers = system
        .processes()
        .iter()
        .filter_map(|(pid, process)| {
            let kind = classify_browser_name(process.name())?;
            Some(json!({
                "pid": pid.as_u32(),
                "appName": process.name(),
                "browser": kind.label(),
                "running": true,
                "confidence": "name_match",
                "detectedBy": "process_name",
                "status": format!("{:?}", process.status()),
            }))
        })
        .collect::<Vec<_>>();

    browsers.sort_by(|left, right| {
        let left_name = left["browser"].as_str().unwrap_or_default();
        let right_name = right["browser"].as_str().unwrap_or_default();
        left_name
            .cmp(right_name)
            .then_with(|| left["pid"].as_u64().cmp(&right["pid"].as_u64()))
    });
    browsers
}

fn normalize_process_name(name: &str) -> String {
    name.trim().to_lowercase()
}

fn normalize_http_url(value: &str) -> Result<String> {
    let url = value.trim();
    if url.is_empty() {
        return Err(anyhow!("browser.open_url requires a non-empty url"));
    }
    let lower = url.to_lowercase();
    if !(lower.starts_with("https://") || lower.starts_with("http://")) {
        return Err(anyhow!(
            "browser.open_url supports http and https URLs only"
        ));
    }
    if url.contains('\0') || url.contains('\n') || url.contains('\r') {
        return Err(anyhow!("browser.open_url rejects control characters"));
    }
    Ok(url.to_string())
}

fn open_url_with_platform_default(url: &str) -> Result<()> {
    let status = if cfg!(target_os = "macos") {
        Command::new("open").arg(url).status()
    } else if cfg!(target_os = "windows") {
        Command::new("cmd").args(["/C", "start", "", url]).status()
    } else {
        Command::new("xdg-open").arg(url).status()
    }
    .map_err(|error| anyhow!("failed to launch platform browser opener: {error}"))?;

    if !status.success() {
        return Err(anyhow!(
            "platform browser opener exited with status {}",
            status.code().unwrap_or(-1)
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifier_recognizes_common_browser_process_names() {
        assert_eq!(
            classify_browser_name("Google Chrome"),
            Some(BrowserKind::Chrome)
        );
        assert_eq!(
            classify_browser_name("chrome.exe"),
            Some(BrowserKind::Chrome)
        );
        assert_eq!(classify_browser_name("Safari"), Some(BrowserKind::Safari));
        assert_eq!(classify_browser_name("firefox"), Some(BrowserKind::Firefox));
        assert_eq!(classify_browser_name("msedge"), Some(BrowserKind::Edge));
        assert_eq!(
            classify_browser_name("Brave Browser"),
            Some(BrowserKind::Brave)
        );
        assert_eq!(classify_browser_name("Arc"), Some(BrowserKind::Arc));
        assert_eq!(classify_browser_name("not-a-browser"), None);
    }

    #[test]
    fn list_omits_sensitive_browser_state() {
        let result = list_browsers(BrowserListParams { limit: Some(5) }).expect("browser list");
        let serialized = result.to_string();

        assert!(!serialized.contains("\"url\""));
        assert!(!serialized.contains("\"title\""));
        assert!(!serialized.contains("commandLine"));
        assert!(!serialized.contains("profilePath"));
        assert!(!serialized.contains("\"cwd\""));
        assert!(!serialized.contains("\"env\""));
    }

    #[test]
    fn active_hint_returns_explicit_availability() {
        let result = active_hint(BrowserActiveHintParams {}).expect("browser active hint");

        assert!(result["available"].is_boolean());
        assert!(!result["reason"].as_str().unwrap_or_default().is_empty());
    }

    #[test]
    fn open_url_accepts_only_http_urls() {
        assert_eq!(
            normalize_http_url(" https://example.test/path ").expect("https url"),
            "https://example.test/path"
        );
        assert!(normalize_http_url("http://example.test").is_ok());
        assert!(normalize_http_url("file:///tmp/private").is_err());
        assert!(normalize_http_url("javascript:alert(1)").is_err());
        assert!(normalize_http_url("https://example.test\nnext").is_err());
    }
}
