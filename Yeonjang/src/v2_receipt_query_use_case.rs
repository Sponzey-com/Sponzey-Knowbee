//! Read-only Application use case for immutable v2 terminal receipts.

use std::sync::Arc;

use serde::Serialize;

use crate::protocol_v2_receipt_query::V2ReceiptQueryEnvelope;
use crate::protocol_v2_receipt_query_admission::{
    AdmittedV2ReceiptQuery, VerifiedReplayV2ReceiptQuery,
};
use crate::protocol_v2_terminal::V2TerminalResponseContent;
use crate::v2_terminal_repository::{V2TerminalLookup, V2TerminalRepository, V2TerminalScope};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct V2ReceiptQueryOwnerScope {
    instance_id: String,
    session_id: String,
    target_fingerprint: String,
}

impl V2ReceiptQueryOwnerScope {
    pub fn new(
        instance_id: impl Into<String>,
        session_id: impl Into<String>,
        target_fingerprint: impl Into<String>,
    ) -> Result<Self, V2ReceiptQueryOwnerScopeError> {
        let scope = Self {
            instance_id: instance_id.into(),
            session_id: session_id.into(),
            target_fingerprint: target_fingerprint.into(),
        };
        if scope.instance_id.trim().is_empty()
            || scope.session_id.trim().is_empty()
            || !is_sha256_digest(&scope.target_fingerprint)
        {
            return Err(V2ReceiptQueryOwnerScopeError::InvalidIdentity);
        }
        Ok(scope)
    }

    fn matches(&self, query: &V2ReceiptQueryEnvelope) -> bool {
        self.instance_id == query.target_instance_id()
            && self.session_id == query.target_session_id()
            && self.target_fingerprint == query.target_fingerprint()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum V2ReceiptQueryOwnerScopeError {
    InvalidIdentity,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum V2ReceiptLookupOutcome {
    Found,
    NotFound,
    InProgress,
    RevisionMismatch,
    BindingMismatch,
    StateUnavailable,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct V2ReceiptQueryResult {
    outcome: V2ReceiptLookupOutcome,
    terminal: Option<Box<V2TerminalResponseContent>>,
}

impl V2ReceiptQueryResult {
    pub fn outcome(&self) -> V2ReceiptLookupOutcome {
        self.outcome
    }

    pub fn terminal(&self) -> Option<&V2TerminalResponseContent> {
        self.terminal.as_deref()
    }
}

/// Reads the terminal repository without claiming, completing or executing.
pub struct V2ReceiptQueryUseCase {
    repository: Arc<dyn V2TerminalRepository>,
    owner_scope: V2ReceiptQueryOwnerScope,
}

impl V2ReceiptQueryUseCase {
    pub fn new(
        repository: Arc<dyn V2TerminalRepository>,
        owner_scope: V2ReceiptQueryOwnerScope,
    ) -> Self {
        Self {
            repository,
            owner_scope,
        }
    }

    pub fn execute(&self, query: &AdmittedV2ReceiptQuery<'_>) -> V2ReceiptQueryResult {
        self.lookup(query.query())
    }

    pub fn replay(&self, query: &VerifiedReplayV2ReceiptQuery<'_>) -> V2ReceiptQueryResult {
        self.lookup(query.query())
    }

    fn lookup(&self, query: &V2ReceiptQueryEnvelope) -> V2ReceiptQueryResult {
        if !self.owner_scope.matches(query) {
            return result(V2ReceiptLookupOutcome::BindingMismatch, None);
        }
        let scope = match V2TerminalScope::new(
            query.target_idempotency_key().to_string(),
            query.target_scope_digest().to_string(),
        ) {
            Ok(scope) => scope,
            Err(_) => return result(V2ReceiptLookupOutcome::BindingMismatch, None),
        };
        match self.repository.lookup(&scope) {
            V2TerminalLookup::Miss => result(V2ReceiptLookupOutcome::NotFound, None),
            V2TerminalLookup::InProgress => result(V2ReceiptLookupOutcome::InProgress, None),
            V2TerminalLookup::ScopeConflict => {
                result(V2ReceiptLookupOutcome::BindingMismatch, None)
            }
            V2TerminalLookup::Unavailable => result(V2ReceiptLookupOutcome::StateUnavailable, None),
            V2TerminalLookup::Completed(content) => {
                if content.request_id() != query.target_request_id()
                    || content.command_id() != query.target_command_id()
                    || content.operation_id() != query.target_operation_id()
                    || content.requester_id() != query.requester_id()
                    || content.target_instance_id() != query.target_instance_id()
                    || content.target_session_id() != query.target_session_id()
                    || content.target_fingerprint() != query.target_fingerprint()
                    || content.idempotency_key() != query.target_idempotency_key()
                {
                    result(V2ReceiptLookupOutcome::BindingMismatch, None)
                } else if content.terminal_revision() != query.expected_terminal_revision() {
                    result(V2ReceiptLookupOutcome::RevisionMismatch, None)
                } else {
                    result(V2ReceiptLookupOutcome::Found, Some(content))
                }
            }
        }
    }
}

fn result(
    outcome: V2ReceiptLookupOutcome,
    terminal: Option<Box<V2TerminalResponseContent>>,
) -> V2ReceiptQueryResult {
    V2ReceiptQueryResult { outcome, terminal }
}

fn is_sha256_digest(value: &str) -> bool {
    value.len() == 71
        && value.strip_prefix("sha256:").is_some_and(|digest| {
            digest.len() == 64 && digest.bytes().all(|b| b.is_ascii_hexdigit())
        })
}
