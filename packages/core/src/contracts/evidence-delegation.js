import { validateChildWorkResult, validateWorkHandoffPackage, validateWorkRecord, } from "./work-record.js";
function requireText(value, field) {
    const normalized = value.trim();
    if (!normalized)
        throw new Error(`${field} is required.`);
    return normalized;
}
function uniqueText(values, field) {
    const normalized = values.map((value) => requireText(value, field));
    return [...new Set(normalized)];
}
function validCost(value, field) {
    if (!Number.isFinite(value) || value < 0)
        throw new Error(`${field} must be a non-negative finite number.`);
}
function isInternalAgentName(value) {
    return /^(?:agent|team|session|sub_session):/i.test(value);
}
function rejected(input, reasonCode) {
    return { outcome: "rejected", reasonCode, benefitKinds: [], targetAgentName: input.targetAgentName.trim() };
}
export function decideEvidenceBasedDelegation(input) {
    const parentAgentName = requireText(input.parentAgentName, "Parent agent name");
    const targetAgentName = requireText(input.targetAgentName, "Target agent name");
    if (!Number.isInteger(input.availableAgentCount) || input.availableAgentCount < 0) {
        throw new Error("Available agent count must be a non-negative integer.");
    }
    validCost(input.localExecutionCost, "Local execution cost");
    validCost(input.delegationCost, "Delegation cost");
    if (isInternalAgentName(parentAgentName) || isInternalAgentName(targetAgentName))
        return rejected(input, "user_facing_name_required");
    if (parentAgentName === targetAgentName)
        return rejected(input, "self_delegation_denied");
    if (!input.targetIsDirectChild)
        return rejected(input, "target_not_direct_child");
    if (!input.targetActive)
        return rejected(input, "target_inactive");
    if (input.baseEligibility.state !== "eligible") {
        return rejected(input, uniqueText(input.baseEligibility.reasonCodes, "Eligibility reason")[0] ?? "delegation_policy_rejected");
    }
    if (uniqueText(input.targetCapabilityEvidenceRefs, "Target capability evidence").length === 0) {
        return rejected(input, "target_capability_unproven");
    }
    const benefitKinds = [];
    for (const benefit of input.benefits) {
        if (uniqueText(benefit.evidenceRefs, "Delegation benefit evidence").length === 0) {
            return rejected(input, "delegation_benefit_unproven");
        }
        if (!benefitKinds.includes(benefit.kind))
            benefitKinds.push(benefit.kind);
    }
    if (benefitKinds.length === 0) {
        return { outcome: "keep_local", reasonCode: "delegation_benefit_missing", benefitKinds: [], targetAgentName };
    }
    const justifiedCapabilityGap = input.localCapabilityUnavailable && benefitKinds.includes("specialty");
    if (input.delegationCost > input.localExecutionCost && !justifiedCapabilityGap) {
        return { outcome: "keep_local", reasonCode: "local_execution_preferred", benefitKinds, targetAgentName };
    }
    return { outcome: "delegate", reasonCode: "delegation_justified", benefitKinds, targetAgentName };
}
const EXPLICIT_CONTEXT_REFERENCE = /^(?:context|artifact|evidence|work|request):[^\s].+$/;
function requireExplicitContextRefs(values) {
    return uniqueText(values, "Explicit context reference").map((value) => {
        if (!EXPLICIT_CONTEXT_REFERENCE.test(value)) {
            throw new Error("Explicit context reference must use a typed reference prefix, not raw memory text.");
        }
        return value;
    });
}
function validationError(label, issues) {
    return new Error(`${label} validation failed: ${issues.map((issue) => `${issue.path}:${issue.message}`).join("; ")}`);
}
export function createStructuredDelegationHandoff(input) {
    if (input.decision.outcome !== "delegate")
        throw new Error("A delegate decision is required before handoff creation.");
    const parentValidation = validateWorkRecord(input.parentRecord);
    if (!parentValidation.ok)
        throw validationError("Parent work record", parentValidation.issues);
    const parent = parentValidation.value;
    const parentStepId = requireText(input.parentStepId, "Parent step ID");
    const parentStep = parent.step_plan.find((step) => step.step_id === parentStepId);
    if (!parentStep)
        throw new Error("Parent step ID must reference the parent WorkRecord step plan.");
    if (input.decision.targetAgentName === parent.owner_agent_name)
        throw new Error("Delegation target must differ from parent agent name.");
    const childWorkId = requireText(input.childWorkId, "Child work ID");
    if (childWorkId === parent.work_id)
        throw new Error("Child work ID must differ from parent work ID.");
    const targetStep = {
        ...structuredClone(parentStep),
        owner_agent_name: input.decision.targetAgentName,
        status: "pending",
    };
    const handoff = {
        schemaVersion: 1,
        handoff_id: requireText(input.handoffId, "Handoff ID"),
        work_id: childWorkId,
        parent_work_id: parent.work_id,
        parent_step_id: parentStepId,
        parent_agent_name: parent.owner_agent_name,
        target_agent_name: input.decision.targetAgentName,
        task_goal: parent.request_diagnosis.goal,
        user_request_summary: parent.user_request_summary,
        request_diagnosis: structuredClone(parent.request_diagnosis),
        step_plan: [targetStep],
        current_step: targetStep,
        context: requireExplicitContextRefs(input.explicitContextRefs),
        constraints: [...parent.request_diagnosis.constraints],
        allowed_tools: uniqueText(input.allowedTools, "Allowed tool"),
        disallowed_actions: uniqueText(input.disallowedActions, "Disallowed action"),
        expected_output: parentStep.expected_output,
        quality_criteria: [parentStep.completion_criteria],
        validation_method: requireText(input.validationMethod, "Validation method"),
        retry_limit: parent.retry_limit,
        stop_condition: requireText(parent.stop_condition ?? "", "Parent stop condition"),
        failure_recovery_policy: requireText(input.failureRecoveryPolicy, "Failure recovery policy"),
        deadline_or_budget: requireText(input.deadlineOrBudget, "Deadline or budget"),
        memory_visibility: "explicit_handoff_only",
        return_format: "ChildWorkResult",
    };
    const validation = validateWorkHandoffPackage(handoff);
    if (!validation.ok)
        throw validationError("Work handoff package", validation.issues);
    return validation.value;
}
function mergeFailure(reasonCode, path, message) {
    return { ok: false, reasonCode, issues: [{ path, message }] };
}
function childStepProjection(status) {
    if (status === "completed")
        return { stepStatus: "completed", resultStatus: "completed" };
    if (status === "partial")
        return { stepStatus: "running", resultStatus: "partial" };
    if (status === "blocked")
        return { stepStatus: "blocked", resultStatus: "blocked" };
    return { stepStatus: "failed", resultStatus: "failed" };
}
export function mergeStructuredChildResultIntoParent(input) {
    const parentValidation = validateWorkRecord(input.parentRecord);
    if (!parentValidation.ok) {
        return {
            ok: false,
            reasonCode: "invalid_parent_record",
            issues: parentValidation.issues.map((entry) => ({ path: entry.path, message: entry.message })),
        };
    }
    const handoffValidation = validateWorkHandoffPackage(input.handoff);
    if (!handoffValidation.ok) {
        return {
            ok: false,
            reasonCode: "invalid_handoff",
            issues: handoffValidation.issues.map((entry) => ({ path: entry.path, message: entry.message })),
        };
    }
    const childValidation = validateChildWorkResult(input.childResult);
    if (!childValidation.ok) {
        return {
            ok: false,
            reasonCode: "invalid_child_result",
            issues: childValidation.issues.map((entry) => ({ path: entry.path, message: entry.message })),
        };
    }
    if (!Number.isFinite(input.mergedAt) || input.mergedAt < 0) {
        return mergeFailure("invalid_merged_record", "$.mergedAt", "mergedAt must be a non-negative finite timestamp.");
    }
    const parent = parentValidation.value;
    const handoff = handoffValidation.value;
    const child = childValidation.value;
    try {
        validateStructuredDelegationRoundTrip({ parentRecord: parent, handoff, childResult: child });
    }
    catch (error) {
        return mergeFailure("linkage_mismatch", "$.childResult", error instanceof Error ? error.message : "Child result linkage validation failed.");
    }
    if (parent.step_results.some((result) => result.step_id === handoff.parent_step_id)) {
        return mergeFailure("duplicate_child_result", "$.parentRecord.step_results", "The parent step already has a result and cannot merge the child result twice.");
    }
    const projection = childStepProjection(child.status);
    const error = child.failure_diagnosis?.failure_reason
        ?? (child.status === "completed" ? undefined : child.summary);
    const { failure_diagnosis: _previousFailureDiagnosis, recovery_candidates: _previousRecoveryCandidates, selected_recovery_action: _previousSelectedRecoveryAction, ...parentBase } = structuredClone(parent);
    const merged = {
        ...parentBase,
        step_plan: parent.step_plan.map((step) => step.step_id === handoff.parent_step_id
            ? { ...structuredClone(step), status: projection.stepStatus }
            : structuredClone(step)),
        step_results: [
            ...structuredClone(parent.step_results),
            {
                step_id: handoff.parent_step_id,
                status: projection.resultStatus,
                output_ref: `result:${child.work_id}`,
                evidence_refs: [...child.evidence],
                ...(error ? { error } : {}),
                completed_at: input.mergedAt,
            },
        ],
        result_diagnosis: structuredClone(child.result_diagnosis),
        ...(child.failure_diagnosis
            ? { failure_diagnosis: structuredClone(child.failure_diagnosis) }
            : {}),
        ...(child.recovery_attempts.length > 0
            ? { recovery_candidates: structuredClone(child.recovery_attempts) }
            : {}),
        action_decision: structuredClone(child.action_decision),
    };
    const mergedValidation = validateWorkRecord(merged);
    if (!mergedValidation.ok) {
        return {
            ok: false,
            reasonCode: "invalid_merged_record",
            issues: mergedValidation.issues.map((entry) => ({ path: entry.path, message: entry.message })),
        };
    }
    return {
        ok: true,
        record: mergedValidation.value,
        parentWorkId: parent.work_id,
        childWorkId: child.work_id,
        parentStepId: handoff.parent_step_id,
        requiresParentReview: true,
    };
}
export function validateStructuredDelegationRoundTrip(input) {
    const parentValidation = validateWorkRecord(input.parentRecord);
    if (!parentValidation.ok)
        throw validationError("Parent work record", parentValidation.issues);
    const handoffValidation = validateWorkHandoffPackage(input.handoff);
    if (!handoffValidation.ok)
        throw validationError("Work handoff package", handoffValidation.issues);
    const childValidation = validateChildWorkResult(input.childResult);
    if (!childValidation.ok)
        throw validationError("Child work result", childValidation.issues);
    const parent = parentValidation.value;
    const handoff = handoffValidation.value;
    const child = childValidation.value;
    if (handoff.parent_work_id !== parent.work_id)
        throw new Error("Handoff parent work ID does not match parent WorkRecord.");
    if (handoff.parent_agent_name !== parent.owner_agent_name)
        throw new Error("Handoff parent agent name does not match parent WorkRecord.");
    const parentStep = parent.step_plan.find((step) => step.step_id === handoff.parent_step_id);
    if (!parentStep)
        throw new Error("Handoff parent step does not exist in parent WorkRecord.");
    if (child.work_id !== handoff.work_id)
        throw new Error("Child work ID does not match handoff work ID.");
    if (child.agent_name !== handoff.target_agent_name)
        throw new Error("Child agent name does not match handoff target agent name.");
    if (child.task_goal !== handoff.task_goal || child.task_goal !== parent.request_diagnosis.goal) {
        throw new Error("Child task goal does not match the parent and handoff goal.");
    }
    const handoffSteps = new Set(handoff.step_plan.map((step) => step.step_id));
    for (const stepId of [...child.completed_steps, ...child.failed_steps]) {
        if (!handoffSteps.has(stepId))
            throw new Error("Child result step does not exist in the handoff step plan.");
    }
    const evidenceRefs = uniqueText(child.evidence, "Child result evidence");
    if (evidenceRefs.length === 0)
        throw new Error("Child result requires evidence before parent review.");
    return {
        ok: true,
        parentWorkId: parent.work_id,
        childWorkId: child.work_id,
        parentStepId: parentStep.step_id,
        targetAgentName: child.agent_name,
        evidenceRefs,
    };
}
//# sourceMappingURL=evidence-delegation.js.map