#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

mod automation;
mod features;
mod gui;
mod icon;
mod lifecycle;
mod mqtt;
mod node;
mod platform;
mod protocol;
mod settings;

use std::env;
use std::io::{self, BufRead, Write};
use std::path::Path;
#[cfg(target_os = "macos")]
use std::process::{Command, Stdio};

use anyhow::Result;
use serde_json::json;

use crate::lifecycle::{managed_runtime_state, new_shared_lifecycle_state};
use crate::mqtt::{RuntimeEvent, start_runtime};
use crate::node::spawn_request_task;
use crate::protocol::{Request, Response};
use crate::settings::load_settings;

fn main() -> Result<()> {
    let args: Vec<String> = env::args().skip(1).collect();

    if let Some(camera_helper_index) = args.iter().position(|arg| arg == "--camera-capture-helper")
    {
        run_camera_capture_helper(args[(camera_helper_index + 1)..].to_vec())?;
        return Ok(());
    }

    if let Some(command) = parse_flag_value(&args, "--exec") {
        run_exec_shell(command)?;
        return Ok(());
    }

    if let Some(exec_bin_index) = args.iter().position(|arg| arg == "--exec-bin") {
        run_exec_binary(args[(exec_bin_index + 1)..].to_vec())?;
        return Ok(());
    }

    if let Some(output_path) = parse_flag_value(&args, "--write-icon") {
        icon::write_bundle_icon_png(Path::new(&output_path))?;
        return Ok(());
    }

    if args.iter().any(|arg| arg == "--stdio") {
        run_stdio()?;
        return Ok(());
    }

    if args
        .iter()
        .any(|arg| arg == "--managed" || arg == "--headless-managed")
    {
        run_managed()?;
        return Ok(());
    }

    if args.is_empty() || args.iter().any(|arg| arg == "--gui") {
        gui::run_gui()?;
        return Ok(());
    }

    eprintln!(
        "Usage: knowbee-yeonjang [--gui | --managed | --stdio | --write-icon <path> | --exec <command> | --exec-bin <program> [args...] | --camera-capture-helper <args...>]"
    );
    std::process::exit(2);
}

fn run_stdio() -> Result<()> {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut writer = stdout.lock();

    for line in stdin.lock().lines() {
        let line = line?;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let response = match serde_json::from_str::<Request>(trimmed) {
            Ok(request) => spawn_request_task(request).join().unwrap_or_else(|_| {
                Response::error(None, "request_failed", "request thread panicked")
            }),
            Err(error) => Response::error(None, "invalid_request", error.to_string()),
        };

        serde_json::to_writer(&mut writer, &response)?;
        writer.write_all(b"\n")?;
        writer.flush()?;
    }

    Ok(())
}

fn run_exec_shell(command: String) -> Result<()> {
    let response = spawn_request_task(Request {
        id: Some("local-exec".to_string()),
        method: "system.exec".to_string(),
        params: json!({
            "command": command,
            "shell": true,
        }),
        metadata: Default::default(),
    })
    .join()
    .unwrap_or_else(|_| Response::error(None, "request_failed", "request thread panicked"));
    write_response_and_exit(response)
}

fn run_exec_binary(args: Vec<String>) -> Result<()> {
    let Some(program) = args.first().cloned() else {
        eprintln!("Usage: knowbee-yeonjang --exec-bin <program> [args...]");
        std::process::exit(2);
    };

    let response = spawn_request_task(Request {
        id: Some("local-exec-bin".to_string()),
        method: "system.exec".to_string(),
        params: json!({
            "command": program,
            "args": args.into_iter().skip(1).collect::<Vec<_>>(),
            "shell": false,
        }),
        metadata: Default::default(),
    })
    .join()
    .unwrap_or_else(|_| Response::error(None, "request_failed", "request thread panicked"));
    write_response_and_exit(response)
}

fn run_managed() -> Result<()> {
    let settings = load_settings()?;
    let lifecycle_state = new_shared_lifecycle_state(managed_runtime_state());
    let (_runtime, receiver) = start_runtime(settings, lifecycle_state)?;

    eprintln!("Yeonjang managed runtime started. Press Ctrl+C to stop.");
    for event in receiver {
        match event {
            RuntimeEvent::Connected => eprintln!("Yeonjang MQTT connected."),
            RuntimeEvent::Reconnecting(message)
            | RuntimeEvent::Disconnected(message)
            | RuntimeEvent::AuthFailed(message) => eprintln!("{message}"),
            RuntimeEvent::ResponsePublishFailed { method, message } => {
                eprintln!("failed to publish `{method}` response: {message}");
            }
            RuntimeEvent::RequestHandled { method, ok } => {
                eprintln!("handled `{method}` request (ok={ok})");
            }
        }
    }

    Ok(())
}

fn run_camera_capture_helper(args: Vec<String>) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        return crate::platform::run_platform_camera_capture_helper(args);
    }

    #[cfg(target_os = "macos")]
    {
        return run_macos_camera_capture_helper(args);
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = args;
        anyhow::bail!("camera capture helper is not implemented for this platform");
    }
}

#[cfg(target_os = "macos")]
fn run_macos_camera_capture_helper(args: Vec<String>) -> Result<()> {
    let current_exe = env::current_exe()?;
    let helper_path = current_exe
        .parent()
        .map(|directory| directory.join("yeonjang-camera-helper"))
        .ok_or_else(|| anyhow::anyhow!("failed to resolve Yeonjang executable directory"))?;

    if !helper_path.is_file() {
        anyhow::bail!(
            "bundled camera capture helper was not found next to the Yeonjang executable: {}",
            helper_path.display()
        );
    }

    let output = Command::new(&helper_path)
        .args(args)
        .stdin(Stdio::null())
        .output()?;

    io::stdout().lock().write_all(&output.stdout)?;
    io::stderr().lock().write_all(&output.stderr)?;

    if output.status.success() {
        return Ok(());
    }

    std::process::exit(output.status.code().unwrap_or(1));
}

fn write_response_and_exit(response: Response) -> Result<()> {
    serde_json::to_writer_pretty(io::stdout().lock(), &response)?;
    io::stdout().lock().write_all(b"\n")?;

    if response.ok {
        return Ok(());
    }

    std::process::exit(1);
}

fn parse_flag_value(args: &[String], flag: &str) -> Option<String> {
    let index = args.iter().position(|arg| arg == flag)?;
    args.get(index + 1).cloned()
}
