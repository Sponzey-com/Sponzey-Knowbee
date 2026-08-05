export async function applySafetyRiskDecision(input) {
    if (input.decision.status === "continue")
        return { status: "executed", result: await input.execute() };
    if (input.decision.status === "blocked_pending_input") {
        await input.requestMitigationOrApproval(input.decision.requiredActions);
        return { status: "blocked_pending_input", requiredActions: input.decision.requiredActions };
    }
    await input.stopRun({ reasonCode: "safety_risk", evidenceRefs: input.decision.evidenceRefs });
    return { status: "stopped", reasonCode: "safety_risk", evidenceRefs: input.decision.evidenceRefs };
}
//# sourceMappingURL=safety-risk-application.js.map