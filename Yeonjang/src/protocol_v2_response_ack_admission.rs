//! Signature, expiry and replay admission for v2 consumer acknowledgements.

use crate::authorization::{AuthorizationReplayGuard, ReplayGuardResult};
use crate::protocol_v2_response_ack::{
    V2ResponseAckEnvelope, V2ResponseAckSignatureVerifier, verify_response_ack_signature,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2ResponseAckAdmissionError {
    SignatureRejected,
    Expired,
    ReplayUnavailable,
}

#[derive(Debug, PartialEq, Eq)]
pub struct AdmittedV2ResponseAck<'a> {
    ack: &'a V2ResponseAckEnvelope,
}
#[derive(Debug, PartialEq, Eq)]
pub struct VerifiedReplayV2ResponseAck<'a> {
    ack: &'a V2ResponseAckEnvelope,
}
impl AdmittedV2ResponseAck<'_> {
    pub fn ack(&self) -> &V2ResponseAckEnvelope {
        self.ack
    }
}
impl VerifiedReplayV2ResponseAck<'_> {
    pub fn ack(&self) -> &V2ResponseAckEnvelope {
        self.ack
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum V2ResponseAckAdmissionOutcome<'a> {
    Fresh(AdmittedV2ResponseAck<'a>),
    VerifiedReplay(VerifiedReplayV2ResponseAck<'a>),
}

pub struct V2ResponseAckAdmission<'a> {
    verifier: &'a dyn V2ResponseAckSignatureVerifier,
    replay: &'a dyn AuthorizationReplayGuard,
}

impl<'a> V2ResponseAckAdmission<'a> {
    pub fn new(
        verifier: &'a dyn V2ResponseAckSignatureVerifier,
        replay: &'a dyn AuthorizationReplayGuard,
    ) -> Self {
        Self { verifier, replay }
    }

    pub fn admit_or_replay<'ack>(
        &self,
        ack: &'ack V2ResponseAckEnvelope,
        now_ms: i64,
    ) -> Result<V2ResponseAckAdmissionOutcome<'ack>, V2ResponseAckAdmissionError> {
        if !verify_response_ack_signature(ack, self.verifier) {
            return Err(V2ResponseAckAdmissionError::SignatureRejected);
        }
        if ack.expires_at() <= now_ms {
            return Err(V2ResponseAckAdmissionError::Expired);
        }
        match self
            .replay
            .consume(&ack.replay_identity(), ack.expires_at(), now_ms)
        {
            ReplayGuardResult::Consumed => Ok(V2ResponseAckAdmissionOutcome::Fresh(
                AdmittedV2ResponseAck { ack },
            )),
            ReplayGuardResult::Replayed => Ok(V2ResponseAckAdmissionOutcome::VerifiedReplay(
                VerifiedReplayV2ResponseAck { ack },
            )),
            ReplayGuardResult::Saturated | ReplayGuardResult::Unavailable => {
                Err(V2ResponseAckAdmissionError::ReplayUnavailable)
            }
        }
    }
}
