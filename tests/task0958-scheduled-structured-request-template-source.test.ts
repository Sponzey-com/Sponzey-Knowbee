import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { buildScheduledFollowupPrompt } from "../packages/core/src/runs/scheduled.ts"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"

const sourceIds = [
  "scheduled_default_destination_user",
  "scheduled_structured_request_header_user",
  "scheduled_context_task_payload_user",
  "scheduled_context_task_profile_user",
  "scheduled_context_time_reached_user",
  "scheduled_complete_time_reached_user",
  "scheduled_complete_destination_user",
] as const

describe("task0958 scheduled structured request prompt sources", () => {
  it("registers scheduled structured request fragments as internal English prompt sources", () => {
    const registry = loadPromptSourceRegistry(process.cwd())

    for (const sourceId of sourceIds) {
      const source = registry.find((item) => item.sourceId === sourceId && item.locale === "en")

      expect(source).toMatchObject({
        sourceId,
        usageScope: "internal",
        enabled: true,
      })
      expect(source?.content).toContain("## Value")
      expect(source?.content).toContain("## Out Of Scope")
    }
  })

  it("renders scheduled structured request fragments from prompt source values", () => {
    const prompt = buildScheduledFollowupPrompt({
      task: "안녕이라고 말하기",
      goal: "Say hello",
      taskProfile: "general_chat",
      preferredTarget: "auto",
      toolsEnabled: false,
      destination: "telegram chat 1, main thread",
    })

    expect(prompt).toContain("[Scheduled Structured Request]")
    expect(prompt).toContain("Scheduled task payload: 안녕이라고 말하기")
    expect(prompt).toContain("Task profile: general_chat")
    expect(prompt).toContain("This request is being executed because the scheduled time has been reached.")
    expect(prompt).toContain("The scheduled task is executed at the scheduled time.")
    expect(prompt).toContain("The resulting output is delivered to telegram chat 1, main thread.")
  })

  it("uses the file-backed scheduled default destination when destination is blank", () => {
    const prompt = buildScheduledFollowupPrompt({
      task: "안녕",
      goal: "Say hello",
      taskProfile: "general_chat",
      toolsEnabled: false,
    })

    expect(prompt).toContain("To: the scheduled delivery destination")
    expect(prompt).toContain("The resulting output is delivered to the scheduled delivery destination.")
  })

  it("does not keep scheduled structured request fragment bodies hardcoded in TypeScript", () => {
    const source = readFileSync("packages/core/src/runs/scheduled.ts", "utf-8")

    for (const sourceId of sourceIds) {
      expect(source).toContain(sourceId)
    }
    expect(source).not.toContain("the scheduled delivery destination")
    expect(source).not.toContain("[Scheduled Structured Request]")
    expect(source).not.toContain("Scheduled task payload:")
    expect(source).not.toContain("Task profile:")
    expect(source).not.toContain("This request is being executed because the scheduled time has been reached.")
    expect(source).not.toContain("The scheduled task is executed at the scheduled time.")
    expect(source).not.toContain("The resulting output is delivered to ${destination}.")
  })
})
