export declare const PROMPT_IMPROVEMENT_ESCALATION_STAGES: readonly ["prompt_investigation", "code_change_proposal", "implementation", "test_plan"];
export type PromptImprovementEscalationStage = typeof PROMPT_IMPROVEMENT_ESCALATION_STAGES[number];
export interface PromptImprovementEscalationTask {
    stage: PromptImprovementEscalationStage;
    ownerAgentName: string;
    inputs: string[];
    expectedOutputs: string[];
    dependsOn: PromptImprovementEscalationStage[];
    completionCriteria: string[];
}
export interface PromptImprovementEscalationPackage {
    problem: string;
    reason: string;
    evidence: string[];
    tasks: PromptImprovementEscalationTask[];
}
interface EscalationArtifactBase {
    workPackageId: string;
    ownerAgentName: string;
    artifactFingerprint: string;
    predecessorFingerprint: string | null;
}
export interface PromptInvestigationArtifact extends EscalationArtifactBase {
    stage: "prompt_investigation";
    observedBehavior: string;
    promptEvidence: string[];
    limitationReason: string;
    affectedPromptSources: string[];
}
export interface CodeChangeProposalArtifact extends EscalationArtifactBase {
    stage: "code_change_proposal";
    exactCodeBoundary: string[];
    changeIntent: string;
    risk: "low" | "medium" | "high";
    rollbackPlan: string;
    approvalRequired: boolean;
}
export interface EscalationTestPlanArtifact extends EscalationArtifactBase {
    stage: "test_plan";
    implementationScope: string[];
    originalFailure: string;
    expectedBehavior: string;
    regressionCommands: string[];
    rollbackVerification: string;
}
export type PromptImprovementEscalationArtifact = PromptInvestigationArtifact | CodeChangeProposalArtifact | EscalationTestPlanArtifact;
export type PromptImprovementEscalationArtifactDecision = {
    status: "ready";
    artifact: PromptImprovementEscalationArtifact;
} | {
    status: "blocked";
    reasonCode: "artifact_required_field_missing" | "artifact_scope_invalid" | "artifact_lineage_mismatch" | "artifact_stage_invalid";
};
export type PromptImprovementCapabilityDecision = {
    status: "prompt_only_ready";
    promptSourceRefs: string[];
} | {
    status: "escalation_required";
    workPackage: PromptImprovementEscalationPackage;
} | {
    status: "blocked";
    reasonCode: "disguised_code_or_config_change" | "assessment_invalid";
};
export declare function decidePromptImprovementCapability(input: {
    problem: string;
    ownerAgentName: string;
    canSolveWithPromptOnly: boolean;
    assessmentReason: string;
    assessmentEvidence: string[];
    requestedTargetRefs: string[];
}): PromptImprovementCapabilityDecision;
export declare function applyPromptOnlyDecision<T>(input: {
    decision: PromptImprovementCapabilityDecision;
    applyPrompt: (sourceRefs: string[]) => Promise<T>;
}): Promise<{
    status: "applied";
    result: T;
} | Exclude<PromptImprovementCapabilityDecision, {
    status: "prompt_only_ready";
}>>;
export declare function executeApprovedImplementation<T>(input: {
    task: PromptImprovementEscalationTask;
    approved: boolean;
    executeImplementation: (task: PromptImprovementEscalationTask) => Promise<T>;
}): Promise<{
    status: "executed";
    result: T;
} | {
    status: "blocked";
    reasonCode: "implementation_task_required" | "implementation_approval_required";
}>;
export declare function validatePromptImprovementEscalationArtifact(input: {
    artifact: Partial<PromptImprovementEscalationArtifact>;
    expectedWorkPackageId: string;
    expectedOwnerAgentName: string;
    expectedPredecessorFingerprint: string | null;
    approvedImplementationScope?: string[];
}): PromptImprovementEscalationArtifactDecision;
export declare function executeValidatedEscalationArtifact<T>(input: {
    decision: PromptImprovementEscalationArtifactDecision;
    execute: (artifact: PromptImprovementEscalationArtifact) => Promise<T>;
}): Promise<{
    status: "executed";
    result: T;
} | {
    status: "blocked";
    reasonCode: string;
}>;
export {};
//# sourceMappingURL=prompt-improvement-escalation.d.ts.map