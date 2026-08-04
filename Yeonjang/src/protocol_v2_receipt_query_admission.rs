//! Security admission for parsed, read-only v2 receipt queries.

use crate::authorization::{AuthorizationReplayGuard, ReplayGuardResult};
use crate::protocol_v2_receipt_query::{
    V2ReceiptQueryEnvelope, V2ReceiptQuerySignatureVerifier, verify_receipt_query_signature,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2ReceiptQueryAdmissionError {
    SignatureRejected,
    Expired,
    ReplayUnavailable,
}

#[derive(Debug, PartialEq, Eq)]
pub struct AdmittedV2ReceiptQuery<'a> {
    query: &'a V2ReceiptQueryEnvelope,
}

#[derive(Debug, PartialEq, Eq)]
pub struct VerifiedReplayV2ReceiptQuery<'a> {
    query: &'a V2ReceiptQueryEnvelope,
}

impl AdmittedV2ReceiptQuery<'_> {
    pub fn query(&self) -> &V2ReceiptQueryEnvelope {
        self.query
    }
}

impl VerifiedReplayV2ReceiptQuery<'_> {
    pub fn query(&self) -> &V2ReceiptQueryEnvelope {
        self.query
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum V2ReceiptQueryAdmissionOutcome<'a> {
    Fresh(AdmittedV2ReceiptQuery<'a>),
    VerifiedReplay(VerifiedReplayV2ReceiptQuery<'a>),
}

pub struct V2ReceiptQueryAdmission<'a> {
    signature_verifier: &'a dyn V2ReceiptQuerySignatureVerifier,
    replay_guard: &'a dyn AuthorizationReplayGuard,
}

impl<'a> V2ReceiptQueryAdmission<'a> {
    pub fn new(
        signature_verifier: &'a dyn V2ReceiptQuerySignatureVerifier,
        replay_guard: &'a dyn AuthorizationReplayGuard,
    ) -> Self {
        Self {
            signature_verifier,
            replay_guard,
        }
    }

    pub fn admit_or_replay<'query>(
        &self,
        query: &'query V2ReceiptQueryEnvelope,
        now_ms: i64,
    ) -> Result<V2ReceiptQueryAdmissionOutcome<'query>, V2ReceiptQueryAdmissionError> {
        if !verify_receipt_query_signature(query, self.signature_verifier) {
            return Err(V2ReceiptQueryAdmissionError::SignatureRejected);
        }
        if query.expires_at() <= now_ms {
            return Err(V2ReceiptQueryAdmissionError::Expired);
        }
        match self.replay_guard.consume(
            &query.authorization_replay_identity(),
            query.expires_at(),
            now_ms,
        ) {
            ReplayGuardResult::Consumed => Ok(V2ReceiptQueryAdmissionOutcome::Fresh(
                AdmittedV2ReceiptQuery { query },
            )),
            ReplayGuardResult::Replayed => Ok(V2ReceiptQueryAdmissionOutcome::VerifiedReplay(
                VerifiedReplayV2ReceiptQuery { query },
            )),
            ReplayGuardResult::Saturated | ReplayGuardResult::Unavailable => {
                Err(V2ReceiptQueryAdmissionError::ReplayUnavailable)
            }
        }
    }
}
