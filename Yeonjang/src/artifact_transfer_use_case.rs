//! Application orchestration for artifact fetch, publication, and consumer ack.
//!
//! The canonical lifecycle transition is committed before reading/publishing
//! bytes. Consumer acknowledgement is committed before cleanup is requested.
//! This module does not depend on MQTT, filesystem paths, Tokio, or a clock.

use std::fmt;
use std::sync::Arc;

use crate::artifact_lifecycle::{
    ArtifactEvent, ArtifactFailureReason, ArtifactLifecycle, ArtifactLifecycleState,
    ArtifactTransitionReject,
};
use crate::artifact_repository::{
    ArtifactLifecycleRead, ArtifactLifecycleStore, ArtifactRepositoryResult,
};
use crate::artifact_transfer::{ArtifactChunk, ArtifactChunkConfig, build_artifact_chunks};
use crate::capture_artifact_postcheck::{
    CaptureArtifactKind, CaptureArtifactMetadata, post_check_capture_bytes,
};

#[derive(Clone, PartialEq, Eq)]
pub struct VerifiedArtifactBytes {
    artifact_ref: String,
    metadata: CaptureArtifactMetadata,
    bytes: Vec<u8>,
}

impl VerifiedArtifactBytes {
    pub fn new(
        artifact_ref: impl Into<String>,
        kind: CaptureArtifactKind,
        bytes: Vec<u8>,
    ) -> Result<Self, VerifiedArtifactSourceError> {
        let artifact_ref = artifact_ref.into();
        if artifact_ref.trim().is_empty() || artifact_ref.len() > 256 {
            return Err(VerifiedArtifactSourceError::Invalid);
        }
        let metadata = post_check_capture_bytes(kind, &bytes)
            .map_err(|_| VerifiedArtifactSourceError::Invalid)?;
        Ok(Self {
            artifact_ref,
            metadata,
            bytes,
        })
    }

    pub fn artifact_ref(&self) -> &str {
        &self.artifact_ref
    }

    pub fn metadata(&self) -> &CaptureArtifactMetadata {
        &self.metadata
    }

    pub fn bytes(&self) -> &[u8] {
        &self.bytes
    }
}

impl fmt::Debug for VerifiedArtifactBytes {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("VerifiedArtifactBytes")
            .field("artifact_ref", &self.artifact_ref)
            .field("metadata", &self.metadata)
            .field("bytes", &"[REDACTED]")
            .finish()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VerifiedArtifactSourceError {
    Missing,
    Invalid,
    Unavailable,
}

pub trait VerifiedArtifactSource: Send + Sync {
    fn read_verified(
        &self,
        artifact_ref: &str,
    ) -> Result<VerifiedArtifactBytes, VerifiedArtifactSourceError>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArtifactFetchCommand {
    artifact_ref: String,
    requester_id: String,
    request_id: String,
    operation_id: String,
    transfer_id: String,
    expected_revision: u64,
    now_ms: i64,
    chunk_config: ArtifactChunkConfig,
}

impl ArtifactFetchCommand {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        artifact_ref: impl Into<String>,
        requester_id: impl Into<String>,
        request_id: impl Into<String>,
        operation_id: impl Into<String>,
        transfer_id: impl Into<String>,
        expected_revision: u64,
        now_ms: i64,
        chunk_config: ArtifactChunkConfig,
    ) -> Self {
        Self {
            artifact_ref: artifact_ref.into(),
            requester_id: requester_id.into(),
            request_id: request_id.into(),
            operation_id: operation_id.into(),
            transfer_id: transfer_id.into(),
            expected_revision,
            now_ms,
            chunk_config,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ArtifactFetchResult {
    Prepared {
        chunks: Vec<ArtifactChunk>,
        lifecycle_revision: u64,
    },
    Rejected {
        reason: ArtifactTransferReject,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArtifactPublishCommand {
    artifact_ref: String,
    transfer_id: String,
    chunk_count: u32,
    expected_revision: u64,
    now_ms: i64,
}

impl ArtifactPublishCommand {
    pub fn new(
        artifact_ref: impl Into<String>,
        transfer_id: impl Into<String>,
        chunk_count: u32,
        expected_revision: u64,
        now_ms: i64,
    ) -> Self {
        Self {
            artifact_ref: artifact_ref.into(),
            transfer_id: transfer_id.into(),
            chunk_count,
            expected_revision,
            now_ms,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArtifactPublishResult {
    AwaitingAcknowledgement { lifecycle_revision: u64 },
    AlreadyRecorded { lifecycle_revision: u64 },
    Rejected { reason: ArtifactTransferReject },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArtifactPublishFailureResult {
    Failed { lifecycle_revision: u64 },
    Rejected { reason: ArtifactTransferReject },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArtifactAckCommand {
    artifact_ref: String,
    requester_id: String,
    transfer_id: String,
    full_digest: String,
    expected_revision: u64,
    now_ms: i64,
}

impl ArtifactAckCommand {
    pub fn new(
        artifact_ref: impl Into<String>,
        requester_id: impl Into<String>,
        transfer_id: impl Into<String>,
        full_digest: impl Into<String>,
        expected_revision: u64,
        now_ms: i64,
    ) -> Self {
        Self {
            artifact_ref: artifact_ref.into(),
            requester_id: requester_id.into(),
            transfer_id: transfer_id.into(),
            full_digest: full_digest.into(),
            expected_revision,
            now_ms,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArtifactAckResult {
    CleanupRequired { lifecycle_revision: u64 },
    AlreadyAcknowledged { lifecycle_revision: u64 },
    Rejected { reason: ArtifactTransferReject },
}

/// Exact owner and active-transfer snapshot required for one durable cancel.
///
/// `observed_revision` is a lower bound, not an unbound compare-and-swap
/// token. A fetch consumer can observe revision 1 while the same immutable
/// transfer advances to `AwaitingAck` at revision 2. Cancellation may follow
/// that one transition, but it still rejects a future revision, another
/// transfer, another owner, or a terminal lifecycle. The repository write
/// itself always uses the freshly read canonical revision.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArtifactCancelCommand {
    artifact_ref: String,
    requester_id: String,
    owner_request_id: String,
    owner_operation_id: String,
    transfer_id: String,
    observed_revision: u64,
    now_ms: i64,
}

impl ArtifactCancelCommand {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        artifact_ref: impl Into<String>,
        requester_id: impl Into<String>,
        owner_request_id: impl Into<String>,
        owner_operation_id: impl Into<String>,
        transfer_id: impl Into<String>,
        observed_revision: u64,
        now_ms: i64,
    ) -> Self {
        Self {
            artifact_ref: artifact_ref.into(),
            requester_id: requester_id.into(),
            owner_request_id: owner_request_id.into(),
            owner_operation_id: owner_operation_id.into(),
            transfer_id: transfer_id.into(),
            observed_revision,
            now_ms,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArtifactCancelResult {
    Cancelled { lifecycle_revision: u64 },
    AlreadyCancelled { lifecycle_revision: u64 },
    Rejected { reason: ArtifactTransferReject },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArtifactTransferReject {
    Missing,
    WrongOwner,
    RevisionConflict,
    Expired,
    WrongTransfer,
    DigestMismatch,
    InvalidState,
    SourceUnavailable,
    VerificationFailed,
    StorageConflict,
    Unavailable,
}

pub struct ArtifactTransferUseCase {
    store: Arc<dyn ArtifactLifecycleStore>,
    source: Arc<dyn VerifiedArtifactSource>,
}

impl ArtifactTransferUseCase {
    pub fn new(
        store: Arc<dyn ArtifactLifecycleStore>,
        source: Arc<dyn VerifiedArtifactSource>,
    ) -> Self {
        Self { store, source }
    }

    pub fn prepare_fetch(&self, command: &ArtifactFetchCommand) -> ArtifactFetchResult {
        let current = match self.store.read(&command.artifact_ref) {
            ArtifactLifecycleRead::Found(lifecycle) => lifecycle,
            ArtifactLifecycleRead::Missing => {
                return rejected_fetch(ArtifactTransferReject::Missing);
            }
            ArtifactLifecycleRead::Unavailable => {
                return rejected_fetch(ArtifactTransferReject::Unavailable);
            }
        };
        let binding = current.binding();
        if binding.owner_requester_id() != command.requester_id
            || binding.owner_request_id() != command.request_id
            || binding.owner_operation_id() != command.operation_id
        {
            return rejected_fetch(ArtifactTransferReject::WrongOwner);
        }
        let chunk_count = match command.chunk_config.chunk_count(binding.total_size()) {
            Ok(count) => count,
            Err(_) => return rejected_fetch(ArtifactTransferReject::VerificationFailed),
        };
        let begin = ArtifactEvent::BeginFetch {
            requester_id: command.requester_id.clone(),
            request_id: command.request_id.clone(),
            operation_id: command.operation_id.clone(),
            transfer_id: command.transfer_id.clone(),
            chunk_count,
            now_ms: command.now_ms,
        };
        let lifecycle_revision =
            match self
                .store
                .apply(&command.artifact_ref, command.expected_revision, &begin)
            {
                ArtifactRepositoryResult::Applied { revision }
                | ArtifactRepositoryResult::Idempotent { revision } => revision,
                result => return rejected_fetch(map_repository_result(result)),
            };
        let fetching = match self.store.read(&command.artifact_ref) {
            ArtifactLifecycleRead::Found(lifecycle) => lifecycle,
            ArtifactLifecycleRead::Missing | ArtifactLifecycleRead::Unavailable => {
                return rejected_fetch(ArtifactTransferReject::Unavailable);
            }
        };
        let verified = match self.source.read_verified(&command.artifact_ref) {
            Ok(verified) => verified,
            Err(_) => {
                return rejected_fetch(self.fail_fetch(
                    &fetching,
                    &command.transfer_id,
                    ArtifactFailureReason::SourceUnavailable,
                    command.now_ms,
                    ArtifactTransferReject::SourceUnavailable,
                ));
            }
        };
        if verified.artifact_ref() != binding.artifact_ref()
            || verified.metadata().size_bytes() != binding.total_size()
            || verified.metadata().sha256_digest() != binding.full_digest()
        {
            return rejected_fetch(self.fail_fetch(
                &fetching,
                &command.transfer_id,
                ArtifactFailureReason::VerificationFailed,
                command.now_ms,
                ArtifactTransferReject::VerificationFailed,
            ));
        }
        match build_artifact_chunks(
            &fetching,
            verified.bytes(),
            command.now_ms,
            command.chunk_config,
        ) {
            Ok(chunks) => ArtifactFetchResult::Prepared {
                chunks,
                lifecycle_revision,
            },
            Err(_) => rejected_fetch(self.fail_fetch(
                &fetching,
                &command.transfer_id,
                ArtifactFailureReason::VerificationFailed,
                command.now_ms,
                ArtifactTransferReject::VerificationFailed,
            )),
        }
    }

    pub fn record_published(&self, command: &ArtifactPublishCommand) -> ArtifactPublishResult {
        let event = ArtifactEvent::ChunksPublished {
            transfer_id: command.transfer_id.clone(),
            chunk_count: command.chunk_count,
            now_ms: command.now_ms,
        };
        match self
            .store
            .apply(&command.artifact_ref, command.expected_revision, &event)
        {
            ArtifactRepositoryResult::Applied { revision } => {
                ArtifactPublishResult::AwaitingAcknowledgement {
                    lifecycle_revision: revision,
                }
            }
            ArtifactRepositoryResult::Idempotent { revision } => {
                ArtifactPublishResult::AlreadyRecorded {
                    lifecycle_revision: revision,
                }
            }
            result => ArtifactPublishResult::Rejected {
                reason: map_repository_result(result),
            },
        }
    }

    pub fn record_publish_failed(
        &self,
        command: &ArtifactPublishCommand,
    ) -> ArtifactPublishFailureResult {
        let event = ArtifactEvent::Fail {
            transfer_id: Some(command.transfer_id.clone()),
            reason: ArtifactFailureReason::PublishFailed,
            now_ms: command.now_ms,
        };
        match self
            .store
            .apply(&command.artifact_ref, command.expected_revision, &event)
        {
            ArtifactRepositoryResult::Applied { revision } => {
                ArtifactPublishFailureResult::Failed {
                    lifecycle_revision: revision,
                }
            }
            result => ArtifactPublishFailureResult::Rejected {
                reason: map_repository_result(result),
            },
        }
    }

    pub fn acknowledge(&self, command: &ArtifactAckCommand) -> ArtifactAckResult {
        let event = ArtifactEvent::Acknowledge {
            requester_id: command.requester_id.clone(),
            transfer_id: command.transfer_id.clone(),
            full_digest: command.full_digest.clone(),
            now_ms: command.now_ms,
        };
        match self
            .store
            .apply(&command.artifact_ref, command.expected_revision, &event)
        {
            ArtifactRepositoryResult::Applied { revision } => ArtifactAckResult::CleanupRequired {
                lifecycle_revision: revision,
            },
            ArtifactRepositoryResult::Idempotent { revision } => {
                ArtifactAckResult::AlreadyAcknowledged {
                    lifecycle_revision: revision,
                }
            }
            result => ArtifactAckResult::Rejected {
                reason: map_repository_result(result),
            },
        }
    }

    /// Cancels only the currently active exact transfer. A durable cancelled
    /// state retains that transfer, so only its exact redelivery is
    /// idempotent; legacy cancelled state without identity remains rejected.
    pub fn cancel(&self, command: &ArtifactCancelCommand) -> ArtifactCancelResult {
        let current = match self.store.read(&command.artifact_ref) {
            ArtifactLifecycleRead::Found(lifecycle) => lifecycle,
            ArtifactLifecycleRead::Missing => {
                return ArtifactCancelResult::Rejected {
                    reason: ArtifactTransferReject::Missing,
                };
            }
            ArtifactLifecycleRead::Unavailable => {
                return ArtifactCancelResult::Rejected {
                    reason: ArtifactTransferReject::Unavailable,
                };
            }
        };
        let binding = current.binding();
        if binding.owner_requester_id() != command.requester_id
            || binding.owner_request_id() != command.owner_request_id
            || binding.owner_operation_id() != command.owner_operation_id
        {
            return ArtifactCancelResult::Rejected {
                reason: ArtifactTransferReject::WrongOwner,
            };
        }
        if current.revision() < command.observed_revision {
            return ArtifactCancelResult::Rejected {
                reason: ArtifactTransferReject::RevisionConflict,
            };
        }
        let active_transfer = match current.state() {
            ArtifactLifecycleState::Fetching { transfer_id, .. }
            | ArtifactLifecycleState::AwaitingAck { transfer_id, .. } => transfer_id,
            ArtifactLifecycleState::Cancelled {
                transfer_id: Some(transfer_id),
                ..
            } if transfer_id == &command.transfer_id => {
                return ArtifactCancelResult::AlreadyCancelled {
                    lifecycle_revision: current.revision(),
                };
            }
            ArtifactLifecycleState::Cancelled {
                transfer_id: Some(_),
                ..
            } => {
                return ArtifactCancelResult::Rejected {
                    reason: ArtifactTransferReject::WrongTransfer,
                };
            }
            _ => {
                return ArtifactCancelResult::Rejected {
                    reason: ArtifactTransferReject::InvalidState,
                };
            }
        };
        if active_transfer != &command.transfer_id {
            return ArtifactCancelResult::Rejected {
                reason: ArtifactTransferReject::WrongTransfer,
            };
        }
        let event = ArtifactEvent::Cancel {
            requester_id: command.requester_id.clone(),
            transfer_id: command.transfer_id.clone(),
            now_ms: command.now_ms,
        };
        match self
            .store
            .apply(&command.artifact_ref, current.revision(), &event)
        {
            ArtifactRepositoryResult::Applied { revision } => ArtifactCancelResult::Cancelled {
                lifecycle_revision: revision,
            },
            result => ArtifactCancelResult::Rejected {
                reason: map_repository_result(result),
            },
        }
    }

    fn fail_fetch(
        &self,
        lifecycle: &ArtifactLifecycle,
        transfer_id: &str,
        reason: ArtifactFailureReason,
        now_ms: i64,
        public_reason: ArtifactTransferReject,
    ) -> ArtifactTransferReject {
        let event = ArtifactEvent::Fail {
            transfer_id: Some(transfer_id.to_string()),
            reason,
            now_ms,
        };
        match self.store.apply(
            lifecycle.binding().artifact_ref(),
            lifecycle.revision(),
            &event,
        ) {
            ArtifactRepositoryResult::Applied { .. }
            | ArtifactRepositoryResult::Idempotent { .. } => public_reason,
            result => map_repository_result(result),
        }
    }
}

fn rejected_fetch(reason: ArtifactTransferReject) -> ArtifactFetchResult {
    ArtifactFetchResult::Rejected { reason }
}

fn map_repository_result(result: ArtifactRepositoryResult) -> ArtifactTransferReject {
    match result {
        ArtifactRepositoryResult::RevisionConflict { .. } => {
            ArtifactTransferReject::RevisionConflict
        }
        ArtifactRepositoryResult::TransitionRejected { reason } => match reason {
            ArtifactTransitionReject::WrongOwner => ArtifactTransferReject::WrongOwner,
            ArtifactTransitionReject::WrongTransfer => ArtifactTransferReject::WrongTransfer,
            ArtifactTransitionReject::DigestMismatch => ArtifactTransferReject::DigestMismatch,
            ArtifactTransitionReject::Expired | ArtifactTransitionReject::NotExpired => {
                ArtifactTransferReject::Expired
            }
            ArtifactTransitionReject::InvalidEvent
            | ArtifactTransitionReject::InvalidState
            | ArtifactTransitionReject::TerminalState
            | ArtifactTransitionReject::RevisionOverflow => ArtifactTransferReject::InvalidState,
        },
        ArtifactRepositoryResult::Missing => ArtifactTransferReject::Missing,
        ArtifactRepositoryResult::StorageConflict => ArtifactTransferReject::StorageConflict,
        ArtifactRepositoryResult::BindingConflict
        | ArtifactRepositoryResult::Saturated
        | ArtifactRepositoryResult::Unavailable => ArtifactTransferReject::Unavailable,
        ArtifactRepositoryResult::Registered { .. }
        | ArtifactRepositoryResult::Applied { .. }
        | ArtifactRepositoryResult::Idempotent { .. } => ArtifactTransferReject::InvalidState,
    }
}
