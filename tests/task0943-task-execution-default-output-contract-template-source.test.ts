import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { TaskIntakeActionItem, TaskIntakeResult } from "../packages/core/src/agent/intake.ts"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
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
    intent: { category: "task_intake", summary: "Run delegated task", confidence: 0.9 },
    user_message: { mode: "accepted_receipt", text: "" },
    action_items: [],
    structured_request: {
      source_language: "ko",
      normalized_english: "Run delegated task.",
      target: "",
      to: "current channel",
      context: [],
      complete_condition: [],
    },
    intent_envelope: {
      intent_type: "task_intake",
      source_language: "ko",
      normalized_english: "Run delegated task.",
      target: "",
      destination: "current channel",
      context: [],
      complete_condition: [],
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

const action: TaskIntakeActionItem = {
  id: "a1",
  type: "run_task",
  title: "Run work",
  priority: "normal",
  reason: "delegate",
  payload: { goal: "Run delegated task." },
}

describe("task0943 task execution default output contract prompt sources", () => {
  it("registers default output contract fragments as file-backed internal sources", () => {
    const registry = loadPromptSourceRegistry(process.cwd())
    const requiredOutput = registry.find((item) =>
      item.sourceId === "task_execution_default_required_output_user" && item.locale === "en")
    const verificationNote = registry.find((item) =>
      item.sourceId === "task_execution_default_verification_note_user" && item.locale === "en")
    const textVerificationNote = registry.find((item) =>
      item.sourceId === "task_execution_text_verification_note_user" && item.locale === "en")

    expect(requiredOutput).toMatchObject({
      sourceId: "task_execution_default_required_output_user",
      usageScope: "internal",
      enabled: true,
    })
    expect(verificationNote).toMatchObject({
      sourceId: "task_execution_default_verification_note_user",
      usageScope: "internal",
      enabled: true,
    })
    expect(textVerificationNote).toMatchObject({
      sourceId: "task_execution_text_verification_note_user",
      usageScope: "internal",
      enabled: true,
    })
    expect(requiredOutput?.content).toContain("## Value")
    expect(verificationNote?.content).toContain("## Value")
    expect(textVerificationNote?.content).toContain("## Value")
  })

  it("uses only the Value section for runtime required outputs and verification notes", () => {
    const prompt = buildFollowupPrompt({
      originalMessage: "작업해줘",
      intake: intake(),
      action,
      taskProfile: "analysis",
    })

    expect(prompt).toContain("[required_outputs]\n- Return the concrete result requested by the parent work order.")
    expect(prompt).toContain("[verification_notes]\n- When the result is text, separate confirmed facts from unverified items.")
    expect(prompt).not.toContain("# Task Execution Default Required Output")
    expect(prompt).not.toContain("# Task Execution Default Verification Note")
    expect(prompt).not.toContain("# Task Execution Text Verification Note")
  })

  it("does not keep default output contract fallback bodies hardcoded in action-execution TypeScript", () => {
    const source = readFileSync("packages/core/src/runs/action-execution.ts", "utf-8")

    expect(source).toContain("task_execution_default_required_output_user")
    expect(source).toContain("task_execution_default_verification_note_user")
    expect(source).toContain("task_execution_text_verification_note_user")
    expect(source).not.toContain("Return the concrete result requested by the parent work order.")
    expect(source).not.toContain("Verify the output against the original request before returning it.")
    expect(source).not.toContain("결과가 텍스트라도 확인한 사실과 확인하지 못한 항목을 분리한다.")
  })
})
