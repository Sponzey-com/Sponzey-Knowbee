use std::collections::HashMap;
use std::fmt;
use std::sync::{Arc, Mutex};

use hmac::{Hmac, Mac};
use serde::Deserialize;
use sha2::Sha256;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AuthorizationReceipt {
    pub schema_version: u8,
    pub authorization_id: String,
    pub issuer: String,
    pub issuer_key_id: String,
    pub audience: String,
    pub method: String,
    pub resource_scope: String,
    pub command_id: String,
    pub operation_id: String,
    pub target_session_id: String,
    pub target_fingerprint: String,
    pub idempotency_key: String,
    pub expires_at: i64,
    pub proof: String,
}

impl fmt::Debug for AuthorizationReceipt {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("AuthorizationReceipt")
            .field("schema_version", &self.schema_version)
            .field("authorization_id", &self.authorization_id)
            .field("issuer", &self.issuer)
            .field("issuer_key_id", &self.issuer_key_id)
            .field("audience", &self.audience)
            .field("method", &self.method)
            .field("proof", &"[REDACTED]")
            .finish_non_exhaustive()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthorizationContext {
    pub method: String,
    pub resource_scope: String,
    pub command_id: String,
    pub operation_id: String,
    pub target_session_id: String,
    pub target_fingerprint: String,
    pub idempotency_key: String,
    pub expires_at: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthorizationRejection {
    Denied,
    Invalid,
    Expired,
    Replayed,
    ScopeMismatch,
    VerifierUnavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthorizationDecision {
    Authorized,
    Rejected(AuthorizationRejection),
}

pub trait AuthorizationVerifier: Send + Sync {
    fn verify(
        &self,
        receipt: &AuthorizationReceipt,
        context: &AuthorizationContext,
    ) -> AuthorizationDecision;
}

pub trait AuthorizationClock: Send + Sync {
    fn now_ms(&self) -> i64;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthorizationVerifierBuildError {
    InvalidSecret,
    InvalidIssuer,
    InvalidAudience,
    InvalidReplayCapacity,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReplayGuardResult {
    Consumed,
    Replayed,
    Saturated,
    Unavailable,
}

pub trait AuthorizationReplayGuard: Send + Sync {
    fn consume(&self, authorization_id: &str, expires_at: i64, now_ms: i64) -> ReplayGuardResult;
}

#[derive(Debug)]
pub struct InMemoryAuthorizationReplayGuard {
    capacity: usize,
    entries: Mutex<HashMap<String, i64>>,
}

impl InMemoryAuthorizationReplayGuard {
    pub fn new(capacity: usize) -> Result<Self, AuthorizationVerifierBuildError> {
        if capacity == 0 || capacity > u32::MAX as usize {
            return Err(AuthorizationVerifierBuildError::InvalidReplayCapacity);
        }
        Ok(Self {
            capacity,
            entries: Mutex::new(HashMap::new()),
        })
    }
}

impl AuthorizationReplayGuard for InMemoryAuthorizationReplayGuard {
    fn consume(&self, authorization_id: &str, expires_at: i64, now_ms: i64) -> ReplayGuardResult {
        let authorization_id = authorization_id.trim();
        if authorization_id.is_empty() || authorization_id.len() > 256 {
            return ReplayGuardResult::Unavailable;
        }
        let Ok(mut entries) = self.entries.lock() else {
            return ReplayGuardResult::Unavailable;
        };
        entries.retain(|_, entry_expiry| *entry_expiry >= now_ms);
        if entries.contains_key(authorization_id) {
            return ReplayGuardResult::Replayed;
        }
        if entries.len() >= self.capacity {
            return ReplayGuardResult::Saturated;
        }
        entries.insert(authorization_id.to_string(), expires_at);
        ReplayGuardResult::Consumed
    }
}

pub struct HmacAuthorizationVerifier {
    secret: Vec<u8>,
    issuer: String,
    issuer_key_id: String,
    audience: String,
    clock: Arc<dyn AuthorizationClock>,
    replay_guard: Arc<dyn AuthorizationReplayGuard>,
}

impl fmt::Debug for HmacAuthorizationVerifier {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("HmacAuthorizationVerifier")
            .field("secret", &"[REDACTED]")
            .field("issuer", &self.issuer)
            .field("issuer_key_id", &self.issuer_key_id)
            .field("audience", &self.audience)
            .finish_non_exhaustive()
    }
}

impl HmacAuthorizationVerifier {
    pub fn new(
        secret: &[u8],
        issuer: impl Into<String>,
        issuer_key_id: impl Into<String>,
        audience: impl Into<String>,
        clock: Arc<dyn AuthorizationClock>,
    ) -> Result<Self, AuthorizationVerifierBuildError> {
        let replay_guard = Arc::new(InMemoryAuthorizationReplayGuard::new(1024)?);
        Self::new_with_replay_guard(secret, issuer, issuer_key_id, audience, clock, replay_guard)
    }

    pub fn new_with_replay_guard(
        secret: &[u8],
        issuer: impl Into<String>,
        issuer_key_id: impl Into<String>,
        audience: impl Into<String>,
        clock: Arc<dyn AuthorizationClock>,
        replay_guard: Arc<dyn AuthorizationReplayGuard>,
    ) -> Result<Self, AuthorizationVerifierBuildError> {
        if secret.len() < 16 {
            return Err(AuthorizationVerifierBuildError::InvalidSecret);
        }
        let issuer = issuer.into();
        if issuer.trim().is_empty() {
            return Err(AuthorizationVerifierBuildError::InvalidIssuer);
        }
        let issuer_key_id = issuer_key_id.into();
        if issuer_key_id.trim().is_empty() || issuer_key_id.len() > 256 {
            return Err(AuthorizationVerifierBuildError::InvalidIssuer);
        }
        let audience = audience.into();
        if audience.trim().is_empty() {
            return Err(AuthorizationVerifierBuildError::InvalidAudience);
        }
        Ok(Self {
            secret: secret.to_vec(),
            issuer,
            issuer_key_id,
            audience,
            clock,
            replay_guard,
        })
    }
}

impl AuthorizationVerifier for HmacAuthorizationVerifier {
    fn verify(
        &self,
        receipt: &AuthorizationReceipt,
        context: &AuthorizationContext,
    ) -> AuthorizationDecision {
        if receipt.schema_version != 1
            || receipt.issuer != self.issuer
            || receipt.issuer_key_id != self.issuer_key_id
            || receipt.audience != self.audience
            || receipt.method != context.method
            || receipt.resource_scope != context.resource_scope
            || receipt.command_id != context.command_id
            || receipt.operation_id != context.operation_id
            || receipt.target_session_id != context.target_session_id
            || receipt.target_fingerprint != context.target_fingerprint
            || receipt.idempotency_key != context.idempotency_key
            || receipt.expires_at != context.expires_at
        {
            return AuthorizationDecision::Rejected(AuthorizationRejection::ScopeMismatch);
        }
        if self.clock.now_ms() > receipt.expires_at {
            return AuthorizationDecision::Rejected(AuthorizationRejection::Expired);
        }
        let Some(proof) = decode_hex_proof(&receipt.proof) else {
            return AuthorizationDecision::Rejected(AuthorizationRejection::Invalid);
        };
        let Ok(mut mac) = Hmac::<Sha256>::new_from_slice(&self.secret) else {
            return AuthorizationDecision::Rejected(AuthorizationRejection::VerifierUnavailable);
        };
        mac.update(canonical_payload(receipt).as_bytes());
        if mac.verify_slice(&proof).is_err() {
            return AuthorizationDecision::Rejected(AuthorizationRejection::Invalid);
        }
        match self.replay_guard.consume(
            &receipt.authorization_id,
            receipt.expires_at,
            self.clock.now_ms(),
        ) {
            ReplayGuardResult::Consumed => AuthorizationDecision::Authorized,
            ReplayGuardResult::Replayed => {
                AuthorizationDecision::Rejected(AuthorizationRejection::Replayed)
            }
            ReplayGuardResult::Saturated | ReplayGuardResult::Unavailable => {
                AuthorizationDecision::Rejected(AuthorizationRejection::VerifierUnavailable)
            }
        }
    }
}

#[derive(Debug, Default)]
pub struct RejectAllAuthorizationVerifier;

impl AuthorizationVerifier for RejectAllAuthorizationVerifier {
    fn verify(
        &self,
        _receipt: &AuthorizationReceipt,
        _context: &AuthorizationContext,
    ) -> AuthorizationDecision {
        AuthorizationDecision::Rejected(AuthorizationRejection::VerifierUnavailable)
    }
}

fn canonical_payload(receipt: &AuthorizationReceipt) -> String {
    [
        receipt.schema_version.to_string(),
        receipt.authorization_id.clone(),
        receipt.issuer.clone(),
        receipt.issuer_key_id.clone(),
        receipt.audience.clone(),
        receipt.method.clone(),
        receipt.resource_scope.clone(),
        receipt.command_id.clone(),
        receipt.operation_id.clone(),
        receipt.target_session_id.clone(),
        receipt.target_fingerprint.clone(),
        receipt.idempotency_key.clone(),
        receipt.expires_at.to_string(),
    ]
    .into_iter()
    .map(|value| format!("{}:{value}", value.len()))
    .collect()
}

fn decode_hex_proof(value: &str) -> Option<[u8; 32]> {
    if value.len() != 64 {
        return None;
    }
    let mut decoded = [0_u8; 32];
    for (index, byte) in decoded.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&value[index * 2..index * 2 + 2], 16).ok()?;
    }
    Some(decoded)
}

#[cfg(test)]
mod tests {
    use super::{
        AuthorizationClock, AuthorizationContext, AuthorizationDecision, AuthorizationReceipt,
        AuthorizationRejection, AuthorizationReplayGuard, AuthorizationVerifier,
        HmacAuthorizationVerifier, InMemoryAuthorizationReplayGuard,
        RejectAllAuthorizationVerifier, ReplayGuardResult, canonical_payload, decode_hex_proof,
    };
    use hmac::{Hmac, Mac};
    use sha2::Sha256;
    use std::sync::Arc;

    #[test]
    fn receipt_debug_redacts_proof_and_default_verifier_fails_closed() {
        let receipt = AuthorizationReceipt {
            schema_version: 1,
            authorization_id: "authorization-1".to_string(),
            issuer: "issuer-1".to_string(),
            issuer_key_id: "key-1".to_string(),
            audience: "yeonjang-1".to_string(),
            method: "camera.capture".to_string(),
            resource_scope: "camera".to_string(),
            command_id: "command-1".to_string(),
            operation_id: "operation-1".to_string(),
            target_session_id: "session-1".to_string(),
            target_fingerprint: "fingerprint-1".to_string(),
            idempotency_key: "idempotency-1".to_string(),
            expires_at: 4_000_000_000_000,
            proof: "private-proof".to_string(),
        };
        let context = AuthorizationContext {
            method: receipt.method.clone(),
            resource_scope: receipt.resource_scope.clone(),
            command_id: receipt.command_id.clone(),
            operation_id: receipt.operation_id.clone(),
            target_session_id: receipt.target_session_id.clone(),
            target_fingerprint: receipt.target_fingerprint.clone(),
            idempotency_key: receipt.idempotency_key.clone(),
            expires_at: receipt.expires_at,
        };

        let debug = format!("{receipt:?}");
        assert!(!debug.contains("private-proof"));
        assert!(debug.contains("[REDACTED]"));
        assert_eq!(
            RejectAllAuthorizationVerifier.verify(&receipt, &context),
            AuthorizationDecision::Rejected(AuthorizationRejection::VerifierUnavailable)
        );
    }

    #[test]
    fn canonical_payload_matches_the_typescript_utf8_fixture() {
        let receipt = AuthorizationReceipt {
            schema_version: 1,
            authorization_id: "승인-1".to_string(),
            issuer: "knowbee-core".to_string(),
            issuer_key_id: "mqtt-connection-password-v1".to_string(),
            audience: "yeonjang-main".to_string(),
            method: "camera.capture".to_string(),
            resource_scope: "camera".to_string(),
            command_id: "command-1".to_string(),
            operation_id: "operation-1".to_string(),
            target_session_id: "target-session-1".to_string(),
            target_fingerprint: format!("sha256:{}", "a".repeat(64)),
            idempotency_key: "idempotency-1".to_string(),
            expires_at: 4_000_000_000_000,
            proof: String::new(),
        };
        let canonical = canonical_payload(&receipt);
        assert_eq!(
            canonical,
            format!(
                "1:18:승인-112:knowbee-core27:mqtt-connection-password-v1\
                 13:yeonjang-main14:camera.capture6:camera9:command-1\
                 11:operation-116:target-session-171:sha256:{}\
                 13:idempotency-113:4000000000000",
                "a".repeat(64)
            )
            .replace(' ', "")
        );
        let mut mac =
            Hmac::<Sha256>::new_from_slice(b"0123456789abcdef").expect("fixture HMAC key");
        mac.update(canonical.as_bytes());
        let expected =
            decode_hex_proof("0e93d9bdaf9e1234f0a767e1248a436ad7215258e42635dc5e884b166f9c9e88")
                .expect("fixture proof");
        assert_eq!(mac.finalize().into_bytes().as_slice(), expected);
    }

    struct FixedClock(i64);

    impl AuthorizationClock for FixedClock {
        fn now_ms(&self) -> i64 {
            self.0
        }
    }

    #[test]
    fn hmac_verifier_checks_exact_scope_expiry_and_proof() {
        let secret = b"test-authorization-secret";
        let context = AuthorizationContext {
            method: "camera.capture".to_string(),
            resource_scope: "camera".to_string(),
            command_id: "command-1".to_string(),
            operation_id: "operation-1".to_string(),
            target_session_id: "session-1".to_string(),
            target_fingerprint: "fingerprint-1".to_string(),
            idempotency_key: "idempotency-1".to_string(),
            expires_at: 2_000,
        };
        let receipt = signed_receipt(secret, &context);
        let verifier = HmacAuthorizationVerifier::new(
            secret,
            "issuer-1",
            "key-1",
            "yeonjang-1",
            Arc::new(FixedClock(1_000)),
        )
        .expect("valid verifier");

        assert_eq!(
            verifier.verify(&receipt, &context),
            AuthorizationDecision::Authorized
        );
        assert_eq!(
            verifier.verify(&receipt, &context),
            AuthorizationDecision::Rejected(AuthorizationRejection::Replayed)
        );

        let mut wrong_scope = context.clone();
        wrong_scope.operation_id = "operation-other".to_string();
        assert_eq!(
            verifier.verify(&receipt, &wrong_scope),
            AuthorizationDecision::Rejected(AuthorizationRejection::ScopeMismatch)
        );
        let mut wrong_audience = receipt.clone();
        wrong_audience.audience = "other-runtime".to_string();
        assert_eq!(
            verifier.verify(&wrong_audience, &context),
            AuthorizationDecision::Rejected(AuthorizationRejection::ScopeMismatch)
        );
        let mut wrong_key = receipt.clone();
        wrong_key.issuer_key_id = "key-other".to_string();
        assert_eq!(
            verifier.verify(&wrong_key, &context),
            AuthorizationDecision::Rejected(AuthorizationRejection::ScopeMismatch)
        );
        let mut wrong_resource = receipt.clone();
        wrong_resource.resource_scope = "screen".to_string();
        assert_eq!(
            verifier.verify(&wrong_resource, &context),
            AuthorizationDecision::Rejected(AuthorizationRejection::ScopeMismatch)
        );

        let expired = HmacAuthorizationVerifier::new(
            secret,
            "issuer-1",
            "key-1",
            "yeonjang-1",
            Arc::new(FixedClock(2_001)),
        )
        .expect("valid verifier");
        assert_eq!(
            expired.verify(&receipt, &context),
            AuthorizationDecision::Rejected(AuthorizationRejection::Expired)
        );

        let mut tampered = receipt.clone();
        let replacement = if tampered.proof.starts_with('0') {
            "1"
        } else {
            "0"
        };
        tampered.proof.replace_range(0..1, replacement);
        assert_eq!(
            verifier.verify(&tampered, &context),
            AuthorizationDecision::Rejected(AuthorizationRejection::Invalid)
        );
        assert!(!format!("{verifier:?}").contains("test-authorization-secret"));
    }

    #[test]
    fn in_memory_replay_guard_is_bounded_and_evicts_expired_entries() {
        let guard = InMemoryAuthorizationReplayGuard::new(1).expect("bounded guard");
        assert_eq!(
            guard.consume("authorization-1", 2_000, 1_000),
            ReplayGuardResult::Consumed
        );
        assert_eq!(
            guard.consume("authorization-2", 3_000, 1_000),
            ReplayGuardResult::Saturated
        );
        assert_eq!(
            guard.consume("authorization-2", 3_000, 2_001),
            ReplayGuardResult::Consumed
        );
    }

    fn signed_receipt(secret: &[u8], context: &AuthorizationContext) -> AuthorizationReceipt {
        let mut receipt = AuthorizationReceipt {
            schema_version: 1,
            authorization_id: "authorization-1".to_string(),
            issuer: "issuer-1".to_string(),
            issuer_key_id: "key-1".to_string(),
            audience: "yeonjang-1".to_string(),
            method: context.method.clone(),
            resource_scope: context.resource_scope.clone(),
            command_id: context.command_id.clone(),
            operation_id: context.operation_id.clone(),
            target_session_id: context.target_session_id.clone(),
            target_fingerprint: context.target_fingerprint.clone(),
            idempotency_key: context.idempotency_key.clone(),
            expires_at: context.expires_at,
            proof: String::new(),
        };
        let mut mac = Hmac::<Sha256>::new_from_slice(secret).expect("test secret");
        mac.update(canonical_payload(&receipt).as_bytes());
        receipt.proof = mac
            .finalize()
            .into_bytes()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect();
        receipt
    }
}
