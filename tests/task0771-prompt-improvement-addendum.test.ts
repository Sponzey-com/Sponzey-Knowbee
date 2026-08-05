import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { RECURSIVE_HARNESS_ADDENDUM_SENTENCES } from "../packages/core/src/contracts/recursive-harness-addendum.ts"

const REQUIRED_ADDENDUM_MARKERS = [
  "## Harness System Prompt Addendum",
  ...RECURSIVE_HARNESS_ADDENDUM_SENTENCES,
] as const

describe("task0771 prompt improvement harness system prompt addendum", () => {
  it("includes the required GOAL 9.18 harness addendum markers", () => {
    const prompt = readFileSync(join(process.cwd(), "prompts", "prompt_improvement.md"), "utf-8")

    for (const marker of REQUIRED_ADDENDUM_MARKERS) {
      expect(prompt).toContain(marker)
    }
  })
})
