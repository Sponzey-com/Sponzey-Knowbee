const CANONICAL_EXECUTION_FAILURE_KIND = "knowbee.canonical_execution_failure.v1";
const CANONICAL_EXECUTION_FAILURE_PHASES = [
    "intake",
    "policy",
    "execution",
    "review",
    "recovery",
    "topology",
];
function normalizeReasonCode(reasonCode) {
    const normalized = reasonCode.trim().slice(0, 120);
    if (!normalized)
        return "canonical_contract_rejected";
    for (const character of normalized) {
        const isLowercaseLetter = character >= "a" && character <= "z";
        const isDigit = character >= "0" && character <= "9";
        if (!isLowercaseLetter &&
            !isDigit &&
            character !== "_" &&
            character !== "." &&
            character !== "-") {
            return "canonical_contract_rejected";
        }
    }
    return normalized;
}
function normalizeSafeEvidenceRefs(values) {
    const refs = (values ?? []).map((value) => value.trim()).filter((value) => {
        if (value.length < 1 || value.length > 160)
            return false;
        for (const character of value) {
            const isLetter = (character >= "a" && character <= "z") ||
                (character >= "A" && character <= "Z");
            const isDigit = character >= "0" && character <= "9";
            if (!isLetter &&
                !isDigit &&
                character !== ":" &&
                character !== "." &&
                character !== "_" &&
                character !== "-") {
                return false;
            }
        }
        return true;
    });
    return [...new Set(refs)].sort();
}
export class CanonicalExecutionFailure extends Error {
    kind = CANONICAL_EXECUTION_FAILURE_KIND;
    phase;
    reasonCode;
    retryable;
    safeEvidenceRefs;
    constructor(input) {
        super(input.message ?? "Canonical execution contract validation failed.");
        this.name = "CanonicalExecutionFailure";
        this.phase = input.phase;
        this.reasonCode = normalizeReasonCode(input.reasonCode);
        this.retryable = input.retryable;
        this.safeEvidenceRefs = normalizeSafeEvidenceRefs(input.safeEvidenceRefs);
    }
}
export function isCanonicalExecutionFailure(failure) {
    if (!failure || typeof failure !== "object")
        return false;
    const candidate = failure;
    return (candidate.kind === CANONICAL_EXECUTION_FAILURE_KIND &&
        typeof candidate.phase === "string" &&
        CANONICAL_EXECUTION_FAILURE_PHASES.includes(candidate.phase) &&
        typeof candidate.reasonCode === "string" &&
        candidate.reasonCode.length > 0 &&
        typeof candidate.retryable === "boolean" &&
        (candidate.safeEvidenceRefs === undefined ||
            (Array.isArray(candidate.safeEvidenceRefs) &&
                candidate.safeEvidenceRefs.every((reference) => typeof reference === "string"))));
}
//# sourceMappingURL=canonical-execution-failure.js.map