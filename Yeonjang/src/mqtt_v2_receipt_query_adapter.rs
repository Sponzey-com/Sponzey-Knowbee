//! MQTT projection for signed, read-only v2 receipt queries.

use std::sync::Arc;

use crate::authorization::AuthorizationReplayGuard;
use crate::mqtt_v2_response_adapter::{MAX_V2_RESPONSE_BYTES, MqttV2ResponsePublish};
use crate::mqtt_v2_topics::{MqttQos, MqttV2TopicSet};
use crate::protocol_v2_receipt_query::{
    V2ReceiptQueryParseError, V2ReceiptQuerySignatureVerifier, parse_v2_receipt_query,
};
use crate::protocol_v2_receipt_query_admission::{
    V2ReceiptQueryAdmission, V2ReceiptQueryAdmissionError, V2ReceiptQueryAdmissionOutcome,
};
use crate::protocol_v2_receipt_response::V2ReceiptResponseEnvelope;
use crate::protocol_v2_terminal::{V2ResponseSigner, V2ResponseSigningContext};
use crate::v2_receipt_query_use_case::V2ReceiptQueryUseCase;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MqttV2InboundReceiptQuery {
    pub topic: String,
    pub payload: Vec<u8>,
    pub retained: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MqttV2ReceiptQueryRejection {
    RetainedMessage,
    Parse(V2ReceiptQueryParseError),
    Admission(V2ReceiptQueryAdmissionError),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MqttV2ReceiptQueryAdapterResult {
    Publish(MqttV2ResponsePublish),
    Rejected(MqttV2ReceiptQueryRejection),
    ResponseSigningFailed,
}

pub struct MqttV2ReceiptQueryAdapter {
    topics: MqttV2TopicSet,
    signature_verifier: Arc<dyn V2ReceiptQuerySignatureVerifier>,
    replay_guard: Arc<dyn AuthorizationReplayGuard>,
    query: V2ReceiptQueryUseCase,
    response_signer: Arc<dyn V2ResponseSigner>,
}

impl MqttV2ReceiptQueryAdapter {
    pub fn new(
        topics: MqttV2TopicSet,
        signature_verifier: Arc<dyn V2ReceiptQuerySignatureVerifier>,
        replay_guard: Arc<dyn AuthorizationReplayGuard>,
        query: V2ReceiptQueryUseCase,
        response_signer: Arc<dyn V2ResponseSigner>,
    ) -> Self {
        Self {
            topics,
            signature_verifier,
            replay_guard,
            query,
            response_signer,
        }
    }

    pub fn process(
        &self,
        inbound: MqttV2InboundReceiptQuery,
        now_ms: i64,
        signing_context: V2ResponseSigningContext,
    ) -> MqttV2ReceiptQueryAdapterResult {
        if inbound.topic == self.topics.control() && inbound.retained {
            return MqttV2ReceiptQueryAdapterResult::Rejected(
                MqttV2ReceiptQueryRejection::RetainedMessage,
            );
        }
        let query =
            match parse_v2_receipt_query(&inbound.topic, &inbound.payload, now_ms, &self.topics) {
                Ok(query) => query,
                Err(error) => {
                    return MqttV2ReceiptQueryAdapterResult::Rejected(
                        MqttV2ReceiptQueryRejection::Parse(error),
                    );
                }
            };
        let admission = V2ReceiptQueryAdmission::new(
            self.signature_verifier.as_ref(),
            self.replay_guard.as_ref(),
        );
        let result = match admission.admit_or_replay(&query, now_ms) {
            Ok(V2ReceiptQueryAdmissionOutcome::Fresh(admitted)) => self.query.execute(&admitted),
            Ok(V2ReceiptQueryAdmissionOutcome::VerifiedReplay(replay)) => {
                self.query.replay(&replay)
            }
            Err(error) => {
                return MqttV2ReceiptQueryAdapterResult::Rejected(
                    MqttV2ReceiptQueryRejection::Admission(error),
                );
            }
        };
        let envelope = match V2ReceiptResponseEnvelope::sign(
            &query,
            result,
            signing_context,
            self.response_signer.as_ref(),
        ) {
            Ok(envelope) => envelope,
            Err(_) => return MqttV2ReceiptQueryAdapterResult::ResponseSigningFailed,
        };
        let payload = match serde_json::to_vec(&envelope) {
            Ok(payload) if payload.len() <= MAX_V2_RESPONSE_BYTES => payload,
            Ok(_) | Err(_) => return MqttV2ReceiptQueryAdapterResult::ResponseSigningFailed,
        };
        MqttV2ReceiptQueryAdapterResult::Publish(MqttV2ResponsePublish {
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
