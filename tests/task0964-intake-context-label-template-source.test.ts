import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"

describe("task0964 intake conversation context label prompt source", () => {
  it("registers intake context labels as an internal English source", () => {
    const registry = loadPromptSourceRegistry(process.cwd())
    const source = registry.find((item) =>
      item.sourceId === "intake_conversation_context_labels_user" && item.locale === "en"
    )

    expect(source).toMatchObject({
      sourceId: "intake_conversation_context_labels_user",
      usageScope: "internal",
      enabled: true,
    })
    expect(source?.content).toContain("## Value")
    expect(source?.content).toContain("recent_conversation=Recent conversation:")
    expect(source?.content).toContain("latest_user_message=Latest user message (original):")
    expect(source?.content).toContain("## Out Of Scope")
  })

  it("does not keep intake context label bodies hardcoded in TypeScript", () => {
    const source = readFileSync("packages/core/src/agent/intake.ts", "utf-8")

    expect(source).toContain("intake_conversation_context_labels_user")
    expect(source).not.toContain('lines.push("Recent conversation:")')
    expect(source).not.toContain('lines.push("Runtime environment:")')
    expect(source).not.toContain('lines.push("Delivery environment:")')
    expect(source).not.toContain('lines.push("Normalized English request:")')
    expect(source).not.toContain('lines.push("Latest user message (original):")')
  })
})
