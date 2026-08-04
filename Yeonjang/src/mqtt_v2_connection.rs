//! Side-effect-free direct MQTT v2 client construction.
//!
//! Bootstrap validates immutable inputs once. Polling the returned `EventLoop`
//! remains the caller's responsibility; this factory starts no task or runtime.

use std::fmt;
use std::time::Duration;

use rumqttc::{AsyncClient, EventLoop, LastWill, MqttOptions, QoS};
use sha2::{Digest, Sha256};

use crate::mqtt_transport::MqttTransportSecurity;
use crate::mqtt_v2_topics::validate_identifier;

const MAX_HOST_BYTES: usize = 253;
const MIN_KEEPALIVE_SECONDS: u64 = 5;
const MAX_KEEPALIVE_SECONDS: u64 = 300;
const MIN_REQUEST_CHANNEL_CAPACITY: usize = 2;
const MAX_REQUEST_CHANNEL_CAPACITY: usize = 256;
const MAX_PACKET_BYTES: usize = 512 * 1024;
const MAX_CREDENTIAL_BYTES: usize = 4_096;
const MAX_LAST_WILL_BYTES: usize = 65_536;

/// Signed offline status bytes fixed before MQTT CONNECT.
///
/// This type owns transport invariants only. The status protocol builder owns
/// schema, identity, expiry, reason and signature validation.
#[derive(PartialEq, Eq)]
pub struct MqttV2LastWill {
    topic: String,
    payload: Vec<u8>,
}

impl MqttV2LastWill {
    pub fn new(
        topic: impl Into<String>,
        payload: Vec<u8>,
    ) -> Result<Self, MqttV2ConnectionConfigError> {
        let will = Self {
            topic: topic.into(),
            payload,
        };
        let parts = will.topic.split('/').collect::<Vec<_>>();
        if parts.len() != 7
            || parts[0] != "yeonjang"
            || parts[1] != "v2"
            || parts[2] != "instances"
            || validate_identifier(parts[3]).is_err()
            || parts[4] != "sessions"
            || validate_identifier(parts[5]).is_err()
            || parts[6] != "status"
            || will.payload.is_empty()
            || will.payload.len() > MAX_LAST_WILL_BYTES
        {
            return Err(MqttV2ConnectionConfigError::InvalidLastWill);
        }
        Ok(will)
    }
}

impl fmt::Debug for MqttV2LastWill {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("MqttV2LastWill")
            .field("topic", &self.topic)
            .field("payload", &"[REDACTED]")
            .finish()
    }
}

/// Consuming broker login snapshot used only while constructing MQTT options.
///
/// The password is bounded UTF-8 because MQTT 3.1.1 credentials are encoded as
/// strings by rumqttc. Debug output never exposes either credential value.
#[derive(PartialEq, Eq)]
pub struct MqttV2BrokerCredentials {
    username: String,
    password: Vec<u8>,
}

impl MqttV2BrokerCredentials {
    pub fn new(
        username: impl Into<String>,
        password: Vec<u8>,
    ) -> Result<Self, MqttV2ConnectionConfigError> {
        let credentials = Self {
            username: username.into(),
            password,
        };
        if credentials.username.trim().is_empty()
            || credentials.username.len() > MAX_CREDENTIAL_BYTES
            || credentials.password.is_empty()
            || credentials.password.len() > MAX_CREDENTIAL_BYTES
            || std::str::from_utf8(&credentials.password).is_err()
        {
            return Err(MqttV2ConnectionConfigError::InvalidCredentials);
        }
        Ok(credentials)
    }
}

impl fmt::Debug for MqttV2BrokerCredentials {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("MqttV2BrokerCredentials")
            .field("username", &"[REDACTED]")
            .field("password", &"[REDACTED]")
            .finish()
    }
}

impl Drop for MqttV2BrokerCredentials {
    fn drop(&mut self) {
        self.password.fill(0);
    }
}

#[derive(PartialEq, Eq)]
pub struct MqttV2ConnectionConfig {
    host: String,
    port: u16,
    instance_id: String,
    session_id: String,
    keepalive_seconds: u64,
    request_channel_capacity: usize,
    transport: MqttTransportSecurity,
    credentials: Option<MqttV2BrokerCredentials>,
    last_will: Option<MqttV2LastWill>,
}

impl fmt::Debug for MqttV2ConnectionConfig {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("MqttV2ConnectionConfig")
            .field("host", &self.host)
            .field("port", &self.port)
            .field("instance_id", &self.instance_id)
            .field("session_id", &self.session_id)
            .field("keepalive_seconds", &self.keepalive_seconds)
            .field("request_channel_capacity", &self.request_channel_capacity)
            .field("transport", &self.transport)
            .field(
                "credentials",
                &self.credentials.as_ref().map(|_| "[CONFIGURED]"),
            )
            .field(
                "last_will",
                &self.last_will.as_ref().map(|will| will.topic.as_str()),
            )
            .finish()
    }
}

impl MqttV2ConnectionConfig {
    pub fn new(
        host: impl Into<String>,
        port: u16,
        instance_id: impl Into<String>,
        session_id: impl Into<String>,
        keepalive_seconds: u64,
        request_channel_capacity: usize,
        transport: MqttTransportSecurity,
    ) -> Result<Self, MqttV2ConnectionConfigError> {
        let config = Self {
            host: host.into().trim().to_string(),
            port,
            instance_id: instance_id.into(),
            session_id: session_id.into(),
            keepalive_seconds,
            request_channel_capacity,
            transport,
            credentials: None,
            last_will: None,
        };
        if config.host.is_empty()
            || config.host.len() > MAX_HOST_BYTES
            || config
                .host
                .bytes()
                .any(|byte| byte.is_ascii_whitespace() || matches!(byte, b'/' | b'\\'))
            || config.port == 0
            || validate_identifier(&config.instance_id).is_err()
            || validate_identifier(&config.session_id).is_err()
        {
            return Err(MqttV2ConnectionConfigError::InvalidIdentity);
        }
        if !(MIN_KEEPALIVE_SECONDS..=MAX_KEEPALIVE_SECONDS).contains(&keepalive_seconds)
            || !(MIN_REQUEST_CHANNEL_CAPACITY..=MAX_REQUEST_CHANNEL_CAPACITY)
                .contains(&request_channel_capacity)
        {
            return Err(MqttV2ConnectionConfigError::InvalidRuntimeBounds);
        }
        config
            .transport
            .validate_host(&config.host)
            .map_err(|_| MqttV2ConnectionConfigError::TransportRejected)?;
        Ok(config)
    }

    /// Binds validated broker authentication without retaining a second
    /// plaintext settings snapshot inside the runtime composition.
    pub fn with_credentials(mut self, credentials: MqttV2BrokerCredentials) -> Self {
        self.credentials = Some(credentials);
        self
    }

    /// Binds the signed retained offline projection before connection creation.
    pub fn with_last_will(mut self, last_will: MqttV2LastWill) -> Self {
        self.last_will = Some(last_will);
        self
    }

    /// Composition-root-only binding performed before `MqttOptions` exists.
    pub(crate) fn bind_last_will(&mut self, last_will: MqttV2LastWill) {
        self.last_will = Some(last_will);
    }

    pub fn build_options(&self) -> Result<MqttOptions, MqttV2ConnectionConfigError> {
        let mut options = MqttOptions::new(self.client_id(), &self.host, self.port);
        self.transport
            .apply(&self.host, &mut options)
            .map_err(|_| MqttV2ConnectionConfigError::TransportRejected)?;
        options.set_keep_alive(Duration::from_secs(self.keepalive_seconds));
        options.set_request_channel_capacity(self.request_channel_capacity);
        options.set_max_packet_size(MAX_PACKET_BYTES, MAX_PACKET_BYTES);
        if let Some(credentials) = &self.credentials {
            let password = std::str::from_utf8(&credentials.password)
                .map_err(|_| MqttV2ConnectionConfigError::InvalidCredentials)?;
            options.set_credentials(&credentials.username, password);
        }
        if let Some(last_will) = &self.last_will {
            options.set_last_will(LastWill::new(
                &last_will.topic,
                last_will.payload.clone(),
                QoS::AtLeastOnce,
                true,
            ));
        }
        // The application protocol owns durable idempotency; broker session
        // continuity additionally preserves QoS subscriptions/redelivery.
        options.set_clean_session(false);
        Ok(options)
    }

    pub fn instance_id(&self) -> &str {
        &self.instance_id
    }

    pub fn session_id(&self) -> &str {
        &self.session_id
    }

    pub fn has_credentials(&self) -> bool {
        self.credentials.is_some()
    }

    fn client_id(&self) -> String {
        let mut digest = Sha256::new();
        digest.update(b"knowbee-yeonjang-mqtt-client-v2\0");
        digest.update(self.instance_id.as_bytes());
        digest.update(b"\0");
        digest.update(self.session_id.as_bytes());
        let encoded = format!("{:x}", digest.finalize());
        format!("knowbee-y2-{}", &encoded[..40])
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MqttV2ConnectionConfigError {
    InvalidIdentity,
    InvalidRuntimeBounds,
    InvalidCredentials,
    InvalidLastWill,
    TransportRejected,
}

pub fn build_mqtt_v2_connection(
    config: &MqttV2ConnectionConfig,
) -> Result<(AsyncClient, EventLoop), MqttV2ConnectionConfigError> {
    Ok(AsyncClient::new(
        config.build_options()?,
        config.request_channel_capacity,
    ))
}
