import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { TaskIntakeActionItem, TaskIntakeResult } from "../packages/core/src/agent/intake.ts"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import { buildFollowupPrompt } from "../packages/core/src/runs/action-execution.ts"

function intake(input: {
  target?: string
  destination?: string
  completeConditions?: string[]
  filesystemEffect?: "none" | "read" | "mutate"
  artifactDelivery?: "none" | "direct" | "reference"
} = {}): TaskIntakeResult {
  const executionSemantics = {
    filesystemEffect: input.filesystemEffect ?? "none",
    privilegedOperation: "none" as const,
    artifactDelivery: input.artifactDelivery ?? "none",
    approvalRequired: false,
    approvalTool: "external_action" as const,
  }
  const target = input.target ?? "A report summary"
  const destination = input.destination ?? "current channel"
  const completeConditions = input.completeConditions ?? ["Return a concise summary."]
  return {
    intent: { category: "task_intake", summary: "Summarize the report", confidence: 0.9 },
    user_message: { mode: "accepted_receipt", text: "" },
    action_items: [],
    structured_request: {
      source_language: "ko",
      normalized_english: "Summarize the report.",
      target,
      to: destination,
      context: ["Report path: /tmp/report.md"],
      complete_condition: completeConditions,
    },
    intent_envelope: {
      intent_type: "task_intake",
      source_language: "ko",
      normalized_english: "Summarize the report.",
      target,
      destination,
      context: ["Report path: /tmp/report.md"],
      complete_condition: completeConditions,
      schedule_spec: { detected: false, kind: "none", status: "not_applicable", schedule_text: "" },
      execution_semantics: executionSemantics,
      delivery_mode: "none",
      requires_approval: false,
      approval_tool: "external_action",
      preferred_target: "auto",
      needs_tools: false,
      needs_web: false,
    },
    scheduling: { detected: false, kind: "none", status: "not_applicable", schedule_text: "" },
    execution: {
      requires_run: true,
      requires_delegation: false,
      suggested_target: "auto",
      max_delegation_turns: 4,
      needs_tools: false,
      needs_web: false,
      execution_semantics: executionSemantics,
    },
    notes: [],
  }
}

function action(title = "Summarize report"): TaskIntakeActionItem {
  return {
    id: "a1",
    type: "run_task",
    title,
    priority: "normal",
    reason: "delegate",
    payload: {},
  }
}

function prompt(input: Parameters<typeof intake>[0] = {}, actionTitle?: string): string {
  return buildFollowupPrompt({
    originalMessage: "보고서를 요약해줘",
    intake: intake(input),
    action: action(actionTitle),
    taskProfile: "analysis",
  })
}

describe("task0946 child execution checklist fragment prompt sources", () => {
  it("registers child checklist fragments and shared default values as file-backed internal sources", () => {
    const registry = loadPromptSourceRegistry(process.cwd())
    const sourceIds = [
      "execution_default_target_user",
      "execution_default_destination_user",
      "execution_default_complete_condition_user",
      "task_execution_checklist_confirm_goal_user",
      "task_execution_checklist_filesystem_work_user",
      "task_execution_checklist_general_work_user",
      "task_execution_checklist_complete_condition_user",
      "task_execution_checklist_direct_artifact_user",
      "task_execution_checklist_final_result_user",
      "task_execution_checklist_stop_condition_user",
    ]

    for (const sourceId of sourceIds) {
      const source = registry.find((item) => item.sourceId === sourceId && item.locale === "en")
      expect(source).toMatchObject({ sourceId, usageScope: "internal", enabled: true })
      expect(source?.content).toContain("## Value")
      expect(source?.content).toContain("## Out Of Scope")
    }
  })

  it("renders ordinary child checklist items from Value sections", () => {
    const rendered = prompt()

    expect(rendered).toContain("- Confirm goal: A report summary")
    expect(rendered).toContain("- Perform the requested real work.")
    expect(rendered).toContain("- Verify completion condition: Return a concise summary.")
    expect(rendered).toContain("- Deliver the final result to current channel.")
    expect(rendered).toContain("- Confirm completed items internally with [x] and stop only when no items remain.")
    expect(rendered).not.toContain("# Task Execution Checklist")
  })

  it("renders filesystem and direct artifact child checklist variants from Value sections", () => {
    const rendered = prompt({
      filesystemEffect: "mutate",
      artifactDelivery: "direct",
    })

    expect(rendered).toContain("- Create or modify the actual file or folder result.")
    expect(rendered).toContain("- Deliver the artifact itself to current channel.")
    expect(rendered).not.toContain("- Perform the requested real work.")
    expect(rendered).not.toContain("- Deliver the final result to current channel.")
  })

  it("uses shared default fallback sources for blank child execution fields", () => {
    const rendered = prompt({
      target: "",
      destination: "",
      completeConditions: [],
    }, "")

    expect(rendered).toContain("[target]\nExecute the requested work.")
    expect(rendered).toContain("[to]\nthe current channel")
    expect(rendered).toContain("[complete-condition]\n- Produce the requested result in the current execution.")
    expect(rendered).toContain("- Verify completion condition: Produce the requested result in the current execution.")
  })

  it("does not keep child checklist and default fallback bodies hardcoded in action-execution TypeScript", () => {
    const source = readFileSync("packages/core/src/runs/action-execution.ts", "utf-8")

    expect(source).toContain("task_execution_checklist_confirm_goal_user")
    expect(source).toContain("execution_default_target_user")
    expect(source).not.toContain("Confirm goal:")
    expect(source).not.toContain("Create or modify the actual file or folder result.")
    expect(source).not.toContain("Perform the requested real work.")
    expect(source).not.toContain("Produce the requested result in the current execution.")
    expect(source).not.toContain("the current channel")
  })
})
