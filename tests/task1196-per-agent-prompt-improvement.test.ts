import { describe, expect, it } from "vitest"
import {
  activateAgentPromptProposal,
  approveAgentPromptProposal,
  createAgentPromptProposal,
  rollbackAgentPromptVersion,
  type AgentPromptOwnership,
} from "../packages/core/src/memory/agent-prompt-improvement.ts"

const mainOwnership: AgentPromptOwnership = {
  agentId: "agent:main",
  agentType: "main",
  reviewerAgentId: "user:owner",
  promptSourceRefs: ["main_identity:en"],
}

const subOwnership: AgentPromptOwnership = {
  agentId: "agent:research",
  agentType: "sub_agent",
  reviewerAgentId: "agent:main",
  promptSourceRefs: ["sub_agent_research:en"],
}

function approvedProposal(ownership: AgentPromptOwnership, version: string) {
  const proposed = createAgentPromptProposal({
    ownership,
    actorAgentId: ownership.agentId,
    runId: `run:proposal:${version}`,
    sourceRef: ownership.promptSourceRefs[0]!,
    baseVersion: "sha256:base",
    proposedVersion: version,
    proposedChecksum: `${version}:checksum`,
    evidenceRefs: ["execution:result-review:1"],
  })
  expect(proposed.ok).toBe(true)
  if (!proposed.ok) throw new Error(proposed.reason)

  const approved = approveAgentPromptProposal({
    ownership,
    proposal: proposed.proposal,
    reviewerAgentId: ownership.reviewerAgentId,
    regression: { passed: true, testRefs: ["test:prompt-regression"] },
  })
  expect(approved.ok).toBe(true)
  if (!approved.ok) throw new Error(approved.reason)
  return approved.proposal
}

describe("task1196 per-agent prompt improvement lifecycle", () => {
  it("keeps main and sub-agent proposals and active versions independent", () => {
    const main = approvedProposal(mainOwnership, "sha256:main-next")
    const sub = approvedProposal(subOwnership, "sha256:sub-next")

    const activeMain = activateAgentPromptProposal({
      ownership: mainOwnership,
      proposal: main,
      activationRunId: "run:next:main",
    })
    const activeSub = activateAgentPromptProposal({
      ownership: subOwnership,
      proposal: sub,
      activationRunId: "run:next:sub",
    })

    expect(activeMain).toMatchObject({
      ok: true,
      activeVersion: { agentId: "agent:main", version: "sha256:main-next" },
    })
    expect(activeSub).toMatchObject({
      ok: true,
      activeVersion: { agentId: "agent:research", version: "sha256:sub-next" },
    })
  })

  it("rejects cross-agent edits and reviewers outside the ownership contract", () => {
    expect(createAgentPromptProposal({
      ownership: subOwnership,
      actorAgentId: "agent:sibling",
      runId: "run:proposal:escape",
      sourceRef: "sub_agent_research:en",
      baseVersion: "sha256:base",
      proposedVersion: "sha256:escape",
      proposedChecksum: "escape-checksum",
      evidenceRefs: ["feedback:1"],
    })).toEqual({ ok: false, reason: "owner_violation" })

    const proposed = createAgentPromptProposal({
      ownership: subOwnership,
      actorAgentId: subOwnership.agentId,
      runId: "run:proposal:reviewer",
      sourceRef: "sub_agent_research:en",
      baseVersion: "sha256:base",
      proposedVersion: "sha256:reviewer",
      proposedChecksum: "reviewer-checksum",
      evidenceRefs: ["feedback:1"],
    })
    if (!proposed.ok) throw new Error(proposed.reason)
    expect(approveAgentPromptProposal({
      ownership: subOwnership,
      proposal: proposed.proposal,
      reviewerAgentId: "agent:sibling",
      regression: { passed: true, testRefs: ["test:prompt-regression"] },
    })).toEqual({ ok: false, reason: "reviewer_violation" })
  })

  it("rejects failed regression, unapproved activation, and current-run mutation", () => {
    const proposed = createAgentPromptProposal({
      ownership: mainOwnership,
      actorAgentId: mainOwnership.agentId,
      runId: "run:current",
      sourceRef: "main_identity:en",
      baseVersion: "sha256:base",
      proposedVersion: "sha256:next",
      proposedChecksum: "next-checksum",
      evidenceRefs: ["feedback:1"],
    })
    if (!proposed.ok) throw new Error(proposed.reason)

    expect(approveAgentPromptProposal({
      ownership: mainOwnership,
      proposal: proposed.proposal,
      reviewerAgentId: mainOwnership.reviewerAgentId,
      regression: { passed: false, testRefs: ["test:failed"] },
    })).toEqual({ ok: false, reason: "regression_failed" })
    expect(activateAgentPromptProposal({
      ownership: mainOwnership,
      proposal: proposed.proposal,
      activationRunId: "run:next",
    })).toEqual({ ok: false, reason: "approval_missing" })

    const approved = approvedProposal(mainOwnership, "sha256:current-run")
    expect(activateAgentPromptProposal({
      ownership: mainOwnership,
      proposal: approved,
      activationRunId: approved.proposalRunId,
    })).toEqual({ ok: false, reason: "current_run_mutation" })
  })

  it("rolls back only to the activated proposal base lineage", () => {
    const approved = approvedProposal(subOwnership, "sha256:sub-rollback")
    const activated = activateAgentPromptProposal({
      ownership: subOwnership,
      proposal: approved,
      activationRunId: "run:next:rollback",
    })
    if (!activated.ok) throw new Error(activated.reason)

    expect(rollbackAgentPromptVersion({
      ownership: subOwnership,
      activeVersion: activated.activeVersion,
      rollbackVersion: "sha256:unrelated",
    })).toEqual({ ok: false, reason: "lineage_invalid" })
    expect(rollbackAgentPromptVersion({
      ownership: subOwnership,
      activeVersion: activated.activeVersion,
      rollbackVersion: "sha256:base",
    })).toMatchObject({
      ok: true,
      activeVersion: {
        agentId: "agent:research",
        version: "sha256:base",
        state: "rolled_back",
      },
    })
  })
})
