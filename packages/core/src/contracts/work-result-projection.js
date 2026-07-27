import { validateChildWorkResult, } from "./work-record.js";
function uniqueStrings(values) {
    return [...new Set(values.map((value) => value?.trim()).filter((value) => Boolean(value)))];
}
function renderJsonValue(value) {
    if (value === undefined)
        return undefined;
    if (typeof value === "string")
        return value;
    return JSON.stringify(value);
}
function outputSummary(report) {
    return report.outputs.map((output) => {
        const value = renderJsonValue(output.value);
        return value
            ? `${output.outputId}:${output.status}:${value}`
            : `${output.outputId}:${output.status}`;
    });
}
function evidenceSummary(report) {
    return uniqueStrings([
        ...report.evidence.map((item) => `${item.kind}:${item.sourceRef}`),
        ...report.artifacts.map((item) => item.path
            ? `${item.kind}:${item.path}`
            : `${item.kind}:${item.artifactId}`),
    ]);
}
function missingOutputIds(report) {
    return report.outputs
        .filter((output) => output.status === "missing" || output.status === "partial")
        .map((output) => output.outputId);
}
function childStatus(input) {
    if (input.resultReport.status === "failed" || input.review?.status === "failed")
        return "failed";
    if (input.resultReport.status === "needs_revision" || input.review?.status === "needs_revision")
        return "partial";
    if (input.resultDiagnosis?.sufficiency === "sufficient" && input.review?.accepted !== false)
        return "completed";
    if (input.resultDiagnosis?.sufficiency === "partial")
        return "partial";
    return "failed";
}
function defaultRecommendedNextStep(input) {
    const selectedAction = input.actionDecision?.selected_action;
    if (selectedAction === "final_report")
        return "Parent should aggregate this child result into the final response.";
    if (selectedAction === "retry" || selectedAction === "redelegate")
        return "Parent should use the result diagnosis to retry or redelegate.";
    if (selectedAction === "ask_clarification")
        return "Parent should ask the user for the missing information.";
    if (selectedAction === "stop_blocked")
        return "Parent should report the blocking reason.";
    return "Parent should review the child result before the next action.";
}
function resolveFailureDiagnosis(input) {
    if (input.projectionInput.failureDiagnosis)
        return input.projectionInput.failureDiagnosis;
    if (input.status !== "failed")
        return undefined;
    const impossibleReason = input.projectionInput.resultReport.impossibleReason
        ?? input.projectionInput.review?.impossibleReason;
    const recoveryCandidates = input.projectionInput.recoveryAttempts ?? [];
    return {
        failed_step_id: input.failedSteps[0] ?? `result-report:${input.projectionInput.resultReport.resultReportId}`,
        failure_reason: impossibleReason?.reasonCode
            ?? input.projectionInput.resultDiagnosis?.reason?.trim()
            ?? "child_result_failed",
        failed_input_refs: input.missingOutputRefs,
        failed_strategy: "child_result_projection",
        recoverable: input.projectionInput.review?.canRetry === true && recoveryCandidates.length > 0,
    };
}
export function buildRuntimeChildWorkResult(input) {
    const status = childStatus(input);
    const reportStepRef = `result-report:${input.resultReport.resultReportId}`;
    const failedSteps = uniqueStrings(input.failedStepIds?.length
        ? input.failedStepIds
        : status === "completed"
            ? []
            : [reportStepRef]);
    const missingOutputRefs = missingOutputIds(input.resultReport).map((outputId) => `output:${outputId}`);
    const missingInformation = uniqueStrings([
        ...(input.resultDiagnosis?.missing_information ?? []),
        ...(input.review?.missingItems ?? []),
        ...missingOutputRefs,
    ]);
    const risks = uniqueStrings([
        ...(input.resultDiagnosis?.risks ?? []),
        ...input.resultReport.risksOrGaps,
        ...(input.review?.risksOrGaps ?? []),
        input.resultReport.impossibleReason
            ? `${input.resultReport.impossibleReason.reasonCode}:${input.resultReport.impossibleReason.detail}`
            : undefined,
        input.review?.impossibleReason
            ? `${input.review.impossibleReason.reasonCode}:${input.review.impossibleReason.detail}`
            : undefined,
    ]);
    const requiredChanges = input.review?.requiredChanges ?? [];
    const failureDiagnosis = resolveFailureDiagnosis({
        projectionInput: input,
        status,
        failedSteps,
        missingOutputRefs,
    });
    const result = {
        schemaVersion: 1,
        work_id: `work:${input.resultReport.subSessionId}`,
        agent_name: input.agentName,
        task_goal: input.taskGoal,
        status,
        completed_steps: uniqueStrings(input.completedStepIds?.length
            ? input.completedStepIds
            : status === "completed"
                ? [reportStepRef]
                : []),
        failed_steps: failedSteps,
        summary: outputSummary(input.resultReport).join("\n") || input.resultDiagnosis?.diagnosis_summary || "Child result requires diagnosis.",
        result: outputSummary(input.resultReport).join("\n") || input.resultDiagnosis?.reason || "Child result requires diagnosis.",
        evidence: evidenceSummary(input.resultReport),
        assumptions: uniqueStrings(input.assumptions ?? []),
        risks,
        missing_information: missingInformation,
        actions_taken: uniqueStrings(input.actionsTaken?.length
            ? input.actionsTaken
            : [`reported:${input.resultReport.resultReportId}`]),
        tools_used: uniqueStrings(input.toolsUsed ?? []),
        result_diagnosis: input.resultDiagnosis,
        action_decision: input.actionDecision,
        failure_diagnosis: failureDiagnosis ?? null,
        recovery_attempts: input.recoveryAttempts ?? [],
        needs_parent_review: true,
        recommended_next_step: input.recommendedNextStep?.trim()
            || requiredChanges[0]
            || defaultRecommendedNextStep(input),
    };
    return validateChildWorkResult(result);
}
//# sourceMappingURL=work-result-projection.js.map