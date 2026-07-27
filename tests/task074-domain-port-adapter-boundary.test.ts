import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const DOMAIN_FILES = [
  "packages/core/src/contracts/canonical-work-state.ts",
  "packages/core/src/contracts/canonical-work-aggregate.ts",
  "packages/core/src/contracts/work-record.ts",
  "packages/core/src/contracts/failure-recovery-decision.ts",
  "packages/core/src/observability/typed-event-contract.ts",
] as const

const FORBIDDEN_DOMAIN_IMPORTS = [
  "openai",
  "@anthropic-ai/sdk",
  "better-sqlite3",
  "../db/",
  "../api/",
  "../channels/",
  "../ai/",
  "../skills/",
  "../mcp/",
  "../extension/",
  "packages/webui",
  "react",
] as const

function source(path: string): string {
  return readFileSync(path, "utf8")
}

describe("Task 074 Domain, port, and adapter boundaries", () => {
  it("keeps canonical Domain contracts independent from infrastructure and UI", () => {
    for (const path of DOMAIN_FILES) {
      const text = source(path)
      for (const forbidden of FORBIDDEN_DOMAIN_IMPORTS) {
        expect(text, `${path} imports ${forbidden}`).not.toContain(forbidden)
      }
      expect(text, `${path} reads process environment`).not.toContain("process.env")
      expect(text, `${path} performs network I/O`).not.toMatch(/\bfetch\s*\(/u)
    }
  })

  it("defines LLM planning as a provider port without importing a provider SDK", () => {
    const text = source("packages/core/src/contracts/llm-solution-plan-provider.ts")

    expect(text).toContain("export interface LlmSolutionPlanProvider")
    expect(text).toContain("planSolution(input: LlmSolutionPlanProviderInput)")
    expect(text).toContain("provider: LlmSolutionPlanProvider")
    expect(text).not.toMatch(/from ["'](?:openai|@anthropic-ai\/sdk)/u)
  })

  it("injects side-effect execution, observation, cancellation, receipt, and repository ports", () => {
    const text = source("packages/core/src/runs/side-effect-operation-executor.ts")

    for (const marker of [
      "executeEffect: () => Promise",
      "observePostState:",
      "repository: SideEffectOperationRepository",
      "createReceipt:",
      "isCancelled: () => boolean",
    ]) {
      expect(text).toContain(marker)
    }
    expect(text).not.toMatch(/from ["'](?:better-sqlite3|node:fs|node:http|node:https)/u)
  })
})
