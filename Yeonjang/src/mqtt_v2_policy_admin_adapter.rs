//! MQTT boundary for signed v2 policy administration.

use std::sync::Arc;

use crate::mqtt_v2_response_adapter::{MAX_V2_RESPONSE_BYTES, MqttV2ResponsePublish};
use crate::mqtt_v2_topics::{MqttQos, MqttV2TopicSet};
use crate::policy_admin::{PolicyAdminRequest, PolicyAdminUseCase};
use crate::policy_repository::PolicyRepositoryResult;
use crate::protocol_v2_policy_admin::{
    V2PolicyAdminAdmission, V2PolicyAdminAdmissionError, V2PolicyAdminParseError,
    V2PolicyAdminSignatureVerifier, parse_v2_policy_admin,
};
use crate::protocol_v2_policy_admin_result::V2PolicyAdminResultEnvelope;
use crate::protocol_v2_terminal::{V2ResponseSigner, V2ResponseSigningContext};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MqttV2InboundPolicyAdmin {
    pub topic: String,
    pub payload: Vec<u8>,
    pub retained: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MqttV2PolicyAdminRejection {
    RetainedMessage,
    Parse(V2PolicyAdminParseError),
    Admission(V2PolicyAdminAdmissionError),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MqttV2PolicyAdminAdapterResult {
    Publish {
        response: MqttV2ResponsePublish,
        refresh_capabilities: bool,
    },
    Rejected(MqttV2PolicyAdminRejection),
    ResponseSigningFailed,
}

pub struct MqttV2PolicyAdminAdapter {
    topics: MqttV2TopicSet,
    verifier: Arc<dyn V2PolicyAdminSignatureVerifier>,
    use_case: PolicyAdminUseCase,
    signer: Arc<dyn V2ResponseSigner>,
}

impl MqttV2PolicyAdminAdapter {
    pub fn new(
        topics: MqttV2TopicSet,
        verifier: Arc<dyn V2PolicyAdminSignatureVerifier>,
        use_case: PolicyAdminUseCase,
        signer: Arc<dyn V2ResponseSigner>,
    ) -> Self {
        Self {
            topics,
            verifier,
            use_case,
            signer,
        }
    }

    pub fn process(
        &self,
        inbound: MqttV2InboundPolicyAdmin,
        now_ms: i64,
        signing_context: V2ResponseSigningContext,
    ) -> MqttV2PolicyAdminAdapterResult {
        if inbound.topic == self.topics.admin() && inbound.retained {
            return MqttV2PolicyAdminAdapterResult::Rejected(
                MqttV2PolicyAdminRejection::RetainedMessage,
            );
        }
        let envelope = match parse_v2_policy_admin(
            &inbound.topic,
            &inbound.payload,
            inbound.retained,
            now_ms,
            &self.topics,
        ) {
            Ok(envelope) => envelope,
            Err(error) => {
                return MqttV2PolicyAdminAdapterResult::Rejected(
                    MqttV2PolicyAdminRejection::Parse(error),
                );
            }
        };
        let admitted =
            match V2PolicyAdminAdmission::new(self.verifier.as_ref()).admit(&envelope, now_ms) {
                Ok(admitted) => admitted,
                Err(error) => {
                    return MqttV2PolicyAdminAdapterResult::Rejected(
                        MqttV2PolicyAdminRejection::Admission(error),
                    );
                }
            };
        let result = match admitted.into_request() {
            PolicyAdminRequest::Update { command, grant } => self.use_case.update(&command, &grant),
            PolicyAdminRequest::Rollback { command, grant } => {
                self.use_case.rollback(&command, &grant)
            }
        };
        let refresh_capabilities = matches!(
            result,
            crate::policy_admin::PolicyAdminResult::Policy(PolicyRepositoryResult::Applied { .. })
        );
        let envelope = match V2PolicyAdminResultEnvelope::sign(
            &envelope,
            result,
            signing_context,
            self.signer.as_ref(),
        ) {
            Ok(envelope) => envelope,
            Err(_) => return MqttV2PolicyAdminAdapterResult::ResponseSigningFailed,
        };
        let payload = match serde_json::to_vec(&envelope) {
            Ok(payload) if payload.len() <= MAX_V2_RESPONSE_BYTES => payload,
            Ok(_) | Err(_) => return MqttV2PolicyAdminAdapterResult::ResponseSigningFailed,
        };
        MqttV2PolicyAdminAdapterResult::Publish {
            response: MqttV2ResponsePublish {
                topic: self.topics.response(),
                payload,
                qos: MqttQos::AtLeastOnce,
                retained: false,
                delivery_receipt: None,
            },
            refresh_capabilities,
        }
    }

    pub fn admin_topic(&self) -> String {
        self.topics.admin()
    }
}
