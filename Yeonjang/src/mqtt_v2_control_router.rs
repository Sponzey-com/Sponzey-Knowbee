//! Typed schema router for the shared MQTT v2 control topic.
//!
//! Routing only selects a strict protocol adapter. Fetch, acknowledgement and
//! cancellation are all closed artifact-control variants; authorization and
//! state transitions remain owned by the artifact adapter and use case.

use serde_json::Value;

use crate::artifact_transfer_use_case::ArtifactCancelResult;
use crate::mqtt_v2_artifact_adapter::{
    ArtifactCleanupRequest, ArtifactPublicationCompletion, ArtifactPublicationCompletionResult,
    MqttV2ArtifactAdapter, MqttV2ArtifactAdapterResult, MqttV2ArtifactChunkPublish,
    MqttV2ArtifactRejection, MqttV2InboundArtifactControl,
};
use crate::mqtt_v2_control_adapter::{
    MqttV2ControlAdapter, MqttV2ControlAdapterResult, MqttV2ControlRejection, MqttV2InboundControl,
};
use crate::mqtt_v2_permission_query_adapter::{
    MqttV2CapturePermissionAdapter, MqttV2CapturePermissionAdapterResult,
    MqttV2CapturePermissionRejection, MqttV2InboundCapturePermissionQuery,
};
use crate::mqtt_v2_receipt_query_adapter::{
    MqttV2InboundReceiptQuery, MqttV2ReceiptQueryAdapter, MqttV2ReceiptQueryAdapterResult,
    MqttV2ReceiptQueryRejection,
};
use crate::mqtt_v2_response_ack_adapter::{
    MqttV2InboundResponseAck, MqttV2ResponseAckAdapter, MqttV2ResponseAckAdapterResult,
    MqttV2ResponseAckRejection,
};
use crate::mqtt_v2_response_adapter::MqttV2ResponsePublish;
use crate::protocol_v2_terminal::V2ResponseSigningContext;

const MAX_CONTROL_BYTES: usize = 65_536;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum V2ControlRoute {
    Cancel,
    PermissionRead,
    ReceiptQuery,
    ResponseAck,
    Artifact,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MqttV2ControlRouteRejection {
    Unroutable,
    Cancel(MqttV2ControlRejection),
    PermissionRead(MqttV2CapturePermissionRejection),
    ReceiptQuery(MqttV2ReceiptQueryRejection),
    ResponseAck(MqttV2ResponseAckRejection),
    Artifact(MqttV2ArtifactRejection),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MqttV2ControlRouterResult {
    Publish(MqttV2ResponsePublish),
    ArtifactPrepared {
        publishes: Vec<MqttV2ArtifactChunkPublish>,
        completion: ArtifactPublicationCompletion,
        prepared_at_ms: i64,
    },
    ArtifactAcknowledged {
        cleanup: Option<ArtifactCleanupRequest>,
    },
    /// One structurally and cryptographically admitted fetch that could not
    /// prepare its exact artifact transfer. The pump must publish this signed
    /// response; it is not an admission rejection that may be dropped.
    ArtifactFetchRejected {
        response: MqttV2ResponsePublish,
    },
    ArtifactCancelled {
        result: ArtifactCancelResult,
        artifact_ref: String,
        transfer_id: String,
        response: MqttV2ResponsePublish,
    },
    Rejected(MqttV2ControlRouteRejection),
    ResponseSigningFailed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MqttV2ControlRouterBuildError {
    TopicMismatch,
}

pub struct MqttV2ControlRouter {
    control_topic: String,
    cancel: MqttV2ControlAdapter,
    permission_read: Option<MqttV2CapturePermissionAdapter>,
    receipt_query: MqttV2ReceiptQueryAdapter,
    response_ack: MqttV2ResponseAckAdapter,
    artifact: Option<MqttV2ArtifactAdapter>,
}

impl MqttV2ControlRouter {
    pub fn new(
        cancel: MqttV2ControlAdapter,
        receipt_query: MqttV2ReceiptQueryAdapter,
        response_ack: MqttV2ResponseAckAdapter,
    ) -> Result<Self, MqttV2ControlRouterBuildError> {
        let control_topic = cancel.control_topic();
        if receipt_query.control_topic() != control_topic
            || response_ack.control_topic() != control_topic
        {
            return Err(MqttV2ControlRouterBuildError::TopicMismatch);
        }
        Ok(Self {
            control_topic,
            cancel,
            permission_read: None,
            receipt_query,
            response_ack,
            artifact: None,
        })
    }

    pub fn with_permission_read(
        mut self,
        permission_read: MqttV2CapturePermissionAdapter,
    ) -> Result<Self, MqttV2ControlRouterBuildError> {
        if permission_read.control_topic() != self.control_topic {
            return Err(MqttV2ControlRouterBuildError::TopicMismatch);
        }
        self.permission_read = Some(permission_read);
        Ok(self)
    }

    pub fn with_artifact(
        mut self,
        artifact: MqttV2ArtifactAdapter,
    ) -> Result<Self, MqttV2ControlRouterBuildError> {
        if artifact.control_topic() != self.control_topic {
            return Err(MqttV2ControlRouterBuildError::TopicMismatch);
        }
        self.artifact = Some(artifact);
        Ok(self)
    }

    pub fn process(
        &self,
        topic: String,
        payload: Vec<u8>,
        retained: bool,
        now_ms: i64,
        signing_context: V2ResponseSigningContext,
    ) -> MqttV2ControlRouterResult {
        let Some(route) = classify(&payload) else {
            return MqttV2ControlRouterResult::Rejected(MqttV2ControlRouteRejection::Unroutable);
        };
        match route {
            V2ControlRoute::Cancel => match self.cancel.process(
                MqttV2InboundControl {
                    topic,
                    payload,
                    retained,
                },
                now_ms,
                signing_context,
            ) {
                MqttV2ControlAdapterResult::Publish(response) => {
                    MqttV2ControlRouterResult::Publish(response)
                }
                MqttV2ControlAdapterResult::Rejected(rejection) => {
                    MqttV2ControlRouterResult::Rejected(MqttV2ControlRouteRejection::Cancel(
                        rejection,
                    ))
                }
                MqttV2ControlAdapterResult::ResponseSigningFailed => {
                    MqttV2ControlRouterResult::ResponseSigningFailed
                }
            },
            V2ControlRoute::PermissionRead => {
                let Some(permission_read) = &self.permission_read else {
                    return MqttV2ControlRouterResult::Rejected(
                        MqttV2ControlRouteRejection::Unroutable,
                    );
                };
                match permission_read.process(
                    MqttV2InboundCapturePermissionQuery {
                        topic,
                        payload,
                        retained,
                    },
                    now_ms,
                    signing_context,
                ) {
                    MqttV2CapturePermissionAdapterResult::Publish(response) => {
                        MqttV2ControlRouterResult::Publish(response)
                    }
                    MqttV2CapturePermissionAdapterResult::Rejected(rejection) => {
                        MqttV2ControlRouterResult::Rejected(
                            MqttV2ControlRouteRejection::PermissionRead(rejection),
                        )
                    }
                    MqttV2CapturePermissionAdapterResult::ResponseSigningFailed => {
                        MqttV2ControlRouterResult::ResponseSigningFailed
                    }
                }
            }
            V2ControlRoute::ReceiptQuery => match self.receipt_query.process(
                MqttV2InboundReceiptQuery {
                    topic,
                    payload,
                    retained,
                },
                now_ms,
                signing_context,
            ) {
                MqttV2ReceiptQueryAdapterResult::Publish(response) => {
                    MqttV2ControlRouterResult::Publish(response)
                }
                MqttV2ReceiptQueryAdapterResult::Rejected(rejection) => {
                    MqttV2ControlRouterResult::Rejected(MqttV2ControlRouteRejection::ReceiptQuery(
                        rejection,
                    ))
                }
                MqttV2ReceiptQueryAdapterResult::ResponseSigningFailed => {
                    MqttV2ControlRouterResult::ResponseSigningFailed
                }
            },
            V2ControlRoute::ResponseAck => match self.response_ack.process(
                MqttV2InboundResponseAck {
                    topic,
                    payload,
                    retained,
                },
                now_ms,
                signing_context,
            ) {
                MqttV2ResponseAckAdapterResult::Publish(response) => {
                    MqttV2ControlRouterResult::Publish(response)
                }
                MqttV2ResponseAckAdapterResult::Rejected(rejection) => {
                    MqttV2ControlRouterResult::Rejected(MqttV2ControlRouteRejection::ResponseAck(
                        rejection,
                    ))
                }
                MqttV2ResponseAckAdapterResult::ResponseSigningFailed => {
                    MqttV2ControlRouterResult::ResponseSigningFailed
                }
            },
            V2ControlRoute::Artifact => {
                let Some(artifact) = &self.artifact else {
                    return MqttV2ControlRouterResult::Rejected(
                        MqttV2ControlRouteRejection::Unroutable,
                    );
                };
                match artifact.process(
                    MqttV2InboundArtifactControl {
                        topic,
                        payload,
                        retained,
                    },
                    now_ms,
                    signing_context,
                ) {
                    MqttV2ArtifactAdapterResult::Prepared {
                        publishes,
                        completion,
                    } => MqttV2ControlRouterResult::ArtifactPrepared {
                        publishes,
                        completion,
                        prepared_at_ms: now_ms,
                    },
                    MqttV2ArtifactAdapterResult::Acknowledged { cleanup, .. } => {
                        MqttV2ControlRouterResult::ArtifactAcknowledged { cleanup }
                    }
                    MqttV2ArtifactAdapterResult::Cancelled {
                        result,
                        artifact_ref,
                        transfer_id,
                        response,
                    } => MqttV2ControlRouterResult::ArtifactCancelled {
                        result,
                        artifact_ref,
                        transfer_id,
                        response,
                    },
                    MqttV2ArtifactAdapterResult::FetchRejected { response, .. } => {
                        MqttV2ControlRouterResult::ArtifactFetchRejected { response }
                    }
                    MqttV2ArtifactAdapterResult::Rejected(rejection) => {
                        MqttV2ControlRouterResult::Rejected(MqttV2ControlRouteRejection::Artifact(
                            rejection,
                        ))
                    }
                    MqttV2ArtifactAdapterResult::ResponseSigningFailed => {
                        MqttV2ControlRouterResult::ResponseSigningFailed
                    }
                }
            }
        }
    }

    pub fn control_topic(&self) -> &str {
        &self.control_topic
    }

    pub fn artifact_ack_filter(&self) -> Option<String> {
        self.artifact
            .as_ref()
            .map(MqttV2ArtifactAdapter::artifact_ack_filter)
    }

    pub fn accepts_artifact_ack_topic(&self, topic: &str) -> bool {
        self.artifact
            .as_ref()
            .is_some_and(|artifact| artifact.accepts_ack_topic(topic))
    }

    pub fn complete_artifact_publication(
        &self,
        completion: ArtifactPublicationCompletion,
        all_chunks_enqueued: bool,
        now_ms: i64,
    ) -> Option<ArtifactPublicationCompletionResult> {
        self.artifact
            .as_ref()
            .map(|artifact| artifact.complete_publication(completion, all_chunks_enqueued, now_ms))
    }
}

fn classify(payload: &[u8]) -> Option<V2ControlRoute> {
    if payload.len() > MAX_CONTROL_BYTES {
        return None;
    }
    let value: Value = serde_json::from_slice(payload).ok()?;
    if value.get("protocol_version")?.as_u64()? != 2
        || value.get("message_kind")?.as_str()? != "control"
    {
        return None;
    }
    match value.get("schema_id")?.as_str()? {
        "yeonjang.control.v2" => match value.get("payload")?.get("control")?.as_str()? {
            "command.cancel" => Some(V2ControlRoute::Cancel),
            "capture.permission.get" => Some(V2ControlRoute::PermissionRead),
            "receipt.get" => Some(V2ControlRoute::ReceiptQuery),
            "response.ack" => Some(V2ControlRoute::ResponseAck),
            _ => None,
        },
        "yeonjang.artifact-control.v2" => match value.get("payload")?.get("artifact")?.as_str()? {
            "artifact.fetch" | "artifact.ack" | "artifact.cancel" => Some(V2ControlRoute::Artifact),
            _ => None,
        },
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::{V2ControlRoute, classify};

    #[test]
    fn discriminator_routes_only_versioned_closed_control_kinds() {
        for (control, expected) in [
            ("command.cancel", Some(V2ControlRoute::Cancel)),
            (
                "capture.permission.get",
                Some(V2ControlRoute::PermissionRead),
            ),
            ("receipt.get", Some(V2ControlRoute::ReceiptQuery)),
            ("response.ack", Some(V2ControlRoute::ResponseAck)),
            ("cancel latest camera", None),
        ] {
            let payload = serde_json::json!({
                "protocol_version": 2,
                "schema_id": "yeonjang.control.v2",
                "message_kind": "control",
                "payload": {"control": control}
            });
            assert_eq!(
                classify(&serde_json::to_vec(&payload).expect("JSON")),
                expected
            );
        }
        assert_eq!(classify(b"{not-json"), None);

        for artifact_kind in ["artifact.fetch", "artifact.ack", "artifact.cancel"] {
            let artifact = serde_json::json!({
                "protocol_version": 2,
                "schema_id": "yeonjang.artifact-control.v2",
                "message_kind": "control",
                "payload": {"artifact": artifact_kind}
            });
            assert_eq!(
                classify(&serde_json::to_vec(&artifact).expect("JSON")),
                Some(V2ControlRoute::Artifact)
            );
        }
    }
}
