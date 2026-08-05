import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  applyAuthorizedAgentPromptImprovement,
  authorizeAgentPromptImprovement,
  PROMPT_IMPROVEMENT_PROTECTED_INVARIANTS,
  type AgentPromptImprovementOwnershipSnapshot,
  type PromptImprovementInvariantReview,
  type SubAgentPromptImprovementApprovalReceipt,
} from "../packages/core/src/index.ts"

const now = Date.UTC(2026, 6, 14, 15, 0, 0)

function ownership(agentType: "main" | "sub_agent" = "sub_agent"): AgentPromptImprovementOwnershipSnapshot {
  return {
    schemaVersion: 1,
    agentId: agentType === "main" ? "agent:main" : "agent:child",
    agentName: agentType === "main" ? "마당쇠" : "조사 담당",
    agentType,
    roleRefs: ["role:research"],
    promptSourceRefs: ["prompt:workflow"],
    policyRefs: ["policy:research"],
    testFixtureRefs: ["fixture:workflow"],
    platformOwnedRefs: [
      "prompt:system", "policy:safety", "policy:tool", "policy:yeonjang",
    ],
    reviewerAgentId: agentType === "main" ? "user:owner" : "agent:main",
    fingerprint: `ownership:${agentType}:v1`,
    capturedAt: now,
  }
}

function reviews(): PromptImprovementInvariantReview[] {
  return PROMPT_IMPROVEMENT_PROTECTED_INVARIANTS.map((invariant) => ({
    invariant,
    baselineRef: `baseline:${invariant}`,
    proposedEffect: `${invariant} remains unchanged`,
    result: "preserved",
    regressionTestReceiptRef: `test:${invariant}`,
    regressionPassed: true,
  }))
}

function approval(overrides: Partial<SubAgentPromptImprovementApprovalReceipt> = {}): SubAgentPromptImprovementApprovalReceipt {
  return {
    schemaVersion: 1,
    approvalId: "approval:parent:1",
    proposalFingerprint: "proposal:v1",
    ownershipFingerprint: "ownership:sub_agent:v1",
    invariantReviewFingerprint: "invariants:v1",
    reviewerAgentId: "agent:main",
    approvedAgentId: "agent:child",
    approvedPromptSourceRefs: ["prompt:workflow"],
    decision: "approved",
    approvedAt: now,
    expiresAt: now + 60_000,
    ...overrides,
  }
}

function authorize(overrides: Record<string, unknown> = {}) {
  return authorizeAgentPromptImprovement({
    proposalFingerprint: "proposal:v1",
    expectedOwnershipFingerprint: "ownership:sub_agent:v1",
    invariantReviewFingerprint: "invariants:v1",
    ownership: ownership(),
    scope: {
      roleRefs: ["role:research"], promptSourceRefs: ["prompt:workflow"],
      policyRefs: ["policy:research"], testFixtureRefs: ["fixture:workflow"],
    },
    invariantReviews: reviews(),
    parentApproval: approval(),
    now,
    maxOwnershipAgeMs: 1_000,
    ...overrides,
  })
}

describe("task1233 agent prompt improvement authorization", () => {
  it("defines every agent and platform protected GOAL invariant", () => {
    expect(PROMPT_IMPROVEMENT_PROTECTED_INVARIANTS).toEqual([
      "user_identity", "agent_identity", "memory_isolation",
      "permission", "safety", "response_language",
      "delegation_rules", "tool_boundary", "yeonjang_authorization",
    ])
  })

  it("authorizes a main agent after owned-scope and invariant review without parent approval", () => {
    const main = ownership("main")
    expect(authorize({
      ownership: main,
      expectedOwnershipFingerprint: main.fingerprint,
      parentApproval: undefined,
    })).toEqual({
      status: "authorized", agentType: "main", proposalFingerprint: "proposal:v1", authorization: "owner_invariant_review",
    })
  })

  it("authorizes a sub-agent only with its exact parent approval", () => {
    expect(authorize()).toEqual({
      status: "authorized", agentType: "sub_agent", proposalFingerprint: "proposal:v1", authorization: "parent_approval",
    })
    expect(authorize({ parentApproval: undefined })).toEqual({ status: "blocked", reasonCode: "parent_approval_missing" })
  })

  it.each([
    ["roleRefs", "role:other"],
    ["promptSourceRefs", "prompt:other"],
    ["policyRefs", "policy:other"],
    ["testFixtureRefs", "fixture:other"],
  ] as const)("rejects unowned %s", (key, value) => {
    const scope = {
      roleRefs: ["role:research"], promptSourceRefs: ["prompt:workflow"],
      policyRefs: ["policy:research"], testFixtureRefs: ["fixture:workflow"],
      [key]: [value],
    }
    expect(authorize({ scope })).toEqual({ status: "blocked", reasonCode: "scope_not_owned" })
  })

  it.each([
    ["promptSourceRefs", "prompt:system"],
    ["policyRefs", "policy:safety"],
    ["policyRefs", "policy:tool"],
    ["policyRefs", "policy:yeonjang"],
  ] as const)("rejects sub-agent access to platform-owned %s %s even when listed as owned", (key, value) => {
    const sub = ownership()
    sub[key] = [...sub[key], value]
    const scope = {
      roleRefs: ["role:research"],
      promptSourceRefs: ["prompt:workflow"],
      policyRefs: ["policy:research"],
      testFixtureRefs: ["fixture:workflow"],
      [key]: [value],
    }
    expect(authorize({ ownership: sub, scope })).toEqual({
      status: "blocked",
      reasonCode: "platform_scope_protected",
    })
  })

  it("rejects stale and mismatched ownership snapshots", () => {
    expect(authorize({ now: now + 1_001 })).toEqual({ status: "blocked", reasonCode: "ownership_snapshot_stale" })
    expect(authorize({ expectedOwnershipFingerprint: "ownership:old" })).toEqual({
      status: "blocked", reasonCode: "ownership_fingerprint_mismatch",
    })
  })

  it("requires complete, preserved, passing invariant evidence", () => {
    expect(authorize({ invariantReviews: reviews().slice(1) })).toEqual({
      status: "blocked", reasonCode: "invariant_review_incomplete",
    })
    const weakened = reviews()
    weakened[0] = { ...weakened[0]!, result: "weakened" }
    expect(authorize({ invariantReviews: weakened })).toEqual({ status: "blocked", reasonCode: "invariant_weakened" })
    const failed = reviews()
    failed[1] = { ...failed[1]!, regressionPassed: false }
    expect(authorize({ invariantReviews: failed })).toEqual({
      status: "blocked", reasonCode: "invariant_regression_failed",
    })
  })

  it.each([
    [{ reviewerAgentId: "agent:other" }, "parent_reviewer_mismatch"],
    [{ decision: "denied" }, "parent_approval_denied"],
    [{ expiresAt: now }, "parent_approval_expired"],
    [{ proposalFingerprint: "proposal:other" }, "parent_approval_scope_mismatch"],
    [{ ownershipFingerprint: "ownership:old" }, "parent_approval_scope_mismatch"],
    [{ invariantReviewFingerprint: "invariants:old" }, "parent_approval_scope_mismatch"],
    [{ approvedAgentId: "agent:other" }, "parent_approval_scope_mismatch"],
    [{ approvedPromptSourceRefs: ["prompt:other"] }, "parent_approval_scope_mismatch"],
  ] as const)("rejects invalid parent approval %o", (overrides, reasonCode) => {
    expect(authorize({ parentApproval: approval(overrides) })).toEqual({ status: "blocked", reasonCode })
  })

  it("rejects a sub-agent configured to review itself", () => {
    const self = ownership()
    self.reviewerAgentId = self.agentId
    expect(authorize({ ownership: self })).toEqual({ status: "blocked", reasonCode: "parent_self_review" })
  })

  it("never invokes apply before authorization", async () => {
    const apply = vi.fn(async () => "written")
    await expect(applyAuthorizedAgentPromptImprovement({
      authorization: authorize({ parentApproval: undefined }), apply,
    })).resolves.toEqual({ status: "blocked", reasonCode: "parent_approval_missing" })
    expect(apply).not.toHaveBeenCalled()
    await expect(applyAuthorizedAgentPromptImprovement({ authorization: authorize(), apply })).resolves.toEqual({
      status: "applied", result: "written",
    })
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it("keeps ownership and approval authorization independent from external systems", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/agent-prompt-improvement-authorization.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/from ["'](?:node:|better-sqlite3|mqtt|openai|@anthropic-ai\/sdk)/)
    expect(source).not.toMatch(/process\.env|Date\.now|fetch\(|readFile|writeFile|globalThis/)
  })
})
