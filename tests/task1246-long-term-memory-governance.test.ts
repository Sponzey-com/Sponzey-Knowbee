import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import { COMPACTION_PRESERVATION_CATEGORIES, evaluateCompactionPreservation, evaluateLongTermMemoryMutation, executeEligibleMemoryGovernance, type CompactionPreservationEntry, type LongTermMemoryMutationReview } from "../packages/core/src/index.ts"

function review(overrides: Partial<LongTermMemoryMutationReview> = {}): LongTermMemoryMutationReview {
  return { mutationId: "mutation:1", action: "create", requesterAgentId: "agent:main", targetAgentId: "agent:main", expectedTargetAgentId: "agent:main", targetNamespaceId: "agent:main:long_term", storageNeedReviewed: true, sensitivity: "not_sensitive", userIntent: "admin_review_approved", evidenceRefs: ["review:1"], reviewerRef: "reviewer:admin", ...overrides }
}

function preservation(change: Partial<CompactionPreservationEntry> = {}): CompactionPreservationEntry[] {
  return COMPACTION_PRESERVATION_CATEGORIES.map((category) => ({ category, sourceRefs: [`source:${category}`], outputRefs: [`source:${category}`], explicitEmpty: false, ...(category === change.category ? change : {}) }))
}

describe("task1246 long-term memory governance", () => {
  it.each(["create", "update", "delete"] as const)("allows reviewed %s for one explicit owner namespace", (action) => expect(evaluateLongTermMemoryMutation(review({ action }))).toMatchObject({ status: "eligible", action, targetAgentId: "agent:main" }))

  it.each([
    [{ expectedTargetAgentId: "agent:other" }, "mutation_owner_mismatch"],
    [{ targetNamespaceId: "agent:other:long_term" }, "mutation_namespace_owner_mismatch"],
    [{ storageNeedReviewed: false }, "mutation_storage_need_unreviewed"],
    [{ sensitivity: "secret" }, "mutation_secret_blocked"],
    [{ evidenceRefs: [] }, "mutation_evidence_missing"],
    [{ reviewerRef: "" }, "mutation_reviewer_missing"],
  ] as const)("rejects incomplete or unsafe mutation review %o", (change, issueCode) => expect(evaluateLongTermMemoryMutation(review(change))).toMatchObject({ status: "blocked", issueCodes: expect.arrayContaining([issueCode]) }))

  it("requires explicit authorization for a cross-agent mutation", () => {
    expect(evaluateLongTermMemoryMutation(review({ requesterAgentId: "agent:reviewer" }))).toMatchObject({ status: "blocked", issueCodes: ["mutation_cross_agent_unauthorized"] })
    expect(evaluateLongTermMemoryMutation(review({ requesterAgentId: "agent:reviewer", crossAgentAuthorizationRef: "authorization:1" })).status).toBe("eligible")
  })

  it("accepts all seven preserved compaction categories", () => expect(evaluateCompactionPreservation(preservation())).toEqual({ status: "eligible", preservedCategories: [...COMPACTION_PRESERVATION_CATEGORIES] }))

  it.each(COMPACTION_PRESERVATION_CATEGORIES)("rejects missing or unpreserved %s", (category) => {
    expect(evaluateCompactionPreservation(preservation().filter((entry) => entry.category !== category))).toMatchObject({ status: "blocked", missingCategories: [category] })
    expect(evaluateCompactionPreservation(preservation({ category, outputRefs: [] }))).toMatchObject({ status: "blocked", unpreservedCategories: [category] })
  })

  it("accepts explicit empty receipts only for empty source categories", () => {
    const entries = preservation({ category: "user_preferences", sourceRefs: [], outputRefs: [], explicitEmpty: true })
    expect(evaluateCompactionPreservation(entries).status).toBe("eligible")
  })

  it("does not call mutation or rewrite ports after a blocked decision", async () => {
    const execute = vi.fn(async () => "done")
    await expect(executeEligibleMemoryGovernance({ eligible: false, execute })).resolves.toEqual({ status: "blocked" })
    expect(execute).not.toHaveBeenCalled()
  })

  it("keeps governance decisions independent from infrastructure", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/long-term-memory-governance.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/from ["'](?:node:|better-sqlite3|mqtt|openai|@anthropic-ai\/sdk)/)
    expect(source).not.toMatch(/process\.env|Date\.now|fetch\(|readFile|writeFile|globalThis/)
  })
})
