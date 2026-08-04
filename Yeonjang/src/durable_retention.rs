use std::collections::BTreeSet;

use crate::durable_completed_store::{
    DurableRecordRepository, RetentionRecord, RetentionRecordRemoveResult,
};
use crate::durable_response_archive::{ResponseArchiveRepository, RetentionResponseRemoveResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DurableRetentionPolicyError {
    InvalidNow,
    InvalidRemovalLimit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DurableRetentionPolicy {
    now_ms: i64,
    minimum_completed_to_retain: usize,
    max_removals: usize,
}

impl DurableRetentionPolicy {
    pub fn new(
        now_ms: i64,
        minimum_completed_to_retain: usize,
        max_removals: usize,
    ) -> Result<Self, DurableRetentionPolicyError> {
        if now_ms <= 0 {
            return Err(DurableRetentionPolicyError::InvalidNow);
        }
        if max_removals == 0 {
            return Err(DurableRetentionPolicyError::InvalidRemovalLimit);
        }
        Ok(Self {
            now_ms,
            minimum_completed_to_retain,
            max_removals,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DurableRetentionResult {
    Completed {
        receipts_removed: usize,
        responses_removed: usize,
        orphan_responses_removed: usize,
    },
    Unavailable {
        receipts_removed: usize,
        responses_removed: usize,
        orphan_responses_removed: usize,
    },
}

pub struct LinkedDurableRetention;

impl LinkedDurableRetention {
    pub fn prune(
        records: &mut DurableRecordRepository,
        responses: &mut ResponseArchiveRepository,
        policy: DurableRetentionPolicy,
    ) -> DurableRetentionResult {
        let mut counts = RetentionCounts::default();
        let mut snapshot = match records.retention_records() {
            Ok(snapshot) => snapshot,
            Err(()) => return counts.unavailable(),
        };
        let removable_count = snapshot
            .len()
            .saturating_sub(policy.minimum_completed_to_retain);
        snapshot.sort_by(|left, right| {
            left.finalized_at_ms
                .cmp(&right.finalized_at_ms)
                .then_with(|| left.key.storage_key().cmp(right.key.storage_key()))
        });
        let candidates = snapshot
            .into_iter()
            .filter(|record| record.expires_at <= policy.now_ms)
            .take(removable_count)
            .take(policy.max_removals)
            .collect::<Vec<_>>();

        for candidate in candidates {
            match records.remove_terminal_exact(&candidate.key, &candidate.response_reference) {
                RetentionRecordRemoveResult::Removed => counts.receipts_removed += 1,
                RetentionRecordRemoveResult::Missing | RetentionRecordRemoveResult::Changed => {
                    return counts.unavailable();
                }
                RetentionRecordRemoveResult::Unavailable => return counts.unavailable(),
            }
            let response_is_referenced =
                match response_is_referenced(records, &candidate.response_reference) {
                    Ok(referenced) => referenced,
                    Err(()) => return counts.unavailable(),
                };
            if !response_is_referenced {
                match responses.remove_exact(&candidate.response_reference) {
                    RetentionResponseRemoveResult::Removed => counts.responses_removed += 1,
                    RetentionResponseRemoveResult::Missing => {}
                    RetentionResponseRemoveResult::Unavailable => return counts.unavailable(),
                }
            }
        }

        let operations_used = counts.receipts_removed;
        let has_unknown_reservations = match records.has_unknown_reservations() {
            Ok(has_unknown) => has_unknown,
            Err(()) => return counts.unavailable(),
        };
        if operations_used < policy.max_removals && !has_unknown_reservations {
            let referenced = match referenced_responses(records) {
                Ok(referenced) => referenced,
                Err(()) => return counts.unavailable(),
            };
            let archive_references = match responses.retention_references() {
                Ok(references) => references,
                Err(()) => return counts.unavailable(),
            };
            for orphan in archive_references
                .into_iter()
                .filter(|reference| !referenced.contains(reference))
                .take(policy.max_removals - operations_used)
            {
                match responses.remove_exact(&orphan) {
                    RetentionResponseRemoveResult::Removed => {
                        counts.orphan_responses_removed += 1;
                    }
                    RetentionResponseRemoveResult::Missing => {}
                    RetentionResponseRemoveResult::Unavailable => return counts.unavailable(),
                }
            }
        }
        counts.completed()
    }
}

#[derive(Default)]
struct RetentionCounts {
    receipts_removed: usize,
    responses_removed: usize,
    orphan_responses_removed: usize,
}

impl RetentionCounts {
    fn completed(&self) -> DurableRetentionResult {
        DurableRetentionResult::Completed {
            receipts_removed: self.receipts_removed,
            responses_removed: self.responses_removed,
            orphan_responses_removed: self.orphan_responses_removed,
        }
    }

    fn unavailable(&self) -> DurableRetentionResult {
        DurableRetentionResult::Unavailable {
            receipts_removed: self.receipts_removed,
            responses_removed: self.responses_removed,
            orphan_responses_removed: self.orphan_responses_removed,
        }
    }
}

fn response_is_referenced(
    records: &DurableRecordRepository,
    response_reference: &str,
) -> Result<bool, ()> {
    Ok(referenced_responses(records)?.contains(response_reference))
}

fn referenced_responses(records: &DurableRecordRepository) -> Result<BTreeSet<String>, ()> {
    Ok(records
        .retention_records()?
        .into_iter()
        .map(|record: RetentionRecord| record.response_reference)
        .collect())
}
