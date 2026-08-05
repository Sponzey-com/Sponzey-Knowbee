export type AgentPromptImprovementReason =
  | "owner_violation"
  | "source_not_owned"
  | "reviewer_violation"
  | "regression_failed"
  | "approval_missing"
  | "current_run_mutation"
  | "lineage_invalid"

export interface AgentPromptOwnership {
  agentId: string
  agentType: "main" | "sub_agent"
  reviewerAgentId: string
  promptSourceRefs: readonly string[]
}

export interface AgentPromptProposal {
  state: "proposed" | "approved"
  agentId: string
  sourceRef: string
  proposalRunId: string
  baseVersion: string
  proposedVersion: string
  proposedChecksum: string
  evidenceRefs: readonly string[]
  regressionTestRefs: readonly string[]
  approvedByAgentId?: string
}

export interface AgentPromptActiveVersion {
  state: "active" | "rolled_back"
  agentId: string
  sourceRef: string
  version: string
  checksum?: string
  previousVersion: string
  proposalRunId: string
  activationRunId: string
}

type Result<T> = ({ ok: true } & T) | { ok: false; reason: AgentPromptImprovementReason }

function ownsProposal(ownership: AgentPromptOwnership, proposal: AgentPromptProposal): boolean {
  return proposal.agentId === ownership.agentId && ownership.promptSourceRefs.includes(proposal.sourceRef)
}

export function createAgentPromptProposal(input: {
  ownership: AgentPromptOwnership
  actorAgentId: string
  runId: string
  sourceRef: string
  baseVersion: string
  proposedVersion: string
  proposedChecksum: string
  evidenceRefs: readonly string[]
}): Result<{ proposal: AgentPromptProposal }> {
  if (input.actorAgentId !== input.ownership.agentId) return { ok: false, reason: "owner_violation" }
  if (!input.ownership.promptSourceRefs.includes(input.sourceRef)) return { ok: false, reason: "source_not_owned" }
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
  } }
}

export function approveAgentPromptProposal(input: {
  ownership: AgentPromptOwnership
  proposal: AgentPromptProposal
  reviewerAgentId: string
  regression: { passed: boolean; testRefs: readonly string[] }
}): Result<{ proposal: AgentPromptProposal }> {
  if (!ownsProposal(input.ownership, input.proposal)) return { ok: false, reason: "owner_violation" }
  if (input.reviewerAgentId !== input.ownership.reviewerAgentId) return { ok: false, reason: "reviewer_violation" }
  if (!input.regression.passed || input.regression.testRefs.length === 0) return { ok: false, reason: "regression_failed" }
  return { ok: true, proposal: {
    ...input.proposal,
    state: "approved",
    regressionTestRefs: [...input.regression.testRefs],
    approvedByAgentId: input.reviewerAgentId,
  } }
}

export function activateAgentPromptProposal(input: {
  ownership: AgentPromptOwnership
  proposal: AgentPromptProposal
  activationRunId: string
}): Result<{ activeVersion: AgentPromptActiveVersion }> {
  if (!ownsProposal(input.ownership, input.proposal)) return { ok: false, reason: "owner_violation" }
  if (input.proposal.state !== "approved" || input.proposal.approvedByAgentId !== input.ownership.reviewerAgentId || input.proposal.regressionTestRefs.length === 0) {
    return { ok: false, reason: "approval_missing" }
  }
  if (input.activationRunId === input.proposal.proposalRunId) return { ok: false, reason: "current_run_mutation" }
  return { ok: true, activeVersion: {
    state: "active",
    agentId: input.ownership.agentId,
    sourceRef: input.proposal.sourceRef,
    version: input.proposal.proposedVersion,
    checksum: input.proposal.proposedChecksum,
    previousVersion: input.proposal.baseVersion,
    proposalRunId: input.proposal.proposalRunId,
    activationRunId: input.activationRunId,
  } }
}

export function rollbackAgentPromptVersion(input: {
  ownership: AgentPromptOwnership
  activeVersion: AgentPromptActiveVersion
  rollbackVersion: string
}): Result<{ activeVersion: AgentPromptActiveVersion }> {
  if (input.activeVersion.agentId !== input.ownership.agentId || !input.ownership.promptSourceRefs.includes(input.activeVersion.sourceRef)) {
    return { ok: false, reason: "owner_violation" }
  }
  if (input.activeVersion.state !== "active" || input.rollbackVersion !== input.activeVersion.previousVersion) {
    return { ok: false, reason: "lineage_invalid" }
  }
  const { checksum: _discardedChecksum, ...lineage } = input.activeVersion
  return { ok: true, activeVersion: {
    ...lineage,
    state: "rolled_back",
    version: input.rollbackVersion,
    previousVersion: input.activeVersion.version,
  } }
}
