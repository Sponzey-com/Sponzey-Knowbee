import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  PROMPT_IMPROVEMENT_ESCALATION_STAGES,
  applyPromptOnlyDecision,
  decidePromptImprovementCapability,
  executeApprovedImplementation,
} from "../packages/core/src/memory/prompt-improvement-escalation.ts"

function decision(overrides: Record<string, unknown> = {}) {
  return decidePromptImprovementCapability({
    problem: "The runtime ignores a prompt-owned retry instruction.",
    ownerAgentName: "노비",
    canSolveWithPromptOnly: false,
    assessmentReason: "The failure occurs after prompt parsing inside runtime code.",
    assessmentEvidence: ["Trace run:42 shows the parsed instruction but no retry transition."],
    requestedTargetRefs: [],
    ...overrides,
  })
}

describe("task1350 prompt improvement escalation", () => {
  it("builds the four ordered work tasks with explicit dependencies and completion criteria", () => {
    const result = decision()
    expect(result.status).toBe("escalation_required")
    if (result.status !== "escalation_required") return
    expect(result.workPackage.tasks.map((item) => item.stage)).toEqual(PROMPT_IMPROVEMENT_ESCALATION_STAGES)
    expect(result.workPackage.tasks.map((item) => item.dependsOn)).toEqual([
      [], ["prompt_investigation"], ["code_change_proposal"], ["implementation"],
    ])
    for (const item of result.workPackage.tasks) {
      expect(item.ownerAgentName).toBe("노비")
      expect(item.inputs.length).toBeGreaterThan(0)
      expect(item.expectedOutputs.length).toBeGreaterThan(0)
      expect(item.completionCriteria.length).toBeGreaterThan(0)
    }
  })

  it("allows exact prompt targets through only the prompt application port", async () => {
    const applyPrompt = vi.fn(async () => "prompt-applied")
    const result = decision({ canSolveWithPromptOnly: true, requestedTargetRefs: ["prompts/planner.md"] })
    await expect(applyPromptOnlyDecision({ decision: result, applyPrompt })).resolves.toEqual({ status: "applied", result: "prompt-applied" })
    expect(applyPrompt).toHaveBeenCalledWith(["prompts/planner.md"])
  })

  it.each(["packages/core/src/index.ts", "config:model.provider", "env:OPENAI_API_KEY", ".env.local", "runtime:hidden-instruction"])(
    "blocks code, configuration, and runtime target disguised as prompt source: %s",
    async (target) => {
      const applyPrompt = vi.fn()
      const result = decision({ canSolveWithPromptOnly: true, requestedTargetRefs: [target] })
      expect(result).toEqual({ status: "blocked", reasonCode: "disguised_code_or_config_change" })
      await expect(applyPromptOnlyDecision({ decision: result, applyPrompt })).resolves.toEqual(result)
      expect(applyPrompt).not.toHaveBeenCalled()
    },
  )

  it("returns escalation data without invoking prompt or implementation callbacks", async () => {
    const applyPrompt = vi.fn()
    const executeImplementation = vi.fn()
    const result = decision()
    await expect(applyPromptOnlyDecision({ decision: result, applyPrompt })).resolves.toEqual(result)
    expect(applyPrompt).not.toHaveBeenCalled()
    expect(executeImplementation).not.toHaveBeenCalled()
  })

  it("executes only an explicitly approved implementation task through its separate port", async () => {
    const result = decision()
    if (result.status !== "escalation_required") throw new Error("Expected escalation package")
    const implementation = result.workPackage.tasks[2]!
    const executeImplementation = vi.fn(async () => "implemented")
    await expect(executeApprovedImplementation({ task: implementation, approved: false, executeImplementation }))
      .resolves.toEqual({ status: "blocked", reasonCode: "implementation_approval_required" })
    expect(executeImplementation).not.toHaveBeenCalled()
    await expect(executeApprovedImplementation({ task: implementation, approved: true, executeImplementation }))
      .resolves.toEqual({ status: "executed", result: "implemented" })
    expect(executeImplementation).toHaveBeenCalledTimes(1)
  })

  it("keeps capability decisions independent from filesystem, environment, and global state", () => {
    const source = readFileSync(new URL("../packages/core/src/memory/prompt-improvement-escalation.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/from ["'](?:node:|better-sqlite3|openai|@anthropic-ai\/sdk)/u)
    expect(source).not.toMatch(/process\.env|Date\.now|globalThis|readFile|writeFile|fetch\(/u)
  })
})
