import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { TaskIntakeActionItem, TaskIntakeResult } from "../packages/core/src/agent/intake.ts"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import { buildFollowupPrompt } from "../packages/core/src/runs/action-execution.ts"

function intake(filesystemEffect: "none" | "mutate"): TaskIntakeResult {
  const executionSemantics = {
    filesystemEffect,
    privilegedOperation: "none" as const,
    artifactDelivery: "none" as const,
    approvalRequired: false,
    approvalTool: "external_action" as const,
  }
  return {
    intent: { category: "task_intake", summary: "Run delegated task", confidence: 0.9 },
    user_message: { mode: "accepted_receipt", text: "" },
    action_items: [],
    structured_request: {
      source_language: "ko",
      normalized_english: "Run delegated task.",
      target: "Delegated result",
      to: "current channel",
      context: [],
      complete_condition: ["Return result."],
    },
    intent_envelope: {
      intent_type: "task_intake",
      source_language: "ko",
      normalized_english: "Run delegated task.",
      target: "Delegated result",
      destination: "current channel",
      context: [],
      complete_condition: ["Return result."],
      schedule_spec: { detected: false, kind: "none", status: "not_applicable", schedule_text: "" },
      execution_semantics: executionSemantics,
      delivery_mode: "none",
      requires_approval: false,
      approval_tool: "external_action",
      preferred_target: "auto",
      needs_tools: filesystemEffect === "mutate",
      needs_web: false,
    },
    scheduling: { detected: false, kind: "none", status: "not_applicable", schedule_text: "" },
    execution: {
      requires_run: true,
      requires_delegation: false,
      suggested_target: "auto",
      max_delegation_turns: 4,
      needs_tools: filesystemEffect === "mutate",
      needs_web: false,
      execution_semantics: executionSemantics,
    },
    notes: [],
  }
}

const action: TaskIntakeActionItem = {
  id: "a1",
  type: "run_task",
  title: "Run work",
  priority: "normal",
  reason: "delegate",
  payload: { goal: "Run delegated task." },
}

describe("task0942 task execution instruction prompt sources", () => {
  it("registers task execution instruction variants as file-backed internal sources", () => {
    const registry = loadPromptSourceRegistry(process.cwd())
    const filesystem = registry.find((item) => item.sourceId === "task_execution_filesystem_instruction_user" && item.locale === "en")
    const general = registry.find((item) => item.sourceId === "task_execution_general_instruction_user" && item.locale === "en")

    expect(filesystem).toMatchObject({ sourceId: "task_execution_filesystem_instruction_user", usageScope: "internal", enabled: true })
    expect(general).toMatchObject({ sourceId: "task_execution_general_instruction_user", usageScope: "internal", enabled: true })
    expect(filesystem?.path.endsWith("prompts/task_execution_filesystem_instruction_user.md")).toBe(true)
    expect(general?.path.endsWith("prompts/task_execution_general_instruction_user.md")).toBe(true)
  })

  it("renders general and filesystem execution instructions from prompt sources", () => {
    const generalPrompt = buildFollowupPrompt({
      originalMessage: "요약해줘",
      intake: intake("none"),
      action,
      taskProfile: "analysis",
    })
    const filesystemPrompt = buildFollowupPrompt({
      originalMessage: "파일을 만들어줘",
      intake: intake("mutate"),
      action,
      taskProfile: "coding",
    })

    expect(generalPrompt).toContain("# Task Execution General Instruction")
    expect(generalPrompt).toContain("Perform the actual work now.")
    expect(generalPrompt).toContain("Return a concrete result that the parent agent can review and aggregate.")
    expect(filesystemPrompt).toContain("# Task Execution Filesystem Instruction")
    expect(filesystemPrompt).toContain("This request requires a real local file or folder change.")
    expect(filesystemPrompt).toContain("Do not finish with only code snippets, explanation, or manual guidance.")
  })

  it("does not keep execution instruction bodies hardcoded in action-execution TypeScript", () => {
    const source = readFileSync("packages/core/src/runs/action-execution.ts", "utf-8")

    expect(source).toContain("task_execution_filesystem_instruction_user")
    expect(source).toContain("task_execution_general_instruction_user")
    expect(source).not.toContain("Use a local tool to create or modify it. Do not finish with only code snippets")
    expect(source).not.toContain("Perform the actual work now. Do not create another intake receipt")
  })
})
