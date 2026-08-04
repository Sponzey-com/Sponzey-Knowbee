//! Signature, expiry, and replay admission for a parsed MQTT v2 command.

use crate::authorization::{AuthorizationReplayGuard, ReplayGuardResult};
use crate::protocol_v2::{
    V2CommandEnvelope, V2CommandSignatureVerifier, verify_v2_command_signature,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2CommandAdmissionError {
    SignatureRejected,
    Expired,
    Replayed,
    ReplayUnavailable,
}

/// Proof that signature, current expiry, and replay consumption succeeded in this call.
pub struct AdmittedV2Command<'a> {
    command: &'a V2CommandEnvelope,
}

impl AdmittedV2Command<'_> {
    pub(crate) fn command(&self) -> &V2CommandEnvelope {
        self.command
    }
}

/// Applies security checks in one order without owning cryptographic keys or replay storage.
pub struct V2CommandAdmission<'a> {
    signature_verifier: &'a dyn V2CommandSignatureVerifier,
    replay_guard: &'a dyn AuthorizationReplayGuard,
}

impl<'a> V2CommandAdmission<'a> {
    pub fn new(
        signature_verifier: &'a dyn V2CommandSignatureVerifier,
        replay_guard: &'a dyn AuthorizationReplayGuard,
    ) -> Self {
        Self {
            signature_verifier,
            replay_guard,
        }
    }

    pub fn admit<'command>(
        &self,
        command: &'command V2CommandEnvelope,
        now_ms: i64,
    ) -> Result<AdmittedV2Command<'command>, V2CommandAdmissionError> {
        verify_v2_command_signature(command, self.signature_verifier)
            .map_err(|_| V2CommandAdmissionError::SignatureRejected)?;
        if command.expires_at() <= now_ms {
            return Err(V2CommandAdmissionError::Expired);
        }
        match self.replay_guard.consume(
            &command.authorization_replay_identity(),
            command.expires_at(),
            now_ms,
        ) {
            ReplayGuardResult::Consumed => Ok(AdmittedV2Command { command }),
            ReplayGuardResult::Replayed => Err(V2CommandAdmissionError::Replayed),
            ReplayGuardResult::Saturated | ReplayGuardResult::Unavailable => {
                Err(V2CommandAdmissionError::ReplayUnavailable)
            }
        }
    }
}
