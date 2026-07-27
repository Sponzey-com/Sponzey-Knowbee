import { REQUIRED_HARNESS_REGRESSION_TEST_IDS } from "./recursive-prompt-improvement-gate.js";
function required(value, field) {
    const normalized = value.trim();
    if (!normalized)
        throw new Error(`${field} is required.`);
    return normalized;
}
function exactSet(left, right) {
    const a = left.map((value) => value.trim()).filter(Boolean);
    const b = right.map((value) => value.trim()).filter(Boolean);
    return a.length === left.length && b.length === right.length
        && new Set(a).size === a.length && new Set(b).size === b.length
        && a.length === b.length && a.every((value) => b.includes(value));
}
function exactRequiredRegression(receipt) {
    return receipt.requiredTestIds.length === REQUIRED_HARNESS_REGRESSION_TEST_IDS.length
        && receipt.passedTestIds.length === REQUIRED_HARNESS_REGRESSION_TEST_IDS.length
        && new Set(receipt.requiredTestIds).size === receipt.requiredTestIds.length
        && new Set(receipt.passedTestIds).size === receipt.passedTestIds.length
        && REQUIRED_HARNESS_REGRESSION_TEST_IDS.every((testId) => receipt.requiredTestIds.includes(testId) && receipt.passedTestIds.includes(testId))
        && receipt.evidenceRef.trim().length > 0;
}
export function authorizeHarnessSelfImprovementReview(input) {
    const proposalFingerprint = required(input.proposalFingerprint, "Proposal fingerprint");
    const sourceSetFingerprint = required(input.sourceSetFingerprint, "Source-set fingerprint");
    if (!input.currentRuntimeSnapshotFingerprint.trim())
        return { status: "blocked", reasonCode: "runtime_snapshot_invalid" };
    if (input.entry.status !== "authorized")
        return { status: "blocked", reasonCode: "entry_unverified" };
    if (input.control.status !== "verified")
        return { status: "blocked", reasonCode: "current_harness_unverified" };
    if (input.application.status !== "authorized" || input.application.fixedRisk !== "high")
        return { status: "blocked", reasonCode: "guardrail_review_unverified" };
    if (input.stateMachine.status !== "complete")
        return { status: "blocked", reasonCode: "state_machine_unverified" };
    if (input.highRisk.status !== "authorized" || input.highRisk.risk !== "high")
        return { status: "blocked", reasonCode: "high_risk_review_unverified" };
    if (input.sourceEvidence.status !== "verified")
        return { status: "blocked", reasonCode: "source_evidence_unverified" };
    if (!input.applyApproval)
        return { status: "blocked", reasonCode: "apply_approval_missing" };
    if (input.applyApproval.status !== "authorized" || input.applyApproval.scope !== "apply")
        return { status: "blocked", reasonCode: "apply_approval_unverified" };
    if (input.control.proposalFingerprint !== proposalFingerprint || input.stateMachine.proposalFingerprint !== proposalFingerprint
        || input.highRisk.changeId !== proposalFingerprint || input.sourceEvidence.changeId !== proposalFingerprint
        || input.applyApproval.proposalFingerprint !== proposalFingerprint)
        return { status: "blocked", reasonCode: "proposal_scope_mismatch" };
    if (input.sourceEvidence.sourceSetFingerprint !== sourceSetFingerprint || input.applyApproval.sourceSetFingerprint !== sourceSetFingerprint) {
        return { status: "blocked", reasonCode: "source_scope_mismatch" };
    }
    const sourceRefs = input.control.targetSourceRefs;
    if (!exactSet(sourceRefs, input.entry.targetHarnessSourceRefs) || !exactSet(sourceRefs, input.sourceEvidence.sourceRefs)) {
        return { status: "blocked", reasonCode: "source_scope_mismatch" };
    }
    if (input.mutations.some((decision) => decision.status !== "authorized"))
        return { status: "blocked", reasonCode: "mutation_boundary_blocked" };
    const mutationRefs = input.mutations.map((decision) => decision.status === "authorized" ? decision.target.canonicalWorkspacePath ?? "" : "");
    if (!exactSet(sourceRefs, mutationRefs))
        return { status: "blocked", reasonCode: "mutation_scope_mismatch" };
    if (input.mutations.some((decision) => decision.status === "authorized" && decision.runtimeSnapshotId !== input.currentRuntimeSnapshotFingerprint)) {
        return { status: "blocked", reasonCode: "runtime_snapshot_mismatch" };
    }
    if (input.rollbackReadiness.length === 0)
        return { status: "blocked", reasonCode: "rollback_readiness_missing" };
    if (input.rollbackReadiness.some((decision) => decision.status !== "authorized"))
        return { status: "blocked", reasonCode: "rollback_readiness_unverified" };
    const rollbackSourceRefs = input.rollbackReadiness.map((decision) => decision.status === "authorized" ? decision.targetSourceRef : "");
    if (!exactSet(sourceRefs, rollbackSourceRefs))
        return { status: "blocked", reasonCode: "rollback_scope_mismatch" };
    return { status: "authorized", receipt: { schemaVersion: 1, stage: "apply_authorized", proposalFingerprint, sourceSetFingerprint,
            currentRuntimeSnapshotFingerprint: input.currentRuntimeSnapshotFingerprint, sourceRefs: [...sourceRefs], fixedRisk: "high",
            entryRequestId: input.entry.requestId, applyApprovalId: input.applyApproval.approvalId,
            activeHarnessChecksum: input.control.activeHarnessChecksum, rollbackSourceRefs } };
}
export function authorizeHarnessSelfImprovementActivation(input) {
    if (input.review.status !== "authorized")
        return { status: "blocked", reasonCode: "review_unverified" };
    const review = input.review.receipt;
    if (input.write.schemaVersion !== 1 || input.write.verified !== true || !Number.isSafeInteger(input.write.writtenAt)
        || input.write.writtenAt < 0 || !input.write.appliedChecksum.trim() || !exactSet(input.write.sourceRefs, review.sourceRefs)) {
        return { status: "blocked", reasonCode: "source_write_unverified" };
    }
    if (input.write.proposalFingerprint !== review.proposalFingerprint || input.write.sourceSetFingerprint !== review.sourceSetFingerprint) {
        return { status: "blocked", reasonCode: "post_write_scope_mismatch" };
    }
    const regression = input.regression;
    if (!regression)
        return { status: "blocked", reasonCode: "post_write_regression_missing" };
    if (regression.proposalFingerprint !== review.proposalFingerprint || regression.sourceSetFingerprint !== review.sourceSetFingerprint) {
        return { status: "blocked", reasonCode: "post_write_scope_mismatch" };
    }
    if (regression.schemaVersion !== 1 || regression.status !== "passed")
        return { status: "blocked", reasonCode: "post_write_regression_failed" };
    if (!exactRequiredRegression(regression))
        return { status: "blocked", reasonCode: "post_write_regression_incomplete" };
    if (input.activationApproval.status !== "authorized" || input.activationApproval.scope !== "activation")
        return { status: "blocked", reasonCode: "activation_approval_unverified" };
    if (input.publication.status !== "authorized")
        return { status: "blocked", reasonCode: "publication_unverified" };
    if (input.publication.runtimeSnapshotFingerprint === review.currentRuntimeSnapshotFingerprint)
        return { status: "blocked", reasonCode: "current_runtime_activation_forbidden" };
    if (input.activationApproval.proposalFingerprint !== review.proposalFingerprint || input.activationApproval.sourceSetFingerprint !== review.sourceSetFingerprint
        || input.activationApproval.appliedChecksum !== input.write.appliedChecksum
        || input.activationApproval.runtimeTargetFingerprint !== input.publication.runtimeSnapshotFingerprint
        || input.publication.proposalFingerprint !== review.proposalFingerprint)
        return { status: "blocked", reasonCode: "activation_scope_mismatch" };
    return { status: "authorized", receipt: { schemaVersion: 1, stage: "activation_authorized", proposalFingerprint: review.proposalFingerprint,
            sourceSetFingerprint: review.sourceSetFingerprint, appliedChecksum: input.write.appliedChecksum,
            activationApprovalId: input.activationApproval.approvalId, activationRunId: input.publication.activationRunId,
            runtimeSnapshotFingerprint: input.publication.runtimeSnapshotFingerprint } };
}
export function decideHarnessSelfImprovementFailure(input) {
    if (input.review.status !== "authorized")
        return { status: "blocked", reasonCode: "review_unverified" };
    const review = input.review.receipt;
    if (input.write.schemaVersion !== 1 || input.write.verified !== true || !exactSet(input.write.sourceRefs, review.sourceRefs))
        return { status: "blocked", reasonCode: "source_write_unverified" };
    if (input.failure.proposalFingerprint !== review.proposalFingerprint || input.failure.sourceSetFingerprint !== review.sourceSetFingerprint || !input.failure.evidenceRef.trim()) {
        return { status: "blocked", reasonCode: "failure_scope_mismatch" };
    }
    const restoration = input.restoration;
    if (!restoration)
        return { status: "rollback_required", reasonCode: "post_write_failure", rollbackSourceRefs: review.rollbackSourceRefs };
    if (restoration.proposalFingerprint !== review.proposalFingerprint || restoration.sourceSetFingerprint !== review.sourceSetFingerprint
        || !restoration.baselineRestored || !restoration.verificationRef.trim() || !exactSet(restoration.restoredSourceRefs, review.rollbackSourceRefs)) {
        return { status: "rollback_required", reasonCode: "rollback_unverified", rollbackSourceRefs: review.rollbackSourceRefs };
    }
    return { status: "rolled_back", proposalFingerprint: review.proposalFingerprint, verificationRef: restoration.verificationRef };
}
export async function executeAuthorizedHarnessSelfImprovement(input) {
    if (input.decision.status !== "authorized")
        return input.decision;
    return { status: "applied", result: await input.apply(input.decision.receipt) };
}
export async function publishAuthorizedHarnessSelfImprovement(input) {
    if (input.decision.status !== "authorized")
        return input.decision;
    return { status: "published", result: await input.publish(input.decision.receipt) };
}
//# sourceMappingURL=harness-self-improvement-invariants.js.map