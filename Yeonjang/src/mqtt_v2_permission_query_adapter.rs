//! MQTT boundary for the signed capture permission read contract.

use std::sync::Arc;

use crate::authorization::AuthorizationReplayGuard;
use crate::capture_permission_read::{CapturePermissionReadRequest, CapturePermissionReadUseCase};
use crate::mqtt_v2_response_adapter::{MAX_V2_RESPONSE_BYTES, MqttV2ResponsePublish};
use crate::mqtt_v2_topics::{MqttQos, MqttV2TopicSet};
use crate::protocol_v2_permission_query::{
    V2CapturePermissionQueryAdmission, V2CapturePermissionQueryAdmissionError,
    V2CapturePermissionQueryParseError, V2CapturePermissionQuerySignatureVerifier,
    parse_v2_capture_permission_query,
};
use crate::protocol_v2_permission_response::V2CapturePermissionResponseEnvelope;
use crate::protocol_v2_terminal::{V2ResponseSigner, V2ResponseSigningContext};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MqttV2InboundCapturePermissionQuery {
    pub topic: String,
    pub payload: Vec<u8>,
    pub retained: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MqttV2CapturePermissionRejection {
    Parse(V2CapturePermissionQueryParseError),
    Admission(V2CapturePermissionQueryAdmissionError),
    InvalidApplicationBinding,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MqttV2CapturePermissionAdapterResult {
    Publish(MqttV2ResponsePublish),
    Rejected(MqttV2CapturePermissionRejection),
    ResponseSigningFailed,
}

pub struct MqttV2CapturePermissionAdapter {
    topics: MqttV2TopicSet,
    signature_verifier: Arc<dyn V2CapturePermissionQuerySignatureVerifier>,
    replay_guard: Arc<dyn AuthorizationReplayGuard>,
    read: CapturePermissionReadUseCase,
    response_signer: Arc<dyn V2ResponseSigner>,
}

impl MqttV2CapturePermissionAdapter {
    pub fn new(
        topics: MqttV2TopicSet,
        signature_verifier: Arc<dyn V2CapturePermissionQuerySignatureVerifier>,
        replay_guard: Arc<dyn AuthorizationReplayGuard>,
        read: CapturePermissionReadUseCase,
        response_signer: Arc<dyn V2ResponseSigner>,
    ) -> Self {
        Self {
            topics,
            signature_verifier,
            replay_guard,
            read,
            response_signer,
        }
    }

    pub fn process(
        &self,
        inbound: MqttV2InboundCapturePermissionQuery,
        now_ms: i64,
        signing_context: V2ResponseSigningContext,
    ) -> MqttV2CapturePermissionAdapterResult {
        let query = match parse_v2_capture_permission_query(
            &inbound.topic,
            &inbound.payload,
            inbound.retained,
            now_ms,
            &self.topics,
        ) {
            Ok(query) => query,
            Err(error) => {
                return MqttV2CapturePermissionAdapterResult::Rejected(
                    MqttV2CapturePermissionRejection::Parse(error),
                );
            }
        };
        if let Err(error) = V2CapturePermissionQueryAdmission::new(
            self.signature_verifier.as_ref(),
            self.replay_guard.as_ref(),
        )
        .admit_or_replay(&query, now_ms)
        {
            return MqttV2CapturePermissionAdapterResult::Rejected(
                MqttV2CapturePermissionRejection::Admission(error),
            );
        }
        let request = match CapturePermissionReadRequest::new(
            query.target_instance_id(),
            query.target_session_id(),
            query.target_fingerprint(),
        ) {
            Ok(request) => request,
            Err(_) => {
                return MqttV2CapturePermissionAdapterResult::Rejected(
                    MqttV2CapturePermissionRejection::InvalidApplicationBinding,
                );
            }
        };
        let envelope = match V2CapturePermissionResponseEnvelope::sign(
            &query,
            self.read.execute(&request),
            signing_context,
            self.response_signer.as_ref(),
        ) {
            Ok(envelope) => envelope,
            Err(_) => return MqttV2CapturePermissionAdapterResult::ResponseSigningFailed,
        };
        let payload = match serde_json::to_vec(&envelope) {
            Ok(payload) if payload.len() <= MAX_V2_RESPONSE_BYTES => payload,
            _ => return MqttV2CapturePermissionAdapterResult::ResponseSigningFailed,
        };
        MqttV2CapturePermissionAdapterResult::Publish(MqttV2ResponsePublish {
            topic: self.topics.response(),
            payload,
            qos: MqttQos::AtLeastOnce,
            retained: false,
            delivery_receipt: None,
        })
    }

    pub fn control_topic(&self) -> String {
        self.topics.control()
    }
}
