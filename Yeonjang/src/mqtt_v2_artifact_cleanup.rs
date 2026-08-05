//! Infrastructure bridge from MQTT ack handoff to canonical cleanup use case.

use std::sync::Arc;

use crate::artifact_cleanup::{
    ArtifactCleanupOutcome, ArtifactCleanupRecoveryReport, ArtifactCleanupUseCase,
};
use crate::mqtt_v2_artifact_adapter::ArtifactCleanupRequest;
use crate::mqtt_v2_command_pump::{MqttV2ArtifactCleanupError, MqttV2ArtifactCleanupSink};

pub struct MqttV2ArtifactCleanupAdapter {
    use_case: Arc<ArtifactCleanupUseCase>,
}

impl MqttV2ArtifactCleanupAdapter {
    pub fn new(use_case: Arc<ArtifactCleanupUseCase>) -> Self {
        Self { use_case }
    }

    pub fn recover(&self, now_ms: i64) -> ArtifactCleanupRecoveryReport {
        self.use_case.recover(now_ms)
    }
}

impl MqttV2ArtifactCleanupSink for MqttV2ArtifactCleanupAdapter {
    fn request_cleanup(
        &self,
        request: ArtifactCleanupRequest,
    ) -> Result<(), MqttV2ArtifactCleanupError> {
        match self.use_case.cleanup(
            request.artifact_ref(),
            request.lifecycle_revision(),
            request.acknowledged_at_ms(),
        ) {
            ArtifactCleanupOutcome::Completed { .. }
            | ArtifactCleanupOutcome::AlreadyCompleted { .. } => Ok(()),
            ArtifactCleanupOutcome::Deferred { .. } | ArtifactCleanupOutcome::Rejected { .. } => {
                Err(MqttV2ArtifactCleanupError::Unavailable)
            }
        }
    }
}
