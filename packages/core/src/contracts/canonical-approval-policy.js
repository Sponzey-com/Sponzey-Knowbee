import { PROMPT_IMPROVEMENT_HARNESS_CHANGE_SCOPES, REQUIRED_HARNESS_GUARDRAILS, } from "../memory/prompt-improvement-harness.js";
function exact(value) {
    return value.trim();
}
function uniqueNonEmpty(values) {
    const normalized = values.map(exact).filter(Boolean);
    return normalized.length === values.length && normalized.length > 0 && new Set(normalized).size === normalized.length;
}
export function validateCanonicalApprovalRequest(request) {
    if (request.targetFiles.length === 0 || request.targetFiles.some((source) => !exact(source.sourceRef))) {
        return { status: "blocked", reasonCode: "target_files_required", field: "targetFiles" };
    }
    for (const [field, value] of [
        ["changeSummary", request.changeSummary],
        ["rollbackPlan", request.rollbackPlan],
        ["activationMethod", request.activationMethod],
    ]) {
        if (!exact(value))
            return { status: "blocked", reasonCode: "approval_field_missing", field };
    }
    if (!uniqueNonEmpty(request.invariantsAffected)) {
        return { status: "blocked", reasonCode: "approval_list_invalid", field: "invariantsAffected" };
    }
    if (!uniqueNonEmpty(request.testsToRun)) {
        return { status: "blocked", reasonCode: "approval_list_invalid", field: "testsToRun" };
    }
    if (request.changeKind === "prompt_source") {
        if ((request.harnessChangeScope?.length ?? 0) > 0 || (request.harnessGuardrailsToPreserve?.length ?? 0) > 0) {
            return { status: "blocked", reasonCode: "harness_field_forbidden" };
        }
        return { status: "valid", request };
    }
    const scopes = request.harnessChangeScope ?? [];
    if (scopes.length === 0)
        return { status: "blocked", reasonCode: "harness_scope_required" };
    if (new Set(scopes).size !== scopes.length || scopes.some((scope) => !PROMPT_IMPROVEMENT_HARNESS_CHANGE_SCOPES.includes(scope))) {
        return { status: "blocked", reasonCode: "harness_scope_invalid" };
    }
    const guardrails = request.harnessGuardrailsToPreserve ?? [];
    if (new Set(guardrails).size !== guardrails.length || guardrails.some((guardrail) => !REQUIRED_HARNESS_GUARDRAILS.includes(guardrail))) {
        return { status: "blocked", reasonCode: "harness_guardrail_invalid" };
    }
    for (const guardrail of REQUIRED_HARNESS_GUARDRAILS) {
        if (!guardrails.includes(guardrail))
            return { status: "blocked", reasonCode: "harness_guardrail_missing", guardrail };
    }
    return { status: "valid", request };
}
export function decideDefaultRiskApprovalPolicy(input) {
    if (input.risk === "low") {
        if (!input.testsPassed || !input.rollbackAvailable)
            return { status: "blocked", reasonCode: "low_evidence_required" };
        return { status: "authorized", risk: "low", approvalMode: "tests_and_rollback" };
    }
    const approval = input.approval;
    if (!approval || approval.proposalFingerprint !== input.expectedProposalFingerprint || !exact(approval.actorId)) {
        return { status: "blocked", reasonCode: "approval_required" };
    }
    if (approval.decision !== "approved")
        return { status: "blocked", reasonCode: "approval_denied" };
    if (approval.actorType !== "user" && approval.actorType !== "administrator") {
        return { status: "blocked", reasonCode: "approval_actor_invalid" };
    }
    if (input.risk === "high" && !approval.explicitApproval) {
        return { status: "blocked", reasonCode: "explicit_approval_required" };
    }
    return {
        status: "authorized",
        risk: input.risk,
        approvalMode: input.risk === "high" ? "explicit" : "user_or_administrator",
    };
}
export async function applyCanonicalApprovedChange(input) {
    if (input.requestDecision.status !== "valid")
        return input.requestDecision;
    if (input.riskDecision.status !== "authorized")
        return input.riskDecision;
    return { status: "applied", result: await input.apply() };
}
//# sourceMappingURL=canonical-approval-policy.js.map