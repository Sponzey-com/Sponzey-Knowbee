import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import { buildFollowupPrompt } from "../packages/core/src/runs/action-execution.ts"
import type { TaskIntakeActionItem, TaskIntakeResult } from "../packages/core/src/agent/intake.ts"

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

describe("task0933 task execution brief prompt source", () => {
  it("registers task execution brief input as a file-backed internal prompt source", () => {
    const source = loadPromptSourceRegistry(process.cwd())
      .find((item) => item.sourceId === "task_execution_brief_user" && item.locale === "en")

    expect(source).toMatchObject({ sourceId: "task_execution_brief_user", usageScope: "internal", enabled: true })
    expect(source?.path.endsWith("prompts/task_execution_brief_user.md")).toBe(true)
    for (const placeholder of [
      "{{originalRequest}}",
      "{{target}}",
      "{{destination}}",
      "{{contextBlock}}",
      "{{normalizedEnglishBlock}}",
      "{{completeConditions}}",
      "{{checklist}}",
      "{{includedContextBlocks}}",
      "{{parentWorkOrder}}",
      "{{selectedExecutor}}",
      "{{requiredOutputs}}",
      "{{verificationNotes}}",
      "{{taskProfile}}",
      "{{successCriteria}}",
      "{{constraints}}",
      "{{executionInstruction}}",
    ]) {
      expect(source?.content).toContain(placeholder)
    }
  })

  it("renders delegated execution brief evidence from runtime values", () => {
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

    expect(prompt).toContain("[Task Execution Brief]")
    expect(prompt).toContain("Original user request:\n보고서를 요약해줘")
    expect(prompt).toContain("[parent_work_order]")
    expect(prompt).toContain("[validated_executor]")
    expect(prompt).toContain("executor_id: agent:summary")
    expect(prompt).toContain("[return_to_parent_contract]")
    expect(prompt).toContain("Do not send or claim the final user-channel answer yourself.")
    expect(prompt).toContain("[success_criteria]")
    expect(prompt).toContain("- Summary is concise.")
  })

  it("does not keep the task execution brief envelope hardcoded in action-execution TypeScript", () => {
    const source = readFileSync("packages/core/src/runs/action-execution.ts", "utf-8")

    expect(source).toContain('sourceId: "task_execution_brief_user"')
    expect(source).not.toContain("[Task Execution Brief]")
    expect(source).not.toContain("This is a child execution prompt for the current root request.")
    expect(source).not.toContain("최종 답변은 원래 사용자 요청과 같은 언어로 작성하세요")
  })
})
