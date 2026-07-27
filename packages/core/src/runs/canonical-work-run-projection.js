export function projectCanonicalWorkStateToRunStatus(input) {
    let runStatus;
    switch (input.state) {
        case "REQUEST_RECEIVED":
            runStatus = "queued";
            break;
        case "SOLUTION_ANALYZED":
        case "POLICY_VALIDATED":
        case "EXECUTING":
        case "RESULT_REVIEW":
        case "SUCCEEDED":
        case "PARTIALLY_SUCCEEDED":
        case "BLOCKED":
        case "EXHAUSTED":
            runStatus = "running";
            break;
        case "USER_INPUT_REQUIRED":
            if (!input.waitingKind) {
                return { ok: false, canonicalState: input.state, reasonCode: "waiting_kind_required" };
            }
            runStatus = input.waitingKind === "approval" ? "awaiting_approval" : "awaiting_user";
            break;
        case "CANCELLED":
            runStatus = "cancelled";
            break;
        case "USER_REPORT":
            if (!input.finalOutcome) {
                return { ok: false, canonicalState: input.state, reasonCode: "final_report_outcome_required" };
            }
            runStatus = input.finalOutcome === "succeeded" || input.finalOutcome === "partial"
                ? "completed"
                : input.finalOutcome === "cancelled"
                    ? "cancelled"
                    : "failed";
            break;
    }
    return {
        ok: true,
        projection: {
            canonicalState: input.state,
            runStatus,
            lossy: true,
        },
    };
}
//# sourceMappingURL=canonical-work-run-projection.js.map