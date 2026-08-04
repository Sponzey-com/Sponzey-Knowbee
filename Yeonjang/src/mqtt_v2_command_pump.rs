//! Bounded Tokio owner for the direct MQTT v2 command and control event loop.

use std::collections::{HashMap, VecDeque};
use std::error::Error as StdError;
use std::sync::Arc;
use std::time::Duration;

use rumqttc::{
    AsyncClient, ConnectReturnCode, ConnectionError, Event, EventLoop, Incoming, Outgoing, QoS,
    StateError,
};
use tokio::sync::watch;
use tokio::task::JoinSet;

use crate::artifact_transfer_use_case::ArtifactCancelResult;
use crate::artifact_transfer_use_case::{ArtifactPublishFailureResult, ArtifactPublishResult};
use crate::cancellation::ActiveCommandRegistry;
use crate::mqtt_v2_artifact_adapter::{
    ArtifactCleanupRequest, ArtifactPublicationCompletion, ArtifactPublicationCompletionResult,
    MqttV2ArtifactChunkPublish,
};
use crate::mqtt_v2_capabilities_adapter::{MqttV2CapabilitiesAdapter, MqttV2CapabilitiesPublish};
use crate::mqtt_v2_control_router::{MqttV2ControlRouter, MqttV2ControlRouterResult};
use crate::mqtt_v2_policy_admin_adapter::{
    MqttV2InboundPolicyAdmin, MqttV2PolicyAdminAdapter, MqttV2PolicyAdminAdapterResult,
};
use crate::mqtt_v2_response_adapter::{
    MqttV2InboundCommand, MqttV2ResponseAdapter, MqttV2ResponseAdapterResult, MqttV2ResponsePublish,
};
use crate::mqtt_v2_status_adapter::{MqttV2StatusAdapter, MqttV2StatusPublish};
use crate::protocol_v2_operation::V2OperationBindingContext;
use crate::protocol_v2_terminal::V2ResponseSigningContext;
use crate::stage_timing::{
    RuntimeStage, StageTimingRecorder, StageTimingSpan, artifact_stage_correlation,
    sha256_correlation,
};
use crate::v2_delivery_receipt::{
    V2DeliveryPublishResult, V2DeliveryReceiptStore, V2DeliveryRegisterResult,
};

const MAX_PUMP_IN_FLIGHT: usize = 64;
const DISCONNECT_DRAIN_TIMEOUT: Duration = Duration::from_secs(2);
const RECONNECT_BACKOFF: Duration = Duration::from_millis(100);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MqttV2PumpConfig {
    max_in_flight: usize,
}

impl MqttV2PumpConfig {
    pub fn new(max_in_flight: usize) -> Result<Self, MqttV2PumpConfigError> {
        // Preserve the published 2..=64 command budget contract. The pump owns
        // a separate bounded control-plane lane, so cancellation progress no
        // longer depends on consuming one of these normal command slots.
        if !(2..=MAX_PUMP_IN_FLIGHT).contains(&max_in_flight) {
            return Err(MqttV2PumpConfigError::InvalidMaxInFlight);
        }
        Ok(Self { max_in_flight })
    }

    pub(crate) fn max_in_flight(self) -> usize {
        self.max_in_flight
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MqttV2PumpConfigError {
    InvalidMaxInFlight,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MqttV2PumpContext {
    pub now_ms: i64,
    pub binding: V2OperationBindingContext,
    pub response_signing: V2ResponseSigningContext,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MqttV2PumpContextError {
    Unavailable,
}

pub trait MqttV2PumpContextProvider: Send + Sync {
    fn context(&self) -> Result<MqttV2PumpContext, MqttV2PumpContextError>;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MqttV2PumpOutcome {
    Stopped,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MqttV2PumpError {
    SubscribeFailed,
    ConnectionFailed(MqttV2ConnectionFailure),
    ContextUnavailable,
    WorkerFailed,
    ResponseBuildFailed,
    DeliveryStateFailed,
    ArtifactStateFailed,
    ArtifactCleanupFailed,
    StatusBuildFailed,
    CapabilitiesBuildFailed,
    PublishFailed,
    DisconnectFailed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MqttV2ConnectionFailure {
    StateIo,
    StateInvalid,
    StateUnsolicitedAck,
    StatePing,
    StateWrongPacket,
    StateCollisionTimeout,
    StateEmptySubscription,
    StateDeserialization,
    StateOutgoingPacketTooLarge,
    NetworkTimeout,
    FlushTimeout,
    Io,
    TlsIo,
    Refused,
    InvalidHandshake,
    RequestsDone,
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MqttV2ArtifactCleanupError {
    Unavailable,
}

pub trait MqttV2ArtifactCleanupSink: Send + Sync {
    fn request_cleanup(
        &self,
        request: ArtifactCleanupRequest,
    ) -> Result<(), MqttV2ArtifactCleanupError>;
}

/// Read-only runtime liveness projection emitted by the owning pump.
pub trait MqttV2PumpStatusSink: Send + Sync {
    fn connected(&self);
    fn reconnecting(&self);
    fn stopped(&self);
}

/// One canonical cancellation owner notified before the pump joins workers.
pub trait MqttV2PumpShutdownSink: Send + Sync {
    fn request_runtime_shutdown(&self);
}

impl MqttV2PumpShutdownSink for ActiveCommandRegistry {
    fn request_runtime_shutdown(&self) {
        ActiveCommandRegistry::request_runtime_shutdown(self);
    }
}

pub struct MqttV2CommandPump {
    client: AsyncClient,
    event_loop: EventLoop,
    command_adapter: Arc<MqttV2ResponseAdapter>,
    control_router: Arc<MqttV2ControlRouter>,
    policy_admin: Option<Arc<MqttV2PolicyAdminAdapter>>,
    delivery_receipts: Arc<dyn V2DeliveryReceiptStore>,
    artifact_cleanup: Option<Arc<dyn MqttV2ArtifactCleanupSink>>,
    status_sink: Option<Arc<dyn MqttV2PumpStatusSink>>,
    shutdown_sink: Option<Arc<dyn MqttV2PumpShutdownSink>>,
    status_projection: Option<Arc<MqttV2StatusAdapter>>,
    capabilities_projection: Option<Arc<MqttV2CapabilitiesAdapter>>,
    stage_timing: Option<StageTimingRecorder>,
    context_provider: Arc<dyn MqttV2PumpContextProvider>,
    shutdown: watch::Receiver<bool>,
    config: MqttV2PumpConfig,
}

/// Immutable composition snapshot shared by the pump's two protocol lanes.
pub struct MqttV2PumpDependencies {
    command_adapter: Arc<MqttV2ResponseAdapter>,
    control_router: Arc<MqttV2ControlRouter>,
    policy_admin: Option<Arc<MqttV2PolicyAdminAdapter>>,
    delivery_receipts: Arc<dyn V2DeliveryReceiptStore>,
    artifact_cleanup: Option<Arc<dyn MqttV2ArtifactCleanupSink>>,
    status_sink: Option<Arc<dyn MqttV2PumpStatusSink>>,
    shutdown_sink: Option<Arc<dyn MqttV2PumpShutdownSink>>,
    status_projection: Option<Arc<MqttV2StatusAdapter>>,
    capabilities_projection: Option<Arc<MqttV2CapabilitiesAdapter>>,
    stage_timing: Option<StageTimingRecorder>,
}

impl MqttV2PumpDependencies {
    pub fn new(
        command_adapter: Arc<MqttV2ResponseAdapter>,
        control_router: Arc<MqttV2ControlRouter>,
        delivery_receipts: Arc<dyn V2DeliveryReceiptStore>,
    ) -> Self {
        Self {
            command_adapter,
            control_router,
            policy_admin: None,
            delivery_receipts,
            artifact_cleanup: None,
            status_sink: None,
            shutdown_sink: None,
            status_projection: None,
            capabilities_projection: None,
            stage_timing: None,
        }
    }

    pub fn with_policy_admin(mut self, policy_admin: Arc<MqttV2PolicyAdminAdapter>) -> Self {
        self.policy_admin = Some(policy_admin);
        self
    }

    pub fn with_artifact_cleanup(
        mut self,
        artifact_cleanup: Arc<dyn MqttV2ArtifactCleanupSink>,
    ) -> Self {
        self.artifact_cleanup = Some(artifact_cleanup);
        self
    }

    pub fn with_status_sink(mut self, status_sink: Arc<dyn MqttV2PumpStatusSink>) -> Self {
        self.status_sink = Some(status_sink);
        self
    }

    pub fn with_shutdown_sink(mut self, shutdown_sink: Arc<dyn MqttV2PumpShutdownSink>) -> Self {
        self.shutdown_sink = Some(shutdown_sink);
        self
    }

    pub fn with_status_projection(mut self, status_projection: Arc<MqttV2StatusAdapter>) -> Self {
        self.status_projection = Some(status_projection);
        self
    }

    pub fn with_capabilities_projection(
        mut self,
        capabilities_projection: Arc<MqttV2CapabilitiesAdapter>,
    ) -> Self {
        self.capabilities_projection = Some(capabilities_projection);
        self
    }

    pub fn with_stage_timing(mut self, recorder: StageTimingRecorder) -> Self {
        self.stage_timing = Some(recorder);
        self
    }
}

impl MqttV2CommandPump {
    pub fn new(
        client: AsyncClient,
        event_loop: EventLoop,
        dependencies: MqttV2PumpDependencies,
        context_provider: Arc<dyn MqttV2PumpContextProvider>,
        shutdown: watch::Receiver<bool>,
        config: MqttV2PumpConfig,
    ) -> Self {
        Self {
            client,
            event_loop,
            command_adapter: dependencies.command_adapter,
            control_router: dependencies.control_router,
            policy_admin: dependencies.policy_admin,
            delivery_receipts: dependencies.delivery_receipts,
            artifact_cleanup: dependencies.artifact_cleanup,
            status_sink: dependencies.status_sink,
            shutdown_sink: dependencies.shutdown_sink,
            status_projection: dependencies.status_projection,
            capabilities_projection: dependencies.capabilities_projection,
            stage_timing: dependencies.stage_timing,
            context_provider,
            shutdown,
            config,
        }
    }

    pub async fn run(mut self) -> Result<MqttV2PumpOutcome, MqttV2PumpError> {
        let _status_guard = PumpStatusGuard(self.status_sink.clone());
        let command_topic = self.command_adapter.command_topic();
        let control_topic = self.control_router.control_topic().to_string();
        let admin_topic = self
            .policy_admin
            .as_ref()
            .map(|adapter| adapter.admin_topic());
        let artifact_ack_filter = self.control_router.artifact_ack_filter();
        let mut subscription_topics = vec![command_topic.clone(), control_topic.clone()];
        if let Some(topic) = &admin_topic {
            subscription_topics.push(topic.clone());
        }
        if let Some(topic) = &artifact_ack_filter {
            subscription_topics.push(topic.clone());
        }
        enqueue_subscriptions(
            &self.client,
            &mut self.event_loop,
            subscription_topics.clone(),
        )
        .await?;
        let mut jobs = JoinSet::new();
        let mut pending_commands = VecDeque::new();
        // Declared after JoinSet so early-return drop requests cancellation
        // before blocking workers lose their supervisor handle.
        let shutdown_guard = PumpShutdownGuard(self.shutdown_sink.clone());
        let mut pending_outgoing = VecDeque::new();
        let mut awaiting_puback = HashMap::new();
        let mut artifact_ack_timings = HashMap::new();
        let mut response_outbox = VecDeque::new();
        let mut artifact_batches = VecDeque::new();
        let mut projection_outbox = VecDeque::new();
        let mut capabilities_refresh_requested = false;
        let heartbeat_period = self
            .status_projection
            .as_ref()
            .map_or(Duration::from_secs(30), |status| status.refresh_interval());
        let mut heartbeat = tokio::time::interval_at(
            tokio::time::Instant::now() + heartbeat_period,
            heartbeat_period,
        );
        let mut connected = false;
        let mut connection_generation = 0_u64;
        loop {
            if *self.shutdown.borrow() {
                fail_artifact_batches(&self.control_router, &mut artifact_batches)?;
                break;
            }
            if std::mem::take(&mut capabilities_refresh_requested)
                && let Some(capabilities) = &self.capabilities_projection
            {
                let now_ms = self
                    .context_provider
                    .context()
                    .map_err(|_| MqttV2PumpError::ContextUnavailable)?
                    .now_ms;
                let publish = capabilities
                    .publish(now_ms)
                    .map_err(|_| MqttV2PumpError::CapabilitiesBuildFailed)?;
                enqueue_capabilities_publish(publish, &mut projection_outbox);
            }
            progress_projection_outbox(&self.client, &mut projection_outbox, &mut pending_outgoing);
            progress_response_outbox(
                &self.client,
                &mut response_outbox,
                &mut pending_outgoing,
                self.stage_timing.as_ref(),
            );
            progress_artifact_batch(
                &self.client,
                &self.control_router,
                &mut artifact_batches,
                &mut pending_outgoing,
                self.stage_timing.as_ref(),
                &mut artifact_ack_timings,
            )?;
            while jobs.len() < self.config.max_in_flight
                && let Some(command) = pending_commands.pop_front()
            {
                spawn_command_job(&mut jobs, Arc::clone(&self.command_adapter), command);
            }
            // Keep one bounded control-plane lane available after all normal
            // command workers are occupied. Without it, an exact cancellation
            // waits behind the effect it is required to stop.
            if jobs.len() > self.config.max_in_flight
                || pending_commands.len() >= MAX_PUMP_IN_FLIGHT
            {
                tokio::select! {
                    changed = self.shutdown.changed() => {
                        if changed.is_err() || *self.shutdown.borrow() {
                            break;
                        }
                    }
                    completed = jobs.join_next() => {
                        let action =
                            handle_completion(
                                self.delivery_receipts.as_ref(),
                                completed,
                                self.stage_timing.as_ref(),
                                &mut artifact_ack_timings,
                            )?;
                        apply_completion_action(
                            action,
                            &mut response_outbox,
                            &mut artifact_batches,
                            self.artifact_cleanup.as_deref(),
                            &mut capabilities_refresh_requested,
                        )?;
                    }
                }
                continue;
            }
            tokio::select! {
                changed = self.shutdown.changed() => {
                    if changed.is_err() || *self.shutdown.borrow() {
                        break;
                    }
                }
                completed = jobs.join_next(), if !jobs.is_empty() => {
                    let action =
                        handle_completion(
                            self.delivery_receipts.as_ref(),
                            completed,
                            self.stage_timing.as_ref(),
                            &mut artifact_ack_timings,
                        )?;
                    apply_completion_action(
                        action,
                        &mut response_outbox,
                        &mut artifact_batches,
                        self.artifact_cleanup.as_deref(),
                        &mut capabilities_refresh_requested,
                    )?;
                }
                _ = heartbeat.tick(), if connected && self.status_projection.is_some() => {
                    let now_ms = self.context_provider.context()
                        .map_err(|_| MqttV2PumpError::ContextUnavailable)?
                        .now_ms;
                    let publish = self.status_projection
                        .as_ref()
                        .expect("heartbeat guard requires status projection")
                        .online(now_ms)
                        .map_err(|_| MqttV2PumpError::StatusBuildFailed)?;
                    enqueue_status_publish(publish, &mut projection_outbox);
                    if let Some(capabilities) = &self.capabilities_projection {
                        let publish = capabilities.publish(now_ms)
                            .map_err(|_| MqttV2PumpError::CapabilitiesBuildFailed)?;
                        enqueue_capabilities_publish(publish, &mut projection_outbox);
                    }
                }
                event = self.event_loop.poll() => {
                    let event = match event {
                        Ok(event) => event,
                        Err(error) if is_recoverable_connection_error(&error) => {
                            connected = false;
                            if let Some(status) = &self.status_sink {
                                status.reconnecting();
                            }
                            if wait_for_reconnect_or_shutdown(&mut self.shutdown).await {
                                break;
                            }
                            continue;
                        }
                        Err(error) => return Err(map_connection_error(error)),
                    };
                    if matches!(event, Event::Incoming(Incoming::ConnAck(_))) {
                        if connection_generation > 0 {
                            enqueue_subscriptions(
                                &self.client,
                                &mut self.event_loop,
                                subscription_topics.clone(),
                            ).await?;
                        }
                        if let Some(status_projection) = &self.status_projection {
                            let now_ms = self.context_provider.context()
                                .map_err(|_| MqttV2PumpError::ContextUnavailable)?
                                .now_ms;
                            let publish = status_projection.online(now_ms)
                                .map_err(|_| MqttV2PumpError::StatusBuildFailed)?;
                            enqueue_status_publish(publish, &mut projection_outbox);
                        }
                        if let Some(capabilities) = &self.capabilities_projection {
                            let now_ms = self.context_provider.context()
                                .map_err(|_| MqttV2PumpError::ContextUnavailable)?
                                .now_ms;
                            let publish = capabilities.publish(now_ms)
                                .map_err(|_| MqttV2PumpError::CapabilitiesBuildFailed)?;
                            enqueue_capabilities_publish(publish, &mut projection_outbox);
                        }
                        connected = true;
                        connection_generation = connection_generation
                            .checked_add(1)
                            .ok_or(MqttV2PumpError::ConnectionFailed(
                                MqttV2ConnectionFailure::Other,
                            ))?;
                        if let Some(status) = &self.status_sink {
                            status.connected();
                        }
                    }
                    if let Event::Incoming(Incoming::Publish(publish)) = event {
                        let topic = publish.topic;
                        if topic != command_topic
                            && topic != control_topic
                            && admin_topic.as_deref() != Some(topic.as_str())
                            && !is_artifact_ack_topic(
                                &self.control_router,
                                artifact_ack_filter.as_deref(),
                                &topic,
                            )
                        {
                            continue;
                        }
                        let context = self.context_provider.context()
                            .map_err(|_| MqttV2PumpError::ContextUnavailable)?;
                        let payload = publish.payload.to_vec();
                        let retained = publish.retain;
                        if topic == command_topic {
                            let queue_timing = self.stage_timing.as_ref().and_then(|recorder| {
                                recorder
                                    .start(
                                        RuntimeStage::Queue,
                                        &sha256_correlation(payload.as_slice()),
                                    )
                                    .ok()
                            });
                            let command = PendingMqttV2Command {
                                topic,
                                payload,
                                retained,
                                context,
                                queue_timing,
                            };
                            if jobs.len() < self.config.max_in_flight {
                                spawn_command_job(
                                    &mut jobs,
                                    Arc::clone(&self.command_adapter),
                                    command,
                                );
                            } else {
                                pending_commands.push_back(command);
                            }
                        } else if topic == control_topic
                            || is_artifact_ack_topic(
                                &self.control_router,
                                artifact_ack_filter.as_deref(),
                                &topic,
                            )
                        {
                            let router = Arc::clone(&self.control_router);
                            jobs.spawn_blocking(move || {
                                MqttV2PumpJobResult::Control(router.process(
                                    topic,
                                    payload,
                                    retained,
                                    context.now_ms,
                                    context.response_signing,
                                ))
                            });
                        } else if let Some(adapter) = self.policy_admin.as_ref().map(Arc::clone) {
                            jobs.spawn_blocking(move || {
                                MqttV2PumpJobResult::Admin(adapter.process(
                                    MqttV2InboundPolicyAdmin {
                                        topic,
                                        payload,
                                        retained,
                                    },
                                    context.now_ms,
                                    context.response_signing,
                                ))
                            });
                        }
                    } else {
                        track_delivery_event(
                            event,
                            &mut pending_outgoing,
                            &mut awaiting_puback,
                            self.delivery_receipts.as_ref(),
                        )?;
                    }
                }
            }
        }
        shutdown_guard.request();
        while let Some(command) = pending_commands.pop_front() {
            spawn_command_job(&mut jobs, Arc::clone(&self.command_adapter), command);
        }
        while let Some(completed) = jobs.join_next().await {
            let action = handle_completion(
                self.delivery_receipts.as_ref(),
                Some(completed),
                self.stage_timing.as_ref(),
                &mut artifact_ack_timings,
            )?;
            apply_completion_action(
                action,
                &mut response_outbox,
                &mut artifact_batches,
                self.artifact_cleanup.as_deref(),
                &mut capabilities_refresh_requested,
            )?;
        }
        drain_artifact_batches(
            &self.client,
            &mut self.event_loop,
            &self.control_router,
            &mut artifact_batches,
            &mut pending_outgoing,
            &mut awaiting_puback,
            self.delivery_receipts.as_ref(),
            self.stage_timing.as_ref(),
            &mut artifact_ack_timings,
        )
        .await?;
        projection_outbox.clear();
        if connected && let Some(status_projection) = &self.status_projection {
            let now_ms = self
                .context_provider
                .context()
                .map_err(|_| MqttV2PumpError::ContextUnavailable)?
                .now_ms;
            let publish = status_projection
                .graceful_offline(now_ms)
                .map_err(|_| MqttV2PumpError::StatusBuildFailed)?;
            enqueue_status_publish(publish, &mut projection_outbox);
        }
        drain_projection_outbox(
            &self.client,
            &mut self.event_loop,
            &mut projection_outbox,
            &mut pending_outgoing,
            &mut awaiting_puback,
            self.delivery_receipts.as_ref(),
        )
        .await?;
        drain_response_outbox(
            &self.client,
            &mut self.event_loop,
            &mut response_outbox,
            &mut pending_outgoing,
            &mut awaiting_puback,
            self.delivery_receipts.as_ref(),
            self.stage_timing.as_ref(),
        )
        .await?;
        drain_delivery_publications(
            &mut self.event_loop,
            &mut pending_outgoing,
            &mut awaiting_puback,
            self.delivery_receipts.as_ref(),
        )
        .await?;
        if !connected {
            // No MQTT session exists to acknowledge DISCONNECT. Dropping the
            // owned client/EventLoop after workers and durable publications
            // are drained is the deterministic shutdown for reconnecting or
            // never-connected runtimes.
            return Ok(MqttV2PumpOutcome::Stopped);
        }
        self.client
            .disconnect()
            .await
            .map_err(|_| MqttV2PumpError::DisconnectFailed)?;
        let disconnect = tokio::time::timeout(DISCONNECT_DRAIN_TIMEOUT, async {
            loop {
                match self.event_loop.poll().await {
                    Ok(Event::Outgoing(Outgoing::Disconnect)) => return Ok(()),
                    Ok(_) => {}
                    Err(_) => return Err(()),
                }
            }
        })
        .await;
        match disconnect {
            Ok(Ok(())) => Ok(MqttV2PumpOutcome::Stopped),
            Ok(Err(())) | Err(_) => Err(MqttV2PumpError::DisconnectFailed),
        }
    }
}

fn enqueue_status_publish(
    publish: MqttV2StatusPublish,
    outbox: &mut VecDeque<MqttV2ProjectionPublish>,
) {
    enqueue_retained_projection(
        outbox,
        MqttV2ProjectionPublish {
            topic: publish.topic,
            payload: publish.payload,
            qos: publish.qos,
            retained: publish.retained,
        },
    );
}

fn enqueue_capabilities_publish(
    publish: MqttV2CapabilitiesPublish,
    outbox: &mut VecDeque<MqttV2ProjectionPublish>,
) {
    enqueue_retained_projection(
        outbox,
        MqttV2ProjectionPublish {
            topic: publish.topic,
            payload: publish.payload,
            qos: publish.qos,
            retained: publish.retained,
        },
    );
}

struct MqttV2ProjectionPublish {
    topic: String,
    payload: Vec<u8>,
    qos: crate::mqtt_v2_topics::MqttQos,
    retained: bool,
}

/// Coalesces one retained snapshot per exact topic. A slow broker therefore
/// cannot grow an unbounded heartbeat queue, and the latest canonical status
/// or capability projection replaces stale unsent bytes.
fn enqueue_retained_projection(
    outbox: &mut VecDeque<MqttV2ProjectionPublish>,
    publish: MqttV2ProjectionPublish,
) {
    if let Some(queued) = outbox
        .iter_mut()
        .find(|queued| queued.topic == publish.topic)
    {
        *queued = publish;
    } else {
        outbox.push_back(publish);
    }
}

/// The pump is the sole EventLoop owner, so it must never await capacity on
/// the very request channel that only its next `poll()` can drain.
fn progress_projection_outbox(
    client: &AsyncClient,
    outbox: &mut VecDeque<MqttV2ProjectionPublish>,
    pending_outgoing: &mut VecDeque<PendingOutgoingPublication>,
) {
    let Some(publish) = outbox.front() else {
        return;
    };
    let accepted = match publish.qos {
        crate::mqtt_v2_topics::MqttQos::AtLeastOnce => client
            .try_publish(
                publish.topic.clone(),
                QoS::AtLeastOnce,
                publish.retained,
                publish.payload.clone(),
            )
            .is_ok(),
    };
    if accepted {
        outbox.pop_front();
        pending_outgoing.push_back(PendingOutgoingPublication::untracked());
    }
}

struct PumpStatusGuard(Option<Arc<dyn MqttV2PumpStatusSink>>);

impl Drop for PumpStatusGuard {
    fn drop(&mut self) {
        if let Some(status) = &self.0 {
            status.stopped();
        }
    }
}

struct PumpShutdownGuard(Option<Arc<dyn MqttV2PumpShutdownSink>>);

impl PumpShutdownGuard {
    fn request(&self) {
        if let Some(shutdown) = &self.0 {
            shutdown.request_runtime_shutdown();
        }
    }
}

impl Drop for PumpShutdownGuard {
    fn drop(&mut self) {
        self.request();
    }
}

enum MqttV2PumpJobResult {
    Command(MqttV2ResponseAdapterResult),
    Control(MqttV2ControlRouterResult),
    Admin(MqttV2PolicyAdminAdapterResult),
}

struct PendingMqttV2Command {
    topic: String,
    payload: Vec<u8>,
    retained: bool,
    context: MqttV2PumpContext,
    queue_timing: Option<StageTimingSpan>,
}

fn spawn_command_job(
    jobs: &mut JoinSet<MqttV2PumpJobResult>,
    adapter: Arc<MqttV2ResponseAdapter>,
    command: PendingMqttV2Command,
) {
    jobs.spawn_blocking(move || {
        if let Some(timing) = command.queue_timing {
            let _ = timing.complete();
        }
        MqttV2PumpJobResult::Command(adapter.process(
            MqttV2InboundCommand {
                topic: command.topic,
                payload: command.payload,
                retained: command.retained,
            },
            command.context.now_ms,
            command.context.binding,
            command.context.response_signing,
        ))
    });
}

async fn enqueue_subscriptions(
    client: &AsyncClient,
    event_loop: &mut EventLoop,
    topics: Vec<String>,
) -> Result<(), MqttV2PumpError> {
    for topic in topics {
        loop {
            if client
                .try_subscribe(topic.clone(), QoS::AtLeastOnce)
                .is_ok()
            {
                break;
            }
            match event_loop.poll().await {
                Ok(Event::Incoming(Incoming::Publish(_))) => {
                    // The controlled protocol requires all ingress
                    // subscriptions before a broker may deliver work.
                    return Err(MqttV2PumpError::SubscribeFailed);
                }
                Ok(_) => {}
                Err(_) => return Err(MqttV2PumpError::SubscribeFailed),
            }
        }
    }
    Ok(())
}

struct MqttV2EnqueuedPublish {
    topic: String,
    payload: Vec<u8>,
    qos: crate::mqtt_v2_topics::MqttQos,
    retained: bool,
    receipt_id: Option<String>,
    timing_correlation: Option<String>,
    refresh_capabilities: bool,
}

enum MqttV2CompletionAction {
    None,
    Enqueued(MqttV2EnqueuedPublish),
    ArtifactBatch(ArtifactPublishBatch),
    Cleanup(ArtifactCleanupRequest),
    ArtifactCancel {
        result: ArtifactCancelResult,
        artifact_ref: String,
        transfer_id: String,
        response: MqttV2EnqueuedPublish,
    },
}

struct ArtifactPublishBatch {
    publishes: VecDeque<MqttV2ArtifactChunkPublish>,
    completion: ArtifactPublicationCompletion,
    prepared_at_ms: i64,
    timing_correlation: String,
    transfer_timing: Option<StageTimingSpan>,
}

fn handle_completion(
    delivery_receipts: &dyn V2DeliveryReceiptStore,
    completed: Option<Result<MqttV2PumpJobResult, tokio::task::JoinError>>,
    stage_timing: Option<&StageTimingRecorder>,
    artifact_ack_timings: &mut HashMap<String, StageTimingSpan>,
) -> Result<MqttV2CompletionAction, MqttV2PumpError> {
    let Some(completed) = completed else {
        return Err(MqttV2PumpError::WorkerFailed);
    };
    let (response, refresh_capabilities) =
        match completed.map_err(|_| MqttV2PumpError::WorkerFailed)? {
            MqttV2PumpJobResult::Command(MqttV2ResponseAdapterResult::Publish(response))
            | MqttV2PumpJobResult::Control(MqttV2ControlRouterResult::Publish(response))
            | MqttV2PumpJobResult::Control(MqttV2ControlRouterResult::ArtifactFetchRejected {
                response,
            }) => (response, false),
            MqttV2PumpJobResult::Admin(MqttV2PolicyAdminAdapterResult::Publish {
                response,
                refresh_capabilities,
            }) => (response, refresh_capabilities),
            MqttV2PumpJobResult::Control(MqttV2ControlRouterResult::ArtifactPrepared {
                publishes,
                completion,
                prepared_at_ms,
            }) => {
                let timing_correlation =
                    artifact_stage_correlation(completion.artifact_ref(), completion.transfer_id());
                let transfer_timing = stage_timing.and_then(|recorder| {
                    recorder
                        .start(RuntimeStage::Transfer, &timing_correlation)
                        .ok()
                });
                return Ok(MqttV2CompletionAction::ArtifactBatch(
                    ArtifactPublishBatch {
                        publishes: publishes.into(),
                        completion,
                        prepared_at_ms,
                        timing_correlation,
                        transfer_timing,
                    },
                ));
            }
            MqttV2PumpJobResult::Control(MqttV2ControlRouterResult::ArtifactAcknowledged {
                cleanup: Some(cleanup),
            }) => {
                complete_artifact_ack_timing(
                    artifact_ack_timings,
                    cleanup.artifact_ref(),
                    cleanup.transfer_id(),
                );
                return Ok(MqttV2CompletionAction::Cleanup(cleanup));
            }
            MqttV2PumpJobResult::Control(MqttV2ControlRouterResult::ArtifactAcknowledged {
                cleanup: None,
            }) => return Ok(MqttV2CompletionAction::None),
            MqttV2PumpJobResult::Control(MqttV2ControlRouterResult::ArtifactCancelled {
                result,
                artifact_ref,
                transfer_id,
                response,
            }) => {
                let response = prepare_response(delivery_receipts, response)?;
                return Ok(MqttV2CompletionAction::ArtifactCancel {
                    result,
                    artifact_ref,
                    transfer_id,
                    response,
                });
            }
            MqttV2PumpJobResult::Command(MqttV2ResponseAdapterResult::Rejected(_))
            | MqttV2PumpJobResult::Control(MqttV2ControlRouterResult::Rejected(_))
            | MqttV2PumpJobResult::Admin(MqttV2PolicyAdminAdapterResult::Rejected(_)) => {
                return Ok(MqttV2CompletionAction::None);
            }
            MqttV2PumpJobResult::Command(
                MqttV2ResponseAdapterResult::InternalContractFailure(_)
                | MqttV2ResponseAdapterResult::ResponseSigningFailed,
            )
            | MqttV2PumpJobResult::Control(MqttV2ControlRouterResult::ResponseSigningFailed)
            | MqttV2PumpJobResult::Admin(MqttV2PolicyAdminAdapterResult::ResponseSigningFailed) => {
                return Err(MqttV2PumpError::ResponseBuildFailed);
            }
        };
    let mut enqueued = prepare_response(delivery_receipts, response)?;
    enqueued.refresh_capabilities = refresh_capabilities;
    Ok(MqttV2CompletionAction::Enqueued(enqueued))
}

fn apply_completion_action(
    action: MqttV2CompletionAction,
    response_outbox: &mut VecDeque<MqttV2EnqueuedPublish>,
    artifact_batches: &mut VecDeque<ArtifactPublishBatch>,
    cleanup: Option<&dyn MqttV2ArtifactCleanupSink>,
    capabilities_refresh_requested: &mut bool,
) -> Result<(), MqttV2PumpError> {
    match action {
        MqttV2CompletionAction::None => Ok(()),
        MqttV2CompletionAction::Enqueued(enqueued) => {
            *capabilities_refresh_requested |= enqueued.refresh_capabilities;
            response_outbox.push_back(enqueued);
            Ok(())
        }
        MqttV2CompletionAction::ArtifactBatch(batch) => {
            artifact_batches.push_back(batch);
            Ok(())
        }
        MqttV2CompletionAction::Cleanup(request) => cleanup
            .ok_or(MqttV2PumpError::ArtifactCleanupFailed)?
            .request_cleanup(request)
            .map_err(|_| MqttV2PumpError::ArtifactCleanupFailed),
        MqttV2CompletionAction::ArtifactCancel {
            result:
                ArtifactCancelResult::Cancelled { .. } | ArtifactCancelResult::AlreadyCancelled { .. },
            artifact_ref,
            transfer_id,
            response,
        } => {
            // This pump is the sole owner of not-yet-accepted chunk batches.
            // A durable exact-transfer cancellation therefore removes only
            // that pending batch here. Frames already accepted by rumqttc or
            // the broker cannot be retracted and remain harmless because the
            // canonical lifecycle is terminal Cancelled and ACK cannot clean
            // it up.
            artifact_batches.retain(|batch| {
                batch.completion.artifact_ref() != artifact_ref
                    || batch.completion.transfer_id() != transfer_id
            });
            response_outbox.push_back(response);
            Ok(())
        }
        MqttV2CompletionAction::ArtifactCancel {
            result: ArtifactCancelResult::Rejected { .. },
            response,
            ..
        } => {
            response_outbox.push_back(response);
            Ok(())
        }
    }
}

fn progress_artifact_batch(
    client: &AsyncClient,
    router: &MqttV2ControlRouter,
    batches: &mut VecDeque<ArtifactPublishBatch>,
    pending_outgoing: &mut VecDeque<PendingOutgoingPublication>,
    stage_timing: Option<&StageTimingRecorder>,
    artifact_ack_timings: &mut HashMap<String, StageTimingSpan>,
) -> Result<(), MqttV2PumpError> {
    let Some(batch) = batches.front_mut() else {
        return Ok(());
    };
    let Some(publish) = batch.publishes.front() else {
        return Err(MqttV2PumpError::ArtifactStateFailed);
    };
    let publish_result = match publish.qos {
        crate::mqtt_v2_topics::MqttQos::AtLeastOnce => client.try_publish(
            publish.topic.clone(),
            QoS::AtLeastOnce,
            publish.retained,
            publish.payload.clone(),
        ),
    };
    if publish_result.is_err() {
        // A full rumqttc request channel is backpressure, not terminal
        // publication failure. Polling EventLoop below creates capacity.
        return Ok(());
    }
    batch.publishes.pop_front();
    pending_outgoing.push_back(PendingOutgoingPublication::untracked());
    if !batch.publishes.is_empty() {
        return Ok(());
    }
    let batch = batches
        .pop_front()
        .ok_or(MqttV2PumpError::ArtifactStateFailed)?;
    let ArtifactPublishBatch {
        completion,
        prepared_at_ms,
        timing_correlation,
        transfer_timing,
        ..
    } = batch;
    match router.complete_artifact_publication(completion, true, prepared_at_ms) {
        Some(ArtifactPublicationCompletionResult::Published(
            ArtifactPublishResult::AwaitingAcknowledgement { .. }
            | ArtifactPublishResult::AlreadyRecorded { .. },
        )) => {
            if let Some(timing) = transfer_timing {
                let _ = timing.complete();
            }
            if let Some(timing) = stage_timing.and_then(|recorder| {
                recorder
                    .start(RuntimeStage::Acknowledgement, &timing_correlation)
                    .ok()
            }) {
                artifact_ack_timings
                    .entry(timing_correlation)
                    .or_insert(timing);
            }
            Ok(())
        }
        Some(ArtifactPublicationCompletionResult::Published(ArtifactPublishResult::Rejected {
            ..
        }))
        | Some(ArtifactPublicationCompletionResult::Failed(_))
        | None => Err(MqttV2PumpError::ArtifactStateFailed),
    }
}

fn complete_artifact_ack_timing(
    timings: &mut HashMap<String, StageTimingSpan>,
    artifact_ref: &str,
    transfer_id: &str,
) {
    let correlation = artifact_stage_correlation(artifact_ref, transfer_id);
    if let Some(timing) = timings.remove(&correlation) {
        let _ = timing.complete();
    }
}

fn fail_artifact_batches(
    router: &MqttV2ControlRouter,
    batches: &mut VecDeque<ArtifactPublishBatch>,
) -> Result<(), MqttV2PumpError> {
    while let Some(batch) = batches.pop_front() {
        match router.complete_artifact_publication(batch.completion, false, batch.prepared_at_ms) {
            Some(ArtifactPublicationCompletionResult::Failed(
                ArtifactPublishFailureResult::Failed { .. },
            )) => {}
            Some(ArtifactPublicationCompletionResult::Failed(
                ArtifactPublishFailureResult::Rejected { .. },
            ))
            | Some(ArtifactPublicationCompletionResult::Published(_))
            | None => return Err(MqttV2PumpError::ArtifactStateFailed),
        }
    }
    Ok(())
}

fn is_artifact_ack_topic(
    router: &MqttV2ControlRouter,
    configured_filter: Option<&str>,
    topic: &str,
) -> bool {
    configured_filter.is_some() && router.accepts_artifact_ack_topic(topic)
}

/// Only failures that can change without changing the admitted request or
/// immutable runtime configuration remain under the pump's reconnect owner.
/// Protocol, authentication, packet and state invariant failures stay
/// terminal so retries cannot hide a deterministic contract defect.
fn is_recoverable_connection_error(error: &ConnectionError) -> bool {
    matches!(
        error,
        ConnectionError::NetworkTimeout
            | ConnectionError::FlushTimeout
            | ConnectionError::Io(_)
            | ConnectionError::MqttState(StateError::Io(_))
            | ConnectionError::ConnectionRefused(ConnectReturnCode::ServiceUnavailable)
    ) || matches!(error, ConnectionError::Tls(source) if error_chain_contains_io(source))
}

/// `rumqttc` intentionally keeps its TLS error enum private. Inspecting the
/// standard typed source chain lets the pump distinguish a recoverable socket
/// close from immutable certificate, key, DNS, or handshake failures without
/// parsing provider wording.
fn error_chain_contains_io(mut error: &(dyn StdError + 'static)) -> bool {
    loop {
        if error.downcast_ref::<std::io::Error>().is_some() {
            return true;
        }
        let Some(source) = error.source() else {
            return false;
        };
        error = source;
    }
}

async fn wait_for_reconnect_or_shutdown(shutdown: &mut watch::Receiver<bool>) -> bool {
    tokio::select! {
        _ = tokio::time::sleep(RECONNECT_BACKOFF) => *shutdown.borrow(),
        changed = shutdown.changed() => changed.is_err() || *shutdown.borrow(),
    }
}

fn map_connection_error(error: ConnectionError) -> MqttV2PumpError {
    let failure = match error {
        ConnectionError::MqttState(state) => match state {
            StateError::Io(_) => MqttV2ConnectionFailure::StateIo,
            StateError::InvalidState => MqttV2ConnectionFailure::StateInvalid,
            StateError::Unsolicited(_) => MqttV2ConnectionFailure::StateUnsolicitedAck,
            StateError::AwaitPingResp => MqttV2ConnectionFailure::StatePing,
            StateError::WrongPacket => MqttV2ConnectionFailure::StateWrongPacket,
            StateError::CollisionTimeout => MqttV2ConnectionFailure::StateCollisionTimeout,
            StateError::EmptySubscription => MqttV2ConnectionFailure::StateEmptySubscription,
            StateError::Deserialization(_) => MqttV2ConnectionFailure::StateDeserialization,
            StateError::OutgoingPacketTooLarge { .. } => {
                MqttV2ConnectionFailure::StateOutgoingPacketTooLarge
            }
        },
        ConnectionError::NetworkTimeout => MqttV2ConnectionFailure::NetworkTimeout,
        ConnectionError::FlushTimeout => MqttV2ConnectionFailure::FlushTimeout,
        ConnectionError::Io(_) => MqttV2ConnectionFailure::Io,
        ConnectionError::Tls(error) if error_chain_contains_io(&error) => {
            MqttV2ConnectionFailure::TlsIo
        }
        ConnectionError::ConnectionRefused(_) => MqttV2ConnectionFailure::Refused,
        ConnectionError::NotConnAck(_) => MqttV2ConnectionFailure::InvalidHandshake,
        ConnectionError::RequestsDone => MqttV2ConnectionFailure::RequestsDone,
        _ => MqttV2ConnectionFailure::Other,
    };
    MqttV2PumpError::ConnectionFailed(failure)
}

fn prepare_response(
    delivery_receipts: &dyn V2DeliveryReceiptStore,
    response: MqttV2ResponsePublish,
) -> Result<MqttV2EnqueuedPublish, MqttV2PumpError> {
    let (receipt_id, timing_correlation) = if let Some(receipt) = response.delivery_receipt {
        let receipt_id = receipt.receipt_id().to_string();
        let timing_correlation = receipt.response_digest().to_string();
        match delivery_receipts.register(*receipt) {
            V2DeliveryRegisterResult::Registered | V2DeliveryRegisterResult::Duplicate => {
                (Some(receipt_id), Some(timing_correlation))
            }
            V2DeliveryRegisterResult::BindingMismatch
            | V2DeliveryRegisterResult::Saturated
            | V2DeliveryRegisterResult::Unavailable => {
                return Err(MqttV2PumpError::DeliveryStateFailed);
            }
        }
    } else {
        (None, None)
    };
    Ok(MqttV2EnqueuedPublish {
        topic: response.topic,
        payload: response.payload,
        qos: response.qos,
        retained: response.retained,
        receipt_id,
        timing_correlation,
        refresh_capabilities: false,
    })
}

/// Advances one prepared terminal response without awaiting AsyncClient queue
/// capacity. The same pump owns EventLoop progress, so awaiting here could
/// deadlock whenever subscriptions, projections, or concurrent completions
/// fill rumqttc's bounded request channel.
fn progress_response_outbox(
    client: &AsyncClient,
    outbox: &mut VecDeque<MqttV2EnqueuedPublish>,
    pending_outgoing: &mut VecDeque<PendingOutgoingPublication>,
    stage_timing: Option<&StageTimingRecorder>,
) {
    let Some(response) = outbox.front() else {
        return;
    };
    let accepted = match response.qos {
        crate::mqtt_v2_topics::MqttQos::AtLeastOnce => client
            .try_publish(
                response.topic.clone(),
                QoS::AtLeastOnce,
                response.retained,
                response.payload.clone(),
            )
            .is_ok(),
    };
    if accepted {
        let response = outbox
            .pop_front()
            .expect("front response exists after accepted publication");
        let timing = response
            .timing_correlation
            .as_deref()
            .and_then(|correlation| {
                stage_timing
                    .and_then(|recorder| recorder.start(RuntimeStage::Publish, correlation).ok())
            });
        pending_outgoing.push_back(PendingOutgoingPublication {
            receipt_id: response.receipt_id,
            timing,
        });
    }
}

struct PendingOutgoingPublication {
    receipt_id: Option<String>,
    timing: Option<StageTimingSpan>,
}

impl PendingOutgoingPublication {
    fn untracked() -> Self {
        Self {
            receipt_id: None,
            timing: None,
        }
    }
}

fn track_delivery_event(
    event: Event,
    pending_outgoing: &mut VecDeque<PendingOutgoingPublication>,
    awaiting_puback: &mut HashMap<u16, PendingOutgoingPublication>,
    delivery_receipts: &dyn V2DeliveryReceiptStore,
) -> Result<(), MqttV2PumpError> {
    match event {
        Event::Outgoing(Outgoing::Publish(packet_id)) => {
            if awaiting_puback.contains_key(&packet_id) {
                // rumqttc preserves the original packet ID for an in-flight
                // QoS 1 publish moved to its reconnect pending queue.
                return Ok(());
            }
            let Some(receipt_id) = pending_outgoing.pop_front() else {
                return Err(MqttV2PumpError::DeliveryStateFailed);
            };
            if awaiting_puback.insert(packet_id, receipt_id).is_some() {
                return Err(MqttV2PumpError::DeliveryStateFailed);
            }
        }
        Event::Incoming(Incoming::PubAck(ack)) => {
            if let Some(publication) = awaiting_puback.remove(&ack.pkid) {
                if let Some(timing) = publication.timing {
                    let _ = timing.complete();
                }
                let Some(receipt_id) = publication.receipt_id else {
                    return Ok(());
                };
                match delivery_receipts.mark_published(&receipt_id) {
                    V2DeliveryPublishResult::Published { .. }
                    | V2DeliveryPublishResult::Duplicate { .. }
                    | V2DeliveryPublishResult::AlreadyAcknowledged { .. } => {}
                    V2DeliveryPublishResult::NotFound | V2DeliveryPublishResult::Unavailable => {
                        return Err(MqttV2PumpError::DeliveryStateFailed);
                    }
                }
            }
        }
        _ => {}
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn drain_artifact_batches(
    client: &AsyncClient,
    event_loop: &mut EventLoop,
    router: &MqttV2ControlRouter,
    batches: &mut VecDeque<ArtifactPublishBatch>,
    pending_outgoing: &mut VecDeque<PendingOutgoingPublication>,
    awaiting_puback: &mut HashMap<u16, PendingOutgoingPublication>,
    delivery_receipts: &dyn V2DeliveryReceiptStore,
    stage_timing: Option<&StageTimingRecorder>,
    artifact_ack_timings: &mut HashMap<String, StageTimingSpan>,
) -> Result<(), MqttV2PumpError> {
    if batches.is_empty() {
        return Ok(());
    }
    tokio::time::timeout(DISCONNECT_DRAIN_TIMEOUT, async {
        while !batches.is_empty() {
            progress_artifact_batch(
                client,
                router,
                batches,
                pending_outgoing,
                stage_timing,
                artifact_ack_timings,
            )?;
            let event = event_loop.poll().await.map_err(map_connection_error)?;
            track_delivery_event(event, pending_outgoing, awaiting_puback, delivery_receipts)?;
        }
        Ok(())
    })
    .await
    .map_err(|_| MqttV2PumpError::PublishFailed)?
}

#[allow(clippy::too_many_arguments)]
async fn drain_projection_outbox(
    client: &AsyncClient,
    event_loop: &mut EventLoop,
    outbox: &mut VecDeque<MqttV2ProjectionPublish>,
    pending_outgoing: &mut VecDeque<PendingOutgoingPublication>,
    awaiting_puback: &mut HashMap<u16, PendingOutgoingPublication>,
    delivery_receipts: &dyn V2DeliveryReceiptStore,
) -> Result<(), MqttV2PumpError> {
    if outbox.is_empty() {
        return Ok(());
    }
    tokio::time::timeout(DISCONNECT_DRAIN_TIMEOUT, async {
        while !outbox.is_empty() {
            progress_projection_outbox(client, outbox, pending_outgoing);
            let event = event_loop.poll().await.map_err(map_connection_error)?;
            track_delivery_event(event, pending_outgoing, awaiting_puback, delivery_receipts)?;
        }
        Ok(())
    })
    .await
    .map_err(|_| MqttV2PumpError::PublishFailed)?
}

#[allow(clippy::too_many_arguments)]
async fn drain_response_outbox(
    client: &AsyncClient,
    event_loop: &mut EventLoop,
    outbox: &mut VecDeque<MqttV2EnqueuedPublish>,
    pending_outgoing: &mut VecDeque<PendingOutgoingPublication>,
    awaiting_puback: &mut HashMap<u16, PendingOutgoingPublication>,
    delivery_receipts: &dyn V2DeliveryReceiptStore,
    stage_timing: Option<&StageTimingRecorder>,
) -> Result<(), MqttV2PumpError> {
    if outbox.is_empty() {
        return Ok(());
    }
    tokio::time::timeout(DISCONNECT_DRAIN_TIMEOUT, async {
        while !outbox.is_empty() {
            progress_response_outbox(client, outbox, pending_outgoing, stage_timing);
            let event = event_loop.poll().await.map_err(map_connection_error)?;
            track_delivery_event(event, pending_outgoing, awaiting_puback, delivery_receipts)?;
        }
        Ok(())
    })
    .await
    .map_err(|_| MqttV2PumpError::PublishFailed)?
}

async fn drain_delivery_publications(
    event_loop: &mut EventLoop,
    pending_outgoing: &mut VecDeque<PendingOutgoingPublication>,
    awaiting_puback: &mut HashMap<u16, PendingOutgoingPublication>,
    delivery_receipts: &dyn V2DeliveryReceiptStore,
) -> Result<(), MqttV2PumpError> {
    if pending_outgoing.is_empty() && awaiting_puback.is_empty() {
        return Ok(());
    }
    tokio::time::timeout(DISCONNECT_DRAIN_TIMEOUT, async {
        while !pending_outgoing.is_empty() || !awaiting_puback.is_empty() {
            let event = event_loop.poll().await.map_err(map_connection_error)?;
            track_delivery_event(event, pending_outgoing, awaiting_puback, delivery_receipts)?;
        }
        Ok(())
    })
    .await
    .map_err(|_| MqttV2PumpError::DeliveryStateFailed)?
}

#[cfg(test)]
mod reconnect_policy_tests {
    use std::collections::VecDeque;
    use std::io;

    use rumqttc::{ConnectReturnCode, ConnectionError, StateError};
    use tokio::sync::watch;

    use super::{
        ArtifactPublishBatch, MqttV2CompletionAction, MqttV2EnqueuedPublish, MqttV2PumpJobResult,
        apply_completion_action, handle_completion, is_recoverable_connection_error,
        wait_for_reconnect_or_shutdown,
    };
    use crate::artifact_transfer_use_case::ArtifactCancelResult;
    use crate::mqtt_v2_artifact_adapter::{
        ArtifactPublicationCompletion, MqttV2ArtifactChunkPublish,
    };
    use crate::mqtt_v2_control_router::MqttV2ControlRouterResult;
    use crate::mqtt_v2_response_adapter::MqttV2ResponsePublish;
    use crate::mqtt_v2_topics::MqttQos;
    use crate::stage_timing::artifact_stage_correlation;
    use crate::v2_delivery_receipt::{
        V2DeliveryAckBinding, V2DeliveryAckStoreResult, V2DeliveryPublishResult, V2DeliveryReceipt,
        V2DeliveryReceiptStore, V2DeliveryRegisterResult,
    };

    #[test]
    fn admitted_artifact_fetch_failure_is_enqueued_as_one_typed_response() {
        let completed = tokio::runtime::Runtime::new()
            .expect("runtime")
            .block_on(async {
                tokio::spawn(async {
                    MqttV2PumpJobResult::Control(MqttV2ControlRouterResult::ArtifactFetchRejected {
                        response: MqttV2ResponsePublish {
                            topic: "response/topic".to_string(),
                            payload: br#"{"schema_id":"yeonjang.artifact-fetch-result.v2"}"#
                                .to_vec(),
                            qos: MqttQos::AtLeastOnce,
                            retained: false,
                            delivery_receipt: None,
                        },
                    })
                })
                .await
            });
        let action = handle_completion(
            &NoDeliveryReceipts,
            Some(completed),
            None,
            &mut std::collections::HashMap::new(),
        )
        .expect("typed response action");

        let MqttV2CompletionAction::Enqueued(response) = action else {
            panic!("admitted fetch failure must be enqueued")
        };
        assert_eq!(response.topic, "response/topic");
        assert_eq!(
            response.payload,
            br#"{"schema_id":"yeonjang.artifact-fetch-result.v2"}"#
        );
        assert!(!response.retained);
    }

    struct NoDeliveryReceipts;

    impl V2DeliveryReceiptStore for NoDeliveryReceipts {
        fn register(&self, _: V2DeliveryReceipt) -> V2DeliveryRegisterResult {
            panic!("fetch rejection has no delivery receipt")
        }

        fn mark_published(&self, _: &str) -> V2DeliveryPublishResult {
            panic!("fetch rejection has no delivery receipt")
        }

        fn acknowledge(&self, _: &V2DeliveryAckBinding) -> V2DeliveryAckStoreResult {
            panic!("fetch rejection has no delivery receipt")
        }
    }

    #[test]
    fn retries_only_transport_failures_and_temporary_broker_unavailability() {
        assert!(is_recoverable_connection_error(
            &ConnectionError::NetworkTimeout
        ));
        assert!(is_recoverable_connection_error(
            &ConnectionError::FlushTimeout
        ));
        assert!(is_recoverable_connection_error(&ConnectionError::Io(
            io::Error::new(io::ErrorKind::ConnectionReset, "controlled reset")
        )));
        assert!(is_recoverable_connection_error(
            &ConnectionError::MqttState(StateError::Io(io::Error::new(
                io::ErrorKind::BrokenPipe,
                "controlled broken pipe"
            )))
        ));
        assert!(is_recoverable_connection_error(
            &ConnectionError::ConnectionRefused(ConnectReturnCode::ServiceUnavailable)
        ));

        assert!(!is_recoverable_connection_error(
            &ConnectionError::ConnectionRefused(ConnectReturnCode::NotAuthorized)
        ));
        assert!(!is_recoverable_connection_error(
            &ConnectionError::MqttState(StateError::InvalidState)
        ));
        assert!(!is_recoverable_connection_error(
            &ConnectionError::RequestsDone
        ));
    }

    #[test]
    fn typed_io_source_detection_does_not_parse_error_wording() {
        let io = io::Error::new(io::ErrorKind::UnexpectedEof, "opaque provider detail");
        assert!(super::error_chain_contains_io(&io));
        assert!(!super::error_chain_contains_io(
            &ConnectionError::MqttState(StateError::InvalidState)
        ));
    }

    #[tokio::test]
    async fn shutdown_interrupts_reconnect_backoff_without_spawning_an_ownerless_task() {
        let (shutdown_tx, mut shutdown_rx) = watch::channel(false);
        let wait = wait_for_reconnect_or_shutdown(&mut shutdown_rx);
        let signal = async move {
            tokio::task::yield_now().await;
            shutdown_tx.send(true).expect("shutdown receiver");
        };

        let (stopped, ()) = tokio::join!(wait, signal);
        assert!(stopped);
    }

    #[test]
    fn exact_artifact_cancel_removes_only_the_matching_pending_batch() {
        let mut batches = VecDeque::from([
            batch("capture:match", "transfer-a"),
            batch("capture:other", "transfer-b"),
        ]);
        let mut response_outbox = VecDeque::new();
        let mut capabilities_refresh_requested = false;

        apply_completion_action(
            MqttV2CompletionAction::ArtifactCancel {
                result: ArtifactCancelResult::Cancelled {
                    lifecycle_revision: 2,
                },
                artifact_ref: "capture:match".to_string(),
                transfer_id: "transfer-a".to_string(),
                response: response(),
            },
            &mut response_outbox,
            &mut batches,
            None,
            &mut capabilities_refresh_requested,
        )
        .expect("cancel action");

        assert_eq!(batches.len(), 1);
        assert_eq!(batches[0].completion.artifact_ref(), "capture:other");
        assert_eq!(batches[0].completion.transfer_id(), "transfer-b");
    }

    #[test]
    fn rejected_artifact_cancel_does_not_remove_any_pending_batch() {
        let mut batches = VecDeque::from([batch("capture:match", "transfer-a")]);
        apply_completion_action(
            MqttV2CompletionAction::ArtifactCancel {
                result: ArtifactCancelResult::Rejected {
                    reason:
                        crate::artifact_transfer_use_case::ArtifactTransferReject::WrongTransfer,
                },
                artifact_ref: "capture:match".to_string(),
                transfer_id: "transfer-b".to_string(),
                response: response(),
            },
            &mut VecDeque::new(),
            &mut batches,
            None,
            &mut false,
        )
        .expect("rejected cancel action");
        assert_eq!(batches.len(), 1);
    }

    fn batch(artifact_ref: &str, transfer_id: &str) -> ArtifactPublishBatch {
        ArtifactPublishBatch {
            publishes: VecDeque::from([MqttV2ArtifactChunkPublish {
                topic: "test/chunk".to_string(),
                payload: vec![1],
                qos: MqttQos::AtLeastOnce,
                retained: false,
            }]),
            completion: ArtifactPublicationCompletion::test_fixture(artifact_ref, transfer_id),
            prepared_at_ms: 1_000,
            timing_correlation: artifact_stage_correlation(artifact_ref, transfer_id),
            transfer_timing: None,
        }
    }

    fn response() -> MqttV2EnqueuedPublish {
        MqttV2EnqueuedPublish {
            topic: "test/response".to_string(),
            payload: vec![1],
            qos: MqttQos::AtLeastOnce,
            retained: false,
            receipt_id: None,
            refresh_capabilities: false,
            timing_correlation: None,
        }
    }
}
