import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  auditPromptImprovementIdentitySnapshot,
  createPromptImprovementIdentityReview,
  projectProductIdentityInvariantReview,
  type PromptImprovementIdentitySnapshot,
} from "../packages/core/src/contracts/prompt-improvement-identity-invariants.ts"

const now = 1_000

function snapshot(overrides: Partial<PromptImprovementIdentitySnapshot> = {}): PromptImprovementIdentitySnapshot {
  return {
    productName: "Knowbee",
    productNameKo: "노비",
    responseLanguage: "ko",
    configuredMainAgentId: "agent:main",
    configuredMainAgentName: "마당쇠",
    userName: "사용자",
    agents: [
      { agentId: "agent:main", agentName: "마당쇠" },
      { agentId: "agent:research", agentName: "연구 담당" },
    ],
    responseAttributions: [
      { agentId: "agent:main", agentName: "마당쇠" },
      { agentId: "agent:research", agentName: "연구 담당" },
    ],
    userFacingAgentFields: ["agentName"],
    ...overrides,
  }
}

describe("task1387 prompt-improvement identity invariant review", () => {
  it("preserves canonical product identity and a configured main-agent name", () => {
    expect(auditPromptImprovementIdentitySnapshot(snapshot())).toEqual({
      status: "preserved",
      effectiveMainAgentName: "마당쇠",
      normalizedAgentNames: ["마당쇠", "연구 담당"],
    })
  })

  it.each([
    ["en", "Knowbee"],
    ["ko", "노비"],
  ] as const)("uses the canonical %s default when the main name is unset", (responseLanguage, agentName) => {
    const input = snapshot({
      responseLanguage,
      configuredMainAgentName: "",
      agents: [{ agentId: "agent:main", agentName }, { agentId: "agent:research", agentName: "Research" }],
      responseAttributions: [{ agentId: "agent:main", agentName }, { agentId: "agent:research", agentName: "Research" }],
    })
    expect(auditPromptImprovementIdentitySnapshot(input)).toMatchObject({ status: "preserved", effectiveMainAgentName: agentName })
  })

  it.each([
    [{ productName: "Nobie" }, "product_identity_mismatch"],
    [{ productNameKo: "노우비" }, "product_identity_mismatch"],
    [{ configuredMainAgentId: "" }, "main_agent_identity_invalid"],
    [{ agents: [{ agentId: "agent:main", agentName: "다른 이름" }] }, "main_agent_name_mismatch"],
    [{ agents: [{ agentId: "agent:main", agentName: "마당쇠" }, { agentId: "agent:research", agentName: " 마당쇠 " }] }, "agent_name_duplicate"],
    [{ agents: [{ agentId: "agent:main", agentName: "마당쇠" }, { agentId: "agent:research", agentName: "" }] }, "agent_identity_invalid"],
    [{ userName: " 마당쇠 " }, "user_agent_name_collision"],
    [{ userFacingAgentFields: ["agentName", "agentId"] }, "user_facing_identity_exposed"],
    [{ userFacingAgentFields: ["displayName"] }, "user_facing_identity_exposed"],
  ] as const)("rejects identity invariant violation %#", (overrides, reasonCode) => {
    expect(auditPromptImprovementIdentitySnapshot(snapshot(overrides as Partial<PromptImprovementIdentitySnapshot>)))
      .toEqual({ status: "blocked", reasonCode })
  })

  it.each(["nickname", "displayName", "profileName"])("rejects legacy identity field %s", (field) => {
    const legacyAgent = { agentId: "agent:research", agentName: "연구 담당", [field]: "별칭" }
    expect(auditPromptImprovementIdentitySnapshot(snapshot({
      agents: [{ agentId: "agent:main", agentName: "마당쇠" }, legacyAgent],
    }))).toEqual({ status: "blocked", reasonCode: "agent_identity_field_invalid" })
  })

  it("requires every sub-agent response attribution to use its configured agent name", () => {
    expect(auditPromptImprovementIdentitySnapshot(snapshot({
      responseAttributions: [
        { agentId: "agent:main", agentName: "마당쇠" },
        { agentId: "agent:research", agentName: "조사원" },
      ],
    }))).toEqual({ status: "blocked", reasonCode: "response_attribution_mismatch" })
    expect(auditPromptImprovementIdentitySnapshot(snapshot({
      responseAttributions: [{ agentId: "agent:main", agentName: "마당쇠" }],
    }))).toEqual({ status: "blocked", reasonCode: "response_attribution_incomplete" })
  })

  it("creates a section-3-backed preserved review receipt", () => {
    expect(createPromptImprovementIdentityReview({
      snapshot: snapshot(),
      proposalFingerprint: "proposal:1387",
      baselineFingerprint: "identity:baseline",
      proposedFingerprint: "identity:proposed",
      goalSection3Fingerprint: "goal:section3:v1",
      reviewerRef: "reviewer:main",
      reviewedAt: now,
      expiresAt: now + 100,
    })).toMatchObject({
      status: "authorized",
      receipt: {
        invariant: "product_identity",
        decision: "preserved",
        proposalFingerprint: "proposal:1387",
        goalSection3Fingerprint: "goal:section3:v1",
        effectiveMainAgentName: "마당쇠",
      },
    })
  })

  it("does not create a preserved receipt from invalid identity or lineage", () => {
    expect(createPromptImprovementIdentityReview({
      snapshot: snapshot({ userName: "마당쇠" }), proposalFingerprint: "proposal:1387",
      baselineFingerprint: "identity:baseline", proposedFingerprint: "identity:proposed",
      goalSection3Fingerprint: "goal:section3:v1", reviewerRef: "reviewer:main", reviewedAt: now, expiresAt: now + 100,
    })).toEqual({ status: "blocked", reasonCode: "user_agent_name_collision" })
    expect(createPromptImprovementIdentityReview({
      snapshot: snapshot(), proposalFingerprint: "proposal:1387",
      baselineFingerprint: "identity:same", proposedFingerprint: "identity:same",
      goalSection3Fingerprint: "", reviewerRef: "reviewer:main", reviewedAt: now, expiresAt: now + 100,
    })).toEqual({ status: "blocked", reasonCode: "identity_review_lineage_invalid" })
  })

  it("projects only exact current section-3 lineage into the application gate", () => {
    const decision = createPromptImprovementIdentityReview({
      snapshot: snapshot(), proposalFingerprint: "proposal:1387", baselineFingerprint: "identity:baseline",
      proposedFingerprint: "identity:proposed", goalSection3Fingerprint: "goal:section3:v1",
      reviewerRef: "reviewer:main", reviewedAt: now, expiresAt: now + 100,
    })
    if (decision.status !== "authorized") throw new Error("Expected identity review authorization.")
    expect(projectProductIdentityInvariantReview({
      receipt: decision.receipt,
      expectedProposalFingerprint: "proposal:1387",
      currentGoalSection3Fingerprint: "goal:section3:v1",
      now,
    })).toEqual({
      status: "authorized",
      review: {
        invariant: "product_identity", proposalFingerprint: "proposal:1387",
        baselineFingerprint: "identity:baseline", proposedFingerprint: "identity:proposed",
        decision: "preserved", reviewerRef: "reviewer:main", reviewedAt: now, expiresAt: now + 100,
      },
    })
    expect(projectProductIdentityInvariantReview({
      receipt: decision.receipt,
      expectedProposalFingerprint: "proposal:other",
      currentGoalSection3Fingerprint: "goal:section3:v1",
      now,
    })).toEqual({ status: "blocked", reasonCode: "identity_review_scope_mismatch" })
    expect(projectProductIdentityInvariantReview({
      receipt: decision.receipt,
      expectedProposalFingerprint: "proposal:1387",
      currentGoalSection3Fingerprint: "goal:section3:v2",
      now,
    })).toEqual({ status: "blocked", reasonCode: "goal_section3_lineage_mismatch" })
  })

  it("uses no environment, filesystem, network, or mutable global identity source", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/prompt-improvement-identity-invariants.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/process\.env|Date\.now|readFile|writeFile|fetch\(|globalThis/u)
  })
})
