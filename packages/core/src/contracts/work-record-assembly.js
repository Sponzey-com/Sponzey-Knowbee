import { WORK_RECORD_SCHEMA_VERSION, validateWorkRecord, } from "./work-record.js";
export const STRUCTURED_WORK_TEXT_LIMIT = 500;
function requireText(value, field) {
    const normalized = value?.trim() ?? "";
    if (!normalized)
        throw new Error(`${field} is required.`);
    if (normalized.length > STRUCTURED_WORK_TEXT_LIMIT) {
        throw new Error(`${field} must not exceed ${STRUCTURED_WORK_TEXT_LIMIT} characters.`);
    }
    return normalized;
}
function requireTextList(values, field) {
    const normalized = values.map((value) => requireText(value, field));
    if (new Set(normalized).size !== normalized.length)
        throw new Error(`${field} values must be unique.`);
    return normalized;
}
function assertCount(value, field) {
    if (!Number.isInteger(value) || value < 0)
        throw new Error(`${field} must be a non-negative integer.`);
}
function validateDiagnosisText(request, result) {
    requireText(request.diagnosis_summary, "Request diagnosis summary");
    requireText(request.intent, "Request diagnosis intent");
    requireText(request.goal, "Goal");
    requireText(request.risk, "Request diagnosis risk");
    requireText(request.confidence, "Request diagnosis confidence");
    requireText(request.reason, "Request diagnosis reason");
    requireTextList(request.constraints, "Request constraints");
    requireTextList(request.missing_information, "Request missing information");
    requireText(result.diagnosis_summary, "Result diagnosis summary");
    requireText(result.risk, "Result diagnosis risk");
    requireText(result.confidence, "Result diagnosis confidence");
    requireText(result.reason, "Result diagnosis reason");
    requireTextList(result.missing_information, "Result missing information");
    requireTextList(result.conflicts, "Result conflicts");
    requireTextList(result.risks, "Result risks");
}
function validateFailureBundleText(bundle) {
    requireText(bundle.failureDiagnosis.failed_step_id, "Failed step ID");
    requireText(bundle.failureDiagnosis.failure_reason, "Failure reason");
    requireTextList(bundle.failureDiagnosis.failed_input_refs, "Failed input references");
    requireText(bundle.failureDiagnosis.failed_strategy, "Failed strategy");
    for (const candidate of bundle.recoveryCandidates) {
        requireText(candidate.changed_input_or_strategy, "Recovery changed input or strategy");
        requireText(candidate.expected_benefit, "Recovery expected benefit");
        requireText(candidate.risk, "Recovery risk");
        if (candidate.required_permission !== undefined)
            requireText(candidate.required_permission, "Recovery required permission");
    }
}
function statusForStepResult(result) {
    if (result.status === "completed")
        return "completed";
    if (result.status === "failed")
        return "failed";
    if (result.status === "blocked")
        return "blocked";
    return "running";
}
function assembleSteps(plan, results) {
    if (results.length !== plan.steps.length)
        throw new Error("Work record requires one result for every planned step.");
    const planned = new Map(plan.steps.map((step) => [step.step_id, step]));
    const seen = new Set();
    for (const result of results) {
        if (!planned.has(result.step_id))
            throw new Error(`Step result references unknown planned step ${result.step_id}.`);
        if (seen.has(result.step_id))
            throw new Error("Step result references must be unique.");
        seen.add(result.step_id);
        if (result.output_ref !== undefined)
            requireText(result.output_ref, "Step output reference");
        requireTextList(result.evidence_refs, "Step evidence references");
        if (result.error !== undefined)
            requireText(result.error, "Step error summary");
    }
    return {
        steps: plan.steps.map((step) => {
            requireText(step.step_id, "Step ID");
            requireText(step.owner_agent_name, "Step owner agent name");
            requireTextList(step.input_refs, "Step input references");
            requireText(step.expected_output, "Step expected output");
            requireText(step.completion_criteria, "Step completion criteria");
            return { ...step, input_refs: [...step.input_refs], status: statusForStepResult(results.find((result) => result.step_id === step.step_id)) };
        }),
        results: results.map((result) => ({ ...result, evidence_refs: [...result.evidence_refs] })),
    };
}
function requireFailureBundle(status, action, bundle) {
    if (status !== "failed" && status !== "partial")
        return;
    if (!bundle)
        throw new Error(`Failure bundle is required for ${status} work.`);
    if (bundle.recoveryCandidates.length === 0)
        throw new Error("Failure bundle requires at least one recovery candidate.");
    if ((status === "failed" || action === "retry" || action === "redelegate") && !bundle.selectedRecoveryAction) {
        throw new Error("Selected recovery action is required for this failure bundle.");
    }
}
export function assembleCanonicalWorkRecord(input) {
    const workId = requireText(input.plan.workId, "Work ID");
    const ownerAgentName = requireText(input.plan.ownerAgentName, "Owner agent name");
    const userRequestSummary = requireText(input.userRequestSummary, "User request summary");
    const terminationCondition = requireText(input.terminationCondition, "Termination condition");
    validateDiagnosisText(input.requestDiagnosis, input.resultDiagnosis);
    requireText(input.actionDecision.reason, "Action reason");
    if (input.plan.requestAction !== input.requestDiagnosis.recommended_action) {
        throw new Error("Lifecycle plan action must match request diagnosis action.");
    }
    if (input.actionDecision.selected_action !== input.resultDiagnosis.recommended_action) {
        throw new Error("Action decision must match result diagnosis action.");
    }
    assertCount(input.retryCount, "retry_count");
    assertCount(input.retryLimit, "retry_limit");
    requireFailureBundle(input.status, input.actionDecision.selected_action, input.failureBundle);
    if (input.failureBundle)
        validateFailureBundleText(input.failureBundle);
    const assembled = assembleSteps(input.plan, input.stepResults);
    const candidate = {
        schemaVersion: WORK_RECORD_SCHEMA_VERSION,
        work_id: workId,
        ...(input.parentWorkId !== undefined ? { parent_work_id: requireText(input.parentWorkId, "Parent work ID") } : {}),
        owner_agent_name: ownerAgentName,
        source: input.source,
        status: input.status,
        user_request_summary: userRequestSummary,
        request_diagnosis: structuredClone(input.requestDiagnosis),
        step_plan: assembled.steps,
        step_results: assembled.results,
        result_diagnosis: structuredClone(input.resultDiagnosis),
        ...(input.failureBundle
            ? {
                failure_diagnosis: structuredClone(input.failureBundle.failureDiagnosis),
                recovery_candidates: structuredClone(input.failureBundle.recoveryCandidates),
                ...(input.failureBundle.selectedRecoveryAction
                    ? { selected_recovery_action: structuredClone(input.failureBundle.selectedRecoveryAction) }
                    : {}),
            }
            : {}),
        ...(input.unblockEvidence !== undefined
            ? { unblock_evidence: requireTextList(input.unblockEvidence, "Unblock evidence") }
            : {}),
        retry_count: input.retryCount,
        retry_limit: input.retryLimit,
        stop_condition: terminationCondition,
        action_decision: structuredClone(input.actionDecision),
    };
    const validation = validateWorkRecord(candidate);
    if (!validation.ok) {
        const summary = validation.issues.map((issue) => `${issue.path}:${issue.message}`).join("; ");
        throw new Error(`Canonical work record validation failed: ${summary}`);
    }
    return validation.value;
}
//# sourceMappingURL=work-record-assembly.js.map