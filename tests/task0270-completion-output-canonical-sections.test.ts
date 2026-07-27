import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { runPromptSourceRegression } from "../packages/core/src/memory/prompt-regression.ts"

describe("task0270 completion and output canonical sections", () => {
  it("requires completion and output prompts to expose canonical boundary sections", () => {
    const promptsDir = join(process.cwd(), "prompts")
    const completionPolicy = readFileSync(join(promptsDir, "completion_policy.md"), "utf-8")
    const outputPolicy = readFileSync(join(promptsDir, "output_policy.md"), "utf-8")
    const result = runPromptSourceRegression(process.cwd(), { locales: ["en"] })

    expect(completionPolicy).toContain("## Purpose")
    expect(completionPolicy).toContain("## Out Of Scope")
    expect(outputPolicy).toContain("## Purpose")
    expect(outputPolicy).toContain("## Out Of Scope")
    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true)
  })
})
