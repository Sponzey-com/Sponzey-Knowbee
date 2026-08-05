//! Production composition root and owner for the direct MQTT v2 runtime.
//!
//! This module receives already-validated concrete infrastructure snapshots.
//! It does not read environment, settings or filesystem paths.

use std::future::Future;
use std::sync::Arc;
use std::sync::atomic::{AtomicU8, AtomicU64, Ordering};

use tokio::sync::watch;
use tokio::task::JoinHandle;

use crate::artifact_runtime_composition::ArtifactRuntimeComposition;
use crate::authorization::InMemoryAuthorizationReplayGuard;
use crate::blocking_resource_admission::BlockingExecutionResourceAdmission;
use crate::cancellation::ActiveCommandRegistry;
use crate::capture_permission_read::{
    CapturePermissionObservationPort, CapturePermissionReadOwner, CapturePermissionReadUseCase,
};
use crate::durable_cancellation::{
    DurableCancellationReceiptRepository, DurableCancellationReceiptStore,
};
use crate::execute_capability::{ExecuteCapabilityUseCase, ExecutionCancellation, ExecutionClock};
use crate::mqtt_v2_capabilities_adapter::MqttV2CapabilitiesAdapter;
use crate::mqtt_v2_capability_projection::V2PlatformCapabilitySnapshot;
use crate::mqtt_v2_command_pump::{
    MqttV2CommandPump, MqttV2PumpConfig, MqttV2PumpContext, MqttV2PumpContextError,
    MqttV2PumpContextProvider, MqttV2PumpDependencies, MqttV2PumpError, MqttV2PumpOutcome,
    MqttV2PumpStatusSink,
};
use crate::mqtt_v2_connection::{MqttV2ConnectionConfig, build_mqtt_v2_connection};
use crate::mqtt_v2_control_adapter::MqttV2ControlAdapter;
use crate::mqtt_v2_control_router::MqttV2ControlRouter;
use crate::mqtt_v2_crypto::MqttV2HmacCrypto;
use crate::mqtt_v2_direct_handler::MqttV2CommandHandler;
use crate::mqtt_v2_permission_query_adapter::MqttV2CapturePermissionAdapter;
use crate::mqtt_v2_policy_admin_adapter::MqttV2PolicyAdminAdapter;
use crate::mqtt_v2_receipt_query_adapter::MqttV2ReceiptQueryAdapter;
use crate::mqtt_v2_response_ack_adapter::MqttV2ResponseAckAdapter;
use crate::mqtt_v2_response_adapter::MqttV2ResponseAdapter;
use crate::mqtt_v2_status_adapter::MqttV2StatusAdapter;
use crate::mqtt_v2_topics::MqttV2TopicSet;
use crate::platform_operation::TargetPlatform;
use crate::platform_port::PlatformCapabilityPort;
use crate::policy_admin::{
    PolicyAdminAuthorizationDecision, PolicyAdminAuthorizationGrant,
    PolicyAdminAuthorizationRejection, PolicyAdminAuthorizationScope,
    PolicyAdminAuthorizationVerifier, PolicyAdminUseCase,
};
use crate::policy_repository::{PermissionPolicyAdminWriter, PermissionPolicyReader};
use crate::protocol_v2::V2CommandSignatureVerifier;
use crate::protocol_v2_artifact::V2ArtifactSignatureVerifier;
use crate::protocol_v2_control::V2ControlSignatureVerifier;
use crate::protocol_v2_operation::V2OperationBindingContext;
use crate::protocol_v2_permission_query::V2CapturePermissionQuerySignatureVerifier;
use crate::protocol_v2_policy_admin::V2PolicyAdminSignatureVerifier;
use crate::protocol_v2_receipt_query::V2ReceiptQuerySignatureVerifier;
use crate::protocol_v2_response_ack::V2ResponseAckSignatureVerifier;
use crate::protocol_v2_terminal::{V2ResponseSigner, V2ResponseSigningContext};
use crate::stage_timing::StageTimingRecorder;
use crate::v2_cancel_use_case::{V2CancelClock, V2CancelOwnerScope, V2CancelUseCase};
use crate::v2_delivery_receipt::{
    DurableV2DeliveryRepository, V2DeliveryIdentityResolver, V2DeliveryReceiptStore,
};
use crate::v2_receipt_query_use_case::{V2ReceiptQueryOwnerScope, V2ReceiptQueryUseCase};
use crate::v2_response_ack_use_case::{V2ResponseAckOwnerScope, V2ResponseAckUseCase};
use crate::v2_terminal_repository::{DurableV2TerminalRepository, V2TerminalRepository};

const MIN_RESPONSE_TTL_MS: i64 = 1_000;
const MAX_RESPONSE_TTL_MS: i64 = 5 * 60_000;
const MAX_REPLAY_CAPACITY: usize = 65_536;
const MIN_PREFLIGHT_AGE_MS: u64 = 1;
const MAX_PREFLIGHT_AGE_MS: u64 = 60_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MqttV2RuntimeBuildError {
    IdentityMismatch,
    InvalidTargetFingerprint,
    InvalidSigningIdentity,
    MissingBrokerCredentials,
    InvalidResponseTtl,
    InvalidReplayCapacity,
    InvalidPreflightAge,
    ReplayBuildFailed,
    OwnerScopeInvalid,
    ConnectionInvalid,
    StatusBuildFailed,
    CapabilitiesBuildFailed,
    ResourceAdmissionInvalid,
    RuntimeUnavailable,
}

pub struct MqttV2RuntimeConfig {
    connection: MqttV2ConnectionConfig,
    topics: MqttV2TopicSet,
    target_fingerprint: String,
    target_platform: TargetPlatform,
    response_issuer: String,
    response_key_id: String,
    response_audience: String,
    response_ttl_ms: i64,
    replay_capacity: usize,
    max_preflight_age_ms: u64,
    pump: MqttV2PumpConfig,
}

impl MqttV2RuntimeConfig {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        connection: MqttV2ConnectionConfig,
        topics: MqttV2TopicSet,
        target_fingerprint: impl Into<String>,
        target_platform: TargetPlatform,
        response_issuer: impl Into<String>,
        response_key_id: impl Into<String>,
        response_audience: impl Into<String>,
        response_ttl_ms: i64,
        replay_capacity: usize,
        max_preflight_age_ms: u64,
        pump: MqttV2PumpConfig,
    ) -> Result<Self, MqttV2RuntimeBuildError> {
        if connection.instance_id() != topics.instance_id()
            || connection.session_id() != topics.session_id()
        {
            return Err(MqttV2RuntimeBuildError::IdentityMismatch);
        }
        if !connection.has_credentials() {
            return Err(MqttV2RuntimeBuildError::MissingBrokerCredentials);
        }
        let target_fingerprint = target_fingerprint.into();
        if !is_sha256_digest(&target_fingerprint) {
            return Err(MqttV2RuntimeBuildError::InvalidTargetFingerprint);
        }
        let response_issuer = response_issuer.into();
        let response_key_id = response_key_id.into();
        let response_audience = response_audience.into();
        if !is_identity(&response_issuer)
            || !is_identity(&response_key_id)
            || !is_identity(&response_audience)
            || response_issuer != topics.instance_id()
            || response_audience != topics.requester_id()
        {
            return Err(MqttV2RuntimeBuildError::InvalidSigningIdentity);
        }
        if !(MIN_RESPONSE_TTL_MS..=MAX_RESPONSE_TTL_MS).contains(&response_ttl_ms) {
            return Err(MqttV2RuntimeBuildError::InvalidResponseTtl);
        }
        if replay_capacity == 0 || replay_capacity > MAX_REPLAY_CAPACITY {
            return Err(MqttV2RuntimeBuildError::InvalidReplayCapacity);
        }
        if !(MIN_PREFLIGHT_AGE_MS..=MAX_PREFLIGHT_AGE_MS).contains(&max_preflight_age_ms) {
            return Err(MqttV2RuntimeBuildError::InvalidPreflightAge);
        }
        Ok(Self {
            connection,
            topics,
            target_fingerprint,
            target_platform,
            response_issuer,
            response_key_id,
            response_audience,
            response_ttl_ms,
            replay_capacity,
            max_preflight_age_ms,
            pump,
        })
    }

    pub fn connection(&self) -> &MqttV2ConnectionConfig {
        &self.connection
    }

    pub fn instance_id(&self) -> &str {
        self.topics.instance_id()
    }

    pub fn session_id(&self) -> &str {
        self.topics.session_id()
    }

    pub fn requester_id(&self) -> &str {
        self.topics.requester_id()
    }

    pub fn target_platform(&self) -> TargetPlatform {
        self.target_platform
    }
}

pub trait MqttV2RuntimeClock: Send + Sync {
    fn now_ms(&self) -> i64;
}

pub struct MqttV2RuntimeDependencies {
    crypto: Arc<MqttV2HmacCrypto>,
    terminal: Arc<DurableV2TerminalRepository>,
    delivery: Arc<DurableV2DeliveryRepository>,
    cancellations: Arc<DurableCancellationReceiptRepository>,
    policy: Arc<dyn PermissionPolicyReader>,
    policy_admin_writer: Option<Arc<dyn PermissionPolicyAdminWriter>>,
    permission_observation: Option<Arc<dyn CapturePermissionObservationPort>>,
    capability_snapshot: Option<V2PlatformCapabilitySnapshot>,
    platform_factory: PlatformFactory,
    artifacts: ArtifactRuntimeComposition,
    clock: Arc<dyn MqttV2RuntimeClock>,
    stage_timing: Option<StageTimingRecorder>,
}

type PlatformFactory =
    Box<dyn FnOnce(Arc<ActiveCommandRegistry>) -> Arc<dyn PlatformCapabilityPort> + Send + 'static>;

impl MqttV2RuntimeDependencies {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        crypto: Arc<MqttV2HmacCrypto>,
        terminal: Arc<DurableV2TerminalRepository>,
        delivery: Arc<DurableV2DeliveryRepository>,
        cancellations: Arc<DurableCancellationReceiptRepository>,
        policy: Arc<dyn PermissionPolicyReader>,
        platform: Arc<dyn PlatformCapabilityPort>,
        artifacts: ArtifactRuntimeComposition,
        clock: Arc<dyn MqttV2RuntimeClock>,
    ) -> Self {
        Self {
            crypto,
            terminal,
            delivery,
            cancellations,
            policy,
            policy_admin_writer: None,
            permission_observation: None,
            capability_snapshot: None,
            platform_factory: Box::new(move |_| platform),
            artifacts,
            clock,
            stage_timing: None,
        }
    }

    /// Defers platform adapter construction until the composition root has
    /// created its one canonical active-command/cancellation registry.
    #[allow(clippy::too_many_arguments)]
    pub fn new_with_platform_factory<F>(
        crypto: Arc<MqttV2HmacCrypto>,
        terminal: Arc<DurableV2TerminalRepository>,
        delivery: Arc<DurableV2DeliveryRepository>,
        cancellations: Arc<DurableCancellationReceiptRepository>,
        policy: Arc<dyn PermissionPolicyReader>,
        platform_factory: F,
        artifacts: ArtifactRuntimeComposition,
        clock: Arc<dyn MqttV2RuntimeClock>,
    ) -> Self
    where
        F: FnOnce(Arc<ActiveCommandRegistry>) -> Arc<dyn PlatformCapabilityPort> + Send + 'static,
    {
        Self {
            crypto,
            terminal,
            delivery,
            cancellations,
            policy,
            policy_admin_writer: None,
            permission_observation: None,
            capability_snapshot: None,
            platform_factory: Box::new(platform_factory),
            artifacts,
            clock,
            stage_timing: None,
        }
    }

    /// Adds the write side of the canonical policy repository.
    ///
    /// Production passes the same concrete durable repository as both the
    /// reader and writer. Keeping this optional preserves the smaller runtime
    /// composition used by command-only contract tests.
    pub fn with_policy_admin_writer(
        mut self,
        writer: Arc<dyn PermissionPolicyAdminWriter>,
    ) -> Self {
        self.policy_admin_writer = Some(writer);
        self
    }

    pub fn with_capability_snapshot(mut self, snapshot: V2PlatformCapabilitySnapshot) -> Self {
        self.capability_snapshot = Some(snapshot);
        self
    }

    pub fn with_permission_observation(
        mut self,
        observation: Arc<dyn CapturePermissionObservationPort>,
    ) -> Self {
        self.permission_observation = Some(observation);
        self
    }

    pub fn with_stage_timing(mut self, recorder: StageTimingRecorder) -> Self {
        self.stage_timing = Some(recorder);
        self
    }
}

pub struct MqttV2Runtime {
    shutdown: watch::Sender<bool>,
    task: Option<JoinHandle<Result<MqttV2PumpOutcome, MqttV2PumpError>>>,
    connection_state: Arc<RuntimeConnectionProjection>,
}

impl MqttV2Runtime {
    pub fn request_shutdown(&self) {
        let _ = self.shutdown.send(true);
    }

    pub fn connection_state(&self) -> MqttV2RuntimeConnectionState {
        self.connection_state.state()
    }

    pub fn is_finished(&self) -> bool {
        self.task.as_ref().is_none_or(JoinHandle::is_finished)
    }

    pub async fn shutdown(mut self) -> Result<MqttV2PumpOutcome, MqttV2RuntimeShutdownError> {
        let _ = self.shutdown.send(true);
        self.task
            .take()
            .expect("runtime owns its pump task until shutdown")
            .await
            .map_err(|_| MqttV2RuntimeShutdownError::JoinFailed)?
            .map_err(MqttV2RuntimeShutdownError::Pump)
    }

    /// Waits for either an external shutdown request or an early pump exit.
    /// Early connection/pump failure is therefore observable without waiting
    /// for a process signal, while external shutdown still drains and joins.
    pub async fn run_until<F>(
        mut self,
        shutdown_requested: F,
    ) -> Result<MqttV2PumpOutcome, MqttV2RuntimeShutdownError>
    where
        F: Future,
    {
        tokio::pin!(shutdown_requested);
        let task = self
            .task
            .as_mut()
            .expect("runtime owns its pump task until completion");
        tokio::select! {
            joined = task => {
                self.task.take();
                joined
                    .map_err(|_| MqttV2RuntimeShutdownError::JoinFailed)?
                    .map_err(MqttV2RuntimeShutdownError::Pump)
            }
            _ = &mut shutdown_requested => {
                let _ = self.shutdown.send(true);
                self.task
                    .take()
                    .expect("pump remains owned after shutdown request")
                    .await
                    .map_err(|_| MqttV2RuntimeShutdownError::JoinFailed)?
                    .map_err(MqttV2RuntimeShutdownError::Pump)
            }
        }
    }
}

impl Drop for MqttV2Runtime {
    fn drop(&mut self) {
        let _ = self.shutdown.send(true);
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MqttV2RuntimeShutdownError {
    JoinFailed,
    Pump(MqttV2PumpError),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MqttV2RuntimeConnectionState {
    Starting,
    Connected,
    Reconnecting,
    Stopped,
}

pub fn start_mqtt_v2_runtime(
    config: MqttV2RuntimeConfig,
    dependencies: MqttV2RuntimeDependencies,
) -> Result<MqttV2Runtime, MqttV2RuntimeBuildError> {
    let handle = tokio::runtime::Handle::try_current()
        .map_err(|_| MqttV2RuntimeBuildError::RuntimeUnavailable)?;
    start_mqtt_v2_runtime_on_handle(config, dependencies, handle)
}

/// Starts the owned pump on an explicitly selected Tokio runtime.
///
/// GUI and headless composition roots can therefore share this production
/// builder without relying on ambient runtime discovery.
pub fn start_mqtt_v2_runtime_on_handle(
    config: MqttV2RuntimeConfig,
    dependencies: MqttV2RuntimeDependencies,
    handle: tokio::runtime::Handle,
) -> Result<MqttV2Runtime, MqttV2RuntimeBuildError> {
    start_mqtt_v2_runtime_on_handle_with_guard(config, dependencies, handle, None)
}

/// Keeps a pre-subscribe activation guard alive until the pump has fully
/// drained and stopped. The production instance-process lease uses this path
/// so dropping a handle cannot release the lease while a detached pump lives.
pub fn start_mqtt_v2_runtime_on_handle_with_guard(
    mut config: MqttV2RuntimeConfig,
    dependencies: MqttV2RuntimeDependencies,
    handle: tokio::runtime::Handle,
    activation_guard: Option<Box<dyn Send>>,
) -> Result<MqttV2Runtime, MqttV2RuntimeBuildError> {
    let MqttV2RuntimeDependencies {
        crypto,
        terminal,
        delivery,
        cancellations,
        policy,
        policy_admin_writer,
        permission_observation,
        capability_snapshot,
        platform_factory,
        artifacts,
        clock,
        stage_timing,
    } = dependencies;
    let status_signer: Arc<dyn V2ResponseSigner> = crypto.clone();
    let status_projection = Arc::new(
        MqttV2StatusAdapter::new(
            config.topics.clone(),
            &config.target_fingerprint,
            &config.response_issuer,
            &config.response_key_id,
            config.response_ttl_ms,
            status_signer,
        )
        .map_err(|_| MqttV2RuntimeBuildError::StatusBuildFailed)?,
    );
    let capabilities_projection = capability_snapshot
        .map(|platform| {
            MqttV2CapabilitiesAdapter::new(
                config.topics.clone(),
                &config.target_fingerprint,
                platform,
                policy.clone(),
                &config.response_issuer,
                &config.response_key_id,
                config.response_ttl_ms,
                crypto.clone(),
            )
        })
        .transpose()
        .map_err(|_| MqttV2RuntimeBuildError::CapabilitiesBuildFailed)?
        .map(Arc::new);
    let last_will = status_projection
        .last_will(clock.now_ms())
        .map_err(|_| MqttV2RuntimeBuildError::StatusBuildFailed)?;
    config.connection.bind_last_will(last_will);
    let (client, event_loop) = build_mqtt_v2_connection(&config.connection)
        .map_err(|_| MqttV2RuntimeBuildError::ConnectionInvalid)?;
    let topics = config.topics.clone();
    let registry = Arc::new(ActiveCommandRegistry::default());
    let platform = platform_factory(Arc::clone(&registry));
    let execution_cancellation: Arc<dyn ExecutionCancellation> = registry.clone();
    let shared_clock = Arc::new(SharedRuntimeClock(Arc::clone(&clock)));
    let resource_admission = Arc::new(
        BlockingExecutionResourceAdmission::new(config.pump.max_in_flight())
            .map_err(|_| MqttV2RuntimeBuildError::ResourceAdmissionInvalid)?,
    );

    let command_verifier: Arc<dyn V2CommandSignatureVerifier> = crypto.clone();
    let control_verifier: Arc<dyn V2ControlSignatureVerifier> = crypto.clone();
    let receipt_verifier: Arc<dyn V2ReceiptQuerySignatureVerifier> = crypto.clone();
    let permission_verifier: Arc<dyn V2CapturePermissionQuerySignatureVerifier> = crypto.clone();
    let ack_verifier: Arc<dyn V2ResponseAckSignatureVerifier> = crypto.clone();
    let artifact_verifier: Arc<dyn V2ArtifactSignatureVerifier> = crypto.clone();
    let policy_admin_verifier: Arc<dyn V2PolicyAdminSignatureVerifier> = crypto.clone();
    let response_signer: Arc<dyn V2ResponseSigner> = crypto;
    let terminal_store: Arc<dyn V2TerminalRepository> = terminal.clone();
    let delivery_identity: Arc<dyn V2DeliveryIdentityResolver> = delivery.clone();
    let delivery_store: Arc<dyn V2DeliveryReceiptStore> = delivery.clone();
    let cancellation_store: Arc<dyn DurableCancellationReceiptStore> = cancellations;

    let permission_policy = Arc::clone(&policy);
    let mut handler = MqttV2CommandHandler::new(
        topics.clone(),
        command_verifier,
        replay(config.replay_capacity)?,
        Arc::clone(&terminal_store),
        Arc::clone(&registry),
        policy,
        ExecuteCapabilityUseCase::new(
            platform,
            shared_clock.clone(),
            execution_cancellation,
            config.max_preflight_age_ms,
        )
        .with_resource_admission(resource_admission),
    );
    if let Some(recorder) = stage_timing.clone() {
        handler = handler.with_stage_timing(recorder);
    }
    let handler = artifacts.attach_handler(handler);
    let command_adapter = Arc::new(
        MqttV2ResponseAdapter::new(handler, Arc::clone(&response_signer))
            .with_delivery_identity_resolver(delivery_identity),
    );

    let cancel_scope = V2CancelOwnerScope::new(
        config.instance_id(),
        config.session_id(),
        &config.target_fingerprint,
    )
    .map_err(|_| MqttV2RuntimeBuildError::OwnerScopeInvalid)?;
    let cancel = V2CancelUseCase::new_durable(
        Arc::clone(&registry),
        cancel_scope,
        cancellation_store,
        shared_clock.clone(),
    );
    let cancel_adapter = MqttV2ControlAdapter::new(
        topics.clone(),
        control_verifier,
        replay(config.replay_capacity)?,
        cancel,
        Arc::clone(&response_signer),
    );
    let receipt_scope = V2ReceiptQueryOwnerScope::new(
        config.instance_id(),
        config.session_id(),
        &config.target_fingerprint,
    )
    .map_err(|_| MqttV2RuntimeBuildError::OwnerScopeInvalid)?;
    let receipt_adapter = MqttV2ReceiptQueryAdapter::new(
        topics.clone(),
        receipt_verifier,
        replay(config.replay_capacity)?,
        V2ReceiptQueryUseCase::new(terminal_store, receipt_scope),
        Arc::clone(&response_signer),
    );
    let ack_scope = V2ResponseAckOwnerScope::new(
        config.instance_id(),
        config.session_id(),
        &config.target_fingerprint,
    )
    .map_err(|_| MqttV2RuntimeBuildError::OwnerScopeInvalid)?;
    let ack_adapter = MqttV2ResponseAckAdapter::new(
        topics.clone(),
        ack_verifier,
        replay(config.replay_capacity)?,
        V2ResponseAckUseCase::new(Arc::clone(&delivery_store), ack_scope),
        Arc::clone(&response_signer),
    );
    let mut router = MqttV2ControlRouter::new(cancel_adapter, receipt_adapter, ack_adapter)
        .map_err(|_| MqttV2RuntimeBuildError::IdentityMismatch)?;
    if let Some(observation) = permission_observation {
        let owner = CapturePermissionReadOwner::new(
            config.instance_id(),
            config.session_id(),
            &config.target_fingerprint,
        )
        .map_err(|_| MqttV2RuntimeBuildError::OwnerScopeInvalid)?;
        router = router
            .with_permission_read(MqttV2CapturePermissionAdapter::new(
                config.topics.clone(),
                permission_verifier,
                replay(config.replay_capacity)?,
                CapturePermissionReadUseCase::new(owner, permission_policy, observation),
                Arc::clone(&response_signer),
            ))
            .map_err(|_| MqttV2RuntimeBuildError::IdentityMismatch)?;
    }
    let router = artifacts
        .attach_router(
            router,
            topics,
            artifact_verifier,
            replay(config.replay_capacity)?,
            Arc::clone(&response_signer),
        )
        .map_err(|_| MqttV2RuntimeBuildError::IdentityMismatch)?;
    let policy_admin = policy_admin_writer.map(|writer| {
        let authorization: Arc<dyn PolicyAdminAuthorizationVerifier> =
            Arc::new(BoundPolicyAdminAuthorizationVerifier {
                requester_id: config.requester_id().to_string(),
                target_instance_id: config.instance_id().to_string(),
                target_session_id: config.session_id().to_string(),
                target_fingerprint: config.target_fingerprint.clone(),
                clock: Arc::clone(&clock),
            });
        Arc::new(MqttV2PolicyAdminAdapter::new(
            config.topics.clone(),
            policy_admin_verifier,
            PolicyAdminUseCase::new(authorization, writer),
            Arc::clone(&response_signer),
        ))
    });
    let connection_state = Arc::new(RuntimeConnectionProjection::default());
    let status_sink: Arc<dyn MqttV2PumpStatusSink> = connection_state.clone();
    let shutdown_registry = Arc::clone(&registry);
    let mut pump_dependencies = artifacts
        .attach_pump(MqttV2PumpDependencies::new(
            command_adapter,
            Arc::new(router),
            delivery_store,
        ))
        .with_status_sink(status_sink)
        .with_shutdown_sink(registry);
    if let Some(policy_admin) = policy_admin {
        pump_dependencies = pump_dependencies.with_policy_admin(policy_admin);
    }
    pump_dependencies = pump_dependencies.with_status_projection(status_projection);
    if let Some(capabilities_projection) = capabilities_projection {
        pump_dependencies = pump_dependencies.with_capabilities_projection(capabilities_projection);
    }
    if let Some(recorder) = stage_timing {
        pump_dependencies = pump_dependencies.with_stage_timing(recorder);
    }
    let context = Arc::new(RuntimeContextProvider::new(&config, clock));
    let (shutdown, shutdown_rx) = watch::channel(false);
    let pump = MqttV2CommandPump::new(
        client,
        event_loop,
        pump_dependencies,
        context,
        shutdown_rx,
        config.pump,
    );
    let task = handle.spawn(async move {
        let result = pump.run().await;
        // A blocking OS adapter cannot be force-aborted by Tokio. Even when
        // the pump exits through an error path, retain the exact instance
        // activation guard until every registered command has observed
        // runtime cancellation and released canonical ownership.
        await_active_command_release(&shutdown_registry).await;
        drop(activation_guard);
        result
    });
    Ok(MqttV2Runtime {
        shutdown,
        task: Some(task),
        connection_state,
    })
}

async fn await_active_command_release(registry: &ActiveCommandRegistry) {
    loop {
        if registry.active_count() == Some(0) {
            return;
        }
        // Poisoned state is not equivalent to zero ownership. Fail closed by
        // retaining the activation guard instead of allowing a second runtime
        // to overlap a command whose completion cannot be proven.
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
}

/// Application authorization guard for an admin envelope that already passed
/// the strict MQTT-v2 schema and HMAC admission boundary.
///
/// The guard intentionally does not infer meaning from text. It binds the
/// admitted grant to this one runtime snapshot and rejects cross-scope,
/// wrong-target, wrong-session, wrong-requester, and expired reuse.
struct BoundPolicyAdminAuthorizationVerifier {
    requester_id: String,
    target_instance_id: String,
    target_session_id: String,
    target_fingerprint: String,
    clock: Arc<dyn MqttV2RuntimeClock>,
}

impl PolicyAdminAuthorizationVerifier for BoundPolicyAdminAuthorizationVerifier {
    fn verify(&self, grant: &PolicyAdminAuthorizationGrant) -> PolicyAdminAuthorizationDecision {
        if grant.scope() != PolicyAdminAuthorizationScope::AdminPolicyWrite {
            return PolicyAdminAuthorizationDecision::Rejected(
                PolicyAdminAuthorizationRejection::ScopeMismatch,
            );
        }
        if grant.requester_id() != self.requester_id
            || grant.target_instance_id() != self.target_instance_id
            || grant.target_session_id() != self.target_session_id
            || grant.target_fingerprint() != self.target_fingerprint
        {
            return PolicyAdminAuthorizationDecision::Rejected(
                PolicyAdminAuthorizationRejection::BindingMismatch,
            );
        }
        if grant.expires_at() <= self.clock.now_ms() {
            return PolicyAdminAuthorizationDecision::Rejected(
                PolicyAdminAuthorizationRejection::Expired,
            );
        }
        PolicyAdminAuthorizationDecision::Authorized
    }
}

#[derive(Default)]
struct RuntimeConnectionProjection(AtomicU8);

impl RuntimeConnectionProjection {
    fn state(&self) -> MqttV2RuntimeConnectionState {
        match self.0.load(Ordering::Acquire) {
            1 => MqttV2RuntimeConnectionState::Connected,
            2 => MqttV2RuntimeConnectionState::Reconnecting,
            3 => MqttV2RuntimeConnectionState::Stopped,
            _ => MqttV2RuntimeConnectionState::Starting,
        }
    }
}

impl MqttV2PumpStatusSink for RuntimeConnectionProjection {
    fn connected(&self) {
        self.0.store(1, Ordering::Release);
    }

    fn reconnecting(&self) {
        self.0.store(2, Ordering::Release);
    }

    fn stopped(&self) {
        self.0.store(3, Ordering::Release);
    }
}

fn replay(
    capacity: usize,
) -> Result<Arc<InMemoryAuthorizationReplayGuard>, MqttV2RuntimeBuildError> {
    InMemoryAuthorizationReplayGuard::new(capacity)
        .map(Arc::new)
        .map_err(|_| MqttV2RuntimeBuildError::ReplayBuildFailed)
}

struct SharedRuntimeClock(Arc<dyn MqttV2RuntimeClock>);

impl ExecutionClock for SharedRuntimeClock {
    fn now_ms(&self) -> i64 {
        self.0.now_ms()
    }
}

impl V2CancelClock for SharedRuntimeClock {
    fn now_ms(&self) -> i64 {
        self.0.now_ms()
    }
}

struct RuntimeContextProvider {
    clock: Arc<dyn MqttV2RuntimeClock>,
    sequence: AtomicU64,
    target_platform: TargetPlatform,
    response_issuer: String,
    response_key_id: String,
    response_audience: String,
    response_ttl_ms: i64,
}

impl RuntimeContextProvider {
    fn new(config: &MqttV2RuntimeConfig, clock: Arc<dyn MqttV2RuntimeClock>) -> Self {
        Self {
            clock,
            sequence: AtomicU64::new(0),
            target_platform: config.target_platform,
            response_issuer: config.response_issuer.clone(),
            response_key_id: config.response_key_id.clone(),
            response_audience: config.response_audience.clone(),
            response_ttl_ms: config.response_ttl_ms,
        }
    }
}

impl MqttV2PumpContextProvider for RuntimeContextProvider {
    fn context(&self) -> Result<MqttV2PumpContext, MqttV2PumpContextError> {
        let now_ms = self.clock.now_ms();
        let expires_at = now_ms
            .checked_add(self.response_ttl_ms)
            .ok_or(MqttV2PumpContextError::Unavailable)?;
        let sequence = self
            .sequence
            .fetch_add(1, Ordering::Relaxed)
            .checked_add(1)
            .ok_or(MqttV2PumpContextError::Unavailable)?;
        Ok(MqttV2PumpContext {
            now_ms,
            binding: V2OperationBindingContext {
                target_platform: self.target_platform,
                policy_revision: 0,
                artifact_lease_ref: Some(format!("artifact-lease-{sequence}")),
            },
            response_signing: V2ResponseSigningContext {
                message_id: format!("response-{sequence}"),
                issued_at: now_ms,
                expires_at,
                issuer: self.response_issuer.clone(),
                key_id: self.response_key_id.clone(),
                audience: self.response_audience.clone(),
                nonce: format!("response-nonce-{sequence}"),
            },
        })
    }
}

fn is_identity(value: &str) -> bool {
    !value.trim().is_empty() && value.len() <= 256 && !value.bytes().any(|b| b.is_ascii_control())
}

fn is_sha256_digest(value: &str) -> bool {
    value
        .strip_prefix("sha256:")
        .is_some_and(|digest| digest.len() == 64 && digest.bytes().all(|b| b.is_ascii_hexdigit()))
}

#[cfg(test)]
mod ownership_tests {
    use std::sync::Arc;
    use std::time::Duration;

    use crate::cancellation::{ActiveCommandRegistration, ActiveCommandRegistry};

    use super::await_active_command_release;

    #[tokio::test]
    async fn activation_release_waits_for_canonical_active_command_removal() {
        let registry = Arc::new(ActiveCommandRegistry::default());
        assert!(matches!(
            registry.register(Some("command-active"), Some("cancel-active")),
            ActiveCommandRegistration::Registered(_)
        ));
        let waiting_registry = Arc::clone(&registry);
        let waiter =
            tokio::spawn(async move { await_active_command_release(&waiting_registry).await });
        tokio::task::yield_now().await;
        assert!(!waiter.is_finished());

        registry.request_runtime_shutdown();
        registry.remove(Some("command-active"));
        tokio::time::timeout(Duration::from_secs(1), waiter)
            .await
            .expect("ownership release")
            .expect("waiter task");
        assert_eq!(registry.active_count(), Some(0));
    }
}
