export const INTERNAL_EVIDENCE_REDACTION_MASK = "[internal-evidence-redacted]";
const INTERNAL_EVIDENCE_TEXT_PATTERNS = [
    /\byeonjang-goal-validation:[^\s,;)\]}]+/giu,
    /\boperationId\s*[:=]\s*[^\s,;)\]}]+/giu,
    /\boperation:[^\s,;)\]}]+/giu,
    /\breceipt payload\b/giu,
    /\braw observed state\b/giu,
    /\bstructured diagnosis payload\b/giu,
    /\bDB row\b/gu,
];
const INTERNAL_EVIDENCE_KEY_PATTERN = /^(operationId|operation_id|receiptPayload|receipt_payload|rawObservedState|raw_observed_state|structuredDiagnosisPayload|structured_diagnosis_payload)$/i;
export function redactInternalEvidenceText(raw, options = {}) {
    let value = raw;
    const replacement = options.replacement ?? INTERNAL_EVIDENCE_REDACTION_MASK;
    for (const pattern of INTERNAL_EVIDENCE_TEXT_PATTERNS) {
        value = value.replace(pattern, (match) => {
            options.onRedaction?.(match);
            return replacement;
        });
    }
    return value;
}
export function containsInternalEvidenceText(raw) {
    for (const pattern of INTERNAL_EVIDENCE_TEXT_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(raw))
            return true;
    }
    return false;
}
export function isInternalEvidenceKey(key) {
    return INTERNAL_EVIDENCE_KEY_PATTERN.test(key);
}
//# sourceMappingURL=internal-evidence-redaction.js.map