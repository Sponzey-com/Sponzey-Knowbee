import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const CURRENT_FACT_RECOVERY_MARKERS = [
  "search snippet",
  "`web_fetch`",
  "dynamic page",
  "current numeric fact",
] as const

describe("task0259 current-fact recovery prompt boundary", () => {
  it("keeps current-fact recovery examples out of tool_policy", () => {
    const promptsDir = join(process.cwd(), "prompts")
    const toolPolicy = readFileSync(join(promptsDir, "tool_policy.md"), "utf-8").toLowerCase()
    const recoveryPolicy = readFileSync(join(promptsDir, "recovery_policy.md"), "utf-8").toLowerCase()

    for (const marker of CURRENT_FACT_RECOVERY_MARKERS) {
      expect(toolPolicy).not.toContain(marker)
      expect(recoveryPolicy).toContain(marker)
    }

    expect(toolPolicy).toContain("recovery_policy.md")
  })
})
