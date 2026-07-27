import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import type { TaskIntakeActionItem, TaskIntakeResult } from "../packages/core/src/agent/intake.ts"
import { buildFollowupPrompt } from "../packages/core/src/runs/action-execution.ts"

function intake(): TaskIntakeResult {
  const executionSemantics = {
    filesystemEffect: "none" as const,
    privilegedOperation: "none" as const,
    artifactDelivery: "none" as const,
    approvalRequired: false,
    approvalTool: "external_action" as const,
  }
  return {
    intent: { category: "task_intake", summary: "Summarize the report", confidence: 0.9 },
    user_message: { mode: "accepted_receipt", text: "" },
    action_items: [],
    structured_request: {
      source_language: "ko",
      normalized_english: "Summarize the report.",
      target: "A report summary",
      to: "current channel",
      context: ["Report path: /tmp/report.md"],
      complete_condition: ["Return a concise summary."],
    },
    intent_envelope: {
      intent_type: "task_intake",
      source_language: "ko",
      normalized_english: "Summarize the report.",
      target: "A report summary",
      destination: "current channel",
      context: ["Report path: /tmp/report.md"],
      complete_condition: ["Return a concise summary."],
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

describe("task0966 task execution brief section label source", () => {
  it("registers task execution brief section labels as a file-backed internal prompt source", () => {
    const source = loadPromptSourceRegistry(process.cwd())
      .find((item) => item.sourceId === "task_execution_brief_section_labels_user" && item.locale === "en")

    expect(source).toMatchObject({
      sourceId: "task_execution_brief_section_labels_user",
      usageScope: "internal",
      enabled: true,
    })
    expect(source?.path.endsWith("prompts/task_execution_brief_section_labels_user.md")).toBe(true)
    expect(source?.content).toContain("validated_executor_header=[validated_executor]")
    expect(source?.content).toContain("context_header=[context]")
    expect(source?.content).toContain("parent_work_order_header=[parent_work_order]")
    expect(source?.content).toContain("success_criteria_header=[success_criteria]")
    expect(source?.content).toContain("## Out Of Scope")
  })

  it("renders existing execution brief labels from the prompt source", () => {
    const action: TaskIntakeActionItem = {
      id: "a1",
      type: "run_task",
      title: "Summarize report",
      priority: "normal",
      reason: "delegate",
      payload: {
        goal: "Summarize the report.",
        success_criteria: ["Summary is concise."],
        constraints: ["Do not invent facts."],
      },
    }
    const prompt = buildFollowupPrompt({
      originalMessage: "보고서를 요약해줘",
      intake: intake(),
      action,
      taskProfile: "analysis",
      selectedExecutorId: "agent:summary",
      selectedExecutorLabel: "요약 에이전트",
      selectedExecutorReason: "summary role matched",
    })

    expect(prompt).toContain("[context]\n- Report path: /tmp/report.md")
    expect(prompt).toContain("[normalized-english]\nSummarize the report.")
    expect(prompt).toContain("[included_context_blocks]")
    expect(prompt).toContain("[parent_work_order]")
    expect(prompt).toContain("root_request: 보고서를 요약해줘")
    expect(prompt).toContain("task_profile: analysis")
    expect(prompt).toContain("[validated_executor]")
    expect(prompt).toContain("executor_id: agent:summary")
    expect(prompt).toContain("selection_reason: summary role matched")
    expect(prompt).toContain("[success_criteria]\n- Summary is concise.")
    expect(prompt).toContain("[constraints]\n- Do not invent facts.")
  })

  it("does not keep task execution brief section labels hardcoded in TypeScript", () => {
    const source = readFileSync("packages/core/src/runs/action-execution.ts", "utf-8")
    const removedFragments = [
      "\"[validated_executor]\"",
      "executor_id: ${params.selectedExecutorId}",
      "executor_label: ${params.selectedExecutorLabel}",
      "selection_reason: ${params.selectedExecutorReason}",
      "\"[context]\"",
      "\"[normalized-english]\"",
      "\"[included_context_blocks]\"",
      "\"[parent_work_order]\"",
      "root_request: ${params.originalMessage}",
      "delegated_action: ${params.action.title}",
      "task_profile: ${params.taskProfile}",
      "\"[success_criteria]\"",
      "\"[constraints]\"",
    ]

    expect(source).toContain('TASK_EXECUTION_BRIEF_SECTION_LABELS_SOURCE_ID = "task_execution_brief_section_labels_user"')
    for (const fragment of removedFragments) {
      expect(source).not.toContain(fragment)
    }
  })
})
