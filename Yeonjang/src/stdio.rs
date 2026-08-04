use std::io::{BufRead, Read, Write};
use std::sync::Arc;
use std::sync::mpsc::{Receiver, SyncSender, TryRecvError, sync_channel};

use crate::artifact_sink::{CaptureArtifactError, configured_filesystem_sink};
use crate::authorization::{AuthorizationClock, RejectAllAuthorizationVerifier};
use crate::authorization_bootstrap::{
    AuthorizationBootstrapError, AuthorizationBootstrapInput, build_side_effect_admission,
};
use crate::automation::AutomationBackend;
use crate::managed_request::ManagedRequestService;
use crate::protocol::Response;
use crate::request_dispatcher::{
    DispatchBuildError, DispatchConfig, DispatchError, TokioRequestDispatcher,
};
use crate::request_schema::{MAX_CANONICAL_REQUEST_BYTES, parse_canonical_request};
use crate::runtime::{RuntimeBuildError, RuntimeConfig, RuntimeSupervisor};
use crate::runtime_host::{RuntimeHostConfig, RuntimeHostError, TokioRuntimeHost};
use crate::settings::YeonjangSettings;
use crate::side_effect_admission::SideEffectAdmission;

const STDIO_MAX_IN_FLIGHT: usize = 8;
const STDIO_MAX_PENDING: usize = STDIO_MAX_IN_FLIGHT;

#[derive(Debug)]
pub enum StdioRunError {
    Artifact(CaptureArtifactError),
    Io,
    RuntimeHost(RuntimeHostError),
    Runtime(RuntimeBuildError),
    Dispatcher(DispatchBuildError),
    Authorization(AuthorizationBootstrapError),
    ResponseChannelClosed,
}

impl std::fmt::Display for StdioRunError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{self:?}")
    }
}

impl std::error::Error for StdioRunError {}

pub fn run_stdio_with_backend<R, W>(
    reader: R,
    writer: W,
    settings: YeonjangSettings,
    backend: Arc<dyn AutomationBackend>,
) -> Result<(), StdioRunError>
where
    R: BufRead,
    W: Write,
{
    let admission = SideEffectAdmission::new(Arc::new(RejectAllAuthorizationVerifier));
    run_stdio_with_admission(reader, writer, settings, backend, admission)
}

pub fn run_authenticated_stdio_with_backend<R, W>(
    reader: R,
    writer: W,
    settings: YeonjangSettings,
    backend: Arc<dyn AutomationBackend>,
    authorization: AuthorizationBootstrapInput,
    clock: Arc<dyn AuthorizationClock>,
) -> Result<(), StdioRunError>
where
    R: BufRead,
    W: Write,
{
    let admission =
        build_side_effect_admission(authorization, clock).map_err(StdioRunError::Authorization)?;
    run_stdio_with_admission(reader, writer, settings, backend, admission)
}

fn run_stdio_with_admission<R, W>(
    mut reader: R,
    mut writer: W,
    settings: YeonjangSettings,
    backend: Arc<dyn AutomationBackend>,
    admission: SideEffectAdmission,
) -> Result<(), StdioRunError>
where
    R: BufRead,
    W: Write,
{
    let host = TokioRuntimeHost::acquire(RuntimeHostConfig {
        worker_threads: 2,
        max_blocking_threads: STDIO_MAX_IN_FLIGHT,
    })
    .map_err(StdioRunError::RuntimeHost)?;
    let artifact_sink =
        configured_filesystem_sink(&settings.capture_artifact_root, &settings.instance_id)
            .map_err(StdioRunError::Artifact)?;
    let supervisor = RuntimeSupervisor::new_with_admission_and_artifact_sink(
        RuntimeConfig {
            max_in_flight: STDIO_MAX_IN_FLIGHT,
        },
        settings,
        backend,
        admission,
        artifact_sink,
    )
    .map_err(StdioRunError::Runtime)?;
    let dispatcher = TokioRequestDispatcher::new(
        DispatchConfig {
            max_pending: STDIO_MAX_PENDING,
        },
        host.handle(),
        ManagedRequestService::new(supervisor.clone()),
    )
    .map_err(StdioRunError::Dispatcher)?;
    let (sender, responses) = sync_channel(STDIO_MAX_PENDING);
    let mut outstanding = 0usize;

    loop {
        let line = match read_bounded_line(&mut reader)? {
            BoundedLine::End => break,
            BoundedLine::Oversized => {
                write_response(
                    &mut writer,
                    &Response::error(None, "invalid_request", "Invalid canonical request."),
                )?;
                continue;
            }
            BoundedLine::Line(line) => line,
        };
        let trimmed = trim_ascii(&line);
        if trimmed.is_empty() {
            continue;
        }
        drain_ready(&responses, &mut writer, &mut outstanding)?;
        if outstanding == STDIO_MAX_PENDING {
            write_next(&responses, &mut writer, &mut outstanding)?;
        }
        let request = match parse_canonical_request(trimmed) {
            Ok(request) => request.into_request(),
            Err(_) => {
                write_response(
                    &mut writer,
                    &Response::error(None, "invalid_request", "Invalid canonical request."),
                )?;
                continue;
            }
        };
        match dispatcher.try_dispatch(request) {
            Ok(task) => {
                spawn_response_forwarder(host.handle(), task, sender.clone());
                outstanding += 1;
            }
            Err(error) => {
                write_response(&mut writer, &dispatch_error_response(error))?;
            }
        }
    }

    while outstanding > 0 {
        write_next(&responses, &mut writer, &mut outstanding)?;
    }
    host.block_on(async {
        dispatcher.shutdown().await;
        supervisor.shutdown().await;
    });
    Ok(())
}

enum BoundedLine {
    End,
    Line(Vec<u8>),
    Oversized,
}

fn read_bounded_line<R: BufRead>(reader: &mut R) -> Result<BoundedLine, StdioRunError> {
    let mut bytes = Vec::with_capacity(4 * 1024);
    let limit = MAX_CANONICAL_REQUEST_BYTES + 2;
    let read = reader
        .by_ref()
        .take(limit as u64)
        .read_until(b'\n', &mut bytes)
        .map_err(|_| StdioRunError::Io)?;
    if read == 0 {
        return Ok(BoundedLine::End);
    }
    let has_newline = bytes.last() == Some(&b'\n');
    if !has_newline && bytes.len() == limit {
        discard_through_newline(reader)?;
        return Ok(BoundedLine::Oversized);
    }
    if has_newline {
        bytes.pop();
        if bytes.last() == Some(&b'\r') {
            bytes.pop();
        }
    }
    if bytes.len() > MAX_CANONICAL_REQUEST_BYTES {
        return Ok(BoundedLine::Oversized);
    }
    Ok(BoundedLine::Line(bytes))
}

fn discard_through_newline<R: BufRead>(reader: &mut R) -> Result<(), StdioRunError> {
    loop {
        let buffered = reader.fill_buf().map_err(|_| StdioRunError::Io)?;
        if buffered.is_empty() {
            return Ok(());
        }
        if let Some(index) = buffered.iter().position(|byte| *byte == b'\n') {
            reader.consume(index + 1);
            return Ok(());
        }
        let consumed = buffered.len();
        reader.consume(consumed);
    }
}

fn trim_ascii(mut bytes: &[u8]) -> &[u8] {
    while bytes.first().is_some_and(u8::is_ascii_whitespace) {
        bytes = &bytes[1..];
    }
    while bytes.last().is_some_and(u8::is_ascii_whitespace) {
        bytes = &bytes[..bytes.len() - 1];
    }
    bytes
}

fn spawn_response_forwarder(
    runtime: tokio::runtime::Handle,
    task: tokio::task::JoinHandle<Response>,
    sender: SyncSender<Response>,
) {
    runtime.spawn(async move {
        let response = task
            .await
            .unwrap_or_else(|_| Response::error(None, "request_failed", "Request worker failed."));
        let _ = sender.send(response);
    });
}

fn drain_ready<W: Write>(
    responses: &Receiver<Response>,
    writer: &mut W,
    outstanding: &mut usize,
) -> Result<(), StdioRunError> {
    loop {
        match responses.try_recv() {
            Ok(response) => {
                write_response(writer, &response)?;
                *outstanding = outstanding.saturating_sub(1);
            }
            Err(TryRecvError::Empty) => return Ok(()),
            Err(TryRecvError::Disconnected) => {
                return Err(StdioRunError::ResponseChannelClosed);
            }
        }
    }
}

fn write_next<W: Write>(
    responses: &Receiver<Response>,
    writer: &mut W,
    outstanding: &mut usize,
) -> Result<(), StdioRunError> {
    let response = responses
        .recv()
        .map_err(|_| StdioRunError::ResponseChannelClosed)?;
    write_response(writer, &response)?;
    *outstanding = outstanding.saturating_sub(1);
    Ok(())
}

fn write_response<W: Write>(writer: &mut W, response: &Response) -> Result<(), StdioRunError> {
    serde_json::to_writer(&mut *writer, response).map_err(|_| StdioRunError::Io)?;
    writer.write_all(b"\n").map_err(|_| StdioRunError::Io)?;
    writer.flush().map_err(|_| StdioRunError::Io)
}

fn dispatch_error_response(error: DispatchError) -> Response {
    match error {
        DispatchError::Backpressure => Response::error(
            None,
            "runtime_backpressure",
            "Runtime capacity is currently full.",
        ),
        DispatchError::ShuttingDown => {
            Response::error(None, "runtime_shutting_down", "Runtime is shutting down.")
        }
    }
}
