import { ENTERPRISE_TOPOLOGY_SCHEMA_VERSION, } from "../contracts/enterprise-topology.js";
export function generateFailureReport(input) {
    return {
        schemaVersion: ENTERPRISE_TOPOLOGY_SCHEMA_VERSION,
        failureReportId: input.failureReportId ?? `failure:${input.workOrder.workOrderId}`,
        topologyRunId: input.workOrder.topologyRunId,
        nodeRunId: input.nodeRunId,
        workOrderId: input.workOrder.workOrderId,
        nodeId: input.nodeContractSnapshot.id,
        exhaustionSummary: input.exhaustion.exhaustionSummary,
        attempts: input.recoveryReview.attempts.map((attempt) => ({ ...attempt })),
        untriedOptions: [...input.exhaustion.untriedOptions],
        ...(input.partialResult !== undefined ? { partialResult: structuredClone(input.partialResult) } : {}),
        recommendedAction: input.recommendedAction ?? recommendedActionForFailure(input),
        createdAt: input.createdAt ?? Date.now(),
    };
}
function recommendedActionForFailure(input) {
    if (input.exhaustion.blockingUntriedOptions.length > 0) {
        return `Review untried recovery options before declaring final failure: ${input.exhaustion.blockingUntriedOptions.join(", ")}.`;
    }
    if (input.exhaustion.unmetSuccessCriteriaIds.length > 0) {
        return `Escalate with unmet success criteria: ${input.exhaustion.unmetSuccessCriteriaIds.join(", ")}.`;
    }
    if (input.risksOrGaps.length > 0) {
        return `Review unresolved runtime risks: ${input.risksOrGaps.slice(0, 3).join(", ")}.`;
    }
    return "Escalate to the accountable owner with the failure report and runtime trace.";
}
//# sourceMappingURL=failure-report.js.map