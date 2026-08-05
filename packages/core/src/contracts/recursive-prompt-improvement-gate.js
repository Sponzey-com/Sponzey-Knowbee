export const RECURSIVE_PROMPT_BEHAVIOR_INVARIANTS = [
    "safety",
    "permission",
    "user_identity",
    "agent_identity",
    "response_language",
    "llm_final_response",
    "memory_isolation",
    "delegation_rules",
    "yeonjang_authorization",
    "approval",
    "audit",
    "rollback",
    "next_run_activation",
    "stop_condition",
];
export const REQUIRED_HARNESS_REGRESSION_TEST_IDS = [
    "entry_conditions",
    "required_inputs",
    "invariants",
    "approval",
    "regression_tests",
    "audit_log",
    "rollback",
    "activation_confirmation",
];
export const PROMPT_IMPROVEMENT_ENTRY_TRIGGER_KINDS = [
    "user_harness_change",
    "administrator_prompt_maintenance",
    "regression_or_validation_failure",
    "safety_vulnerability",
    "goal_behavior_mismatch",
    "casual_chat",
    "ordinary_task",
    "ambiguous_improvement",
    "protected_boundary_bypass",
    "target_source_missing",
    "invariant_weakening",
    "runtime_environment_mutation",
    "hidden_instruction_mutation",
];
function present(value) {
    return value.trim().length > 0;
}
const TYPED_PROMPT_SOURCE_REF = /^prompt:[^\s]+$/u;
const EXACT_ENTRY_SOURCE_REF = /^(?:prompt:[^\s*]+|prompts\/[A-Za-z0-9._-]+\.md|packages\/core\/src\/(?:memory|contracts)\/[A-Za-z0-9._-]+\.ts(?:#[A-Za-z0-9._-]+)?)$/u;
const ALLOWED_ENTRY_TRIGGER_KINDS = new Set([
    "user_harness_change",
    "administrator_prompt_maintenance",
    "regression_or_validation_failure",
    "safety_vulnerability",
    "goal_behavior_mismatch",
]);
const EXPLICIT_ENTRY_TRIGGER_KINDS = new Set([
    "user_harness_change",
    "administrator_prompt_maintenance",
]);
const REJECTED_ENTRY_REASONS = {
    casual_chat: "ordinary_request",
    ordinary_task: "ordinary_request",
    ambiguous_improvement: "needs_clarification",
    protected_boundary_bypass: "protected_boundary_bypass",
    target_source_missing: "target_source_missing",
    invariant_weakening: "invariant_weakening",
    runtime_environment_mutation: "runtime_environment_mutation",
    hidden_instruction_mutation: "hidden_instruction_mutation",
};
function blockedEntry(reasonCode) {
    const nextAction = reasonCode === "needs_clarification" || reasonCode === "explicit_confirmation_required"
        ? "ask_explicit_prompt_change_confirmation"
        : reasonCode === "ordinary_request"
            ? "continue_ordinary_request"
            : ["protected_boundary_bypass", "invariant_weakening", "runtime_environment_mutation", "hidden_instruction_mutation"].includes(reasonCode)
                ? "report_protected_boundary"
                : "repair_entry_evidence";
    return { status: "blocked", state: "blocked", reasonCode, nextAction };
}
export function authorizePromptImprovementEntry(input) {
    const receipt = input.receipt;
    if (receipt.schemaVersion !== 1 || !present(receipt.requestId) || !present(receipt.actorId)
        || !present(receipt.diagnosisReceiptId) || !Number.isSafeInteger(receipt.diagnosedAt)
        || !Number.isSafeInteger(receipt.expiresAt) || !Number.isSafeInteger(input.now)
        || receipt.diagnosedAt > input.now) {
        return blockedEntry("entry_receipt_invalid");
    }
    if (receipt.expiresAt <= input.now)
        return blockedEntry("entry_receipt_expired");
    if (receipt.classifiedBy !== "llm")
        return blockedEntry("llm_diagnosis_required");
    const rejectedReason = REJECTED_ENTRY_REASONS[receipt.triggerKind];
    if (rejectedReason)
        return blockedEntry(rejectedReason);
    if (!ALLOWED_ENTRY_TRIGGER_KINDS.has(receipt.triggerKind)
        || receipt.diagnosedAction !== "enter_prompt_improvement") {
        return blockedEntry("llm_diagnosis_required");
    }
    if ((receipt.triggerKind === "user_harness_change" && receipt.actorType !== "user")
        || (receipt.triggerKind === "administrator_prompt_maintenance" && receipt.actorType !== "administrator")
        || !["user", "administrator", "system"].includes(receipt.actorType)) {
        return blockedEntry("actor_not_authorized");
    }
    if (EXPLICIT_ENTRY_TRIGGER_KINDS.has(receipt.triggerKind) && !receipt.explicitRequest) {
        return blockedEntry("explicit_confirmation_required");
    }
    const targetSourceRefs = receipt.targetSourceRefs.map((value) => value.trim()).filter(Boolean);
    if (targetSourceRefs.length === 0 || new Set(targetSourceRefs).size !== targetSourceRefs.length
        || targetSourceRefs.some((sourceRef) => !EXACT_ENTRY_SOURCE_REF.test(sourceRef))) {
        return blockedEntry("target_source_required");
    }
    const evidenceRefs = receipt.evidenceRefs.map((value) => value.trim()).filter(Boolean);
    if (evidenceRefs.length === 0 || new Set(evidenceRefs).size !== evidenceRefs.length) {
        return blockedEntry("trigger_evidence_required");
    }
    return {
        status: "authorized",
        state: "intake",
        requestId: receipt.requestId,
        triggerKind: receipt.triggerKind,
        targetSourceRefs,
        evidenceRefs,
    };
}
export async function enterAuthorizedPromptImprovement(input) {
    if (input.decision.status !== "authorized")
        return input.decision;
    return { status: "entered", result: await input.enter(input.decision) };
}
function validatesHarnessRegressionSuite(receipt, proposalFingerprint) {
    if (receipt.status !== "passed")
        return "failed";
    const required = new Set(receipt.requiredTestIds);
    const passed = new Set(receipt.passedTestIds);
    if (receipt.schemaVersion !== 1
        || receipt.proposalFingerprint !== proposalFingerprint
        || !present(receipt.sourceFingerprint)
        || required.size !== receipt.requiredTestIds.length
        || passed.size !== receipt.passedTestIds.length
        || REQUIRED_HARNESS_REGRESSION_TEST_IDS.some((testId) => !required.has(testId) || !passed.has(testId))) {
        return "incomplete";
    }
    return "valid";
}
function validatesHarnessApproval(receipt, proposalFingerprint, now) {
    return Boolean(receipt
        && receipt.schemaVersion === 1
        && receipt.proposalFingerprint === proposalFingerprint
        && receipt.decision === "approved"
        && receipt.scope === "harness_apply"
        && present(receipt.approvedBy)
        && Number.isSafeInteger(receipt.issuedAt)
        && Number.isSafeInteger(receipt.expiresAt)
        && receipt.issuedAt <= now
        && receipt.expiresAt > now);
}
export function authorizeRecursivePromptImprovement(input) {
    const { harness } = input;
    if (harness.schemaVersion !== 1 || harness.state !== "approval_wait"
        || !present(harness.harnessRunId) || !present(harness.proposalFingerprint)
        || !present(harness.ownershipFingerprint) || !present(harness.invariantReviewFingerprint)
        || !Number.isSafeInteger(harness.issuedAt) || !Number.isSafeInteger(harness.expiresAt)
        || !Number.isSafeInteger(input.now) || harness.issuedAt > input.now) {
        return { status: "blocked", reasonCode: "harness_receipt_invalid" };
    }
    if (harness.expiresAt <= input.now)
        return { status: "blocked", reasonCode: "harness_receipt_expired" };
    const trigger = harness.trigger;
    if (!trigger || !present(trigger.requestId) || !present(trigger.diagnosisReceiptId)
        || trigger.classifiedBy !== "llm") {
        return { status: "blocked", reasonCode: "improvement_trigger_diagnosis_mismatch" };
    }
    if (trigger.protectedInvariantBypassRequested || trigger.classification === "protected_invariant_bypass") {
        return { status: "blocked", reasonCode: "protected_invariant_bypass_blocked" };
    }
    if (trigger.classification !== "explicit_prompt_improvement" || trigger.explicitRequest !== true) {
        return { status: "blocked", reasonCode: "explicit_improvement_trigger_required" };
    }
    if (trigger.diagnosedAction !== "prompt_improvement_proposal") {
        return { status: "blocked", reasonCode: "improvement_trigger_diagnosis_mismatch" };
    }
    if (trigger.targetPromptSourceRefs.length === 0
        || new Set(trigger.targetPromptSourceRefs).size !== trigger.targetPromptSourceRefs.length
        || trigger.targetPromptSourceRefs.some((sourceRef) => !TYPED_PROMPT_SOURCE_REF.test(sourceRef))) {
        return { status: "blocked", reasonCode: "improvement_target_required" };
    }
    if (!present(harness.activeHarnessFingerprint)
        || harness.controllingHarnessFingerprint !== harness.activeHarnessFingerprint) {
        return { status: "blocked", reasonCode: "inactive_harness_control" };
    }
    if (!Number.isSafeInteger(harness.attempt) || harness.attempt < 1
        || !Number.isSafeInteger(harness.maxAttempts) || harness.maxAttempts < 1) {
        return { status: "blocked", reasonCode: "attempt_limit_invalid" };
    }
    if (harness.priorProposalFingerprints.some((item) => !present(item))
        || new Set(harness.priorProposalFingerprints).size !== harness.priorProposalFingerprints.length) {
        return { status: "blocked", reasonCode: "harness_receipt_invalid" };
    }
    if (harness.priorProposalFingerprints.includes(harness.proposalFingerprint)) {
        return { status: "blocked", reasonCode: "proposal_repeat_detected" };
    }
    if (new Set(harness.passedInvariants).size !== RECURSIVE_PROMPT_BEHAVIOR_INVARIANTS.length
        || RECURSIVE_PROMPT_BEHAVIOR_INVARIANTS.some((item) => !harness.passedInvariants.includes(item))) {
        return { status: "blocked", reasonCode: "behavior_invariant_incomplete" };
    }
    if (harness.regressionReceiptRefs.length === 0 || harness.regressionReceiptRefs.some((item) => !present(item))) {
        return { status: "blocked", reasonCode: "regression_receipt_missing" };
    }
    if (harness.changeKind === "harness") {
        if (harness.riskLevel !== "high")
            return { status: "blocked", reasonCode: "harness_high_risk_required" };
        if (!harness.harnessRegressionSuite) {
            return { status: "blocked", reasonCode: "harness_regression_suite_missing" };
        }
        const suiteStatus = validatesHarnessRegressionSuite(harness.harnessRegressionSuite, harness.proposalFingerprint);
        if (suiteStatus === "failed")
            return { status: "blocked", reasonCode: "harness_regression_suite_failed" };
        if (suiteStatus === "incomplete")
            return { status: "blocked", reasonCode: "harness_regression_suite_incomplete" };
        if (!validatesHarnessApproval(harness.harnessApproval, harness.proposalFingerprint, input.now)) {
            return { status: "blocked", reasonCode: "harness_explicit_approval_required" };
        }
    }
    else if (harness.changeKind !== "prompt_source") {
        return { status: "blocked", reasonCode: "harness_receipt_invalid" };
    }
    if (!present(harness.rollbackRef))
        return { status: "blocked", reasonCode: "rollback_missing" };
    if (input.agentAuthorization.status !== "authorized")
        return { status: "blocked", reasonCode: "agent_authorization_blocked" };
    if (input.behaviorGate.status !== "authorized")
        return { status: "blocked", reasonCode: "behavior_gate_blocked" };
    if (input.sourceApplication.status !== "authorized")
        return { status: "blocked", reasonCode: "source_application_blocked" };
    const proposalFingerprint = harness.proposalFingerprint;
    if (harness.ownershipFingerprint !== input.expectedOwnershipFingerprint
        || harness.invariantReviewFingerprint !== input.expectedInvariantReviewFingerprint
        || input.agentAuthorization.proposalFingerprint !== proposalFingerprint
        || input.behaviorGate.proposalFingerprint !== proposalFingerprint
        || input.sourceApplication.authorization.proposalFingerprint !== proposalFingerprint) {
        return { status: "blocked", reasonCode: "proposal_scope_mismatch" };
    }
    return {
        status: "authorized",
        harnessRunId: harness.harnessRunId,
        proposalFingerprint,
        sourceSetFingerprint: input.sourceApplication.authorization.sourceSetFingerprint,
    };
}
export async function writeRecursivePromptImprovement(input) {
    if (input.decision.status !== "authorized")
        return input.decision;
    return { status: "written", result: await input.write(input.decision) };
}
//# sourceMappingURL=recursive-prompt-improvement-gate.js.map