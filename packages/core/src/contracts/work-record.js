export const WORK_RECORD_SCHEMA_VERSION = 1;
const WORK_RECORD_FIELDS = new Set([
    "schemaVersion",
    "work_id",
    "parent_work_id",
    "owner_agent_name",
    "source",
    "status",
    "user_request_summary",
    "request_diagnosis",
    "step_plan",
    "step_results",
    "result_diagnosis",
    "failure_diagnosis",
    "recovery_candidates",
    "selected_recovery_action",
    "active_blocker",
    "blocker_resolution",
    "unblock_evidence",
    "retry_count",
    "retry_limit",
    "stop_condition",
    "action_decision",
]);
const WORK_HANDOFF_PACKAGE_FIELDS = new Set([
    "schemaVersion",
    "handoff_id",
    "work_id",
    "parent_work_id",
    "parent_step_id",
    "parent_agent_name",
    "target_agent_name",
    "task_goal",
    "user_request_summary",
    "request_diagnosis",
    "step_plan",
    "current_step",
    "context",
    "constraints",
    "allowed_tools",
    "disallowed_actions",
    "expected_output",
    "quality_criteria",
    "validation_method",
    "retry_limit",
    "stop_condition",
    "failure_recovery_policy",
    "deadline_or_budget",
    "memory_visibility",
    "return_format",
]);
const CHILD_WORK_RESULT_FIELDS = new Set([
    "schemaVersion",
    "work_id",
    "agent_name",
    "task_goal",
    "status",
    "completed_steps",
    "failed_steps",
    "summary",
    "result",
    "evidence",
    "assumptions",
    "risks",
    "missing_information",
    "actions_taken",
    "tools_used",
    "result_diagnosis",
    "action_decision",
    "failure_diagnosis",
    "recovery_attempts",
    "needs_parent_review",
    "recommended_next_step",
]);
const WORK_RECORD_SOURCES = new Set(["user", "parent_agent", "system", "scheduled"]);
const WORK_RECORD_STATUSES = new Set(["intake", "planned", "running", "waiting", "completed", "partial", "blocked", "failed", "cancelled"]);
const RECOMMENDED_ACTIONS = new Set([
    "direct_answer",
    "ask_clarification",
    "plan",
    "delegate",
    "use_tool",
    "use_yeonjang",
    "retry",
    "redelegate",
    "partial_report",
    "final_report",
    "stop_blocked",
]);
const STEP_ACTION_TYPES = new Set(["direct_answer", "plan", "delegate", "use_tool", "use_yeonjang", "ask_clarification", "validate", "report"]);
const STEP_STATUSES = new Set(["pending", "running", "completed", "blocked", "failed", "skipped"]);
const STEP_RESULT_STATUSES = new Set(["completed", "partial", "blocked", "failed"]);
const RESULT_SUFFICIENCIES = new Set(["sufficient", "partial", "insufficient", "unknown"]);
const RECOVERY_CHANGED_DIMENSIONS = new Set(["input", "strategy", "tool", "delegation_target", "permission", "scope", "validation_method"]);
const WORK_BLOCKER_KINDS = new Set(["missing_information", "permission", "resource", "safety"]);
const CHILD_WORK_RESULT_STATUSES = new Set(["completed", "partial", "blocked", "failed"]);
const WORK_HANDOFF_MEMORY_VISIBILITIES = new Set(["explicit_handoff_only"]);
const WORK_HANDOFF_RETURN_FORMATS = new Set(["ChildWorkResult"]);
export const WORK_HANDOFF_TEXT_LIMITS = Object.freeze({
    scalarCharacters: 2_048,
    arrayItemCharacters: 1_024,
    arrayItems: 32,
    arrayAggregateCharacters: 8_192,
});
export const STRUCTURED_INTERNAL_TEXT_LIMITS = Object.freeze({
    scalarCharacters: 500,
    arrayItemCharacters: 500,
    arrayItems: 32,
    arrayAggregateCharacters: 4_096,
});
const NON_EXECUTABLE_HANDOFF_TEXT = new Set(["tbd", "todo", "n/a", "unknown", "as needed"]);
const INTERNAL_AGENT_NAME_PREFIXES = ["agent:", "team:", "session:", "sub_session:"];
const BLOCKED_ACTIONS = new Set(["ask_clarification", "stop_blocked"]);
const RECOVERY_CHANGED_DIMENSION_TERMS = [
    "input",
    "strategy",
    "tool",
    "delegation target",
    "delegation",
    "target",
    "permission",
    "scope",
    "validation method",
    "validation",
];
export const WORK_RECORD_STATUS_TRANSITIONS = Object.freeze({
    intake: Object.freeze(["planned", "blocked"]),
    planned: Object.freeze(["running", "waiting", "cancelled"]),
    running: Object.freeze(["waiting", "completed", "partial", "failed", "blocked"]),
    waiting: Object.freeze(["running", "cancelled"]),
    completed: Object.freeze([]),
    partial: Object.freeze(["planned", "completed"]),
    failed: Object.freeze(["planned", "blocked"]),
    blocked: Object.freeze(["planned", "cancelled"]),
    cancelled: Object.freeze([]),
});
export function isDeclaredWorkRecordStatusTransition(fromStatus, toStatus) {
    return WORK_RECORD_STATUS_TRANSITIONS[fromStatus].includes(toStatus);
}
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function issue(path, message) {
    return { path, code: "contract_validation_failed", message };
}
function handoffIssue(path, code, message) {
    return { path, code, message };
}
function structuredTextIssue(path, code, message) {
    return { path, code, message };
}
function validateStructuredTextScalar(value, path, issues) {
    if (typeof value !== "string")
        return;
    if (value.length > STRUCTURED_INTERNAL_TEXT_LIMITS.scalarCharacters) {
        issues.push(structuredTextIssue(path, "structured_text_limit_exceeded", `Structured text exceeds ${STRUCTURED_INTERNAL_TEXT_LIMITS.scalarCharacters} characters.`));
    }
}
function validateStructuredTextArray(value, path, issues) {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
        return;
    if (value.length > STRUCTURED_INTERNAL_TEXT_LIMITS.arrayItems) {
        issues.push(structuredTextIssue(path, "structured_text_aggregate_exceeded", `Structured text array exceeds ${STRUCTURED_INTERNAL_TEXT_LIMITS.arrayItems} items.`));
    }
    let aggregate = 0;
    value.forEach((item, index) => {
        aggregate += item.length;
        if (item.length > STRUCTURED_INTERNAL_TEXT_LIMITS.arrayItemCharacters) {
            issues.push(structuredTextIssue(`${path}[${index}]`, "structured_text_limit_exceeded", `Structured text item exceeds ${STRUCTURED_INTERNAL_TEXT_LIMITS.arrayItemCharacters} characters.`));
        }
    });
    if (aggregate > STRUCTURED_INTERNAL_TEXT_LIMITS.arrayAggregateCharacters) {
        issues.push(structuredTextIssue(path, "structured_text_aggregate_exceeded", `Structured text array exceeds ${STRUCTURED_INTERNAL_TEXT_LIMITS.arrayAggregateCharacters} aggregate characters.`));
    }
}
function validateDiagnosisTextBounds(value, path, issues) {
    if (!isRecord(value))
        return;
    for (const field of ["diagnosis_summary", "intent", "goal", "risk", "confidence", "reason"]) {
        validateStructuredTextScalar(value[field], `${path}.${field}`, issues);
    }
    for (const field of ["constraints", "missing_information", "conflicts", "risks"]) {
        validateStructuredTextArray(value[field], `${path}.${field}`, issues);
    }
}
function validateRecoveryTextBounds(value, path, issues) {
    if (!isRecord(value))
        return;
    for (const field of ["changed_input_or_strategy", "expected_benefit", "risk", "required_permission"]) {
        validateStructuredTextScalar(value[field], `${path}.${field}`, issues);
    }
}
function validateWorkRecordTextBounds(value, issues) {
    validateStructuredTextScalar(value.user_request_summary, "$.user_request_summary", issues);
    validateStructuredTextScalar(value.stop_condition, "$.stop_condition", issues);
    validateDiagnosisTextBounds(value.request_diagnosis, "$.request_diagnosis", issues);
    validateDiagnosisTextBounds(value.result_diagnosis, "$.result_diagnosis", issues);
    if (Array.isArray(value.step_plan))
        value.step_plan.forEach((step, index) => {
            if (!isRecord(step))
                return;
            validateStructuredTextScalar(step.expected_output, `$.step_plan[${index}].expected_output`, issues);
            validateStructuredTextScalar(step.completion_criteria, `$.step_plan[${index}].completion_criteria`, issues);
        });
    if (Array.isArray(value.step_results))
        value.step_results.forEach((result, index) => {
            if (!isRecord(result))
                return;
            validateStructuredTextScalar(result.error, `$.step_results[${index}].error`, issues);
        });
    if (isRecord(value.failure_diagnosis)) {
        validateStructuredTextScalar(value.failure_diagnosis.failure_reason, "$.failure_diagnosis.failure_reason", issues);
        validateStructuredTextScalar(value.failure_diagnosis.failed_strategy, "$.failure_diagnosis.failed_strategy", issues);
    }
    if (Array.isArray(value.recovery_candidates))
        value.recovery_candidates.forEach((candidate, index) => {
            validateRecoveryTextBounds(candidate, `$.recovery_candidates[${index}]`, issues);
        });
    validateRecoveryTextBounds(value.selected_recovery_action, "$.selected_recovery_action", issues);
    if (isRecord(value.active_blocker)) {
        validateStructuredTextScalar(value.active_blocker.blocker_ref, "$.active_blocker.blocker_ref", issues);
        validateStructuredTextArray(value.active_blocker.evidence_refs, "$.active_blocker.evidence_refs", issues);
    }
    if (isRecord(value.blocker_resolution)) {
        validateStructuredTextScalar(value.blocker_resolution.blocker_ref, "$.blocker_resolution.blocker_ref", issues);
        validateStructuredTextArray(value.blocker_resolution.resolution_evidence_refs, "$.blocker_resolution.resolution_evidence_refs", issues);
    }
    if (isRecord(value.action_decision)) {
        validateStructuredTextScalar(value.action_decision.reason, "$.action_decision.reason", issues);
    }
    validateStructuredTextArray(value.unblock_evidence, "$.unblock_evidence", issues);
}
function validateChildWorkResultTextBounds(value, issues) {
    for (const field of ["task_goal", "summary", "result", "recommended_next_step"]) {
        validateStructuredTextScalar(value[field], `$.${field}`, issues);
    }
    for (const field of ["evidence", "assumptions", "risks", "missing_information", "actions_taken"]) {
        validateStructuredTextArray(value[field], `$.${field}`, issues);
    }
    validateDiagnosisTextBounds(value.result_diagnosis, "$.result_diagnosis", issues);
    if (isRecord(value.action_decision)) {
        validateStructuredTextScalar(value.action_decision.reason, "$.action_decision.reason", issues);
    }
    if (isRecord(value.failure_diagnosis)) {
        validateStructuredTextScalar(value.failure_diagnosis.failure_reason, "$.failure_diagnosis.failure_reason", issues);
        validateStructuredTextScalar(value.failure_diagnosis.failed_strategy, "$.failure_diagnosis.failed_strategy", issues);
    }
    if (Array.isArray(value.recovery_attempts))
        value.recovery_attempts.forEach((candidate, index) => {
            validateRecoveryTextBounds(candidate, `$.recovery_attempts[${index}]`, issues);
        });
}
function validateHandoffScalarText(value, path, executable, issues) {
    if (typeof value !== "string")
        return;
    const normalized = value.trim();
    if (normalized.length > WORK_HANDOFF_TEXT_LIMITS.scalarCharacters) {
        issues.push(handoffIssue(path, "handoff_text_limit_exceeded", `Handoff text exceeds ${WORK_HANDOFF_TEXT_LIMITS.scalarCharacters} characters.`));
    }
    if (executable && NON_EXECUTABLE_HANDOFF_TEXT.has(normalized.toLowerCase())) {
        issues.push(handoffIssue(path, "handoff_text_not_executable", "Handoff execution text must be specific, not a placeholder."));
    }
}
function validateHandoffTextArray(value, path, executable, issues) {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
        return;
    if (value.length > WORK_HANDOFF_TEXT_LIMITS.arrayItems) {
        issues.push(handoffIssue(path, "handoff_array_limit_exceeded", `Handoff array exceeds ${WORK_HANDOFF_TEXT_LIMITS.arrayItems} items.`));
    }
    let aggregate = 0;
    value.forEach((item, index) => {
        aggregate += item.length;
        if (item.length > WORK_HANDOFF_TEXT_LIMITS.arrayItemCharacters) {
            issues.push(handoffIssue(`${path}[${index}]`, "handoff_text_limit_exceeded", `Handoff array item exceeds ${WORK_HANDOFF_TEXT_LIMITS.arrayItemCharacters} characters.`));
        }
        if (executable && NON_EXECUTABLE_HANDOFF_TEXT.has(item.trim().toLowerCase())) {
            issues.push(handoffIssue(`${path}[${index}]`, "handoff_text_not_executable", "Handoff execution text must be specific, not a placeholder."));
        }
    });
    if (aggregate > WORK_HANDOFF_TEXT_LIMITS.arrayAggregateCharacters) {
        issues.push(handoffIssue(path, "handoff_array_limit_exceeded", `Handoff array text exceeds ${WORK_HANDOFF_TEXT_LIMITS.arrayAggregateCharacters} aggregate characters.`));
    }
}
function validateHandoffTextBounds(value, issues) {
    validateHandoffScalarText(value.task_goal, "$.task_goal", true, issues);
    validateHandoffScalarText(value.user_request_summary, "$.user_request_summary", false, issues);
    validateHandoffScalarText(value.expected_output, "$.expected_output", true, issues);
    validateHandoffScalarText(value.validation_method, "$.validation_method", true, issues);
    validateHandoffScalarText(value.failure_recovery_policy, "$.failure_recovery_policy", true, issues);
    validateHandoffScalarText(value.deadline_or_budget, "$.deadline_or_budget", true, issues);
    validateHandoffTextArray(value.context, "$.context", false, issues);
    validateHandoffTextArray(value.constraints, "$.constraints", true, issues);
    validateHandoffTextArray(value.quality_criteria, "$.quality_criteria", true, issues);
    if (isRecord(value.request_diagnosis)) {
        validateHandoffScalarText(value.request_diagnosis.diagnosis_summary, "$.request_diagnosis.diagnosis_summary", false, issues);
        validateHandoffScalarText(value.request_diagnosis.goal, "$.request_diagnosis.goal", true, issues);
        validateHandoffScalarText(value.request_diagnosis.reason, "$.request_diagnosis.reason", true, issues);
        validateHandoffTextArray(value.request_diagnosis.constraints, "$.request_diagnosis.constraints", true, issues);
    }
    if (Array.isArray(value.step_plan))
        value.step_plan.forEach((step, index) => {
            if (!isRecord(step))
                return;
            validateHandoffScalarText(step.expected_output, `$.step_plan[${index}].expected_output`, true, issues);
            validateHandoffScalarText(step.completion_criteria, `$.step_plan[${index}].completion_criteria`, true, issues);
            validateHandoffTextArray(step.input_refs, `$.step_plan[${index}].input_refs`, false, issues);
        });
}
function validateRequiredString(value, path, issues) {
    if (typeof value === "string" && value.trim().length > 0)
        return;
    issues.push(issue(path, `Expected non-empty string at ${path}.`));
}
function looksLikeInternalAgentIdentifier(value) {
    if (typeof value !== "string")
        return false;
    const normalized = value.trim().toLowerCase();
    return INTERNAL_AGENT_NAME_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}
function validateUserFacingAgentName(value, path, message, issues) {
    if (!looksLikeInternalAgentIdentifier(value))
        return;
    issues.push(issue(path, message));
}
function validateOptionalNonEmptyString(value, path, message, issues) {
    if (value === undefined)
        return;
    if (typeof value === "string" && value.trim().length > 0)
        return;
    issues.push(issue(path, message));
}
function validateNumber(value, path, issues) {
    if (typeof value === "number" && Number.isFinite(value))
        return;
    issues.push(issue(path, `Expected number at ${path}.`));
}
function validateNonNegativeInteger(value, path, message, issues) {
    if (Number.isInteger(value) && typeof value === "number" && value >= 0)
        return;
    issues.push(issue(path, message));
}
function validateBoolean(value, path, issues) {
    if (typeof value === "boolean")
        return;
    issues.push(issue(path, `Expected boolean at ${path}.`));
}
function validateStringArray(value, path, issues) {
    if (Array.isArray(value) && value.every((item) => typeof item === "string"))
        return;
    issues.push(issue(path, `Expected string array at ${path}.`));
}
function validateNonEmptyStringArray(value, path, message, issues) {
    validateStringArray(value, path, issues);
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
        return;
    if (value.some((item) => item.trim().length > 0))
        return;
    issues.push(issue(path, message));
}
function validateOptionalStringArray(value, path, issues) {
    if (value === undefined)
        return;
    validateStringArray(value, path, issues);
}
function isPlainJsonObject(value) {
    if (!isRecord(value))
        return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
function validateMetadataObjectEntries(value, path, issues) {
    Object.entries(value).forEach(([key, item]) => {
        if (key.trim().length === 0) {
            issues.push(issue(path, "metadata keys must be non-empty when present."));
            return;
        }
        validateMetadataJsonValue(item, `${path}.${key}`, issues);
    });
}
function validateMetadataJsonValue(value, path, issues) {
    if (value === undefined) {
        issues.push(issue(path, "metadata values must be JSON values without undefined."));
        return;
    }
    if (value === null)
        return;
    if (typeof value === "string" || typeof value === "boolean")
        return;
    if (typeof value === "number" && Number.isFinite(value))
        return;
    if (Array.isArray(value)) {
        value.forEach((item, index) => validateMetadataJsonValue(item, `${path}[${index}]`, issues));
        return;
    }
    if (isPlainJsonObject(value)) {
        validateMetadataObjectEntries(value, path, issues);
        return;
    }
    issues.push(issue(path, "metadata values must be JSON values without undefined."));
}
function validateRecoveryCandidateMetadata(value, path, issues) {
    if (value === undefined)
        return;
    if (!isPlainJsonObject(value)) {
        issues.push(issue(path, "metadata must be a JSON object when present."));
        return;
    }
    validateMetadataObjectEntries(value, path, issues);
}
function validateEnum(value, allowed, path, issues) {
    if (typeof value === "string" && allowed.has(value))
        return;
    issues.push(issue(path, `Unsupported enum value at ${path}.`));
}
function validateRequestDiagnosis(value, path, issues) {
    if (!isRecord(value)) {
        issues.push(issue(path, `Expected object at ${path}.`));
        return;
    }
    validateRequiredString(value.diagnosis_summary, `${path}.diagnosis_summary`, issues);
    validateRequiredString(value.intent, `${path}.intent`, issues);
    validateRequiredString(value.goal, `${path}.goal`, issues);
    validateStringArray(value.constraints, `${path}.constraints`, issues);
    validateStringArray(value.missing_information, `${path}.missing_information`, issues);
    validateNonEmptyStringArrayItems(value.constraints, `${path}.constraints`, "request_diagnosis.constraints items must be non-empty.", issues);
    validateNonEmptyStringArrayItems(value.missing_information, `${path}.missing_information`, "request_diagnosis.missing_information items must be non-empty.", issues);
    validateUniqueStringArrayItems(value.constraints, `${path}.constraints`, "request_diagnosis.constraints items must be unique.", issues);
    validateUniqueStringArrayItems(value.missing_information, `${path}.missing_information`, "request_diagnosis.missing_information items must be unique.", issues);
    validateRequiredString(value.risk, `${path}.risk`, issues);
    validateRequiredString(value.confidence, `${path}.confidence`, issues);
    validateEnum(value.recommended_action, RECOMMENDED_ACTIONS, `${path}.recommended_action`, issues);
    validateRequiredString(value.reason, `${path}.reason`, issues);
}
function validateResultDiagnosis(value, path, issues) {
    if (!isRecord(value)) {
        issues.push(issue(path, `Expected object at ${path}.`));
        return;
    }
    validateRequiredString(value.diagnosis_summary, `${path}.diagnosis_summary`, issues);
    validateEnum(value.sufficiency, RESULT_SUFFICIENCIES, `${path}.sufficiency`, issues);
    validateStringArray(value.missing_information, `${path}.missing_information`, issues);
    validateStringArray(value.conflicts, `${path}.conflicts`, issues);
    validateRequiredString(value.risk, `${path}.risk`, issues);
    validateStringArray(value.risks, `${path}.risks`, issues);
    validateNonEmptyStringArrayItems(value.missing_information, `${path}.missing_information`, "result_diagnosis.missing_information items must be non-empty.", issues);
    validateNonEmptyStringArrayItems(value.conflicts, `${path}.conflicts`, "result_diagnosis.conflicts items must be non-empty.", issues);
    validateNonEmptyStringArrayItems(value.risks, `${path}.risks`, "result_diagnosis.risks items must be non-empty.", issues);
    validateUniqueStringArrayItems(value.missing_information, `${path}.missing_information`, "result_diagnosis.missing_information items must be unique.", issues);
    validateUniqueStringArrayItems(value.conflicts, `${path}.conflicts`, "result_diagnosis.conflicts items must be unique.", issues);
    validateUniqueStringArrayItems(value.risks, `${path}.risks`, "result_diagnosis.risks items must be unique.", issues);
    validateRequiredString(value.confidence, `${path}.confidence`, issues);
    validateEnum(value.recommended_action, RECOMMENDED_ACTIONS, `${path}.recommended_action`, issues);
    validateRequiredString(value.reason, `${path}.reason`, issues);
}
function validateStepPlan(value, path, issues) {
    if (!Array.isArray(value)) {
        issues.push(issue(path, `Expected array at ${path}.`));
        return;
    }
    value.forEach((item, index) => {
        const itemPath = `${path}[${index}]`;
        if (!isRecord(item)) {
            issues.push(issue(itemPath, `Expected object at ${itemPath}.`));
            return;
        }
        validateRequiredString(item.step_id, `${itemPath}.step_id`, issues);
        validateRequiredString(item.owner_agent_name, `${itemPath}.owner_agent_name`, issues);
        validateUserFacingAgentName(item.owner_agent_name, `${itemPath}.owner_agent_name`, "step_plan.owner_agent_name must use a user-facing agent name, not an internal ID.", issues);
        validateEnum(item.action_type, STEP_ACTION_TYPES, `${itemPath}.action_type`, issues);
        validateStringArray(item.input_refs, `${itemPath}.input_refs`, issues);
        validateNonEmptyStringArrayItems(item.input_refs, `${itemPath}.input_refs`, "step_plan.input_refs items must be non-empty.", issues);
        validateUniqueStringArrayItems(item.input_refs, `${itemPath}.input_refs`, "step_plan.input_refs items must be unique.", issues);
        validateRequiredString(item.expected_output, `${itemPath}.expected_output`, issues);
        validateRequiredString(item.completion_criteria, `${itemPath}.completion_criteria`, issues);
        validateEnum(item.status, STEP_STATUSES, `${itemPath}.status`, issues);
    });
}
function validateStepResults(value, path, issues) {
    if (!Array.isArray(value)) {
        issues.push(issue(path, `Expected array at ${path}.`));
        return;
    }
    value.forEach((item, index) => {
        const itemPath = `${path}[${index}]`;
        if (!isRecord(item)) {
            issues.push(issue(itemPath, `Expected object at ${itemPath}.`));
            return;
        }
        validateRequiredString(item.step_id, `${itemPath}.step_id`, issues);
        validateEnum(item.status, STEP_RESULT_STATUSES, `${itemPath}.status`, issues);
        validateOptionalNonEmptyString(item.output_ref, `${itemPath}.output_ref`, "step_results.output_ref must be non-empty when present.", issues);
        validateStringArray(item.evidence_refs, `${itemPath}.evidence_refs`, issues);
        validateNonEmptyStringArrayItems(item.evidence_refs, `${itemPath}.evidence_refs`, "step_results.evidence_refs items must be non-empty.", issues);
        validateUniqueStringArrayItems(item.evidence_refs, `${itemPath}.evidence_refs`, "step_results.evidence_refs items must be unique.", issues);
        validateOptionalNonEmptyString(item.error, `${itemPath}.error`, "step_results.error must be non-empty when present.", issues);
        if ((item.status === "failed" || item.status === "blocked") &&
            (typeof item.error !== "string" || item.error.trim().length === 0)) {
            issues.push(issue(`${itemPath}.error`, "failed or blocked step result requires a non-empty error reason."));
        }
        if (item.completed_at !== undefined)
            validateNumber(item.completed_at, `${itemPath}.completed_at`, issues);
    });
}
function validateStepPlanUniqueIds(value, path, issues) {
    if (!Array.isArray(value))
        return undefined;
    const plannedStepIds = new Set();
    value.forEach((item, index) => {
        if (!isRecord(item) || typeof item.step_id !== "string")
            return;
        const normalizedStepId = item.step_id.trim();
        if (plannedStepIds.has(normalizedStepId)) {
            issues.push(issue(`${path}[${index}].step_id`, "step_plan.step_id must be unique."));
            return;
        }
        plannedStepIds.add(normalizedStepId);
    });
    return plannedStepIds;
}
function validateWorkRecordStepReferences(value, issues) {
    const plannedStepIds = validateStepPlanUniqueIds(value.step_plan, "$.step_plan", issues);
    if (!plannedStepIds)
        return;
    const stepStatusById = new Map();
    if (Array.isArray(value.step_plan)) {
        value.step_plan.forEach((item) => {
            if (!isRecord(item) || typeof item.step_id !== "string")
                return;
            stepStatusById.set(item.step_id.trim(), item.status);
        });
    }
    if (Array.isArray(value.step_results)) {
        value.step_results.forEach((item, index) => {
            if (!isRecord(item) || typeof item.step_id !== "string")
                return;
            const normalizedStepId = item.step_id.trim();
            if (!plannedStepIds.has(normalizedStepId)) {
                issues.push(issue(`$.step_results[${index}].step_id`, "step_results.step_id must exist in step_plan."));
                return;
            }
            const plannedStatus = stepStatusById.get(normalizedStepId);
            if ((item.status === "completed" || item.status === "failed" || item.status === "blocked") &&
                plannedStatus !== item.status) {
                issues.push(issue(`$.step_results[${index}].status`, "step_results.status must match terminal step_plan.status for completed, failed, and blocked results."));
            }
            if (item.status === "partial" &&
                plannedStatus !== "running" &&
                plannedStatus !== "completed" &&
                plannedStatus !== "failed" &&
                plannedStatus !== "blocked") {
                issues.push(issue(`$.step_results[${index}].status`, "partial step_results.status requires a running or terminal step_plan.status."));
            }
        });
    }
    if (isRecord(value.failure_diagnosis) &&
        typeof value.failure_diagnosis.failed_step_id === "string" &&
        value.failure_diagnosis.failed_step_id.trim().length > 0) {
        const failedStepId = value.failure_diagnosis.failed_step_id.trim();
        if (!plannedStepIds.has(failedStepId)) {
            issues.push(issue("$.failure_diagnosis.failed_step_id", "failure_diagnosis.failed_step_id must exist in step_plan."));
        }
        else {
            const plannedStatus = stepStatusById.get(failedStepId);
            if (plannedStatus === "completed" || plannedStatus === "skipped") {
                issues.push(issue("$.failure_diagnosis.failed_step_id", "failure_diagnosis.failed_step_id must not reference a completed or skipped step."));
            }
        }
    }
    if (isRecord(value.action_decision) &&
        typeof value.action_decision.next_step_id === "string" &&
        value.action_decision.next_step_id.trim().length > 0 &&
        !plannedStepIds.has(value.action_decision.next_step_id.trim())) {
        issues.push(issue("$.action_decision.next_step_id", "action_decision.next_step_id must exist in step_plan."));
    }
}
function validateFailureDiagnosis(value, path, issues) {
    if (value === undefined)
        return;
    if (!isRecord(value)) {
        issues.push(issue(path, `Expected object at ${path}.`));
        return;
    }
    validateRequiredString(value.failed_step_id, `${path}.failed_step_id`, issues);
    validateRequiredString(value.failure_reason, `${path}.failure_reason`, issues);
    validateStringArray(value.failed_input_refs, `${path}.failed_input_refs`, issues);
    validateNonEmptyStringArrayItems(value.failed_input_refs, `${path}.failed_input_refs`, "failure_diagnosis.failed_input_refs items must be non-empty.", issues);
    validateUniqueStringArrayItems(value.failed_input_refs, `${path}.failed_input_refs`, "failure_diagnosis.failed_input_refs items must be unique.", issues);
    validateRequiredString(value.failed_strategy, `${path}.failed_strategy`, issues);
    validateBoolean(value.recoverable, `${path}.recoverable`, issues);
}
function validateActiveWorkBlocker(value, path, issues) {
    if (value === undefined)
        return;
    if (!isRecord(value)) {
        issues.push(issue(path, `Expected object at ${path}.`));
        return;
    }
    validateEnum(value.blocker_kind, WORK_BLOCKER_KINDS, `${path}.blocker_kind`, issues);
    validateRequiredString(value.blocker_ref, `${path}.blocker_ref`, issues);
    validateOptionalNonEmptyString(value.step_id, `${path}.step_id`, "step_id must be non-empty when present.", issues);
    validateNonEmptyStringArray(value.evidence_refs, `${path}.evidence_refs`, "active blocker requires at least one evidence reference.", issues);
    validateNonEmptyStringArrayItems(value.evidence_refs, `${path}.evidence_refs`, "active blocker evidence refs must be non-empty.", issues);
    validateUniqueStringArrayItems(value.evidence_refs, `${path}.evidence_refs`, "active blocker evidence refs must be unique.", issues);
}
function validateBlockerResolutionReceipt(value, path, issues) {
    if (value === undefined)
        return;
    if (!isRecord(value)) {
        issues.push(issue(path, `Expected object at ${path}.`));
        return;
    }
    validateRequiredString(value.receipt_id, `${path}.receipt_id`, issues);
    validateRequiredString(value.work_id, `${path}.work_id`, issues);
    validateEnum(value.blocker_kind, WORK_BLOCKER_KINDS, `${path}.blocker_kind`, issues);
    validateRequiredString(value.blocker_ref, `${path}.blocker_ref`, issues);
    validateNonEmptyStringArray(value.resolution_evidence_refs, `${path}.resolution_evidence_refs`, "blocker resolution requires at least one evidence reference.", issues);
    validateNonEmptyStringArrayItems(value.resolution_evidence_refs, `${path}.resolution_evidence_refs`, "blocker resolution evidence refs must be non-empty.", issues);
    validateUniqueStringArrayItems(value.resolution_evidence_refs, `${path}.resolution_evidence_refs`, "blocker resolution evidence refs must be unique.", issues);
    validateBoolean(value.verified, `${path}.verified`, issues);
}
function validateRecoveryCandidate(value, path, issues) {
    if (!isRecord(value)) {
        issues.push(issue(path, `Expected object at ${path}.`));
        return;
    }
    validateEnum(value.action_type, RECOMMENDED_ACTIONS, `${path}.action_type`, issues);
    validateRequiredString(value.changed_input_or_strategy, `${path}.changed_input_or_strategy`, issues);
    validateRequiredString(value.expected_benefit, `${path}.expected_benefit`, issues);
    validateRequiredString(value.risk, `${path}.risk`, issues);
    validateOptionalNonEmptyString(value.required_permission, `${path}.required_permission`, "required_permission must be non-empty when present.", issues);
    validateRecoveryCandidateMetadata(value.metadata, `${path}.metadata`, issues);
    if (!Array.isArray(value.changed_dimensions)) {
        issues.push(issue(`${path}.changed_dimensions`, `Expected array at ${path}.changed_dimensions.`));
    }
    else {
        if (value.changed_dimensions.length === 0) {
            issues.push(issue(`${path}.changed_dimensions`, "Recovery candidate must change input, strategy, tool, delegation target, permission, scope, or validation method."));
        }
        value.changed_dimensions.forEach((dimension, index) => {
            validateEnum(dimension, RECOVERY_CHANGED_DIMENSIONS, `${path}.changed_dimensions[${index}]`, issues);
        });
        validateUniqueStringArrayItems(value.changed_dimensions, `${path}.changed_dimensions`, "changed_dimensions items must be unique.", issues);
    }
}
function sameOptionalString(left, right) {
    return (left ?? "").trim() === (right ?? "").trim();
}
function sameString(left, right) {
    return left.trim() === right.trim();
}
function sameStringArray(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right))
        return false;
    if (left.length !== right.length)
        return false;
    return left.every((item, index) => (typeof item === "string" &&
        typeof right[index] === "string" &&
        sameString(item, right[index])));
}
function sameWorkStepPlanItem(left, right) {
    return typeof left.step_id === "string" &&
        typeof right.step_id === "string" &&
        sameString(left.step_id, right.step_id) &&
        typeof left.owner_agent_name === "string" &&
        typeof right.owner_agent_name === "string" &&
        sameString(left.owner_agent_name, right.owner_agent_name) &&
        typeof left.action_type === "string" &&
        typeof right.action_type === "string" &&
        sameString(left.action_type, right.action_type) &&
        sameStringArray(left.input_refs, right.input_refs) &&
        typeof left.expected_output === "string" &&
        typeof right.expected_output === "string" &&
        sameString(left.expected_output, right.expected_output) &&
        typeof left.completion_criteria === "string" &&
        typeof right.completion_criteria === "string" &&
        sameString(left.completion_criteria, right.completion_criteria) &&
        typeof left.status === "string" &&
        typeof right.status === "string" &&
        sameString(left.status, right.status);
}
function sameChangedDimensions(left, right) {
    if (left.length !== right.length)
        return false;
    const leftSorted = [...left].sort();
    const rightSorted = [...right].sort();
    return leftSorted.every((dimension, index) => dimension === rightSorted[index]);
}
function definedObjectKeys(value) {
    return Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort();
}
function sameJsonValue(left, right) {
    if (left === undefined && right === undefined)
        return true;
    if (left === undefined || right === undefined)
        return false;
    if (left === null || right === null)
        return left === right;
    if (typeof left !== typeof right)
        return false;
    if (typeof left !== "object" || typeof right !== "object")
        return left === right;
    if (Array.isArray(left) || Array.isArray(right)) {
        if (!Array.isArray(left) || !Array.isArray(right))
            return false;
        if (left.length !== right.length)
            return false;
        return left.every((item, index) => sameJsonValue(item, right[index]));
    }
    const leftRecord = left;
    const rightRecord = right;
    const leftKeys = definedObjectKeys(leftRecord);
    const rightKeys = definedObjectKeys(rightRecord);
    if (leftKeys.length !== rightKeys.length)
        return false;
    return leftKeys.every((key, index) => key === rightKeys[index] && sameJsonValue(leftRecord[key], rightRecord[key]));
}
function sameMetadata(left, right) {
    return sameJsonValue(left ?? {}, right ?? {});
}
function recoveryCandidateMatches(left, right) {
    return left.action_type === right.action_type &&
        sameString(left.changed_input_or_strategy, right.changed_input_or_strategy) &&
        sameString(left.expected_benefit, right.expected_benefit) &&
        sameString(left.risk, right.risk) &&
        sameOptionalString(left.required_permission, right.required_permission) &&
        sameChangedDimensions(left.changed_dimensions, right.changed_dimensions) &&
        sameMetadata(left.metadata, right.metadata);
}
function validateRecoveryCandidates(value, path, issues) {
    if (value === undefined)
        return;
    if (!Array.isArray(value)) {
        issues.push(issue(path, `Expected array at ${path}.`));
        return;
    }
    value.forEach((candidate, index) => validateRecoveryCandidate(candidate, `${path}[${index}]`, issues));
    const validCandidates = [];
    value.forEach((candidate, index) => {
        if (!isRecord(candidate))
            return;
        const candidateIssues = [];
        validateRecoveryCandidate(candidate, `${path}[${index}]`, candidateIssues);
        if (candidateIssues.length > 0)
            return;
        const duplicate = validCandidates.some((validCandidate) => recoveryCandidateMatches(validCandidate, candidate));
        if (duplicate) {
            issues.push(issue(`${path}[${index}]`, "recovery_candidates items must be unique."));
            return;
        }
        validCandidates.push(candidate);
    });
}
function validateActionDecision(value, path, issues) {
    if (!isRecord(value)) {
        issues.push(issue(path, `Expected object at ${path}.`));
        return;
    }
    validateEnum(value.selected_action, RECOMMENDED_ACTIONS, `${path}.selected_action`, issues);
    validateRequiredString(value.reason, `${path}.reason`, issues);
    validateOptionalNonEmptyString(value.next_step_id, `${path}.next_step_id`, "action_decision.next_step_id must be non-empty when present.", issues);
}
function validateSelectedRecoveryActionReference(value, issues) {
    if (value.selected_recovery_action === undefined)
        return;
    if (!isRecord(value.selected_recovery_action))
        return;
    const selectedIssues = [];
    validateRecoveryCandidate(value.selected_recovery_action, "$.selected_recovery_action", selectedIssues);
    if (selectedIssues.length > 0)
        return;
    if (!Array.isArray(value.recovery_candidates)) {
        issues.push(issue("$.selected_recovery_action", "selected_recovery_action must match one recovery_candidates item."));
        return;
    }
    const selected = value.selected_recovery_action;
    const hasMatchingCandidate = value.recovery_candidates.some((candidate) => {
        if (!isRecord(candidate))
            return false;
        const candidateIssues = [];
        validateRecoveryCandidate(candidate, "$.recovery_candidates[]", candidateIssues);
        if (candidateIssues.length > 0)
            return false;
        return recoveryCandidateMatches(candidate, selected);
    });
    if (hasMatchingCandidate)
        return;
    issues.push(issue("$.selected_recovery_action", "selected_recovery_action must match one recovery_candidates item."));
}
function validateSelectedRecoveryActionAgainstFailure(value, issues) {
    if (!isRecord(value.failure_diagnosis) || !isRecord(value.selected_recovery_action))
        return;
    const failureIssues = [];
    validateFailureDiagnosis(value.failure_diagnosis, "$.failure_diagnosis", failureIssues);
    const selectedIssues = [];
    validateRecoveryCandidate(value.selected_recovery_action, "$.selected_recovery_action", selectedIssues);
    if (failureIssues.length > 0 || selectedIssues.length > 0)
        return;
    const result = validateRecoveryCandidateAgainstFailure(value.failure_diagnosis, value.selected_recovery_action);
    if (result.ok)
        return;
    result.issues.forEach((candidateIssue) => {
        issues.push(issue(`$.selected_recovery_action${candidateIssue.path.replace(/^\$/, "")}`, candidateIssue.message));
    });
}
function validateFailedWorkRecordRecoveryBundle(value, issues) {
    if (value.status !== "failed")
        return;
    if (!isRecord(value.failure_diagnosis)) {
        issues.push(issue("$.failure_diagnosis", "failed work record requires failure_diagnosis."));
    }
    if (!Array.isArray(value.recovery_candidates) || value.recovery_candidates.length === 0) {
        issues.push(issue("$.recovery_candidates", "failed work record requires at least one recovery candidate."));
    }
    if (!isRecord(value.selected_recovery_action)) {
        issues.push(issue("$.selected_recovery_action", "failed work record requires selected_recovery_action."));
    }
    if (typeof value.stop_condition !== "string" || value.stop_condition.trim().length === 0) {
        issues.push(issue("$.stop_condition", "failed work record requires a non-empty stop_condition."));
    }
}
function completedWorkRecordRequiredStepsAreComplete(value) {
    if (!Array.isArray(value.step_plan) || !Array.isArray(value.step_results))
        return true;
    const requiredStepIds = [];
    for (const step of value.step_plan) {
        if (!isRecord(step) || typeof step.step_id !== "string")
            continue;
        if (step.status === "skipped")
            continue;
        if (step.status !== "completed")
            return false;
        requiredStepIds.push(step.step_id);
    }
    const completedResultIds = new Set(value.step_results
        .filter((result) => isRecord(result))
        .filter((result) => result.status === "completed" && typeof result.step_id === "string")
        .map((result) => result.step_id));
    return requiredStepIds.every((stepId) => completedResultIds.has(stepId));
}
function validateWorkRecordStatusGate(value, issues) {
    const diagnosis = value.result_diagnosis;
    const decision = value.action_decision;
    if (!isRecord(diagnosis) || !isRecord(decision))
        return;
    if (value.status === "completed" && (diagnosis.sufficiency !== "sufficient" ||
        diagnosis.recommended_action !== "final_report" ||
        decision.selected_action !== "final_report")) {
        issues.push(issue("$.status", "completed work record requires sufficient final_report diagnosis and action decision."));
    }
    if (value.status === "completed" && !completedWorkRecordRequiredStepsAreComplete(value)) {
        issues.push(issue("$.status", "completed work record requires completed required steps and completed step results."));
    }
    if (value.status === "partial" && (diagnosis.sufficiency !== "partial" ||
        diagnosis.recommended_action === "final_report" ||
        decision.selected_action === "final_report" ||
        decision.selected_action !== diagnosis.recommended_action ||
        !isRecord(value.failure_diagnosis) ||
        !Array.isArray(value.recovery_candidates) ||
        value.recovery_candidates.length === 0)) {
        issues.push(issue("$.status", "partial work record requires partial diagnosis, a matching non-final action decision, failure_diagnosis, and at least one recovery candidate."));
    }
    if (value.status === "partial" &&
        typeof decision.selected_action === "string" &&
        (decision.selected_action === "retry" || decision.selected_action === "redelegate") &&
        !isRecord(value.selected_recovery_action)) {
        issues.push(issue("$.selected_recovery_action", "partial retry or redelegate work record requires selected_recovery_action."));
    }
    if (value.status === "failed" && (diagnosis.sufficiency === "sufficient" ||
        diagnosis.recommended_action === "final_report" ||
        decision.selected_action === "final_report")) {
        issues.push(issue("$.status", "failed work record requires non-sufficient diagnosis and non-final action decision."));
    }
    if (value.status === "blocked" && (diagnosis.sufficiency === "sufficient" ||
        !BLOCKED_ACTIONS.has(diagnosis.recommended_action) ||
        !BLOCKED_ACTIONS.has(decision.selected_action))) {
        issues.push(issue("$.status", "blocked work record requires non-sufficient diagnosis and blocked or clarification action."));
    }
}
function validateChildResultActionGate(value, issues) {
    const diagnosis = value.result_diagnosis;
    const decision = value.action_decision;
    if (!isRecord(diagnosis) || !isRecord(decision))
        return;
    const expectedAction = diagnosis.recommended_action;
    const selectedAction = decision.selected_action;
    if (typeof expectedAction === "string" &&
        typeof selectedAction === "string" &&
        RECOMMENDED_ACTIONS.has(expectedAction) &&
        RECOMMENDED_ACTIONS.has(selectedAction) &&
        selectedAction !== expectedAction) {
        issues.push(issue("$.action_decision.selected_action", "Child work result action decision must match result_diagnosis.recommended_action."));
    }
}
function validateChildResultStatusGate(value, issues) {
    const diagnosis = value.result_diagnosis;
    const decision = value.action_decision;
    if (!isRecord(diagnosis) || !isRecord(decision))
        return;
    if (value.status === "completed" && (diagnosis.sufficiency !== "sufficient" ||
        diagnosis.recommended_action !== "final_report" ||
        decision.selected_action !== "final_report")) {
        issues.push(issue("$.status", "completed child work result requires sufficient final_report diagnosis and action decision."));
    }
    if (value.status === "partial" && (diagnosis.sufficiency !== "partial" ||
        diagnosis.recommended_action === "final_report" ||
        decision.selected_action === "final_report")) {
        issues.push(issue("$.status", "partial child work result requires partial diagnosis and a non-final next action."));
    }
    if (value.status === "failed" && (diagnosis.sufficiency === "sufficient" ||
        diagnosis.recommended_action === "final_report" ||
        decision.selected_action === "final_report")) {
        issues.push(issue("$.status", "failed child work result requires non-sufficient diagnosis and non-final action decision."));
    }
    if (value.status === "blocked" && (diagnosis.sufficiency === "sufficient" ||
        !BLOCKED_ACTIONS.has(diagnosis.recommended_action) ||
        !BLOCKED_ACTIONS.has(decision.selected_action))) {
        issues.push(issue("$.status", "blocked child work result requires non-sufficient diagnosis and blocked or clarification action."));
    }
}
function validateChildResultStepStatusGate(value, issues) {
    if (!Array.isArray(value.completed_steps) || !Array.isArray(value.failed_steps))
        return;
    const completedSteps = new Set(value.completed_steps
        .filter((step) => typeof step === "string")
        .map((step) => step.trim())
        .filter((step) => step.length > 0));
    const failedSteps = new Set(value.failed_steps
        .filter((step) => typeof step === "string")
        .map((step) => step.trim())
        .filter((step) => step.length > 0));
    value.completed_steps.forEach((step, index) => {
        if (typeof step !== "string")
            return;
        if (step.trim().length > 0)
            return;
        issues.push(issue(`$.completed_steps[${index}]`, "completed_steps items must be non-empty step ids."));
    });
    value.failed_steps.forEach((step, index) => {
        if (typeof step !== "string")
            return;
        if (step.trim().length > 0)
            return;
        issues.push(issue(`$.failed_steps[${index}]`, "failed_steps items must be non-empty step ids."));
    });
    validateUniqueStringArrayItems(value.completed_steps, "$.completed_steps", "completed_steps items must be unique.", issues);
    validateUniqueStringArrayItems(value.failed_steps, "$.failed_steps", "failed_steps items must be unique.", issues);
    value.failed_steps.forEach((step, index) => {
        if (typeof step !== "string")
            return;
        if (completedSteps.has(step.trim())) {
            issues.push(issue(`$.failed_steps[${index}]`, "Child work result step cannot be both completed and failed."));
        }
    });
    if (value.status === "completed" && value.completed_steps.length === 0) {
        issues.push(issue("$.completed_steps", "completed child work result requires at least one completed step."));
    }
    if (value.status === "completed" && value.failed_steps.length > 0) {
        issues.push(issue("$.failed_steps", "completed child work result must not include failed steps."));
    }
    if (isRecord(value.failure_diagnosis) &&
        typeof value.failure_diagnosis.failed_step_id === "string" &&
        value.failure_diagnosis.failed_step_id.trim().length > 0 &&
        !failedSteps.has(value.failure_diagnosis.failed_step_id.trim())) {
        issues.push(issue("$.failure_diagnosis.failed_step_id", "failure_diagnosis.failed_step_id must exist in failed_steps."));
    }
}
function validateNonEmptyStringArrayItems(value, path, message, issues) {
    if (!Array.isArray(value))
        return;
    value.forEach((item, index) => {
        if (typeof item !== "string")
            return;
        if (item.trim().length > 0)
            return;
        issues.push(issue(`${path}[${index}]`, message));
    });
}
function validateUniqueStringArrayItems(value, path, message, issues) {
    if (!Array.isArray(value))
        return;
    const seen = new Set();
    value.forEach((item, index) => {
        if (typeof item !== "string")
            return;
        const normalized = item.trim();
        if (seen.has(normalized)) {
            issues.push(issue(`${path}[${index}]`, message));
            return;
        }
        seen.add(normalized);
    });
}
function validateUniqueNormalizedStringArrayItems(value, path, message, issues) {
    if (!Array.isArray(value))
        return;
    const seen = new Set();
    value.forEach((item, index) => {
        if (typeof item !== "string")
            return;
        const normalized = item.trim().toLowerCase();
        if (normalized.length === 0)
            return;
        if (seen.has(normalized)) {
            issues.push(issue(`${path}[${index}]`, message));
            return;
        }
        seen.add(normalized);
    });
}
function validateFailedChildResultRecoveryBundle(value, issues) {
    if (value.status !== "failed")
        return;
    if (!Array.isArray(value.failed_steps) || value.failed_steps.length === 0) {
        issues.push(issue("$.failed_steps", "failed child work result requires at least one failed step."));
    }
    if (!isRecord(value.failure_diagnosis)) {
        issues.push(issue("$.failure_diagnosis", "failed child work result requires failure_diagnosis."));
    }
    if (value.needs_parent_review !== true) {
        issues.push(issue("$.needs_parent_review", "failed child work result requires needs_parent_review = true."));
    }
    if (isRecord(value.failure_diagnosis) &&
        value.failure_diagnosis.recoverable === true &&
        (!Array.isArray(value.recovery_attempts) || value.recovery_attempts.length === 0)) {
        issues.push(issue("$.recovery_attempts", "recoverable failed child work result requires at least one recovery attempt."));
    }
}
function hasNonEmptyStringItem(value) {
    return Array.isArray(value) && value.some((item) => typeof item === "string" && item.trim().length > 0);
}
function validateCompletedChildResultReviewEvidence(value, issues) {
    if (value.status !== "completed")
        return;
    if (!hasNonEmptyStringItem(value.evidence) && !hasNonEmptyStringItem(value.actions_taken)) {
        issues.push(issue("$.status", "completed child work result requires evidence or actions_taken for parent review."));
    }
    if (value.needs_parent_review !== true) {
        issues.push(issue("$.needs_parent_review", "completed child work result requires needs_parent_review = true."));
    }
}
function validatePartialChildResultReviewContext(value, issues) {
    if (value.status !== "partial")
        return;
    if (!hasNonEmptyStringItem(value.failed_steps) && !hasNonEmptyStringItem(value.missing_information)) {
        issues.push(issue("$.status", "partial child work result requires failed_steps or missing_information for parent review."));
    }
    if (value.needs_parent_review !== true) {
        issues.push(issue("$.needs_parent_review", "partial child work result requires needs_parent_review = true."));
    }
}
function validateBlockedChildResultReviewContext(value, issues) {
    if (value.status !== "blocked")
        return;
    if (!hasNonEmptyStringItem(value.missing_information) && !hasNonEmptyStringItem(value.risks)) {
        issues.push(issue("$.status", "blocked child work result requires missing_information or risks for parent review."));
    }
    if (value.needs_parent_review !== true) {
        issues.push(issue("$.needs_parent_review", "blocked child work result requires needs_parent_review = true."));
    }
}
function validateChildResultRecoveryGate(value, issues) {
    if (!isRecord(value.failure_diagnosis) || !Array.isArray(value.recovery_attempts))
        return;
    const failureValidationIssues = [];
    validateFailureDiagnosis(value.failure_diagnosis, "$.failure_diagnosis", failureValidationIssues);
    if (failureValidationIssues.length > 0)
        return;
    value.recovery_attempts.forEach((candidate, index) => {
        const result = validateRecoveryCandidateAgainstFailure(value.failure_diagnosis, candidate);
        if (result.ok)
            return;
        result.issues.forEach((candidateIssue) => {
            issues.push(issue(`$.recovery_attempts[${index}]${candidateIssue.path.replace(/^\$/, "")}`, candidateIssue.message));
        });
    });
}
function validateWorkHandoffActionGate(value, issues) {
    const diagnosis = value.request_diagnosis;
    if (isRecord(diagnosis)) {
        const recommendedAction = diagnosis.recommended_action;
        if (typeof recommendedAction === "string" &&
            RECOMMENDED_ACTIONS.has(recommendedAction) &&
            recommendedAction !== "delegate") {
            issues.push(issue("$.request_diagnosis.recommended_action", "Work handoff request diagnosis must recommend delegate."));
        }
    }
    const currentStep = value.current_step;
    if (isRecord(currentStep)) {
        const actionType = currentStep.action_type;
        if (typeof actionType === "string" &&
            STEP_ACTION_TYPES.has(actionType) &&
            actionType !== "delegate") {
            issues.push(issue("$.current_step.action_type", "Work handoff current step action_type must be delegate."));
        }
    }
}
function validateWorkHandoffStepReferences(value, issues) {
    validateStepPlanUniqueIds(value.step_plan, "$.step_plan", issues);
    const currentStep = value.current_step;
    if (isRecord(currentStep) && Array.isArray(value.step_plan) && typeof currentStep.step_id === "string") {
        const currentStepId = currentStep.step_id;
        const matchingStep = value.step_plan.find((item) => (isRecord(item) &&
            typeof item.step_id === "string" &&
            sameString(item.step_id, currentStepId)));
        if (isRecord(matchingStep) && !sameWorkStepPlanItem(currentStep, matchingStep)) {
            issues.push(issue("$.current_step", "current_step must match the step_plan item with the same step_id."));
        }
    }
    const targetAgentName = value.target_agent_name;
    if (isRecord(currentStep) &&
        typeof currentStep.owner_agent_name === "string" &&
        typeof targetAgentName === "string" &&
        currentStep.owner_agent_name.trim() !== targetAgentName.trim()) {
        issues.push(issue("$.current_step.owner_agent_name", "current_step.owner_agent_name must match target_agent_name."));
    }
}
function validateWorkHandoffToolBoundary(value, issues) {
    if (!Array.isArray(value.allowed_tools) || !Array.isArray(value.disallowed_actions))
        return;
    const allowed = new Set(value.allowed_tools
        .filter((item) => typeof item === "string")
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item.length > 0));
    value.disallowed_actions.forEach((item, index) => {
        if (typeof item !== "string")
            return;
        const normalized = item.trim().toLowerCase();
        if (normalized.length === 0 || !allowed.has(normalized))
            return;
        issues.push(issue(`$.disallowed_actions[${index}]`, "disallowed_actions must not repeat allowed_tools items."));
    });
}
function validateWorkHandoffFailureRecoveryPolicy(value, issues) {
    validateRequiredString(value.failure_recovery_policy, "$.failure_recovery_policy", issues);
    if (typeof value.failure_recovery_policy !== "string")
        return;
    const normalized = value.failure_recovery_policy.trim().toLowerCase();
    if (normalized.length === 0)
        return;
    if (RECOVERY_CHANGED_DIMENSION_TERMS.some((term) => normalized.includes(term)))
        return;
    issues.push(issue("$.failure_recovery_policy", "failure_recovery_policy must name at least one recovery changed dimension."));
}
export function validateLlmRequestDiagnosisRecord(value) {
    const issues = [];
    validateRequestDiagnosis(value, "$", issues);
    return issues.length === 0
        ? { ok: true, value: value, issues: [] }
        : { ok: false, issues };
}
export function validateLlmResultDiagnosisRecord(value) {
    const issues = [];
    validateResultDiagnosis(value, "$", issues);
    return issues.length === 0
        ? { ok: true, value: value, issues: [] }
        : { ok: false, issues };
}
export function validateWorkRecord(value) {
    const issues = [];
    if (!isRecord(value)) {
        return { ok: false, issues: [issue("$", "Work record must be an object.")] };
    }
    for (const field of Object.keys(value)) {
        if (!WORK_RECORD_FIELDS.has(field))
            issues.push(issue(`$.${field}`, "Work record contains an unsupported field."));
    }
    if (value.schemaVersion !== WORK_RECORD_SCHEMA_VERSION) {
        issues.push({ path: "$.schemaVersion", code: "unsupported_contract_version", message: "Unsupported work record schema version." });
    }
    validateRequiredString(value.work_id, "$.work_id", issues);
    validateOptionalNonEmptyString(value.parent_work_id, "$.parent_work_id", "parent_work_id must be non-empty when present.", issues);
    if (value.source === "parent_agent" &&
        (typeof value.parent_work_id !== "string" || value.parent_work_id.trim().length === 0)) {
        issues.push(issue("$.parent_work_id", "parent_agent work records require parent_work_id."));
    }
    if (typeof value.work_id === "string" &&
        typeof value.parent_work_id === "string" &&
        value.work_id.trim().length > 0 &&
        value.parent_work_id.trim().length > 0 &&
        sameString(value.work_id, value.parent_work_id)) {
        issues.push(issue("$.parent_work_id", "parent_work_id must differ from work_id."));
    }
    validateRequiredString(value.owner_agent_name, "$.owner_agent_name", issues);
    validateUserFacingAgentName(value.owner_agent_name, "$.owner_agent_name", "owner_agent_name must use a user-facing agent name, not an internal ID.", issues);
    validateEnum(value.source, WORK_RECORD_SOURCES, "$.source", issues);
    validateEnum(value.status, WORK_RECORD_STATUSES, "$.status", issues);
    validateRequiredString(value.user_request_summary, "$.user_request_summary", issues);
    validateRequestDiagnosis(value.request_diagnosis, "$.request_diagnosis", issues);
    validateStepPlan(value.step_plan, "$.step_plan", issues);
    validateStepResults(value.step_results, "$.step_results", issues);
    validateWorkRecordStepReferences(value, issues);
    validateResultDiagnosis(value.result_diagnosis, "$.result_diagnosis", issues);
    validateFailureDiagnosis(value.failure_diagnosis, "$.failure_diagnosis", issues);
    validateRecoveryCandidates(value.recovery_candidates, "$.recovery_candidates", issues);
    if (value.selected_recovery_action !== undefined)
        validateRecoveryCandidate(value.selected_recovery_action, "$.selected_recovery_action", issues);
    validateSelectedRecoveryActionReference(value, issues);
    validateSelectedRecoveryActionAgainstFailure(value, issues);
    validateFailedWorkRecordRecoveryBundle(value, issues);
    validateActiveWorkBlocker(value.active_blocker, "$.active_blocker", issues);
    validateBlockerResolutionReceipt(value.blocker_resolution, "$.blocker_resolution", issues);
    validateOptionalStringArray(value.unblock_evidence, "$.unblock_evidence", issues);
    validateNonEmptyStringArrayItems(value.unblock_evidence, "$.unblock_evidence", "unblock_evidence items must be non-empty.", issues);
    validateUniqueStringArrayItems(value.unblock_evidence, "$.unblock_evidence", "unblock_evidence items must be unique.", issues);
    validateNonNegativeInteger(value.retry_count, "$.retry_count", "retry_count must be a non-negative integer.", issues);
    validateNonNegativeInteger(value.retry_limit, "$.retry_limit", "retry_limit must be a non-negative integer.", issues);
    validateOptionalNonEmptyString(value.stop_condition, "$.stop_condition", "stop_condition must be non-empty when present.", issues);
    validateActionDecision(value.action_decision, "$.action_decision", issues);
    validateWorkRecordStatusGate(value, issues);
    validateWorkRecordTextBounds(value, issues);
    return issues.length === 0 ? { ok: true, value: value, issues: [] } : { ok: false, issues };
}
function requiredStepIds(record) {
    return new Set(record.step_plan.filter((step) => step.status !== "skipped").map((step) => step.step_id));
}
function completedStepResultIds(record) {
    return new Set(record.step_results.filter((result) => result.status === "completed").map((result) => result.step_id));
}
function verifiedCompletedStepResults(record) {
    return record.step_results.filter((result) => result.status === "completed" &&
        Boolean(result.output_ref?.trim()) &&
        result.evidence_refs.some((reference) => reference.trim().length > 0));
}
function requiredStepPlanStatusesAreCompleted(record) {
    return record.step_plan.every((step) => step.status === "skipped" || step.status === "completed");
}
function completionCriteriaMet(record) {
    if (record.result_diagnosis.sufficiency !== "sufficient")
        return false;
    if (record.result_diagnosis.recommended_action !== "final_report")
        return false;
    if (record.action_decision.selected_action !== "final_report")
        return false;
    if (!requiredStepPlanStatusesAreCompleted(record))
        return false;
    const completed = new Set(verifiedCompletedStepResults(record).map((result) => result.step_id));
    return [...requiredStepIds(record)].every((stepId) => completed.has(stepId));
}
function hasBlockerResolutionEvidence(record) {
    const blocker = record.active_blocker;
    const resolution = record.blocker_resolution;
    return Boolean(blocker &&
        resolution &&
        resolution.verified &&
        resolution.work_id === record.work_id &&
        resolution.blocker_kind === blocker.blocker_kind &&
        resolution.blocker_ref === blocker.blocker_ref &&
        resolution.resolution_evidence_refs.some((item) => item.trim().length > 0));
}
function failureDiagnosisStepReferenceIsValid(record) {
    if (!record.failure_diagnosis)
        return false;
    if (record.failure_diagnosis.recoverable !== true)
        return false;
    const step = record.step_plan.find((candidate) => candidate.step_id === record.failure_diagnosis?.failed_step_id);
    return Boolean(step && step.status !== "completed" && step.status !== "skipped");
}
const PARTIAL_NEXT_ACTIONS = new Set([
    "retry",
    "redelegate",
    "partial_report",
    "stop_blocked",
]);
function partialCriteriaMet(record) {
    const achievedStepIds = new Set(verifiedCompletedStepResults(record).map((result) => result.step_id));
    const unmetStepIds = new Set(record.step_plan
        .filter((step) => step.status !== "completed" && step.status !== "skipped")
        .map((step) => step.step_id));
    const selectedAction = record.result_diagnosis.recommended_action;
    const selectedRecoveryRequired = selectedAction === "retry" || selectedAction === "redelegate";
    return achievedStepIds.size > 0 &&
        unmetStepIds.size > 0 &&
        record.result_diagnosis.sufficiency === "partial" &&
        failureDiagnosisStepReferenceIsValid(record) &&
        unmetStepIds.has(record.failure_diagnosis.failed_step_id) &&
        Boolean(record.recovery_candidates?.length) &&
        hasValidRecoveryCandidate(record) &&
        PARTIAL_NEXT_ACTIONS.has(selectedAction) &&
        record.action_decision.selected_action === selectedAction &&
        (!selectedRecoveryRequired || selectedRecoveryActionIsValid(record));
}
export function decideWorkRecordRunningExit(record, targetStatus) {
    if (record.status !== "running") {
        return { status: "rejected", reasonCode: "running_status_required", targetStatus: null };
    }
    if (targetStatus === "completed") {
        if (!completionCriteriaMet(record)) {
            return { status: "rejected", reasonCode: "completion_criteria_not_met", targetStatus: null };
        }
        const results = verifiedCompletedStepResults(record);
        return {
            status: "completed",
            reasonCode: "completion_criteria_met",
            targetStatus: "completed",
            completedStepIds: results.map((result) => result.step_id),
            evidenceRefs: uniqueStable(results.flatMap((result) => result.evidence_refs)),
        };
    }
    if (!partialCriteriaMet(record)) {
        return { status: "rejected", reasonCode: "partial_criteria_not_met", targetStatus: null };
    }
    const achievedStepIds = verifiedCompletedStepResults(record).map((result) => result.step_id);
    const unmetStepIds = record.step_plan
        .filter((step) => step.status !== "completed" && step.status !== "skipped")
        .map((step) => step.step_id);
    return {
        status: "partial",
        reasonCode: "partial_criteria_met",
        targetStatus: "partial",
        achievedStepIds,
        unmetStepIds,
        failedStepId: record.failure_diagnosis.failed_step_id,
        failureReason: record.failure_diagnosis.failure_reason,
        recoveryCandidates: structuredClone(record.recovery_candidates),
        nextAction: record.action_decision.selected_action,
    };
}
function hasValidRecoveryCandidate(record) {
    if (!record.failure_diagnosis || !record.recovery_candidates?.length)
        return false;
    return record.recovery_candidates.some((candidate) => validateRecoveryCandidateAgainstFailure(record.failure_diagnosis, candidate).ok);
}
function selectedRecoveryActionIsValid(record) {
    if (!record.failure_diagnosis || !record.selected_recovery_action || !record.recovery_candidates?.length)
        return false;
    if (!failureDiagnosisStepReferenceIsValid(record))
        return false;
    if (!record.recovery_candidates.some((candidate) => recoveryCandidateMatches(candidate, record.selected_recovery_action))) {
        return false;
    }
    return validateRecoveryCandidateAgainstFailure(record.failure_diagnosis, record.selected_recovery_action).ok;
}
function uniqueStable(values) {
    return values.filter((value, index) => value.trim().length > 0 && values.indexOf(value) === index);
}
export function decideWorkRecordRecoveryReentry(record) {
    if (record.status === "blocked") {
        if (!hasBlockerResolutionEvidence(record)) {
            return { status: "stay_blocked", reasonCode: "blocker_resolution_required", targetStatus: "blocked" };
        }
        return {
            status: "resume_planned",
            reasonCode: "blocker_resolved",
            targetStatus: "planned",
            resolutionReceiptId: record.blocker_resolution.receipt_id,
        };
    }
    if (record.status !== "failed" && record.status !== "partial") {
        return { status: "rejected", reasonCode: "recovery_status_required", targetStatus: null };
    }
    const transition = canTransitionWorkRecordStatus(record, "planned");
    if (!transition.ok || !record.selected_recovery_action) {
        return {
            status: "rejected",
            reasonCode: transition.reasonCode ?? "recovery_action_required",
            targetStatus: null,
        };
    }
    return {
        status: "resume_planned",
        reasonCode: "changed_recovery_selected",
        targetStatus: "planned",
        selectedRecoveryAction: structuredClone(record.selected_recovery_action),
    };
}
export function canTransitionWorkRecordStatus(record, nextStatus) {
    if (!isDeclaredWorkRecordStatusTransition(record.status, nextStatus)) {
        return {
            ok: false,
            reasonCode: "transition_not_allowed",
            message: `Work record status cannot transition from ${record.status} to ${nextStatus}.`,
        };
    }
    if ((record.status === "failed" || record.status === "partial") && nextStatus === "planned") {
        if (!record.recovery_candidates?.length || !record.selected_recovery_action) {
            return {
                ok: false,
                reasonCode: "recovery_action_required",
                message: `${record.status} to planned requires recovery candidates and a selected recovery action.`,
            };
        }
        if (!selectedRecoveryActionIsValid(record)) {
            return {
                ok: false,
                reasonCode: "recovery_action_invalid",
                message: `${record.status} to planned requires a valid recoverable failure diagnosis, a selected recovery action from recovery_candidates, and a recovery action that changes the failed input, strategy, tool, delegation target, permission, scope, or validation method.`,
            };
        }
    }
    if (record.status === "blocked" && nextStatus === "planned" && !hasBlockerResolutionEvidence(record)) {
        return {
            ok: false,
            reasonCode: "blocker_resolution_required",
            message: "blocked to planned requires structured unblock evidence.",
        };
    }
    if (record.status === "running" && nextStatus === "partial" && !partialCriteriaMet(record)) {
        return {
            ok: false,
            reasonCode: "partial_criteria_not_met",
            message: "running to partial requires verified achieved work, an unmet failed step, partial sufficiency, a valid recovery candidate, and a matching structured next action.",
        };
    }
    if ((record.status === "running" || record.status === "partial") && nextStatus === "completed" && !completionCriteriaMet(record)) {
        return {
            ok: false,
            reasonCode: "completion_criteria_not_met",
            message: `${record.status} to completed requires completed required steps, sufficient result diagnosis, final_report diagnosis, and final_report action decision.`,
        };
    }
    return { ok: true };
}
export function validateRecoveryCandidateAgainstFailure(failure, candidate) {
    const issues = [];
    validateRecoveryCandidate(candidate, "$", issues);
    if (issues.length > 0)
        return { ok: false, issues };
    const normalizeComparisonText = (value) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
    const changedDescription = normalizeComparisonText(candidate.changed_input_or_strategy);
    const hasChangedDimension = candidate.changed_dimensions.length > 0;
    const repeatsFailedStrategy = changedDescription === normalizeComparisonText(failure.failed_strategy);
    const repeatsFailedInput = failure.failed_input_refs.some((inputRef) => changedDescription === normalizeComparisonText(inputRef));
    if (!hasChangedDimension || repeatsFailedStrategy || repeatsFailedInput) {
        return {
            ok: false,
            issues: [issue("$.changed_dimensions", "Recovery candidate must change input, strategy, tool, delegation target, permission, scope, or validation method.")],
        };
    }
    return { ok: true, value: candidate, issues: [] };
}
export function validateWorkHandoffPackage(value) {
    const issues = [];
    if (!isRecord(value)) {
        return { ok: false, issues: [issue("$", "Work handoff package must be an object.")] };
    }
    for (const field of Object.keys(value)) {
        if (!WORK_HANDOFF_PACKAGE_FIELDS.has(field)) {
            issues.push(issue(`$.${field}`, "Work handoff package contains an unsupported field."));
        }
    }
    if (value.schemaVersion !== WORK_RECORD_SCHEMA_VERSION) {
        issues.push({ path: "$.schemaVersion", code: "unsupported_contract_version", message: "Unsupported work handoff schema version." });
    }
    validateRequiredString(value.handoff_id, "$.handoff_id", issues);
    validateRequiredString(value.work_id, "$.work_id", issues);
    validateRequiredString(value.parent_work_id, "$.parent_work_id", issues);
    if (typeof value.work_id === "string" &&
        typeof value.parent_work_id === "string" &&
        value.work_id.trim().length > 0 &&
        value.parent_work_id.trim().length > 0 &&
        sameString(value.work_id, value.parent_work_id)) {
        issues.push(issue("$.work_id", "handoff work_id must differ from parent_work_id."));
    }
    validateRequiredString(value.parent_step_id, "$.parent_step_id", issues);
    validateRequiredString(value.parent_agent_name, "$.parent_agent_name", issues);
    validateRequiredString(value.target_agent_name, "$.target_agent_name", issues);
    validateUserFacingAgentName(value.parent_agent_name, "$.parent_agent_name", "parent_agent_name must use a user-facing agent name, not an internal ID.", issues);
    validateUserFacingAgentName(value.target_agent_name, "$.target_agent_name", "target_agent_name must use a user-facing agent name, not an internal ID.", issues);
    if (typeof value.parent_agent_name === "string" &&
        typeof value.target_agent_name === "string" &&
        value.parent_agent_name.trim().length > 0 &&
        value.target_agent_name.trim().length > 0 &&
        value.parent_agent_name.trim() === value.target_agent_name.trim()) {
        issues.push(issue("$.target_agent_name", "target_agent_name must differ from parent_agent_name."));
    }
    validateRequiredString(value.task_goal, "$.task_goal", issues);
    validateRequiredString(value.user_request_summary, "$.user_request_summary", issues);
    validateRequestDiagnosis(value.request_diagnosis, "$.request_diagnosis", issues);
    validateStepPlan(value.step_plan, "$.step_plan", issues);
    if (!isRecord(value.current_step)) {
        issues.push(issue("$.current_step", "current_step must be an object."));
    }
    validateStepPlan(Array.isArray(value.current_step) ? value.current_step : [value.current_step], "$.current_step", issues);
    validateStringArray(value.context, "$.context", issues);
    validateStringArray(value.constraints, "$.constraints", issues);
    validateStringArray(value.allowed_tools, "$.allowed_tools", issues);
    validateStringArray(value.disallowed_actions, "$.disallowed_actions", issues);
    validateNonEmptyStringArrayItems(value.context, "$.context", "context items must be non-empty.", issues);
    validateNonEmptyStringArrayItems(value.constraints, "$.constraints", "constraints items must be non-empty.", issues);
    validateUniqueStringArrayItems(value.context, "$.context", "context items must be unique.", issues);
    validateUniqueStringArrayItems(value.constraints, "$.constraints", "constraints items must be unique.", issues);
    validateNonEmptyStringArrayItems(value.allowed_tools, "$.allowed_tools", "allowed_tools items must be non-empty.", issues);
    validateNonEmptyStringArrayItems(value.disallowed_actions, "$.disallowed_actions", "disallowed_actions items must be non-empty.", issues);
    validateUniqueNormalizedStringArrayItems(value.allowed_tools, "$.allowed_tools", "allowed_tools items must be unique after trim and lowercase normalization.", issues);
    validateUniqueNormalizedStringArrayItems(value.disallowed_actions, "$.disallowed_actions", "disallowed_actions items must be unique after trim and lowercase normalization.", issues);
    validateRequiredString(value.expected_output, "$.expected_output", issues);
    validateNonEmptyStringArray(value.quality_criteria, "$.quality_criteria", "quality_criteria must include at least one non-empty item.", issues);
    validateNonEmptyStringArrayItems(value.quality_criteria, "$.quality_criteria", "quality_criteria items must be non-empty.", issues);
    validateUniqueStringArrayItems(value.quality_criteria, "$.quality_criteria", "quality_criteria items must be unique.", issues);
    validateRequiredString(value.validation_method, "$.validation_method", issues);
    validateNonNegativeInteger(value.retry_limit, "$.retry_limit", "retry_limit must be a non-negative integer.", issues);
    validateRequiredString(value.stop_condition, "$.stop_condition", issues);
    validateWorkHandoffFailureRecoveryPolicy(value, issues);
    validateRequiredString(value.deadline_or_budget, "$.deadline_or_budget", issues);
    if (value.memory_visibility !== "explicit_handoff_only") {
        issues.push(issue("$.memory_visibility", "memory_visibility must be explicit_handoff_only."));
    }
    else {
        validateEnum(value.memory_visibility, WORK_HANDOFF_MEMORY_VISIBILITIES, "$.memory_visibility", issues);
    }
    if (value.return_format !== "ChildWorkResult") {
        issues.push(issue("$.return_format", "return_format must be ChildWorkResult."));
    }
    else {
        validateEnum(value.return_format, WORK_HANDOFF_RETURN_FORMATS, "$.return_format", issues);
    }
    if (isRecord(value.current_step) && Array.isArray(value.step_plan)) {
        const plannedStepIds = new Set(value.step_plan.filter(isRecord).map((item) => String(item.step_id ?? "").trim()));
        if (!plannedStepIds.has(String(value.current_step.step_id ?? "").trim())) {
            issues.push(issue("$.current_step.step_id", "current_step.step_id must exist in step_plan."));
        }
    }
    validateWorkHandoffStepReferences(value, issues);
    validateWorkHandoffActionGate(value, issues);
    validateWorkHandoffToolBoundary(value, issues);
    validateHandoffTextBounds(value, issues);
    return issues.length === 0 ? { ok: true, value: value, issues: [] } : { ok: false, issues };
}
export function validateChildWorkResult(value) {
    const issues = [];
    if (!isRecord(value)) {
        return { ok: false, issues: [issue("$", "Child work result must be an object.")] };
    }
    for (const field of Object.keys(value)) {
        if (!CHILD_WORK_RESULT_FIELDS.has(field))
            issues.push(issue(`$.${field}`, "Child work result contains an unsupported field."));
    }
    if (value.schemaVersion !== WORK_RECORD_SCHEMA_VERSION) {
        issues.push({ path: "$.schemaVersion", code: "unsupported_contract_version", message: "Unsupported child work result schema version." });
    }
    validateRequiredString(value.work_id, "$.work_id", issues);
    validateRequiredString(value.agent_name, "$.agent_name", issues);
    validateUserFacingAgentName(value.agent_name, "$.agent_name", "agent_name must use a user-facing agent name, not an internal ID.", issues);
    validateRequiredString(value.task_goal, "$.task_goal", issues);
    validateEnum(value.status, CHILD_WORK_RESULT_STATUSES, "$.status", issues);
    validateStringArray(value.completed_steps, "$.completed_steps", issues);
    validateStringArray(value.failed_steps, "$.failed_steps", issues);
    validateRequiredString(value.summary, "$.summary", issues);
    validateRequiredString(value.result, "$.result", issues);
    validateStringArray(value.evidence, "$.evidence", issues);
    validateStringArray(value.assumptions, "$.assumptions", issues);
    validateStringArray(value.risks, "$.risks", issues);
    validateStringArray(value.missing_information, "$.missing_information", issues);
    validateStringArray(value.actions_taken, "$.actions_taken", issues);
    validateStringArray(value.tools_used, "$.tools_used", issues);
    validateNonEmptyStringArrayItems(value.evidence, "$.evidence", "evidence items must be non-empty.", issues);
    validateNonEmptyStringArrayItems(value.assumptions, "$.assumptions", "assumptions items must be non-empty.", issues);
    validateNonEmptyStringArrayItems(value.risks, "$.risks", "risks items must be non-empty.", issues);
    validateNonEmptyStringArrayItems(value.missing_information, "$.missing_information", "missing_information items must be non-empty.", issues);
    validateNonEmptyStringArrayItems(value.actions_taken, "$.actions_taken", "actions_taken items must be non-empty.", issues);
    validateNonEmptyStringArrayItems(value.tools_used, "$.tools_used", "tools_used items must be non-empty.", issues);
    validateUniqueStringArrayItems(value.evidence, "$.evidence", "evidence items must be unique.", issues);
    validateUniqueStringArrayItems(value.assumptions, "$.assumptions", "assumptions items must be unique.", issues);
    validateUniqueStringArrayItems(value.risks, "$.risks", "risks items must be unique.", issues);
    validateUniqueStringArrayItems(value.missing_information, "$.missing_information", "missing_information items must be unique.", issues);
    validateUniqueStringArrayItems(value.actions_taken, "$.actions_taken", "actions_taken items must be unique.", issues);
    validateUniqueNormalizedStringArrayItems(value.tools_used, "$.tools_used", "tools_used items must be unique after trim and lowercase normalization.", issues);
    validateResultDiagnosis(value.result_diagnosis, "$.result_diagnosis", issues);
    validateActionDecision(value.action_decision, "$.action_decision", issues);
    validateChildResultActionGate(value, issues);
    validateChildResultStatusGate(value, issues);
    validateChildResultStepStatusGate(value, issues);
    validateCompletedChildResultReviewEvidence(value, issues);
    validateFailedChildResultRecoveryBundle(value, issues);
    validatePartialChildResultReviewContext(value, issues);
    validateBlockedChildResultReviewContext(value, issues);
    if (!Object.prototype.hasOwnProperty.call(value, "failure_diagnosis")) {
        issues.push(issue("$.failure_diagnosis", "Child work result must include failure_diagnosis; use null when no failure exists."));
    }
    else if (value.failure_diagnosis !== null) {
        validateFailureDiagnosis(value.failure_diagnosis, "$.failure_diagnosis", issues);
    }
    if (!Array.isArray(value.recovery_attempts)) {
        issues.push(issue("$.recovery_attempts", "Expected array at $.recovery_attempts."));
    }
    else {
        value.recovery_attempts.forEach((candidate, index) => validateRecoveryCandidate(candidate, `$.recovery_attempts[${index}]`, issues));
    }
    validateChildResultRecoveryGate(value, issues);
    validateBoolean(value.needs_parent_review, "$.needs_parent_review", issues);
    validateRequiredString(value.recommended_next_step, "$.recommended_next_step", issues);
    validateChildWorkResultTextBounds(value, issues);
    return issues.length === 0 ? { ok: true, value: value, issues: [] } : { ok: false, issues };
}
export function validateWorkRecordActionGate(value, phase) {
    const validation = validateWorkRecord(value);
    if (!validation.ok)
        return validation;
    const record = validation.value;
    const expectedAction = phase === "request"
        ? record.request_diagnosis.recommended_action
        : record.result_diagnosis.recommended_action;
    if (record.action_decision.selected_action !== expectedAction) {
        return {
            ok: false,
            issues: [issue("$.action_decision.selected_action", `Action decision must match ${phase}_diagnosis.recommended_action.`)],
        };
    }
    return validation;
}
//# sourceMappingURL=work-record.js.map