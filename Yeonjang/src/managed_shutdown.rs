//! OS-specific signal registration for the managed process composition root.
//!
//! The MQTT runtime remains the single shutdown owner. This module only turns
//! native console signals into one wake-up future and never releases leases,
//! cancels effects, or decides whether shutdown completed.

use std::io;

use crate::platform_operation::TargetPlatform;

/// How a Windows-subsystem managed process obtained its console signal source.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ManagedSignalSource {
    Inherited,
    Attached,
}

/// Native signals accepted by a managed package process.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ManagedShutdownSignal {
    Interrupt,
    Break,
}

/// Documents the native signal contract without probing the running host.
pub const fn managed_shutdown_signals_for(
    platform: TargetPlatform,
) -> &'static [ManagedShutdownSignal] {
    match platform {
        TargetPlatform::Windows => &[
            ManagedShutdownSignal::Interrupt,
            ManagedShutdownSignal::Break,
        ],
        TargetPlatform::Macos | TargetPlatform::Linux => &[ManagedShutdownSignal::Interrupt],
        TargetPlatform::Android | TargetPlatform::Ios | TargetPlatform::Unknown => &[],
    }
}

/// Ensures that a Windows-subsystem managed process can receive the exact
/// parent process-group Ctrl+Break used by the native release gate.
#[cfg(target_os = "windows")]
pub fn prepare_managed_signal_source() -> io::Result<ManagedSignalSource> {
    use windows_sys::Win32::Foundation::{ERROR_ACCESS_DENIED, GetLastError};
    use windows_sys::Win32::System::Console::{ATTACH_PARENT_PROCESS, AttachConsole, GetConsoleCP};

    if unsafe { GetConsoleCP() } != 0 {
        return Ok(ManagedSignalSource::Inherited);
    }
    if unsafe { AttachConsole(ATTACH_PARENT_PROCESS) } != 0 {
        return Ok(ManagedSignalSource::Attached);
    }
    let error = unsafe { GetLastError() };
    if error == ERROR_ACCESS_DENIED {
        Ok(ManagedSignalSource::Inherited)
    } else {
        Err(io::Error::from_raw_os_error(error.cast_signed()))
    }
}

/// Unix managed processes inherit the caller's signal source directly.
#[cfg(not(target_os = "windows"))]
pub const fn prepare_managed_signal_source() -> io::Result<ManagedSignalSource> {
    Ok(ManagedSignalSource::Inherited)
}

/// Waits for one supported console signal and leaves all shutdown work to the
/// owning managed runtime.
#[cfg(not(target_os = "windows"))]
pub async fn wait_for_managed_shutdown_signal() -> io::Result<()> {
    tokio::signal::ctrl_c().await
}

/// Windows live gates use a new process group so Ctrl+Break can target only
/// the packaged Yeonjang process. Interactive Ctrl+C remains supported.
#[cfg(target_os = "windows")]
pub async fn wait_for_managed_shutdown_signal() -> io::Result<()> {
    let mut ctrl_break = tokio::signal::windows::ctrl_break()?;
    tokio::select! {
        result = tokio::signal::ctrl_c() => result,
        received = ctrl_break.recv() => received
            .map(|_| ())
            .ok_or_else(|| io::Error::new(io::ErrorKind::BrokenPipe, "console signal stream closed")),
    }
}
