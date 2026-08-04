//! MQTT delivery projection for signed v2 terminal responses.

use std::sync::Arc;

use sha2::{Digest, Sha256};

use crate::mqtt_v2_direct_handler::{MqttV2CommandHandler, MqttV2HandlerResult};
use crate::mqtt_v2_topics::MqttQos;
use crate::platform_execution::{
    EffectState, ExecutionFailure, ExecutionFailureReason, ExecutionStage, RecoveryAction,
    RetrySafety,
};
use crate::protocol_v2_command_rejection::V2CommandRejectionEnvelope;
use crate::protocol_v2_operation::V2OperationBindingContext;
use crate::protocol_v2_terminal::{
    V2ResponseSigner, V2ResponseSigningContext, V2TerminalResponseEnvelope,
};
use crate::v2_delivery_receipt::{
    V2DeliveryIdentityResolution, V2DeliveryIdentityResolver, V2DeliveryReceipt,
};

pub(crate) const MAX_V2_RESPONSE_BYTES: usize = 512 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MqttV2InboundCommand {
    pub topic: String,
    pub payload: Vec<u8>,
    pub retained: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MqttV2ResponsePublish {
    pub topic: String,
    pub payload: Vec<u8>,
    pub qos: MqttQos,
    pub retained: bool,
    /// Present only for a target terminal response requiring application ack.
    pub delivery_receipt: Option<Box<V2DeliveryReceipt>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MqttV2ResponseAdapterResult {
    Publish(MqttV2ResponsePublish),
    Rejected(ExecutionFailure),
    InternalContractFailure(ExecutionFailure),
    ResponseSigningFailed,
}

pub struct MqttV2ResponseAdapter {
    handler: MqttV2CommandHandler,
    response_signer: Arc<dyn V2ResponseSigner>,
    delivery_identity: Option<Arc<dyn V2DeliveryIdentityResolver>>,
}

impl MqttV2ResponseAdapter {
    pub fn new(handler: MqttV2CommandHandler, response_signer: Arc<dyn V2ResponseSigner>) -> Self {
        Self {
            handler,
            response_signer,
            delivery_identity: None,
        }
    }

    pub fn with_delivery_identity_resolver(
        mut self,
        resolver: Arc<dyn V2DeliveryIdentityResolver>,
    ) -> Self {
        self.delivery_identity = Some(resolver);
        self
    }

    pub fn process(
        &self,
        inbound: MqttV2InboundCommand,
        now_ms: i64,
        binding_context: V2OperationBindingContext,
        signing_context: V2ResponseSigningContext,
    ) -> MqttV2ResponseAdapterResult {
        if inbound.topic == self.handler.topics().command() && inbound.retained {
            return MqttV2ResponseAdapterResult::Rejected(retained_rejection(&inbound.payload));
        }
        match self
            .handler
            .handle(&inbound.topic, &inbound.payload, now_ms, binding_context)
        {
            MqttV2HandlerResult::Terminal(content) => {
                let content = *content;
                let mut envelope = match V2TerminalResponseEnvelope::sign(
                    content.clone(),
                    signing_context.clone(),
                    self.response_signer.as_ref(),
                ) {
                    Ok(envelope) => envelope,
                    Err(_) => return MqttV2ResponseAdapterResult::ResponseSigningFailed,
                };
                let mut delivery_receipt = match envelope.delivery_receipt() {
                    Ok(receipt) => receipt,
                    Err(_) => return MqttV2ResponseAdapterResult::ResponseSigningFailed,
                };
                if let Some(resolver) = &self.delivery_identity {
                    match resolver.resolve_receipt_id(&delivery_receipt) {
                        V2DeliveryIdentityResolution::Candidate => {}
                        V2DeliveryIdentityResolution::Existing(receipt_id) => {
                            if receipt_id != delivery_receipt.receipt_id() {
                                envelope = match V2TerminalResponseEnvelope::sign_with_receipt_id(
                                    content,
                                    signing_context,
                                    &receipt_id,
                                    self.response_signer.as_ref(),
                                ) {
                                    Ok(envelope) => envelope,
                                    Err(_) => {
                                        return MqttV2ResponseAdapterResult::ResponseSigningFailed;
                                    }
                                };
                                delivery_receipt = match envelope.delivery_receipt() {
                                    Ok(receipt) => receipt,
                                    Err(_) => {
                                        return MqttV2ResponseAdapterResult::ResponseSigningFailed;
                                    }
                                };
                            }
                        }
                        V2DeliveryIdentityResolution::Conflict => {
                            return MqttV2ResponseAdapterResult::ResponseSigningFailed;
                        }
                    }
                }
                let payload = match serde_json::to_vec(&envelope) {
                    Ok(payload) if payload.len() <= MAX_V2_RESPONSE_BYTES => payload,
                    Ok(_) | Err(_) => {
                        return MqttV2ResponseAdapterResult::ResponseSigningFailed;
                    }
                };
                MqttV2ResponseAdapterResult::Publish(MqttV2ResponsePublish {
                    topic: self.handler.topics().response(),
                    payload,
                    qos: MqttQos::AtLeastOnce,
                    retained: false,
                    delivery_receipt: Some(Box::new(delivery_receipt)),
                })
            }
            MqttV2HandlerResult::Rejected(failure) => {
                let envelope = match V2CommandRejectionEnvelope::sign(
                    failure,
                    self.handler.topics(),
                    signing_context,
                    self.response_signer.as_ref(),
                ) {
                    Ok(envelope) => envelope,
                    Err(_) => return MqttV2ResponseAdapterResult::ResponseSigningFailed,
                };
                let payload = match serde_json::to_vec(&envelope) {
                    Ok(payload) if payload.len() <= MAX_V2_RESPONSE_BYTES => payload,
                    Ok(_) | Err(_) => {
                        return MqttV2ResponseAdapterResult::ResponseSigningFailed;
                    }
                };
                MqttV2ResponseAdapterResult::Publish(MqttV2ResponsePublish {
                    topic: self.handler.topics().response(),
                    payload,
                    qos: MqttQos::AtLeastOnce,
                    retained: false,
                    delivery_receipt: None,
                })
            }
            MqttV2HandlerResult::InternalContractFailure(failure) => {
                MqttV2ResponseAdapterResult::InternalContractFailure(failure)
            }
        }
    }

    pub fn command_topic(&self) -> String {
        self.handler.topics().command()
    }
}

fn retained_rejection(payload: &[u8]) -> ExecutionFailure {
    ExecutionFailure::new(
        ExecutionStage::IngressValidation,
        ExecutionFailureReason::RetainedMessageRejected,
        EffectState::NotStarted,
        RetrySafety::MaterialChangeRequired,
        RecoveryAction::CorrectRequest,
        None,
        format!("sha256:{:x}", Sha256::digest(payload)),
    )
    .expect("a SHA-256 ingress correlation is contract-valid")
}
