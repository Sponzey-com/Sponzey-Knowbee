//! MQTT adapter for signed application-level response acknowledgements.

use std::sync::Arc;

use crate::authorization::AuthorizationReplayGuard;
use crate::mqtt_v2_response_adapter::{MAX_V2_RESPONSE_BYTES, MqttV2ResponsePublish};
use crate::mqtt_v2_topics::{MqttQos, MqttV2TopicSet};
use crate::protocol_v2_response_ack::{
    V2ResponseAckParseError, V2ResponseAckSignatureVerifier, parse_v2_response_ack,
};
use crate::protocol_v2_response_ack_admission::{
    V2ResponseAckAdmission, V2ResponseAckAdmissionError, V2ResponseAckAdmissionOutcome,
};
use crate::protocol_v2_response_ack_result::V2ResponseAckResultEnvelope;
use crate::protocol_v2_terminal::{V2ResponseSigner, V2ResponseSigningContext};
use crate::v2_response_ack_use_case::V2ResponseAckUseCase;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MqttV2InboundResponseAck {
    pub topic: String,
    pub payload: Vec<u8>,
    pub retained: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MqttV2ResponseAckRejection {
    RetainedMessage,
    Parse(V2ResponseAckParseError),
    Admission(V2ResponseAckAdmissionError),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MqttV2ResponseAckAdapterResult {
    Publish(MqttV2ResponsePublish),
    Rejected(MqttV2ResponseAckRejection),
    ResponseSigningFailed,
}

pub struct MqttV2ResponseAckAdapter {
    topics: MqttV2TopicSet,
    verifier: Arc<dyn V2ResponseAckSignatureVerifier>,
    replay: Arc<dyn AuthorizationReplayGuard>,
    use_case: V2ResponseAckUseCase,
    signer: Arc<dyn V2ResponseSigner>,
}

impl MqttV2ResponseAckAdapter {
    pub fn new(
        topics: MqttV2TopicSet,
        verifier: Arc<dyn V2ResponseAckSignatureVerifier>,
        replay: Arc<dyn AuthorizationReplayGuard>,
        use_case: V2ResponseAckUseCase,
        signer: Arc<dyn V2ResponseSigner>,
    ) -> Self {
        Self {
            topics,
            verifier,
            replay,
            use_case,
            signer,
        }
    }

    pub fn process(
        &self,
        inbound: MqttV2InboundResponseAck,
        now_ms: i64,
        signing_context: V2ResponseSigningContext,
    ) -> MqttV2ResponseAckAdapterResult {
        if inbound.topic == self.topics.control() && inbound.retained {
            return MqttV2ResponseAckAdapterResult::Rejected(
                MqttV2ResponseAckRejection::RetainedMessage,
            );
        }
        let ack =
            match parse_v2_response_ack(&inbound.topic, &inbound.payload, now_ms, &self.topics) {
                Ok(ack) => ack,
                Err(error) => {
                    return MqttV2ResponseAckAdapterResult::Rejected(
                        MqttV2ResponseAckRejection::Parse(error),
                    );
                }
            };
        let admission = V2ResponseAckAdmission::new(self.verifier.as_ref(), self.replay.as_ref());
        let result = match admission.admit_or_replay(&ack, now_ms) {
            Ok(V2ResponseAckAdmissionOutcome::Fresh(admitted)) => self.use_case.execute(&admitted),
            Ok(V2ResponseAckAdmissionOutcome::VerifiedReplay(replay)) => {
                self.use_case.replay(&replay)
            }
            Err(error) => {
                return MqttV2ResponseAckAdapterResult::Rejected(
                    MqttV2ResponseAckRejection::Admission(error),
                );
            }
        };
        let envelope = match V2ResponseAckResultEnvelope::sign(
            &ack,
            result,
            signing_context,
            self.signer.as_ref(),
        ) {
            Ok(envelope) => envelope,
            Err(_) => return MqttV2ResponseAckAdapterResult::ResponseSigningFailed,
        };
        let payload = match serde_json::to_vec(&envelope) {
            Ok(payload) if payload.len() <= MAX_V2_RESPONSE_BYTES => payload,
            Ok(_) | Err(_) => return MqttV2ResponseAckAdapterResult::ResponseSigningFailed,
        };
        MqttV2ResponseAckAdapterResult::Publish(MqttV2ResponsePublish {
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
