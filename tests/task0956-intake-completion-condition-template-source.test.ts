import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  inferStructuredRequestCompleteCondition,
  type StructuredRequestEnvironment,
  type TaskIntakeActionItem,
  type TaskIntakeIntent,
  type TaskSchedulingSpec,
} from "../packages/core/src/agent/intake.ts"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"

const sourceIds = [
  "intake_complete_condition_schedule_saved_user",
  "intake_complete_condition_schedule_timing_matches_user",
  "intake_complete_condition_schedule_timing_preserved_user",
  "intake_complete_condition_cancel_schedule_user",
  "intake_complete_condition_missing_info_collected_user",
  "intake_complete_condition_reply_destination_user",
  "intake_complete_condition_schedule_registered_user",
  "intake_complete_condition_clarification_requested_user",
  "intake_complete_condition_default_result_user",
] as const

const environment: StructuredRequestEnvironment = {
  destination: "telegram chat 1, main thread",
  contextLines: [],
}

const noneSchedule: TaskSchedulingSpec = {
  detected: false,
  kind: "none",
  status: "not_applicable",
  schedule_text: "",
}

const taskIntent: TaskIntakeIntent = {
  category: "task_intake",
  summary: "Execute task",
  confidence: 0.9,
}

function action(type: TaskIntakeActionItem["type"], payload: Record<string, unknown> = {}): TaskIntakeActionItem {
  return {
    id: `${type}-1`,
    type,
    title: type,
    priority: "normal",
    reason: "test",
    payload,
  }
}

describe("task0956 intake completion condition prompt sources", () => {
  it("registers every intake completion fallback source as internal English prompt source", () => {
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

  it("renders create-schedule completion conditions from prompt source values", () => {
    const result = inferStructuredRequestCompleteCondition(
      taskIntent,
      [action("create_schedule")],
      {
        detected: true,
        kind: "one_time",
        status: "accepted",
        schedule_text: "5초 뒤",
      },
      environment,
    )

    expect(result).toEqual([
      "The requested schedule is saved and active.",
      "The schedule timing matches 5초 뒤.",
    ])
  })

  it("renders non-schedule action and category completion conditions from prompt source values", () => {
    expect(inferStructuredRequestCompleteCondition(taskIntent, [action("cancel_schedule")], noneSchedule, environment)).toEqual([
      "The targeted active schedules are cancelled or disabled.",
    ])
    expect(inferStructuredRequestCompleteCondition(taskIntent, [action("ask_user")], noneSchedule, environment)).toEqual([
      "The missing required information is collected before execution continues.",
    ])
    expect(inferStructuredRequestCompleteCondition(taskIntent, [action("reply")], noneSchedule, environment)).toEqual([
      "A complete user-facing answer is returned in telegram chat 1, main thread.",
    ])
    expect(inferStructuredRequestCompleteCondition({
      category: "schedule_request",
      summary: "Schedule task",
      confidence: 0.9,
    }, [], noneSchedule, environment)).toEqual([
      "The requested scheduled task is registered and can execute later.",
    ])
    expect(inferStructuredRequestCompleteCondition({
      category: "clarification",
      summary: "Ask user",
      confidence: 0.9,
    }, [], noneSchedule, environment)).toEqual([
      "The exact missing information is requested from the user.",
    ])
    expect(inferStructuredRequestCompleteCondition(taskIntent, [], noneSchedule, environment)).toEqual([
      "The requested work is executed and the result is delivered in telegram chat 1, main thread.",
    ])
  })

  it("does not keep intake completion condition bodies hardcoded in TypeScript", () => {
    const source = readFileSync("packages/core/src/agent/intake.ts", "utf-8")

    for (const sourceId of sourceIds) {
      expect(source).toContain(sourceId)
    }
    expect(source).not.toContain("The requested schedule is saved and active.")
    expect(source).not.toContain("The schedule timing matches ${normalizeStructuredText")
    expect(source).not.toContain("The schedule timing is preserved as requested.")
    expect(source).not.toContain("The targeted active schedules are cancelled or disabled.")
    expect(source).not.toContain("The missing required information is collected before execution continues.")
    expect(source).not.toContain("A complete user-facing answer is returned in ${environment.destination}.")
    expect(source).not.toContain("The requested scheduled task is registered and can execute later.")
    expect(source).not.toContain("The exact missing information is requested from the user.")
    expect(source).not.toContain("The requested work is executed and the result is delivered in ${environment.destination}.")
  })
})
