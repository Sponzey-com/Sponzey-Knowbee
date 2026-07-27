export type AgentPromptImprovementReason = "owner_violation" | "source_not_owned" | "reviewer_violation" | "regression_failed" | "approval_missing" | "current_run_mutation" | "lineage_invalid";
export interface AgentPromptOwnership {
    agentId: string;
    agentType: "main" | "sub_agent";
    reviewerAgentId: string;
    promptSourceRefs: readonly string[];
}
export interface AgentPromptProposal {
    state: "proposed" | "approved";
    agentId: string;
    sourceRef: string;
    proposalRunId: string;
    baseVersion: string;
    proposedVersion: string;
    proposedChecksum: string;
    evidenceRefs: readonly string[];
    regressionTestRefs: readonly string[];
    approvedByAgentId?: string;
}
export interface AgentPromptActiveVersion {
    state: "active" | "rolled_back";
    agentId: string;
    sourceRef: string;
    version: string;
    checksum?: string;
    previousVersion: string;
    proposalRunId: string;
    activationRunId: string;
}
type Result<T> = ({
    ok: true;
} & T) | {
    ok: false;
    reason: AgentPromptImprovementReason;
};
export declare function createAgentPromptProposal(input: {
    ownership: AgentPromptOwnership;
    actorAgentId: string;
    runId: string;
    sourceRef: string;
    baseVersion: string;
    proposedVersion: string;
    proposedChecksum: string;
    evidenceRefs: readonly string[];
}): Result<{
    proposal: AgentPromptProposal;
}>;
export declare function approveAgentPromptProposal(input: {
    ownership: AgentPromptOwnership;
    proposal: AgentPromptProposal;
    reviewerAgentId: string;
    regression: {
        passed: boolean;
        testRefs: readonly string[];
    };
}): Result<{
    proposal: AgentPromptProposal;
}>;
export declare function activateAgentPromptProposal(input: {
    ownership: AgentPromptOwnership;
    proposal: AgentPromptProposal;
    activationRunId: string;
}): Result<{
    activeVersion: AgentPromptActiveVersion;
}>;
export declare function rollbackAgentPromptVersion(input: {
    ownership: AgentPromptOwnership;
    activeVersion: AgentPromptActiveVersion;
    rollbackVersion: string;
}): Result<{
    activeVersion: AgentPromptActiveVersion;
}>;
export {};
//# sourceMappingURL=agent-prompt-improvement.d.ts.map