export function decideCleanupCandidate(evidence) {
    const candidateId = evidence.candidateId.trim();
    const reasonCodes = [];
    if (!candidateId)
        reasonCodes.push("candidate_id_missing");
    if (evidence.referenceScanCompleted !== true)
        reasonCodes.push("reference_scan_incomplete");
    if (evidence.activeReferenceCount === undefined) {
        reasonCodes.push("active_reference_count_unknown");
    }
    else if (!Number.isInteger(evidence.activeReferenceCount) || evidence.activeReferenceCount < 0) {
        reasonCodes.push("active_reference_count_unknown");
    }
    else if (evidence.activeReferenceCount > 0) {
        reasonCodes.push("active_reference_present");
    }
    if (evidence.retentionClass === "permanent")
        reasonCodes.push("permanent_retention");
    if (evidence.retentionClass === "standard")
        reasonCodes.push("retention_not_expired");
    if (evidence.migrationRequired === undefined) {
        reasonCodes.push("migration_review_missing");
    }
    else if (evidence.migrationRequired) {
        reasonCodes.push("migration_required");
    }
    if (evidence.rollbackRequired === undefined) {
        reasonCodes.push("rollback_review_missing");
    }
    else if (evidence.rollbackRequired) {
        reasonCodes.push("rollback_required");
    }
    if (evidence.deletionApproved !== true)
        reasonCodes.push("deletion_approval_missing");
    if (reasonCodes.length > 0) {
        return { decision: "retain", candidateId, reasonCodes };
    }
    return { decision: "delete", candidateId, reasonCodes: ["cleanup_evidence_complete"] };
}
const REQUIRED_CLEANUP_REFERENCE_BOUNDARIES = [
    "runtime",
    "test",
    "prompt_registry",
    "data_migration",
    "user_data_retention",
    "deployment_artifact",
];
const RECOVERABLE_STRATEGIES = [
    "restore_from_source",
    "restore_from_backup",
    "reverse_migration",
];
function nonEmpty(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function validApproval(plan) {
    const approval = plan.approval;
    return approval !== undefined
        && nonEmpty(approval.approvalId)
        && approval.artifactId === plan.artifactId.trim()
        && approval.scope === "delete"
        && approval.policyVersion === plan.policyVersion
        && Number.isFinite(approval.approvedAt)
        && Number.isFinite(approval.expiresAt)
        && approval.approvedAt <= plan.evaluatedAt
        && approval.expiresAt >= plan.evaluatedAt;
}
export function evaluateProtectedCleanupPlan(plan) {
    const artifactId = plan.artifactId.trim();
    const reasonCodes = [];
    if (!artifactId)
        reasonCodes.push("artifact_id_missing");
    if (!nonEmpty(plan.canonicalOwner))
        reasonCodes.push("canonical_owner_missing");
    for (const boundary of REQUIRED_CLEANUP_REFERENCE_BOUNDARIES) {
        const receipt = plan.referenceReceipts?.[boundary];
        if (!receipt) {
            reasonCodes.push("reference_boundary_missing");
            continue;
        }
        if (receipt.checked !== true)
            reasonCodes.push("reference_check_incomplete");
        if (!nonEmpty(receipt.checkerId)
            || !nonEmpty(receipt.snapshotId)
            || !Number.isFinite(receipt.checkedAt)
            || !Number.isInteger(receipt.activeReferenceCount)
            || receipt.activeReferenceCount < 0) {
            reasonCodes.push("reference_receipt_invalid");
        }
        else if (receipt.activeReferenceCount > 0) {
            reasonCodes.push("active_reference_present");
        }
    }
    if (plan.protectionClass === "classification_unknown") {
        reasonCodes.push("protection_class_unknown");
    }
    const isProtected = plan.protectionClass !== "unprotected"
        && plan.protectionClass !== "classification_unknown";
    const disposition = plan.retentionDisposition;
    const hasDisposition = disposition !== undefined
        && disposition.disposition === "deletion_allowed"
        && nonEmpty(disposition.evidence)
        && disposition.policyVersion === plan.policyVersion
        && (disposition.validUntil === undefined || disposition.validUntil >= plan.evaluatedAt);
    const approvalIsValid = validApproval(plan);
    if (isProtected && !hasDisposition && !approvalIsValid) {
        reasonCodes.push("retention_or_approval_missing");
    }
    if (disposition !== undefined && !hasDisposition) {
        reasonCodes.push("retention_policy_mismatch");
    }
    if (plan.approval !== undefined && !approvalIsValid) {
        reasonCodes.push("approval_invalid");
    }
    if (plan.legalOrAuditHold)
        reasonCodes.push("hold_active");
    if (plan.retentionUntil !== undefined && plan.retentionUntil > plan.evaluatedAt) {
        reasonCodes.push("retention_period_active");
    }
    if (plan.affectedConsumers.some((consumer) => nonEmpty(consumer))) {
        reasonCodes.push("affected_consumers_present");
    }
    if (RECOVERABLE_STRATEGIES.includes(plan.recoveryStrategy)
        && !nonEmpty(plan.recoveryTarget)) {
        reasonCodes.push("recovery_target_missing");
    }
    if (plan.recoveryStrategy === "not_recoverable"
        && (!plan.reproducible || isProtected || !approvalIsValid)) {
        reasonCodes.push("irrecoverable_artifact_not_approved");
    }
    if (plan.postDeletionChecks.length === 0 || plan.postDeletionChecks.some((check) => !nonEmpty(check))) {
        reasonCodes.push("post_deletion_checks_missing");
    }
    if (reasonCodes.length > 0) {
        return { decision: "retain", artifactId, reasonCodes: [...new Set(reasonCodes)] };
    }
    return {
        decision: "deletion_eligible",
        artifactId,
        reasonCodes: ["protected_cleanup_evidence_complete"],
    };
}
export async function applyProtectedCleanupPlan(input) {
    const currentDecision = evaluateProtectedCleanupPlan(input.plan);
    if (input.decision.decision !== "deletion_eligible"
        || currentDecision.decision !== "deletion_eligible"
        || input.decision.artifactId !== currentDecision.artifactId) {
        return { status: "retained", artifactId: currentDecision.artifactId };
    }
    await input.deleteArtifact(currentDecision.artifactId);
    return { status: "deleted", artifactId: currentDecision.artifactId };
}
export function evaluatePostDeletionVerification(input) {
    const artifactId = input.plan.artifactId.trim();
    const receipt = input.deletionReceipt;
    const reasonCodes = [];
    const failedBoundaries = [];
    if (!nonEmpty(receipt.decisionId))
        reasonCodes.push("decision_id_missing");
    if (receipt.artifactId !== artifactId)
        reasonCodes.push("deletion_receipt_target_mismatch");
    if (receipt.canonicalOwner !== input.plan.canonicalOwner.trim()) {
        reasonCodes.push("deletion_receipt_owner_mismatch");
    }
    for (const boundary of REQUIRED_CLEANUP_REFERENCE_BOUNDARIES) {
        const postReceipt = input.postDeletionReferences?.[boundary];
        if (!postReceipt || postReceipt.checked !== true) {
            reasonCodes.push("post_delete_boundary_missing");
            failedBoundaries.push(boundary);
            continue;
        }
        if (!nonEmpty(postReceipt.snapshotId)
            || postReceipt.snapshotId === receipt.preDeletionSnapshotId
            || postReceipt.checkedAt <= receipt.deletedAt) {
            reasonCodes.push("post_delete_snapshot_not_fresh");
            failedBoundaries.push(boundary);
        }
        if (!Number.isInteger(postReceipt.activeReferenceCount) || postReceipt.activeReferenceCount > 0) {
            reasonCodes.push("post_delete_reference_present");
            failedBoundaries.push(boundary);
        }
    }
    for (const kind of ["focused_test", "static_reference"]) {
        const validation = input.validations.find((candidate) => candidate.kind === kind);
        if (!validation) {
            reasonCodes.push("validation_receipt_missing");
        }
        else if (!nonEmpty(validation.receiptId) || validation.checkedAt <= receipt.deletedAt) {
            reasonCodes.push("validation_receipt_invalid");
        }
        else if (!validation.passed) {
            reasonCodes.push("validation_failed");
        }
    }
    const baseTrace = [
        {
            from: "deletion_eligible",
            event: "delete_applied",
            to: "deleted",
            receiptId: receipt.decisionId,
        },
        {
            from: "deleted",
            event: "verification_started",
            to: "verifying",
            receiptId: receipt.decisionId,
        },
    ];
    const uniqueReasons = [...new Set(reasonCodes)];
    const identityRejected = uniqueReasons.some((reason) => reason === "decision_id_missing"
        || reason === "deletion_receipt_target_mismatch"
        || reason === "deletion_receipt_owner_mismatch");
    if (identityRejected) {
        return { status: "rejected", artifactId, trace: [], reasonCodes: uniqueReasons };
    }
    if (uniqueReasons.length > 0) {
        const recoveryTarget = input.plan.recoveryTarget?.trim() ?? "";
        if (!recoveryTarget)
            uniqueReasons.push("recovery_target_missing");
        const failureReceipt = input.validations.find((validation) => nonEmpty(validation.receiptId))?.receiptId
            ?? receipt.decisionId;
        const trace = [...baseTrace, {
                from: "verifying",
                event: "verification_failed",
                to: "recovery_required",
                receiptId: failureReceipt,
            }];
        return {
            status: "recovery_required",
            artifactId,
            trace,
            reasonCodes: [...new Set(uniqueReasons)],
            ...(recoveryTarget ? {
                recovery: {
                    artifactId,
                    strategy: input.plan.recoveryStrategy,
                    recoveryTarget,
                    failedBoundaries: [...new Set(failedBoundaries)],
                    postDeletionSnapshotIds: REQUIRED_CLEANUP_REFERENCE_BOUNDARIES.flatMap((boundary) => {
                        const snapshotId = input.postDeletionReferences?.[boundary]?.snapshotId;
                        return nonEmpty(snapshotId) ? [snapshotId] : [];
                    }),
                },
            } : {}),
        };
    }
    return {
        status: "verified",
        artifactId,
        trace: [...baseTrace, {
                from: "verifying",
                event: "verification_passed",
                to: "verified",
                receiptId: input.validations.map((validation) => validation.receiptId).join("+"),
            }],
        reasonCodes: ["post_deletion_verification_complete"],
    };
}
//# sourceMappingURL=cleanup-decision.js.map