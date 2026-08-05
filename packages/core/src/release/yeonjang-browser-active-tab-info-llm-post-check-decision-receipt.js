import { createHash } from "node:crypto";
const SAFE_EVIDENCE_REF_PATTERN = /^(tool-result:yeonjang:browser-active-tab-info:[a-f0-9]{48}|runtime-observation:active-tab-info:redacted:[a-z0-9._:-]+)$/u;
function parseDate(value) {
    if (!value.trim())
        return undefined;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
function admissionIds(admission) {
    if (admission.status !== "verification_admission_ready" || admission.admission === undefined) {
        return undefined;
    }
    return {
        verificationAdmissionId: admission.admission.verificationAdmissionId,
        dispatchExecutionReceiptId: admission.admission.dispatchExecutionReceiptId,
    };
}
function buildReceiptId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.verificationAdmissionId,
        input.decisionStatus,
        String(input.evidenceRefCount),
        input.decidedAt,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `llm-post-check-decision-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-llm-post-check-decision-receipt.v1",
        method: "browser.active_tab_info",
        status: input.status,
        reasonCode: input.reasonCode,
        ...(input.blockingReasonCodes === undefined
            ? {}
            : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
        ...(input.receipt === undefined ? {} : { receipt: input.receipt }),
        goalSatisfied: input.receipt?.decisionStatus === "satisfied",
        deliverFinalResponseNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
        enableDefaultLiveSmokeNow: false,
        markUserGoalSucceededNow: false,
    });
}
export function buildYeonjangBrowserActiveTabInfoLlmPostCheckDecisionReceipt(input) {
    const blockingReasonCodes = [];
    const ids = admissionIds(input.verificationAdmission);
    if (ids === undefined) {
        blockingReasonCodes.push("llm_post_check_decision_verification_admission_not_ready");
    }
    if (!["satisfied", "uncertain", "failed"].includes(input.llmPostCheckDecision)) {
        blockingReasonCodes.push("llm_post_check_decision_status_invalid");
    }
    const evidenceRefs = [...new Set(input.goalSatisfactionEvidenceRefs.map((ref) => ref.trim()).filter(Boolean))];
    if (evidenceRefs.length === 0) {
        blockingReasonCodes.push("llm_post_check_decision_evidence_refs_required");
    }
    if (evidenceRefs.some((ref) => !SAFE_EVIDENCE_REF_PATTERN.test(ref))) {
        blockingReasonCodes.push("llm_post_check_decision_evidence_ref_unsafe");
    }
    const decidedAt = parseDate(input.decidedAt);
    if (decidedAt === undefined) {
        blockingReasonCodes.push("llm_post_check_decision_decided_at_invalid");
    }
    if (blockingReasonCodes.length > 0 || ids === undefined || decidedAt === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_llm_post_check_decision_receipt_blocked",
            blockingReasonCodes,
        });
    }
    const normalizedDecidedAt = decidedAt.toISOString();
    return baseResult({
        status: "llm_post_check_decision_receipt_ready",
        reasonCode: "active_tab_info_llm_post_check_decision_receipt_ready",
        receipt: Object.freeze({
            llmPostCheckDecisionReceiptId: buildReceiptId({
                verificationAdmissionId: ids.verificationAdmissionId,
                decisionStatus: input.llmPostCheckDecision,
                evidenceRefCount: evidenceRefs.length,
                decidedAt: normalizedDecidedAt,
            }),
            verificationAdmissionId: ids.verificationAdmissionId,
            dispatchExecutionReceiptId: ids.dispatchExecutionReceiptId,
            decisionStatus: input.llmPostCheckDecision,
            evidenceRefCount: evidenceRefs.length,
            decidedAt: normalizedDecidedAt,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-llm-post-check-decision-receipt.js.map