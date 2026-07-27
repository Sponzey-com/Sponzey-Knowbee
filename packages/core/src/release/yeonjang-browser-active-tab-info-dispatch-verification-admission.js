import { createHash } from "node:crypto";
const REDACTED_RUNTIME_OBSERVATION_REF_PATTERN = /^runtime-observation:active-tab-info:redacted:[a-z0-9._:-]+$/u;
const LLM_DECISION_SUMMARY_REF_PATTERN = /^llm-verification-decision:active-tab-info:summary:[a-z0-9._:-]+$/u;
function dispatchExecutionReceiptId(receipt) {
    return receipt.receipt?.dispatchExecutionReceiptId;
}
function buildVerificationAdmissionId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.dispatchExecutionReceiptId,
        input.redactedRuntimeObservationRef,
        input.llmDecisionSummaryRef,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `dispatch-verification-admission:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-dispatch-verification-admission.v1",
        method: "browser.active_tab_info",
        status: input.status,
        reasonCode: input.reasonCode,
        ...(input.blockingReasonCodes === undefined
            ? {}
            : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
        ...(input.admission === undefined ? {} : { admission: input.admission }),
        admitNow: input.status === "verification_admission_ready",
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
        enableDefaultLiveSmokeNow: false,
        markUserGoalSucceededNow: false,
    });
}
export function buildYeonjangBrowserActiveTabInfoDispatchVerificationAdmission(input) {
    const blockingReasonCodes = [];
    const receiptId = dispatchExecutionReceiptId(input.dispatchExecutionReceipt);
    if (input.dispatchExecutionReceipt.status !== "dispatch_execution_receipt_ready" || receiptId === undefined) {
        blockingReasonCodes.push("dispatch_verification_admission_execution_receipt_not_ready");
    }
    if (!REDACTED_RUNTIME_OBSERVATION_REF_PATTERN.test(input.redactedRuntimeObservationRef)) {
        blockingReasonCodes.push("dispatch_verification_admission_observation_ref_invalid");
    }
    if (input.llmVerificationDecision !== "verified") {
        blockingReasonCodes.push("dispatch_verification_admission_llm_decision_not_verified");
    }
    if (!LLM_DECISION_SUMMARY_REF_PATTERN.test(input.llmDecisionSummaryRef)) {
        blockingReasonCodes.push("dispatch_verification_admission_llm_summary_ref_invalid");
    }
    if (input.verificationChecklistStatus !== "passed") {
        blockingReasonCodes.push("dispatch_verification_admission_checklist_not_passed");
    }
    if (blockingReasonCodes.length > 0 || receiptId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_dispatch_verification_admission_blocked",
            blockingReasonCodes,
        });
    }
    return baseResult({
        status: "verification_admission_ready",
        reasonCode: "active_tab_info_dispatch_verification_admission_ready",
        admission: Object.freeze({
            verificationAdmissionId: buildVerificationAdmissionId({
                dispatchExecutionReceiptId: receiptId,
                redactedRuntimeObservationRef: input.redactedRuntimeObservationRef,
                llmDecisionSummaryRef: input.llmDecisionSummaryRef,
            }),
            dispatchExecutionReceiptId: receiptId,
            redactedRuntimeObservationRef: input.redactedRuntimeObservationRef,
            verificationChecklistStatus: "passed",
            llmDecisionSummaryRef: input.llmDecisionSummaryRef,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-dispatch-verification-admission.js.map