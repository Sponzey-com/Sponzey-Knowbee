import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import { buildScheduledFollowupPrompt } from "../packages/core/src/runs/scheduled.ts"

describe("task0941 scheduled tool instruction prompt sources", () => {
  it("registers scheduled tool instruction variants as file-backed internal sources", () => {
    const registry = loadPromptSourceRegistry(process.cwd())
    const enabled = registry.find((item) => item.sourceId === "scheduled_tool_enabled_instruction_user" && item.locale === "en")
    const disabled = registry.find((item) => item.sourceId === "scheduled_tool_disabled_instruction_user" && item.locale === "en")

    expect(enabled).toMatchObject({ sourceId: "scheduled_tool_enabled_instruction_user", usageScope: "internal", enabled: true })
    expect(disabled).toMatchObject({ sourceId: "scheduled_tool_disabled_instruction_user", usageScope: "internal", enabled: true })
    expect(enabled?.path.endsWith("prompts/scheduled_tool_enabled_instruction_user.md")).toBe(true)
    expect(disabled?.path.endsWith("prompts/scheduled_tool_disabled_instruction_user.md")).toBe(true)
  })

  it("renders enabled and disabled scheduled instructions from prompt sources", () => {
    const enabledPrompt = buildScheduledFollowupPrompt({
      task: "send report",
      goal: "send report",
      taskProfile: "operations",
      toolsEnabled: true,
    })
    const disabledPrompt = buildScheduledFollowupPrompt({
      task: "안녕",
      goal: "안녕이라고 말하기",
      taskProfile: "general_chat",
      toolsEnabled: false,
    })

    expect(enabledPrompt).toContain("# Scheduled Tool Enabled Instruction")
    expect(enabledPrompt).toContain("Use tools only when this scheduled task requires real external action.")
    expect(disabledPrompt).toContain("# Scheduled Tool Disabled Instruction")
    expect(disabledPrompt).toContain("Use no tools.")
    expect(disabledPrompt).toContain("Return only the requested result unless schedule context is required for accuracy.")
  })

  it("does not keep scheduled tool instruction bodies hardcoded in TypeScript", () => {
    const source = readFileSync("packages/core/src/runs/scheduled.ts", "utf-8")

    expect(source).toContain("scheduled_tool_enabled_instruction_user")
    expect(source).toContain("scheduled_tool_disabled_instruction_user")
    expect(source).not.toContain("Use tools only when this scheduled task requires real external action.")
    expect(source).not.toContain("Use no tools. Return only the requested result")
  })
})
