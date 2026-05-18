use std::collections::HashMap;
use std::net::{TcpStream, ToSocketAddrs};
use std::sync::mpsc::{self, Receiver};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result, anyhow};
use rumqttc::{Client, Event, Incoming, LastWill, MqttOptions, Outgoing, QoS};
use serde::Serialize;
use serde_json::json;

use crate::automation::AutomationBackend;
use crate::lifecycle::{
    LifecycleRegistrationState, SharedLifecycleState, read_shared_lifecycle_state,
    runtime_support_profile,
};
use crate::node::{build_target, capabilities_payload, git_commit, git_tag, spawn_request_task};
use crate::platform::current_backend;
use crate::protocol::{Request, Response};
use crate::settings::{YeonjangSettings, load_settings};

const RESPONSE_CHUNK_BYTES: usize = 48 * 1024;
const MQTT_MAX_PACKET_BYTES: usize = 8 * 1024 * 1024;
const MQTT_REQUEST_CHANNEL_CAPACITY: usize = 256;
const MQTT_RECONNECT_DELAY: Duration = Duration::from_secs(5);
const PROCESSED_REQUEST_TTL_MS: i64 = 5 * 60 * 1000;
const MAX_PROCESSED_REQUESTS: usize = 512;

#[derive(Debug, Clone)]
pub enum RuntimeEvent {
    Connected,
    Reconnecting(String),
    Disconnected(String),
    AuthFailed(String),
    ResponsePublishFailed { method: String, message: String },
    RequestHandled { method: String, ok: bool },
}

#[derive(Debug, Clone)]
struct CachedResponseEntry {
    response: Response,
    stored_at_ms: i64,
}

type SharedProcessedRequests = Arc<Mutex<HashMap<String, CachedResponseEntry>>>;

pub struct MqttRuntimeHandle {
    client: Arc<Mutex<Option<Client>>>,
    stop_requested: Arc<AtomicBool>,
    settings: YeonjangSettings,
    session_id: String,
    lifecycle_state: SharedLifecycleState,
    thread: Option<JoinHandle<()>>,
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
        )
    }

    pub fn stop(mut self) -> Result<()> {
        self.stop_requested.store(true, Ordering::SeqCst);
        if let Some(client) = self.client.lock().ok().and_then(|guard| guard.clone()) {
            let _ = client.disconnect();
        }
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
        Ok(())
    }
}

pub fn start_runtime(
    settings: YeonjangSettings,
    lifecycle_state: SharedLifecycleState,
) -> Result<(MqttRuntimeHandle, Receiver<RuntimeEvent>)> {
    validate_connection_settings(&settings)?;

    let normalized = normalize_settings(settings);
    let runtime_session_id = build_runtime_session_id(&normalized);
    let (event_tx, event_rx) = mpsc::channel::<RuntimeEvent>();
    let active_client = Arc::new(Mutex::new(None));
    let stop_requested = Arc::new(AtomicBool::new(false));
    let control_client = Arc::clone(&active_client);
    let control_stop = Arc::clone(&stop_requested);
    let thread_settings = normalized.clone();
    let thread_session_id = runtime_session_id.clone();
    let thread_lifecycle_state = Arc::clone(&lifecycle_state);
    let processed_requests: SharedProcessedRequests = Arc::new(Mutex::new(HashMap::new()));
    let thread_processed_requests = Arc::clone(&processed_requests);

    let thread = thread::spawn(move || {
        while !stop_requested.load(Ordering::SeqCst) {
            let options = match build_runtime_options(
                &thread_settings,
                &thread_session_id,
                &read_shared_lifecycle_state(&thread_lifecycle_state),
            ) {
                Ok(options) => options,
                Err(error) => {
                    let _ = event_tx.send(RuntimeEvent::Disconnected(error.to_string()));
                    break;
                }
            };

            let (client, mut connection) = Client::new(options, 20);
            if let Ok(mut slot) = active_client.lock() {
                *slot = Some(client.clone());
            }

            if let Err(error) = publish_bootstrap(
                &client,
                &thread_settings,
                &thread_session_id,
                &thread_lifecycle_state,
            ) {
                match classify_error(&error) {
                    RuntimeEvent::AuthFailed(message) => {
                        let _ = event_tx.send(RuntimeEvent::AuthFailed(message));
                        break;
                    }
                    RuntimeEvent::Disconnected(message) | RuntimeEvent::Reconnecting(message) => {
                        let _ = event_tx.send(RuntimeEvent::Reconnecting(format!(
                            "{message}. Retrying in {} seconds.",
                            MQTT_RECONNECT_DELAY.as_secs()
                        )));
                        if !sleep_with_stop_check(MQTT_RECONNECT_DELAY, &stop_requested) {
                            break;
                        }
                        continue;
                    }
                    other => {
                        let _ = event_tx.send(other);
                        break;
                    }
                }
            }

            let should_retry = run_connection_loop(
                &client,
                &mut connection,
                &thread_settings,
                &thread_session_id,
                &event_tx,
                &stop_requested,
                &thread_lifecycle_state,
                &thread_processed_requests,
            );

            if let Ok(mut slot) = active_client.lock() {
                *slot = None;
            }

            if !should_retry {
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
            thread: Some(thread),
        },
        event_rx,
    ))
}

pub fn probe_connection(settings: &YeonjangSettings) -> Result<()> {
    validate_connection_settings(settings)?;
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
) -> Result<MqttOptions> {
    let mut options = build_options(settings)?;
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
        ))?,
        QoS::AtLeastOnce,
        true,
    ));
    Ok(options)
}

fn sleep_with_stop_check(duration: Duration, stop_requested: &AtomicBool) -> bool {
    let step = Duration::from_millis(100);
    let mut elapsed = Duration::ZERO;
    while elapsed < duration {
        if stop_requested.load(Ordering::SeqCst) {
            return false;
        }
        let sleep_for = duration.saturating_sub(elapsed).min(step);
        thread::sleep(sleep_for);
        elapsed += sleep_for;
    }
    true
}

fn run_connection_loop(
    client: &Client,
    connection: &mut rumqttc::Connection,
    settings: &YeonjangSettings,
    session_id: &str,
    event_tx: &mpsc::Sender<RuntimeEvent>,
    stop_requested: &AtomicBool,
    lifecycle_state: &SharedLifecycleState,
    processed_requests: &SharedProcessedRequests,
) -> bool {
    let mut announced_connected = false;

    for notification in connection.iter() {
        if stop_requested.load(Ordering::SeqCst) {
            let _ = event_tx.send(RuntimeEvent::Disconnected(
                "requested disconnect".to_string(),
            ));
            return false;
        }

        match notification {
            Ok(Event::Incoming(Incoming::ConnAck(_))) => {
                announced_connected = true;
                let _ = event_tx.send(RuntimeEvent::Connected);
            }
            Ok(Event::Incoming(Incoming::Publish(publish))) => {
                if publish.topic != settings.mqtt.request_topic {
                    continue;
                }

                let payload = publish.payload.to_vec();
                let response_client = client.clone();
                let response_settings = settings.clone();
                let response_events = event_tx.clone();
                let response_session_id = session_id.to_string();
                let response_lifecycle_state = Arc::clone(lifecycle_state);
                let response_processed_requests = Arc::clone(processed_requests);

                thread::spawn(move || {
                    let _ = publish_runtime_state(
                        &response_client,
                        &response_settings,
                        response_session_id.as_str(),
                        "refreshing-capabilities",
                        true,
                        &response_lifecycle_state,
                    );

                    let (method, response) = match serde_json::from_slice::<Request>(&payload) {
                        Ok(request) => {
                            let method = request.method.clone();
                            let response = if let Some(error_response) =
                                validate_command_metadata(&request, response_session_id.as_str())
                            {
                                error_response
                            } else if let Some(cached) =
                                replay_cached_response(&response_processed_requests, &request)
                            {
                                cached
                            } else {
                                let response = spawn_request_task(request.clone())
                                    .join()
                                    .unwrap_or_else(|_| {
                                        Response::error(
                                            None,
                                            "request_failed",
                                            "request thread panicked",
                                        )
                                    });
                                remember_processed_response(
                                    &response_processed_requests,
                                    &request,
                                    &response,
                                );
                                response
                            };
                            (method, response)
                        }
                        Err(error) => (
                            "invalid_request".to_string(),
                            Response::error(
                                None,
                                "invalid_request",
                                format!("failed to parse request payload: {error}"),
                            ),
                        ),
                    };

                    if let Err(error) =
                        publish_response(&response_client, &response_settings, &response)
                    {
                        let _ = response_events.send(RuntimeEvent::ResponsePublishFailed {
                            method,
                            message: error.to_string(),
                        });
                        return;
                    }

                    let _ = publish_runtime_state(
                        &response_client,
                        &response_settings,
                        response_session_id.as_str(),
                        "ready",
                        true,
                        &response_lifecycle_state,
                    );

                    let _ = response_events.send(RuntimeEvent::RequestHandled {
                        method,
                        ok: response.ok,
                    });
                });
            }
            Ok(Event::Outgoing(Outgoing::Disconnect)) => {
                let _ = event_tx.send(RuntimeEvent::Disconnected(
                    "requested disconnect".to_string(),
                ));
                return false;
            }
            Ok(_) => {}
            Err(error) => {
                if announced_connected {
                    let _ = publish_status(
                        client,
                        settings,
                        session_id,
                        "offline",
                        "disconnected",
                        true,
                        &read_shared_lifecycle_state(lifecycle_state),
                    );
                }

                match classify_error(&anyhow!(error.to_string())) {
                    RuntimeEvent::AuthFailed(message) => {
                        let _ = event_tx.send(RuntimeEvent::AuthFailed(message));
                        return false;
                    }
                    RuntimeEvent::Disconnected(message) | RuntimeEvent::Reconnecting(message) => {
                        let _ = event_tx.send(RuntimeEvent::Reconnecting(format!(
                            "{message}. Retrying in {} seconds.",
                            MQTT_RECONNECT_DELAY.as_secs()
                        )));
                        return sleep_with_stop_check(MQTT_RECONNECT_DELAY, stop_requested);
                    }
                    other => {
                        let _ = event_tx.send(other);
                        return false;
                    }
                }
            }
        }
    }

    if announced_connected {
        let _ = publish_status(
            client,
            settings,
            session_id,
            "offline",
            "disconnected",
            true,
            &read_shared_lifecycle_state(lifecycle_state),
        );
    }

    if stop_requested.load(Ordering::SeqCst) {
        let _ = event_tx.send(RuntimeEvent::Disconnected(
            "requested disconnect".to_string(),
        ));
        return false;
    }

    let _ = event_tx.send(RuntimeEvent::Reconnecting(format!(
        "MQTT connection ended. Retrying in {} seconds.",
        MQTT_RECONNECT_DELAY.as_secs()
    )));
    sleep_with_stop_check(MQTT_RECONNECT_DELAY, stop_requested)
}

fn now_unix_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

fn validate_command_metadata(request: &Request, runtime_session_id: &str) -> Option<Response> {
    if let Some(target_session_id) = request.metadata.target_session_id.as_deref() {
        if !target_session_id.trim().is_empty() && target_session_id != runtime_session_id {
            return Some(Response::error(
                request.id.clone(),
                "session_replaced",
                format!(
                    "target session {} is no longer active; current session is {}",
                    target_session_id, runtime_session_id
                ),
            ));
        }
    }

    if let Some(expires_at) = request.metadata.expires_at {
        if expires_at <= now_unix_millis() {
            return Some(Response::error(
                request.id.clone(),
                "expired_command",
                "expired command rejected before execution",
            ));
        }
    }

    None
}

fn clone_response_with_request_id(response: &Response, request_id: Option<String>) -> Response {
    Response {
        id: request_id,
        ok: response.ok,
        result: response.result.clone(),
        error: response.error.clone(),
    }
}

fn prune_processed_requests(entries: &mut HashMap<String, CachedResponseEntry>, now_ms: i64) {
    entries.retain(|_, entry| now_ms - entry.stored_at_ms <= PROCESSED_REQUEST_TTL_MS);
    if entries.len() <= MAX_PROCESSED_REQUESTS {
        return;
    }
    let mut ordered = entries
        .iter()
        .map(|(key, entry)| (key.clone(), entry.stored_at_ms))
        .collect::<Vec<_>>();
    ordered.sort_by_key(|(_, stored_at_ms)| *stored_at_ms);
    let remove_count = ordered.len().saturating_sub(MAX_PROCESSED_REQUESTS);
    for (key, _) in ordered.into_iter().take(remove_count) {
        entries.remove(&key);
    }
}

fn replay_cached_response(
    processed_requests: &SharedProcessedRequests,
    request: &Request,
) -> Option<Response> {
    let idempotency_key = request.metadata.idempotency_key.as_deref()?.trim();
    if idempotency_key.is_empty() {
        return None;
    }
    let now_ms = now_unix_millis();
    let mut guard = processed_requests.lock().ok()?;
    prune_processed_requests(&mut guard, now_ms);
    let cached = guard.get(idempotency_key)?.clone();
    Some(clone_response_with_request_id(
        &cached.response,
        request.id.clone(),
    ))
}

fn remember_processed_response(
    processed_requests: &SharedProcessedRequests,
    request: &Request,
    response: &Response,
) {
    let Some(idempotency_key) = request
        .metadata
        .idempotency_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return;
    };
    if let Ok(mut guard) = processed_requests.lock() {
        let now_ms = now_unix_millis();
        prune_processed_requests(&mut guard, now_ms);
        guard.insert(
            idempotency_key.to_string(),
            CachedResponseEntry {
                response: clone_response_with_request_id(response, None),
                stored_at_ms: now_ms,
            },
        );
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

fn build_options(settings: &YeonjangSettings) -> Result<MqttOptions> {
    let host = settings.connection.host.trim();
    let client_id = format!("{}-mqtt", settings.node_id.trim());
    if host.is_empty() {
        anyhow::bail!("broker host is required")
    }
    Ok(MqttOptions::new(client_id, host, settings.connection.port))
}

fn validate_connection_settings(settings: &YeonjangSettings) -> Result<()> {
    if settings.connection.host.trim().is_empty() {
        anyhow::bail!("broker host is required")
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
    client: &Client,
    settings: &YeonjangSettings,
    session_id: &str,
    lifecycle_state: &SharedLifecycleState,
) -> Result<()> {
    client.subscribe(settings.mqtt.request_topic.clone(), QoS::AtLeastOnce)?;
    publish_runtime_state(client, settings, session_id, "ready", true, lifecycle_state)?;
    Ok(())
}

fn publish_response(
    client: &Client,
    settings: &YeonjangSettings,
    response: &Response,
) -> Result<()> {
    let payload = serde_json::to_vec(response)?;
    if payload.len() <= RESPONSE_CHUNK_BYTES || response.id.is_none() {
        client.publish(
            settings.mqtt.response_topic.clone(),
            QoS::AtLeastOnce,
            false,
            payload,
        )?;
        return Ok(());
    }

    let request_id = response.id.clone();
    let total_chunks = payload.len().div_ceil(RESPONSE_CHUNK_BYTES);
    let total_size_bytes = payload.len();

    for (chunk_index, chunk) in payload.chunks(RESPONSE_CHUNK_BYTES).enumerate() {
        let envelope = ResponseChunkEnvelope {
            transport: "chunk",
            id: request_id.clone(),
            chunk_index,
            chunk_count: total_chunks,
            total_size_bytes,
            encoding: "base64",
            mime_type: "application/json",
            base64_data: base64_encode(chunk),
        };
        client.publish(
            settings.mqtt.response_topic.clone(),
            QoS::AtLeastOnce,
            false,
            serde_json::to_vec(&envelope)?,
        )?;
    }

    Ok(())
}

fn publish_capabilities(
    client: &Client,
    settings: &YeonjangSettings,
    session_id: &str,
    lifecycle: &LifecycleRegistrationState,
) -> Result<()> {
    client.publish(
        settings.mqtt.capabilities_topic.clone(),
        QoS::AtLeastOnce,
        true,
        serde_json::to_vec(&runtime_capabilities_payload(
            settings, session_id, lifecycle,
        ))?,
    )?;
    Ok(())
}

fn publish_runtime_state(
    client: &Client,
    settings: &YeonjangSettings,
    session_id: &str,
    message: &str,
    retained: bool,
    lifecycle_state: &SharedLifecycleState,
) -> Result<()> {
    let runtime_settings = refresh_runtime_settings(settings);
    let lifecycle = read_shared_lifecycle_state(lifecycle_state);
    publish_capabilities(client, &runtime_settings, session_id, &lifecycle)?;
    publish_status(
        client,
        &runtime_settings,
        session_id,
        "online",
        message,
        retained,
        &lifecycle,
    )?;
    Ok(())
}

fn refresh_runtime_settings(fallback: &YeonjangSettings) -> YeonjangSettings {
    load_settings()
        .map(normalize_settings)
        .map(|mut refreshed| {
            // Keep publishing on the runtime's active topics even if the persisted
            // node id/topics changed while the current session is connected.
            refreshed.mqtt = fallback.mqtt.clone();
            refreshed
        })
        .unwrap_or_else(|_| fallback.clone())
}

fn publish_status(
    client: &Client,
    settings: &YeonjangSettings,
    session_id: &str,
    state: &str,
    message: &str,
    retained: bool,
    lifecycle: &LifecycleRegistrationState,
) -> Result<()> {
    client.publish(
        settings.mqtt.status_topic.clone(),
        QoS::AtLeastOnce,
        retained,
        serde_json::to_vec(&status_payload(
            settings, session_id, state, message, lifecycle,
        ))?,
    )?;
    Ok(())
}

fn classify_error(error: &anyhow::Error) -> RuntimeEvent {
    let message = error.to_string();
    let lower = message.to_lowercase();
    if lower.contains("not authorized")
        || lower.contains("bad username or password")
        || lower.contains("authentication")
        || lower.contains("auth")
    {
        RuntimeEvent::AuthFailed(message)
    } else {
        RuntimeEvent::Disconnected(message)
    }
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
        platform: current_backend().platform_kind(),
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
    }
}

fn runtime_capabilities_payload(
    settings: &YeonjangSettings,
    session_id: &str,
    lifecycle: &LifecycleRegistrationState,
) -> serde_json::Value {
    let support_profile = runtime_support_profile(settings, Some(lifecycle));
    let mut payload = capabilities_payload();
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
    id: Option<String>,
    chunk_index: usize,
    chunk_count: usize,
    total_size_bytes: usize,
    encoding: &'static str,
    mime_type: &'static str,
    base64_data: String,
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
    use super::{
        CachedResponseEntry, SharedProcessedRequests, remember_processed_response,
        replay_cached_response, validate_command_metadata,
    };
    use crate::protocol::{Request, RequestMetadata, Response};
    use serde_json::json;
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};

    fn processed_requests() -> SharedProcessedRequests {
        Arc::new(Mutex::new(HashMap::<String, CachedResponseEntry>::new()))
    }

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
    }

    #[test]
    fn replays_cached_response_without_reexecuting_side_effect() {
        let processed_requests = processed_requests();
        let request = request_with_metadata(RequestMetadata {
            idempotency_key: Some("idem-1".to_string()),
            ..Default::default()
        });
        let response = Response::ok(Some("delivery-1".to_string()), json!({ "ok": true }));
        remember_processed_response(&processed_requests, &request, &response);

        let replay_request = Request {
            id: Some("delivery-2".to_string()),
            method: "screen.capture".to_string(),
            params: json!({}),
            metadata: RequestMetadata {
                idempotency_key: Some("idem-1".to_string()),
                ..Default::default()
            },
        };

        let replayed = replay_cached_response(&processed_requests, &replay_request)
            .expect("duplicate idempotency must reuse cached response");
        assert!(replayed.ok);
        assert_eq!(replayed.id.as_deref(), Some("delivery-2"));
        assert_eq!(replayed.result, Some(json!({ "ok": true })));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lifecycle::{StartupMode, TrayState, WindowModeState};

    fn sample_settings() -> YeonjangSettings {
        let mut settings = YeonjangSettings::default();
        settings.display_name = "Yeonjang Test".to_string();
        settings
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

        let payload = status_payload(&settings, "session-1", "online", "ready", &lifecycle);

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

        let payload = runtime_capabilities_payload(&settings, "session-2", &lifecycle);
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
}
