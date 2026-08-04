export const CANONICAL_WORK_RECEIPT_KINDS = [
    "diagnosis", "analysis_revision", "policy", "execution", "attempt", "verification", "recovery",
    "input_requirement", "user_input", "exhaustion", "cancellation", "delivery",
    "blocker", "approval",
];
export const CANONICAL_EVENT_RECEIPT_KINDS = Object.freeze({
    DIAGNOSIS_ACCEPTED: "diagnosis", ANALYSIS_REVISED: "analysis_revision", POLICY_ALLOWED: "policy", EXECUTION_STARTED: "execution",
    APPROVAL_REQUESTED: "approval", APPROVAL_CONSUMED: "approval", APPROVAL_DENIED_OR_EXPIRED: "approval",
    ATTEMPT_RECORDED: "attempt", ALL_CRITERIA_VERIFIED: "verification", SOME_CRITERIA_VERIFIED: "verification",
    RECOVERY_ACCEPTED: "recovery", INPUT_REQUIRED: "input_requirement", USER_INPUT_RECEIVED: "user_input",
    POLICY_BLOCKED: "policy", PATHS_EXHAUSTED: "exhaustion", USER_CANCELLED: "cancellation", REPORT_DELIVERED: "delivery",
    RESULT_BLOCKED: "blocker",
});
export const CANONICAL_TERMINAL_CAUSE_ORIGIN_STAGES = [
    "ingress",
    "runtime_configuration",
    "request_diagnosis",
    "solution_plan",
    "policy_admission",
    "execution",
    "result_diagnosis",
    "final_response_rendering",
    "delivery",
    "recovery",
];
export const CANONICAL_TERMINAL_CAUSE_OUTCOME_KINDS = [
    "policy_block",
    "technical_failure",
    "input_required",
    "exhausted",
    "cancelled",
    "blocked",
];
function validText(value) { return value.trim().length > 0; }
function validTerminalCause(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return false;
    const record = value;
    const allowedKeys = new Set([
        "schemaVersion",
        "originStage",
        "outcomeKind",
        "reasonCode",
        "safeAlternativesExhausted",
    ]);
    if (Object.keys(record).some((key) => !allowedKeys.has(key)))
        return false;
    if (record["schemaVersion"] !== 1)
        return false;
    if (!CANONICAL_TERMINAL_CAUSE_ORIGIN_STAGES.includes(record["originStage"]))
        return false;
    if (!CANONICAL_TERMINAL_CAUSE_OUTCOME_KINDS.includes(record["outcomeKind"]))
        return false;
    if (typeof record["reasonCode"] !== "string" || !/^[a-z0-9][a-z0-9._:-]{0,127}$/u.test(record["reasonCode"]))
        return false;
    if (record["safeAlternativesExhausted"] !== undefined
        && typeof record["safeAlternativesExhausted"] !== "boolean")
        return false;
    return true;
}
export function validateCanonicalWorkReceipt(receipt) {
    if (!validText(receipt.receiptId) || !validText(receipt.workId))
        return { ok: false, reasonCode: "receipt_invalid" };
    if (!CANONICAL_WORK_RECEIPT_KINDS.includes(receipt.kind))
        return { ok: false, reasonCode: "receipt_invalid" };
    if (!/^sha256:[a-f0-9]{64}$/u.test(receipt.evidenceFingerprint))
        return { ok: false, reasonCode: "receipt_invalid" };
    if (!Number.isSafeInteger(receipt.issuedAt) || receipt.issuedAt < 0)
        return { ok: false, reasonCode: "receipt_invalid" };
    if (receipt.evidenceRefs.length === 0 || receipt.evidenceRefs.some((ref) => !validText(ref)) || new Set(receipt.evidenceRefs).size !== receipt.evidenceRefs.length)
        return { ok: false, reasonCode: "receipt_invalid" };
    if (receipt.consumedRevision !== undefined && (!Number.isSafeInteger(receipt.consumedRevision) || receipt.consumedRevision <= 0))
        return { ok: false, reasonCode: "receipt_invalid" };
    if (receipt.terminalCause !== undefined && !validTerminalCause(receipt.terminalCause))
        return { ok: false, reasonCode: "receipt_invalid" };
    return { ok: true };
}
export function validateCanonicalWorkReceiptForEvent(input) {
    const structural = validateCanonicalWorkReceipt(input.receipt);
    if (!structural.ok)
        return structural;
    if (input.receipt.workId !== input.workId)
        return { ok: false, reasonCode: "receipt_scope_mismatch" };
    if (input.receipt.consumedRevision !== undefined)
        return { ok: false, reasonCode: "receipt_already_consumed" };
    if (input.receipt.kind !== CANONICAL_EVENT_RECEIPT_KINDS[input.event])
        return { ok: false, reasonCode: "receipt_kind_mismatch" };
    return { ok: true };
}
//# sourceMappingURL=canonical-work-receipt.js.map