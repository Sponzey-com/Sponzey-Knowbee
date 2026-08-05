function ownsProposal(ownership, proposal) {
    return proposal.agentId === ownership.agentId && ownership.promptSourceRefs.includes(proposal.sourceRef);
}
export function createAgentPromptProposal(input) {
    if (input.actorAgentId !== input.ownership.agentId)
        return { ok: false, reason: "owner_violation" };
    if (!input.ownership.promptSourceRefs.includes(input.sourceRef))
        return { ok: false, reason: "source_not_owned" };
    return { ok: true, proposal: {
            state: "proposed",
            agentId: input.ownership.agentId,
            sourceRef: input.sourceRef,
            proposalRunId: input.runId,
            baseVersion: input.baseVersion,
            proposedVersion: input.proposedVersion,
            proposedChecksum: input.proposedChecksum,
            evidenceRefs: [...input.evidenceRefs],
            regressionTestRefs: [],
        } };
}
export function approveAgentPromptProposal(input) {
    if (!ownsProposal(input.ownership, input.proposal))
        return { ok: false, reason: "owner_violation" };
    if (input.reviewerAgentId !== input.ownership.reviewerAgentId)
        return { ok: false, reason: "reviewer_violation" };
    if (!input.regression.passed || input.regression.testRefs.length === 0)
        return { ok: false, reason: "regression_failed" };
    return { ok: true, proposal: {
            ...input.proposal,
            state: "approved",
            regressionTestRefs: [...input.regression.testRefs],
            approvedByAgentId: input.reviewerAgentId,
        } };
}
export function activateAgentPromptProposal(input) {
    if (!ownsProposal(input.ownership, input.proposal))
        return { ok: false, reason: "owner_violation" };
    if (input.proposal.state !== "approved" || input.proposal.approvedByAgentId !== input.ownership.reviewerAgentId || input.proposal.regressionTestRefs.length === 0) {
        return { ok: false, reason: "approval_missing" };
    }
    if (input.activationRunId === input.proposal.proposalRunId)
        return { ok: false, reason: "current_run_mutation" };
    return { ok: true, activeVersion: {
            state: "active",
            agentId: input.ownership.agentId,
            sourceRef: input.proposal.sourceRef,
            version: input.proposal.proposedVersion,
            checksum: input.proposal.proposedChecksum,
            previousVersion: input.proposal.baseVersion,
            proposalRunId: input.proposal.proposalRunId,
            activationRunId: input.activationRunId,
        } };
}
export function rollbackAgentPromptVersion(input) {
    if (input.activeVersion.agentId !== input.ownership.agentId || !input.ownership.promptSourceRefs.includes(input.activeVersion.sourceRef)) {
        return { ok: false, reason: "owner_violation" };
    }
    if (input.activeVersion.state !== "active" || input.rollbackVersion !== input.activeVersion.previousVersion) {
        return { ok: false, reason: "lineage_invalid" };
    }
    const { checksum: _discardedChecksum, ...lineage } = input.activeVersion;
    return { ok: true, activeVersion: {
            ...lineage,
            state: "rolled_back",
            version: input.rollbackVersion,
            previousVersion: input.activeVersion.version,
        } };
}
//# sourceMappingURL=agent-prompt-improvement.js.map