//! Application owner for one read-only capture permission projection.
//!
//! The use case reads canonical policy, then invokes one injected
//! non-prompting observation port. It performs no policy write, platform
//! effect, MQTT operation, or operating-system permission request.

use std::sync::Arc;

use crate::capability_permission::{
    CanonicalCapturePermissionProjection, CaptureCapabilityAvailability,
    CapturePermissionObservations, capture_permission_projection_from_policy_availability,
};
use crate::policy_repository::{PermissionPolicyReader, PolicySnapshotRead};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CapturePermissionReadOwner {
    instance_id: String,
    session_id: String,
    target_fingerprint: String,
}

impl CapturePermissionReadOwner {
    pub fn new(
        instance_id: impl Into<String>,
        session_id: impl Into<String>,
        target_fingerprint: impl Into<String>,
    ) -> Result<Self, CapturePermissionReadIdentityError> {
        let owner = Self {
            instance_id: instance_id.into(),
            session_id: session_id.into(),
            target_fingerprint: target_fingerprint.into(),
        };
        owner.validate()?;
        Ok(owner)
    }

    fn validate(&self) -> Result<(), CapturePermissionReadIdentityError> {
        if !valid_identity(&self.instance_id)
            || !valid_identity(&self.session_id)
            || !is_sha256_digest(&self.target_fingerprint)
        {
            return Err(CapturePermissionReadIdentityError::InvalidIdentity);
        }
        Ok(())
    }

    fn matches(&self, request: &CapturePermissionReadRequest) -> bool {
        self.instance_id == request.instance_id
            && self.session_id == request.session_id
            && self.target_fingerprint == request.target_fingerprint
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CapturePermissionReadRequest {
    instance_id: String,
    session_id: String,
    target_fingerprint: String,
}

impl CapturePermissionReadRequest {
    pub fn new(
        instance_id: impl Into<String>,
        session_id: impl Into<String>,
        target_fingerprint: impl Into<String>,
    ) -> Result<Self, CapturePermissionReadIdentityError> {
        let request = Self {
            instance_id: instance_id.into(),
            session_id: session_id.into(),
            target_fingerprint: target_fingerprint.into(),
        };
        CapturePermissionReadOwner {
            instance_id: request.instance_id.clone(),
            session_id: request.session_id.clone(),
            target_fingerprint: request.target_fingerprint.clone(),
        }
        .validate()?;
        Ok(request)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CapturePermissionReadIdentityError {
    InvalidIdentity,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CapturePermissionObservationRead {
    Snapshot {
        availability: CaptureCapabilityAvailability,
        observations: CapturePermissionObservations,
    },
    Unavailable,
}

/// Purpose-specific read port implemented by a platform adapter.
pub trait CapturePermissionObservationPort: Send + Sync {
    fn observe(&self) -> CapturePermissionObservationRead;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CapturePermissionReadResult {
    Available {
        rows: [CanonicalCapturePermissionProjection; 2],
    },
    BindingMismatch,
    PolicyUnavailable,
    ObservationUnavailable,
}

pub struct CapturePermissionReadUseCase {
    owner: CapturePermissionReadOwner,
    policy: Arc<dyn PermissionPolicyReader>,
    observation: Arc<dyn CapturePermissionObservationPort>,
}

impl CapturePermissionReadUseCase {
    pub fn new(
        owner: CapturePermissionReadOwner,
        policy: Arc<dyn PermissionPolicyReader>,
        observation: Arc<dyn CapturePermissionObservationPort>,
    ) -> Self {
        Self {
            owner,
            policy,
            observation,
        }
    }

    pub fn execute(&self, request: &CapturePermissionReadRequest) -> CapturePermissionReadResult {
        if !self.owner.matches(request) {
            return CapturePermissionReadResult::BindingMismatch;
        }
        let PolicySnapshotRead::Snapshot(policy) = self.policy.snapshot() else {
            return CapturePermissionReadResult::PolicyUnavailable;
        };
        if policy.target_instance_id() != self.owner.instance_id {
            return CapturePermissionReadResult::PolicyUnavailable;
        }
        let CapturePermissionObservationRead::Snapshot {
            availability,
            observations,
        } = self.observation.observe()
        else {
            return CapturePermissionReadResult::ObservationUnavailable;
        };
        CapturePermissionReadResult::Available {
            rows: capture_permission_projection_from_policy_availability(
                availability,
                &policy,
                observations,
            ),
        }
    }
}

fn valid_identity(value: &str) -> bool {
    !value.trim().is_empty()
        && value.len() <= 256
        && !value.bytes().any(|byte| byte.is_ascii_control())
}

fn is_sha256_digest(value: &str) -> bool {
    value.len() == 71
        && value.strip_prefix("sha256:").is_some_and(|digest| {
            digest.len() == 64
                && digest
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        })
}
