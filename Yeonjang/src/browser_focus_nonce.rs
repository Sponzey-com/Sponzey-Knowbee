use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::Path;

use anyhow::{Context, Result, bail};
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Deserialize, Serialize)]
struct StoredNonce {
    nonce_hash: String,
    expires_at_ms: i64,
}

pub fn consume_browser_focus_nonce(
    state_file: &Path,
    extension_id: &str,
    nonce: &str,
    expires_at_ms: i64,
    now_ms: i64,
) -> Result<()> {
    let extension_id = extension_id.trim();
    let nonce = nonce.trim();
    if extension_id.is_empty() || nonce.is_empty() || expires_at_ms <= now_ms {
        bail!("browser_focus_execution_admission_nonce_invalid");
    }
    if let Some(parent) = state_file.parent() {
        fs::create_dir_all(parent).context("browser_focus_nonce_store_unavailable")?;
    }
    let mut file = OpenOptions::new()
        .create(true)
        .read(true)
        .write(true)
        .truncate(false)
        .open(state_file)
        .context("browser_focus_nonce_store_unavailable")?;
    file.lock_exclusive()
        .context("browser_focus_nonce_store_unavailable")?;
    let result = consume_locked(&mut file, extension_id, nonce, expires_at_ms, now_ms);
    let _ = file.unlock();
    result
}

fn consume_locked(
    file: &mut File,
    extension_id: &str,
    nonce: &str,
    expires_at_ms: i64,
    now_ms: i64,
) -> Result<()> {
    file.seek(SeekFrom::Start(0))?;
    let mut content = String::new();
    file.read_to_string(&mut content)?;
    let mut entries: Vec<StoredNonce> = if content.trim().is_empty() {
        Vec::new()
    } else {
        serde_json::from_str(&content)
            .map_err(|_| anyhow::anyhow!("browser_focus_nonce_store_invalid"))?
    };
    entries.retain(|entry| entry.expires_at_ms > now_ms);
    let nonce_hash = hash_nonce(extension_id, nonce);
    if entries.iter().any(|entry| entry.nonce_hash == nonce_hash) {
        bail!("browser_focus_execution_admission_nonce_replayed");
    }
    entries.push(StoredNonce {
        nonce_hash,
        expires_at_ms,
    });
    let serialized =
        serde_json::to_vec(&entries).context("browser_focus_nonce_store_unavailable")?;
    file.set_len(0)?;
    file.seek(SeekFrom::Start(0))?;
    file.write_all(&serialized)?;
    file.sync_all()?;
    Ok(())
}

fn hash_nonce(extension_id: &str, nonce: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(extension_id.as_bytes());
    hasher.update([0]);
    hasher.update(nonce.as_bytes());
    format!("sha256:{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::consume_browser_focus_nonce;

    #[test]
    fn persists_hashed_nonces_and_blocks_replay_after_a_new_store_instance() {
        let root = std::env::temp_dir().join(format!(
            "knowbee-browser-focus-nonce-{}",
            std::process::id()
        ));
        let state_file = root.join("nonces.json");
        let _ = fs::remove_dir_all(&root);

        consume_browser_focus_nonce(&state_file, "studio-mac", "private-nonce", 2_000, 1_000)
            .expect("first nonce should be stored");
        let replay =
            consume_browser_focus_nonce(&state_file, "studio-mac", "private-nonce", 2_000, 1_001)
                .expect_err("nonce must stay consumed after reopening its store");
        assert!(
            replay
                .to_string()
                .contains("browser_focus_execution_admission_nonce_replayed")
        );
        let stored = fs::read_to_string(&state_file).expect("state should be written");
        assert!(!stored.contains("private-nonce"));
        assert!(!stored.contains("studio-mac"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn discards_expired_entries_before_accepting_a_new_nonce() {
        let root = std::env::temp_dir().join(format!(
            "knowbee-browser-focus-nonce-expiry-{}",
            std::process::id()
        ));
        let state_file = root.join("nonces.json");
        let _ = fs::remove_dir_all(&root);

        consume_browser_focus_nonce(&state_file, "studio-mac", "nonce", 1_000, 900)
            .expect("first nonce should be stored");
        consume_browser_focus_nonce(&state_file, "studio-mac", "nonce", 2_000, 1_001)
            .expect("expired nonce should no longer block a new admission");
        let _ = fs::remove_dir_all(root);
    }
}
