import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { runPromptSourceRegression } from "../packages/core/src/memory/prompt-regression.ts"

describe("task1318 deterministic prompt evaluation", () => {
  it("evaluates the repository prompt fixtures without a live model", () => {
    const result = runPromptSourceRegression(process.cwd(), { locales: ["en"] })

    expect(result.ok).toBe(true)
    expect(result.registry.sourceCount).toBeGreaterThan(0)
    expect(result.locales).toEqual(["en"])
  })

  it("keeps the evaluator independent from model and network adapters", () => {
    const source = readFileSync(
      new URL("../packages/core/src/memory/prompt-regression.ts", import.meta.url),
      "utf8",
    )

    expect(source).not.toMatch(/from ["'].*(?:ai-provider|openai|anthropic|model-provider)/iu)
    expect(source).not.toMatch(/\bfetch\s*\(|process\.env|globalThis/)
  })
})
