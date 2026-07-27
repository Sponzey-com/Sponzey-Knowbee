import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import { evaluateShortTermCompaction, evaluateWorkBoundMemoryHandoff, runEligibleMemoryOperation, type ShortTermHistorySegment, type WorkBoundMemoryHandoff } from "../packages/core/src/index.ts"
import { needsSessionCompaction, resolveShortTermCompactionPolicy } from "../packages/core/src/memory/compaction.ts"

function handoff(overrides: Partial<WorkBoundMemoryHandoff> = {}): WorkBoundMemoryHandoff {
  return { handoffId: "handoff:1", sourceAgentId: "agent:child", recipientAgentId: "agent:main", assignedWorkId: "work:1", receiptWorkId: "work:1", purpose: "Return the assigned result evidence.", payloadFieldNames: ["summary", "evidenceRefs"], allowedPayloadFieldNames: ["summary", "evidenceRefs"], contextRefs: ["context:work:1"], allowedContextRefs: ["context:work:1"], provenanceRefs: ["result:1"], containsRawMemory: false, containsUnrelatedHistory: false, grantsLongTermRetention: false, expiresAt: 200, evaluatedAt: 100, ...overrides }
}

const segments: ShortTermHistorySegment[] = [
  { segmentId: "old:safe", ordinal: 1, tokenEstimate: 40, messageCount: 2, pinned: false, activeWork: false, activeDelegation: false, unresolvedToolResult: false, provisionalDecision: false },
  { segmentId: "old:pinned", ordinal: 2, tokenEstimate: 40, messageCount: 2, pinned: true, activeWork: false, activeDelegation: false, unresolvedToolResult: false, provisionalDecision: false },
  { segmentId: "recent", ordinal: 3, tokenEstimate: 40, messageCount: 2, pinned: false, activeWork: false, activeDelegation: false, unresolvedToolResult: false, provisionalDecision: false },
]

describe("task1245 memory handoff and short-term compaction", () => {
  it("allows an exact work-bound minimal handoff", () => expect(evaluateWorkBoundMemoryHandoff(handoff())).toEqual({ status: "eligible", handoffId: "handoff:1" }))

  it.each([
    [{ receiptWorkId: "work:other" }, "handoff_work_mismatch"],
    [{ payloadFieldNames: ["summary", "rawMemory"] }, "handoff_payload_field_not_allowed"],
    [{ contextRefs: ["context:other"] }, "handoff_context_ref_not_allowed"],
    [{ containsRawMemory: true }, "handoff_raw_memory_forbidden"],
    [{ containsUnrelatedHistory: true }, "handoff_unrelated_history_forbidden"],
    [{ grantsLongTermRetention: true }, "handoff_long_term_grant_forbidden"],
    [{ expiresAt: 100 }, "handoff_expired"],
  ] as const)("rejects an over-broad or invalid handoff %o", (change, issueCode) => expect(evaluateWorkBoundMemoryHandoff(handoff(change))).toMatchObject({ status: "blocked", issueCodes: expect.arrayContaining([issueCode]) }))

  it("selects only the oldest safe segment after a startup threshold is exceeded", () => {
    expect(evaluateShortTermCompaction({ policy: { tokenThreshold: 100, messageThreshold: 5, protectedRecentMessageCount: 1, policyVersion: "memory:v1" }, currentTokenEstimate: 120, currentMessageCount: 6, segments })).toEqual({ status: "eligible", candidateSegmentIds: ["old:safe"], policyVersion: "memory:v1" })
  })

  it("does nothing below thresholds and blocks when every old segment is protected", () => {
    const policy = { tokenThreshold: 100, messageThreshold: 5, protectedRecentMessageCount: 1, policyVersion: "memory:v1" }
    expect(evaluateShortTermCompaction({ policy, currentTokenEstimate: 100, currentMessageCount: 5, segments })).toEqual({ status: "no_op", reasonCode: "threshold_not_exceeded" })
    expect(evaluateShortTermCompaction({ policy, currentTokenEstimate: 101, currentMessageCount: 5, segments: segments.map((segment) => ({ ...segment, pinned: true })) })).toEqual({ status: "blocked", reasonCode: "no_safe_compaction_candidate" })
  })

  it("uses the explicit startup memory config snapshot for runtime trigger thresholds", () => {
    const policy = resolveShortTermCompactionPolicy({
      sessionRetentionDays: 30,
      compaction: { tokenThreshold: 50, messageThreshold: 3, protectedRecentMessageCount: 2 },
    })
    expect(policy).toMatchObject({ tokenThreshold: 50, messageThreshold: 3, protectedRecentMessageCount: 2 })
    expect(needsSessionCompaction([{ role: "user", content: "one" }], 51, policy)).toBe(true)
    expect(needsSessionCompaction(Array.from({ length: 4 }, () => ({ role: "user" as const, content: "x" })), 10, policy)).toBe(true)
    expect(needsSessionCompaction([{ role: "user", content: "one" }], 50, policy)).toBe(false)
  })

  it("rejects an invalid startup threshold snapshot", () => {
    expect(() => resolveShortTermCompactionPolicy({ sessionRetentionDays: 30, compaction: { tokenThreshold: 0 } })).toThrow("tokenThreshold must be a positive integer")
  })

  it("does not call an operation port after a blocked decision", async () => {
    const run = vi.fn(async () => "done")
    await expect(runEligibleMemoryOperation({ eligible: false, run })).resolves.toEqual({ status: "blocked" })
    expect(run).not.toHaveBeenCalled()
  })

  it("keeps both decisions independent from infrastructure", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/memory-handoff-compaction.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/from ["'](?:node:|better-sqlite3|mqtt|openai|@anthropic-ai\/sdk)/)
    expect(source).not.toMatch(/process\.env|Date\.now|fetch\(|readFile|writeFile|globalThis/)
  })
})
