//! Exact MQTT v2 topic namespace and delivery policy.

use std::fmt;

const MAX_IDENTIFIER_BYTES: usize = 64;

/// Inbound application routes accepted for one exact requester projection.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RoutedInboundTopic {
    Command,
    Control,
    Admin,
    ArtifactAck { transfer_id: String },
}

/// All MQTT v2 topic classes with explicit transport policy.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2TopicKind {
    Command,
    Control,
    Admin,
    Response,
    Event,
    Status,
    Capabilities,
    ArtifactChunk,
    ArtifactAck,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MqttQos {
    AtLeastOnce,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TopicDeliveryPolicy {
    pub qos: MqttQos,
    pub retained: bool,
}

/// Returns the required QoS and retain bit for one topic class.
pub fn delivery_policy(kind: V2TopicKind) -> TopicDeliveryPolicy {
    TopicDeliveryPolicy {
        qos: MqttQos::AtLeastOnce,
        retained: matches!(kind, V2TopicKind::Status | V2TopicKind::Capabilities),
    }
}

/// Exact topics bound to one instance, session, and enrolled requester.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MqttV2TopicSet {
    instance_id: String,
    session_id: String,
    requester_id: String,
    requester_base: String,
    session_base: String,
}

impl MqttV2TopicSet {
    pub fn new(
        instance_id: impl Into<String>,
        session_id: impl Into<String>,
        requester_id: impl Into<String>,
    ) -> Result<Self, MqttV2TopicError> {
        let instance_id = instance_id.into();
        let session_id = session_id.into();
        let requester_id = requester_id.into();
        for value in [&instance_id, &session_id, &requester_id] {
            validate_identifier(value)?;
        }
        let session_base = format!("yeonjang/v2/instances/{instance_id}/sessions/{session_id}");
        let requester_base = format!("{session_base}/requesters/{requester_id}");
        Ok(Self {
            instance_id,
            session_id,
            requester_id,
            requester_base,
            session_base,
        })
    }

    pub fn command(&self) -> String {
        format!("{}/command", self.requester_base)
    }

    pub fn control(&self) -> String {
        format!("{}/control", self.requester_base)
    }

    pub fn admin(&self) -> String {
        format!("{}/admin", self.requester_base)
    }

    pub fn response(&self) -> String {
        format!("{}/response", self.requester_base)
    }

    pub fn event(&self) -> String {
        format!("{}/event", self.requester_base)
    }

    pub fn status(&self) -> String {
        format!("{}/status", self.session_base)
    }

    pub fn capabilities(&self) -> String {
        format!("{}/capabilities", self.session_base)
    }

    pub fn artifact_chunk(&self, transfer_id: &str) -> Result<String, MqttV2TopicError> {
        validate_identifier(transfer_id)?;
        Ok(format!(
            "{}/artifact/{transfer_id}/chunk",
            self.requester_base
        ))
    }

    pub fn artifact_ack(&self, transfer_id: &str) -> Result<String, MqttV2TopicError> {
        validate_identifier(transfer_id)?;
        Ok(format!(
            "{}/artifact/{transfer_id}/ack",
            self.requester_base
        ))
    }

    /// The only wildcard subscription in the requester namespace. Every
    /// delivered concrete topic is still parsed by `route_inbound` and bound
    /// to the signed transfer ID before use-case execution.
    pub fn artifact_ack_filter(&self) -> String {
        format!("{}/artifact/+/ack", self.requester_base)
    }

    /// Routes only an exact command/control/admin or artifact acknowledgement.
    pub fn route_inbound(
        &self,
        topic: impl AsRef<str>,
    ) -> Result<RoutedInboundTopic, MqttV2TopicError> {
        let topic = topic.as_ref();
        if topic == self.command() {
            return Ok(RoutedInboundTopic::Command);
        }
        if topic == self.control() {
            return Ok(RoutedInboundTopic::Control);
        }
        if topic == self.admin() {
            return Ok(RoutedInboundTopic::Admin);
        }
        let prefix = format!("{}/artifact/", self.requester_base);
        let Some(transfer_id) = topic
            .strip_prefix(&prefix)
            .and_then(|remainder| remainder.strip_suffix("/ack"))
        else {
            return Err(MqttV2TopicError::NotBoundTopic);
        };
        validate_identifier(transfer_id).map_err(|_| MqttV2TopicError::NotBoundTopic)?;
        Ok(RoutedInboundTopic::ArtifactAck {
            transfer_id: transfer_id.to_string(),
        })
    }

    pub fn instance_id(&self) -> &str {
        &self.instance_id
    }

    pub fn session_id(&self) -> &str {
        &self.session_id
    }

    pub fn requester_id(&self) -> &str {
        &self.requester_id
    }
}

/// Invalid identifier syntax or a topic outside the bound requester projection.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MqttV2TopicError {
    InvalidIdentifier,
    NotBoundTopic,
}

impl fmt::Display for MqttV2TopicError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::InvalidIdentifier => "invalid MQTT v2 identifier",
            Self::NotBoundTopic => "topic is not bound to this requester projection",
        })
    }
}

impl std::error::Error for MqttV2TopicError {}

pub fn validate_identifier(value: &str) -> Result<(), MqttV2TopicError> {
    if value.is_empty() || value.len() > MAX_IDENTIFIER_BYTES {
        return Err(MqttV2TopicError::InvalidIdentifier);
    }
    let mut bytes = value.bytes();
    let Some(first) = bytes.next() else {
        return Err(MqttV2TopicError::InvalidIdentifier);
    };
    if !is_lowercase_alphanumeric(first)
        || !bytes.all(|byte| is_lowercase_alphanumeric(byte) || matches!(byte, b'-' | b'_'))
        || !value.bytes().last().is_some_and(is_lowercase_alphanumeric)
    {
        return Err(MqttV2TopicError::InvalidIdentifier);
    }
    Ok(())
}

fn is_lowercase_alphanumeric(byte: u8) -> bool {
    byte.is_ascii_lowercase() || byte.is_ascii_digit()
}
