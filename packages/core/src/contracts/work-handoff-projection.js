import { WORK_RECORD_SCHEMA_VERSION, validateWorkHandoffPackage, } from "./work-record.js";
function projectionIssue(path, message) {
    return { path, code: "contract_validation_failed", message };
}
function uniqueStrings(values) {
    return [...new Set(values.map((value) => value?.trim()).filter((value) => Boolean(value)))];
}
function expectedOutputText(input) {
    const expected = input.command.taskScope.expectedOutputs
        .map((output) => output.description.trim() || output.outputId.trim())
        .filter(Boolean);
    return expected.length > 0 ? expected.join("\n") : input.command.taskScope.goal;
}
function completionCriteriaText(input) {
    const criteria = input.qualityCriteria ?? [];
    if (criteria.length > 0)
        return criteria.join("\n");
    const expectedCriteria = input.command.taskScope.expectedOutputs.flatMap((output) => [
        ...output.acceptance.requiredEvidenceKinds,
        ...output.acceptance.reasonCodes,
        output.acceptance.artifactRequired ? "artifact_required" : undefined,
    ]);
    const cleaned = uniqueStrings(expectedCriteria);
    return cleaned.length > 0 ? cleaned.join("\n") : "Return a concrete result that satisfies the delegated goal.";
}
function targetAgentNameFor(input) {
    return input.targetAgentName?.trim()
        || input.command.targetAgentNameSnapshot?.trim()
        || input.command.targetAgentId;
}
function defaultStepPlan(input) {
    return [{
            step_id: `${input.parentStepId}:delegate`,
            owner_agent_name: targetAgentNameFor(input),
            action_type: "delegate",
            input_refs: uniqueStrings([
                `work:${input.parentWorkId}`,
                `command:${input.command.commandRequestId}`,
                ...input.command.contextPackageIds.map((id) => `context:${id}`),
            ]),
            expected_output: expectedOutputText(input),
            completion_criteria: completionCriteriaText(input),
            status: "pending",
        }];
}
function qualityCriteriaFor(input) {
    const explicit = uniqueStrings(input.qualityCriteria ?? []);
    if (explicit.length > 0)
        return explicit;
    return uniqueStrings([
        completionCriteriaText(input),
        ...input.command.taskScope.reasonCodes,
    ]);
}
export function buildRuntimeWorkHandoffPackage(input) {
    const memoryVisibility = input.memoryVisibility?.trim();
    if (memoryVisibility && memoryVisibility !== "explicit_handoff_only") {
        return {
            ok: false,
            issues: [projectionIssue("$.memoryVisibility", "memoryVisibility must be explicit_handoff_only.")],
        };
    }
    const returnFormat = input.returnFormat?.trim();
    if (returnFormat && returnFormat !== "ChildWorkResult") {
        return {
            ok: false,
            issues: [projectionIssue("$.returnFormat", "returnFormat must be ChildWorkResult.")],
        };
    }
    const parentAgentName = input.parentAgentName.trim();
    const targetAgentName = targetAgentNameFor(input).trim();
    if (parentAgentName.length > 0 && targetAgentName.length > 0 && parentAgentName === targetAgentName) {
        return {
            ok: false,
            issues: [projectionIssue("$.targetAgentName", "targetAgentName must differ from parentAgentName.")],
        };
    }
    if (!Number.isInteger(input.retryLimit) || input.retryLimit < 0) {
        return {
            ok: false,
            issues: [projectionIssue("$.retryLimit", "retryLimit must be a non-negative integer.")],
        };
    }
    const stepPlan = input.stepPlan ?? defaultStepPlan(input);
    const currentStepId = input.currentStepId ?? stepPlan[0]?.step_id;
    const currentStep = stepPlan.find((step) => step.step_id === currentStepId);
    if (!currentStep) {
        return {
            ok: false,
            issues: [projectionIssue("$.current_step.step_id", "currentStepId must reference a step in stepPlan.")],
        };
    }
    const packageValue = {
        schemaVersion: WORK_RECORD_SCHEMA_VERSION,
        handoff_id: `handoff:${input.command.commandRequestId}`,
        work_id: `work:${input.command.subSessionId}`,
        parent_work_id: input.parentWorkId,
        parent_step_id: input.parentStepId,
        parent_agent_name: input.parentAgentName,
        target_agent_name: targetAgentNameFor(input),
        task_goal: input.command.taskScope.goal,
        user_request_summary: input.userRequestSummary,
        request_diagnosis: input.requestDiagnosis,
        step_plan: stepPlan,
        current_step: currentStep,
        context: uniqueStrings([
            ...(input.context ?? []),
            ...input.command.contextPackageIds.map((id) => `context:${id}`),
        ]),
        constraints: uniqueStrings(input.command.taskScope.constraints),
        allowed_tools: uniqueStrings(input.allowedTools ?? []),
        disallowed_actions: uniqueStrings(input.disallowedActions ?? []),
        expected_output: expectedOutputText(input),
        quality_criteria: qualityCriteriaFor(input),
        validation_method: input.validationMethod?.trim()
            || "Review the child result against expected output and quality criteria.",
        retry_limit: input.retryLimit,
        stop_condition: input.stopCondition,
        failure_recovery_policy: input.failureRecoveryPolicy?.trim()
            || "Retry only after changing input, strategy, tool, delegation target, permission, scope, or validation method.",
        deadline_or_budget: input.deadlineOrBudget?.trim() || "No explicit deadline or budget.",
        memory_visibility: "explicit_handoff_only",
        return_format: "ChildWorkResult",
    };
    return validateWorkHandoffPackage(packageValue);
}
//# sourceMappingURL=work-handoff-projection.js.map