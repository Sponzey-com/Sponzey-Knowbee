export const IMPROVEMENT_VALIDATION_EVIDENCE_KINDS = [
    "deterministic_test",
    "static_validation",
    "contract_regression",
    "live_model",
];
export const INDEPENDENT_IMPROVEMENT_VALIDATION_KINDS = [
    "deterministic_test",
    "static_validation",
    "contract_regression",
];
export function authorizeImprovementValidation(input) {
    const proposalFingerprint = input.proposalFingerprint.trim();
    if (!proposalFingerprint || input.evidence.length === 0 || !Number.isSafeInteger(input.now) || input.now < 0) {
        return { status: "blocked", reasonCode: "validation_evidence_invalid" };
    }
    const refs = new Set();
    const independentKinds = new Set();
    for (const receipt of input.evidence) {
        const evidenceRef = receipt.evidenceRef.trim();
        if (receipt.proposalFingerprint !== proposalFingerprint
            || !IMPROVEMENT_VALIDATION_EVIDENCE_KINDS.includes(receipt.kind)
            || !receipt.validatorId.trim() || !evidenceRef || refs.has(evidenceRef)
            || !Number.isSafeInteger(receipt.validatedAt) || receipt.validatedAt < 0 || receipt.validatedAt > input.now) {
            return { status: "blocked", reasonCode: "validation_evidence_invalid" };
        }
        refs.add(evidenceRef);
        if (receipt.status !== "passed")
            return { status: "blocked", reasonCode: "validation_failed" };
        if (INDEPENDENT_IMPROVEMENT_VALIDATION_KINDS.includes(receipt.kind)) {
            independentKinds.add(receipt.kind);
        }
    }
    if (independentKinds.size === 0)
        return { status: "blocked", reasonCode: "independent_validation_missing" };
    return { status: "authorized", proposalFingerprint, independentKinds: [...independentKinds], evidenceRefs: [...refs] };
}
export async function activateValidatedImprovement(input) {
    if (input.decision.status !== "authorized")
        return input.decision;
    return { status: "activated", result: await input.activate(input.decision) };
}
//# sourceMappingURL=improvement-validation-evidence.js.map