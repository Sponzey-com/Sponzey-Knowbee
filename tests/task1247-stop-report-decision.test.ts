import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import { evaluateStopReportDecision, executeContinuingAction, normalizeStartupAttemptLimitPolicy, type GoalCompletionReceipt } from "../packages/core/src/index.ts"

function completion(overrides: Partial<GoalCompletionReceipt> = {}): GoalCompletionReceipt {
  return { goalId: "goal:1", expectedCriterionIds: ["criterion:1", "criterion:2"], satisfiedCriterionIds: [], evidenceRefsByCriterion: {}, unresolvedItemIds: ["work:remaining"], ...overrides }
}

const bounded = { kind: "bounded" as const, maxTurns: 3, maxRetries: 2, policyVersion: "attempt:v1" }

describe("task1247 canonical stop and report decision", () => {
  it("continues an incomplete goal while attempts remain", () => expect(evaluateStopReportDecision({ completion: completion(), attempts: { currentTurn: 1, currentRetry: 0 }, policy: bounded })).toEqual({ status: "continue", nextTurn: 2 }))

  it("stops and reports a fully evidenced completed goal", () => {
    const result = evaluateStopReportDecision({ completion: completion({ satisfiedCriterionIds: ["criterion:1", "criterion:2"], evidenceRefsByCriterion: { "criterion:1": ["evidence:1"], "criterion:2": ["evidence:2"] }, unresolvedItemIds: [] }), attempts: { currentTurn: 1, currentRetry: 0 }, policy: bounded })
    expect(result).toMatchObject({ status: "stop_and_report", reasonCode: "goal_achieved", reportInput: { evidenceRefs: ["evidence:1", "evidence:2"], unresolvedItemIds: [] } })
  })

  it("blocks a claimed completion with missing criterion evidence", () => expect(evaluateStopReportDecision({ completion: completion({ satisfiedCriterionIds: ["criterion:1"] }), attempts: { currentTurn: 1, currentRetry: 0 }, policy: bounded })).toEqual({ status: "blocked_pending_input", reasonCode: "completion_evidence_incomplete", missingCriterionIds: ["criterion:1", "criterion:2"] }))

  it.each([
    [{ currentTurn: 3, currentRetry: 0 }, "turn_observation_threshold_reached"],
    [{ currentTurn: 1, currentRetry: 2 }, "retry_observation_threshold_reached"],
  ] as const)("requests strategy reassessment at the bounded observation edge %o", (attempts, reasonCode) => expect(evaluateStopReportDecision({ completion: completion(), attempts, policy: bounded })).toMatchObject({
    status: "reassess_strategy",
    event: "REASSESS_STRATEGY",
    reasonCode,
    currentTurn: attempts.currentTurn,
    currentRetry: attempts.currentRetry,
    nextTurn: attempts.currentTurn + 1,
  }))

  it("does not stop immediately for an explicit unbounded policy", () => expect(evaluateStopReportDecision({ completion: completion(), attempts: { currentTurn: 99, currentRetry: 99 }, policy: { kind: "unbounded", policyVersion: "attempt:unbounded:v1" } })).toEqual({ status: "continue", nextTurn: 100 }))

  it("normalizes the startup snapshot into explicit bounded or unbounded variants", () => {
    expect(normalizeStartupAttemptLimitPolicy({ maxTurns: 0, policyVersion: "v1" })).toEqual({ kind: "unbounded", policyVersion: "v1" })
    expect(normalizeStartupAttemptLimitPolicy({ maxTurns: 4, maxRetries: 2, policyVersion: "v1" })).toEqual({ kind: "bounded", maxTurns: 4, maxRetries: 2, policyVersion: "v1" })
  })

  it("rejects invalid counters and bounded policy values", () => {
    expect(() => evaluateStopReportDecision({ completion: completion(), attempts: { currentTurn: -1, currentRetry: 0 }, policy: bounded })).toThrow("Current turn must be a non-negative integer.")
    expect(() => evaluateStopReportDecision({ completion: completion(), attempts: { currentTurn: 0, currentRetry: 0 }, policy: { ...bounded, maxTurns: 0 } })).toThrow("maxTurns must be a positive integer.")
  })

  it("does not automatically execute an action after stop, pending evidence, or reassessment", async () => {
    const execute = vi.fn(async () => "ran")
    const stopped = evaluateStopReportDecision({ completion: completion(), attempts: { currentTurn: 3, currentRetry: 0 }, policy: bounded })
    await expect(executeContinuingAction({ decision: stopped, execute })).resolves.toMatchObject({ status: "reassess_strategy" })
    expect(execute).not.toHaveBeenCalled()
  })

  it("keeps the stop decision independent from infrastructure", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/stop-report-decision.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/from ["'](?:node:|better-sqlite3|mqtt|openai|@anthropic-ai\/sdk)/)
    expect(source).not.toMatch(/process\.env|Date\.now|fetch\(|readFile|writeFile|globalThis/)
  })
})
