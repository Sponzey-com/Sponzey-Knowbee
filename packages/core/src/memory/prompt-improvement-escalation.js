export const PROMPT_IMPROVEMENT_ESCALATION_STAGES = [
    "prompt_investigation",
    "code_change_proposal",
    "implementation",
    "test_plan",
];
const EXACT_PROMPT_SOURCE = /^(?:prompts\/[a-z0-9_-]+(?:\.(?:ko|en))?\.md|[a-z0-9_]+:(?:ko|en)|prompt-metadata:[a-z0-9_.-]+)$/iu;
const DISGUISED_CHANGE = /^(?:packages\/|apps\/|scripts\/|config:|configuration:|env:|environment:|\.env(?:\.|$)|runtime:)/iu;
function nonEmpty(value) {
    return value.trim();
}
function task(stage, ownerAgentName, inputs, expectedOutputs, dependsOn, completionCriteria) {
    return { stage, ownerAgentName, inputs, expectedOutputs, dependsOn, completionCriteria };
}
export function decidePromptImprovementCapability(input) {
    const problem = nonEmpty(input.problem);
    const ownerAgentName = nonEmpty(input.ownerAgentName);
    const reason = nonEmpty(input.assessmentReason);
    const evidence = input.assessmentEvidence.map(nonEmpty).filter(Boolean);
    const targets = input.requestedTargetRefs.map(nonEmpty).filter(Boolean);
    if (!problem || !ownerAgentName || !reason || evidence.length === 0) {
        return { status: "blocked", reasonCode: "assessment_invalid" };
    }
    if (targets.some((target) => DISGUISED_CHANGE.test(target) || !EXACT_PROMPT_SOURCE.test(target))) {
        return { status: "blocked", reasonCode: "disguised_code_or_config_change" };
    }
    if (input.canSolveWithPromptOnly) {
        if (targets.length === 0)
            return { status: "blocked", reasonCode: "assessment_invalid" };
        return { status: "prompt_only_ready", promptSourceRefs: [...new Set(targets)] };
    }
    return {
        status: "escalation_required",
        workPackage: {
            problem,
            reason,
            evidence,
            tasks: [
                task("prompt_investigation", ownerAgentName, ["problem", "prompt sources", "behavior evidence"], ["prompt investigation report"], [], ["Prompt-only limitation is demonstrated with exact evidence."]),
                task("code_change_proposal", ownerAgentName, ["prompt investigation report"], ["bounded code change proposal"], ["prompt_investigation"], ["Affected code boundary, risk, and rollback are identified."]),
                task("implementation", ownerAgentName, ["approved code change proposal"], ["implementation change set"], ["code_change_proposal"], ["Implementation uses the explicit code execution port and stays within approved scope."]),
                task("test_plan", ownerAgentName, ["implementation change set", "original behavior evidence"], ["executable regression test plan"], ["implementation"], ["Tests cover the original failure, changed behavior, and rollback path."]),
            ],
        },
    };
}
export async function applyPromptOnlyDecision(input) {
    if (input.decision.status !== "prompt_only_ready")
        return input.decision;
    return { status: "applied", result: await input.applyPrompt(input.decision.promptSourceRefs) };
}
export async function executeApprovedImplementation(input) {
    if (input.task.stage !== "implementation")
        return { status: "blocked", reasonCode: "implementation_task_required" };
    if (!input.approved)
        return { status: "blocked", reasonCode: "implementation_approval_required" };
    return { status: "executed", result: await input.executeImplementation(input.task) };
}
function completeStrings(values) {
    return values.length > 0 && values.every((value) => value.trim().length > 0) && new Set(values.map((value) => value.trim())).size === values.length;
}
function sameScope(left, right) {
    const a = [...new Set(left.map((value) => value.trim()).filter(Boolean))].sort();
    const b = [...new Set(right.map((value) => value.trim()).filter(Boolean))].sort();
    return a.length === b.length && a.every((value, index) => value === b[index]);
}
export function validatePromptImprovementEscalationArtifact(input) {
    const artifact = input.artifact;
    if (!artifact.stage || !["prompt_investigation", "code_change_proposal", "test_plan"].includes(artifact.stage)) {
        return { status: "blocked", reasonCode: "artifact_stage_invalid" };
    }
    if (!artifact.workPackageId?.trim()
        || !artifact.ownerAgentName?.trim()
        || !artifact.artifactFingerprint?.trim()
        || artifact.workPackageId !== input.expectedWorkPackageId
        || artifact.ownerAgentName !== input.expectedOwnerAgentName)
        return { status: "blocked", reasonCode: "artifact_required_field_missing" };
    if (artifact.predecessorFingerprint !== input.expectedPredecessorFingerprint) {
        return { status: "blocked", reasonCode: "artifact_lineage_mismatch" };
    }
    if (artifact.stage === "prompt_investigation") {
        const investigation = artifact;
        if (!investigation.observedBehavior?.trim() || !investigation.limitationReason?.trim() || !completeStrings(investigation.promptEvidence ?? []) || !completeStrings(investigation.affectedPromptSources ?? [])) {
            return { status: "blocked", reasonCode: "artifact_required_field_missing" };
        }
    }
    else if (artifact.stage === "code_change_proposal") {
        const proposal = artifact;
        if (!completeStrings(proposal.exactCodeBoundary ?? []) || !proposal.changeIntent?.trim() || !proposal.risk || !proposal.rollbackPlan?.trim() || proposal.approvalRequired !== true) {
            return { status: "blocked", reasonCode: "artifact_required_field_missing" };
        }
    }
    else {
        const testPlan = artifact;
        if (!completeStrings(testPlan.implementationScope ?? []) || !testPlan.originalFailure?.trim() || !testPlan.expectedBehavior?.trim() || !completeStrings(testPlan.regressionCommands ?? []) || !testPlan.rollbackVerification?.trim()) {
            return { status: "blocked", reasonCode: "artifact_required_field_missing" };
        }
        if (!input.approvedImplementationScope || !sameScope(testPlan.implementationScope ?? [], input.approvedImplementationScope)) {
            return { status: "blocked", reasonCode: "artifact_scope_invalid" };
        }
    }
    return { status: "ready", artifact: artifact };
}
export async function executeValidatedEscalationArtifact(input) {
    if (input.decision.status !== "ready")
        return input.decision;
    return { status: "executed", result: await input.execute(input.decision.artifact) };
}
//# sourceMappingURL=prompt-improvement-escalation.js.map