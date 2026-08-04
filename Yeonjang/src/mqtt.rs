use std::net::{TcpStream, ToSocketAddrs};
use std::sync::mpsc::{self, Receiver, SyncSender};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result, anyhow};
use rumqttc::{AsyncClient, Event, EventLoop, Incoming, LastWill, MqttOptions, Outgoing, QoS};
use serde::Serialize;
use serde_json::json;
use sha2::{Digest, Sha256};
use tokio::task::JoinHandle;

#[cfg(test)]
use crate::automation::AutomationBackend;
use crate::automation::AutomationCapabilities;
use crate::lifecycle::{
    LifecycleRegistrationState, SharedLifecycleState, read_shared_lifecycle_state,
    runtime_support_profile,
};
use crate::method_descriptor::method_descriptor;
use crate::mqtt_connection_lifecycle::{
    ConnectionAction, ConnectionEvent, ConnectionState, transition,
};
use crate::mqtt_transport::MqttTransportSecurity;
use crate::node::{build_target, capabilities_payload_with_snapshot, git_commit, git_tag};
use crate::protocol::{
    CommandAttemptEvidence, CommandAttemptRetrySafety, CommandAttemptTerminalStage, Request,
    Response,
};
use crate::request_dispatcher::{
    DeliveryError, DispatchError, ResponseDelivery, TokioRequestDispatcher,
};
use crate::request_schema::{RequestSchemaError, parse_canonical_request};
use crate::settings::YeonjangSettings;

const RESPONSE_CHUNK_BYTES: usize = 48 * 1024;
const MQTT_MAX_PACKET_BYTES: usize = 8 * 1024 * 1024;
const MQTT_REQUEST_CHANNEL_CAPACITY: usize = 256;
const MQTT_RUNTIME_EVENT_CAPACITY: usize = 256;
const MQTT_RECONNECT_DELAY: Duration = Duration::from_secs(5);
const MQTT_EVENT_POLL_INTERVAL: Duration = Duration::from_secs(5);
const MQTT_HEARTBEAT_INTERVAL: Duration = Duration::from_secs(30);

#[derive(Debug, Clone)]
pub enum RuntimeEvent {
    Connected,
    Reconnecting(String),
    Disconnected(String),
    AuthFailed(String),
    ResponsePublishFailed { method: String, message: String },
    RequestHandled { method: String, ok: bool },
}

fn emit_runtime_event(event_tx: &SyncSender<RuntimeEvent>, event: RuntimeEvent) -> bool {
    event_tx.try_send(event).is_ok()
}

pub struct MqttRuntimeHandle {
    client: Arc<Mutex<Option<AsyncClient>>>,
    stop_requested: Arc<AtomicBool>,
    settings: YeonjangSettings,
    session_id: String,
    lifecycle_state: SharedLifecycleState,
    capability_snapshot: AutomationCapabilities,
    task: Option<JoinHandle<()>>,
    dispatcher: TokioRequestDispatcher,
}

impl MqttRuntimeHandle {
    pub fn refresh_presence(&self, message: &str) -> Result<()> {
        let client = self
            .client
            .lock()
            .ok()
            .and_then(|guard| guard.clone())
            .ok_or_else(|| anyhow!("runtime client is not connected"))?;
        publish_runtime_state(
            &client,
            &self.settings,
            &self.session_id,
            message,
            true,
            &self.lifecycle_state,
            &self.capability_snapshot,
        )
    }

    pub async fn stop_async(mut self) -> Result<()> {
        self.request_stop();
        if let Some(task) = self.task.take() {
            task.await
                .map_err(|_| anyhow!("MQTT connection task failed"))?;
        }
        self.dispatcher.shutdown().await;
        Ok(())
    }

    pub(crate) fn request_stop(&self) {
        self.stop_requested.store(true, Ordering::SeqCst);
        if let Some(client) = self.client.lock().ok().and_then(|guard| guard.clone()) {
            let _ = client.try_disconnect();
        }
    }
}

pub(crate) fn start_runtime_with_dispatcher_and_transport(
    settings: YeonjangSettings,
    lifecycle_state: SharedLifecycleState,
    dispatcher: TokioRequestDispatcher,
    transport: MqttTransportSecurity,
    capability_snapshot: AutomationCapabilities,
) -> Result<(MqttRuntimeHandle, Receiver<RuntimeEvent>)> {
    start_runtime_internal(
        settings,
        lifecycle_state,
        dispatcher,
        transport,
        capability_snapshot,
    )
}

fn start_runtime_internal(
    settings: YeonjangSettings,
    lifecycle_state: SharedLifecycleState,
    dispatcher: TokioRequestDispatcher,
    transport: MqttTransportSecurity,
    capability_snapshot: AutomationCapabilities,
) -> Result<(MqttRuntimeHandle, Receiver<RuntimeEvent>)> {
    validate_connection_settings(&settings, &transport)?;

    let normalized = normalize_settings(settings);
    let runtime_session_id = build_runtime_session_id(&normalized);
    let (event_tx, event_rx) = mpsc::sync_channel::<RuntimeEvent>(MQTT_RUNTIME_EVENT_CAPACITY);
    let active_client = Arc::new(Mutex::new(None));
    let stop_requested = Arc::new(AtomicBool::new(false));
    let control_client = Arc::clone(&active_client);
    let control_stop = Arc::clone(&stop_requested);
    let task_settings = normalized.clone();
    let task_session_id = runtime_session_id.clone();
    let task_lifecycle_state = Arc::clone(&lifecycle_state);
    let control_dispatcher = dispatcher.clone();
    let runtime_handle = dispatcher.runtime_handle();
    let task_dispatcher = dispatcher;
    let task_transport = transport;
    let task_capability_snapshot = capability_snapshot.clone();

    let task = runtime_handle.spawn(async move {
        while !stop_requested.load(Ordering::SeqCst) {
            let options = match build_runtime_options(
                &task_settings,
                &task_session_id,
                &read_shared_lifecycle_state(&task_lifecycle_state),
                &task_transport,
                &task_capability_snapshot,
            ) {
                Ok(options) => options,
                Err(error) => {
                    emit_runtime_event(&event_tx, project_runtime_configuration_error(&error));
                    break;
                }
            };

            let (client, mut event_loop) = AsyncClient::new(options, MQTT_REQUEST_CHANNEL_CAPACITY);
            if let Ok(mut slot) = active_client.lock() {
                *slot = Some(client.clone());
            }

            if let Err(_error) = publish_bootstrap(
                &client,
                &task_settings,
                &task_session_id,
                &task_lifecycle_state,
                &task_capability_snapshot,
            ) {
                emit_runtime_event(
                    &event_tx,
                    RuntimeEvent::Reconnecting(format!(
                        "MQTT bootstrap enqueue failed. Retrying in {} seconds.",
                        MQTT_RECONNECT_DELAY.as_secs()
                    )),
                );
                if !sleep_with_stop_check(MQTT_RECONNECT_DELAY, &stop_requested).await {
                    break;
                }
                continue;
            }

            let connection_action = run_connection_loop(ConnectionLoop {
                client: &client,
                event_loop: &mut event_loop,
                settings: &task_settings,
                session_id: &task_session_id,
                event_tx: &event_tx,
                stop_requested: &stop_requested,
                lifecycle_state: &task_lifecycle_state,
                dispatcher: &task_dispatcher,
                capability_snapshot: &task_capability_snapshot,
            })
            .await;

            if let Ok(mut slot) = active_client.lock() {
                *slot = None;
            }

            if connection_action != ConnectionAction::Reconnect {
                break;
            }
        }
    });

    Ok((
        MqttRuntimeHandle {
            client: control_client,
            stop_requested: control_stop,
            settings: normalized,
            session_id: runtime_session_id,
            lifecycle_state,
            capability_snapshot,
            task: Some(task),
            dispatcher: control_dispatcher,
        },
        event_rx,
    ))
}

pub fn probe_connection(settings: &YeonjangSettings) -> Result<()> {
    validate_connection_settings(settings, &MqttTransportSecurity::LoopbackPlaintext)?;
    let address = format!(
        "{}:{}",
        settings.connection.host.trim(),
        settings.connection.port
    );
    let target = address
        .to_socket_addrs()
        .with_context(|| format!("failed to resolve broker address: {address}"))?
        .next()
        .ok_or_else(|| anyhow!("failed to resolve broker address: {address}"))?;

    TcpStream::connect_timeout(&target, Duration::from_secs(2))
        .with_context(|| format!("failed to reach MQTT broker at {address}"))?;
    Ok(())
}

fn build_runtime_options(
    settings: &YeonjangSettings,
    session_id: &str,
    lifecycle: &LifecycleRegistrationState,
    transport: &MqttTransportSecurity,
    capability_snapshot: &AutomationCapabilities,
) -> Result<MqttOptions> {
    let mut options = build_options(settings, session_id)?;
    transport
        .apply(settings.connection.host.trim(), &mut options)
        .map_err(|_| anyhow!("invalid MQTT transport security"))?;
    options.set_keep_alive(Duration::from_secs(20));
    options.set_max_packet_size(MQTT_MAX_PACKET_BYTES, MQTT_MAX_PACKET_BYTES);
    options.set_request_channel_capacity(MQTT_REQUEST_CHANNEL_CAPACITY);
    options.set_credentials(
        settings.connection.username.clone(),
        settings.connection.password.clone(),
    );
    options.set_last_will(LastWill::new(
        settings.mqtt.status_topic.clone(),
        serde_json::to_vec(&status_payload(
            settings,
            session_id,
            "offline",
            "disconnected",
            lifecycle,
            capability_snapshot,
        ))?,
        QoS::AtLeastOnce,
        true,
    ));
    Ok(options)
}

async fn sleep_with_stop_check(duration: Duration, stop_requested: &AtomicBool) -> bool {
    let step = Duration::from_millis(100);
    let mut elapsed = Duration::ZERO;
    while elapsed < duration {
        if stop_requested.load(Ordering::SeqCst) {
            return false;
        }
        let sleep_for = duration.saturating_sub(elapsed).min(step);
        tokio::time::sleep(sleep_for).await;
        elapsed += sleep_for;
    }
    true
}

fn heartbeat_due(last_presence: Instant, now: Instant) -> bool {
    now.saturating_duration_since(last_presence) >= MQTT_HEARTBEAT_INTERVAL
}

struct MqttResponseDelivery {
    client: AsyncClient,
    settings: YeonjangSettings,
    method: String,
    session_id: String,
    event_tx: SyncSender<RuntimeEvent>,
    lifecycle_state: SharedLifecycleState,
    capability_snapshot: AutomationCapabilities,
}

impl ResponseDelivery for MqttResponseDelivery {
    fn deliver(&self, response: &Response) -> Result<(), DeliveryError> {
        if publish_response(&self.client, &self.settings, response).is_err() {
            emit_runtime_event(
                &self.event_tx,
                RuntimeEvent::ResponsePublishFailed {
                    method: self.method.clone(),
                    message: "response publish failed".to_string(),
                },
            );
            return Err(DeliveryError::Unavailable);
        }
        let _ = publish_runtime_state(
            &self.client,
            &self.settings,
            &self.session_id,
            "ready",
            true,
            &self.lifecycle_state,
            &self.capability_snapshot,
        );
        emit_runtime_event(
            &self.event_tx,
            RuntimeEvent::RequestHandled {
                method: self.method.clone(),
                ok: response.ok,
            },
        );
        Ok(())
    }
}

#[allow(clippy::too_many_arguments)]
fn mqtt_response_delivery(
    client: &AsyncClient,
    settings: &YeonjangSettings,
    method: String,
    session_id: &str,
    event_tx: &SyncSender<RuntimeEvent>,
    lifecycle_state: &SharedLifecycleState,
    capability_snapshot: &AutomationCapabilities,
) -> Arc<MqttResponseDelivery> {
    Arc::new(MqttResponseDelivery {
        client: client.clone(),
        settings: settings.clone(),
        method: product_log_method(&method),
        session_id: session_id.to_string(),
        event_tx: event_tx.clone(),
        lifecycle_state: Arc::clone(lifecycle_state),
        capability_snapshot: capability_snapshot.clone(),
    })
}

fn product_log_method(method: &str) -> String {
    match method {
        "invalid_request" | "unknown_method" => method.to_string(),
        _ if method_descriptor(method).is_some() => method.to_string(),
        _ => "unknown_method".to_string(),
    }
}

#[allow(clippy::too_many_arguments)]
fn dispatch_managed_publish(
    dispatcher: &TokioRequestDispatcher,
    payload: Vec<u8>,
    client: &AsyncClient,
    settings: &YeonjangSettings,
    session_id: &str,
    event_tx: &SyncSender<RuntimeEvent>,
    lifecycle_state: &SharedLifecycleState,
    capability_snapshot: &AutomationCapabilities,
) {
    let request = match parse_managed_payload(&payload) {
        Ok(request) => request,
        Err(response) => {
            let delivery = mqtt_response_delivery(
                client,
                settings,
                "invalid_request".to_string(),
                session_id,
                event_tx,
                lifecycle_state,
                capability_snapshot,
            );
            let _ = delivery.deliver(&response);
            return;
        }
    };
    let method = request.method.clone();
    let _ = publish_attempt_stage(
        client,
        settings,
        &request,
        CommandAttemptObservedStage::Received,
    );

    let direct_response = managed_direct_response(&request, session_id);
    if let Some(response) = direct_response {
        let delivery = mqtt_response_delivery(
            client,
            settings,
            method,
            session_id,
            event_tx,
            lifecycle_state,
            capability_snapshot,
        );
        let _ = delivery.deliver(&response);
        return;
    }

    let delivery = mqtt_response_delivery(
        client,
        settings,
        method,
        session_id,
        event_tx,
        lifecycle_state,
        capability_snapshot,
    );
    let dispatch_error = match dispatcher.try_dispatch_and_deliver(request.clone(), delivery) {
        Ok(_) => return,
        Err(error) => error,
    };
    {
        let delivery = mqtt_response_delivery(
            client,
            settings,
            request.method.clone(),
            session_id,
            event_tx,
            lifecycle_state,
            capability_snapshot,
        );
        let response = match dispatch_error {
            DispatchError::Backpressure => runtime_backpressure_response(&request),
            DispatchError::ShuttingDown => Response::error(
                request.id.clone(),
                "runtime_shutting_down",
                "Runtime is shutting down.",
            ),
        };
        let _ = delivery.deliver(&response);
    }
}

fn managed_direct_response(request: &Request, session_id: &str) -> Option<Response> {
    validate_command_metadata(request, session_id)
}

fn parse_managed_payload(payload: &[u8]) -> Result<Request, Box<Response>> {
    parse_canonical_request(payload)
        .map(|canonical| canonical.into_request())
        .map_err(|error| Box::new(project_request_schema_error(error)))
}

fn project_request_schema_error(error: RequestSchemaError) -> Response {
    let (code, message) = match error {
        RequestSchemaError::RequestTooLarge | RequestSchemaError::ParamsTooLarge => (
            "request_too_large",
            "Request payload exceeds the allowed size.",
        ),
        RequestSchemaError::UnsupportedVersion => (
            "unsupported_protocol_version",
            "Request protocol version is not supported.",
        ),
        RequestSchemaError::Malformed
        | RequestSchemaError::InvalidRequestId
        | RequestSchemaError::InvalidMethod => ("invalid_request", "Request payload is invalid."),
    };
    Response::error(None, code, message)
}

fn runtime_backpressure_response(request: &Request) -> Response {
    Response::error(
        request.id.clone(),
        "runtime_backpressure",
        "Runtime capacity is currently full.",
    )
}

struct ConnectionLoop<'a> {
    client: &'a AsyncClient,
    event_loop: &'a mut EventLoop,
    settings: &'a YeonjangSettings,
    session_id: &'a str,
    event_tx: &'a SyncSender<RuntimeEvent>,
    stop_requested: &'a AtomicBool,
    lifecycle_state: &'a SharedLifecycleState,
    dispatcher: &'a TokioRequestDispatcher,
    capability_snapshot: &'a AutomationCapabilities,
}

async fn run_connection_loop(context: ConnectionLoop<'_>) -> ConnectionAction {
    let ConnectionLoop {
        client,
        event_loop,
        settings,
        session_id,
        event_tx,
        stop_requested,
        lifecycle_state,
        dispatcher,
        capability_snapshot,
    } = context;
    let mut connection_state = ConnectionState::Starting;
    let mut last_presence = Instant::now();

    loop {
        let notification = match tokio::time::timeout(MQTT_EVENT_POLL_INTERVAL, event_loop.poll())
            .await
        {
            Ok(notification) => notification,
            Err(_) => {
                if stop_requested.load(Ordering::SeqCst) {
                    emit_runtime_event(
                        event_tx,
                        RuntimeEvent::Disconnected("requested disconnect".to_string()),
                    );
                    return stop_connection(&mut connection_state);
                }
                if connection_state == ConnectionState::Connected
                    && heartbeat_due(last_presence, Instant::now())
                {
                    if publish_runtime_state(
                        client,
                        settings,
                        session_id,
                        "ready",
                        true,
                        lifecycle_state,
                        capability_snapshot,
                    )
                    .is_err()
                    {
                        emit_runtime_event(
                            event_tx,
                            RuntimeEvent::Reconnecting(format!(
                                "MQTT heartbeat publish failed. Retrying in {} seconds.",
                                MQTT_RECONNECT_DELAY.as_secs()
                            )),
                        );
                        return schedule_connection_retry(&mut connection_state, stop_requested)
                            .await;
                    }
                    last_presence = Instant::now();
                }
                continue;
            }
        };
        if stop_requested.load(Ordering::SeqCst) {
            emit_runtime_event(
                event_tx,
                RuntimeEvent::Disconnected("requested disconnect".to_string()),
            );
            return stop_connection(&mut connection_state);
        }

        match notification {
            Ok(Event::Incoming(Incoming::ConnAck(_))) => {
                let Ok(next) = transition(connection_state, ConnectionEvent::ConnectionAccepted)
                else {
                    return stop_connection(&mut connection_state);
                };
                connection_state = next.state;
                last_presence = Instant::now();
                emit_runtime_event(event_tx, RuntimeEvent::Connected);
            }
            Ok(Event::Incoming(Incoming::Publish(publish))) => {
                if publish.topic != settings.mqtt.request_topic {
                    continue;
                }

                let payload = publish.payload.to_vec();
                dispatch_managed_publish(
                    dispatcher,
                    payload,
                    client,
                    settings,
                    session_id,
                    event_tx,
                    lifecycle_state,
                    capability_snapshot,
                );
            }
            Ok(Event::Outgoing(Outgoing::Disconnect)) => {
                emit_runtime_event(
                    event_tx,
                    RuntimeEvent::Disconnected("requested disconnect".to_string()),
                );
                return stop_connection(&mut connection_state);
            }
            Ok(_) => {}
            Err(error) => {
                if connection_state == ConnectionState::Connected {
                    let _ = publish_status(
                        client,
                        settings,
                        session_id,
                        "offline",
                        "disconnected",
                        true,
                        RuntimeProjection {
                            lifecycle: &read_shared_lifecycle_state(lifecycle_state),
                            capabilities: capability_snapshot,
                        },
                    );
                }

                match project_connection_error(&error) {
                    RuntimeEvent::AuthFailed(message) => {
                        emit_runtime_event(event_tx, RuntimeEvent::AuthFailed(message));
                        return authentication_failed(&mut connection_state);
                    }
                    RuntimeEvent::Disconnected(message) | RuntimeEvent::Reconnecting(message) => {
                        emit_runtime_event(
                            event_tx,
                            RuntimeEvent::Reconnecting(format!(
                                "{message}. Retrying in {} seconds.",
                                MQTT_RECONNECT_DELAY.as_secs()
                            )),
                        );
                        return schedule_connection_retry(&mut connection_state, stop_requested)
                            .await;
                    }
                    other => {
                        emit_runtime_event(event_tx, other);
                        return stop_connection(&mut connection_state);
                    }
                }
            }
        }
    }
}

fn authentication_failed(state: &mut ConnectionState) -> ConnectionAction {
    match transition(*state, ConnectionEvent::AuthenticationRejected) {
        Ok(next) => {
            *state = next.state;
            next.action
        }
        Err(_) => ConnectionAction::Stop,
    }
}

fn stop_connection(state: &mut ConnectionState) -> ConnectionAction {
    match transition(*state, ConnectionEvent::StopRequested) {
        Ok(next) => {
            *state = next.state;
            next.action
        }
        Err(_) => ConnectionAction::Stop,
    }
}

async fn schedule_connection_retry(
    state: &mut ConnectionState,
    stop_requested: &AtomicBool,
) -> ConnectionAction {
    let Ok(backoff) = transition(*state, ConnectionEvent::RetryableFailure) else {
        return ConnectionAction::Stop;
    };
    *state = backoff.state;
    if !sleep_with_stop_check(MQTT_RECONNECT_DELAY, stop_requested).await {
        return stop_connection(state);
    }
    match transition(*state, ConnectionEvent::BackoffElapsed) {
        Ok(next) => {
            *state = next.state;
            next.action
        }
        Err(_) => ConnectionAction::Stop,
    }
}

fn now_unix_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

fn validate_command_metadata(request: &Request, runtime_session_id: &str) -> Option<Response> {
    if let Some(target_session_id) = request.metadata.target_session_id.as_deref()
        && !target_session_id.trim().is_empty()
        && target_session_id != runtime_session_id
    {
        return Some(rejected_response_for_request(
            request,
            "session_replaced",
            format!(
                "target session {} is no longer active; current session is {}",
                target_session_id, runtime_session_id
            ),
        ));
    }

    if let Some(expires_at) = request.metadata.expires_at
        && expires_at <= now_unix_millis()
    {
        return Some(rejected_response_for_request(
            request,
            "expired_command",
            "expired command rejected before execution",
        ));
    }

    None
}

fn rejected_response_for_request(
    request: &Request,
    code: impl Into<String>,
    message: impl Into<String>,
) -> Response {
    let code = code.into();
    let message = message.into();
    let attempt = CommandAttemptEvidence::for_request(
        request,
        CommandAttemptTerminalStage::Rejected,
        code.as_str(),
        CommandAttemptRetrySafety::ChangeStrategy,
    );
    match attempt {
        Some(attempt) => Response::error_with_attempt(request.id.clone(), code, message, attempt),
        None => Response::error(request.id.clone(), code, message),
    }
}

fn normalize_settings(mut settings: YeonjangSettings) -> YeonjangSettings {
    if settings.mqtt.request_topic.trim().is_empty()
        || settings.mqtt.response_topic.trim().is_empty()
        || settings.mqtt.status_topic.trim().is_empty()
        || settings.mqtt.capabilities_topic.trim().is_empty()
    {
        settings.reset_topics_from_node_id();
    }
    settings
}

fn build_options(settings: &YeonjangSettings, session_id: &str) -> Result<MqttOptions> {
    let host = settings.connection.host.trim();
    let client_id = build_mqtt_client_id(settings, session_id)?;
    if host.is_empty() {
        anyhow::bail!("broker host is required")
    }
    Ok(MqttOptions::new(client_id, host, settings.connection.port))
}

fn build_mqtt_client_id(settings: &YeonjangSettings, session_id: &str) -> Result<String> {
    let instance_id = settings.instance_id.trim();
    let session_id = session_id.trim();
    if instance_id.is_empty() || session_id.is_empty() {
        anyhow::bail!("MQTT client identity requires instance and session identity")
    }
    let mut digest = Sha256::new();
    digest.update(b"knowbee-yeonjang-mqtt-client-v1\0");
    digest.update(instance_id.as_bytes());
    digest.update(b"\0");
    digest.update(session_id.as_bytes());
    let encoded = format!("{:x}", digest.finalize());
    Ok(format!("knowbee-y-{}", &encoded[..40]))
}

fn validate_connection_settings(
    settings: &YeonjangSettings,
    transport: &MqttTransportSecurity,
) -> Result<()> {
    let host = settings.connection.host.trim();
    if host.is_empty() {
        anyhow::bail!("broker host is required")
    }
    if transport.validate_host(host).is_err() {
        anyhow::bail!("non-loopback MQTT requires an explicit TLS identity")
    }
    if settings.connection.username.trim().is_empty() {
        anyhow::bail!("broker username is required")
    }
    if settings.connection.password.trim().is_empty() {
        anyhow::bail!("broker password is required")
    }
    Ok(())
}

fn publish_bootstrap(
    client: &AsyncClient,
    settings: &YeonjangSettings,
    session_id: &str,
    lifecycle_state: &SharedLifecycleState,
    capability_snapshot: &AutomationCapabilities,
) -> Result<()> {
    client.try_subscribe(settings.mqtt.request_topic.clone(), QoS::AtLeastOnce)?;
    publish_runtime_state(
        client,
        settings,
        session_id,
        "ready",
        true,
        lifecycle_state,
        capability_snapshot,
    )?;
    Ok(())
}

fn publish_response(
    client: &AsyncClient,
    settings: &YeonjangSettings,
    response: &Response,
) -> Result<()> {
    let payload = serde_json::to_vec(response)?;
    if payload.len() <= RESPONSE_CHUNK_BYTES || response.id.is_none() {
        client.try_publish(
            settings.mqtt.response_topic.clone(),
            QoS::AtLeastOnce,
            false,
            payload,
        )?;
        return Ok(());
    }

    let request_id = response.id.as_deref().expect("chunk response ID checked");
    for envelope in build_response_chunks(request_id, &payload) {
        client.try_publish(
            settings.mqtt.response_topic.clone(),
            QoS::AtLeastOnce,
            false,
            serde_json::to_vec(&envelope)?,
        )?;
    }

    Ok(())
}

fn build_response_chunks(request_id: &str, payload: &[u8]) -> Vec<ResponseChunkEnvelope> {
    let chunk_count = payload.len().div_ceil(RESPONSE_CHUNK_BYTES);
    let total_size_bytes = payload.len();
    let payload_digest = format!("sha256:{:x}", Sha256::digest(payload));
    payload
        .chunks(RESPONSE_CHUNK_BYTES)
        .enumerate()
        .map(|(chunk_index, chunk)| ResponseChunkEnvelope {
            transport: "chunk",
            id: request_id.to_string(),
            chunk_index,
            chunk_count,
            total_size_bytes,
            payload_digest: payload_digest.clone(),
            encoding: "base64",
            mime_type: "application/json",
            base64_data: base64_encode(chunk),
        })
        .collect()
}

fn publish_attempt_stage(
    client: &AsyncClient,
    settings: &YeonjangSettings,
    request: &Request,
    stage: CommandAttemptObservedStage,
) -> Result<()> {
    let Some(envelope) = build_attempt_stage_envelope(request, stage) else {
        return Ok(());
    };
    client.try_publish(
        settings.mqtt.response_topic.clone(),
        QoS::AtLeastOnce,
        false,
        serde_json::to_vec(&envelope)?,
    )?;
    Ok(())
}

fn build_attempt_stage_envelope(
    request: &Request,
    stage: CommandAttemptObservedStage,
) -> Option<CommandAttemptStageEnvelope> {
    let method = request.method.trim();
    let command_id = request.metadata.command_id.as_deref()?.trim();
    if method.is_empty() || method.len() > 128 || command_id.is_empty() || command_id.len() > 256 {
        return None;
    }
    Some(CommandAttemptStageEnvelope {
        transport: "attempt_stage",
        id: request.id.clone(),
        schema_version: 1,
        method: method.to_string(),
        command_id: command_id.to_string(),
        stage,
    })
}

fn publish_capabilities(
    client: &AsyncClient,
    settings: &YeonjangSettings,
    session_id: &str,
    lifecycle: &LifecycleRegistrationState,
    capability_snapshot: &AutomationCapabilities,
) -> Result<()> {
    client.try_publish(
        settings.mqtt.capabilities_topic.clone(),
        QoS::AtLeastOnce,
        true,
        serde_json::to_vec(&runtime_capabilities_payload(
            settings,
            session_id,
            lifecycle,
            capability_snapshot,
        ))?,
    )?;
    Ok(())
}

fn publish_runtime_state(
    client: &AsyncClient,
    settings: &YeonjangSettings,
    session_id: &str,
    message: &str,
    retained: bool,
    lifecycle_state: &SharedLifecycleState,
    capability_snapshot: &AutomationCapabilities,
) -> Result<()> {
    let lifecycle = read_shared_lifecycle_state(lifecycle_state);
    publish_capabilities(
        client,
        settings,
        session_id,
        &lifecycle,
        capability_snapshot,
    )?;
    publish_status(
        client,
        settings,
        session_id,
        "online",
        message,
        retained,
        RuntimeProjection {
            lifecycle: &lifecycle,
            capabilities: capability_snapshot,
        },
    )?;
    Ok(())
}

#[derive(Clone, Copy)]
struct RuntimeProjection<'a> {
    lifecycle: &'a LifecycleRegistrationState,
    capabilities: &'a AutomationCapabilities,
}

fn publish_status(
    client: &AsyncClient,
    settings: &YeonjangSettings,
    session_id: &str,
    state: &str,
    message: &str,
    retained: bool,
    projection: RuntimeProjection<'_>,
) -> Result<()> {
    client.try_publish(
        settings.mqtt.status_topic.clone(),
        QoS::AtLeastOnce,
        retained,
        serde_json::to_vec(&status_payload(
            settings,
            session_id,
            state,
            message,
            projection.lifecycle,
            projection.capabilities,
        ))?,
    )?;
    Ok(())
}

fn project_connection_error(error: &rumqttc::ConnectionError) -> RuntimeEvent {
    match error {
        rumqttc::ConnectionError::ConnectionRefused(
            rumqttc::ConnectReturnCode::BadUserNamePassword
            | rumqttc::ConnectReturnCode::NotAuthorized,
        ) => {
            RuntimeEvent::AuthFailed("MQTT broker rejected the configured credentials.".to_string())
        }
        rumqttc::ConnectionError::ConnectionRefused(_) => {
            RuntimeEvent::Disconnected("MQTT broker refused the connection.".to_string())
        }
        _ => RuntimeEvent::Disconnected("MQTT connection failed.".to_string()),
    }
}

fn project_runtime_configuration_error(_error: &anyhow::Error) -> RuntimeEvent {
    RuntimeEvent::Disconnected("MQTT runtime configuration is invalid.".to_string())
}

#[derive(Debug, Serialize)]
struct StatusPayload<'a> {
    session_id: &'a str,
    instance_id: &'a str,
    instance_alias: &'a str,
    node_id: &'a str,
    display_name: &'a str,
    support_profile: &'a str,
    configured_support_profile: &'a str,
    workspace_scope_id: &'a str,
    pairing_fingerprint: Option<String>,
    support_profile_reason_codes: Vec<String>,
    interactive_desktop_available: bool,
    tray_runtime_available: bool,
    host_fingerprint: &'a str,
    install_fingerprint: &'a str,
    startup_mode: &'static str,
    window_mode: &'static str,
    tray_state: &'static str,
    state: &'a str,
    message: &'a str,
    version: &'static str,
    protocol_version: &'static str,
    git_tag: &'static str,
    git_commit: &'static str,
    build_target: &'static str,
    platform: crate::automation::PlatformKind,
    os: &'static str,
    arch: &'static str,
}

fn status_payload<'a>(
    settings: &'a YeonjangSettings,
    session_id: &'a str,
    state: &'a str,
    message: &'a str,
    lifecycle: &LifecycleRegistrationState,
    capability_snapshot: &AutomationCapabilities,
) -> StatusPayload<'a> {
    let support_profile = runtime_support_profile(settings, Some(lifecycle));
    StatusPayload {
        session_id,
        instance_id: settings.instance_id.as_str(),
        instance_alias: settings.instance_alias.as_str(),
        node_id: settings.node_id.as_str(),
        display_name: settings.display_name.as_str(),
        support_profile: support_profile.effective_profile.as_str(),
        configured_support_profile: support_profile.configured_profile.as_str(),
        workspace_scope_id: settings.workspace_scope_id.as_str(),
        pairing_fingerprint: settings.pairing_fingerprint(),
        support_profile_reason_codes: support_profile.reason_codes,
        interactive_desktop_available: support_profile.interactive_desktop_available,
        tray_runtime_available: support_profile.tray_runtime_available,
        host_fingerprint: settings.host_fingerprint.as_str(),
        install_fingerprint: settings.install_fingerprint.as_str(),
        startup_mode: lifecycle.startup_mode.as_str(),
        window_mode: lifecycle.window_mode.as_str(),
        tray_state: lifecycle.tray_state.as_str(),
        state,
        message,
        version: git_tag(),
        protocol_version: "2026-04-16.capability-matrix.v1",
        git_tag: git_tag(),
        git_commit: git_commit(),
        build_target: build_target(),
        platform: capability_snapshot.platform,
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
    }
}

fn runtime_capabilities_payload(
    settings: &YeonjangSettings,
    session_id: &str,
    lifecycle: &LifecycleRegistrationState,
    capability_snapshot: &AutomationCapabilities,
) -> serde_json::Value {
    let support_profile = runtime_support_profile(settings, Some(lifecycle));
    let mut payload = capabilities_payload_with_snapshot(settings, capability_snapshot.clone());
    if let Some(object) = payload.as_object_mut() {
        object.insert("session_id".to_string(), json!(session_id));
        object.insert(
            "instance_id".to_string(),
            json!(settings.instance_id.as_str()),
        );
        object.insert(
            "instance_alias".to_string(),
            json!(settings.instance_alias.as_str()),
        );
        object.insert(
            "normalized_call_name".to_string(),
            json!(normalize_call_name(settings.instance_alias.as_str())),
        );
        object.insert("node_id".to_string(), json!(settings.node_id.as_str()));
        object.insert(
            "display_name".to_string(),
            json!(settings.display_name.as_str()),
        );
        object.insert(
            "support_profile".to_string(),
            json!(support_profile.effective_profile.as_str()),
        );
        object.insert(
            "configured_support_profile".to_string(),
            json!(support_profile.configured_profile.as_str()),
        );
        object.insert(
            "workspace_scope_id".to_string(),
            json!(settings.workspace_scope_id.as_str()),
        );
        object.insert(
            "pairing_fingerprint".to_string(),
            json!(settings.pairing_fingerprint()),
        );
        object.insert(
            "support_profile_reason_codes".to_string(),
            json!(support_profile.reason_codes),
        );
        object.insert(
            "interactive_desktop_available".to_string(),
            json!(support_profile.interactive_desktop_available),
        );
        object.insert(
            "tray_runtime_available".to_string(),
            json!(support_profile.tray_runtime_available),
        );
        object.insert(
            "host_fingerprint".to_string(),
            json!(settings.host_fingerprint.as_str()),
        );
        object.insert(
            "install_fingerprint".to_string(),
            json!(settings.install_fingerprint.as_str()),
        );
        object.insert(
            "startup_mode".to_string(),
            json!(lifecycle.startup_mode.as_str()),
        );
        object.insert(
            "window_mode".to_string(),
            json!(lifecycle.window_mode.as_str()),
        );
        object.insert(
            "tray_state".to_string(),
            json!(lifecycle.tray_state.as_str()),
        );
    }
    payload
}

fn build_runtime_session_id(settings: &YeonjangSettings) -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    format!("ys-{}-{}", settings.instance_id, millis)
}

fn normalize_call_name(value: &str) -> String {
    let mut normalized = String::new();
    let mut previous_separator = false;
    for ch in value.trim().chars() {
        if ch.is_alphanumeric() {
            for lowered in ch.to_lowercase() {
                normalized.push(lowered);
            }
            previous_separator = false;
        } else if matches!(ch, ' ' | '-' | '_') && !previous_separator {
            normalized.push('-');
            previous_separator = true;
        }
    }
    normalized.trim_matches('-').to_string()
}

#[derive(Debug, Serialize)]
struct ResponseChunkEnvelope {
    transport: &'static str,
    id: String,
    chunk_index: usize,
    chunk_count: usize,
    total_size_bytes: usize,
    payload_digest: String,
    encoding: &'static str,
    mime_type: &'static str,
    base64_data: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
enum CommandAttemptObservedStage {
    Received,
}

#[derive(Debug, Serialize)]
struct CommandAttemptStageEnvelope {
    transport: &'static str,
    id: Option<String>,
    schema_version: u8,
    method: String,
    command_id: String,
    stage: CommandAttemptObservedStage,
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity(bytes.len().div_ceil(3) * 4);
    let mut index = 0;
    while index < bytes.len() {
        let first = bytes[index];
        let second = bytes.get(index + 1).copied();
        let third = bytes.get(index + 2).copied();

        output.push(TABLE[(first >> 2) as usize] as char);
        output.push(
            TABLE[(((first & 0b0000_0011) << 4) | (second.unwrap_or(0) >> 4)) as usize] as char,
        );

        match second {
            Some(second) => {
                output.push(
                    TABLE[(((second & 0b0000_1111) << 2) | (third.unwrap_or(0) >> 6)) as usize]
                        as char,
                );
            }
            None => output.push('='),
        }

        match third {
            Some(third) => output.push(TABLE[(third & 0b0011_1111) as usize] as char),
            None => output.push('='),
        }

        index += 3;
    }
    output
}

#[cfg(test)]
mod request_delivery_tests {
    use super::validate_command_metadata;
    use crate::protocol::{Request, RequestMetadata};
    use serde_json::json;

    fn request_with_metadata(metadata: RequestMetadata) -> Request {
        Request {
            id: Some("delivery-1".to_string()),
            method: "screen.capture".to_string(),
            params: json!({}),
            metadata,
        }
    }

    #[test]
    fn rejects_stale_target_session_before_execution() {
        let request = request_with_metadata(RequestMetadata {
            target_session_id: Some("sess-old".to_string()),
            ..Default::default()
        });
        let response = validate_command_metadata(&request, "sess-current")
            .expect("stale target must be rejected");
        assert!(!response.ok);
        assert_eq!(
            response.error.as_ref().map(|item| item.code.as_str()),
            Some("session_replaced")
        );
    }

    #[test]
    fn rejects_expired_command_before_execution() {
        let request = request_with_metadata(RequestMetadata {
            command_id: Some("command-1".to_string()),
            operation_id: Some("operation-1".to_string()),
            target_fingerprint: Some(
                "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                    .to_string(),
            ),
            expires_at: Some(1),
            ..Default::default()
        });
        let response = validate_command_metadata(&request, "sess-current")
            .expect("expired command must be rejected");
        assert!(!response.ok);
        assert_eq!(
            response.error.as_ref().map(|item| item.code.as_str()),
            Some("expired_command")
        );
        let attempt = response.attempt.expect("rejection attempt evidence");
        assert_eq!(attempt.command_id, "command-1");
        assert!(matches!(
            attempt.terminal_stage,
            crate::protocol::CommandAttemptTerminalStage::Rejected
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lifecycle::{
        StartupMode, TrayState, WindowModeState, managed_runtime_state, new_shared_lifecycle_state,
    };
    use crate::managed_request::ManagedRequestService;
    use crate::request_dispatcher::{DispatchConfig, DispatchError};
    use crate::runtime::{RuntimeConfig, RuntimeSupervisor};

    fn sample_settings() -> YeonjangSettings {
        YeonjangSettings {
            display_name: "Yeonjang Test".to_string(),
            ..Default::default()
        }
    }

    #[test]
    fn plaintext_connection_policy_rejects_non_loopback_hosts_before_connect() {
        for host in ["127.0.0.1", "127.0.0.8", "::1", "[::1]", "localhost"] {
            let mut settings = sample_settings();
            settings.connection.host = host.to_string();
            settings.connection.username = "runtime-user".to_string();
            settings.connection.password = "runtime-secret".to_string();
            assert!(
                validate_connection_settings(&settings, &MqttTransportSecurity::LoopbackPlaintext)
                    .is_ok(),
                "{host}"
            );
        }

        for host in ["192.168.1.20", "8.8.8.8", "broker.example.com"] {
            let mut settings = sample_settings();
            settings.connection.host = host.to_string();
            settings.connection.username = "runtime-user".to_string();
            settings.connection.password = "runtime-secret".to_string();
            assert_eq!(
                validate_connection_settings(&settings, &MqttTransportSecurity::LoopbackPlaintext,)
                    .expect_err("plaintext remote broker")
                    .to_string(),
                "non-loopback MQTT requires an explicit TLS identity"
            );
        }
    }

    #[test]
    fn managed_connection_fails_closed_without_a_runtime_password() {
        let mut settings = sample_settings();
        settings.connection.username = "runtime-user".to_string();
        settings.connection.password.clear();

        let error =
            validate_connection_settings(&settings, &MqttTransportSecurity::LoopbackPlaintext)
                .expect_err("managed connection must require runtime secret input");

        assert_eq!(error.to_string(), "broker password is required");
    }

    #[test]
    fn mqtt_client_identity_is_bounded_by_instance_and_runtime_session_not_node_alias() {
        let mut first = sample_settings();
        first.instance_id = "instance-a".to_string();
        first.node_id = "node-before-rename".to_string();
        let mut renamed = first.clone();
        renamed.node_id = "node-after-rename".to_string();

        let original = build_mqtt_client_id(&first, "session-a").expect("client identity");
        let after_rename =
            build_mqtt_client_id(&renamed, "session-a").expect("renamed client identity");
        let next_session =
            build_mqtt_client_id(&first, "session-b").expect("next session identity");
        renamed.instance_id = "instance-b".to_string();
        let other_instance =
            build_mqtt_client_id(&renamed, "session-a").expect("other instance identity");

        assert_eq!(original, after_rename);
        assert_ne!(original, next_session);
        assert_ne!(original, other_instance);
        assert!(original.len() <= 64);
        assert!(
            original
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
        );
    }

    #[tokio::test]
    async fn managed_mqtt_async_stop_closes_dispatcher_admission() {
        let backend: Arc<dyn AutomationBackend> = Arc::new(crate::platform::CurrentBackend);
        let supervisor = RuntimeSupervisor::new(
            RuntimeConfig { max_in_flight: 1 },
            YeonjangSettings::default(),
            backend,
        )
        .expect("runtime");
        let dispatcher = TokioRequestDispatcher::new(
            DispatchConfig { max_pending: 1 },
            tokio::runtime::Handle::current(),
            ManagedRequestService::new(supervisor),
        )
        .expect("dispatcher");
        let dispatcher_clone = dispatcher.clone();
        let handle = MqttRuntimeHandle {
            client: Arc::new(Mutex::new(None)),
            stop_requested: Arc::new(AtomicBool::new(false)),
            settings: YeonjangSettings::default(),
            session_id: "test-session".to_string(),
            lifecycle_state: new_shared_lifecycle_state(managed_runtime_state()),
            capability_snapshot: crate::platform::CurrentBackend.capabilities(),
            task: None,
            dispatcher,
        };

        handle.stop_async().await.expect("managed async stop");

        assert!(matches!(
            dispatcher_clone.try_dispatch(Request {
                id: Some("after-stop".to_string()),
                method: "system.info".to_string(),
                params: json!({}),
                metadata: Default::default(),
            }),
            Err(DispatchError::ShuttingDown)
        ));
    }

    #[test]
    fn status_payload_reflects_lifecycle_registration_state() {
        let settings = sample_settings();
        let lifecycle = LifecycleRegistrationState {
            startup_mode: StartupMode::Autostart,
            window_mode: WindowModeState::Hidden,
            tray_state: TrayState::Visible,
        };
        let runtime_profile = runtime_support_profile(&settings, Some(&lifecycle));

        let capabilities = crate::platform::CurrentBackend.capabilities();
        let payload = status_payload(
            &settings,
            "session-1",
            "online",
            "ready",
            &lifecycle,
            &capabilities,
        );

        assert_eq!(payload.session_id, "session-1");
        assert_eq!(payload.startup_mode, "autostart");
        assert_eq!(payload.window_mode, "hidden");
        assert_eq!(payload.tray_state, "visible");
        assert_eq!(
            payload.support_profile,
            runtime_profile.effective_profile.as_str()
        );
        assert_eq!(
            payload.configured_support_profile,
            runtime_profile.configured_profile.as_str()
        );
        assert_eq!(
            payload.interactive_desktop_available,
            runtime_profile.interactive_desktop_available
        );
    }

    #[test]
    fn runtime_capabilities_payload_includes_lifecycle_fields() {
        let settings = sample_settings();
        let lifecycle = LifecycleRegistrationState {
            startup_mode: StartupMode::Managed,
            window_mode: WindowModeState::Visible,
            tray_state: TrayState::Unsupported,
        };

        let capabilities = crate::platform::CurrentBackend.capabilities();
        let payload =
            runtime_capabilities_payload(&settings, "session-2", &lifecycle, &capabilities);
        let object = payload.as_object().expect("capability payload object");

        assert_eq!(
            object.get("startup_mode").and_then(|value| value.as_str()),
            Some("managed"),
        );
        assert_eq!(
            object.get("window_mode").and_then(|value| value.as_str()),
            Some("visible"),
        );
        assert_eq!(
            object.get("tray_state").and_then(|value| value.as_str()),
            Some("unsupported"),
        );
        assert_eq!(
            object.get("instance_id").and_then(|value| value.as_str()),
            Some(settings.instance_id.as_str()),
        );
        assert_eq!(
            object
                .get("configured_support_profile")
                .and_then(|value| value.as_str()),
            Some("desktop_interactive"),
        );
        assert!(object.get("support_profile_reason_codes").is_some());
    }

    #[test]
    fn idle_runtime_heartbeat_is_due_before_registry_stale_window() {
        let base = Instant::now();

        assert!(!heartbeat_due(
            base,
            base + MQTT_HEARTBEAT_INTERVAL.saturating_sub(Duration::from_millis(1)),
        ));
        assert!(heartbeat_due(base, base + MQTT_HEARTBEAT_INTERVAL));
        assert!(MQTT_HEARTBEAT_INTERVAL < Duration::from_secs(90));
    }

    #[test]
    fn managed_backpressure_response_preserves_request_correlation() {
        let request = Request {
            id: Some("delivery-backpressure".to_string()),
            method: "system.info".to_string(),
            params: json!({}),
            metadata: Default::default(),
        };

        let response = runtime_backpressure_response(&request);

        assert_eq!(response.id.as_deref(), Some("delivery-backpressure"));
        assert!(!response.ok);
        assert_eq!(
            response.error.as_ref().map(|error| error.code.as_str()),
            Some("runtime_backpressure")
        );
    }

    #[test]
    fn managed_ingress_requires_the_strict_versioned_request_envelope() {
        let valid = serde_json::to_vec(&json!({
            "protocolVersion": 1,
            "id": "managed-valid",
            "method": "system.info",
            "params": {},
            "metadata": {}
        }))
        .expect("payload");
        let parsed = parse_managed_payload(&valid).expect("canonical payload");
        assert_eq!(parsed.id.as_deref(), Some("managed-valid"));

        let legacy = serde_json::to_vec(&json!({
            "id": "managed-legacy",
            "method": "system.info",
            "params": {}
        }))
        .expect("payload");
        assert_eq!(
            parse_managed_payload(&legacy)
                .expect_err("missing version")
                .error
                .as_ref()
                .map(|error| error.code.as_str()),
            Some("invalid_request")
        );

        let unknown_field = serde_json::to_vec(&json!({
            "protocolVersion": 1,
            "id": "managed-unknown",
            "method": "system.info",
            "params": {},
            "metadata": {},
            "unexpected": true
        }))
        .expect("payload");
        assert_eq!(
            parse_managed_payload(&unknown_field)
                .expect_err("unknown field")
                .error
                .as_ref()
                .map(|error| error.code.as_str()),
            Some("invalid_request")
        );
    }

    #[test]
    fn response_chunks_bind_id_shape_size_and_payload_digest() {
        let payload = vec![b'x'; RESPONSE_CHUNK_BYTES + 3];
        let chunks = build_response_chunks("chunk-request", &payload);
        let expected_digest = format!("sha256:{:x}", Sha256::digest(&payload));

        assert_eq!(chunks.len(), 2);
        for (index, chunk) in chunks.iter().enumerate() {
            assert_eq!(chunk.transport, "chunk");
            assert_eq!(chunk.id, "chunk-request");
            assert_eq!(chunk.chunk_index, index);
            assert_eq!(chunk.chunk_count, 2);
            assert_eq!(chunk.total_size_bytes, payload.len());
            assert_eq!(chunk.payload_digest, expected_digest);
            assert_eq!(chunk.encoding, "base64");
            assert_eq!(chunk.mime_type, "application/json");
            let start = index * RESPONSE_CHUNK_BYTES;
            let end = payload.len().min(start + RESPONSE_CHUNK_BYTES);
            assert_eq!(chunk.base64_data, base64_encode(&payload[start..end]));
        }
    }

    #[test]
    fn runtime_event_projection_is_bounded_and_never_blocks_the_connection_task() {
        let (event_tx, event_rx) = mpsc::sync_channel(1);

        assert!(emit_runtime_event(&event_tx, RuntimeEvent::Connected));
        assert!(!emit_runtime_event(
            &event_tx,
            RuntimeEvent::RequestHandled {
                method: "node.ping".to_string(),
                ok: true,
            },
        ));
        assert!(matches!(event_rx.try_recv(), Ok(RuntimeEvent::Connected)));
    }

    #[test]
    fn connection_failures_use_typed_closed_projection() {
        assert!(matches!(
            project_connection_error(&rumqttc::ConnectionError::ConnectionRefused(
                rumqttc::ConnectReturnCode::BadUserNamePassword,
            )),
            RuntimeEvent::AuthFailed(message)
                if message == "MQTT broker rejected the configured credentials."
        ));
        assert!(matches!(
            project_connection_error(&rumqttc::ConnectionError::ConnectionRefused(
                rumqttc::ConnectReturnCode::NotAuthorized,
            )),
            RuntimeEvent::AuthFailed(message)
                if message == "MQTT broker rejected the configured credentials."
        ));
        assert!(matches!(
            project_connection_error(&rumqttc::ConnectionError::Io(std::io::Error::other(
                "token=must-not-leak /Users/private"
            ))),
            RuntimeEvent::Disconnected(message) if message == "MQTT connection failed."
        ));
        assert!(matches!(
            project_runtime_configuration_error(&anyhow::anyhow!(
                "password=runtime-secret-marker /Users/private"
            )),
            RuntimeEvent::Disconnected(message)
                if message == "MQTT runtime configuration is invalid."
                    && !message.contains("runtime-secret-marker")
        ));
    }

    #[test]
    fn product_log_method_uses_only_the_canonical_descriptor_inventory() {
        assert_eq!(product_log_method("system.exec"), "system.exec");
        assert_eq!(
            product_log_method("password=secret-marker\nforged-log"),
            "unknown_method"
        );
    }
}
