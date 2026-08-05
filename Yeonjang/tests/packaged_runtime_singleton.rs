//! Packaged cross-mode singleton lifecycle without touching user runtime state.

use std::fs;
use std::io::Read;
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Output, Stdio};
use std::sync::{
    Mutex, MutexGuard,
    atomic::{AtomicU64, Ordering},
};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

static ISOLATED_HOME_SEQUENCE: AtomicU64 = AtomicU64::new(0);
// The packaged binary resolves macOS application directories during bootstrap.
// Keep these process-lifecycle tests serialized so concurrent test threads do
// not race that OS-level bootstrap while each test is retaining a live child.
static PACKAGED_RUNTIME_TEST_MUTEX: Mutex<()> = Mutex::new(());

#[test]
fn packaged_stdio_claimant_blocks_an_authenticated_cross_mode_claimant_then_releases() {
    let _serialized = packaged_runtime_test_lock();
    let home = isolated_home();
    fs::create_dir_all(&home).expect("isolated child home");
    let (mut first, first_stdin, blocked) = start_first_claimant_until_owned(&home, || {
        authenticated_command_with_home(&home)
            .output()
            .expect("cross-mode claimant")
    });
    assert!(!blocked.status.success());
    let blocked_stderr = String::from_utf8_lossy(&blocked.stderr).into_owned();
    assert!(
        blocked_stderr.contains("already_running"),
        "cross-mode claimant must return the stable duplicate outcome: {blocked_stderr}"
    );
    assert!(!blocked_stderr.contains("AlreadyRunning"));

    drop(first_stdin);
    let first_status = first.wait().expect("first stdio exit");
    assert!(first_status.success(), "first stdio claimant failed");

    let restarted = command_with_home(&home, "--stdio")
        .output()
        .expect("reacquired claimant");
    assert!(
        restarted.status.success(),
        "lease was not returned after EOF"
    );
    fs::remove_dir_all(home).expect("isolated child home cleanup");
}

#[test]
fn packaged_forced_process_exit_releases_the_fixed_runtime_lease() {
    let _serialized = packaged_runtime_test_lock();
    let home = isolated_home();
    fs::create_dir_all(&home).expect("isolated forced-exit child home");
    let (mut first, first_stdin, blocked) = start_first_claimant_until_owned(&home, || {
        authenticated_command_with_home(&home)
            .output()
            .expect("forced-exit duplicate claimant")
    });
    assert!(!blocked.status.success());
    assert!(String::from_utf8_lossy(&blocked.stderr).contains("already_running"));

    // `Child::kill` terminates the exact child (SIGKILL on Unix and
    // TerminateProcess on Windows), so normal Rust `Drop` inside that process
    // cannot release the guard. The OS-owned file lock must be returned when
    // the process dies, without deleting the persistent lock artifact.
    first.kill().expect("force-stop first packaged claimant");
    let forced_status = first.wait().expect("wait for forced claimant exit");
    assert!(
        !forced_status.success(),
        "forced claimant unexpectedly succeeded"
    );
    drop(first_stdin);

    let restarted = command_with_home(&home, "--stdio")
        .output()
        .expect("claimant after forced process exit");
    assert!(
        restarted.status.success(),
        "OS lease was not returned after forced process exit: {}",
        String::from_utf8_lossy(&restarted.stderr)
    );
    fs::remove_dir_all(home).expect("isolated forced-exit child home cleanup");
}

#[test]
fn runtime_lease_precedes_managed_config_root_validation() {
    let _serialized = packaged_runtime_test_lock();
    let home = isolated_home();
    fs::create_dir_all(&home).expect("isolated child home");
    let (mut first, first_stdin, duplicate) = start_first_claimant_until_owned(&home, || {
        command_with_home(&home, "--managed")
            .args(["--config-root", "relative-config-root"])
            .output()
            .expect("managed duplicate claimant")
    });
    let stderr = String::from_utf8_lossy(&duplicate.stderr);
    assert!(
        stderr.contains("already_running"),
        "managed duplicate must close at the fixed lease before config validation: {stderr}"
    );
    assert!(!stderr.contains("relative-config-root"));

    drop(first_stdin);
    first.wait().expect("first stdio exit");
    fs::remove_dir_all(home).expect("isolated child home cleanup");
}

fn command_with_home(home: &PathBuf, mode: &str) -> Command {
    let mut command = Command::new(env!("CARGO_BIN_EXE_knowbee-yeonjang"));
    command.arg(mode);
    command
        .env("HOME", home)
        .env("USERPROFILE", home)
        .env("APPDATA", home.join("AppData/Roaming"))
        .env("LOCALAPPDATA", home.join("AppData/Local"))
        .env("XDG_DATA_HOME", home.join("xdg-data"));
    command
}

fn authenticated_command_with_home(home: &PathBuf) -> Command {
    let mut command = command_with_home(home, "--stdio-authenticated");
    command
        .env("YEONJANG_STDIO_AUTH_ISSUER", "singleton-test")
        .env("YEONJANG_STDIO_AUTH_KEY_ID", "singleton-test-key")
        .env("YEONJANG_STDIO_AUTH_AUDIENCE", "singleton-test-audience")
        .env("YEONJANG_STDIO_AUTH_SECRET", "singleton-test-secret");
    command
}

fn packaged_runtime_test_lock() -> MutexGuard<'static, ()> {
    PACKAGED_RUNTIME_TEST_MUTEX
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Uses a real second claimant as the readiness observation. If that claimant
/// wins the process-start race, the first process returns `already_running`
/// while the second proceeds past the lease. Only that proven test-owned race
/// is retried; two blocked claimants still expose an external runtime owner.
fn start_first_claimant_until_owned<F>(
    home: &PathBuf,
    mut attempt: F,
) -> (Child, ChildStdin, Output)
where
    F: FnMut() -> Output,
{
    let deadline = Instant::now() + Duration::from_secs(3);
    loop {
        let mut child = command_with_home(home, "--stdio")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("first packaged stdio claimant");
        let child_stdin = child.stdin.take().expect("first stdio stdin");

        loop {
            let output = attempt();
            let contender_stderr = String::from_utf8_lossy(&output.stderr);
            if let Some(status) = child.try_wait().expect("first stdio status") {
                let mut first_stderr = String::new();
                child
                    .stderr
                    .take()
                    .expect("first stderr")
                    .read_to_string(&mut first_stderr)
                    .expect("first stderr contents");
                if !status.success()
                    && first_stderr.contains("already_running")
                    && !contender_stderr.contains("already_running")
                    && Instant::now() < deadline
                {
                    drop(child_stdin);
                    break;
                }
                panic!(
                    "first claimant exited before acquiring the lease ({status}): {first_stderr}; \
                     contender status={:?}, stderr={contender_stderr}",
                    output.status
                );
            }
            if !output.status.success() && contender_stderr.contains("already_running") {
                return (child, child_stdin, output);
            }
            if Instant::now() >= deadline {
                child.kill().expect("stop unresponsive first claimant");
                child.wait().expect("wait for stopped first claimant");
                let mut first_stderr = String::new();
                child
                    .stderr
                    .take()
                    .expect("first stderr")
                    .read_to_string(&mut first_stderr)
                    .expect("first stderr contents");
                panic!(
                    "first claimant did not reject a real cross-mode duplicate; \
                     duplicate status={:?}, stdout={}, stderr={contender_stderr}; first stderr={first_stderr}",
                    output.status,
                    String::from_utf8_lossy(&output.stdout),
                );
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    }
}

fn isolated_home() -> PathBuf {
    let sequence = ISOLATED_HOME_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    std::env::temp_dir().join(format!(
        "knowbee-packaged-runtime-singleton-{}-{}-{sequence}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos()
    ))
}
