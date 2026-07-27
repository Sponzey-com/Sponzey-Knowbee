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
export class CanonicalExecutionFailure extends Error {
    kind = CANONICAL_EXECUTION_FAILURE_KIND;
    phase;
    reasonCode;
    retryable;
    constructor(input) {
        super(input.message ?? "Canonical execution contract validation failed.");
        this.name = "CanonicalExecutionFailure";
        this.phase = input.phase;
        this.reasonCode = normalizeReasonCode(input.reasonCode);
        this.retryable = input.retryable;
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
        typeof candidate.retryable === "boolean");
}
//# sourceMappingURL=canonical-execution-failure.js.map