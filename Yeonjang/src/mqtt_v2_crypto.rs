//! Production HMAC boundary shared by every strict MQTT v2 protocol adapter.
//!
//! Protocol modules own canonical signing bytes. This external-interface
//! adapter owns immutable key selection, exact issuer/key identity and
//! constant-time MAC verification. It never logs key or proof material.

use std::fmt;

use hmac::{Hmac, Mac};
use sha2::Sha256;

use crate::protocol_v2::V2CommandSignatureVerifier;
use crate::protocol_v2_artifact::V2ArtifactSignatureVerifier;
use crate::protocol_v2_capabilities::V2CapabilitiesSignatureVerifier;
use crate::protocol_v2_control::V2ControlSignatureVerifier;
use crate::protocol_v2_permission_query::V2CapturePermissionQuerySignatureVerifier;
use crate::protocol_v2_policy_admin::V2PolicyAdminSignatureVerifier;
use crate::protocol_v2_receipt_query::V2ReceiptQuerySignatureVerifier;
use crate::protocol_v2_response_ack::V2ResponseAckSignatureVerifier;
use crate::protocol_v2_status::V2StatusSignatureVerifier;
use crate::protocol_v2_terminal::{V2ResponseSigner, V2ResponseSignerError};

const MIN_SECRET_BYTES: usize = 16;
const MAX_SECRET_BYTES: usize = 4_096;
const MAX_IDENTITY_BYTES: usize = 256;
const MAX_ROLLBACK_KEYS: usize = 2;

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MqttV2HmacBuildError {
    InvalidIdentity,
    InvalidSecret,
    TooManyRollbackKeys,
    DuplicateVerificationKey,
}

pub struct V2HmacKeySnapshot {
    issuer: String,
    key_id: String,
    secret: Vec<u8>,
}

impl V2HmacKeySnapshot {
    pub fn new(
        issuer: impl Into<String>,
        key_id: impl Into<String>,
        secret: Vec<u8>,
    ) -> Result<Self, MqttV2HmacBuildError> {
        let snapshot = Self {
            issuer: issuer.into(),
            key_id: key_id.into(),
            secret,
        };
        if !is_identity(&snapshot.issuer) || !is_identity(&snapshot.key_id) {
            return Err(MqttV2HmacBuildError::InvalidIdentity);
        }
        if !(MIN_SECRET_BYTES..=MAX_SECRET_BYTES).contains(&snapshot.secret.len()) {
            return Err(MqttV2HmacBuildError::InvalidSecret);
        }
        Ok(snapshot)
    }

    fn identity_matches(&self, issuer: &str, key_id: &str) -> bool {
        self.issuer == issuer && self.key_id == key_id
    }
}

impl fmt::Debug for V2HmacKeySnapshot {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("V2HmacKeySnapshot")
            .field("issuer", &self.issuer)
            .field("key_id", &self.key_id)
            .field("secret", &"[REDACTED]")
            .finish()
    }
}

impl Drop for V2HmacKeySnapshot {
    fn drop(&mut self) {
        self.secret.fill(0);
    }
}

pub struct MqttV2HmacCrypto {
    inbound: Vec<V2HmacKeySnapshot>,
    outbound: V2HmacKeySnapshot,
}

impl MqttV2HmacCrypto {
    pub fn new(
        inbound: V2HmacKeySnapshot,
        outbound: V2HmacKeySnapshot,
    ) -> Result<Self, MqttV2HmacBuildError> {
        Self::new_with_rollback(inbound, Vec::new(), outbound)
    }

    pub fn new_with_rollback(
        inbound_primary: V2HmacKeySnapshot,
        inbound_rollback: Vec<V2HmacKeySnapshot>,
        outbound: V2HmacKeySnapshot,
    ) -> Result<Self, MqttV2HmacBuildError> {
        if inbound_rollback.len() > MAX_ROLLBACK_KEYS {
            return Err(MqttV2HmacBuildError::TooManyRollbackKeys);
        }
        let mut inbound = Vec::with_capacity(1 + inbound_rollback.len());
        inbound.push(inbound_primary);
        for rollback in inbound_rollback {
            if inbound.iter().any(|existing| {
                existing.issuer == rollback.issuer && existing.key_id == rollback.key_id
            }) {
                return Err(MqttV2HmacBuildError::DuplicateVerificationKey);
            }
            inbound.push(rollback);
        }
        Ok(Self { inbound, outbound })
    }

    fn verify_mac(
        &self,
        issuer: &str,
        key_id: &str,
        signing_bytes: &[u8],
        signature_hex: &str,
    ) -> bool {
        let Some(signature) = decode_lower_hex_digest(signature_hex) else {
            return false;
        };
        let Some(key) = self
            .inbound
            .iter()
            .find(|key| key.identity_matches(issuer, key_id))
        else {
            return false;
        };
        let Ok(mut mac) = HmacSha256::new_from_slice(&key.secret) else {
            return false;
        };
        mac.update(signing_bytes);
        mac.verify_slice(&signature).is_ok()
    }
}

impl fmt::Debug for MqttV2HmacCrypto {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("MqttV2HmacCrypto")
            .field("inbound_key_count", &self.inbound.len())
            .field("inbound_keys", &self.inbound)
            .field("outbound_key", &self.outbound)
            .finish()
    }
}

macro_rules! implement_verifier {
    ($trait_name:ident) => {
        impl $trait_name for MqttV2HmacCrypto {
            fn verify(
                &self,
                issuer: &str,
                key_id: &str,
                signing_bytes: &[u8],
                signature_hex: &str,
            ) -> bool {
                self.verify_mac(issuer, key_id, signing_bytes, signature_hex)
            }
        }
    };
}

implement_verifier!(V2CommandSignatureVerifier);
implement_verifier!(V2ControlSignatureVerifier);
implement_verifier!(V2ReceiptQuerySignatureVerifier);
implement_verifier!(V2ResponseAckSignatureVerifier);
implement_verifier!(V2ArtifactSignatureVerifier);
implement_verifier!(V2CapabilitiesSignatureVerifier);
implement_verifier!(V2PolicyAdminSignatureVerifier);
implement_verifier!(V2CapturePermissionQuerySignatureVerifier);
implement_verifier!(V2StatusSignatureVerifier);

impl V2ResponseSigner for MqttV2HmacCrypto {
    fn sign(
        &self,
        issuer: &str,
        key_id: &str,
        signing_bytes: &[u8],
    ) -> Result<String, V2ResponseSignerError> {
        if !self.outbound.identity_matches(issuer, key_id) {
            return Err(V2ResponseSignerError::Unavailable);
        }
        let mut mac = HmacSha256::new_from_slice(&self.outbound.secret)
            .map_err(|_| V2ResponseSignerError::Unavailable)?;
        mac.update(signing_bytes);
        Ok(encode_lower_hex(&mac.finalize().into_bytes()))
    }
}

fn is_identity(value: &str) -> bool {
    !value.trim().is_empty()
        && value.len() <= MAX_IDENTITY_BYTES
        && !value.bytes().any(|byte| byte.is_ascii_control())
}

fn decode_lower_hex_digest(value: &str) -> Option<[u8; 32]> {
    if value.len() != 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return None;
    }
    let mut decoded = [0_u8; 32];
    for (index, output) in decoded.iter_mut().enumerate() {
        let start = index * 2;
        *output = u8::from_str_radix(&value[start..start + 2], 16).ok()?;
    }
    Some(decoded)
}

fn encode_lower_hex(bytes: &[u8]) -> String {
    use std::fmt::Write;

    let mut encoded = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        write!(&mut encoded, "{byte:02x}").expect("writing to a String cannot fail");
    }
    encoded
}
