use std::sync::Arc;
use std::sync::mpsc::Receiver;

use tokio::runtime::Handle;

use crate::artifact_runtime_composition::{
    ArtifactRuntimeBuildError, ArtifactRuntimeComposition, ArtifactRuntimeConfig,
};
use crate::authorization::AuthorizationClock;
use crate::authorization_bootstrap::{
    AuthorizationBootstrapError, AuthorizationBootstrapInput, build_side_effect_admission,
};
use crate::automation::{AutomationBackend, AutomationCapabilities};
use crate::completed_idempotency::{
    CompletedResponseRepository, CompletedResponseStore, CompletedStoreBuildError,
    DurableCompletedRecordStore,
};
use crate::durable_cancellation::DurableCancellationReceiptStore;
use crate::instance_process_lease::RuntimeLeaseGuard;
use crate::lifecycle::SharedLifecycleState;
use crate::managed_request::ManagedRequestService;
use crate::mqtt::{MqttRuntimeHandle, RuntimeEvent, start_runtime_with_dispatcher_and_transport};
use crate::mqtt_transport::MqttTransportSecurity;
use crate::request_dispatcher::{DispatchBuildError, DispatchConfig, TokioRequestDispatcher};
use crate::runtime::{
    DurableRecoveryDependencies, DurableResponseArchive, DurableResponseResolver,
    RuntimeBuildError, RuntimeConfig, RuntimeSupervisor,
};
use crate::runtime_host::{RuntimeHostConfig, RuntimeHostError, TokioRuntimeHost};
use crate::settings::YeonjangSettings;

const PRODUCTION_MAX_IN_FLIGHT: usize = 8;
const PRODUCTION_MAX_PENDING: usize = 32;
const PRODUCTION_COMPLETED_CAPACITY: usize = 1_024;
const PRODUCTION_ARTIFACT_LIFECYCLE_CAPACITY: usize = 1_024;
const PRODUCTION_ARTIFACT_STORAGE_MAX_BYTES: usize = 16 * 1024 * 1024;
const PRODUCTION_ARTIFACT_TTL_MS: i64 = 10 * 60_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ManagedRuntimeConfig {
    pub host: RuntimeHostConfig,
    pub runtime: RuntimeConfig,
    pub dispatch: DispatchConfig,
    pub completed_capacity: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ManagedRuntimeWorkConfig {
    pub runtime: RuntimeConfig,
    pub dispatch: DispatchConfig,
    pub completed_capacity: usize,
}

pub fn production_managed_work_config() -> ManagedRuntimeWorkConfig {
    ManagedRuntimeWorkConfig {
        runtime: RuntimeConfig {
            max_in_flight: PRODUCTION_MAX_IN_FLIGHT,
        },
        dispatch: DispatchConfig {
            max_pending: PRODUCTION_MAX_PENDING,
        },
        completed_capacity: PRODUCTION_COMPLETED_CAPACITY,
    }
}

pub fn production_managed_runtime_config() -> ManagedRuntimeConfig {
    let work = production_managed_work_config();
    ManagedRuntimeConfig {
        host: RuntimeHostConfig {
            worker_threads: 2,
            max_blocking_threads: PRODUCTION_MAX_IN_FLIGHT,
        },
        runtime: work.runtime,
        dispatch: work.dispatch,
        completed_capacity: work.completed_capacity,
    }
}

pub struct ManagedRuntimeDependencies {
    settings: YeonjangSettings,
    backend: Arc<dyn AutomationBackend>,
    authorization: AuthorizationBootstrapInput,
    clock: Arc<dyn AuthorizationClock>,
    mqtt_transport: MqttTransportSecurity,
    durable: Option<ManagedDurableDependencies>,
    runtime_lease: RuntimeLeaseGuard,
}

pub struct ManagedDurableDependencies {
    records: Arc<dyn DurableCompletedRecordStore>,
    resolver: Arc<dyn DurableResponseResolver>,
    archive: Arc<dyn DurableResponseArchive>,
    cancellations: Option<Arc<dyn DurableCancellationReceiptStore>>,
}

impl ManagedDurableDependencies {
    pub fn new(
        records: Arc<dyn DurableCompletedRecordStore>,
        resolver: Arc<dyn DurableResponseResolver>,
        archive: Arc<dyn DurableResponseArchive>,
    ) -> Self {
        Self {
            records,
            resolver,
            archive,
            cancellations: None,
        }
    }

    pub fn with_cancellations(
        mut self,
        cancellations: Arc<dyn DurableCancellationReceiptStore>,
    ) -> Self {
        self.cancellations = Some(cancellations);
        self
    }
}

impl ManagedRuntimeDependencies {
    pub fn new(
        settings: YeonjangSettings,
        backend: Arc<dyn AutomationBackend>,
        authorization: AuthorizationBootstrapInput,
        clock: Arc<dyn AuthorizationClock>,
        runtime_lease: RuntimeLeaseGuard,
    ) -> Self {
        Self {
            settings,
            backend,
            authorization,
            clock,
            mqtt_transport: MqttTransportSecurity::LoopbackPlaintext,
            durable: None,
            runtime_lease,
        }
    }

    pub fn new_with_durable(
        settings: YeonjangSettings,
        backend: Arc<dyn AutomationBackend>,
        authorization: AuthorizationBootstrapInput,
        clock: Arc<dyn AuthorizationClock>,
        durable: ManagedDurableDependencies,
        runtime_lease: RuntimeLeaseGuard,
    ) -> Self {
        Self {
            settings,
            backend,
            authorization,
            clock,
            mqtt_transport: MqttTransportSecurity::LoopbackPlaintext,
            durable: Some(durable),
            runtime_lease,
        }
    }

    pub fn with_mqtt_transport(mut self, mqtt_transport: MqttTransportSecurity) -> Self {
        self.mqtt_transport = mqtt_transport;
        self
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ManagedRuntimeBuildError {
    Artifact(ArtifactRuntimeBuildError),
    Authorization(AuthorizationBootstrapError),
    CompletedStore(CompletedStoreBuildError),
    Supervisor(RuntimeBuildError),
    Host(RuntimeHostError),
    Dispatcher(DispatchBuildError),
}

pub struct ManagedRuntime {
    settings: YeonjangSettings,
    capability_snapshot: AutomationCapabilities,
    host: ManagedRuntimeHost,
    dispatcher: TokioRequestDispatcher,
    mqtt_transport: MqttTransportSecurity,
    _artifacts: ArtifactRuntimeComposition,
    _runtime_lease: RuntimeLeaseGuard,
}

enum ManagedRuntimeHost {
    Owned(TokioRuntimeHost),
    Shared,
}

impl std::fmt::Debug for ManagedRuntime {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("ManagedRuntime")
            .field("running", &true)
            .finish()
    }
}

impl ManagedRuntime {
    pub fn dispatcher(&self) -> TokioRequestDispatcher {
        self.dispatcher.clone()
    }

    pub async fn shutdown(self) {
        let Self {
            settings: _,
            capability_snapshot: _,
            host,
            dispatcher,
            mqtt_transport: _,
            _artifacts: _,
            _runtime_lease: _,
        } = self;
        dispatcher.shutdown().await;
        drop(dispatcher);
        drop(host);
    }

    pub fn start_mqtt(
        self,
        lifecycle_state: SharedLifecycleState,
    ) -> Result<(ManagedMqttRuntime, Receiver<RuntimeEvent>), ManagedMqttStartError> {
        match start_runtime_with_dispatcher_and_transport(
            self.settings.clone(),
            lifecycle_state,
            self.dispatcher(),
            self.mqtt_transport.clone(),
            self.capability_snapshot.clone(),
        ) {
            Ok((mqtt, events)) => Ok((
                ManagedMqttRuntime {
                    managed: self,
                    mqtt,
                },
                events,
            )),
            Err(_) => Err(ManagedMqttStartError::ConnectionStartFailed),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ManagedMqttStartError {
    ConnectionStartFailed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ManagedMqttShutdownError {
    ConnectionStopFailed,
    BlockingShutdownRequiresOwnedHost,
}

pub struct ManagedMqttRuntime {
    managed: ManagedRuntime,
    mqtt: MqttRuntimeHandle,
}

impl std::fmt::Debug for ManagedMqttRuntime {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("ManagedMqttRuntime")
            .field("running", &true)
            .finish()
    }
}

impl ManagedMqttRuntime {
    pub fn refresh_presence(&self, message: &str) -> anyhow::Result<()> {
        self.mqtt.refresh_presence(message)
    }

    pub fn request_shutdown(&self) {
        self.mqtt.request_stop();
    }

    pub fn shutdown_blocking(self) -> Result<(), ManagedMqttShutdownError> {
        let Self { managed, mqtt } = self;
        let ManagedRuntime {
            settings: _,
            capability_snapshot: _,
            host,
            dispatcher,
            mqtt_transport: _,
            _artifacts: _,
            _runtime_lease: _,
        } = managed;
        let ManagedRuntimeHost::Owned(host) = host else {
            return Err(ManagedMqttShutdownError::BlockingShutdownRequiresOwnedHost);
        };
        let mqtt_result = host.block_on(mqtt.stop_async());
        host.block_on(dispatcher.shutdown());
        drop(dispatcher);
        drop(host);
        mqtt_result.map_err(|_| ManagedMqttShutdownError::ConnectionStopFailed)
    }

    pub async fn shutdown(self) -> Result<(), ManagedMqttShutdownError> {
        let Self { managed, mqtt } = self;
        let mqtt_result = mqtt.stop_async().await;
        managed.shutdown().await;
        mqtt_result.map_err(|_| ManagedMqttShutdownError::ConnectionStopFailed)
    }
}

pub fn build_managed_runtime(
    config: ManagedRuntimeConfig,
    dependencies: ManagedRuntimeDependencies,
) -> Result<ManagedRuntime, ManagedRuntimeBuildError> {
    let host = TokioRuntimeHost::acquire(config.host).map_err(ManagedRuntimeBuildError::Host)?;
    let handle = host.handle();
    build_managed_runtime_with_handle(
        ManagedRuntimeWorkConfig {
            runtime: config.runtime,
            dispatch: config.dispatch,
            completed_capacity: config.completed_capacity,
        },
        dependencies,
        handle,
        ManagedRuntimeHost::Owned(host),
    )
}

pub fn build_managed_runtime_on_handle(
    config: ManagedRuntimeWorkConfig,
    dependencies: ManagedRuntimeDependencies,
    handle: Handle,
) -> Result<ManagedRuntime, ManagedRuntimeBuildError> {
    build_managed_runtime_with_handle(config, dependencies, handle, ManagedRuntimeHost::Shared)
}

fn build_managed_runtime_with_handle(
    config: ManagedRuntimeWorkConfig,
    dependencies: ManagedRuntimeDependencies,
    handle: Handle,
    host: ManagedRuntimeHost,
) -> Result<ManagedRuntime, ManagedRuntimeBuildError> {
    let ManagedRuntimeDependencies {
        settings,
        backend,
        authorization,
        clock,
        mqtt_transport,
        durable,
        runtime_lease,
    } = dependencies;
    let capability_snapshot = backend.capabilities();
    let admission = build_side_effect_admission(authorization, Arc::clone(&clock))
        .map_err(ManagedRuntimeBuildError::Authorization)?;
    // Artifact recovery is an activation gate. The same concrete store is
    // retained for capture now and for v2 transfer/ACK composition.
    let artifacts = ArtifactRuntimeComposition::bootstrap(
        ArtifactRuntimeConfig::new(
            &settings.capture_artifact_root,
            &settings.instance_id,
            PRODUCTION_ARTIFACT_LIFECYCLE_CAPACITY,
            PRODUCTION_ARTIFACT_STORAGE_MAX_BYTES,
            PRODUCTION_ARTIFACT_TTL_MS,
        ),
        clock.now_ms(),
    )
    .map_err(ManagedRuntimeBuildError::Artifact)?;
    let artifact_sink = artifacts.capture_sink();
    let completed: Arc<dyn CompletedResponseStore> = Arc::new(
        CompletedResponseRepository::new(config.completed_capacity)
            .map_err(ManagedRuntimeBuildError::CompletedStore)?,
    );
    let supervisor = match durable {
        Some(durable) => {
            let mut recovery = DurableRecoveryDependencies::new_with_persistence(
                durable.records,
                durable.resolver,
                durable.archive,
                Arc::clone(&clock),
            );
            if let Some(cancellations) = durable.cancellations {
                recovery = recovery.with_cancellations(cancellations, clock);
            }
            RuntimeSupervisor::new_with_admission_completed_recovery_and_artifact_sink(
                config.runtime,
                settings.clone(),
                backend,
                admission,
                completed,
                recovery,
                artifact_sink,
            )
        }
        None => RuntimeSupervisor::new_with_admission_completed_and_artifact_sink(
            config.runtime,
            settings.clone(),
            backend,
            admission,
            completed,
            artifact_sink,
        ),
    }
    .map_err(ManagedRuntimeBuildError::Supervisor)?;
    let dispatcher = TokioRequestDispatcher::new(
        config.dispatch,
        handle,
        ManagedRequestService::new(supervisor),
    )
    .map_err(ManagedRuntimeBuildError::Dispatcher)?;

    Ok(ManagedRuntime {
        settings,
        capability_snapshot,
        host,
        dispatcher,
        mqtt_transport,
        _artifacts: artifacts,
        _runtime_lease: runtime_lease,
    })
}
