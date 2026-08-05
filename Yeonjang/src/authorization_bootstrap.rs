use std::fmt;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use sha2::{Digest, Sha256};

use crate::authorization::{
    AuthorizationClock, AuthorizationReplayGuard, HmacAuthorizationVerifier,
    InMemoryAuthorizationReplayGuard,
};
use crate::side_effect_admission::SideEffectAdmission;

pub const MANAGED_AUTHORIZATION_ISSUER: &str = "knowbee-core";
pub const MANAGED_AUTHORIZATION_KEY_ID: &str = "mqtt-connection-password-v1";
const MANAGED_AUTHORIZATION_REPLAY_CAPACITY: usize = 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthorizationBootstrapError {
    MissingSecret,
    InvalidSecret,
    InvalidIssuer,
    InvalidAudience,
    InvalidReplayCapacity,
    VerifierBuildFailed,
}

pub struct AuthorizationBootstrapInput {
    issuer: String,
    issuer_key_id: String,
    audience: String,
    secret: Vec<u8>,
    replay_capacity: usize,
}

impl fmt::Debug for AuthorizationBootstrapInput {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("AuthorizationBootstrapInput")
            .field("issuer", &self.issuer)
            .field("issuer_key_id", &self.issuer_key_id)
            .field("audience", &self.audience)
            .field("secret", &"[REDACTED]")
            .field("replay_capacity", &self.replay_capacity)
            .finish()
    }
}

impl AuthorizationBootstrapInput {
    pub fn new(
        issuer: impl Into<String>,
        issuer_key_id: impl Into<String>,
        audience: impl Into<String>,
        secret: Vec<u8>,
        replay_capacity: usize,
    ) -> Result<Self, AuthorizationBootstrapError> {
        let issuer = issuer.into();
        if issuer.trim().is_empty() {
            return Err(AuthorizationBootstrapError::InvalidIssuer);
        }
        let issuer_key_id = issuer_key_id.into();
        if issuer_key_id.trim().is_empty() || issuer_key_id.len() > 256 {
            return Err(AuthorizationBootstrapError::InvalidIssuer);
        }
        let audience = audience.into();
        if audience.trim().is_empty() {
            return Err(AuthorizationBootstrapError::InvalidAudience);
        }
        if secret.is_empty() {
            return Err(AuthorizationBootstrapError::MissingSecret);
        }
        if secret.len() < 16 {
            return Err(AuthorizationBootstrapError::InvalidSecret);
        }
        if replay_capacity == 0 || replay_capacity > u32::MAX as usize {
            return Err(AuthorizationBootstrapError::InvalidReplayCapacity);
        }
        Ok(Self {
            issuer: issuer.trim().to_string(),
            issuer_key_id: issuer_key_id.trim().to_string(),
            audience: audience.trim().to_string(),
            secret,
            replay_capacity,
        })
    }
}

pub fn build_managed_mqtt_authorization(
    audience: impl Into<String>,
    secret: Vec<u8>,
) -> Result<AuthorizationBootstrapInput, AuthorizationBootstrapError> {
    AuthorizationBootstrapInput::new(
        MANAGED_AUTHORIZATION_ISSUER,
        MANAGED_AUTHORIZATION_KEY_ID,
        audience,
        normalize_managed_authorization_secret(secret),
        MANAGED_AUTHORIZATION_REPLAY_CAPACITY,
    )
}

fn normalize_managed_authorization_secret(secret: Vec<u8>) -> Vec<u8> {
    if secret.is_empty() || secret.len() >= 16 {
        return secret;
    }
    let mut digest = Sha256::new();
    digest.update(b"knowbee.yeonjang.execution-admission.v1\0");
    digest.update(secret);
    digest.finalize().to_vec()
}

pub fn build_managed_mqtt_admission(
    audience: impl Into<String>,
    secret: Vec<u8>,
    clock: Arc<dyn AuthorizationClock>,
) -> Result<SideEffectAdmission, AuthorizationBootstrapError> {
    build_side_effect_admission(build_managed_mqtt_authorization(audience, secret)?, clock)
}

#[derive(Debug, Default)]
pub struct SystemAuthorizationClock;

impl AuthorizationClock for SystemAuthorizationClock {
    fn now_ms(&self) -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .ok()
            .and_then(|duration| i64::try_from(duration.as_millis()).ok())
            .unwrap_or(i64::MAX)
    }
}

pub fn build_side_effect_admission(
    input: AuthorizationBootstrapInput,
    clock: Arc<dyn AuthorizationClock>,
) -> Result<SideEffectAdmission, AuthorizationBootstrapError> {
    let replay_guard: Arc<dyn AuthorizationReplayGuard> = Arc::new(
        InMemoryAuthorizationReplayGuard::new(input.replay_capacity)
            .map_err(|_| AuthorizationBootstrapError::InvalidReplayCapacity)?,
    );
    let verifier = HmacAuthorizationVerifier::new_with_replay_guard(
        &input.secret,
        input.issuer,
        input.issuer_key_id,
        input.audience,
        clock,
        replay_guard,
    )
    .map_err(|_| AuthorizationBootstrapError::VerifierBuildFailed)?;
    Ok(SideEffectAdmission::new(Arc::new(verifier)))
}
