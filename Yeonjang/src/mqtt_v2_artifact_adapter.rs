//! MQTT boundary adapter for artifact fetch, chunk publication and consumer ack.
//!
//! This adapter does not own an MQTT event loop. It prepares bounded publishes,
//! then requires the outer transport owner to report whether every enqueue
//! succeeded before the canonical lifecycle may enter `awaiting_ack`.

use std::fmt;
use std::sync::Arc;

use crate::artifact_transfer::{
    ArtifactChunkConfig, ArtifactChunkError, encode_artifact_chunk_frame,
};
use crate::artifact_transfer_use_case::{
    ArtifactAckCommand, ArtifactAckResult, ArtifactCancelCommand, ArtifactCancelResult,
    ArtifactFetchCommand, ArtifactFetchResult, ArtifactPublishCommand,
    ArtifactPublishFailureResult, ArtifactPublishResult, ArtifactTransferReject,
    ArtifactTransferUseCase,
};
use crate::authorization::AuthorizationReplayGuard;
use crate::mqtt_v2_response_adapter::{MAX_V2_RESPONSE_BYTES, MqttV2ResponsePublish};
use crate::mqtt_v2_topics::{MqttQos, MqttV2TopicSet, RoutedInboundTopic};
use crate::protocol_v2_artifact::{
    V2ArtifactAdmission, V2ArtifactAdmissionError, V2ArtifactAdmissionOutcome,
    V2ArtifactControlKind, V2ArtifactParseError, V2ArtifactSignatureVerifier,
    parse_v2_artifact_control,
};
use crate::protocol_v2_artifact_cancel_response::V2ArtifactCancelResponseEnvelope;
use crate::protocol_v2_artifact_fetch_response::V2ArtifactFetchResponseEnvelope;
use crate::protocol_v2_terminal::{V2ResponseSigner, V2ResponseSigningContext};

#[derive(Clone, PartialEq, Eq)]
pub struct MqttV2InboundArtifactControl {
    pub topic: String,
    pub payload: Vec<u8>,
    pub retained: bool,
}

impl fmt::Debug for MqttV2InboundArtifactControl {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("MqttV2InboundArtifactControl")
            .field("topic", &self.topic)
            .field("payload", &"[REDACTED]")
            .field("retained", &self.retained)
            .finish()
    }
}

#[derive(Clone, PartialEq, Eq)]
pub struct MqttV2ArtifactChunkPublish {
    pub topic: String,
    pub payload: Vec<u8>,
    pub qos: MqttQos,
    pub retained: bool,
}

impl fmt::Debug for MqttV2ArtifactChunkPublish {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("MqttV2ArtifactChunkPublish")
            .field("topic", &self.topic)
            .field("payload", &"[REDACTED]")
            .field("qos", &self.qos)
            .field("retained", &self.retained)
            .finish()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArtifactPublicationCompletion {
    artifact_ref: String,
    transfer_id: String,
    chunk_count: u32,
    expected_revision: u64,
}

impl ArtifactPublicationCompletion {
    pub fn artifact_ref(&self) -> &str {
        &self.artifact_ref
    }

    pub fn transfer_id(&self) -> &str {
        &self.transfer_id
    }

    #[cfg(test)]
    pub(crate) fn test_fixture(artifact_ref: &str, transfer_id: &str) -> Self {
        Self {
            artifact_ref: artifact_ref.to_string(),
            transfer_id: transfer_id.to_string(),
            chunk_count: 1,
            expected_revision: 1,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArtifactPublicationCompletionResult {
    Published(ArtifactPublishResult),
    Failed(ArtifactPublishFailureResult),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MqttV2ArtifactRejection {
    Parse(V2ArtifactParseError),
    Admission(V2ArtifactAdmissionError),
    Transfer(ArtifactTransferReject),
    Frame(ArtifactChunkError),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArtifactCleanupRequest {
    artifact_ref: String,
    transfer_id: String,
    lifecycle_revision: u64,
    acknowledged_at_ms: i64,
}

impl ArtifactCleanupRequest {
    pub fn artifact_ref(&self) -> &str {
        &self.artifact_ref
    }

    pub fn transfer_id(&self) -> &str {
        &self.transfer_id
    }

    pub fn lifecycle_revision(&self) -> u64 {
        self.lifecycle_revision
    }

    pub fn acknowledged_at_ms(&self) -> i64 {
        self.acknowledged_at_ms
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MqttV2ArtifactAdapterResult {
    Prepared {
        publishes: Vec<MqttV2ArtifactChunkPublish>,
        completion: ArtifactPublicationCompletion,
    },
    Acknowledged {
        result: ArtifactAckResult,
        cleanup: Option<ArtifactCleanupRequest>,
    },
    Cancelled {
        result: ArtifactCancelResult,
        artifact_ref: String,
        transfer_id: String,
        response: MqttV2ResponsePublish,
    },
    FetchRejected {
        reason: ArtifactTransferReject,
        response: MqttV2ResponsePublish,
    },
    Rejected(MqttV2ArtifactRejection),
    ResponseSigningFailed,
}

pub struct MqttV2ArtifactAdapter {
    topics: MqttV2TopicSet,
    verifier: Arc<dyn V2ArtifactSignatureVerifier>,
    replay: Arc<dyn AuthorizationReplayGuard>,
    use_case: Arc<ArtifactTransferUseCase>,
    response_signer: Arc<dyn V2ResponseSigner>,
}

impl MqttV2ArtifactAdapter {
    pub fn new(
        topics: MqttV2TopicSet,
        verifier: Arc<dyn V2ArtifactSignatureVerifier>,
        replay: Arc<dyn AuthorizationReplayGuard>,
        use_case: Arc<ArtifactTransferUseCase>,
        response_signer: Arc<dyn V2ResponseSigner>,
    ) -> Self {
        Self {
            topics,
            verifier,
            replay,
            use_case,
            response_signer,
        }
    }

    pub fn process(
        &self,
        inbound: MqttV2InboundArtifactControl,
        now_ms: i64,
        signing_context: V2ResponseSigningContext,
    ) -> MqttV2ArtifactAdapterResult {
        let envelope = match parse_v2_artifact_control(
            &inbound.topic,
            &inbound.payload,
            inbound.retained,
            now_ms,
            &self.topics,
        ) {
            Ok(envelope) => envelope,
            Err(reason) => {
                return MqttV2ArtifactAdapterResult::Rejected(MqttV2ArtifactRejection::Parse(
                    reason,
                ));
            }
        };
        let admission = V2ArtifactAdmission::new(self.verifier.as_ref(), self.replay.as_ref());
        match admission.admit_or_replay(&envelope, now_ms) {
            Ok(
                V2ArtifactAdmissionOutcome::Fresh(_)
                | V2ArtifactAdmissionOutcome::VerifiedReplay(_),
            ) => {}
            Err(reason) => {
                return MqttV2ArtifactAdapterResult::Rejected(MqttV2ArtifactRejection::Admission(
                    reason,
                ));
            }
        };
        match envelope.kind() {
            V2ArtifactControlKind::Fetch => self.prepare_fetch(&envelope, now_ms, signing_context),
            V2ArtifactControlKind::Ack => self.acknowledge(&envelope, now_ms),
            V2ArtifactControlKind::Cancel => self.cancel(&envelope, now_ms, signing_context),
        }
    }

    /// Called by the MQTT owner only after it has attempted every prepared
    /// chunk enqueue. A partial enqueue is a failed publication.
    pub fn complete_publication(
        &self,
        completion: ArtifactPublicationCompletion,
        all_chunks_enqueued: bool,
        now_ms: i64,
    ) -> ArtifactPublicationCompletionResult {
        let command = ArtifactPublishCommand::new(
            completion.artifact_ref,
            completion.transfer_id,
            completion.chunk_count,
            completion.expected_revision,
            now_ms,
        );
        if all_chunks_enqueued {
            ArtifactPublicationCompletionResult::Published(self.use_case.record_published(&command))
        } else {
            ArtifactPublicationCompletionResult::Failed(
                self.use_case.record_publish_failed(&command),
            )
        }
    }

    pub fn control_topic(&self) -> String {
        self.topics.control()
    }

    pub fn artifact_ack_filter(&self) -> String {
        self.topics.artifact_ack_filter()
    }

    pub fn accepts_ack_topic(&self, topic: &str) -> bool {
        matches!(
            self.topics.route_inbound(topic),
            Ok(RoutedInboundTopic::ArtifactAck { .. })
        )
    }

    fn prepare_fetch(
        &self,
        envelope: &crate::protocol_v2_artifact::V2ArtifactEnvelope,
        now_ms: i64,
        signing_context: V2ResponseSigningContext,
    ) -> MqttV2ArtifactAdapterResult {
        let Some(chunk_payload_bytes) = envelope.chunk_payload_bytes() else {
            return MqttV2ArtifactAdapterResult::Rejected(MqttV2ArtifactRejection::Parse(
                V2ArtifactParseError::UnknownOrInvalidField,
            ));
        };
        let chunk_config = match ArtifactChunkConfig::new(chunk_payload_bytes as usize) {
            Ok(config) => config,
            Err(reason) => {
                return MqttV2ArtifactAdapterResult::Rejected(MqttV2ArtifactRejection::Frame(
                    reason,
                ));
            }
        };
        let command = ArtifactFetchCommand::new(
            envelope.artifact_ref(),
            envelope.requester_id(),
            envelope.owner_request_id(),
            envelope.owner_operation_id(),
            envelope.transfer_id(),
            envelope.expected_revision(),
            now_ms,
            chunk_config,
        );
        let (chunks, lifecycle_revision) = match self.use_case.prepare_fetch(&command) {
            ArtifactFetchResult::Prepared {
                chunks,
                lifecycle_revision,
            } => (chunks, lifecycle_revision),
            ArtifactFetchResult::Rejected { reason } => {
                return self.fetch_rejection(envelope, reason, signing_context);
            }
        };
        let chunk_count = u32::try_from(chunks.len()).unwrap_or(u32::MAX);
        let topic = match self.topics.artifact_chunk(envelope.transfer_id()) {
            Ok(topic) => topic,
            Err(_) => {
                return MqttV2ArtifactAdapterResult::Rejected(MqttV2ArtifactRejection::Parse(
                    V2ArtifactParseError::TopicMismatch,
                ));
            }
        };
        let mut publishes = Vec::with_capacity(chunks.len());
        for chunk in chunks {
            let payload = match encode_artifact_chunk_frame(&chunk) {
                Ok(payload) => payload,
                Err(reason) => {
                    let completion = ArtifactPublicationCompletion {
                        artifact_ref: envelope.artifact_ref().to_string(),
                        transfer_id: envelope.transfer_id().to_string(),
                        chunk_count,
                        expected_revision: lifecycle_revision,
                    };
                    let _ = self.complete_publication(completion, false, now_ms);
                    return MqttV2ArtifactAdapterResult::Rejected(MqttV2ArtifactRejection::Frame(
                        reason,
                    ));
                }
            };
            publishes.push(MqttV2ArtifactChunkPublish {
                topic: topic.clone(),
                payload,
                qos: MqttQos::AtLeastOnce,
                retained: false,
            });
        }
        MqttV2ArtifactAdapterResult::Prepared {
            publishes,
            completion: ArtifactPublicationCompletion {
                artifact_ref: envelope.artifact_ref().to_string(),
                transfer_id: envelope.transfer_id().to_string(),
                chunk_count,
                expected_revision: lifecycle_revision,
            },
        }
    }

    fn fetch_rejection(
        &self,
        envelope: &crate::protocol_v2_artifact::V2ArtifactEnvelope,
        reason: ArtifactTransferReject,
        signing_context: V2ResponseSigningContext,
    ) -> MqttV2ArtifactAdapterResult {
        let response = match V2ArtifactFetchResponseEnvelope::sign_rejection(
            envelope,
            reason,
            signing_context,
            self.response_signer.as_ref(),
        ) {
            Ok(response) => response,
            Err(_) => return MqttV2ArtifactAdapterResult::ResponseSigningFailed,
        };
        let payload = match serde_json::to_vec(&response) {
            Ok(payload) if payload.len() <= MAX_V2_RESPONSE_BYTES => payload,
            Ok(_) | Err(_) => return MqttV2ArtifactAdapterResult::ResponseSigningFailed,
        };
        MqttV2ArtifactAdapterResult::FetchRejected {
            reason,
            response: MqttV2ResponsePublish {
                topic: self.topics.response(),
                payload,
                qos: MqttQos::AtLeastOnce,
                retained: false,
                delivery_receipt: None,
            },
        }
    }

    fn acknowledge(
        &self,
        envelope: &crate::protocol_v2_artifact::V2ArtifactEnvelope,
        now_ms: i64,
    ) -> MqttV2ArtifactAdapterResult {
        let Some(full_digest) = envelope.full_digest() else {
            return MqttV2ArtifactAdapterResult::Rejected(MqttV2ArtifactRejection::Parse(
                V2ArtifactParseError::UnknownOrInvalidField,
            ));
        };
        let artifact_ref = envelope.artifact_ref().to_string();
        let transfer_id = envelope.transfer_id().to_string();
        let result = self.use_case.acknowledge(&ArtifactAckCommand::new(
            envelope.artifact_ref(),
            envelope.requester_id(),
            envelope.transfer_id(),
            full_digest,
            envelope.expected_revision(),
            now_ms,
        ));
        let cleanup = match result {
            ArtifactAckResult::CleanupRequired { lifecycle_revision } => {
                Some(ArtifactCleanupRequest {
                    artifact_ref: artifact_ref.clone(),
                    transfer_id: transfer_id.clone(),
                    lifecycle_revision,
                    acknowledged_at_ms: now_ms,
                })
            }
            ArtifactAckResult::AlreadyAcknowledged { .. } | ArtifactAckResult::Rejected { .. } => {
                None
            }
        };
        MqttV2ArtifactAdapterResult::Acknowledged { result, cleanup }
    }

    fn cancel(
        &self,
        envelope: &crate::protocol_v2_artifact::V2ArtifactEnvelope,
        now_ms: i64,
        signing_context: V2ResponseSigningContext,
    ) -> MqttV2ArtifactAdapterResult {
        let result = self.use_case.cancel(&ArtifactCancelCommand::new(
            envelope.artifact_ref(),
            envelope.requester_id(),
            envelope.owner_request_id(),
            envelope.owner_operation_id(),
            envelope.transfer_id(),
            envelope.expected_revision(),
            now_ms,
        ));
        let response = match V2ArtifactCancelResponseEnvelope::sign(
            envelope,
            result,
            signing_context,
            self.response_signer.as_ref(),
        ) {
            Ok(response) => response,
            Err(_) => return MqttV2ArtifactAdapterResult::ResponseSigningFailed,
        };
        let payload = match serde_json::to_vec(&response) {
            Ok(payload) if payload.len() <= MAX_V2_RESPONSE_BYTES => payload,
            Ok(_) | Err(_) => return MqttV2ArtifactAdapterResult::ResponseSigningFailed,
        };
        MqttV2ArtifactAdapterResult::Cancelled {
            result,
            artifact_ref: envelope.artifact_ref().to_string(),
            transfer_id: envelope.transfer_id().to_string(),
            response: MqttV2ResponsePublish {
                topic: self.topics.response(),
                payload,
                qos: MqttQos::AtLeastOnce,
                retained: false,
                delivery_receipt: None,
            },
        }
    }
}
