function present(value) {
    return value.trim().length > 0;
}
function uniqueNonEmpty(values) {
    const normalized = values.map((value) => value.trim());
    if (normalized.length === 0 || normalized.some((value) => !value) || new Set(normalized).size !== normalized.length) {
        return null;
    }
    return normalized;
}
export function authorizePromptRollbackReport(input) {
    const restoration = input.restoration;
    if (!present(restoration.sourceRef)
        || !present(restoration.restoredVersion)
        || !present(restoration.restoredChecksum)
        || !present(restoration.triggerEvidenceRef)
        || !present(restoration.readinessEvidenceRef)
        || !present(restoration.executionRef)
        || !present(restoration.verificationRef)) {
        return { status: "blocked", reasonCode: "rollback_restoration_invalid" };
    }
    const rolledBackFiles = uniqueNonEmpty(input.rolledBackFiles);
    if (!rolledBackFiles)
        return { status: "blocked", reasonCode: "rolled_back_files_missing" };
    if (!present(input.reason))
        return { status: "blocked", reasonCode: "rollback_reason_missing" };
    if (input.activationStateAfterRollback !== "rolled_back") {
        return { status: "blocked", reasonCode: "activation_state_invalid" };
    }
    if (!present(input.remainingRisk))
        return { status: "blocked", reasonCode: "remaining_risk_missing" };
    if (!present(input.nextRecommendedAction))
        return { status: "blocked", reasonCode: "next_action_missing" };
    if (!rolledBackFiles.includes(restoration.sourceRef)) {
        return { status: "blocked", reasonCode: "rollback_report_lineage_mismatch" };
    }
    return {
        status: "authorized",
        rolledBackFiles,
        reason: input.reason.trim(),
        restoredChecksum: restoration.restoredChecksum,
        activationStateAfterRollback: "rolled_back",
        remainingRisk: input.remainingRisk.trim(),
        nextRecommendedAction: input.nextRecommendedAction.trim(),
        evidenceRefs: [
            restoration.triggerEvidenceRef,
            restoration.readinessEvidenceRef,
            restoration.executionRef,
            restoration.verificationRef,
        ],
    };
}
export async function publishAuthorizedPromptRollbackReport(input) {
    if (input.decision.status !== "authorized")
        return input.decision;
    return { status: "reported", text: await input.renderWithLlm(input.decision) };
}
//# sourceMappingURL=prompt-rollback-report.js.map