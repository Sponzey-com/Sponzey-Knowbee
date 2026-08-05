import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { runPromptSourceRegression } from "../packages/core/src/memory/prompt-regression.ts"

const DIAGNOSIS_PROMPT_FILES = [
  "request_diagnosis.md",
  "result_diagnosis.md",
  "diagnosis_schema_repair.md",
] as const

describe("task0275 internal diagnosis canonical sections", () => {
  it("requires diagnosis prompts to declare purpose and out-of-scope boundaries", () => {
    const promptsDir = join(process.cwd(), "prompts")
    const result = runPromptSourceRegression(process.cwd(), { locales: ["en"] })

    for (const filename of DIAGNOSIS_PROMPT_FILES) {
      const content = readFileSync(join(promptsDir, filename), "utf-8")
      expect(content).toContain("## Purpose")
      expect(content).toContain("## Out Of Scope")
      expect(content).toContain("does not")
    }

    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true)
  })
})
