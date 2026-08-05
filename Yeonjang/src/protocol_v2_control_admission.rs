//! Security admission for an already parsed MQTT v2 control message.

use crate::authorization::{AuthorizationReplayGuard, ReplayGuardResult};
use crate::protocol_v2_control::{
    V2ControlEnvelope, V2ControlSignatureVerifier, verify_v2_control_signature,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2ControlAdmissionError {
    SignatureRejected,
    Expired,
    Replayed,
    ReplayUnavailable,
}

/// Opaque proof that signature, current expiry and replay consumption succeeded.
#[derive(Debug, PartialEq, Eq)]
pub struct AdmittedV2Control<'a> {
    control: &'a V2ControlEnvelope,
}

/// Proof of a valid signed redelivery that may only read a durable prior outcome.
#[derive(Debug, PartialEq, Eq)]
pub struct VerifiedReplayV2Control<'a> {
    control: &'a V2ControlEnvelope,
}

impl VerifiedReplayV2Control<'_> {
    pub fn control(&self) -> &V2ControlEnvelope {
        self.control
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum V2ControlAdmissionOutcome<'a> {
    Fresh(AdmittedV2Control<'a>),
    VerifiedReplay(VerifiedReplayV2Control<'a>),
}

impl AdmittedV2Control<'_> {
    /// Returns the exact admitted snapshot for the cancellation use case.
    pub fn control(&self) -> &V2ControlEnvelope {
        self.control
    }
}

/// Applies control security checks in one order without owning keys or storage.
pub struct V2ControlAdmission<'a> {
    signature_verifier: &'a dyn V2ControlSignatureVerifier,
    replay_guard: &'a dyn AuthorizationReplayGuard,
}

impl<'a> V2ControlAdmission<'a> {
    pub fn new(
        signature_verifier: &'a dyn V2ControlSignatureVerifier,
        replay_guard: &'a dyn AuthorizationReplayGuard,
    ) -> Self {
        Self {
            signature_verifier,
            replay_guard,
        }
    }

    pub fn admit<'control>(
        &self,
        control: &'control V2ControlEnvelope,
        now_ms: i64,
    ) -> Result<AdmittedV2Control<'control>, V2ControlAdmissionError> {
        match self.admit_or_replay(control, now_ms)? {
            V2ControlAdmissionOutcome::Fresh(admitted) => Ok(admitted),
            V2ControlAdmissionOutcome::VerifiedReplay(_) => Err(V2ControlAdmissionError::Replayed),
        }
    }

    pub fn admit_or_replay<'control>(
        &self,
        control: &'control V2ControlEnvelope,
        now_ms: i64,
    ) -> Result<V2ControlAdmissionOutcome<'control>, V2ControlAdmissionError> {
        verify_v2_control_signature(control, self.signature_verifier)
            .map_err(|_| V2ControlAdmissionError::SignatureRejected)?;
        if control.expires_at() <= now_ms {
            return Err(V2ControlAdmissionError::Expired);
        }
        match self.replay_guard.consume(
            &control.authorization_replay_identity(),
            control.expires_at(),
            now_ms,
        ) {
            ReplayGuardResult::Consumed => {
                Ok(V2ControlAdmissionOutcome::Fresh(AdmittedV2Control {
                    control,
                }))
            }
            ReplayGuardResult::Replayed => Ok(V2ControlAdmissionOutcome::VerifiedReplay(
                VerifiedReplayV2Control { control },
            )),
            ReplayGuardResult::Saturated | ReplayGuardResult::Unavailable => {
                Err(V2ControlAdmissionError::ReplayUnavailable)
            }
        }
    }
}
