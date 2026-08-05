//! Signed retained MQTT v2 capabilities read adapter.
//!
//! The platform snapshot is immutable for one runtime. Policy is read from the
//! canonical repository on each publication so an admitted admin transition
//! changes the next projection without copying policy state into the pump.

use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use crate::mqtt_v2_capability_projection::{
    V2PlatformCapabilitySnapshot, project_v2_capture_capabilities,
};
use crate::mqtt_v2_topics::{MqttQos, MqttV2TopicSet};
use crate::policy_repository::{PermissionPolicyReader, PolicySnapshotRead};
use crate::protocol_v2_capabilities::{V2CapabilitiesIdentity, V2CapabilitiesSnapshot};
use crate::protocol_v2_terminal::{V2ResponseSigner, V2ResponseSigningContext};

const MAX_CAPABILITIES_PAYLOAD_BYTES: usize = 65_536;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MqttV2CapabilitiesPublish {
    pub topic: String,
    pub payload: Vec<u8>,
    pub qos: MqttQos,
    pub retained: bool,
}

pub struct MqttV2CapabilitiesAdapter {
    topics: MqttV2TopicSet,
    target_fingerprint: String,
    platform: V2PlatformCapabilitySnapshot,
    policy: Arc<dyn PermissionPolicyReader>,
    issuer: String,
    key_id: String,
    ttl_ms: i64,
    signer: Arc<dyn V2ResponseSigner>,
    sequence: AtomicU64,
}

impl MqttV2CapabilitiesAdapter {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        topics: MqttV2TopicSet,
        target_fingerprint: impl Into<String>,
        platform: V2PlatformCapabilitySnapshot,
        policy: Arc<dyn PermissionPolicyReader>,
        issuer: impl Into<String>,
        key_id: impl Into<String>,
        ttl_ms: i64,
        signer: Arc<dyn V2ResponseSigner>,
    ) -> Result<Self, MqttV2CapabilitiesAdapterError> {
        let target_fingerprint = target_fingerprint.into();
        let issuer = issuer.into();
        let key_id = key_id.into();
        if issuer != topics.instance_id()
            || key_id.trim().is_empty()
            || !(1_000..=5 * 60_000).contains(&ttl_ms)
        {
            return Err(MqttV2CapabilitiesAdapterError::InvalidConfig);
        }
        V2CapabilitiesIdentity::new(
            topics.instance_id(),
            topics.session_id(),
            &target_fingerprint,
        )
        .map_err(|_| MqttV2CapabilitiesAdapterError::InvalidConfig)?;
        Ok(Self {
            topics,
            target_fingerprint,
            platform,
            policy,
            issuer,
            key_id,
            ttl_ms,
            signer,
            sequence: AtomicU64::new(0),
        })
    }

    pub fn publish(
        &self,
        now_ms: i64,
    ) -> Result<MqttV2CapabilitiesPublish, MqttV2CapabilitiesAdapterError> {
        let PolicySnapshotRead::Snapshot(policy) = self.policy.snapshot() else {
            return Err(MqttV2CapabilitiesAdapterError::PolicyUnavailable);
        };
        if policy.target_instance_id() != self.topics.instance_id() {
            return Err(MqttV2CapabilitiesAdapterError::PolicyUnavailable);
        }
        let projection = project_v2_capture_capabilities(&self.platform, &policy)
            .map_err(|_| MqttV2CapabilitiesAdapterError::ProjectionInvalid)?;
        let expires_at = now_ms
            .checked_add(self.ttl_ms)
            .ok_or(MqttV2CapabilitiesAdapterError::ClockInvalid)?;
        let sequence = self
            .sequence
            .fetch_add(1, Ordering::Relaxed)
            .checked_add(1)
            .ok_or(MqttV2CapabilitiesAdapterError::SequenceExhausted)?;
        let envelope = V2CapabilitiesSnapshot::new(
            V2CapabilitiesIdentity::new(
                self.topics.instance_id(),
                self.topics.session_id(),
                &self.target_fingerprint,
            )
            .map_err(|_| MqttV2CapabilitiesAdapterError::ProjectionInvalid)?,
            projection,
            now_ms,
            expires_at,
            sequence,
        )
        .map_err(|_| MqttV2CapabilitiesAdapterError::ProjectionInvalid)?
        .sign(
            V2ResponseSigningContext {
                message_id: format!("capabilities-{}-{sequence}", self.topics.session_id()),
                issued_at: now_ms,
                expires_at,
                issuer: self.issuer.clone(),
                key_id: self.key_id.clone(),
                audience: self.topics.session_id().to_string(),
                nonce: format!("capabilities-nonce-{}-{sequence}", self.topics.session_id()),
            },
            self.signer.as_ref(),
        )
        .map_err(|_| MqttV2CapabilitiesAdapterError::SigningFailed)?;
        let payload = serde_json::to_vec(&envelope)
            .map_err(|_| MqttV2CapabilitiesAdapterError::SigningFailed)?;
        if payload.len() > MAX_CAPABILITIES_PAYLOAD_BYTES {
            return Err(MqttV2CapabilitiesAdapterError::SigningFailed);
        }
        Ok(MqttV2CapabilitiesPublish {
            topic: self.topics.capabilities(),
            payload,
            qos: MqttQos::AtLeastOnce,
            retained: true,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MqttV2CapabilitiesAdapterError {
    InvalidConfig,
    PolicyUnavailable,
    ProjectionInvalid,
    ClockInvalid,
    SequenceExhausted,
    SigningFailed,
}
