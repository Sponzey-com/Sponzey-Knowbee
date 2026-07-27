import { createHash } from "node:crypto";
const TYPED_REFERENCE = /^(?:artifact|context|evidence|report|result|review|work):\S+$/;
function required(value, field) {
    const normalized = value.trim();
    if (!normalized)
        throw new Error(`${field} is required.`);
    return normalized;
}
function unique(values, field) {
    return [...new Set(values.map((value) => required(value, field)))];
}
function fingerprint(value) {
    return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}
export function fingerprintStructuredTaskScope(scope) {
    return fingerprint(scope);
}
export function isRedelegationReasonCode(value) {
    return ["missing_evidence", "low_quality", "incomplete_scope", "execution_failure", "permission_boundary", "user_goal_changed"].includes(value);
}
export function buildParentResultDisposition(input) {
    const reviewId = required(input.reviewId, "Review ID");
    const sourceResultReportId = required(input.sourceResultReportId, "Source result report ID");
    if (input.review.verdict === "accept")
        return { outcome: "accept", reviewId, sourceResultReportId };
    const missingItems = unique(input.review.missingItems, "Missing item");
    const requiredChanges = unique(input.review.requiredChanges, "Required change");
    if (missingItems.length === 0 && requiredChanges.length === 0)
        throw new Error("A correction package requires missing items or required changes.");
    const preservedEvidenceRefs = unique(input.preservedEvidenceRefs, "Preserved evidence reference");
    if (preservedEvidenceRefs.some((value) => !TYPED_REFERENCE.test(value)))
        throw new Error("Preserved evidence must use typed references.");
    const correctedScope = structuredClone(input.correctedScope);
    const base = { reviewId, sourceResultReportId, verdict: input.review.verdict, missingItems, requiredChanges, preservedEvidenceRefs, correctedScope, correctedScopeFingerprint: fingerprintStructuredTaskScope(correctedScope) };
    return { outcome: "correct", correction: { ...base, correctionFingerprint: fingerprint(base) } };
}
function reasonMatchesReview(reasonCode, correction, evidenceRefs) {
    if (reasonCode === "missing_evidence")
        return correction.verdict === "insufficient_evidence";
    if (reasonCode === "low_quality")
        return correction.verdict === "needs_revision" || correction.verdict === "reject";
    if (reasonCode === "incomplete_scope")
        return correction.verdict === "needs_revision" || correction.verdict === "limited_success";
    if (reasonCode === "execution_failure")
        return correction.verdict === "reject";
    if (reasonCode === "permission_boundary")
        return evidenceRefs.some((ref) => ref.startsWith("evidence:permission:"));
    return evidenceRefs.some((ref) => ref.startsWith("evidence:user-goal-changed:"));
}
export function authorizeEvidenceBackedRedelegation(input) {
    const parentAgentName = required(input.parentAgentName, "Parent agent name");
    const previousTargetAgentName = required(input.previousTargetAgentName, "Previous target agent name");
    const nextTargetAgentName = required(input.nextTargetAgentName, "Next target agent name");
    required(input.reasonDetail, "Redelegation reason detail");
    const originalScopeFingerprint = required(input.originalScopeFingerprint, "Original scope fingerprint");
    if (parentAgentName === nextTargetAgentName)
        return { ok: false, reasonCode: "self_redelegation_denied" };
    const evidenceRefs = unique(input.reasonEvidenceRefs, "Redelegation evidence reference");
    if (evidenceRefs.length === 0 || evidenceRefs.some((ref) => !TYPED_REFERENCE.test(ref)))
        return { ok: false, reasonCode: "redelegation_evidence_invalid" };
    if (!reasonMatchesReview(input.reasonCode, input.correction, evidenceRefs))
        return { ok: false, reasonCode: "redelegation_reason_review_mismatch" };
    if (originalScopeFingerprint === input.correction.correctedScopeFingerprint)
        return { ok: false, reasonCode: "redelegation_scope_unchanged" };
    if (input.previousStrategyFingerprint &&
        input.previousStrategyFingerprint === input.currentStrategyFingerprint)
        return { ok: false, reasonCode: "redelegation_failure_unchanged" };
    const signed = { correctionFingerprint: input.correction.correctionFingerprint, reviewId: input.correction.reviewId, sourceResultReportId: input.correction.sourceResultReportId, parentAgentName, previousTargetAgentName, nextTargetAgentName, reasonCode: input.reasonCode, reasonDetail: input.reasonDetail.trim(), evidenceRefs, originalScopeFingerprint, currentStrategyFingerprint: input.currentStrategyFingerprint ?? null };
    const authorizationFingerprint = fingerprint(signed);
    return { ok: true, reasonCode: input.reasonCode, authorizationReceiptId: `redelegation:${authorizationFingerprint.slice("sha256:".length)}`, authorizationFingerprint };
}
//# sourceMappingURL=evidence-redelegation.js.map