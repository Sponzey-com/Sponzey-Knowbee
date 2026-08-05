//! Pure canonical lifecycle for one verified capture artifact.
//!
//! The reducer binds delivery to the artifact owner and full post-check digest.
//! Persistence, MQTT publication, clocks, cancellation signalling, and file
//! cleanup are effects requested by an outer Application use case.

const MAX_IDENTITY_BYTES: usize = 256;
const MAX_ARTIFACT_BYTES: u64 = 64 * 1024 * 1024;
const MIN_TTL_MS: i64 = 60_000;
const MAX_TTL_MS: i64 = 60 * 60_000;
const MAX_CHUNK_COUNT: u32 = 65_536;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArtifactBinding {
    artifact_ref: String,
    owner_requester_id: String,
    owner_request_id: String,
    owner_operation_id: String,
    full_digest: String,
    total_size: u64,
    created_at_ms: i64,
    expires_at_ms: i64,
}

impl ArtifactBinding {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        artifact_ref: impl Into<String>,
        owner_requester_id: impl Into<String>,
        owner_request_id: impl Into<String>,
        owner_operation_id: impl Into<String>,
        full_digest: impl Into<String>,
        total_size: u64,
        created_at_ms: i64,
        expires_at_ms: i64,
    ) -> Result<Self, ArtifactBindingError> {
        let binding = Self {
            artifact_ref: artifact_ref.into(),
            owner_requester_id: owner_requester_id.into(),
            owner_request_id: owner_request_id.into(),
            owner_operation_id: owner_operation_id.into(),
            full_digest: full_digest.into(),
            total_size,
            created_at_ms,
            expires_at_ms,
        };
        let ttl = expires_at_ms.checked_sub(created_at_ms);
        if !is_artifact_ref(&binding.artifact_ref)
            || !is_identity(&binding.owner_requester_id)
            || !is_identity(&binding.owner_request_id)
            || !is_identity(&binding.owner_operation_id)
            || !is_sha256_digest(&binding.full_digest)
            || binding.total_size == 0
            || binding.total_size > MAX_ARTIFACT_BYTES
            || created_at_ms <= 0
            || ttl.is_none_or(|ttl| !(MIN_TTL_MS..=MAX_TTL_MS).contains(&ttl))
        {
            return Err(ArtifactBindingError::InvalidBinding);
        }
        Ok(binding)
    }

    pub fn artifact_ref(&self) -> &str {
        &self.artifact_ref
    }

    pub fn owner_requester_id(&self) -> &str {
        &self.owner_requester_id
    }

    pub fn owner_request_id(&self) -> &str {
        &self.owner_request_id
    }

    pub fn owner_operation_id(&self) -> &str {
        &self.owner_operation_id
    }

    pub fn full_digest(&self) -> &str {
        &self.full_digest
    }

    pub fn total_size(&self) -> u64 {
        self.total_size
    }

    pub fn created_at_ms(&self) -> i64 {
        self.created_at_ms
    }

    pub fn expires_at_ms(&self) -> i64 {
        self.expires_at_ms
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArtifactBindingError {
    InvalidBinding,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArtifactFailureReason {
    SourceUnavailable,
    PublishFailed,
    VerificationFailed,
    CleanupFailed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArtifactCleanupStatus {
    Pending,
    Completed { completed_at_ms: i64 },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ArtifactLifecycleState {
    Registered,
    Fetching {
        transfer_id: String,
        chunk_count: u32,
        started_at_ms: i64,
    },
    AwaitingAck {
        transfer_id: String,
        chunk_count: u32,
        published_at_ms: i64,
    },
    Acknowledged {
        transfer_id: String,
        acknowledged_at_ms: i64,
    },
    Expired {
        expired_at_ms: i64,
    },
    Cancelled {
        transfer_id: Option<String>,
        cancelled_at_ms: i64,
    },
    Failed {
        reason: ArtifactFailureReason,
        failed_at_ms: i64,
    },
}

impl ArtifactLifecycleState {
    pub fn is_terminal(&self) -> bool {
        matches!(
            self,
            Self::Acknowledged { .. }
                | Self::Expired { .. }
                | Self::Cancelled { .. }
                | Self::Failed { .. }
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArtifactLifecycle {
    binding: ArtifactBinding,
    revision: u64,
    state: Box<ArtifactLifecycleState>,
    cleanup_status: ArtifactCleanupStatus,
}

impl ArtifactLifecycle {
    pub fn new(binding: ArtifactBinding) -> Result<Self, ArtifactBindingError> {
        Ok(Self {
            binding,
            revision: 0,
            state: Box::new(ArtifactLifecycleState::Registered),
            cleanup_status: ArtifactCleanupStatus::Pending,
        })
    }

    pub fn binding(&self) -> &ArtifactBinding {
        &self.binding
    }

    pub fn revision(&self) -> u64 {
        self.revision
    }

    pub fn state(&self) -> &ArtifactLifecycleState {
        self.state.as_ref()
    }

    pub fn cleanup_status(&self) -> ArtifactCleanupStatus {
        self.cleanup_status
    }

    pub(crate) fn restore(
        binding: ArtifactBinding,
        revision: u64,
        state: ArtifactLifecycleState,
        cleanup_status: ArtifactCleanupStatus,
    ) -> Result<Self, ArtifactBindingError> {
        let valid = match &state {
            ArtifactLifecycleState::Registered => revision == 0,
            ArtifactLifecycleState::Fetching {
                transfer_id,
                chunk_count,
                started_at_ms,
            } => {
                revision >= 1
                    && valid_transfer(transfer_id, *chunk_count)
                    && valid_active_time(&binding, *started_at_ms)
            }
            ArtifactLifecycleState::AwaitingAck {
                transfer_id,
                chunk_count,
                published_at_ms,
            } => {
                revision >= 2
                    && valid_transfer(transfer_id, *chunk_count)
                    && valid_active_time(&binding, *published_at_ms)
            }
            ArtifactLifecycleState::Acknowledged {
                transfer_id,
                acknowledged_at_ms,
            } => {
                revision >= 3
                    && is_identity(transfer_id)
                    && valid_active_time(&binding, *acknowledged_at_ms)
            }
            ArtifactLifecycleState::Expired { expired_at_ms } => {
                revision >= 1 && *expired_at_ms >= binding.expires_at_ms
            }
            ArtifactLifecycleState::Cancelled {
                transfer_id,
                cancelled_at_ms,
            } => {
                revision >= 1
                    && transfer_id.as_deref().is_none_or(is_identity)
                    && *cancelled_at_ms >= binding.created_at_ms
            }
            ArtifactLifecycleState::Failed { failed_at_ms, .. } => {
                revision >= 1 && *failed_at_ms >= binding.created_at_ms
            }
        };
        let cleanup_valid = match cleanup_status {
            ArtifactCleanupStatus::Pending => true,
            ArtifactCleanupStatus::Completed { completed_at_ms } => {
                state.is_terminal() && completed_at_ms >= binding.created_at_ms
            }
        };
        if !valid || !cleanup_valid {
            return Err(ArtifactBindingError::InvalidBinding);
        }
        Ok(Self {
            binding,
            revision,
            state: Box::new(state),
            cleanup_status,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ArtifactEvent {
    BeginFetch {
        requester_id: String,
        request_id: String,
        operation_id: String,
        transfer_id: String,
        chunk_count: u32,
        now_ms: i64,
    },
    ChunksPublished {
        transfer_id: String,
        chunk_count: u32,
        now_ms: i64,
    },
    Acknowledge {
        requester_id: String,
        transfer_id: String,
        full_digest: String,
        now_ms: i64,
    },
    Expire {
        now_ms: i64,
    },
    Cancel {
        requester_id: String,
        transfer_id: String,
        now_ms: i64,
    },
    Fail {
        transfer_id: Option<String>,
        reason: ArtifactFailureReason,
        now_ms: i64,
    },
    CleanupCompleted {
        now_ms: i64,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArtifactTransitionReject {
    InvalidEvent,
    WrongOwner,
    WrongTransfer,
    DigestMismatch,
    Expired,
    NotExpired,
    InvalidState,
    TerminalState,
    RevisionOverflow,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ArtifactTransition {
    Applied {
        lifecycle: ArtifactLifecycle,
        previous_revision: u64,
    },
    Idempotent {
        revision: u64,
    },
    Rejected {
        reason: ArtifactTransitionReject,
    },
}

pub fn apply_artifact_event(
    current: &ArtifactLifecycle,
    event: &ArtifactEvent,
) -> ArtifactTransition {
    match event {
        ArtifactEvent::BeginFetch {
            requester_id,
            request_id,
            operation_id,
            transfer_id,
            chunk_count,
            now_ms,
        } => {
            if !owner_matches(current, requester_id, request_id, operation_id) {
                return rejected(ArtifactTransitionReject::WrongOwner);
            }
            if !valid_transfer(transfer_id, *chunk_count) || *now_ms <= 0 {
                return rejected(ArtifactTransitionReject::InvalidEvent);
            }
            if current.state().is_terminal() {
                return rejected(ArtifactTransitionReject::TerminalState);
            }
            if is_expired(current, *now_ms) {
                return rejected(ArtifactTransitionReject::Expired);
            }
            match current.state() {
                ArtifactLifecycleState::Registered => apply(
                    current,
                    ArtifactLifecycleState::Fetching {
                        transfer_id: transfer_id.clone(),
                        chunk_count: *chunk_count,
                        started_at_ms: *now_ms,
                    },
                ),
                ArtifactLifecycleState::Fetching {
                    transfer_id: active,
                    chunk_count: active_count,
                    ..
                }
                | ArtifactLifecycleState::AwaitingAck {
                    transfer_id: active,
                    chunk_count: active_count,
                    ..
                } if active == transfer_id && active_count == chunk_count => idempotent(current),
                ArtifactLifecycleState::Fetching { .. }
                | ArtifactLifecycleState::AwaitingAck { .. } => {
                    rejected(ArtifactTransitionReject::WrongTransfer)
                }
                ArtifactLifecycleState::Acknowledged { .. }
                | ArtifactLifecycleState::Expired { .. }
                | ArtifactLifecycleState::Cancelled { .. }
                | ArtifactLifecycleState::Failed { .. } => {
                    rejected(ArtifactTransitionReject::TerminalState)
                }
            }
        }
        ArtifactEvent::ChunksPublished {
            transfer_id,
            chunk_count,
            now_ms,
        } => {
            if !valid_transfer(transfer_id, *chunk_count) || *now_ms <= 0 {
                return rejected(ArtifactTransitionReject::InvalidEvent);
            }
            if current.state().is_terminal() {
                return rejected(ArtifactTransitionReject::TerminalState);
            }
            if is_expired(current, *now_ms) {
                return rejected(ArtifactTransitionReject::Expired);
            }
            match current.state() {
                ArtifactLifecycleState::Fetching {
                    transfer_id: active,
                    chunk_count: active_count,
                    ..
                } if active == transfer_id && active_count == chunk_count => apply(
                    current,
                    ArtifactLifecycleState::AwaitingAck {
                        transfer_id: transfer_id.clone(),
                        chunk_count: *chunk_count,
                        published_at_ms: *now_ms,
                    },
                ),
                ArtifactLifecycleState::AwaitingAck {
                    transfer_id: active,
                    chunk_count: active_count,
                    ..
                } if active == transfer_id && active_count == chunk_count => idempotent(current),
                ArtifactLifecycleState::Fetching { .. }
                | ArtifactLifecycleState::AwaitingAck { .. } => {
                    rejected(ArtifactTransitionReject::WrongTransfer)
                }
                ArtifactLifecycleState::Registered => {
                    rejected(ArtifactTransitionReject::InvalidState)
                }
                ArtifactLifecycleState::Acknowledged { .. }
                | ArtifactLifecycleState::Expired { .. }
                | ArtifactLifecycleState::Cancelled { .. }
                | ArtifactLifecycleState::Failed { .. } => {
                    rejected(ArtifactTransitionReject::TerminalState)
                }
            }
        }
        ArtifactEvent::Acknowledge {
            requester_id,
            transfer_id,
            full_digest,
            now_ms,
        } => {
            if requester_id.as_str() != current.binding.owner_requester_id
                || !is_identity(transfer_id)
                || !is_sha256_digest(full_digest)
                || *now_ms <= 0
            {
                return rejected(
                    if requester_id.as_str() != current.binding.owner_requester_id {
                        ArtifactTransitionReject::WrongOwner
                    } else {
                        ArtifactTransitionReject::InvalidEvent
                    },
                );
            }
            if matches!(
                current.state(),
                ArtifactLifecycleState::Acknowledged {
                    transfer_id: active,
                    ..
                } if active == transfer_id && full_digest == &current.binding.full_digest
            ) {
                return idempotent(current);
            }
            if current.state().is_terminal() {
                return rejected(ArtifactTransitionReject::TerminalState);
            }
            if is_expired(current, *now_ms) {
                return rejected(ArtifactTransitionReject::Expired);
            }
            if full_digest != &current.binding.full_digest {
                return rejected(ArtifactTransitionReject::DigestMismatch);
            }
            match current.state() {
                ArtifactLifecycleState::AwaitingAck {
                    transfer_id: active,
                    ..
                } if active == transfer_id => apply(
                    current,
                    ArtifactLifecycleState::Acknowledged {
                        transfer_id: transfer_id.clone(),
                        acknowledged_at_ms: *now_ms,
                    },
                ),
                ArtifactLifecycleState::Acknowledged {
                    transfer_id: active,
                    ..
                } if active == transfer_id => idempotent(current),
                ArtifactLifecycleState::Fetching {
                    transfer_id: active,
                    ..
                }
                | ArtifactLifecycleState::AwaitingAck {
                    transfer_id: active,
                    ..
                }
                | ArtifactLifecycleState::Acknowledged {
                    transfer_id: active,
                    ..
                } if active != transfer_id => rejected(ArtifactTransitionReject::WrongTransfer),
                ArtifactLifecycleState::Registered | ArtifactLifecycleState::Fetching { .. } => {
                    rejected(ArtifactTransitionReject::InvalidState)
                }
                ArtifactLifecycleState::AwaitingAck { .. }
                | ArtifactLifecycleState::Acknowledged { .. } => {
                    rejected(ArtifactTransitionReject::WrongTransfer)
                }
                ArtifactLifecycleState::Expired { .. }
                | ArtifactLifecycleState::Cancelled { .. }
                | ArtifactLifecycleState::Failed { .. } => {
                    rejected(ArtifactTransitionReject::TerminalState)
                }
            }
        }
        ArtifactEvent::Expire { now_ms } => {
            if *now_ms < current.binding.expires_at_ms {
                return rejected(ArtifactTransitionReject::NotExpired);
            }
            match current.state() {
                ArtifactLifecycleState::Expired { .. } => idempotent(current),
                state if state.is_terminal() => rejected(ArtifactTransitionReject::TerminalState),
                _ => apply(
                    current,
                    ArtifactLifecycleState::Expired {
                        expired_at_ms: *now_ms,
                    },
                ),
            }
        }
        ArtifactEvent::Cancel {
            requester_id,
            transfer_id,
            now_ms,
        } => {
            if requester_id.as_str() != current.binding.owner_requester_id {
                return rejected(ArtifactTransitionReject::WrongOwner);
            }
            if !is_identity(transfer_id) || *now_ms <= 0 {
                return rejected(ArtifactTransitionReject::InvalidEvent);
            }
            match current.state() {
                ArtifactLifecycleState::Fetching {
                    transfer_id: active,
                    ..
                }
                | ArtifactLifecycleState::AwaitingAck {
                    transfer_id: active,
                    ..
                } if active == transfer_id => apply(
                    current,
                    ArtifactLifecycleState::Cancelled {
                        transfer_id: Some(transfer_id.clone()),
                        cancelled_at_ms: *now_ms,
                    },
                ),
                ArtifactLifecycleState::Cancelled {
                    transfer_id: Some(active),
                    ..
                } if active == transfer_id => idempotent(current),
                ArtifactLifecycleState::Fetching { .. }
                | ArtifactLifecycleState::AwaitingAck { .. }
                | ArtifactLifecycleState::Cancelled {
                    transfer_id: Some(_),
                    ..
                } => rejected(ArtifactTransitionReject::WrongTransfer),
                ArtifactLifecycleState::Registered => {
                    rejected(ArtifactTransitionReject::InvalidState)
                }
                ArtifactLifecycleState::Acknowledged { .. }
                | ArtifactLifecycleState::Expired { .. }
                | ArtifactLifecycleState::Cancelled {
                    transfer_id: None, ..
                }
                | ArtifactLifecycleState::Failed { .. } => {
                    rejected(ArtifactTransitionReject::TerminalState)
                }
            }
        }
        ArtifactEvent::Fail {
            transfer_id,
            reason,
            now_ms,
        } => {
            if *now_ms <= 0
                || transfer_id
                    .as_deref()
                    .is_some_and(|transfer| !is_identity(transfer))
            {
                return rejected(ArtifactTransitionReject::InvalidEvent);
            }
            if let Some(expected) = transfer_id
                && active_transfer(current.state()).is_some_and(|active| active != expected)
            {
                return rejected(ArtifactTransitionReject::WrongTransfer);
            }
            if current.state().is_terminal() {
                return rejected(ArtifactTransitionReject::TerminalState);
            }
            apply(
                current,
                ArtifactLifecycleState::Failed {
                    reason: *reason,
                    failed_at_ms: *now_ms,
                },
            )
        }
        ArtifactEvent::CleanupCompleted { now_ms } => {
            if *now_ms < current.binding.created_at_ms {
                return rejected(ArtifactTransitionReject::InvalidEvent);
            }
            if matches!(
                current.cleanup_status,
                ArtifactCleanupStatus::Completed { .. }
            ) {
                return idempotent(current);
            }
            if !current.state().is_terminal() {
                return rejected(ArtifactTransitionReject::InvalidState);
            }
            apply_cleanup_completed(current, *now_ms)
        }
    }
}

fn apply(current: &ArtifactLifecycle, state: ArtifactLifecycleState) -> ArtifactTransition {
    let Some(revision) = current.revision.checked_add(1) else {
        return rejected(ArtifactTransitionReject::RevisionOverflow);
    };
    ArtifactTransition::Applied {
        lifecycle: ArtifactLifecycle {
            binding: current.binding.clone(),
            revision,
            state: Box::new(state),
            cleanup_status: current.cleanup_status,
        },
        previous_revision: current.revision,
    }
}

fn apply_cleanup_completed(
    current: &ArtifactLifecycle,
    completed_at_ms: i64,
) -> ArtifactTransition {
    let Some(revision) = current.revision.checked_add(1) else {
        return rejected(ArtifactTransitionReject::RevisionOverflow);
    };
    ArtifactTransition::Applied {
        lifecycle: ArtifactLifecycle {
            binding: current.binding.clone(),
            revision,
            state: current.state.clone(),
            cleanup_status: ArtifactCleanupStatus::Completed { completed_at_ms },
        },
        previous_revision: current.revision,
    }
}

fn idempotent(current: &ArtifactLifecycle) -> ArtifactTransition {
    ArtifactTransition::Idempotent {
        revision: current.revision,
    }
}

fn rejected(reason: ArtifactTransitionReject) -> ArtifactTransition {
    ArtifactTransition::Rejected { reason }
}

fn owner_matches(
    lifecycle: &ArtifactLifecycle,
    requester_id: &str,
    request_id: &str,
    operation_id: &str,
) -> bool {
    requester_id == lifecycle.binding.owner_requester_id
        && request_id == lifecycle.binding.owner_request_id
        && operation_id == lifecycle.binding.owner_operation_id
}

fn is_expired(lifecycle: &ArtifactLifecycle, now_ms: i64) -> bool {
    now_ms >= lifecycle.binding.expires_at_ms
}

fn active_transfer(state: &ArtifactLifecycleState) -> Option<&str> {
    match state {
        ArtifactLifecycleState::Fetching { transfer_id, .. }
        | ArtifactLifecycleState::AwaitingAck { transfer_id, .. }
        | ArtifactLifecycleState::Acknowledged { transfer_id, .. } => Some(transfer_id),
        ArtifactLifecycleState::Registered
        | ArtifactLifecycleState::Expired { .. }
        | ArtifactLifecycleState::Cancelled { .. }
        | ArtifactLifecycleState::Failed { .. } => None,
    }
}

fn valid_transfer(transfer_id: &str, chunk_count: u32) -> bool {
    is_identity(transfer_id) && (1..=MAX_CHUNK_COUNT).contains(&chunk_count)
}

fn valid_active_time(binding: &ArtifactBinding, at_ms: i64) -> bool {
    at_ms >= binding.created_at_ms && at_ms < binding.expires_at_ms
}

fn is_identity(value: &str) -> bool {
    !value.trim().is_empty() && value.len() <= MAX_IDENTITY_BYTES
}

fn is_artifact_ref(value: &str) -> bool {
    value.strip_prefix("capture:").is_some_and(|digest| {
        digest.len() == 64 && digest.bytes().all(|byte| byte.is_ascii_hexdigit())
    })
}

fn is_sha256_digest(value: &str) -> bool {
    value.strip_prefix("sha256:").is_some_and(|digest| {
        digest.len() == 64 && digest.bytes().all(|byte| byte.is_ascii_hexdigit())
    })
}
