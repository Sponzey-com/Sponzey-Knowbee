import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const promptFiles = [
  "prompts/system.md",
  "prompts/runtime_environment_policy.md",
  "prompts/prompt_improvement.md",
  "prompts/ui_policy.md",
]

function promptSourceText(): string {
  return promptFiles
    .map((filePath) => readFileSync(join(process.cwd(), filePath), "utf8"))
    .join("\n")
}

describe("task0470 prompt source capability wording", () => {
  it("does not expose old Skill/MCP or MCP access wording in prompt sources", () => {
    const text = promptSourceText()

    expect(text).not.toContain("Skill, MCP")
    expect(text).not.toContain("tools, MCP")
    expect(text).not.toContain("tool or MCP")
    expect(text).not.toContain("MCP access")
  })

  it("uses work ability and external feature connection wording in prompt sources", () => {
    const text = promptSourceText()

    expect(text).toContain("work ability")
    expect(text).toContain("external feature connection")
    expect(text).toContain("external feature connection access")
    expect(text).toContain("tool and external feature connection availability")
  })
})
