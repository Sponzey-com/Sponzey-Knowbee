//! Signed retained MQTT v2 status publication adapter.
//!
//! The adapter owns only the status sequence and wire conversion. The runtime
//! pump owns publication cadence and shutdown ordering; the broker owns Last
//! Will publication after an unexpected disconnect.

use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use crate::mqtt_v2_connection::MqttV2LastWill;
use crate::mqtt_v2_topics::{MqttQos, MqttV2TopicSet};
use crate::protocol_v2_status::{V2StatusReason, V2StatusSnapshot, V2StatusState};
use crate::protocol_v2_terminal::{V2ResponseSigner, V2ResponseSigningContext};

const MIN_ONLINE_TTL_MS: i64 = 3_000;
const MAX_ONLINE_TTL_MS: i64 = 5 * 60_000;
const MAX_STATUS_PAYLOAD_BYTES: usize = 65_536;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MqttV2StatusPublish {
    pub topic: String,
    pub payload: Vec<u8>,
    pub qos: MqttQos,
    pub retained: bool,
}

pub struct MqttV2StatusAdapter {
    topics: MqttV2TopicSet,
    target_fingerprint: String,
    issuer: String,
    key_id: String,
    online_ttl_ms: i64,
    signer: Arc<dyn V2ResponseSigner>,
    sequence: AtomicU64,
}

impl MqttV2StatusAdapter {
    pub fn new(
        topics: MqttV2TopicSet,
        target_fingerprint: impl Into<String>,
        issuer: impl Into<String>,
        key_id: impl Into<String>,
        online_ttl_ms: i64,
        signer: Arc<dyn V2ResponseSigner>,
    ) -> Result<Self, MqttV2StatusAdapterError> {
        let target_fingerprint = target_fingerprint.into();
        let issuer = issuer.into();
        let key_id = key_id.into();
        if issuer != topics.instance_id()
            || key_id.trim().is_empty()
            || !(MIN_ONLINE_TTL_MS..=MAX_ONLINE_TTL_MS).contains(&online_ttl_ms)
        {
            return Err(MqttV2StatusAdapterError::InvalidConfig);
        }
        // Delegate exact fingerprint syntax to the status Domain constructor.
        V2StatusSnapshot::new(
            topics.instance_id(),
            topics.session_id(),
            &target_fingerprint,
            V2StatusState::Online,
            1,
            1 + online_ttl_ms,
            1,
        )
        .map_err(|_| MqttV2StatusAdapterError::InvalidConfig)?;
        Ok(Self {
            topics,
            target_fingerprint,
            issuer,
            key_id,
            online_ttl_ms,
            signer,
            sequence: AtomicU64::new(0),
        })
    }

    /// Builds the immutable offline projection embedded in MQTT CONNECT.
    pub fn last_will(&self, now_ms: i64) -> Result<MqttV2LastWill, MqttV2StatusAdapterError> {
        let publish = self.build(
            V2StatusState::Offline,
            V2StatusReason::UnexpectedDisconnect,
            now_ms,
            i64::MAX,
        )?;
        MqttV2LastWill::new(publish.topic, publish.payload)
            .map_err(|_| MqttV2StatusAdapterError::InvalidConfig)
    }

    pub fn online(&self, now_ms: i64) -> Result<MqttV2StatusPublish, MqttV2StatusAdapterError> {
        let expires_at = now_ms
            .checked_add(self.online_ttl_ms)
            .ok_or(MqttV2StatusAdapterError::ClockInvalid)?;
        self.build(
            V2StatusState::Online,
            V2StatusReason::UnexpectedDisconnect,
            now_ms,
            expires_at,
        )
    }

    pub fn graceful_offline(
        &self,
        now_ms: i64,
    ) -> Result<MqttV2StatusPublish, MqttV2StatusAdapterError> {
        self.build(
            V2StatusState::Offline,
            V2StatusReason::GracefulShutdown,
            now_ms,
            i64::MAX,
        )
    }

    pub fn refresh_interval(&self) -> Duration {
        Duration::from_millis(u64::try_from((self.online_ttl_ms / 3).max(1_000)).unwrap_or(1_000))
    }

    fn build(
        &self,
        state: V2StatusState,
        reason: V2StatusReason,
        now_ms: i64,
        expires_at: i64,
    ) -> Result<MqttV2StatusPublish, MqttV2StatusAdapterError> {
        let sequence = self
            .sequence
            .fetch_add(1, Ordering::Relaxed)
            .checked_add(1)
            .ok_or(MqttV2StatusAdapterError::SequenceExhausted)?;
        let mut snapshot = V2StatusSnapshot::new(
            self.topics.instance_id(),
            self.topics.session_id(),
            &self.target_fingerprint,
            state,
            now_ms,
            expires_at,
            sequence,
        )
        .map_err(|_| MqttV2StatusAdapterError::ClockInvalid)?;
        if state == V2StatusState::Offline {
            snapshot = snapshot
                .with_offline_reason(reason)
                .map_err(|_| MqttV2StatusAdapterError::ClockInvalid)?;
        }
        let envelope = snapshot
            .sign(
                V2ResponseSigningContext {
                    message_id: format!("status-{}-{sequence}", self.topics.session_id()),
                    issued_at: now_ms,
                    expires_at,
                    issuer: self.issuer.clone(),
                    key_id: self.key_id.clone(),
                    audience: self.topics.session_id().to_string(),
                    nonce: format!("status-nonce-{}-{sequence}", self.topics.session_id()),
                },
                self.signer.as_ref(),
            )
            .map_err(|_| MqttV2StatusAdapterError::SigningFailed)?;
        let payload =
            serde_json::to_vec(&envelope).map_err(|_| MqttV2StatusAdapterError::SigningFailed)?;
        if payload.len() > MAX_STATUS_PAYLOAD_BYTES {
            return Err(MqttV2StatusAdapterError::SigningFailed);
        }
        Ok(MqttV2StatusPublish {
            topic: self.topics.status(),
            payload,
            qos: MqttQos::AtLeastOnce,
            retained: true,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MqttV2StatusAdapterError {
    InvalidConfig,
    ClockInvalid,
    SequenceExhausted,
    SigningFailed,
}
