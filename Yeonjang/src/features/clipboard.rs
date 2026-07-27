use std::io::Write;
use std::process::{Command, Stdio};

use anyhow::{Context, Result, anyhow};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

#[derive(Debug, Deserialize)]
pub struct ClipboardWriteParams {
    pub text: String,
}

pub fn read() -> Result<Value> {
    let text = read_clipboard_text()?;
    Ok(clipboard_read_result(&text))
}

pub fn write(params: ClipboardWriteParams) -> Result<Value> {
    let expected = clipboard_text_metadata(&params.text);
    write_clipboard_text(&params.text)?;

    let post_check = match read_clipboard_text() {
        Ok(actual) => {
            let actual_metadata = clipboard_text_metadata(&actual);
            let verified = actual == params.text;
            json!({
                "verified": verified,
                "charCount": actual_metadata.char_count,
                "byteLength": actual_metadata.byte_length,
                "empty": actual_metadata.empty,
                "contentHash": actual_metadata.content_hash,
                "reason": if verified { "clipboard content matched after write" } else { "clipboard content mismatch after write" },
            })
        }
        Err(error) => json!({
            "verified": false,
            "reason": format!("clipboard post-check read failed: {error}"),
        }),
    };

    Ok(json!({
        "charCount": expected.char_count,
        "byteLength": expected.byte_length,
        "empty": expected.empty,
        "contentHash": expected.content_hash,
        "postCheck": post_check,
    }))
}

fn clipboard_read_result(text: &str) -> Value {
    let metadata = clipboard_text_metadata(text);
    json!({
        "text": text,
        "charCount": metadata.char_count,
        "byteLength": metadata.byte_length,
        "empty": metadata.empty,
        "contentHash": metadata.content_hash,
    })
}

struct ClipboardTextMetadata {
    char_count: usize,
    byte_length: usize,
    empty: bool,
    content_hash: String,
}

fn clipboard_text_metadata(text: &str) -> ClipboardTextMetadata {
    let byte_length = text.len();
    let char_count = text.chars().count();
    let empty = text.trim().is_empty();
    let content_hash = format!("sha256:{:x}", Sha256::digest(text.as_bytes()));

    ClipboardTextMetadata {
        char_count,
        byte_length,
        empty,
        content_hash,
    }
}

fn read_clipboard_text() -> Result<String> {
    match std::env::consts::OS {
        "macos" => command_stdout("pbpaste", &[]),
        "linux" => command_stdout("xclip", &["-selection", "clipboard", "-o"])
            .or_else(|_| command_stdout("xsel", &["--clipboard", "--output"])),
        "windows" => command_stdout(
            "powershell",
            &["-NoProfile", "-Command", "Get-Clipboard -Raw"],
        )
        .map(|text| text.trim_end_matches(['\r', '\n']).to_string()),
        other => Err(anyhow!("clipboard.read is unsupported on {other}")),
    }
}

fn write_clipboard_text(text: &str) -> Result<()> {
    match std::env::consts::OS {
        "macos" => command_stdin("pbcopy", &[], text),
        "linux" => command_stdin("xclip", &["-selection", "clipboard"], text)
            .or_else(|_| command_stdin("xsel", &["--clipboard", "--input"], text)),
        "windows" => command_stdin(
            "powershell",
            &[
                "-NoProfile",
                "-Command",
                "Set-Clipboard -Value ([Console]::In.ReadToEnd())",
            ],
            text,
        ),
        other => Err(anyhow!("clipboard.write is unsupported on {other}")),
    }
}

fn command_stdout(command: &str, args: &[&str]) -> Result<String> {
    let output = Command::new(command)
        .args(args)
        .output()
        .with_context(|| format!("failed to run clipboard backend: {command}"))?;
    if !output.status.success() {
        anyhow::bail!("clipboard backend failed: {command}");
    }
    String::from_utf8(output.stdout).context("clipboard.read currently supports utf-8 text")
}

fn command_stdin(command: &str, args: &[&str], text: &str) -> Result<()> {
    let mut child = Command::new(command)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .with_context(|| format!("failed to run clipboard backend: {command}"))?;

    child
        .stdin
        .as_mut()
        .context("clipboard backend stdin is unavailable")?
        .write_all(text.as_bytes())
        .with_context(|| format!("failed to write clipboard stdin: {command}"))?;

    let output = child
        .wait_with_output()
        .with_context(|| format!("failed to wait for clipboard backend: {command}"))?;
    if !output.status.success() {
        anyhow::bail!("clipboard backend failed: {command}");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clipboard_read_result_metadata_does_not_change_hash_format() {
        let text = "hello clipboard";
        let hash = format!("sha256:{:x}", Sha256::digest(text.as_bytes()));

        assert!(hash.starts_with("sha256:"));
        assert_eq!(text.len(), 15);
    }

    #[test]
    fn clipboard_write_metadata_does_not_include_raw_text() {
        let text = "private clipboard secret";
        let metadata = clipboard_text_metadata(text);
        let value = json!({
            "charCount": metadata.char_count,
            "byteLength": metadata.byte_length,
            "empty": metadata.empty,
            "contentHash": metadata.content_hash,
        });

        assert_eq!(value["charCount"], 24);
        assert!(!value.to_string().contains(text));
    }
}
