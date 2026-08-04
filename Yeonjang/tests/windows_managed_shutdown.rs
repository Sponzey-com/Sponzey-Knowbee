#![cfg(target_os = "windows")]

use std::fs;
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use knowbee_yeonjang::managed_shutdown::{
    ManagedSignalSource, prepare_managed_signal_source, wait_for_managed_shutdown_signal,
};
use windows_sys::Win32::System::Console::{CTRL_BREAK_EVENT, GenerateConsoleCtrlEvent};
use windows_sys::Win32::System::Threading::CREATE_NEW_PROCESS_GROUP;

const CHILD_MODE: &str = "YEONJANG_TEST_MANAGED_SHUTDOWN_CHILD";
const READY_PATH: &str = "YEONJANG_TEST_MANAGED_SHUTDOWN_READY";

/// A Windows managed process must drain through the common runtime shutdown
/// path when its exact console process group receives CTRL+BREAK.
#[test]
fn windows_managed_process_receives_targeted_graceful_shutdown() {
    if std::env::var_os(CHILD_MODE).is_some() {
        let source = prepare_managed_signal_source().expect("managed signal source");
        assert!(matches!(
            source,
            ManagedSignalSource::Attached | ManagedSignalSource::Inherited
        ));
        fs::write(std::env::var_os(READY_PATH).expect("ready path"), b"ready")
            .expect("write ready marker");
        let runtime = tokio::runtime::Runtime::new().expect("shutdown test runtime");
        runtime
            .block_on(wait_for_managed_shutdown_signal())
            .expect("managed shutdown signal");
        return;
    }

    let ready_path =
        std::env::temp_dir().join(format!("yeonjang-managed-shutdown-{}", std::process::id()));
    let mut child = Command::new(std::env::current_exe().expect("test executable"))
        .arg("--exact")
        .arg("windows_managed_process_receives_targeted_graceful_shutdown")
        .arg("--nocapture")
        .env(CHILD_MODE, "1")
        .env(READY_PATH, &ready_path)
        .creation_flags(CREATE_NEW_PROCESS_GROUP)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("managed shutdown child");

    let deadline = Instant::now() + Duration::from_secs(10);
    while !ready_path.is_file() {
        assert!(
            Instant::now() < deadline,
            "managed shutdown child did not become ready"
        );
        thread::sleep(Duration::from_millis(25));
    }

    // SAFETY: the child PID is the process-group ID because it was created
    // with CREATE_NEW_PROCESS_GROUP, and CTRL_BREAK can target that group.
    let sent = unsafe { GenerateConsoleCtrlEvent(CTRL_BREAK_EVENT, child.id()) };
    assert_ne!(sent, 0, "CTRL+BREAK delivery failed");
    let status = child.wait().expect("managed shutdown child wait");
    assert!(status.success(), "managed shutdown child failed: {status}");
    fs::remove_file(ready_path).expect("remove ready marker");
}
