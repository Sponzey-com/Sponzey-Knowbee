//! Application owner for binding a post-checked capture effect to delivery.
//!
//! Platform evidence remains path-free. Registration durably precedes any
//! terminal descriptor that lets an MQTT requester fetch the artifact.

use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::artifact_lifecycle::ArtifactBinding;
use crate::artifact_repository::{ArtifactLifecycleStore, ArtifactRepositoryResult};
use crate::capture_artifact_postcheck::CaptureArtifactKind;
use crate::platform_operation::BoundPlatformOperation;
use crate::platform_port::{PlatformEffectReceipt, PlatformEffectReceiptError};

const MIN_TTL_MS: i64 = 60_000;
const MAX_TTL_MS: i64 = 60 * 60_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArtifactRegistrationBuildError {
    InvalidTtl,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArtifactRegistrationReject {
    EffectBindingMismatch,
    ArtifactEvidenceMissing,
    InvalidBinding,
    BindingConflict,
    StorageConflict,
    StorageUnavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ArtifactDeliveryDescriptor {
    schema_version: u16,
    artifact_ref: String,
    kind: CaptureArtifactKind,
    media_type: String,
    size_bytes: u64,
    full_digest: String,
    created_at_ms: i64,
    expires_at_ms: i64,
    lifecycle_revision: u64,
}

impl ArtifactDeliveryDescriptor {
    pub(crate) fn validate(&self) -> bool {
        self.schema_version == 1
            && is_prefixed_hex(&self.artifact_ref, "capture:")
            && is_prefixed_hex(&self.full_digest, "sha256:")
            && self.size_bytes > 0
            && self.created_at_ms > 0
            && self.expires_at_ms > self.created_at_ms
            && self.media_type
                == match self.kind {
                    CaptureArtifactKind::CameraJpeg => "image/jpeg",
                    CaptureArtifactKind::ScreenPng => "image/png",
                }
    }

    pub fn artifact_ref(&self) -> &str {
        &self.artifact_ref
    }

    pub fn kind(&self) -> CaptureArtifactKind {
        self.kind
    }

    pub fn media_type(&self) -> &str {
        &self.media_type
    }

    pub fn size_bytes(&self) -> u64 {
        self.size_bytes
    }

    pub fn full_digest(&self) -> &str {
        &self.full_digest
    }

    pub fn created_at_ms(&self) -> i64 {
        self.created_at_ms
    }

    pub fn expires_at_ms(&self) -> i64 {
        self.expires_at_ms
    }

    pub fn lifecycle_revision(&self) -> u64 {
        self.lifecycle_revision
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ArtifactRegistrationResult {
    Registered(ArtifactDeliveryDescriptor),
    AlreadyRegistered(ArtifactDeliveryDescriptor),
    Deferred { reason: ArtifactRegistrationReject },
    Rejected { reason: ArtifactRegistrationReject },
}

pub struct ArtifactRegistrationUseCase {
    store: Arc<dyn ArtifactLifecycleStore>,
    ttl_ms: i64,
}

impl ArtifactRegistrationUseCase {
    pub fn new(
        store: Arc<dyn ArtifactLifecycleStore>,
        ttl_ms: i64,
    ) -> Result<Self, ArtifactRegistrationBuildError> {
        if !(MIN_TTL_MS..=MAX_TTL_MS).contains(&ttl_ms) {
            return Err(ArtifactRegistrationBuildError::InvalidTtl);
        }
        Ok(Self { store, ttl_ms })
    }

    pub fn register(
        &self,
        operation: &BoundPlatformOperation,
        effect: &PlatformEffectReceipt,
    ) -> ArtifactRegistrationResult {
        if matches!(
            effect.validate_for(operation),
            Err(PlatformEffectReceiptError::BindingMismatch)
        ) {
            return rejected(ArtifactRegistrationReject::EffectBindingMismatch);
        }
        let Some(artifact) = effect.artifact() else {
            return rejected(ArtifactRegistrationReject::ArtifactEvidenceMissing);
        };
        let Some(expires_at_ms) = effect.completed_at_ms().checked_add(self.ttl_ms) else {
            return rejected(ArtifactRegistrationReject::InvalidBinding);
        };
        let binding = match ArtifactBinding::new(
            artifact.artifact_ref(),
            operation.requester_id(),
            operation.request_id(),
            operation.operation_id(),
            artifact.full_digest(),
            artifact.size_bytes(),
            effect.completed_at_ms(),
            expires_at_ms,
        ) {
            Ok(binding) => binding,
            Err(_) => return rejected(ArtifactRegistrationReject::InvalidBinding),
        };
        match self.store.register(binding) {
            ArtifactRepositoryResult::Registered { revision } => {
                ArtifactRegistrationResult::Registered(descriptor(effect, expires_at_ms, revision))
            }
            ArtifactRepositoryResult::Idempotent { revision } => {
                ArtifactRegistrationResult::AlreadyRegistered(descriptor(
                    effect,
                    expires_at_ms,
                    revision,
                ))
            }
            ArtifactRepositoryResult::BindingConflict => {
                rejected(ArtifactRegistrationReject::BindingConflict)
            }
            ArtifactRepositoryResult::StorageConflict => {
                deferred(ArtifactRegistrationReject::StorageConflict)
            }
            ArtifactRepositoryResult::Saturated | ArtifactRepositoryResult::Unavailable => {
                deferred(ArtifactRegistrationReject::StorageUnavailable)
            }
            ArtifactRepositoryResult::Applied { .. }
            | ArtifactRepositoryResult::RevisionConflict { .. }
            | ArtifactRepositoryResult::TransitionRejected { .. }
            | ArtifactRepositoryResult::Missing => {
                deferred(ArtifactRegistrationReject::StorageUnavailable)
            }
        }
    }
}

fn descriptor(
    effect: &PlatformEffectReceipt,
    expires_at_ms: i64,
    lifecycle_revision: u64,
) -> ArtifactDeliveryDescriptor {
    let artifact = effect
        .artifact()
        .expect("descriptor is built only after artifact evidence validation");
    ArtifactDeliveryDescriptor {
        schema_version: 1,
        artifact_ref: artifact.artifact_ref().to_string(),
        kind: artifact.kind(),
        media_type: match artifact.kind() {
            CaptureArtifactKind::CameraJpeg => "image/jpeg",
            CaptureArtifactKind::ScreenPng => "image/png",
        }
        .to_string(),
        size_bytes: artifact.size_bytes(),
        full_digest: artifact.full_digest().to_string(),
        created_at_ms: effect.completed_at_ms(),
        expires_at_ms,
        lifecycle_revision,
    }
}

fn rejected(reason: ArtifactRegistrationReject) -> ArtifactRegistrationResult {
    ArtifactRegistrationResult::Rejected { reason }
}

fn deferred(reason: ArtifactRegistrationReject) -> ArtifactRegistrationResult {
    ArtifactRegistrationResult::Deferred { reason }
}

fn is_prefixed_hex(value: &str, prefix: &str) -> bool {
    value.strip_prefix(prefix).is_some_and(|digest| {
        digest.len() == 64 && digest.bytes().all(|byte| byte.is_ascii_hexdigit())
    })
}
