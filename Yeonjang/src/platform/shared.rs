use std::env;
use std::io::Read;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::Ordering;
use std::thread::{self, sleep};
use std::time::{Duration, Instant};

use anyhow::{Context, Result, anyhow, bail};
use sha2::{Digest, Sha256};

#[cfg(any(target_os = "windows", target_os = "linux", test))]
use crate::automation::CameraCaptureProcessError;
use crate::automation::{
    ApplicationLaunchRequest, CameraCaptureRequest, CommandExecutionProcessError,
    CommandExecutionRequest, CommandExecutionResult, FocusedTargetResult, MouseClickRequest,
    MouseMoveRequest, PlatformKind, ScreenCaptureRequest, SystemSnapshot,
};

const MAX_COMMAND_OUTPUT_BYTES: usize = 1024 * 1024;
#[cfg(any(target_os = "windows", target_os = "linux", test))]
const DEFAULT_CAMERA_CAPTURE_TIMEOUT_MS: u64 = 60_000;
#[cfg(any(target_os = "windows", target_os = "linux", test))]
const MIN_CAMERA_CAPTURE_TIMEOUT_MS: u64 = 1_000;
#[cfg(any(target_os = "windows", target_os = "linux", test))]
const MAX_CAMERA_CAPTURE_TIMEOUT_MS: u64 = 60_000;

/// Sanitized successful output from one owned camera helper process.
#[cfg(any(target_os = "windows", target_os = "linux", test))]
#[derive(Debug)]
pub(crate) struct BoundedCameraCommandOutput {
    #[cfg_attr(target_os = "linux", allow(dead_code))]
    pub(crate) stdout: String,
}

pub fn collect_system_info(platform: PlatformKind) -> SystemSnapshot {
    let current_dir = env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .display()
        .to_string();
    let executable = env::current_exe()
        .unwrap_or_else(|_| PathBuf::from("knowbee-yeonjang"))
        .display()
        .to_string();

    SystemSnapshot {
        node: "knowbee-yeonjang".to_string(),
        version: option_env!("YEONJANG_GIT_DESCRIBE")
            .unwrap_or(env!("CARGO_PKG_VERSION"))
            .to_string(),
        platform,
        os: env::consts::OS.to_string(),
        arch: env::consts::ARCH.to_string(),
        current_dir,
        executable,
        user: env::var("USER").ok().or_else(|| env::var("USERNAME").ok()),
    }
}

pub fn focused_target_result(
    app_name: Option<String>,
    process_id: Option<u32>,
    raw_title: Option<String>,
) -> FocusedTargetResult {
    let title = raw_title.unwrap_or_default();
    let title_length = title.chars().count();
    let title_hash = if title.is_empty() {
        None
    } else {
        Some(format!("sha256:{:x}", Sha256::digest(title.as_bytes())))
    };
    let available = app_name
        .as_ref()
        .is_some_and(|value| !value.trim().is_empty())
        || process_id.is_some()
        || title_hash.is_some();
    FocusedTargetResult {
        available,
        app_name,
        process_id,
        title_hash,
        title_length,
        message: if available {
            "Focused target observed.".to_string()
        } else {
            "Focused target is not available.".to_string()
        },
    }
}

pub fn execute_command(request: CommandExecutionRequest) -> Result<CommandExecutionResult> {
    if request.cancellation.load(Ordering::SeqCst) {
        return Err(CommandExecutionProcessError::Cancelled.into());
    }

    let mut command = if request.shell {
        if cfg!(target_os = "windows") {
            let mut cmd = Command::new("cmd");
            cmd.arg("/C").arg(&request.command);
            cmd
        } else {
            let mut cmd = Command::new("sh");
            cmd.arg("-lc").arg(&request.command);
            cmd
        }
    } else {
        let mut cmd = Command::new(&request.command);
        cmd.args(&request.args);
        cmd
    };

    if let Some(cwd) = request.cwd {
        command.current_dir(cwd);
    }

    if !request.env.is_empty() {
        command.envs(&request.env);
    }

    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    configure_command_process_group(&mut command);

    let mut child = command
        .spawn()
        .with_context(|| format!("failed to execute command `{}`", request.command))?;
    let stdout_reader = child
        .stdout
        .take()
        .ok_or_else(|| anyhow!("command stdout pipe is unavailable"))?;
    let stderr_reader = child
        .stderr
        .take()
        .ok_or_else(|| anyhow!("command stderr pipe is unavailable"))?;
    let stdout_task = thread::spawn(move || read_bounded_output(stdout_reader));
    let stderr_task = thread::spawn(move || read_bounded_output(stderr_reader));
    let started_at = Instant::now();
    let timeout = request.timeout_sec.map(Duration::from_secs);
    let mut timed_out = false;
    let mut cancelled = false;
    let status = loop {
        if request.cancellation.load(Ordering::SeqCst) {
            cancelled = true;
            terminate_command_process_tree(&mut child);
        } else if timeout.is_some_and(|timeout| started_at.elapsed() >= timeout) {
            timed_out = true;
            terminate_command_process_tree(&mut child);
        }
        if let Some(status) = child.try_wait()? {
            break status;
        }
        sleep(Duration::from_millis(20));
    };
    let (stdout, stdout_truncated) = stdout_task
        .join()
        .map_err(|_| anyhow!("command stdout reader failed"))??;
    let (mut stderr, stderr_truncated) = stderr_task
        .join()
        .map_err(|_| anyhow!("command stderr reader failed"))??;
    if cancelled {
        return Err(CommandExecutionProcessError::Cancelled.into());
    }
    if timed_out {
        let timeout_message = format!(
            "command timed out after {}s",
            request.timeout_sec.unwrap_or_default()
        );
        if !stderr.is_empty() {
            stderr.push('\n');
        }
        stderr.push_str(&timeout_message);
    }

    Ok(CommandExecutionResult {
        success: !timed_out && status.success(),
        exit_code: (!timed_out).then(|| status.code()).flatten(),
        stdout,
        stderr,
        stdout_truncated,
        stderr_truncated,
    })
}

/// Runs one camera helper with bounded output, cancellation, timeout, and child reaping.
///
/// Native stdout/stderr never crosses this Platform boundary on failure.
#[cfg(any(target_os = "windows", target_os = "linux", test))]
pub(crate) fn run_bounded_camera_command(
    command: &mut Command,
    timeout: Duration,
    cancellation: &std::sync::atomic::AtomicBool,
) -> Result<BoundedCameraCommandOutput> {
    if cancellation.load(Ordering::SeqCst) {
        return Err(CameraCaptureProcessError::cancelled().into());
    }

    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    configure_command_process_group(command);
    let mut child = command
        .spawn()
        .map_err(|_| CameraCaptureProcessError::helper_spawn_failed())?;
    let Some(stdout_reader) = child.stdout.take() else {
        terminate_command_process_tree(&mut child);
        let _ = child.wait();
        return Err(CameraCaptureProcessError::helper_protocol_invalid().into());
    };
    let Some(stderr_reader) = child.stderr.take() else {
        terminate_command_process_tree(&mut child);
        let _ = child.wait();
        return Err(CameraCaptureProcessError::helper_protocol_invalid().into());
    };
    let stdout_task = thread::spawn(move || read_bounded_output(stdout_reader));
    let stderr_task = thread::spawn(move || read_bounded_output(stderr_reader));
    let started_at = Instant::now();
    let mut timed_out = false;
    let mut cancelled = false;

    let status = loop {
        if cancellation.load(Ordering::SeqCst) {
            cancelled = true;
            terminate_command_process_tree(&mut child);
        } else if started_at.elapsed() >= timeout {
            timed_out = true;
            terminate_command_process_tree(&mut child);
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => sleep(Duration::from_millis(20)),
            Err(_) => {
                terminate_command_process_tree(&mut child);
                let _ = child.wait();
                let _ = stdout_task.join();
                let _ = stderr_task.join();
                return Err(CameraCaptureProcessError::helper_protocol_invalid().into());
            }
        }
    };

    let stdout = join_camera_output(stdout_task)?;
    let _stderr = join_camera_output(stderr_task)?;
    if cancelled {
        return Err(CameraCaptureProcessError::cancelled().into());
    }
    if timed_out {
        return Err(CameraCaptureProcessError::timed_out().into());
    }
    if !status.success() {
        return Err(CameraCaptureProcessError::helper_exited().into());
    }
    if stdout.1 {
        return Err(CameraCaptureProcessError::helper_protocol_invalid().into());
    }
    Ok(BoundedCameraCommandOutput { stdout: stdout.0 })
}

#[cfg(any(target_os = "windows", target_os = "linux", test))]
pub(crate) fn camera_capture_timeout(requested_ms: Option<u64>) -> Duration {
    Duration::from_millis(
        requested_ms
            .unwrap_or(DEFAULT_CAMERA_CAPTURE_TIMEOUT_MS)
            .clamp(MIN_CAMERA_CAPTURE_TIMEOUT_MS, MAX_CAMERA_CAPTURE_TIMEOUT_MS),
    )
}

#[cfg(any(target_os = "windows", target_os = "linux", test))]
fn join_camera_output(
    task: thread::JoinHandle<std::io::Result<(String, bool)>>,
) -> Result<(String, bool)> {
    task.join()
        .ok()
        .and_then(Result::ok)
        .ok_or_else(|| CameraCaptureProcessError::helper_protocol_invalid().into())
}

fn read_bounded_output(mut reader: impl Read) -> std::io::Result<(String, bool)> {
    let mut kept = Vec::new();
    let mut buffer = [0u8; 8192];
    let mut truncated = false;
    loop {
        let read = reader.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        let remaining = MAX_COMMAND_OUTPUT_BYTES.saturating_sub(kept.len());
        let copied = remaining.min(read);
        kept.extend_from_slice(&buffer[..copied]);
        truncated |= copied < read;
    }
    Ok((String::from_utf8_lossy(&kept).into_owned(), truncated))
}

#[cfg(unix)]
fn configure_command_process_group(command: &mut Command) {
    use std::os::unix::process::CommandExt;

    command.process_group(0);
}

#[cfg(not(unix))]
fn configure_command_process_group(_command: &mut Command) {}

#[cfg(unix)]
fn terminate_command_process_tree(child: &mut std::process::Child) {
    if let Ok(process_group) = i32::try_from(child.id()) {
        // SAFETY: the child is created in a new process group whose ID is its PID.
        unsafe {
            libc::kill(-process_group, libc::SIGKILL);
        }
    }
    let _ = child.kill();
}

#[cfg(windows)]
fn terminate_command_process_tree(child: &mut std::process::Child) {
    let _ = Command::new("taskkill")
        .args(["/PID", &child.id().to_string(), "/T", "/F"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    let _ = child.kill();
}

#[cfg(not(any(unix, windows)))]
fn terminate_command_process_tree(child: &mut std::process::Child) {
    let _ = child.kill();
}

#[allow(dead_code)]
pub fn not_implemented(feature: &str, platform: PlatformKind) -> anyhow::Error {
    anyhow!(
        "{feature} is scaffolded but not implemented yet for {:?}",
        platform
    )
}

pub fn validate_mouse_move(request: &MouseMoveRequest) -> Result<()> {
    if request.x < 0 || request.y < 0 {
        bail!("mouse coordinates must be zero or greater");
    }
    Ok(())
}

pub fn validate_mouse_click(request: &MouseClickRequest) -> Result<()> {
    if request.x < 0 || request.y < 0 {
        bail!("mouse coordinates must be zero or greater");
    }
    Ok(())
}

pub fn validate_camera_request(request: &CameraCaptureRequest) -> Result<()> {
    if let Some(path) = &request.output_path
        && path.trim().is_empty()
    {
        bail!("output_path must not be empty");
    }
    Ok(())
}

pub fn validate_screen_request(request: &ScreenCaptureRequest) -> Result<()> {
    if let Some(path) = &request.output_path
        && path.trim().is_empty()
    {
        bail!("output_path must not be empty");
    }
    Ok(())
}

pub fn validate_application_request(request: &ApplicationLaunchRequest) -> Result<()> {
    if request.application.trim().is_empty() {
        bail!("application must not be empty");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;
    #[cfg(unix)]
    use std::sync::{Arc, atomic::AtomicBool};

    use super::*;

    #[test]
    fn command_output_reader_drains_but_retains_only_the_bounded_prefix() {
        let bytes = vec![b'x'; MAX_COMMAND_OUTPUT_BYTES + 37];

        let (output, truncated) = read_bounded_output(Cursor::new(bytes)).expect("bounded output");

        assert_eq!(output.len(), MAX_COMMAND_OUTPUT_BYTES);
        assert!(truncated);
    }

    #[cfg(unix)]
    #[test]
    fn pre_cancelled_command_never_spawns_the_process() {
        let marker =
            std::env::temp_dir().join(format!("knowbee-command-cancelled-{}", std::process::id()));
        let _ = std::fs::remove_file(&marker);
        let cancellation = Arc::new(AtomicBool::new(true));
        let error = execute_command(CommandExecutionRequest {
            command: "/usr/bin/touch".to_string(),
            args: vec![marker.display().to_string()],
            cwd: None,
            shell: false,
            env: Default::default(),
            timeout_sec: Some(5),
            cancellation,
        })
        .expect_err("pre-cancelled command");

        assert_eq!(
            error
                .downcast_ref::<CommandExecutionProcessError>()
                .copied(),
            Some(CommandExecutionProcessError::Cancelled)
        );
        assert!(!marker.exists());
    }

    #[cfg(unix)]
    #[test]
    fn active_shell_cancellation_terminates_its_process_group_and_returns_typed_error() {
        let marker = std::env::temp_dir().join(format!(
            "knowbee-command-active-cancelled-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&marker);
        let cancellation = Arc::new(AtomicBool::new(false));
        let task_cancellation = Arc::clone(&cancellation);
        let marker_argument = marker.display().to_string();
        let started_at = Instant::now();
        let task = thread::spawn(move || {
            execute_command(CommandExecutionRequest {
                command: format!("sleep 5; /usr/bin/touch '{marker_argument}'"),
                args: Vec::new(),
                cwd: None,
                shell: true,
                env: Default::default(),
                timeout_sec: Some(10),
                cancellation: task_cancellation,
            })
        });
        sleep(Duration::from_millis(100));
        cancellation.store(true, Ordering::SeqCst);

        let error = task
            .join()
            .expect("command worker")
            .expect_err("active command cancellation");

        assert_eq!(
            error
                .downcast_ref::<CommandExecutionProcessError>()
                .copied(),
            Some(CommandExecutionProcessError::Cancelled)
        );
        assert!(started_at.elapsed() < Duration::from_secs(2));
        sleep(Duration::from_millis(100));
        assert!(!marker.exists());
    }

    #[cfg(unix)]
    #[test]
    fn bounded_camera_process_times_out_and_reaps_the_process_group() {
        let mut command = Command::new("sh");
        command.args(["-c", "sleep 5"]);
        let cancellation = AtomicBool::new(false);
        let started_at = Instant::now();

        let error =
            run_bounded_camera_command(&mut command, Duration::from_millis(50), &cancellation)
                .expect_err("camera process timeout");

        assert_eq!(
            error
                .downcast_ref::<crate::automation::CameraCaptureProcessError>()
                .map(crate::automation::CameraCaptureProcessError::failure),
            Some(crate::automation::CameraCaptureFailure::HelperTimeout)
        );
        assert!(started_at.elapsed() < Duration::from_secs(2));
    }

    #[cfg(unix)]
    #[test]
    fn bounded_camera_process_returns_typed_non_zero_exit_without_raw_output() {
        let mut command = Command::new("sh");
        command.args(["-c", "echo private-camera-detail >&2; exit 7"]);
        let cancellation = AtomicBool::new(false);

        let error = run_bounded_camera_command(&mut command, Duration::from_secs(1), &cancellation)
            .expect_err("camera process non-zero exit");

        assert_eq!(
            error
                .downcast_ref::<crate::automation::CameraCaptureProcessError>()
                .map(crate::automation::CameraCaptureProcessError::failure),
            Some(crate::automation::CameraCaptureFailure::HelperExited)
        );
        assert!(!error.to_string().contains("private-camera-detail"));
    }

    #[cfg(unix)]
    #[test]
    fn bounded_camera_process_cancellation_reaps_descendants_before_returning() {
        let marker = std::env::temp_dir().join(format!(
            "knowbee-camera-active-cancelled-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&marker);
        let cancellation = Arc::new(AtomicBool::new(false));
        let task_cancellation = Arc::clone(&cancellation);
        let marker_argument = marker.display().to_string();
        let task = thread::spawn(move || {
            let mut command = Command::new("sh");
            command.args([
                "-c",
                &format!("sleep 5; /usr/bin/touch '{marker_argument}'"),
            ]);
            run_bounded_camera_command(
                &mut command,
                Duration::from_secs(10),
                task_cancellation.as_ref(),
            )
        });
        sleep(Duration::from_millis(100));
        cancellation.store(true, Ordering::SeqCst);

        let error = task
            .join()
            .expect("camera worker")
            .expect_err("active camera cancellation");
        assert_eq!(
            error
                .downcast_ref::<crate::automation::CameraCaptureProcessError>()
                .map(crate::automation::CameraCaptureProcessError::failure),
            Some(crate::automation::CameraCaptureFailure::Cancelled)
        );
        sleep(Duration::from_millis(100));
        assert!(!marker.exists());
    }

    #[test]
    fn camera_timeout_budget_has_stable_default_and_bounds() {
        assert_eq!(
            camera_capture_timeout(None),
            Duration::from_millis(DEFAULT_CAMERA_CAPTURE_TIMEOUT_MS)
        );
        assert_eq!(
            camera_capture_timeout(Some(1)),
            Duration::from_millis(MIN_CAMERA_CAPTURE_TIMEOUT_MS)
        );
        assert_eq!(
            camera_capture_timeout(Some(90_000)),
            Duration::from_millis(MAX_CAMERA_CAPTURE_TIMEOUT_MS)
        );
    }
}
