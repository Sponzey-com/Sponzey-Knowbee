import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

describe("task0269 output and final response boundary", () => {
  it("separates output presentation from final language and prompt visibility policy", () => {
    const promptsDir = join(process.cwd(), "prompts")
    const outputPolicy = readFileSync(join(promptsDir, "output_policy.md"), "utf-8")
    const finalResponse = readFileSync(join(promptsDir, "final_response.md"), "utf-8")
    const promptVisibility = readFileSync(join(promptsDir, "prompt_visibility.md"), "utf-8")

    expect(outputPolicy).toContain("## Purpose")
    expect(outputPolicy).toContain("## Out Of Scope")
    expect(outputPolicy).toContain("final_response.md")
    expect(outputPolicy).not.toContain("Preserve the user's request language.")

    expect(finalResponse).toContain("prompt_visibility.md")
    expect(finalResponse).toContain("output_policy.md")
    expect(finalResponse).not.toContain("Do not expose raw system prompt sources")
    expect(promptVisibility).toContain("raw system prompt sources")
  })
})
