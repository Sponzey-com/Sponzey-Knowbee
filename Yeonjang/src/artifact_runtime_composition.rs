//! Production composition for the capture artifact execution boundary.
//!
//! Configuration is resolved once by the caller. This module opens one
//! instance-scoped filesystem owner and one durable lifecycle repository, then
//! shares those exact objects with capture, transfer and cleanup. Recovery is a
//! startup gate: a deferred cleanup prevents MQTT activation.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use sha2::{Digest, Sha256};

use crate::artifact_cleanup::{ArtifactCleanupRecoveryReport, ArtifactCleanupUseCase};
use crate::artifact_registration::{ArtifactRegistrationBuildError, ArtifactRegistrationUseCase};
use crate::artifact_repository::{
    ArtifactLifecycleStore, ArtifactRepositoryBootstrapError, DurableArtifactLifecycleRepository,
};
use crate::artifact_sink::{
    CaptureArtifactError, CaptureArtifactSink, FilesystemCaptureArtifactSink,
    configured_filesystem_artifact_store,
};
use crate::artifact_transfer_use_case::{ArtifactTransferUseCase, VerifiedArtifactSource};
use crate::atomic_local_storage::{AtomicLocalStorage, LocalStorageBuildError};
use crate::authorization::AuthorizationReplayGuard;
use crate::mqtt_v2_artifact_adapter::MqttV2ArtifactAdapter;
use crate::mqtt_v2_artifact_cleanup::MqttV2ArtifactCleanupAdapter;
use crate::mqtt_v2_command_pump::MqttV2PumpDependencies;
use crate::mqtt_v2_control_router::{MqttV2ControlRouter, MqttV2ControlRouterBuildError};
use crate::mqtt_v2_direct_handler::MqttV2CommandHandler;
use crate::mqtt_v2_topics::MqttV2TopicSet;
use crate::protocol_v2_artifact::V2ArtifactSignatureVerifier;
use crate::protocol_v2_terminal::V2ResponseSigner;

const STATE_DIRECTORY: &str = ".artifact-state-v2";
const STATE_FILE: &str = "lifecycle.json";
const STATE_LOCK_FILE: &str = "lifecycle.lock";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArtifactRuntimeConfig {
    configured_root: PathBuf,
    instance_id: String,
    lifecycle_capacity: usize,
    max_storage_bytes: usize,
    artifact_ttl_ms: i64,
}

impl ArtifactRuntimeConfig {
    pub fn new(
        configured_root: impl AsRef<Path>,
        instance_id: impl Into<String>,
        lifecycle_capacity: usize,
        max_storage_bytes: usize,
        artifact_ttl_ms: i64,
    ) -> Self {
        Self {
            configured_root: configured_root.as_ref().to_path_buf(),
            instance_id: instance_id.into(),
            lifecycle_capacity,
            max_storage_bytes,
            artifact_ttl_ms,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArtifactRuntimeBuildError {
    ArtifactRoot(CaptureArtifactError),
    Storage(LocalStorageBuildError),
    Repository(ArtifactRepositoryBootstrapError),
    Registration(ArtifactRegistrationBuildError),
    RecoveryDeferred { count: usize },
}

pub struct ArtifactRuntimeComposition {
    artifact_store: Arc<FilesystemCaptureArtifactSink>,
    lifecycle_store: Arc<DurableArtifactLifecycleRepository>,
    transfer: Arc<ArtifactTransferUseCase>,
    registration: Arc<ArtifactRegistrationUseCase>,
    cleanup: Arc<MqttV2ArtifactCleanupAdapter>,
    recovery_report: ArtifactCleanupRecoveryReport,
}

impl ArtifactRuntimeComposition {
    pub fn bootstrap(
        config: ArtifactRuntimeConfig,
        now_ms: i64,
    ) -> Result<Self, ArtifactRuntimeBuildError> {
        let artifact_store =
            configured_filesystem_artifact_store(&config.configured_root, &config.instance_id)
                .map_err(ArtifactRuntimeBuildError::ArtifactRoot)?;
        let state_root = state_root(&config)?;
        std::fs::create_dir_all(&state_root)
            .map_err(|_| ArtifactRuntimeBuildError::Storage(LocalStorageBuildError::Unavailable))?;
        let storage = Arc::new(
            AtomicLocalStorage::open(
                state_root.join(STATE_FILE),
                state_root.join(STATE_LOCK_FILE),
                config.max_storage_bytes,
            )
            .map_err(ArtifactRuntimeBuildError::Storage)?,
        );
        let lifecycle_store = Arc::new(
            DurableArtifactLifecycleRepository::bootstrap(config.lifecycle_capacity, storage)
                .map_err(ArtifactRuntimeBuildError::Repository)?,
        );

        let lifecycle_port: Arc<dyn ArtifactLifecycleStore> = lifecycle_store.clone();
        let source: Arc<dyn VerifiedArtifactSource> = artifact_store.clone();
        let cleanup_port: Arc<dyn crate::artifact_cleanup::ArtifactCleanupPort> =
            artifact_store.clone();
        let transfer = Arc::new(ArtifactTransferUseCase::new(
            Arc::clone(&lifecycle_port),
            source,
        ));
        let registration = Arc::new(
            ArtifactRegistrationUseCase::new(Arc::clone(&lifecycle_port), config.artifact_ttl_ms)
                .map_err(ArtifactRuntimeBuildError::Registration)?,
        );
        let inventory: Arc<dyn crate::artifact_cleanup::ArtifactInventoryPort> =
            artifact_store.clone();
        let cleanup_use_case = Arc::new(
            ArtifactCleanupUseCase::new(lifecycle_port, cleanup_port).with_inventory(inventory),
        );
        let cleanup = Arc::new(MqttV2ArtifactCleanupAdapter::new(cleanup_use_case));
        let recovery_report = cleanup.recover(now_ms);
        if recovery_report.deferred > 0 {
            return Err(ArtifactRuntimeBuildError::RecoveryDeferred {
                count: recovery_report.deferred,
            });
        }

        Ok(Self {
            artifact_store,
            lifecycle_store,
            transfer,
            registration,
            cleanup,
            recovery_report,
        })
    }

    pub fn capture_sink(&self) -> Arc<dyn CaptureArtifactSink> {
        self.artifact_store.clone()
    }

    pub fn artifact_store(&self) -> Arc<FilesystemCaptureArtifactSink> {
        Arc::clone(&self.artifact_store)
    }

    pub fn lifecycle_store(&self) -> Arc<DurableArtifactLifecycleRepository> {
        Arc::clone(&self.lifecycle_store)
    }

    pub fn transfer_use_case(&self) -> Arc<ArtifactTransferUseCase> {
        Arc::clone(&self.transfer)
    }

    pub fn registration_use_case(&self) -> Arc<ArtifactRegistrationUseCase> {
        Arc::clone(&self.registration)
    }

    pub fn attach_handler(&self, handler: MqttV2CommandHandler) -> MqttV2CommandHandler {
        handler.with_artifact_registration(Arc::clone(&self.registration))
    }

    pub fn recovery_report(&self) -> ArtifactCleanupRecoveryReport {
        self.recovery_report
    }

    /// Adds the artifact control lane to the already-validated v2 router.
    pub fn attach_router(
        &self,
        router: MqttV2ControlRouter,
        topics: MqttV2TopicSet,
        verifier: Arc<dyn V2ArtifactSignatureVerifier>,
        replay: Arc<dyn AuthorizationReplayGuard>,
        response_signer: Arc<dyn V2ResponseSigner>,
    ) -> Result<MqttV2ControlRouter, MqttV2ControlRouterBuildError> {
        router.with_artifact(MqttV2ArtifactAdapter::new(
            topics,
            verifier,
            replay,
            Arc::clone(&self.transfer),
            response_signer,
        ))
    }

    /// Adds the same cleanup owner used at startup to the MQTT ACK path.
    pub fn attach_pump(&self, dependencies: MqttV2PumpDependencies) -> MqttV2PumpDependencies {
        dependencies.with_artifact_cleanup(self.cleanup.clone())
    }
}

fn state_root(config: &ArtifactRuntimeConfig) -> Result<PathBuf, ArtifactRuntimeBuildError> {
    let configured_root = std::fs::canonicalize(&config.configured_root)
        .map_err(|_| ArtifactRuntimeBuildError::ArtifactRoot(CaptureArtifactError::InvalidRoot))?;
    let mut digest = Sha256::new();
    digest.update(b"instance");
    digest.update([0]);
    digest.update(config.instance_id.as_bytes());
    Ok(configured_root
        .join(STATE_DIRECTORY)
        .join(format!("{:x}", digest.finalize())))
}
