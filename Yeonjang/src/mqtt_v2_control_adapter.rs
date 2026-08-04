//! Direct MQTT projection for signed v2 cancellation controls and acknowledgements.

use std::sync::Arc;

use crate::authorization::AuthorizationReplayGuard;
use crate::mqtt_v2_response_adapter::{MAX_V2_RESPONSE_BYTES, MqttV2ResponsePublish};
use crate::mqtt_v2_topics::{MqttQos, MqttV2TopicSet};
use crate::protocol_v2_cancel_response::V2CancelResponseEnvelope;
use crate::protocol_v2_control::{
    V2ControlParseError, V2ControlSignatureVerifier, parse_v2_control,
};
use crate::protocol_v2_control_admission::{
    V2ControlAdmission, V2ControlAdmissionError, V2ControlAdmissionOutcome,
};
use crate::protocol_v2_terminal::{V2ResponseSigner, V2ResponseSigningContext};
use crate::v2_cancel_use_case::V2CancelUseCase;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MqttV2InboundControl {
    pub topic: String,
    pub payload: Vec<u8>,
    pub retained: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MqttV2ControlRejection {
    RetainedMessage,
    Parse(V2ControlParseError),
    Admission(V2ControlAdmissionError),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MqttV2ControlAdapterResult {
    Publish(MqttV2ResponsePublish),
    Rejected(MqttV2ControlRejection),
    ResponseSigningFailed,
}

pub struct MqttV2ControlAdapter {
    topics: MqttV2TopicSet,
    signature_verifier: Arc<dyn V2ControlSignatureVerifier>,
    replay_guard: Arc<dyn AuthorizationReplayGuard>,
    cancel: V2CancelUseCase,
    response_signer: Arc<dyn V2ResponseSigner>,
}

impl MqttV2ControlAdapter {
    pub fn new(
        topics: MqttV2TopicSet,
        signature_verifier: Arc<dyn V2ControlSignatureVerifier>,
        replay_guard: Arc<dyn AuthorizationReplayGuard>,
        cancel: V2CancelUseCase,
        response_signer: Arc<dyn V2ResponseSigner>,
    ) -> Self {
        Self {
            topics,
            signature_verifier,
            replay_guard,
            cancel,
            response_signer,
        }
    }

    pub fn process(
        &self,
        inbound: MqttV2InboundControl,
        now_ms: i64,
        signing_context: V2ResponseSigningContext,
    ) -> MqttV2ControlAdapterResult {
        if inbound.topic == self.topics.control() && inbound.retained {
            return MqttV2ControlAdapterResult::Rejected(MqttV2ControlRejection::RetainedMessage);
        }
        let control = match parse_v2_control(&inbound.topic, &inbound.payload, now_ms, &self.topics)
        {
            Ok(control) => control,
            Err(error) => {
                return MqttV2ControlAdapterResult::Rejected(MqttV2ControlRejection::Parse(error));
            }
        };
        let admission =
            V2ControlAdmission::new(self.signature_verifier.as_ref(), self.replay_guard.as_ref());
        let acknowledgement = match admission.admit_or_replay(&control, now_ms) {
            Ok(V2ControlAdmissionOutcome::Fresh(admitted)) => self.cancel.execute(&admitted),
            Ok(V2ControlAdmissionOutcome::VerifiedReplay(replay)) => self.cancel.replay(&replay),
            Err(error) => {
                return MqttV2ControlAdapterResult::Rejected(MqttV2ControlRejection::Admission(
                    error,
                ));
            }
        };
        let response = match V2CancelResponseEnvelope::sign(
            acknowledgement,
            signing_context,
            self.response_signer.as_ref(),
        ) {
            Ok(response) => response,
            Err(_) => return MqttV2ControlAdapterResult::ResponseSigningFailed,
        };
        let payload = match serde_json::to_vec(&response) {
            Ok(payload) if payload.len() <= MAX_V2_RESPONSE_BYTES => payload,
            Ok(_) | Err(_) => return MqttV2ControlAdapterResult::ResponseSigningFailed,
        };
        MqttV2ControlAdapterResult::Publish(MqttV2ResponsePublish {
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
