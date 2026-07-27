import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  applyConfirmedPromptImprovement,
  authorizePromptImprovementApplication,
  PLATFORM_PROMPT_PROTECTED_INVARIANTS,
  type PlatformPromptInvariantReview,
  type PromptBehaviorChangeSummary,
  type PromptBehaviorConfirmationReceipt,
  type PromptImprovementInputReference,
} from "../packages/core/src/index.ts"

const now = Date.UTC(2026, 6, 14, 20, 0, 0)
const source: PromptImprovementInputReference = { provenance: "prompt_source_file", reference: "prompt:system", fingerprint: "sha:source" }

function reviews(): PlatformPromptInvariantReview[] {
  return PLATFORM_PROMPT_PROTECTED_INVARIANTS.map((invariant) => ({
    invariant, proposalFingerprint: "proposal:v1", baselineFingerprint: `base:${invariant}`,
    proposedFingerprint: `next:${invariant}`, decision: "preserved", reviewerRef: "reviewer:main",
    reviewedAt: now, expiresAt: now + 60_000,
  }))
}

function summary(overrides: Partial<PromptBehaviorChangeSummary> = {}): PromptBehaviorChangeSummary {
  return {
    proposalFingerprint: "proposal:v1", targetAgentRef: "agent:main", beforeBehavior: "Uses the previous response rule.",
    afterBehavior: "Uses the reviewed response rule.", impactScope: "Main-agent responses", riskSummary: "Response style may change.",
    rollbackSummary: "Restore prompt version v1.", fingerprint: "summary:v1", ...overrides,
  }
}

function confirmation(overrides: Partial<PromptBehaviorConfirmationReceipt> = {}): PromptBehaviorConfirmationReceipt {
  return {
    schemaVersion: 1, confirmationId: "confirm:1", proposalFingerprint: "proposal:v1", summaryFingerprint: "summary:v1",
    actorRef: "user:owner", decision: "confirmed", confirmedAt: now, expiresAt: now + 60_000, ...overrides,
  }
}

function authorize(overrides: Record<string, unknown> = {}) {
  return authorizePromptImprovementApplication({
    proposalFingerprint: "proposal:v1", sourceInputs: [source], invariantReviews: reviews(),
    behaviorImpact: "user_visible_behavior_change", behaviorSummary: summary(), confirmation: confirmation(),
    expectedConfirmationActorRef: "user:owner", now, ...overrides,
  })
}

describe("task1235 prompt improvement application gate", () => {
  it("keeps chat requests and evidence separate from persistent prompt sources", () => {
    expect(authorize({ sourceInputs: [] })).toEqual({
      status: "blocked", reasonCode: "prompt_source_missing",
    })
    expect(authorize({ sourceInputs: [{ ...source, provenance: "user_chat_improvement_request" }] })).toEqual({
      status: "blocked", reasonCode: "chat_used_as_prompt_source",
    })
    expect(authorize({ evidenceInputs: [{ provenance: "user_chat_supporting_evidence", reference: "chat:42", fingerprint: "sha:redacted" }] })).toMatchObject({
      status: "authorized", sourceRefs: ["prompt:system"],
    })
  })

  it("requires exactly the five platform protected invariants", () => {
    expect(PLATFORM_PROMPT_PROTECTED_INVARIANTS).toEqual([
      "product_identity", "safety_rules", "tool_boundary", "memory_isolation", "delegation_rules",
    ])
    expect(authorize({ invariantReviews: reviews().slice(1) })).toEqual({ status: "blocked", reasonCode: "invariant_review_incomplete" })
  })

  it.each([
    [{ decision: "changed" }, "invariant_not_preserved"],
    [{ expiresAt: now }, "invariant_review_expired"],
    [{ proposalFingerprint: "proposal:other" }, "invariant_scope_mismatch"],
    [{ baselineFingerprint: "" }, "invariant_scope_mismatch"],
  ] as const)("rejects invalid invariant review %o", (change, reasonCode) => {
    const invalid = reviews()
    invalid[0] = { ...invalid[0]!, ...change } as PlatformPromptInvariantReview
    expect(authorize({ invariantReviews: invalid })).toEqual({ status: "blocked", reasonCode })
  })

  it("does not require confirmation when user-visible behavior cannot change", () => {
    expect(authorize({ behaviorImpact: "no_user_visible_change", behaviorSummary: undefined, confirmation: undefined })).toEqual({
      status: "authorized", proposalFingerprint: "proposal:v1", sourceRefs: ["prompt:system"],
    })
  })

  it.each(["user_visible_behavior_change", "capability_or_permission_change"] as const)(
    "requires an exact summary and explicit confirmation for %s", (behaviorImpact) => {
      expect(authorize({ behaviorImpact })).toMatchObject({ status: "authorized", confirmationId: "confirm:1" })
      expect(authorize({ behaviorImpact, behaviorSummary: undefined })).toEqual({ status: "blocked", reasonCode: "behavior_summary_missing" })
      expect(authorize({ behaviorImpact, confirmation: undefined })).toEqual({ status: "blocked", reasonCode: "confirmation_missing" })
    },
  )

  it.each([
    [{ decision: "denied" }, "confirmation_denied"],
    [{ expiresAt: now }, "confirmation_expired"],
    [{ actorRef: "user:other" }, "confirmation_scope_mismatch"],
    [{ proposalFingerprint: "proposal:old" }, "confirmation_scope_mismatch"],
    [{ summaryFingerprint: "summary:old" }, "confirmation_scope_mismatch"],
  ] as const)("rejects implicit, stale, or mismatched confirmation %o", (change, reasonCode) => {
    expect(authorize({ confirmation: confirmation(change) })).toEqual({ status: "blocked", reasonCode })
  })

  it("never applies a blocked proposal", async () => {
    const apply = vi.fn(async () => "written")
    await expect(applyConfirmedPromptImprovement({ decision: authorize({ confirmation: undefined }), apply })).resolves.toEqual({
      status: "blocked", reasonCode: "confirmation_missing",
    })
    expect(apply).not.toHaveBeenCalled()
    await expect(applyConfirmedPromptImprovement({ decision: authorize(), apply })).resolves.toEqual({ status: "applied", result: "written" })
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it("keeps the application gate independent from external systems", () => {
    const text = readFileSync(new URL("../packages/core/src/contracts/prompt-improvement-application-gate.ts", import.meta.url), "utf8")
    expect(text).not.toMatch(/from ["'](?:node:|better-sqlite3|mqtt|openai|@anthropic-ai\/sdk)/)
    expect(text).not.toMatch(/process\.env|Date\.now|fetch\(|readFile|writeFile|globalThis/)
  })
})
