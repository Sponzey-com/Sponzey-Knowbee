import { loadYeonjangSideEffectGoalValidationCandidate } from "./side-effect-goal-validation-adapter.js";
import { validateYeonjangSideEffectGoal, } from "./side-effect-goal-validation.js";
export async function validateRuntimeYeonjangSideEffectGoal(input) {
    const details = record(input.manualResultDetails);
    if (!details || details.kind !== "side_effect_manual_intervention") {
        return { status: "not_validated", reasonCode: "manual_result_details_invalid" };
    }
    if (details.goalValidationCandidate !== true) {
        return { status: "not_validated", reasonCode: "manual_result_not_candidate" };
    }
    const operationId = typeof details.operationId === "string" ? details.operationId.trim() : "";
    if (!operationId) {
        return { status: "not_validated", reasonCode: "manual_result_details_invalid" };
    }
    const candidate = loadYeonjangSideEffectGoalValidationCandidate({
        db: input.db,
        operationId,
        expectedRunId: input.expectedRunId,
        ...(input.expectedWorkId ? { expectedWorkId: input.expectedWorkId } : {}),
        ...(input.now ? { now: input.now } : {}),
    });
    if (candidate.status !== "ready") {
        return {
            status: "not_validated",
            reasonCode: "candidate_not_ready",
            detail: candidate.reasonCode,
        };
    }
    const validation = await validateYeonjangSideEffectGoal({
        operation: candidate.operation,
        loadReceipt: candidate.loadReceipt,
        provider: input.provider,
        ownerAgentName: input.ownerAgentName,
        toolName: input.toolName,
        methodIds: input.methodIds,
        group: input.group,
        riskLevel: input.riskLevel,
        requiresApproval: input.requiresApproval,
        targetRef: input.targetRef,
        userRequestSummary: input.userRequestSummary,
        expectedOutput: input.expectedOutput,
        publicToolOutput: input.publicToolOutput,
        sanitizedObservedStateSummary: input.sanitizedObservedStateSummary,
        risks: input.risks ?? [],
        ...(input.collectedAt != null ? { collectedAt: input.collectedAt } : {}),
    });
    return validation.status === "validated"
        ? { status: "validated", evidence: validation.evidence, publicSummary: candidate.publicSummary }
        : {
            status: "not_validated",
            reasonCode: validation.reasonCode,
            ...(validation.detail ? { detail: validation.detail } : {}),
        };
}
function record(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : null;
}
//# sourceMappingURL=side-effect-goal-validation-runtime.js.map