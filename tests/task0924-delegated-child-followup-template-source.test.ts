import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"

describe("task0924 delegated child follow-up prompt source", () => {
  it("registers delegated child follow-up input as a file-backed internal prompt source", () => {
    const source = loadPromptSourceRegistry(process.cwd())
      .find((item) => item.sourceId === "delegated_child_followup_user" && item.locale === "en")

    expect(source).toMatchObject({
      sourceId: "delegated_child_followup_user",
      usageScope: "internal",
      enabled: true,
    })
    expect(source?.path.endsWith("prompts/delegated_child_followup_user.md")).toBe(true)
    expect(source?.content).toContain("{{originalRequest}}")
    expect(source?.content).toContain("{{childSummary}}")
    expect(source?.content).toContain("{{reviewSummary}}")
    expect(source?.content).toContain("{{remainingItems}}")
    expect(source?.content).toContain("{{focusedFollowup}}")
  })

  it("does not keep the delegated child follow-up envelope hardcoded in TypeScript", () => {
    const source = readFileSync("packages/core/src/runs/intake-bridge-pass.ts", "utf-8")

    expect(source).toContain('sourceId: "delegated_child_followup_user"')
    expect(source).not.toContain("[Delegated Child Completion Follow-up]")
    expect(source).not.toContain("Previous child result:")
    expect(source).not.toContain("Focused follow-up:")
  })
})
