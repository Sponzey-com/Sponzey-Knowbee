import { validatePromptImprovementRollbackSource, } from "../contracts/prompt-rollback-source-policy.js";
import { REQUIRED_HARNESS_GUARDRAILS, } from "../contracts/harness-guardrails.js";
import { CANONICAL_RECURSIVE_IMPROVEMENT_STATES, CANONICAL_RECURSIVE_IMPROVEMENT_TRANSITIONS, } from "../contracts/recursive-improvement-state-machine.js";
export { PROMPT_ROLLBACK_SOURCE_MANIFEST, PROMPT_ROLLBACK_SOURCE_TYPES, validatePromptImprovementRollbackSource, } from "../contracts/prompt-rollback-source-policy.js";
export const PROMPT_IMPROVEMENT_RECOVERY_CHANGE_AXES = [
    "target",
    "input",
    "tool",
    "work_split",
    "execution_order",
    "verification_method",
];
export const PROMPT_IMPROVEMENT_MUTABLE_SOURCE_KINDS = [
    "versioned_prompt_file",
    "prompt_registry_record",
    "prompt_metadata",
    "prompt_test_fixture",
];
export const PROMPT_IMPROVEMENT_ACCESS_KINDS = [
    "tool",
    "mcp",
    "external_capability",
];
export { REQUIRED_HARNESS_GUARDRAILS };
export const PROMPT_IMPROVEMENT_EXECUTION_CRITERIA = [
    "actor",
    "condition",
    "allowed_behavior",
    "forbidden_behavior",
    "completion_criterion",
];
export const PROMPT_IMPROVEMENT_CRITICAL_RULE_CATEGORIES = [
    "safety",
    "permission",
    "identity",
    "memory",
    "delegation",
    "yeonjang",
];
export function authorizePromptImprovementApprovalScope(input) {
    const record = input.approvalRecord;
    if (!record)
        return { status: "blocked", reasonCode: "approval_record_missing" };
    if (!record.approvalScope.includes(input.requestedScope)) {
        return { status: "blocked", reasonCode: "approval_scope_missing" };
    }
    return { status: "authorized", scope: input.requestedScope, approvedBy: record.approvedBy };
}
const HARNESS_IMPROVEMENT_KINDS = new Set([
    "harness_rule",
    "harness_state_machine",
    "harness_test_fixture",
]);
const PROMPT_SOURCE_IMPROVEMENT_KINDS = new Set([
    "prompt_source",
    "prompt_metadata",
]);
const PROMPT_IMPROVEMENT_KINDS = new Set([
    ...PROMPT_SOURCE_IMPROVEMENT_KINDS,
    ...HARNESS_IMPROVEMENT_KINDS,
]);
const PROMPT_IMPROVEMENT_AGENT_TYPES = new Set(["main", "sub_agent"]);
const EXPLICIT_HARNESS_TRIGGER_SOURCES = new Set([
    "user_request",
    "admin_request",
]);
const PROMPT_IMPROVEMENT_PROPOSAL_RISK_LEVELS = new Set([
    "low",
    "medium",
    "high",
]);
const PROMPT_IMPROVEMENT_HARNESS_RISK_LEVELS = new Set([
    "low",
    "medium",
    "high",
]);
export const PROMPT_IMPROVEMENT_MEDIUM_IMPACT_AXES = [
    "task_processing",
    "delegation_wording",
    "workflow_generation",
    "response_style",
];
export const PROMPT_IMPROVEMENT_HIGH_IMPACT_AXES = [
    "identity",
    "user_data",
    "memory",
    "safety",
    "refusal_behavior",
    "tool",
    "mcp",
    "yeonjang",
    "permission",
    "activation",
    "recursive_improvement",
];
const PROMPT_IMPROVEMENT_RISK_ORDER = {
    low: 0,
    medium: 1,
    high: 2,
};
const BROAD_PROMPT_SOURCE_PATTERNS = [
    /^all$/iu,
    /^all prompts$/iu,
    /^every prompt$/iu,
    /^prompts\/\*$/iu,
    /^모든\s*프롬프트$/u,
];
const BROAD_RESPONSE_STRATEGY_TARGET_PATTERNS = [
    /^all$/iu,
    /^all prompts$/iu,
    /^all response strategies$/iu,
    /^everything$/iu,
    /^general$/iu,
    /^\*$/u,
    /^모든\s*대응$/u,
    /^모든\s*프롬프트$/u,
];
const ACTIVE_HARNESS_VERSION_REF = /^(?:[a-z0-9_./-]+\.md|[a-z0-9_-]+):(?:sha256|version):[^\s:]+$/iu;
const EXACT_HARNESS_SOURCE_REF = /^(?:packages\/core\/src\/memory\/prompt-improvement-harness\.ts|prompts\/prompt_improvement\.md|tests\/[a-z0-9_-]+\.test\.ts)$/iu;
const EXACT_REGRESSION_TEST_REF = /^tests\/[a-z0-9_./-]+\.test\.(?:ts|tsx)$/iu;
const TYPED_ROLLBACK_REF = /\b(?:git|prompt-registry|backup|patch|release):[^\s]+/iu;
export const PROMPT_IMPROVEMENT_INVARIANTS = [
    "identity",
    "delegation",
    "memory_isolation",
    "yeonjang",
    "tool_mcp",
    "safety",
    "user_language",
    "prompt_visibility",
    "recursive_ownership",
    "runtime_environment",
    "harness_integrity",
    "audit",
    "redaction",
    "activation_boundary",
    "rollback",
];
const IMPACT_REQUIRED_INVARIANTS = {
    identity: ["identity"],
    user_data: ["memory_isolation"],
    memory: ["memory_isolation"],
    safety: ["safety"],
    refusal_behavior: ["safety"],
    tool: ["tool_mcp"],
    mcp: ["tool_mcp"],
    yeonjang: ["yeonjang"],
    permission: ["safety"],
    activation: ["activation_boundary", "rollback"],
    recursive_improvement: ["recursive_ownership"],
};
const KNOWN_RESPONSE_STRATEGY_TARGETS = new Set([
    "request_analysis",
    "clarification_question",
    "solution_path_selection",
    "failure_report",
    "next_action_suggestion",
    "delegation_decision",
    "task_intake",
    "workflow",
    "sub_agent_delegation",
    "result_review",
    "final_response",
    "identity",
    "activation_report",
    "audit_record",
]);
function projectCanonicalHarnessTransitions() {
    const projection = Object.fromEntries(CANONICAL_RECURSIVE_IMPROVEMENT_STATES.map((state) => [state, []]));
    for (const transition of CANONICAL_RECURSIVE_IMPROVEMENT_TRANSITIONS) {
        if (!projection[transition.from].includes(transition.to))
            projection[transition.from].push(transition.to);
    }
    return projection;
}
export const PROMPT_IMPROVEMENT_HARNESS_TRANSITIONS = projectCanonicalHarnessTransitions();
const PROMPT_IMPROVEMENT_HARNESS_ROLLBACK_STATES = new Set([
    "apply_change",
    "test_execution",
    "activation_pending",
    "activated",
]);
const PROMPT_IMPROVEMENT_HARNESS_TERMINAL_STATES = new Set([
    "completed",
    "blocked",
    "rolled_back",
]);
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function isNonEmptyStringArray(value) {
    return Array.isArray(value) && value.some((item) => isNonEmptyString(item));
}
function isPromptImprovementImpactAssessment(value) {
    if (!value || typeof value !== "object")
        return false;
    const assessment = value;
    if (assessment.changeKind !== "wording_clarification" && assessment.changeKind !== "behavior_change")
        return false;
    if (!Array.isArray(assessment.impactAxes))
        return false;
    const knownAxes = new Set([
        ...PROMPT_IMPROVEMENT_MEDIUM_IMPACT_AXES,
        ...PROMPT_IMPROVEMENT_HIGH_IMPACT_AXES,
    ]);
    return assessment.impactAxes.every((axis) => knownAxes.has(axis));
}
export function classifyPromptImprovementRisk(assessment) {
    const axes = new Set(assessment.impactAxes);
    if (PROMPT_IMPROVEMENT_HIGH_IMPACT_AXES.some((axis) => axes.has(axis)))
        return "high";
    if (assessment.changeKind === "behavior_change"
        || PROMPT_IMPROVEMENT_MEDIUM_IMPACT_AXES.some((axis) => axes.has(axis)))
        return "medium";
    return "low";
}
export function authorizePromptImprovementApplyPrerequisites(input) {
    const tests = normalizeStringArray(input.tests);
    if (tests.length === 0)
        return { status: "blocked", reasonCode: "apply_tests_missing" };
    const rollbackTarget = input.rollbackTarget.trim();
    if (!rollbackTarget)
        return { status: "blocked", reasonCode: "apply_rollback_target_missing" };
    if (!input.rollbackVerified)
        return { status: "blocked", reasonCode: "apply_rollback_unverified" };
    const explicitApproval = input.approvalMode !== "none" && input.approvalGranted;
    if (input.risk === "high" && input.approvalMode !== "admin_required") {
        return { status: "blocked", reasonCode: "apply_approval_mode_invalid" };
    }
    if (input.risk === "medium" && !explicitApproval) {
        const receipt = input.maintenanceApproval;
        const now = input.now;
        const validMaintenanceApproval = Boolean(receipt
            && receipt.schemaVersion === 1
            && receipt.scope === "apply_change"
            && receipt.decision === "approved"
            && receipt.proposalFingerprint.trim()
            && receipt.proposalFingerprint === input.proposalFingerprint?.trim()
            && receipt.approvedBy.trim()
            && Number.isSafeInteger(receipt.approvedAt)
            && Number.isSafeInteger(receipt.expiresAt)
            && Number.isSafeInteger(now)
            && receipt.approvedAt <= now
            && receipt.expiresAt > now);
        if (!validMaintenanceApproval) {
            return {
                status: "blocked",
                reasonCode: receipt ? "apply_maintenance_approval_invalid" : "apply_approval_missing",
            };
        }
    }
    if (input.risk === "high" && !explicitApproval) {
        return { status: "blocked", reasonCode: "apply_approval_missing" };
    }
    return {
        status: "authorized",
        risk: input.risk,
        tests,
        rollbackTarget,
        approvalMode: input.approvalMode,
    };
}
export async function applyPromptImprovementWithPrerequisites(input) {
    if (input.decision.status !== "authorized")
        return input.decision;
    if (input.rollbackReadiness.status !== "authorized") {
        return { status: "blocked", reasonCode: "apply_rollback_readiness_missing" };
    }
    return { status: "applied", result: await input.apply(input.decision) };
}
function isRiskUnderclassified(declared, required) {
    return PROMPT_IMPROVEMENT_RISK_ORDER[declared] < PROMPT_IMPROVEMENT_RISK_ORDER[required];
}
function includesAll(required, approved) {
    const requiredValues = (required ?? []).filter((item) => isNonEmptyString(item)).map((item) => item.trim());
    const approvedValues = new Set((approved ?? []).filter((item) => isNonEmptyString(item)).map((item) => item.trim()));
    return requiredValues.every((item) => approvedValues.has(item));
}
function addIssue(issues, code, path, message) {
    issues.push({ code, path, message });
}
function isBroadPromptSource(value) {
    const normalized = value.trim();
    return BROAD_PROMPT_SOURCE_PATTERNS.some((pattern) => pattern.test(normalized));
}
function isBroadResponseStrategyTarget(value) {
    const normalized = value.trim();
    return BROAD_RESPONSE_STRATEGY_TARGET_PATTERNS.some((pattern) => pattern.test(normalized));
}
function isKnownOrOwnedResponseStrategyTarget(value, agentOwnedPromptScope) {
    const normalized = value.trim();
    if (KNOWN_RESPONSE_STRATEGY_TARGETS.has(normalized))
        return true;
    return normalizeStringArray(agentOwnedPromptScope).includes(normalized);
}
function promptSourceModuleKey(value) {
    const trimmed = value.trim();
    const withoutLocale = trimmed.includes(":") ? trimmed.split(":")[0] ?? trimmed : trimmed;
    const filename = withoutLocale.split(/[\\/]/u).pop() ?? withoutLocale;
    return filename.replace(/\.md$/iu, "").replace(/-/gu, "_").trim();
}
function isExactPromptSourceRef(value) {
    const trimmed = value.trim();
    return /^prompts\/[a-z0-9_-]+\.md$/iu.test(trimmed) ||
        /^[a-z0-9_]+:(?:ko|en)$/iu.test(trimmed);
}
function promptSourcesWithinAgentOwnedScope(targetPromptSources, agentOwnedPromptScope) {
    const ownedScope = new Set(normalizeStringArray(agentOwnedPromptScope));
    return (targetPromptSources ?? [])
        .filter((source) => isNonEmptyString(source))
        .map((source) => promptSourceModuleKey(source))
        .every((moduleKey) => moduleKey.length > 0 && ownedScope.has(moduleKey));
}
function normalizeStringArray(value) {
    if (!Array.isArray(value))
        return [];
    const normalized = [];
    for (const item of value) {
        if (!isNonEmptyString(item))
            continue;
        const trimmed = item.trim();
        if (!normalized.includes(trimmed))
            normalized.push(trimmed);
    }
    return normalized;
}
function normalizeActivePromptVersions(value) {
    if (!Array.isArray(value))
        return [];
    const normalized = [];
    for (const item of value) {
        if (!item || typeof item !== "object")
            continue;
        const candidate = item;
        if (!isNonEmptyString(candidate.sourceRef) || !isNonEmptyString(candidate.version))
            continue;
        const activeVersion = {
            sourceRef: candidate.sourceRef.trim(),
            version: candidate.version.trim(),
        };
        if (isNonEmptyString(candidate.checksum)) {
            activeVersion.checksum = candidate.checksum.trim();
        }
        normalized.push(activeVersion);
    }
    return normalized;
}
function cloneActivationRecord(record) {
    return {
        state: "activated",
        activePromptVersions: normalizeActivePromptVersions(record.activePromptVersions),
        loadedByProcess: record.loadedByProcess,
        loadedByAgentName: record.loadedByAgentName,
        activatedAt: record.activatedAt,
        activationMethod: record.activationMethod,
        testsBeforeActivation: normalizeStringArray(record.testsBeforeActivation),
        rollbackPath: record.rollbackPath,
    };
}
function isPassingProposalReview(value) {
    if (!value || typeof value !== "object")
        return false;
    const review = value;
    return review.passed === true && isNonEmptyString(review.notes);
}
export const PROMPT_IMPROVEMENT_HARNESS_CHANGE_SCOPES = [
    "entry_conditions",
    "input_schema",
    "state_machine",
    "invariants",
    "approval_policy",
    "test_policy",
    "audit_log",
    "activation",
    "rollback",
];
function missingRequiredHarnessGuardrails(value) {
    const preserved = new Set(normalizeStringArray(value));
    return REQUIRED_HARNESS_GUARDRAILS.filter((guardrail) => !preserved.has(guardrail));
}
function validateClosedStringArray(input) {
    if (!Array.isArray(input.value))
        return;
    const values = input.value.filter(isNonEmptyString).map((value) => value.trim());
    if (values.length !== input.value.length || new Set(values).size !== values.length) {
        addIssue(input.issues, input.duplicateCode, input.path, `${input.label} values must be non-empty and unique.`);
    }
    const supported = new Set(input.supportedValues);
    const unsupported = [...new Set(values.filter((value) => !supported.has(value)))];
    if (unsupported.length > 0) {
        addIssue(input.issues, input.invalidCode, input.path, `${input.label} contains unsupported values: ${unsupported.join(", ")}.`);
    }
}
function validateHarnessChangeScope(value, issues, path) {
    validateClosedStringArray({
        value,
        supportedValues: PROMPT_IMPROVEMENT_HARNESS_CHANGE_SCOPES,
        issues,
        path,
        invalidCode: "harness_change_scope_invalid",
        duplicateCode: "harness_change_scope_duplicate",
        label: "Harness change scope",
    });
}
function validateHarnessGuardrails(value, issues, path) {
    validateClosedStringArray({
        value,
        supportedValues: REQUIRED_HARNESS_GUARDRAILS,
        issues,
        path,
        invalidCode: "harness_guardrail_invalid",
        duplicateCode: "harness_guardrail_duplicate",
        label: "Harness guardrail",
    });
}
function sameStringSet(left, right) {
    const leftValues = normalizeStringArray(left);
    const rightValues = normalizeStringArray(right);
    return leftValues.length === rightValues.length && leftValues.every((value) => rightValues.includes(value));
}
function validateNonGoals(value, conflicts, issues, path) {
    if (!Array.isArray(value))
        return;
    const values = value.filter(isNonEmptyString).map((item) => item.trim());
    if (values.length !== value.length || new Set(values).size !== values.length) {
        addIssue(issues, "non_goal_duplicate", path, "Non-goals must be non-empty and unique.");
    }
    if (values.some((item) => /^(?:none|n\/a|anything|everything|없음|모두)$/iu.test(item))) {
        addIssue(issues, "non_goal_invalid", path, "Non-goals must name a concrete behavior or source that will not change.");
    }
    const normalizedConflicts = new Set(conflicts.filter(isNonEmptyString).map((item) => item.trim().toLocaleLowerCase()));
    if (values.some((item) => normalizedConflicts.has(item.toLocaleLowerCase()))) {
        addIssue(issues, "non_goal_conflict", path, "A declared non-goal cannot also be a requested goal, target, or allowed change source.");
    }
}
function validateAllowedChangeScope(value, targetSources, issues, path) {
    if (!Array.isArray(value))
        return;
    const values = value.filter(isNonEmptyString).map((item) => item.trim());
    if (values.length !== value.length || new Set(values).size !== values.length) {
        addIssue(issues, "allowed_change_scope_duplicate", path, "Allowed change scope values must be non-empty and unique.");
    }
    if (values.some((item) => !isExactPromptSourceRef(item) && !EXACT_HARNESS_SOURCE_REF.test(item))) {
        addIssue(issues, "allowed_change_scope_invalid", path, "Allowed change scope must contain exact prompt or harness source references.");
    }
    const targets = normalizeStringArray(targetSources);
    if (targets.some((target) => !values.includes(target))) {
        addIssue(issues, "target_prompt_source_outside_allowed_scope", "targetPromptSources", "Every target source must be included in allowedChangeScope.");
    }
}
function requiredInvariantSet(input) {
    const required = new Set();
    for (const axis of input.impactAssessment?.impactAxes ?? []) {
        for (const invariant of IMPACT_REQUIRED_INVARIANTS[axis] ?? [])
            required.add(invariant);
    }
    if (input.improvementKind && isHarnessImprovementKind(input.improvementKind)) {
        for (const invariant of ["harness_integrity", "audit", "activation_boundary", "rollback"])
            required.add(invariant);
    }
    return required;
}
function validateRequiredInvariants(input) {
    validateClosedStringArray({
        value: input.value,
        supportedValues: PROMPT_IMPROVEMENT_INVARIANTS,
        issues: input.issues,
        path: input.path,
        invalidCode: "required_invariant_invalid",
        duplicateCode: "required_invariant_duplicate",
        label: "Required invariant",
    });
    const present = new Set(normalizeStringArray(input.value));
    const missing = [...requiredInvariantSet(input)].filter((invariant) => !present.has(invariant));
    if (missing.length > 0) {
        addIssue(input.issues, "required_invariant_missing", input.path, `Required invariants are missing for the declared change impact: ${missing.join(", ")}.`);
    }
}
function validateRegressionTests(value, issues, path) {
    if (!Array.isArray(value))
        return;
    const tests = value.filter(isNonEmptyString).map((item) => item.trim());
    if (tests.length !== value.length || new Set(tests).size !== tests.length) {
        addIssue(issues, "required_test_duplicate", path, "Regression test references must be non-empty and unique.");
    }
    if (tests.some((testRef) => !EXACT_REGRESSION_TEST_REF.test(testRef))) {
        addIssue(issues, "required_test_invalid", path, "Regression tests must use exact tests/<name>.test.ts or .tsx references.");
    }
}
const APPROVAL_MODE_STRENGTH = {
    none: 0,
    user_required: 1,
    admin_required: 2,
};
function minimumApprovalMode(risk) {
    if (risk === "high")
        return "admin_required";
    if (risk === "medium")
        return "user_required";
    return "none";
}
function validateApprovalModeForRisk(approvalMode, risk, issues, path) {
    if (!approvalMode)
        return;
    const required = minimumApprovalMode(risk);
    if (APPROVAL_MODE_STRENGTH[approvalMode] < APPROVAL_MODE_STRENGTH[required]) {
        addIssue(issues, "approval_mode_risk_mismatch", path, `${risk} risk requires ${required} approval mode or stronger.`);
    }
}
function validateRollbackPlan(value, targetSources, issues, path) {
    if (!isNonEmptyString(value))
        return;
    const plan = value.trim();
    const hasAction = /\b(?:restore|revert|rollback|복구|되돌)/iu.test(plan);
    const hasExactTarget = normalizeStringArray(targetSources).some((target) => plan.includes(target));
    const typedRef = (plan.match(TYPED_ROLLBACK_REF)?.[0] ?? "").replace(/[.,;!?]+$/u, "");
    const staleOrCurrentAlias = /^(?:git:)?(?:head|latest|current)$/iu.test(typedRef);
    if (!hasAction || (!hasExactTarget && !typedRef) || staleOrCurrentAlias) {
        addIssue(issues, "rollback_plan_invalid", path, "Rollback plan must name a restore action and an exact target source or typed previous-version reference.");
    }
}
export function isHarnessImprovementKind(kind) {
    return HARNESS_IMPROVEMENT_KINDS.has(kind);
}
export function validatePromptImprovementProposal(proposal) {
    const issues = [];
    const requiredStrings = [
        "problem",
        "rootCause",
        "proposedChangeSummary",
        "expectedBehaviorAfterChange",
        "rollbackPlan",
    ];
    for (const field of requiredStrings) {
        if (!isNonEmptyString(proposal[field])) {
            addIssue(issues, "proposal_field_missing", String(field), `${String(field)} is required.`);
        }
    }
    const requiredArrays = [
        "targetFiles",
        "nonGoals",
        "invariantsChecked",
        "testsToRun",
    ];
    for (const field of requiredArrays) {
        if (!isNonEmptyStringArray(proposal[field])) {
            addIssue(issues, "proposal_field_missing", String(field), `${String(field)} is required.`);
        }
    }
    validateNonGoals(proposal.nonGoals, [proposal.problem, proposal.proposedChangeSummary, proposal.expectedBehaviorAfterChange, ...(proposal.targetFiles ?? [])], issues, "nonGoals");
    validateRequiredInvariants({
        value: proposal.invariantsChecked,
        ...(proposal.improvementKind ? { improvementKind: proposal.improvementKind } : {}),
        ...(isPromptImprovementImpactAssessment(proposal.impactAssessment)
            ? { impactAssessment: proposal.impactAssessment }
            : {}),
        issues,
        path: "invariantsChecked",
    });
    validateRegressionTests(proposal.testsToRun, issues, "testsToRun");
    validateRollbackPlan(proposal.rollbackPlan, proposal.targetFiles, issues, "rollbackPlan");
    if (!proposal.improvementKind) {
        addIssue(issues, "proposal_field_missing", "improvementKind", "improvementKind is required.");
    }
    if (!proposal.riskLevel || !PROMPT_IMPROVEMENT_PROPOSAL_RISK_LEVELS.has(proposal.riskLevel)) {
        addIssue(issues, "proposal_invalid_risk", "riskLevel", "riskLevel must be low, medium, or high.");
    }
    if (!isPromptImprovementImpactAssessment(proposal.impactAssessment)) {
        addIssue(issues, "proposal_impact_assessment_missing", "impactAssessment", "Prompt improvement proposals require a typed impact assessment.");
    }
    else if (proposal.riskLevel
        && PROMPT_IMPROVEMENT_PROPOSAL_RISK_LEVELS.has(proposal.riskLevel)
        && isRiskUnderclassified(proposal.riskLevel, classifyPromptImprovementRisk(proposal.impactAssessment))) {
        addIssue(issues, "proposal_risk_underclassified", "riskLevel", `Declared risk ${proposal.riskLevel} is below the assessed impact risk ${classifyPromptImprovementRisk(proposal.impactAssessment)}.`);
    }
    if ((proposal.riskLevel === "medium" || proposal.riskLevel === "high") &&
        proposal.approvalRequired !== true) {
        addIssue(issues, "proposal_approval_required", "approvalRequired", "Medium-risk and high-risk prompt improvement proposals require approval.");
    }
    if (proposal.improvementKind &&
        PROMPT_SOURCE_IMPROVEMENT_KINDS.has(proposal.improvementKind) &&
        Array.isArray(proposal.targetFiles)) {
        for (const [index, targetFile] of proposal.targetFiles.entries()) {
            if (isNonEmptyString(targetFile) && !isExactPromptSourceRef(targetFile)) {
                addIssue(issues, "proposal_target_file_invalid_ref", `targetFiles.${index}`, "Prompt source proposals must target prompts/<source>.md or <source_id>:<locale>.");
            }
        }
    }
    for (const field of ["clarityReview", "brevityReview", "moduleBoundaryReview"]) {
        if (!isPassingProposalReview(proposal[field])) {
            addIssue(issues, "proposal_review_failed", field, `${field} must pass with review notes.`);
        }
    }
    const moduleReview = proposal.moduleBoundaryReview;
    if (!isNonEmptyString(moduleReview?.canonicalModuleId)) {
        addIssue(issues, "proposal_review_failed", "moduleBoundaryReview.canonicalModuleId", "moduleBoundaryReview requires one canonical module owner.");
    }
    if (!isNonEmptyStringArray(moduleReview?.responsibilityIds)) {
        addIssue(issues, "proposal_review_failed", "moduleBoundaryReview.responsibilityIds", "moduleBoundaryReview requires the owned responsibilities checked by the review.");
    }
    if (isNonEmptyStringArray(moduleReview?.overlappingRuleKeys)) {
        addIssue(issues, "proposal_review_failed", "moduleBoundaryReview.overlappingRuleKeys", "moduleBoundaryReview must not report rules defined by another canonical module.");
    }
    const harnessProposal = proposal.improvementKind ? isHarnessImprovementKind(proposal.improvementKind) : false;
    if (harnessProposal) {
        if (proposal.riskLevel !== "high") {
            addIssue(issues, "proposal_harness_high_risk_required", "riskLevel", "Harness improvement proposals must be classified as high risk.");
        }
        if (!isNonEmptyStringArray(proposal.harnessChangeScope)) {
            addIssue(issues, "proposal_harness_scope_missing", "harnessChangeScope", "Harness improvement proposals require a harness change scope.");
        }
        validateHarnessChangeScope(proposal.harnessChangeScope, issues, "harnessChangeScope");
        validateHarnessGuardrails(proposal.harnessGuardrailsToPreserve, issues, "harnessGuardrailsToPreserve");
        const missingGuardrails = missingRequiredHarnessGuardrails(proposal.harnessGuardrailsToPreserve);
        if (missingGuardrails.length > 0) {
            addIssue(issues, "proposal_harness_guardrail_missing", "harnessGuardrailsToPreserve", `Harness improvement proposals must preserve every required guardrail: ${missingGuardrails.join(", ")}.`);
        }
    }
    return {
        ok: issues.length === 0,
        issues,
    };
}
export async function writeValidatedPromptImprovementProposal(input) {
    const harnessValidation = validatePromptImprovementHarnessInput(input.harnessInput);
    if (!harnessValidation.ok) {
        return {
            status: "blocked",
            issues: [
                {
                    code: "proposal_input_record_invalid",
                    path: "harnessInput",
                    message: "A complete validated prompt improvement input record is required before proposal write.",
                },
                ...harnessValidation.issues,
            ],
        };
    }
    const validation = validatePromptImprovementProposal(input.proposal);
    if (!validation.ok)
        return { status: "blocked", issues: validation.issues };
    const proposal = input.proposal;
    const inputTargets = normalizeStringArray(input.harnessInput.targetPromptSources);
    const proposalTargets = normalizeStringArray(proposal.targetFiles);
    if (inputTargets.length !== proposalTargets.length
        || inputTargets.some((target) => !proposalTargets.includes(target))) {
        return {
            status: "blocked",
            issues: [{
                    code: "proposal_input_scope_mismatch",
                    path: "targetFiles",
                    message: "Proposal targets must exactly match the validated input record targetPromptSources.",
                }],
        };
    }
    if (!sameStringSet(input.harnessInput.nonGoals, proposal.nonGoals)) {
        return {
            status: "blocked",
            issues: [{
                    code: "proposal_input_non_goals_mismatch",
                    path: "nonGoals",
                    message: "Proposal non-goals must exactly match the validated input record.",
                }],
        };
    }
    if (!includesAll(input.harnessInput.requiredInvariants, proposal.invariantsChecked)) {
        return {
            status: "blocked",
            issues: [{
                    code: "proposal_input_invariants_mismatch",
                    path: "invariantsChecked",
                    message: "Proposal invariant checks must include every invariant required by the validated input record.",
                }],
        };
    }
    if (!includesAll(input.harnessInput.requiredTests, proposal.testsToRun)) {
        return {
            status: "blocked",
            issues: [{
                    code: "proposal_input_tests_mismatch",
                    path: "testsToRun",
                    message: "Proposal tests must include every regression test required by the validated input record.",
                }],
        };
    }
    return {
        status: "written",
        result: await input.write(proposal),
    };
}
export function validatePromptImprovementDiffAssessment(assessment) {
    const issues = [];
    if (!isNonEmptyStringArray(assessment.targetFiles)) {
        addIssue(issues, "diff_target_missing", "targetFiles", "Diff assessment requires exact target files.");
    }
    if (!isNonEmptyStringArray(assessment.changedSections)) {
        addIssue(issues, "diff_target_missing", "changedSections", "Diff assessment requires changed sections.");
    }
    if (!Number.isSafeInteger(assessment.changedLineCount)
        || !Number.isSafeInteger(assessment.maxReviewableLineCount)
        || (assessment.changedLineCount ?? 0) <= 0
        || (assessment.maxReviewableLineCount ?? 0) <= 0) {
        addIssue(issues, "diff_reviewability_invalid", "changedLineCount", "Diff assessment requires positive integer changed-line and reviewability limits.");
    }
    else if (assessment.changedLineCount > assessment.maxReviewableLineCount) {
        addIssue(issues, "diff_too_large", "changedLineCount", "Diff exceeds the explicit reviewable line limit.");
    }
    const broadRewriteNote = assessment.broadRewriteArchitectureNoteReceipt;
    const hasCompleteBroadRewriteNote = Boolean(broadRewriteNote
        && isNonEmptyString(broadRewriteNote.artifactRef)
        && isNonEmptyString(broadRewriteNote.smallDiffInsufficiencyRationale)
        && isNonEmptyString(broadRewriteNote.reviewedBy));
    if (assessment.broadRewrite === true
        && !hasCompleteBroadRewriteNote) {
        addIssue(issues, "diff_broad_rewrite_note_missing", broadRewriteNote ? "broadRewriteArchitectureNoteReceipt" : "broadRewriteArchitectureNote", "Broad prompt rewrites require a separate architecture note.");
    }
    if (assessment.unrelatedSectionsRewritten === true) {
        addIssue(issues, "diff_unrelated_rewrite", "unrelatedSectionsRewritten", "Diff rewrites unrelated prompt sections.");
    }
    if (isNonEmptyStringArray(assessment.outsideTargetModuleRules)) {
        addIssue(issues, "diff_outside_module", "outsideTargetModuleRules", "Diff adds rules outside the target module.");
    }
    if (isNonEmptyStringArray(assessment.duplicatedCanonicalRules)) {
        addIssue(issues, "diff_duplicate_rule", "duplicatedCanonicalRules", "Diff duplicates canonical prompt rules.");
    }
    if (isNonEmptyStringArray(assessment.copiedRulesWithoutReferences)) {
        addIssue(issues, "diff_copied_rule_without_reference", "copiedRulesWithoutReferences", "Diff copies another module rule body instead of using a canonical reference.");
    }
    if (isNonEmptyStringArray(assessment.multiFileRuleDefinitions)) {
        addIssue(issues, "diff_multi_file_rule_definition", "multiFileRuleDefinitions", "Diff defines one canonical rule in more than one prompt file.");
    }
    if (Array.isArray(assessment.weakensCriticalRules) && assessment.weakensCriticalRules.length > 0) {
        addIssue(issues, "diff_critical_rule_weakening", "weakensCriticalRules", "Diff weakens safety, permission, identity, memory, delegation, Yeonjang, approval, audit, rollback, activation, or stop-condition rules.");
    }
    if (assessment.broadensToolMcpOrExternalAccess === true
        || (Array.isArray(assessment.broadenedAccess) && assessment.broadenedAccess.length > 0)) {
        addIssue(issues, "diff_access_broadened", Array.isArray(assessment.broadenedAccess) && assessment.broadenedAccess.length > 0
            ? "broadenedAccess"
            : "broadensToolMcpOrExternalAccess", "Diff broadens tool, MCP, or external feature connection access.");
    }
    if (assessment.removesApprovalRequirements === true
        || isNonEmptyStringArray(assessment.removedApprovalRuleKeys)) {
        addIssue(issues, "diff_approval_removed", isNonEmptyStringArray(assessment.removedApprovalRuleKeys)
            ? "removedApprovalRuleKeys"
            : "removesApprovalRequirements", "Diff removes approval requirements.");
    }
    if (assessment.removesStopConditions === true
        || isNonEmptyStringArray(assessment.removedStopConditionRuleKeys)) {
        addIssue(issues, "diff_stop_condition_removed", isNonEmptyStringArray(assessment.removedStopConditionRuleKeys)
            ? "removedStopConditionRuleKeys"
            : "removesStopConditions", "Diff removes stop conditions.");
    }
    if (isNonEmptyStringArray(assessment.weakensHarnessGuardrails)
        || (Array.isArray(assessment.removedHarnessGuardrails) && assessment.removedHarnessGuardrails.length > 0)) {
        addIssue(issues, "diff_harness_guardrail_weakening", Array.isArray(assessment.removedHarnessGuardrails) && assessment.removedHarnessGuardrails.length > 0
            ? "removedHarnessGuardrails"
            : "weakensHarnessGuardrails", "Diff weakens harness guardrails.");
    }
    if (assessment.appliesChangedHarnessToCurrentRun === true
        || (Array.isArray(assessment.currentRunHarnessApplications) && assessment.currentRunHarnessApplications.length > 0)) {
        addIssue(issues, "diff_current_run_harness_application", Array.isArray(assessment.currentRunHarnessApplications) && assessment.currentRunHarnessApplications.length > 0
            ? "currentRunHarnessApplications"
            : "appliesChangedHarnessToCurrentRun", "Diff applies a changed harness to the current run before validation, approval, and activation.");
    }
    if (assessment.appliesChangedPromptToCurrentRun === true) {
        addIssue(issues, "diff_current_run_prompt_application", "appliesChangedPromptToCurrentRun", "Diff applies a changed prompt to the current run before validation, approval, and next-run activation.");
    }
    if (isNonEmptyStringArray(assessment.ambiguousWording)
        || (Array.isArray(assessment.ambiguousWordingEvidence) && assessment.ambiguousWordingEvidence.length > 0)) {
        addIssue(issues, "diff_ambiguous_wording", Array.isArray(assessment.ambiguousWordingEvidence) && assessment.ambiguousWordingEvidence.length > 0
            ? "ambiguousWordingEvidence"
            : "ambiguousWording", "Diff introduces ambiguous or unverifiable wording.");
    }
    if (Array.isArray(assessment.unverifiableWordingEvidence)
        && assessment.unverifiableWordingEvidence.length > 0) {
        addIssue(issues, "diff_unverifiable_wording", "unverifiableWordingEvidence", "Diff introduces wording without an explicit verification criterion.");
    }
    if (isNonEmptyStringArray(assessment.missingExecutionCriteria)
        || (Array.isArray(assessment.missingExecutionCriterionEvidence)
            && assessment.missingExecutionCriterionEvidence.length > 0)) {
        addIssue(issues, "diff_execution_criteria_missing", Array.isArray(assessment.missingExecutionCriterionEvidence)
            && assessment.missingExecutionCriterionEvidence.length > 0
            ? "missingExecutionCriterionEvidence"
            : "missingExecutionCriteria", "Diff omits actor, condition, allowed behavior, forbidden behavior, or completion criteria.");
    }
    if (isNonEmptyStringArray(assessment.repetitiveRules)
        || (Array.isArray(assessment.repeatedRuleEvidence) && assessment.repeatedRuleEvidence.length > 0)) {
        addIssue(issues, "diff_repetitive_rule", Array.isArray(assessment.repeatedRuleEvidence) && assessment.repeatedRuleEvidence.length > 0
            ? "repeatedRuleEvidence"
            : "repetitiveRules", "Diff repeats existing rules.");
    }
    if (isNonEmptyStringArray(assessment.overloadedRuleSentences)
        || (Array.isArray(assessment.overloadedRuleSentenceEvidence)
            && assessment.overloadedRuleSentenceEvidence.length > 0)) {
        addIssue(issues, "diff_overloaded_rule_sentence", Array.isArray(assessment.overloadedRuleSentenceEvidence)
            && assessment.overloadedRuleSentenceEvidence.length > 0
            ? "overloadedRuleSentenceEvidence"
            : "overloadedRuleSentences", "Diff overloads one sentence with multiple rules.");
    }
    if (assessment.addsNonEnglishSystemInstructions === true
        || (Array.isArray(assessment.nonEnglishSystemInstructionEvidence)
            && assessment.nonEnglishSystemInstructionEvidence.length > 0)) {
        addIssue(issues, "diff_non_english_system_instruction", Array.isArray(assessment.nonEnglishSystemInstructionEvidence)
            && assessment.nonEnglishSystemInstructionEvidence.length > 0
            ? "nonEnglishSystemInstructionEvidence"
            : "addsNonEnglishSystemInstructions", "Diff adds non-English operating instructions to system prompt sources.");
    }
    if (assessment.weakensUserLanguageRule === true
        || (Array.isArray(assessment.userLanguageRuleWeakeningEvidence)
            && assessment.userLanguageRuleWeakeningEvidence.length > 0)) {
        addIssue(issues, "diff_user_language_rule_weakened", Array.isArray(assessment.userLanguageRuleWeakeningEvidence)
            && assessment.userLanguageRuleWeakeningEvidence.length > 0
            ? "userLanguageRuleWeakeningEvidence"
            : "weakensUserLanguageRule", "Diff weakens the user-language response rule.");
    }
    if (assessment.weakensFinalResponseLlmBoundary === true) {
        addIssue(issues, "diff_final_response_llm_boundary_weakened", "weakensFinalResponseLlmBoundary", "Diff allows user-facing text to bypass LLM final-response review.");
    }
    if (isNonEmptyStringArray(assessment.conflictsWithPromptSources)
        || (Array.isArray(assessment.promptSourceConflictEvidence)
            && assessment.promptSourceConflictEvidence.length > 0)) {
        addIssue(issues, "diff_prompt_source_conflict", Array.isArray(assessment.promptSourceConflictEvidence)
            && assessment.promptSourceConflictEvidence.length > 0
            ? "promptSourceConflictEvidence"
            : "conflictsWithPromptSources", "Diff conflicts with other prompt sources.");
    }
    if (isNonEmptyStringArray(assessment.duplicatedAssemblyDefinitions)
        || (Array.isArray(assessment.assemblyDuplicateDefinitionEvidence)
            && assessment.assemblyDuplicateDefinitionEvidence.length > 0)) {
        addIssue(issues, "diff_assembly_definition_duplicate", Array.isArray(assessment.assemblyDuplicateDefinitionEvidence)
            && assessment.assemblyDuplicateDefinitionEvidence.length > 0
            ? "assemblyDuplicateDefinitionEvidence"
            : "duplicatedAssemblyDefinitions", "Diff duplicates definitions in prompt assembly.");
    }
    const hasMissingNameTests = Array.isArray(assessment.defaultAgentNameChangeEvidence)
        && assessment.defaultAgentNameChangeEvidence.some((change) => {
            const updated = new Set(change.updatedTestIds);
            return change.requiredTestIds.some((testId) => !updated.has(testId));
        });
    if ((assessment.changesDefaultAgentNames === true && assessment.nameTestsUpdated !== true)
        || hasMissingNameTests) {
        addIssue(issues, "diff_agent_name_tests_missing", hasMissingNameTests ? "defaultAgentNameChangeEvidence" : "nameTestsUpdated", "Default agent name changes require updated name-related tests.");
    }
    if (assessment.impliesRuntimeActivation === true
        || (Array.isArray(assessment.impliedRuntimeActivationEvidence)
            && assessment.impliedRuntimeActivationEvidence.length > 0)) {
        addIssue(issues, "diff_activation_implied", Array.isArray(assessment.impliedRuntimeActivationEvidence)
            && assessment.impliedRuntimeActivationEvidence.length > 0
            ? "impliedRuntimeActivationEvidence"
            : "impliesRuntimeActivation", "Diff implies runtime activation without activation confirmation.");
    }
    if (assessment.removesAuditOrRollback === true
        || (Array.isArray(assessment.removedAuditRollbackProtectionEvidence)
            && assessment.removedAuditRollbackProtectionEvidence.length > 0)) {
        addIssue(issues, "diff_audit_rollback_removed", Array.isArray(assessment.removedAuditRollbackProtectionEvidence)
            && assessment.removedAuditRollbackProtectionEvidence.length > 0
            ? "removedAuditRollbackProtectionEvidence"
            : "removesAuditOrRollback", "Diff removes audit or rollback requirements.");
    }
    return {
        ok: issues.length === 0,
        issues,
    };
}
export async function writeApprovedReviewablePromptDiff(input) {
    if (input.approvalDecision.status !== "authorized")
        return input.approvalDecision;
    const validation = validatePromptImprovementDiffAssessment(input.diffAssessment);
    if (!validation.ok)
        return { status: "blocked", issues: validation.issues };
    return {
        status: "written",
        result: await input.write(input.diffAssessment),
    };
}
export function evaluatePromptImprovementRollbackRequirement(input) {
    if (input.sourceWriteState !== "written") {
        const sourceValidation = input.rollbackSource
            ? validatePromptImprovementRollbackSource(input.rollbackSource, "rollbackSource")
            : { ok: true, issues: [] };
        return {
            rollbackRequired: false,
            reasons: [],
            rollbackSourceValid: sourceValidation.ok,
            issues: sourceValidation.issues,
            nextState: "blocked",
        };
    }
    const reasons = [];
    if (isNonEmptyStringArray(input.testsFailed))
        reasons.push("tests_failed_after_write");
    if (isNonEmptyStringArray(input.invariantViolations))
        reasons.push("invariant_violation_after_apply");
    if (input.activationVersionMismatch)
        reasons.push("wrong_prompt_version_activated");
    if (isNonEmptyString(input.rollbackRequestedBy))
        reasons.push("user_or_admin_requested");
    if (input.changedSourceHealth !== "ok")
        reasons.push("changed_source_missing_corrupt_or_unsafe");
    const rollbackRequired = reasons.length > 0;
    const sourceValidation = rollbackRequired
        ? validatePromptImprovementRollbackSource(input.rollbackSource ?? {}, "rollbackSource")
        : { ok: true, issues: [] };
    return {
        rollbackRequired,
        reasons,
        rollbackSourceValid: sourceValidation.ok,
        issues: sourceValidation.issues,
        nextState: rollbackRequired && sourceValidation.ok ? "rollback_required" : "blocked",
    };
}
export function validatePromptImprovementHarnessInput(input) {
    const issues = [];
    const requiredStrings = [
        "improvementGoal",
        "improvingAgentName",
        "activeHarnessVersion",
        "currentBehavior",
        "desiredBehavior",
        "responseStrategyTarget",
        "rollbackPlan",
    ];
    for (const field of requiredStrings) {
        if (!isNonEmptyString(input[field])) {
            addIssue(issues, "required_field_missing", String(field), `${String(field)} is required.`);
        }
    }
    if (isNonEmptyString(input.improvementGoal)) {
        const goal = input.improvementGoal.trim();
        const multipleLines = goal.split(/\r?\n/u).filter((line) => line.trim()).length > 1;
        const listLike = /(?:^|\s)(?:[-*]|\d+[.)])\s+/u.test(goal);
        const broadOnly = /^(?:improve|update|fix|review|개선|수정|검토)(?:\s+(?:prompt|prompts|프롬프트))?[.!]?$/iu.test(goal);
        if (goal.length < 12 || goal.length > 240 || multipleLines || listLike || broadOnly) {
            addIssue(issues, "improvement_goal_not_specific", "improvementGoal", "improvementGoal must be one concrete sentence between 12 and 240 characters.");
        }
    }
    if (isNonEmptyString(input.improvingAgentName)) {
        const agentName = input.improvingAgentName.trim();
        if (agentName.length > 100 || /^(?:agent|user|system):/iu.test(agentName)) {
            addIssue(issues, "improving_agent_name_invalid", "improvingAgentName", "improvingAgentName must be a user-facing agent name, not an internal identifier.");
        }
    }
    if (isNonEmptyString(input.activeHarnessVersion)
        && !ACTIVE_HARNESS_VERSION_REF.test(input.activeHarnessVersion.trim())) {
        addIssue(issues, "active_harness_version_invalid", "activeHarnessVersion", "activeHarnessVersion must identify a harness source with a sha256 or version value.");
    }
    const requiredArrays = [
        "agentOwnedPromptScope",
        "userReactionEvidence",
        "nonGoals",
        "allowedChangeScope",
        "requiredInvariants",
        "requiredTests",
    ];
    for (const field of requiredArrays) {
        if (!isNonEmptyStringArray(input[field])) {
            addIssue(issues, "required_field_missing", String(field), `${String(field)} is required.`);
        }
    }
    const allTargetSources = [
        ...normalizeStringArray(input.targetPromptSources),
        ...normalizeStringArray(input.targetHarnessSources),
    ];
    validateNonGoals(input.nonGoals, [input.improvementGoal, input.desiredBehavior, ...allTargetSources], issues, "nonGoals");
    validateAllowedChangeScope(input.allowedChangeScope, allTargetSources, issues, "allowedChangeScope");
    validateRequiredInvariants({
        value: input.requiredInvariants,
        ...(input.improvementKind ? { improvementKind: input.improvementKind } : {}),
        ...(isPromptImprovementImpactAssessment(input.impactAssessment)
            ? { impactAssessment: input.impactAssessment }
            : {}),
        issues,
        path: "requiredInvariants",
    });
    validateRegressionTests(input.requiredTests, issues, "requiredTests");
    validateRollbackPlan(input.rollbackPlan, allTargetSources, issues, "rollbackPlan");
    if (isNonEmptyString(input.responseStrategyTarget)) {
        const responseStrategyTarget = input.responseStrategyTarget.trim();
        if (isBroadResponseStrategyTarget(responseStrategyTarget)) {
            addIssue(issues, "response_strategy_target_too_broad", "responseStrategyTarget", "responseStrategyTarget must identify one exact response strategy or owned prompt module.");
        }
        else if (!isKnownOrOwnedResponseStrategyTarget(responseStrategyTarget, input.agentOwnedPromptScope)) {
            addIssue(issues, "response_strategy_target_not_owned", "responseStrategyTarget", "responseStrategyTarget must be a known response strategy target or part of agentOwnedPromptScope.");
        }
    }
    const kind = input.improvementKind;
    const harnessChange = kind ? isHarnessImprovementKind(kind) : false;
    if (input.riskLevel !== undefined &&
        !PROMPT_IMPROVEMENT_HARNESS_RISK_LEVELS.has(input.riskLevel)) {
        addIssue(issues, "proposal_invalid_risk", "riskLevel", "riskLevel must be low, medium, or high.");
    }
    const requestedRisk = PROMPT_IMPROVEMENT_HARNESS_RISK_LEVELS.has(input.riskLevel)
        ? input.riskLevel
        : undefined;
    const assessedRisk = isPromptImprovementImpactAssessment(input.impactAssessment)
        ? classifyPromptImprovementRisk(input.impactAssessment)
        : undefined;
    if (!harnessChange && requestedRisk === "low" && !assessedRisk) {
        addIssue(issues, "proposal_impact_assessment_missing", "impactAssessment", "Low-risk prompt improvements require a typed impact assessment proving wording-only scope.");
    }
    if (!harnessChange && requestedRisk && assessedRisk && isRiskUnderclassified(requestedRisk, assessedRisk)) {
        addIssue(issues, "proposal_risk_underclassified", "riskLevel", `Declared risk ${requestedRisk} is below the assessed impact risk ${assessedRisk}.`);
    }
    const risk = harnessChange
        ? "high"
        : assessedRisk && (!requestedRisk || isRiskUnderclassified(requestedRisk, assessedRisk))
            ? assessedRisk
            : requestedRisk ?? "medium";
    validateApprovalModeForRisk(input.approvalMode, risk, issues, "approvalMode");
    if (!kind) {
        addIssue(issues, "required_field_missing", "improvementKind", "improvementKind is required.");
    }
    else if (!PROMPT_IMPROVEMENT_KINDS.has(kind)) {
        addIssue(issues, "improvement_kind_invalid", "improvementKind", "improvementKind is unsupported.");
    }
    if (!input.improvingAgentType) {
        addIssue(issues, "required_field_missing", "improvingAgentType", "improvingAgentType is required.");
    }
    else if (!PROMPT_IMPROVEMENT_AGENT_TYPES.has(input.improvingAgentType)) {
        addIssue(issues, "improving_agent_type_invalid", "improvingAgentType", "improvingAgentType must be main or sub_agent.");
    }
    if (!input.triggerSource) {
        addIssue(issues, "required_field_missing", "triggerSource", "triggerSource is required.");
    }
    if (!input.approvalMode) {
        addIssue(issues, "required_field_missing", "approvalMode", "approvalMode is required.");
    }
    if (input.improvingAgentType === "sub_agent" &&
        !isNonEmptyString(input.parentReviewerAgentName)) {
        addIssue(issues, "sub_agent_parent_reviewer_missing", "parentReviewerAgentName", "Sub-agent prompt improvements require a parent reviewer agent name.");
    }
    else if (input.improvingAgentType === "sub_agent" && isNonEmptyString(input.parentReviewerAgentName)) {
        const reviewerName = input.parentReviewerAgentName.trim();
        if (reviewerName.length > 100 || /^(?:agent|user|system):/iu.test(reviewerName)) {
            addIssue(issues, "sub_agent_parent_reviewer_invalid", "parentReviewerAgentName", "parentReviewerAgentName must be a user-facing parent agent name.");
        }
        if (input.approvalRecord && input.approvalRecord.approvedBy !== reviewerName) {
            addIssue(issues, "sub_agent_parent_reviewer_mismatch", "approvalRecord.approvedBy", "Sub-agent approval must be issued by the named parent reviewer.");
        }
    }
    if (kind && PROMPT_SOURCE_IMPROVEMENT_KINDS.has(kind)) {
        if (!isNonEmptyStringArray(input.targetPromptSources)) {
            addIssue(issues, "target_prompt_source_missing", "targetPromptSources", "Prompt source improvements require at least one exact target prompt source.");
        }
        else {
            for (const [index, source] of input.targetPromptSources.entries()) {
                if (isBroadPromptSource(source)) {
                    addIssue(issues, "target_prompt_source_too_broad", `targetPromptSources.${index}`, "Prompt source targets must identify exact source files or registry records.");
                }
                if (isNonEmptyString(source) && !isExactPromptSourceRef(source)) {
                    addIssue(issues, "target_prompt_source_invalid_ref", `targetPromptSources.${index}`, "Prompt source targets must use prompts/<source>.md or <source_id>:<locale>.");
                }
            }
            if (isNonEmptyStringArray(input.agentOwnedPromptScope) &&
                !promptSourcesWithinAgentOwnedScope(input.targetPromptSources, input.agentOwnedPromptScope)) {
                addIssue(issues, "target_prompt_source_outside_agent_scope", "targetPromptSources", "targetPromptSources must belong to modules listed in agentOwnedPromptScope.");
            }
        }
    }
    if (harnessChange) {
        if (input.triggerSource && !EXPLICIT_HARNESS_TRIGGER_SOURCES.has(input.triggerSource)) {
            addIssue(issues, "harness_explicit_request_required", "triggerSource", "Harness improvements require an explicit user or administrator request.");
        }
        if (!isNonEmptyStringArray(input.targetHarnessSources)) {
            addIssue(issues, "harness_source_missing", "targetHarnessSources", "Harness improvements require exact harness source targets.");
        }
        else {
            const normalizedHarnessSources = input.targetHarnessSources.map((source) => source.trim());
            if (new Set(normalizedHarnessSources).size !== normalizedHarnessSources.length) {
                addIssue(issues, "harness_source_duplicate", "targetHarnessSources", "Harness source targets must be unique.");
            }
            for (const [index, source] of normalizedHarnessSources.entries()) {
                if (!EXACT_HARNESS_SOURCE_REF.test(source)) {
                    addIssue(issues, "harness_source_invalid_ref", `targetHarnessSources.${index}`, "Harness targets must identify the canonical harness source, prompt, or an exact test fixture.");
                }
            }
        }
        if (!isNonEmptyStringArray(input.harnessChangeScope)) {
            addIssue(issues, "harness_change_scope_missing", "harnessChangeScope", "Harness improvements require an explicit harness change scope.");
        }
        validateHarnessChangeScope(input.harnessChangeScope, issues, "harnessChangeScope");
        validateHarnessGuardrails(input.harnessGuardrailsToPreserve, issues, "harnessGuardrailsToPreserve");
        const missingGuardrails = missingRequiredHarnessGuardrails(input.harnessGuardrailsToPreserve);
        if (missingGuardrails.length > 0) {
            addIssue(issues, "harness_guardrail_missing", "harnessGuardrailsToPreserve", `Harness improvements must preserve every required guardrail: ${missingGuardrails.join(", ")}.`);
        }
        if (input.approvalMode !== "admin_required") {
            addIssue(issues, "harness_admin_approval_required", "approvalMode", "Harness improvements are high-risk meta-improvements and require admin approval.");
        }
    }
    else {
        if (isNonEmptyStringArray(input.targetHarnessSources)) {
            addIssue(issues, "harness_field_not_allowed", "targetHarnessSources", "Non-harness prompt improvements must not target harness sources.");
        }
        if (isNonEmptyStringArray(input.harnessChangeScope)) {
            addIssue(issues, "harness_field_not_allowed", "harnessChangeScope", "Non-harness prompt improvements must not declare a harness change scope.");
        }
        if (isNonEmptyStringArray(input.harnessGuardrailsToPreserve)) {
            addIssue(issues, "harness_field_not_allowed", "harnessGuardrailsToPreserve", "Non-harness prompt improvements must not declare harness guardrails.");
        }
    }
    const approvalRequired = input.approvalMode === "user_required" || input.approvalMode === "admin_required";
    if ((risk === "medium" || risk === "high") && input.approvalMode === "none") {
        addIssue(issues, "approval_required", "approvalMode", "Medium-risk and high-risk prompt improvements require user or administrator approval before apply-change.");
    }
    if (approvalRequired) {
        const approvalRecord = input.approvalRecord;
        if (!approvalRecord || typeof approvalRecord !== "object") {
            addIssue(issues, "approval_record_missing", "approvalRecord", "Approval-required prompt improvements require an approval record before applying changes.");
        }
        else {
            if (!isNonEmptyString(approvalRecord.approvedBy)) {
                addIssue(issues, "approval_record_field_missing", "approvalRecord.approvedBy", "Approval record requires approvedBy.");
            }
            if (!isNonEmptyString(approvalRecord.approvedAt)) {
                addIssue(issues, "approval_record_field_missing", "approvalRecord.approvedAt", "Approval record requires approvedAt.");
            }
            if (!Array.isArray(approvalRecord.approvalScope) || !approvalRecord.approvalScope.includes("apply_change")) {
                addIssue(issues, "approval_scope_missing", "approvalRecord.approvalScope", "Approval record must explicitly approve apply_change.");
            }
            if (harnessChange && (!Array.isArray(approvalRecord.approvalScope) || !approvalRecord.approvalScope.includes("activation"))) {
                addIssue(issues, "approval_scope_missing", "approvalRecord.approvalScope", "Harness changes must explicitly approve activation after validation.");
            }
            if (kind && PROMPT_SOURCE_IMPROVEMENT_KINDS.has(kind) && !includesAll(input.targetPromptSources, approvalRecord.targetPromptSources)) {
                addIssue(issues, "approval_target_mismatch", "approvalRecord.targetPromptSources", "Approval record must cover every target prompt source.");
            }
            if (harnessChange && !includesAll(input.targetHarnessSources, approvalRecord.targetHarnessSources)) {
                addIssue(issues, "approval_target_mismatch", "approvalRecord.targetHarnessSources", "Approval record must cover every target harness source.");
            }
            if (approvalRecord.riskAccepted !== risk) {
                addIssue(issues, "approval_risk_mismatch", "approvalRecord.riskAccepted", "Approval record riskAccepted must match the harness risk level.");
            }
        }
    }
    return {
        ok: issues.length === 0,
        risk,
        issues,
    };
}
const PROMPT_IMPROVEMENT_MISSING_INPUT_CODES = new Set([
    "required_field_missing",
    "target_prompt_source_missing",
    "sub_agent_parent_reviewer_missing",
    "harness_source_missing",
    "harness_change_scope_missing",
    "harness_guardrail_missing",
    "approval_record_missing",
    "approval_record_field_missing",
]);
export function decidePromptImprovementHarnessInput(input) {
    const validation = validatePromptImprovementHarnessInput(input);
    if (validation.ok) {
        return { state: "ready", risk: validation.risk, input: input };
    }
    const missingFields = [...new Set(validation.issues
            .filter((issue) => PROMPT_IMPROVEMENT_MISSING_INPUT_CODES.has(issue.code))
            .map((issue) => issue.path))];
    return {
        state: "blocked",
        risk: validation.risk,
        missingFields,
        issues: validation.issues,
    };
}
const MUTABLE_SOURCE_REF_PATTERNS = {
    versioned_prompt_file: /^prompts\/[a-z0-9_-]+(?:\.(?:ko|en))?\.md$/iu,
    prompt_registry_record: /^[a-z0-9_]+:(?:ko|en)$/iu,
    prompt_metadata: /^prompt-metadata:[a-z0-9_.-]+$/iu,
    prompt_test_fixture: /^tests\/[a-z0-9_./-]+\.test\.(?:ts|tsx)$/iu,
};
export function authorizePromptImprovementMutableSource(source) {
    if (!source.sourceKind || !PROMPT_IMPROVEMENT_MUTABLE_SOURCE_KINDS.includes(source.sourceKind)) {
        return { status: "blocked", reasonCode: "source_kind_invalid" };
    }
    const sourceRef = source.sourceRef?.trim() ?? "";
    if (!MUTABLE_SOURCE_REF_PATTERNS[source.sourceKind].test(sourceRef)) {
        return { status: "blocked", reasonCode: "source_ref_invalid" };
    }
    const baselineVersion = source.baselineVersion?.trim() ?? "";
    const baselineChecksum = source.baselineChecksum?.trim() ?? "";
    if (!baselineVersion
        || /^(?:latest|current|head)$/iu.test(baselineVersion)
        || !/^(?:sha256:)?[a-f0-9]{8,64}$/iu.test(baselineChecksum)) {
        return { status: "blocked", reasonCode: "source_version_missing" };
    }
    if (source.sourceKind === "prompt_test_fixture" && !["validation", "regression"].includes(source.fixturePurpose ?? "")) {
        return { status: "blocked", reasonCode: "fixture_purpose_invalid" };
    }
    return {
        status: "authorized",
        source: {
            sourceKind: source.sourceKind,
            sourceRef,
            baselineVersion,
            baselineChecksum,
            ...(source.sourceKind === "prompt_test_fixture" ? { fixturePurpose: source.fixturePurpose } : {}),
        },
    };
}
export function executeAuthorizedPromptImprovementMutableSource(input) {
    if (input.authorization.status !== "authorized") {
        input.recordAudit({
            ...input.auditContext,
            event: "prompt_improvement.mutable_source_execution",
            sourceKind: null,
            sourceRef: null,
            baselineVersion: null,
            baselineChecksum: null,
            writerKind: input.writerKind,
            decision: "blocked",
            reasonCode: "source_not_authorized",
        });
        return { status: "blocked", reasonCode: "source_not_authorized" };
    }
    if (input.authorization.source.sourceKind !== input.writerKind) {
        input.recordAudit({
            ...input.auditContext,
            event: "prompt_improvement.mutable_source_execution",
            sourceKind: input.authorization.source.sourceKind,
            sourceRef: input.authorization.source.sourceRef,
            baselineVersion: input.authorization.source.baselineVersion,
            baselineChecksum: input.authorization.source.baselineChecksum,
            writerKind: input.writerKind,
            decision: "blocked",
            reasonCode: "writer_kind_mismatch",
        });
        return { status: "blocked", reasonCode: "writer_kind_mismatch" };
    }
    input.recordAudit({
        ...input.auditContext,
        event: "prompt_improvement.mutable_source_execution",
        sourceKind: input.authorization.source.sourceKind,
        sourceRef: input.authorization.source.sourceRef,
        baselineVersion: input.authorization.source.baselineVersion,
        baselineChecksum: input.authorization.source.baselineChecksum,
        writerKind: input.writerKind,
        decision: "applied",
        reasonCode: null,
    });
    return {
        status: "applied",
        source: input.authorization.source,
        result: input.write(input.authorization.source),
    };
}
export function canTransitionPromptImprovementHarnessState(from, to, event, context) {
    if (event === "rollback_requested" && to === "rolled_back") {
        return false;
    }
    if (event === "cancel_requested") {
        if (context?.sourceWriteState === "written") {
            return to === "rolled_back" && PROMPT_IMPROVEMENT_HARNESS_ROLLBACK_STATES.has(from);
        }
        if (to !== "blocked")
            return false;
        return !PROMPT_IMPROVEMENT_HARNESS_TERMINAL_STATES.has(from) &&
            context?.sourceWriteState === "unchanged" &&
            Boolean(context.blockedEvidence);
    }
    if (to === "blocked" && !context?.blockedEvidence)
        return false;
    if (to === "rolled_back" && context?.sourceWriteState !== "written")
        return false;
    return PROMPT_IMPROVEMENT_HARNESS_TRANSITIONS[from].includes(to);
}
export function validatePromptImprovementHarnessStateTransition(from, to, event, context) {
    if (canTransitionPromptImprovementHarnessState(from, to, event, context))
        return [];
    return [{
            code: "invalid_state_transition",
            path: "state",
            message: `Prompt improvement harness cannot transition from ${from} to ${to}${event ? ` on ${event}` : ""}.`,
        }];
}
function normalizedStrategyValues(strategy) {
    return {
        target: strategy.targetRef.trim(),
        input: strategy.inputFingerprint.trim(),
        tool: [...new Set(strategy.toolIds.map((toolId) => toolId.trim()).filter(Boolean))].sort().join("\n"),
        work_split: strategy.workSplitFingerprint.trim(),
        execution_order: strategy.executionOrderFingerprint.trim(),
        verification_method: strategy.verificationMethod.trim(),
    };
}
export function changedPromptImprovementRecoveryAxes(input) {
    const previous = normalizedStrategyValues(input.previous);
    const next = normalizedStrategyValues(input.next);
    return PROMPT_IMPROVEMENT_RECOVERY_CHANGE_AXES.filter((axis) => previous[axis] !== next[axis]);
}
export function decidePromptImprovementRecovery(input) {
    if (!Number.isSafeInteger(input.retryCount) || input.retryCount < 0) {
        throw new Error("Prompt improvement retry count must be a non-negative safe integer.");
    }
    if (input.blockedEvidence) {
        return input.sourceWriteState === "written"
            ? {
                status: "rollback_required",
                nextState: "rolled_back",
                reasonCode: input.blockedEvidence,
                retryCount: input.retryCount,
            }
            : {
                status: "blocked",
                nextState: "blocked",
                reasonCode: input.blockedEvidence,
                retryCount: input.retryCount,
            };
    }
    if (!input.previousStrategy || !input.nextStrategy) {
        return {
            status: "strategy_change_required",
            nextState: "test_execution",
            reasonCode: "strategy_missing",
            retryCount: input.retryCount,
        };
    }
    const changedAxes = changedPromptImprovementRecoveryAxes({
        previous: input.previousStrategy,
        next: input.nextStrategy,
    });
    if (changedAxes.length === 0) {
        return {
            status: "strategy_change_required",
            nextState: "test_execution",
            reasonCode: "same_strategy",
            retryCount: input.retryCount,
        };
    }
    return {
        status: "proposal_revision_authorized",
        nextState: "proposal_drafting",
        changedAxes,
        retryCount: input.retryCount,
    };
}
export function decidePromptImprovementInterrupt(input) {
    if (input.event === "rollback_requested") {
        if (input.sourceWriteState !== "written") {
            return { status: "blocked", reasonCode: "rollback_source_not_written" };
        }
        return PROMPT_IMPROVEMENT_HARNESS_ROLLBACK_STATES.has(input.state)
            ? { status: "rollback_required", nextState: "rolled_back", reasonCode: "rollback_requested" }
            : { status: "blocked", reasonCode: "interrupt_not_allowed" };
    }
    if (PROMPT_IMPROVEMENT_HARNESS_TERMINAL_STATES.has(input.state)) {
        return { status: "blocked", reasonCode: "interrupt_not_allowed" };
    }
    if (input.sourceWriteState === "written") {
        return PROMPT_IMPROVEMENT_HARNESS_ROLLBACK_STATES.has(input.state)
            ? { status: "rollback_required", nextState: "rolled_back", reasonCode: "cancel_after_source_write" }
            : { status: "blocked", reasonCode: "interrupt_not_allowed" };
    }
    if (!input.blockedEvidence)
        return { status: "blocked", reasonCode: "blocked_evidence_missing" };
    return { status: "transition_authorized", nextState: "blocked" };
}
export function buildPromptImprovementApprovalRequest(input) {
    const approvalScopesRequested = [...input.approvalScopesRequested];
    const grantedScopes = input.harnessInput.approvalRecord?.approvalScope ?? [];
    const activationIncluded = approvalScopesRequested.includes("activation") && grantedScopes.includes("activation");
    const targetFiles = normalizeStringArray([
        ...input.harnessInput.targetPromptSources,
        ...input.harnessInput.targetHarnessSources,
    ]);
    return {
        targetFiles,
        changeSummary: input.changeSummary,
        riskLevel: input.validation.risk,
        invariantsAffected: normalizeStringArray(input.invariantsAffected),
        testsToRun: normalizeStringArray(input.harnessInput.requiredTests),
        rollbackPlan: input.harnessInput.rollbackPlan,
        activationMethod: input.activationMethod,
        harnessChangeScope: normalizeStringArray(input.harnessInput.harnessChangeScope),
        harnessGuardrailsToPreserve: normalizeStringArray(input.harnessInput.harnessGuardrailsToPreserve),
        approvalMode: input.harnessInput.approvalMode,
        approvalScopesRequested,
        activationIncluded,
    };
}
export function buildPromptImprovementActivationRecord(input) {
    return {
        state: "activated",
        activePromptVersions: normalizeActivePromptVersions(input.activePromptVersions),
        loadedByProcess: input.loadedByProcess,
        loadedByAgentName: input.loadedByAgentName,
        activatedAt: input.activatedAt,
        activationMethod: input.activationMethod,
        testsBeforeActivation: normalizeStringArray(input.testsBeforeActivation),
        rollbackPath: input.rollbackPath,
    };
}
export function validatePromptImprovementActivationRecord(record) {
    const issues = [];
    if (normalizeActivePromptVersions(record.activePromptVersions).length === 0) {
        addIssue(issues, "activation_source_missing", "activePromptVersions", "Activation confirmation requires at least one active prompt source version.");
    }
    if (!isNonEmptyString(record.loadedByProcess)) {
        addIssue(issues, "activation_loader_missing", "loadedByProcess", "Activation confirmation requires the loading process identifier.");
    }
    if (!isNonEmptyString(record.loadedByAgentName)) {
        addIssue(issues, "activation_loader_missing", "loadedByAgentName", "Activation confirmation requires the loading agent name.");
    }
    if (!isNonEmptyString(record.activatedAt)) {
        addIssue(issues, "activation_timestamp_missing", "activatedAt", "Activation confirmation requires an activation timestamp.");
    }
    if (!isNonEmptyString(record.activationMethod)) {
        addIssue(issues, "activation_method_missing", "activationMethod", "Activation confirmation requires an activation method.");
    }
    if (!isNonEmptyStringArray(record.testsBeforeActivation)) {
        addIssue(issues, "activation_test_evidence_missing", "testsBeforeActivation", "Activation confirmation requires tests executed before activation.");
    }
    if (!isNonEmptyString(record.rollbackPath)) {
        addIssue(issues, "activation_rollback_missing", "rollbackPath", "Activation confirmation requires a rollback path.");
    }
    return {
        ok: issues.length === 0,
        issues,
    };
}
export function buildPromptImprovementHarnessReport(input) {
    const now = Date.now();
    const startedAt = input.startedAt ?? now;
    const finishedAt = input.finishedAt ?? startedAt;
    const sourceChecksums = input.sourceChecksums ? input.sourceChecksums.map((item) => ({ ...item })) : [];
    const rollbackTarget = isNonEmptyString(input.rollbackTarget)
        ? input.rollbackTarget
        : isNonEmptyString(input.backupPath)
            ? input.backupPath
            : input.sourceWriteState === "written"
                ? ""
                : input.harnessInput.rollbackPlan;
    const baselineIntegrityIssues = [];
    if (input.sourceWriteState === "written" && sourceChecksums.length === 0) {
        addIssue(baselineIntegrityIssues, "baseline_source_checksum_missing", "sourceChecksums", "Written prompt improvements require pre-write source checksum evidence.");
    }
    if (input.sourceWriteState === "written" && !isNonEmptyString(rollbackTarget)) {
        addIssue(baselineIntegrityIssues, "baseline_rollback_target_missing", "rollbackTarget", "Written prompt improvements require an exact rollback target created before write.");
    }
    const baselineIntegrityOk = baselineIntegrityIssues.length === 0;
    const validActivationRecord = baselineIntegrityOk && input.activationRecord &&
        validatePromptImprovementActivationRecord(input.activationRecord).ok
        ? cloneActivationRecord(input.activationRecord)
        : undefined;
    const activationState = input.sourceWriteState === "written"
        ? validActivationRecord
            ? "activated"
            : "activation_pending"
        : "unchanged";
    const state = !baselineIntegrityOk
        ? "blocked"
        : activationState === "activation_pending"
            ? "activation_pending"
            : "completed";
    const approvalRequired = input.harnessInput.approvalMode !== "none";
    const approvalRecord = input.harnessInput.approvalRecord;
    const rollbackState = input.sourceWriteState === "written"
        ? input.backupPath
            ? "backup_available"
            : "source_control_required"
        : "not_required";
    const baselineCapture = {
        runId: input.runId,
        timestamp: startedAt,
        actor: input.harnessInput.improvingAgentName,
        triggerSource: input.harnessInput.triggerSource,
        targetPromptSources: [...input.harnessInput.targetPromptSources],
        activeHarnessVersion: input.harnessInput.activeHarnessVersion,
        targetHarnessSources: [...input.harnessInput.targetHarnessSources],
        sourceChecksums,
        currentPromptSummary: input.currentPromptSummary ?? input.harnessInput.currentBehavior,
        knownRegressionTests: [...input.harnessInput.requiredTests],
        currentInvariants: [...input.harnessInput.requiredInvariants],
        harnessGuardrailsSnapshot: [...input.harnessInput.harnessGuardrailsToPreserve],
        activationState,
        rollbackTarget,
    };
    const reportApprovalRecord = {
        mode: input.harnessInput.approvalMode,
        required: approvalRequired,
        granted: !approvalRequired || Boolean(approvalRecord),
        approvalScope: approvalRecord?.approvalScope ? [...approvalRecord.approvalScope] : [],
        targetPromptSources: approvalRecord?.targetPromptSources ? [...approvalRecord.targetPromptSources] : [],
        targetHarnessSources: approvalRecord?.targetHarnessSources ? [...approvalRecord.targetHarnessSources] : [],
    };
    if (approvalRecord?.approvedBy)
        reportApprovalRecord.approvedBy = approvalRecord.approvedBy;
    if (approvalRecord?.approvedAt)
        reportApprovalRecord.approvedAt = approvalRecord.approvedAt;
    if (approvalRecord?.riskAccepted)
        reportApprovalRecord.riskAccepted = approvalRecord.riskAccepted;
    const report = {
        runId: input.runId,
        startedAt,
        finishedAt,
        actor: input.harnessInput.improvingAgentName,
        triggerSource: input.harnessInput.triggerSource,
        state,
        targetPromptSources: [...input.harnessInput.targetPromptSources],
        changedPromptSources: [...input.changedPromptSources],
        improvementGoal: input.harnessInput.improvementGoal,
        behaviorBefore: input.harnessInput.currentBehavior,
        behaviorAfter: input.harnessInput.desiredBehavior,
        riskLevel: input.validation.risk,
        approvalRecord: reportApprovalRecord,
        testsRequested: [...input.harnessInput.requiredTests],
        testsPassed: input.testsPassed ? [...input.testsPassed] : [],
        testsFailed: input.testsFailed ? [...input.testsFailed] : [],
        activationState,
        rollbackState,
        baselineCapture,
        baselineIntegrityIssues,
        rollbackPlan: input.harnessInput.rollbackPlan,
        summary: !baselineIntegrityOk
            ? "Prompt improvement is blocked because the written source lacks required baseline checksum or rollback target evidence."
            : input.sourceWriteState === "written"
                ? validActivationRecord
                    ? "Prompt source was written and runtime activation was confirmed."
                    : "Prompt source was written. Runtime activation is pending until reload, restart, or explicit prompt version activation is confirmed."
                : "Prompt source was unchanged. Runtime activation is not required.",
    };
    if (validActivationRecord)
        report.activationRecord = validActivationRecord;
    return report;
}
export function buildPromptImprovementAuditRecord(report) {
    return {
        runId: report.runId,
        startedAt: report.startedAt,
        finishedAt: report.finishedAt,
        actor: report.actor,
        triggerSource: report.triggerSource,
        state: report.state,
        targetPromptSources: [...report.targetPromptSources],
        changedPromptSources: [...report.changedPromptSources],
        improvementGoal: report.improvementGoal,
        behaviorBefore: report.behaviorBefore,
        behaviorAfter: report.behaviorAfter,
        riskLevel: report.riskLevel,
        approvalRecord: {
            ...report.approvalRecord,
            approvalScope: [...report.approvalRecord.approvalScope],
            targetPromptSources: [...report.approvalRecord.targetPromptSources],
            targetHarnessSources: [...report.approvalRecord.targetHarnessSources],
        },
        testsRequested: [...report.testsRequested],
        testsPassed: [...report.testsPassed],
        testsFailed: [...report.testsFailed],
        activationState: report.activationState,
        rollbackState: report.rollbackState,
        summary: report.summary,
    };
}
function auditValues(values) {
    const normalized = values.map((value) => value.trim());
    if (normalized.some((value) => !value) || new Set(normalized).size !== normalized.length)
        return null;
    return normalized;
}
function clonePromptImprovementAuditRecord(record) {
    return {
        ...record,
        targetPromptSources: [...record.targetPromptSources],
        changedPromptSources: [...record.changedPromptSources],
        approvalRecord: {
            ...record.approvalRecord,
            approvalScope: [...record.approvalRecord.approvalScope],
            targetPromptSources: [...record.approvalRecord.targetPromptSources],
            targetHarnessSources: [...record.approvalRecord.targetHarnessSources],
        },
        testsRequested: [...record.testsRequested],
        testsPassed: [...record.testsPassed],
        testsFailed: [...record.testsFailed],
    };
}
export function authorizePromptImprovementAuditRecord(record) {
    if (!isNonEmptyString(record.runId) || !isNonEmptyString(record.actor) || !isNonEmptyString(record.triggerSource)) {
        return { status: "blocked", reasonCode: "audit_identity_invalid" };
    }
    if (!Number.isSafeInteger(record.startedAt)
        || !Number.isSafeInteger(record.finishedAt)
        || record.startedAt < 0
        || record.finishedAt < record.startedAt) {
        return { status: "blocked", reasonCode: "audit_timestamp_invalid" };
    }
    const targets = auditValues(record.targetPromptSources);
    const changed = auditValues(record.changedPromptSources);
    if (!targets || !changed || changed.some((sourceRef) => !targets.includes(sourceRef))) {
        return { status: "blocked", reasonCode: "audit_source_lineage_invalid" };
    }
    if (!isNonEmptyString(record.improvementGoal)
        || !isNonEmptyString(record.behaviorBefore)
        || !isNonEmptyString(record.behaviorAfter)
        || !isNonEmptyString(record.riskLevel)) {
        return { status: "blocked", reasonCode: "audit_content_invalid" };
    }
    if (!record.approvalRecord.mode
        || (record.approvalRecord.required && !record.approvalRecord.granted && record.state === "completed")) {
        return { status: "blocked", reasonCode: "audit_approval_invalid" };
    }
    const requested = auditValues(record.testsRequested);
    const passed = auditValues(record.testsPassed);
    const failed = auditValues(record.testsFailed);
    if (!requested || !passed || !failed
        || passed.some((testId) => !requested.includes(testId))
        || failed.some((testId) => !requested.includes(testId))
        || passed.some((testId) => failed.includes(testId))) {
        return { status: "blocked", reasonCode: "audit_test_lineage_invalid" };
    }
    if ((record.state === "rolled_back") !== (record.activationState === "rolled_back")
        || (record.state === "rolled_back") !== (record.rollbackState === "rolled_back")
        || (record.state === "activation_pending") !== (record.activationState === "activation_pending")) {
        return { status: "blocked", reasonCode: "audit_state_inconsistent" };
    }
    if (!isNonEmptyString(record.summary)) {
        return { status: "blocked", reasonCode: "audit_summary_missing" };
    }
    return { status: "authorized", record: clonePromptImprovementAuditRecord(record) };
}
export async function appendAuthorizedPromptImprovementAuditRecord(input) {
    if (input.decision.status !== "authorized")
        return input.decision;
    return { status: "appended", result: await input.append(input.decision.record) };
}
export function buildPromptImprovementUserOutput(report) {
    const inspectedPromptSources = normalizeStringArray([
        ...report.targetPromptSources,
        ...report.baselineCapture.targetHarnessSources,
        ...report.baselineCapture.sourceChecksums.map((item) => item.sourceRef),
    ]);
    const promptChanged = report.changedPromptSources.length > 0;
    return {
        state: report.state,
        inspectedPromptSources,
        changedPromptSources: [...report.changedPromptSources],
        changeReason: report.improvementGoal,
        behaviorBefore: report.behaviorBefore,
        behaviorAfter: report.behaviorAfter,
        outcomeSummary: report.summary,
        invariantsChecked: [...report.baselineCapture.currentInvariants],
        testsPassed: [...report.testsPassed],
        testsFailed: [...report.testsFailed],
        activeNow: report.activationState === "activated",
        activationState: report.activationState,
        reloadOrRestartRequired: report.activationState === "activation_pending",
        rollbackPath: report.baselineCapture.rollbackTarget || report.rollbackPlan,
        promptChanged,
        noChangeStatement: promptChanged ? "" : "Prompt source was unchanged.",
    };
}
export function buildPromptImprovementProductLogEvents(audit) {
    const events = [{
            level: "product",
            event: "prompt_improvement.started",
            runId: audit.runId,
            state: audit.state,
            riskLevel: audit.riskLevel,
        }];
    if (audit.approvalRecord.required) {
        events.push({
            level: "product",
            event: "prompt_improvement.approval_required",
            runId: audit.runId,
            state: audit.state,
            approvalRequired: true,
            riskLevel: audit.riskLevel,
        });
    }
    if (audit.changedPromptSources.length > 0) {
        events.push({
            level: "product",
            event: "prompt_improvement.change_applied",
            runId: audit.runId,
            state: audit.state,
            changedPromptSourceCount: audit.changedPromptSources.length,
        });
    }
    events.push({
        level: "product",
        event: "prompt_improvement.activation_state",
        runId: audit.runId,
        state: audit.state,
        activationState: audit.activationState,
    });
    events.push({
        level: "product",
        event: "prompt_improvement.rollback_state",
        runId: audit.runId,
        state: audit.state,
        rollbackState: audit.rollbackState,
    });
    events.push({
        level: "product",
        event: "prompt_improvement.finished",
        runId: audit.runId,
        state: audit.state,
        summary: audit.summary,
    });
    return events;
}
//# sourceMappingURL=prompt-improvement-harness.js.map