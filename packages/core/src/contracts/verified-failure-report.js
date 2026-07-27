function required(value, field) {
    const normalized = value?.trim() ?? "";
    if (!normalized)
        throw new Error(`${field} is required.`);
    return normalized;
}
function unique(values, field) {
    const normalized = values.map((value) => required(value, field));
    if (new Set(normalized).size !== normalized.length)
        throw new Error(`${field} values must be unique.`);
    return normalized;
}
function sameValues(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}
export function buildVerifiedFailureReportFacts(input) {
    const { decision, exhaustion } = input;
    if (decision.receiptId !== exhaustion.receiptId) {
        throw new Error("Failure recovery and solution-path exhaustion must use the same diagnosis receipt.");
    }
    if (decision.outcome !== "blocked" && decision.outcome !== "partial") {
        throw new Error("Verified failure reporting requires a blocked or partial recovery decision.");
    }
    const outcome = decision.outcome;
    if (outcome === "blocked" && (decision.state !== "stopped" || exhaustion.nextAction !== "stop_blocked" || !exhaustion.canFinalizeFailure)) {
        throw new Error("Blocked failure reporting requires a terminal exhausted decision.");
    }
    if (outcome === "partial" && (decision.state !== "report_ready" || exhaustion.nextAction !== "partial_report")) {
        throw new Error("Partial failure reporting requires a partial-report exhaustion decision.");
    }
    const failedScope = unique(decision.unresolvedScope, "Failed scope");
    const evidenceRefs = unique(decision.evidenceRefs, "Verified failure evidence");
    const partialResultRefs = unique(decision.partialResultRefs, "Partial result reference");
    if (failedScope.length === 0)
        throw new Error("Failure report requires at least one failed scope.");
    if (evidenceRefs.length === 0)
        throw new Error("Failure report requires verified failure evidence.");
    if (!sameValues(partialResultRefs, exhaustion.partialResultRefs)) {
        throw new Error("Failure report must preserve every exhausted partial result reference.");
    }
    const nextActions = unique([...decision.userActions, ...exhaustion.workaroundGuidance], "Failure report next action");
    if (nextActions.length === 0)
        throw new Error("Failure report requires at least one verified next action.");
    return {
        schemaVersion: 1,
        outcome,
        primaryLanguage: input.primaryLanguage,
        failedScope,
        verifiedReason: {
            reasonCode: required(decision.stopCondition ?? outcome, "Failure reason code"),
            text: required(decision.reason ?? "Partial completion has unresolved scope.", "Verified failure reason"),
            evidenceRefs,
        },
        nextActions,
        partialResultRefs,
        diagnosisReceiptId: required(decision.receiptId, "Diagnosis receipt ID"),
    };
}
//# sourceMappingURL=verified-failure-report.js.map