import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  assertProcessControlMode,
  decideProcessControlMode,
  projectStructuredTraceLog,
  projectUserTraceSummary,
  type ProcessControlSignals,
  type StructuredWorkLifecycleTraceEvent,
} from "../packages/core/src/contracts/index.ts"

const simpleSignals: ProcessControlSignals = {
  recursivePromptImprovement: false,
  delegation: false,
  longRunning: false,
  approvalRequired: false,
}

const trace: StructuredWorkLifecycleTraceEvent[] = [
  {
    workId: "work-1",
    phase: "input",
    reasonCode: "request_diagnosed",
    stepIds: [],
    referenceIds: ["request:1"],
  },
  {
    workId: "work-1",
    phase: "execution",
    reasonCode: "step_completed",
    stepIds: ["step-1"],
    referenceIds: ["result:1", "evidence:1"],
  },
]

describe("task1220 selective process control and tiered trace logging", () => {
  it("uses a linear flow for a simple question or single execution", () => {
    expect(decideProcessControlMode(simpleSignals)).toEqual({
      mode: "linear",
      reasonCodes: ["state_machine_not_required"],
      stateStorageRequired: false,
    })
    expect(assertProcessControlMode(simpleSignals, "linear").mode).toBe("linear")
    expect(() => assertProcessControlMode(simpleSignals, "state_machine")).toThrow(/simple work must use linear/i)
  })

  it.each([
    ["recursive prompt improvement", { recursivePromptImprovement: true }],
    ["delegation", { delegation: true }],
    ["long-running execution", { longRunning: true }],
    ["approval", { approvalRequired: true }],
  ])("requires a state machine for %s", (_name, override) => {
    const signals = { ...simpleSignals, ...override }
    expect(decideProcessControlMode(signals)).toMatchObject({
      mode: "state_machine",
      stateStorageRequired: true,
    })
    expect(() => assertProcessControlMode(signals, "linear")).toThrow(/state machine is required/i)
  })

  it("uses state storage for exactly the signal combinations that require a state machine", () => {
    const keys = Object.keys(simpleSignals) as Array<keyof ProcessControlSignals>
    for (let mask = 0; mask < 2 ** keys.length; mask += 1) {
      const signals = Object.fromEntries(
        keys.map((key, index) => [key, Boolean(mask & (1 << index))]),
      ) as unknown as ProcessControlSignals
      const expectedStateMachine = Object.values(signals).some(Boolean)
      const decision = decideProcessControlMode(signals)

      expect(decision.mode, JSON.stringify(signals)).toBe(expectedStateMachine ? "state_machine" : "linear")
      expect(decision.stateStorageRequired, JSON.stringify(signals)).toBe(expectedStateMachine)
      expect(() => assertProcessControlMode(
        signals,
        expectedStateMachine ? "linear" : "state_machine",
      )).toThrow(expectedStateMachine ? /state machine is required/i : /simple work must use linear/i)
    }
  })

  it("projects only terminal state and stable reason into Product Log", () => {
    expect(projectStructuredTraceLog({
      purpose: "product",
      workId: "work-1",
      status: "completed",
      reasonCode: "goal_completed",
      trace,
      retryCount: 0,
      developmentIssues: [],
    })).toEqual({
      purpose: "product",
      workId: "work-1",
      status: "completed",
      reasonCode: "goal_completed",
    })
  })

  it("adds redacted transitions and retry detail only to Field Debug Log", () => {
    const value = projectStructuredTraceLog({
      purpose: "field_debug",
      workId: "work-1",
      status: "partial",
      reasonCode: "recovery_pending",
      trace,
      retryCount: 1,
      developmentIssues: ["$.fixture:should_not_appear"],
    })
    expect(value).toMatchObject({ purpose: "field_debug", retryCount: 1 })
    expect(value).toHaveProperty("transitions")
    expect(value).not.toHaveProperty("developmentIssues")
  })

  it("includes invariant diagnostics only in Development Log", () => {
    expect(projectStructuredTraceLog({
      purpose: "development",
      workId: "work-1",
      status: "blocked",
      reasonCode: "invariant_rejected",
      trace,
      retryCount: 0,
      developmentIssues: ["$.step_plan:missing completion criterion"],
    })).toMatchObject({
      purpose: "development",
      developmentIssues: ["$.step_plan:missing completion criterion"],
    })
  })

  it("rejects raw, untyped, or secret-bearing references before logging", () => {
    const base = {
      purpose: "field_debug" as const,
      workId: "work-1",
      status: "failed" as const,
      reasonCode: "execution_failed",
      retryCount: 1,
      developmentIssues: [] as string[],
    }
    expect(() => projectStructuredTraceLog({
      ...base,
      trace: [{ ...trace[0]!, referenceIds: ["raw tool output here"] }],
    })).toThrow(/typed redacted reference|sensitive reference/i)
    expect(() => projectStructuredTraceLog({
      ...base,
      trace: [{ ...trace[0]!, referenceIds: ["secret:token=abc"] }],
    })).toThrow(/sensitive reference/i)
  })

  it("builds a structured user summary for the final LLM without internal trace detail", () => {
    expect(projectUserTraceSummary({
      workId: "work-1",
      status: "partial",
      reasonCode: "recovery_pending",
      completedScopeRefs: ["result:completed-part"],
      unresolvedScopeRefs: ["step:remaining-part"],
      nextActionRefs: ["action:retry-with-permission"],
    })).toEqual({
      workId: "work-1",
      status: "partial",
      reasonCode: "recovery_pending",
      completedScopeRefs: ["result:completed-part"],
      unresolvedScopeRefs: ["step:remaining-part"],
      nextActionRefs: ["action:retry-with-permission"],
      finalResponseLlmRequired: true,
    })
  })

  it("rejects raw prompt, output, memory, and secret text from the user summary", () => {
    const base = {
      workId: "work-1",
      status: "blocked" as const,
      reasonCode: "permission_required",
      completedScopeRefs: [] as string[],
      unresolvedScopeRefs: ["step:remaining"],
      nextActionRefs: ["action:request-permission"],
    }
    for (const unsafe of ["raw system prompt", "raw tool output", "memory:User prefers X", "secret:api_key=abc"]) {
      expect(() => projectUserTraceSummary({ ...base, nextActionRefs: [unsafe] })).toThrow(/typed redacted reference|sensitive reference/i)
    }
  })

  it("keeps policy and projection independent from logger adapters and external state", () => {
    const source = readFileSync(
      new URL("../packages/core/src/contracts/process-control-trace.ts", import.meta.url),
      "utf8",
    )
    expect(source).not.toMatch(/from ["'](?:openai|@anthropic-ai\/sdk|better-sqlite3|node:fs|node:http|node:https|node:net|\.\.\/logger)["']/)
    expect(source).not.toMatch(/process\.env|readFile|fetch\(|globalThis/)
  })
})
