export function checkFinalFailureExhaustion(input) {
    const unmetSuccessCriteriaIds = unmetSuccessCriteriaIdsForOutputs(input.workOrder, input.outputs);
    const successCriteriaStillNotMet = unmetSuccessCriteriaIds.length > 0;
    const complete = input.recoveryReview.blockingUntriedOptions.length === 0
        && input.solutionPathAssessment.complete;
    const canFinalizeFailure = complete
        && successCriteriaStillNotMet
        && input.solutionPathAssessment.canFinalizeFailure;
    return {
        exhaustionSummary: {
            selfExecutionAttempted: input.recoveryReview.attempted.self_execution,
            childDelegationAttempted: input.recoveryReview.attempted.child_delegation,
            toolExecutionAttempted: input.recoveryReview.attempted.tool_execution,
            retryAttempted: input.recoveryReview.attempted.retry,
            fallbackAttempted: input.recoveryReview.attempted.fallback,
            partialSuccessChecked: input.recoveryReview.attempted.partial_success_review,
            parentRecoveryPossibleChecked: input.recoveryReview.attempted.parent_recovery,
            successCriteriaStillNotMet,
            complete,
        },
        complete,
        canFinalizeFailure,
        successCriteriaStillNotMet,
        unmetSuccessCriteriaIds,
        untriedOptions: [...input.recoveryReview.untriedOptions],
        blockingUntriedOptions: [...input.recoveryReview.blockingUntriedOptions],
        solutionPathAssessment: structuredClone(input.solutionPathAssessment),
        reasonCodes: [
            canFinalizeFailure ? "final_failure_guard_passed" : "final_failure_guard_blocked",
            complete ? "exhaustion_complete" : "exhaustion_incomplete",
            successCriteriaStillNotMet ? "success_criteria_not_met" : "success_criteria_met",
            input.solutionPathAssessment.canFinalizeFailure ? "solution_paths_exhausted" : "solution_path_still_available",
            ...input.solutionPathAssessment.missingPaths.map((path) => `solution_path_unreviewed:${path}`),
            ...input.recoveryReview.reasonCodes,
        ],
    };
}
function unmetSuccessCriteriaIdsForOutputs(workOrder, outputs) {
    const outputsById = new Map(outputs.map((output) => [output.outputId, output]));
    return workOrder.successCriteria
        .filter((criterion) => criterion.required)
        .filter((criterion) => outputsById.get(criterion.criterionId)?.status !== "satisfied")
        .map((criterion) => criterion.criterionId);
}
//# sourceMappingURL=exhaustion-checker.js.map