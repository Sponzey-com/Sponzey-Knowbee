import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  evaluatePromptRuleQuality,
  writeQualityEligiblePromptRules,
  type ExecutablePromptRuleStatement,
} from "../packages/core/src/index.ts"

function statement(overrides: Partial<ExecutablePromptRuleStatement> = {}): ExecutablePromptRuleStatement {
  return {
    ruleId: "rule:identity:self-name", actorRef: "actor:agent", condition: "When the user asks for the agent name.",
    requiredActions: ["Use the configured agent name."], prohibitedActions: ["Use the product name as the configured name."],
    completionCriterion: "The response contains the configured agent name once.", sourceLine: 12, clauseCount: 3, ...overrides,
  }
}

function evaluate(overrides: Record<string, unknown> = {}) {
  return evaluatePromptRuleQuality({
    statements: [statement()], limits: { maxStatementCharacters: 240, maxClauses: 4, maxActions: 3 }, ...overrides,
  })
}

function codes(decision: ReturnType<typeof evaluatePromptRuleQuality>): string[] {
  return decision.status === "blocked" ? decision.issues.map((issue) => issue.code) : []
}

describe("task1239 concise executable prompt rule quality", () => {
  it("accepts a concise rule with actor, condition, actions, and completion criterion", () => {
    expect(evaluate()).toEqual({ status: "eligible", ruleIds: ["rule:identity:self-name"] })
  })

  it.each([
    [{ actorRef: "" }, "actor_missing"],
    [{ condition: "" }, "condition_missing"],
    [{ requiredActions: [], prohibitedActions: [] }, "action_missing"],
    [{ completionCriterion: "" }, "completion_criterion_missing"],
  ] as const)("rejects missing executable field %o", (change, code) => {
    expect(codes(evaluate({ statements: [statement(change)] }))).toContain(code)
  })

  it("rejects conflicting and duplicate actions", () => {
    expect(codes(evaluate({ statements: [statement({
      requiredActions: ["Use the configured name."], prohibitedActions: [" use  the configured name. "],
    })] }))).toEqual(expect.arrayContaining(["duplicate_action", "action_conflict"]))
  })

  it.each([
    [{ limits: { maxStatementCharacters: 20, maxClauses: 4, maxActions: 3 } }, "statement_too_long"],
    [{ statements: [statement({ clauseCount: 5 })] }, "clause_limit_exceeded"],
    [{ statements: [statement({ requiredActions: ["A", "B", "C"], prohibitedActions: ["D"] })] }, "action_limit_exceeded"],
  ] as const)("rejects brevity limit violation %o", (change, code) => {
    expect(codes(evaluate(change))).toContain(code)
  })

  it("reports exact rule and source line for review", () => {
    expect(evaluate({ statements: [statement({ actorRef: "", sourceLine: 42 })] })).toMatchObject({
      status: "blocked", issues: [expect.objectContaining({ ruleId: "rule:identity:self-name", sourceLine: 42, code: "actor_missing" })],
    })
  })

  it("never writes structurally invalid or verbose rules", async () => {
    const write = vi.fn(async () => "saved")
    await expect(writeQualityEligiblePromptRules({ decision: evaluate({ statements: [statement({ condition: "" })] }), write })).resolves.toMatchObject({ status: "blocked" })
    expect(write).not.toHaveBeenCalled()
    await expect(writeQualityEligiblePromptRules({ decision: evaluate(), write })).resolves.toEqual({ status: "written", result: "saved" })
    expect(write).toHaveBeenCalledTimes(1)
  })

  it("keeps prompt rule quality independent from external systems", () => {
    const text = readFileSync(new URL("../packages/core/src/contracts/prompt-rule-quality.ts", import.meta.url), "utf8")
    expect(text).not.toMatch(/from ["'](?:node:|better-sqlite3|mqtt|openai|@anthropic-ai\/sdk)/)
    expect(text).not.toMatch(/process\.env|Date\.now|fetch\(|readFile|writeFile|globalThis/)
  })
})
