//! Packaged direct-MQTT-v2 bootstrap and activation ordering.
//!
//! This composition root consumes resolved settings and credentials once,
//! requires a process-owned bootstrap guard before storage or transport activation,
//! recovers independent durable owners, constructs one OS-neutral platform
//! adapter, then starts the owned Tokio pump. It never falls back to v1.

use std::fs;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use sha2::{Digest, Sha256};
use tokio::runtime::Handle;

use crate::artifact_runtime_composition::{
    ArtifactRuntimeBuildError, ArtifactRuntimeComposition, ArtifactRuntimeConfig,
};
use crate::atomic_local_storage::{AtomicLocalStorage, LocalStorageBuildError};
use crate::automation::AutomationBackend;
use crate::cancellation::ActiveCommandRegistry;
use crate::durable_cancellation::{
    DurableCancellationReceiptRepository, DurableCancellationStoreBootstrapError,
};
use crate::durable_completed_store::DurableRecordStorage;
use crate::execute_capability::ExecutionClock;
use crate::instance_process_lease::RuntimeLeaseGuard;
use crate::legacy_capture_permission_observer::LegacyCapturePermissionObserver;
use crate::legacy_capture_platform::{
    LegacyCapturePlatformAdapter, LegacyScreenPermissionProbe, ScreenPermissionProbeError,
};
use crate::mqtt_transport::MqttTransportSecurity;
use crate::mqtt_v2_capability_projection::V2PlatformCapabilitySnapshot;
use crate::mqtt_v2_command_pump::MqttV2PumpConfig;
use crate::mqtt_v2_connection::{MqttV2BrokerCredentials, MqttV2ConnectionConfig};
use crate::mqtt_v2_crypto::{MqttV2HmacBuildError, MqttV2HmacCrypto, V2HmacKeySnapshot};
use crate::mqtt_v2_runtime_composition::{
    MqttV2Runtime, MqttV2RuntimeBuildError, MqttV2RuntimeClock, MqttV2RuntimeConfig,
    MqttV2RuntimeConnectionState, MqttV2RuntimeDependencies, MqttV2RuntimeShutdownError,
    start_mqtt_v2_runtime_on_handle_with_guard,
};
use crate::mqtt_v2_topics::{MqttV2TopicError, MqttV2TopicSet};
use crate::platform_operation::{PreflightPermissionState, TargetPlatform};
use crate::platform_port::PlatformCapabilityPort;
use crate::policy_repository::{
    DurablePermissionPolicyRepository, PermissionPolicyAdminWriter, PermissionPolicyReader,
};
use crate::settings::{YeonjangSettings, settings_path};
use crate::stage_timing::StageTimingRecorder;
use crate::v2_delivery_receipt::{DurableV2DeliveryRepository, DurableV2DeliveryRepositoryError};
use crate::v2_terminal_repository::{
    DurableV2TerminalRepository, DurableV2TerminalRepositoryError,
};

const DURABLE_CAPACITY: usize = 1_024;
const DURABLE_FILE_BYTES: usize = 16 * 1024 * 1024;
const ARTIFACT_CAPACITY: usize = 1_024;
const ARTIFACT_FILE_BYTES: usize = 16 * 1024 * 1024;
const ARTIFACT_TTL_MS: i64 = 10 * 60_000;
const RESPONSE_TTL_MS: i64 = 30_000;
const REPLAY_CAPACITY: usize = 1_024;
const PREFLIGHT_MAX_AGE_MS: u64 = 1_000;
const MAX_IN_FLIGHT: usize = 8;
const KEEPALIVE_SECONDS: u64 = 20;
const REQUEST_CHANNEL_CAPACITY: usize = 32;
const REQUESTER_KEY_ID: &str = "requester-hmac-v2";
const INSTANCE_KEY_ID: &str = "instance-hmac-v2";

/// Non-secret enrollment identity known to the exact MQTT requester.
pub struct MqttV2Enrollment {
    session_id: String,
    requester_id: String,
    target_fingerprint: String,
    inbound_issuer: String,
    inbound_key_id: String,
    outbound_key_id: String,
}

impl MqttV2Enrollment {
    pub fn new(
        session_id: impl Into<String>,
        requester_id: impl Into<String>,
        target_fingerprint: impl Into<String>,
        inbound_issuer: impl Into<String>,
        inbound_key_id: impl Into<String>,
        outbound_key_id: impl Into<String>,
    ) -> Self {
        Self {
            session_id: session_id.into(),
            requester_id: requester_id.into(),
            target_fingerprint: target_fingerprint.into(),
            inbound_issuer: inbound_issuer.into(),
            inbound_key_id: inbound_key_id.into(),
            outbound_key_id: outbound_key_id.into(),
        }
    }

    /// Uses only dedicated enrollment settings. Broker usernames and display
    /// aliases are deliberately not reinterpreted as protocol identities.
    pub fn from_settings(settings: &YeonjangSettings) -> Self {
        Self::new(
            settings.mqtt_v2.session_id.clone(),
            settings.mqtt_v2.requester_id.clone(),
            canonical_target_fingerprint(settings),
            settings.mqtt_v2.requester_id.clone(),
            REQUESTER_KEY_ID,
            INSTANCE_KEY_ID,
        )
    }
}

/// Stable public target identity derived from non-secret enrolled host values.
pub fn canonical_target_fingerprint(settings: &YeonjangSettings) -> String {
    let mut digest = Sha256::new();
    digest.update(b"knowbee.yeonjang.target-fingerprint.v2\0");
    for field in [
        settings.instance_id.as_str(),
        settings.host_fingerprint.as_str(),
        settings.install_fingerprint.as_str(),
    ] {
        digest.update((field.len() as u64).to_be_bytes());
        digest.update(field.as_bytes());
    }
    format!("sha256:{:x}", digest.finalize())
}

/// Domain-separates the protocol HMAC key from the broker login password.
///
/// Both enrolled peers apply this documented derivation; the raw broker
/// password itself is not used directly as signing key material.
pub fn derive_mqtt_v2_hmac_key(secret: &[u8]) -> Option<Vec<u8>> {
    if secret.is_empty() || secret.len() > 4_096 {
        return None;
    }
    let mut digest = Sha256::new();
    digest.update(b"knowbee.yeonjang.mqtt-v2-hmac-key\0");
    digest.update((secret.len() as u64).to_be_bytes());
    digest.update(secret);
    Some(digest.finalize().to_vec())
}

pub fn configured_mqtt_v2_state_root() -> Result<PathBuf, MqttV2ProductionBuildError> {
    settings_path()
        .parent()
        .map(|parent| parent.join("mqtt-v2"))
        .ok_or(MqttV2ProductionBuildError::StateStorage(
            LocalStorageBuildError::UnsafePath,
        ))
}

/// Validated immutable production configuration. Secret-bearing members use
/// redacted value types whose buffers are cleared when the graph is dropped.
pub struct MqttV2ProductionConfig {
    runtime: MqttV2RuntimeConfig,
    crypto: Arc<MqttV2HmacCrypto>,
    artifact: ArtifactRuntimeConfig,
    state_root: PathBuf,
}

impl MqttV2ProductionConfig {
    pub fn from_resolved_settings(
        settings: YeonjangSettings,
        enrollment: MqttV2Enrollment,
        transport: MqttTransportSecurity,
        state_root: PathBuf,
        target_platform: TargetPlatform,
    ) -> Result<Self, MqttV2ProductionBuildError> {
        if !state_root.is_absolute() {
            return Err(MqttV2ProductionBuildError::StateStorage(
                LocalStorageBuildError::UnsafePath,
            ));
        }
        let MqttV2Enrollment {
            session_id,
            requester_id,
            target_fingerprint,
            inbound_issuer,
            inbound_key_id,
            outbound_key_id,
        } = enrollment;
        let instance_id = settings.instance_id;
        let artifact_root = PathBuf::from(settings.capture_artifact_root);
        let topics = MqttV2TopicSet::new(&instance_id, &session_id, &requester_id)
            .map_err(MqttV2ProductionBuildError::Topics)?;
        let username = settings.connection.username;
        let mut secret = settings.connection.password.into_bytes();
        let credentials = MqttV2BrokerCredentials::new(username, secret.clone())
            .map_err(|_| MqttV2ProductionBuildError::Credentials)?;
        let protocol_key =
            derive_mqtt_v2_hmac_key(&secret).ok_or(MqttV2ProductionBuildError::Credentials)?;
        secret.fill(0);
        let connection = MqttV2ConnectionConfig::new(
            settings.connection.host,
            settings.connection.port,
            &instance_id,
            &session_id,
            KEEPALIVE_SECONDS,
            REQUEST_CHANNEL_CAPACITY,
            transport,
        )
        .map_err(|_| MqttV2ProductionBuildError::Connection)?
        .with_credentials(credentials);
        let crypto = Arc::new(
            MqttV2HmacCrypto::new(
                V2HmacKeySnapshot::new(inbound_issuer, inbound_key_id, protocol_key.clone())
                    .map_err(MqttV2ProductionBuildError::Crypto)?,
                V2HmacKeySnapshot::new(&instance_id, &outbound_key_id, protocol_key)
                    .map_err(MqttV2ProductionBuildError::Crypto)?,
            )
            .map_err(MqttV2ProductionBuildError::Crypto)?,
        );
        let runtime = MqttV2RuntimeConfig::new(
            connection,
            topics,
            target_fingerprint,
            target_platform,
            &instance_id,
            outbound_key_id,
            requester_id,
            RESPONSE_TTL_MS,
            REPLAY_CAPACITY,
            PREFLIGHT_MAX_AGE_MS,
            MqttV2PumpConfig::new(MAX_IN_FLIGHT)
                .map_err(|_| MqttV2ProductionBuildError::RuntimeConfig)?,
        )
        .map_err(MqttV2ProductionBuildError::Runtime)?;
        Ok(Self {
            runtime,
            crypto,
            artifact: ArtifactRuntimeConfig::new(
                artifact_root,
                &instance_id,
                ARTIFACT_CAPACITY,
                ARTIFACT_FILE_BYTES,
                ARTIFACT_TTL_MS,
            ),
            state_root,
        })
    }
}

pub trait MqttV2BootstrapClock: Send + Sync {
    fn now_ms(&self) -> i64;
}

#[derive(Debug, Default)]
pub struct SystemMqttV2BootstrapClock;

impl MqttV2BootstrapClock for SystemMqttV2BootstrapClock {
    fn now_ms(&self) -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .ok()
            .and_then(|duration| i64::try_from(duration.as_millis()).ok())
            .unwrap_or(i64::MAX)
    }
}

/// Safe default while a native non-prompting screen permission observer is
/// unavailable. It produces a typed preflight failure and never executes.
#[derive(Debug, Default)]
pub struct UnavailableScreenPermissionProbe;

impl LegacyScreenPermissionProbe for UnavailableScreenPermissionProbe {
    fn permission(&self) -> Result<PreflightPermissionState, ScreenPermissionProbeError> {
        Err(ScreenPermissionProbeError::ObservationUnavailable)
    }
}

pub struct MqttV2ProductionDependencies {
    pub backend: Arc<dyn AutomationBackend>,
    /// One canonical durable policy owner shared by command reads, admin
    /// writes, local settings projection, and restart recovery.
    pub policy: Arc<DurablePermissionPolicyRepository>,
    pub screen_permission: Arc<dyn LegacyScreenPermissionProbe>,
    pub clock: Arc<dyn MqttV2BootstrapClock>,
}

pub struct MqttV2ProductionRuntime {
    runtime: MqttV2Runtime,
}

impl MqttV2ProductionRuntime {
    pub fn request_shutdown(&self) {
        self.runtime.request_shutdown();
    }

    pub fn connection_state(&self) -> MqttV2RuntimeConnectionState {
        self.runtime.connection_state()
    }

    pub fn is_finished(&self) -> bool {
        self.runtime.is_finished()
    }

    pub async fn shutdown(
        self,
    ) -> Result<crate::mqtt_v2_command_pump::MqttV2PumpOutcome, MqttV2RuntimeShutdownError> {
        self.runtime.shutdown().await
    }

    pub async fn run_until<F>(
        self,
        shutdown_requested: F,
    ) -> Result<crate::mqtt_v2_command_pump::MqttV2PumpOutcome, MqttV2RuntimeShutdownError>
    where
        F: Future,
    {
        self.runtime.run_until(shutdown_requested).await
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MqttV2ProductionBuildError {
    Credentials,
    Connection,
    Topics(MqttV2TopicError),
    Crypto(MqttV2HmacBuildError),
    RuntimeConfig,
    Runtime(MqttV2RuntimeBuildError),
    Artifact(ArtifactRuntimeBuildError),
    StateStorage(LocalStorageBuildError),
    Terminal(DurableV2TerminalRepositoryError),
    Delivery(DurableV2DeliveryRepositoryError),
    Cancellation(DurableCancellationStoreBootstrapError),
}

pub fn start_production_mqtt_v2(
    config: MqttV2ProductionConfig,
    dependencies: MqttV2ProductionDependencies,
    runtime_lease: RuntimeLeaseGuard,
    handle: Handle,
) -> Result<MqttV2ProductionRuntime, MqttV2ProductionBuildError> {
    start_production_mqtt_v2_inner(config, dependencies, runtime_lease, handle, None)
}

/// Starts the same production runtime with opt-in bounded duration evidence.
///
/// Observation is supplied separately so the default production dependency
/// contract and every existing GUI/bootstrap caller remain unchanged.
pub fn start_production_mqtt_v2_with_stage_timing(
    config: MqttV2ProductionConfig,
    dependencies: MqttV2ProductionDependencies,
    runtime_lease: RuntimeLeaseGuard,
    handle: Handle,
    stage_timing: StageTimingRecorder,
) -> Result<MqttV2ProductionRuntime, MqttV2ProductionBuildError> {
    start_production_mqtt_v2_inner(
        config,
        dependencies,
        runtime_lease,
        handle,
        Some(stage_timing),
    )
}

fn start_production_mqtt_v2_inner(
    config: MqttV2ProductionConfig,
    dependencies: MqttV2ProductionDependencies,
    runtime_lease: RuntimeLeaseGuard,
    handle: Handle,
    stage_timing: Option<StageTimingRecorder>,
) -> Result<MqttV2ProductionRuntime, MqttV2ProductionBuildError> {
    let state_root = prepare_state_root(&config.state_root)?;
    let now_ms = dependencies.clock.now_ms();
    // Recover execution truth before artifact cleanup or MQTT activation. A
    // legacy pending record without exact recovery evidence must not permit
    // any later bootstrap side effect.
    let terminal = Arc::new(
        DurableV2TerminalRepository::bootstrap(DURABLE_CAPACITY, storage(&state_root, "terminal")?)
            .map_err(MqttV2ProductionBuildError::Terminal)?,
    );
    let delivery = Arc::new(
        DurableV2DeliveryRepository::bootstrap(DURABLE_CAPACITY, storage(&state_root, "delivery")?)
            .map_err(MqttV2ProductionBuildError::Delivery)?,
    );
    let cancellation = Arc::new(
        DurableCancellationReceiptRepository::bootstrap(
            DURABLE_CAPACITY,
            storage(&state_root, "cancellation")?,
        )
        .map_err(MqttV2ProductionBuildError::Cancellation)?,
    );
    let artifacts = ArtifactRuntimeComposition::bootstrap(config.artifact, now_ms)
        .map_err(MqttV2ProductionBuildError::Artifact)?;
    let sink = artifacts.capture_sink();
    let backend = dependencies.backend;
    let backend_capabilities = backend.capabilities();
    let capability_snapshot = V2PlatformCapabilitySnapshot::new(
        config.runtime.target_platform(),
        backend_capabilities.camera_management,
        backend_capabilities.screen_capture,
    );
    let screen_permission = dependencies.screen_permission;
    let permission_observation = Arc::new(LegacyCapturePermissionObserver::new(
        Arc::clone(&backend),
        Arc::clone(&screen_permission),
    ));
    let platform_clock = Arc::new(BootstrapClockAdapter(Arc::clone(&dependencies.clock)));
    let runtime_clock: Arc<dyn MqttV2RuntimeClock> = platform_clock.clone();
    let execution_clock: Arc<dyn ExecutionClock> = platform_clock;
    let policy_reader: Arc<dyn PermissionPolicyReader> = dependencies.policy.clone();
    let policy_admin_writer: Arc<dyn PermissionPolicyAdminWriter> = dependencies.policy;
    let mut runtime_dependencies = MqttV2RuntimeDependencies::new_with_platform_factory(
        config.crypto,
        terminal,
        delivery,
        cancellation,
        policy_reader,
        move |registry: Arc<ActiveCommandRegistry>| -> Arc<dyn PlatformCapabilityPort> {
            Arc::new(LegacyCapturePlatformAdapter::new(
                backend,
                sink,
                execution_clock,
                registry,
                screen_permission,
            ))
        },
        artifacts,
        runtime_clock,
    )
    .with_policy_admin_writer(policy_admin_writer)
    .with_capability_snapshot(capability_snapshot)
    .with_permission_observation(permission_observation);
    if let Some(stage_timing) = stage_timing {
        runtime_dependencies = runtime_dependencies.with_stage_timing(stage_timing);
    }
    let runtime = start_mqtt_v2_runtime_on_handle_with_guard(
        config.runtime,
        runtime_dependencies,
        handle,
        Some(Box::new(runtime_lease)),
    )
    .map_err(MqttV2ProductionBuildError::Runtime)?;
    Ok(MqttV2ProductionRuntime { runtime })
}

struct BootstrapClockAdapter(Arc<dyn MqttV2BootstrapClock>);

impl MqttV2RuntimeClock for BootstrapClockAdapter {
    fn now_ms(&self) -> i64 {
        self.0.now_ms()
    }
}

impl ExecutionClock for BootstrapClockAdapter {
    fn now_ms(&self) -> i64 {
        self.0.now_ms()
    }
}

fn prepare_state_root(root: &Path) -> Result<PathBuf, MqttV2ProductionBuildError> {
    fs::create_dir_all(root).map_err(|_| {
        MqttV2ProductionBuildError::StateStorage(LocalStorageBuildError::Unavailable)
    })?;
    let metadata = fs::symlink_metadata(root).map_err(|_| {
        MqttV2ProductionBuildError::StateStorage(LocalStorageBuildError::Unavailable)
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(MqttV2ProductionBuildError::StateStorage(
            LocalStorageBuildError::UnsafePath,
        ));
    }
    root.canonicalize()
        .map_err(|_| MqttV2ProductionBuildError::StateStorage(LocalStorageBuildError::Unavailable))
}

fn storage(
    root: &Path,
    name: &str,
) -> Result<Arc<dyn DurableRecordStorage>, MqttV2ProductionBuildError> {
    AtomicLocalStorage::open(
        root.join(format!("{name}.json")),
        root.join(format!("{name}.lock")),
        DURABLE_FILE_BYTES,
    )
    .map(|storage| Arc::new(storage) as Arc<dyn DurableRecordStorage>)
    .map_err(MqttV2ProductionBuildError::StateStorage)
}
