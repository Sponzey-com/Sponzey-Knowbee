import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  PROMPT_IMPROVEMENT_IMPACT_KINDS,
  authorizePromptInvariantCoverage,
  type GoalProductInvariantRuleSnapshot,
  type HarnessInvariantProjectionRuleSnapshot,
  type PromptInvariantCoverageEvidence,
} from "../packages/core/src/contracts/prompt-invariant-coverage.ts"
import type { PlatformPromptProtectedInvariant } from "../packages/core/src/contracts/prompt-improvement-application-gate.ts"

const now = 1_000
const proposalFingerprint = "proposal:1392"
const sourceSetFingerprint = "sources:1392"
const goalSection3Fingerprint = "goal:section3:v1"

const invariantByImpact: Record<(typeof PROMPT_IMPROVEMENT_IMPACT_KINDS)[number], PlatformPromptProtectedInvariant> = {
  identity: "product_identity",
  delegation: "delegation_rules",
  memory: "memory_isolation",
  yeonjang: "tool_boundary",
  tool_mcp: "tool_boundary",
  safety: "safety_rules",
  recursive_ownership: "delegation_rules",
}

function coverage(): PromptInvariantCoverageEvidence[] {
  const firstForInvariant = new Set<PlatformPromptProtectedInvariant>()
  return PROMPT_IMPROVEMENT_IMPACT_KINDS.map((impact) => {
    const invariant = invariantByImpact[impact]
    const applicationReview = !firstForInvariant.has(invariant)
    firstForInvariant.add(invariant)
    return {
      impact,
      goalSection3Fingerprint,
      evidenceRef: `evidence:${impact}:1392`,
      applicationReview,
      review: {
        invariant,
        proposalFingerprint,
        baselineFingerprint: `${impact}:baseline`,
        proposedFingerprint: `${impact}:proposed`,
        decision: "preserved",
        reviewerRef: "reviewer:main",
        reviewedAt: now,
        expiresAt: now + 100,
      },
    }
  })
}

function canonicalRules(): GoalProductInvariantRuleSnapshot[] {
  return PROMPT_IMPROVEMENT_IMPACT_KINDS.map((impact) => ({
    ruleId: `goal3:${impact}`,
    semanticChecksum: `semantic:${impact}:v1`,
    enforcement: impact === "safety" ? "strict" : "required",
  }))
}

function projections(): HarnessInvariantProjectionRuleSnapshot[] {
  return canonicalRules().map((rule) => ({
    projectionRuleId: rule.ruleId.replace("goal3:", "goal9.6:"),
    canonicalRuleId: rule.ruleId,
    semanticChecksum: rule.semanticChecksum,
    enforcement: rule.enforcement,
  }))
}

const commonPolicyDecision = {
  status: "authorized" as const,
  authorization: {
    schemaVersion: 1 as const,
    status: "source_write_authorized" as const,
    proposalFingerprint,
    impact: "common_safety" as const,
    sourceSetFingerprint,
    sources: [],
    mainReviewId: "main-review:1392",
  },
}

function authorize(overrides: Record<string, unknown> = {}) {
  return authorizePromptInvariantCoverage({
    declaredImpacts: [...PROMPT_IMPROVEMENT_IMPACT_KINDS],
    analyzedImpacts: [...PROMPT_IMPROVEMENT_IMPACT_KINDS],
    coverage: coverage(),
    canonicalRules: canonicalRules(),
    harnessProjectionRules: projections(),
    ownershipMode: "common_policy",
    targetOwnerAgentId: "agent:knowbee",
    configuredMainAgentId: "agent:knowbee",
    platformSourceDecision: commonPolicyDecision,
    proposalFingerprint,
    sourceSetFingerprint,
    goalSection3Fingerprint,
    reviewerRef: "reviewer:main",
    reviewedAt: now,
    expiresAt: now + 100,
    ...overrides,
  })
}

describe("task1392 prompt invariant coverage and common-policy ownership review", () => {
  it("authorizes every analyzed impact with section-3 precedence and main final review", () => {
    expect(authorize()).toMatchObject({
      status: "authorized",
      receipt: {
        proposalFingerprint,
        coveredImpacts: PROMPT_IMPROVEMENT_IMPACT_KINDS,
        goalSection3Fingerprint,
        ownershipMode: "common_policy",
        mainReviewId: "main-review:1392",
      },
      applicationReviews: expect.arrayContaining([
        expect.objectContaining({ invariant: "product_identity" }),
        expect.objectContaining({ invariant: "delegation_rules" }),
        expect.objectContaining({ invariant: "memory_isolation" }),
        expect.objectContaining({ invariant: "tool_boundary" }),
        expect.objectContaining({ invariant: "safety_rules" }),
      ]),
    })
  })

  it("rejects declared and analyzed impact mismatch", () => {
    expect(authorize({ declaredImpacts: ["identity"] }))
      .toEqual({ status: "blocked", reasonCode: "impact_scope_mismatch" })
  })

  it.each([
    ["missing", (items: PromptInvariantCoverageEvidence[]) => items.slice(1), "invariant_review_missing"],
    ["duplicate", (items: PromptInvariantCoverageEvidence[]) => [...items, items[0]!], "invariant_review_duplicate"],
    ["denied", (items: PromptInvariantCoverageEvidence[]) => items.map((item, index) => index === 0 ? { ...item, review: { ...item.review, decision: "denied" as const } } : item), "invariant_not_preserved"],
    ["proposal", (items: PromptInvariantCoverageEvidence[]) => items.map((item, index) => index === 0 ? { ...item, review: { ...item.review, proposalFingerprint: "proposal:other" } } : item), "invariant_review_scope_mismatch"],
    ["section 3", (items: PromptInvariantCoverageEvidence[]) => items.map((item, index) => index === 0 ? { ...item, goalSection3Fingerprint: "goal:section3:v2" } : item), "goal_section3_lineage_mismatch"],
    ["expired", (items: PromptInvariantCoverageEvidence[]) => items.map((item, index) => index === 0 ? { ...item, review: { ...item.review, expiresAt: now } } : item), "invariant_review_expired"],
  ] as const)("rejects %s invariant coverage", (_label, mutate, reasonCode) => {
    expect(authorize({ coverage: mutate(coverage()) })).toEqual({ status: "blocked", reasonCode })
  })

  it("requires exactly one application review for every covered platform invariant", () => {
    const none = coverage().map((item) => ({ ...item, applicationReview: false }))
    expect(authorize({ coverage: none })).toEqual({ status: "blocked", reasonCode: "application_review_missing" })
    const duplicate = coverage()
    duplicate[4] = { ...duplicate[4]!, applicationReview: true }
    expect(authorize({ coverage: duplicate })).toEqual({ status: "blocked", reasonCode: "application_review_duplicate" })
  })

  it.each([
    ["missing projection", projections().slice(1), "harness_projection_missing"],
    ["orphan projection", [...projections(), { projectionRuleId: "goal9.6:orphan", canonicalRuleId: "goal3:orphan", semanticChecksum: "semantic:orphan", enforcement: "required" as const }], "harness_projection_orphan"],
    ["semantic conflict", projections().map((item, index) => index === 0 ? { ...item, semanticChecksum: "semantic:conflict" } : item), "goal_section3_conflict"],
    ["enforcement conflict", projections().map((item, index) => index === 0 ? { ...item, enforcement: "advisory" as const } : item), "goal_section3_conflict"],
  ] as const)("keeps chapter 3 authoritative for %s", (_label, harnessProjectionRules, reasonCode) => {
    const result = authorize({ harnessProjectionRules })
    expect(result).toMatchObject({ status: "blocked", reasonCode })
    if (reasonCode === "goal_section3_conflict") {
      expect(result).toMatchObject({ corrections: [expect.objectContaining({ authoritativeRuleId: "goal3:identity" })] })
    }
  })

  it("requires an exact main-agent final review for common policy", () => {
    expect(authorize({ platformSourceDecision: undefined }))
      .toEqual({ status: "blocked", reasonCode: "common_policy_final_review_missing" })
    expect(authorize({ platformSourceDecision: { status: "blocked", reasonCode: "main_review_denied" } }))
      .toEqual({ status: "blocked", reasonCode: "common_policy_final_review_blocked" })
    expect(authorize({ platformSourceDecision: {
      ...commonPolicyDecision,
      authorization: { ...commonPolicyDecision.authorization, proposalFingerprint: "proposal:other" },
    } })).toEqual({ status: "blocked", reasonCode: "common_policy_final_review_scope_mismatch" })
  })

  it("requires exact owner authorization for agent-owned sources", () => {
    const ownershipDecision = {
      status: "authorized" as const,
      agentType: "sub_agent" as const,
      proposalFingerprint,
      authorization: "parent_approval" as const,
    }
    expect(authorize({ ownershipMode: "agent_owned", targetOwnerAgentId: "agent:research", platformSourceDecision: undefined, ownershipReview: { reviewedAgentId: "agent:research", decision: ownershipDecision } }))
      .toMatchObject({ status: "authorized", receipt: { ownershipMode: "agent_owned", targetOwnerAgentId: "agent:research" } })
    expect(authorize({ ownershipMode: "agent_owned", targetOwnerAgentId: "agent:research", platformSourceDecision: undefined, ownershipReview: undefined }))
      .toEqual({ status: "blocked", reasonCode: "agent_ownership_review_missing" })
    expect(authorize({ ownershipMode: "agent_owned", targetOwnerAgentId: "agent:research", platformSourceDecision: undefined, ownershipReview: { reviewedAgentId: "agent:other", decision: ownershipDecision } }))
      .toEqual({ status: "blocked", reasonCode: "agent_ownership_review_scope_mismatch" })
    expect(authorize({ ownershipMode: "agent_owned", targetOwnerAgentId: "agent:research", platformSourceDecision: undefined, ownershipReview: { reviewedAgentId: "agent:research", decision: { ...ownershipDecision, proposalFingerprint: "proposal:other" } } }))
      .toEqual({ status: "blocked", reasonCode: "agent_ownership_review_scope_mismatch" })
  })

  it("uses only injected reviews, GOAL snapshots, and ownership decisions", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/prompt-invariant-coverage.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/process\.env|Date\.now|readFile|writeFile|fetch\(|globalThis/u)
  })
})
