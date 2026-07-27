import { describe, expect, it } from "vitest"
import { validateIntakeDecisionConsistency } from "../packages/core/src/agent/intake-decision.ts"

const clarification = {
  intent: { category: "clarification" as const },
  userMessage: { mode: "clarification_receipt" as const, text: "어느 폴더의 문서를 정리할까요?" },
  actionItems: [{
    type: "ask_user" as const,
    payload: { question: "어느 폴더의 문서를 정리할까요?", missing_fields: ["target_folder"] },
  }],
  execution: { requires_run: false, requires_delegation: false },
}

describe("task1200 intake decision consistency", () => {
  it("accepts one focused clarification for a concrete missing input", () => {
    expect(validateIntakeDecisionConsistency(clarification)).toEqual({ ok: true, issues: [] })
  })

  it("rejects clarification mixed with execution or multiple questions", () => {
    const result = validateIntakeDecisionConsistency({
      ...clarification,
      actionItems: [
        ...clarification.actionItems,
        { type: "ask_user", payload: { question: "언제 할까요?", missing_fields: ["time"] } },
      ],
      execution: { requires_run: true, requires_delegation: false },
    })

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      "clarification_action_count_invalid",
      "clarification_execution_conflict",
    ]))
  })

  it("rejects internal schema terms and missing clarification fields", () => {
    const result = validateIntakeDecisionConsistency({
      ...clarification,
      userMessage: { mode: "clarification_receipt", text: "missing_fields와 agent_id를 입력하세요." },
      actionItems: [{
        type: "ask_user",
        payload: { question: "missing_fields와 agent_id를 입력하세요.", missing_fields: [] },
      }],
    })

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      "clarification_missing_fields_empty",
      "clarification_internal_term_exposed",
    ]))
  })

  it("rejects unnecessary clarification artifacts in an executable request", () => {
    expect(validateIntakeDecisionConsistency({
      intent: { category: "task_intake" },
      userMessage: { mode: "clarification_receipt", text: "진행할까요?" },
      actionItems: [{ type: "ask_user", payload: { question: "진행할까요?", missing_fields: ["confirmation"] } }],
      execution: { requires_run: true, requires_delegation: false },
    })).toEqual({
      ok: false,
      issues: [
        "non_clarification_receipt_mismatch",
        "non_clarification_ask_user_forbidden",
        "task_intake_receipt_mismatch",
        "task_intake_action_missing",
      ],
    })
  })

  it("keeps conversational direct answers free of execution actions", () => {
    expect(validateIntakeDecisionConsistency({
      intent: { category: "direct_answer" },
      userMessage: { mode: "direct_answer", text: "안녕하세요." },
      actionItems: [{ type: "reply", payload: { content: "안녕하세요." } }],
      execution: { requires_run: false, requires_delegation: false },
    })).toEqual({ ok: true, issues: [] })

    expect(validateIntakeDecisionConsistency({
      intent: { category: "direct_answer" },
      userMessage: { mode: "accepted_receipt", text: "확인하겠습니다." },
      actionItems: [{ type: "run_task", payload: { goal: "inspect files" } }],
      execution: { requires_run: true, requires_delegation: false },
    })).toEqual({
      ok: false,
      issues: [
        "direct_answer_receipt_mismatch",
        "direct_answer_action_invalid",
        "direct_answer_execution_conflict",
      ],
    })
  })

  it("requires executable task intake to carry a run action and accepted receipt", () => {
    expect(validateIntakeDecisionConsistency({
      intent: { category: "task_intake" },
      userMessage: { mode: "accepted_receipt", text: "파일을 확인하겠습니다." },
      actionItems: [{ type: "run_task", payload: { goal: "inspect files" } }],
      execution: { requires_run: true, requires_delegation: false },
    })).toEqual({ ok: true, issues: [] })

    expect(validateIntakeDecisionConsistency({
      intent: { category: "task_intake" },
      userMessage: { mode: "direct_answer", text: "완료했습니다." },
      actionItems: [{ type: "reply", payload: { content: "완료했습니다." } }],
      execution: { requires_run: false, requires_delegation: false },
    })).toEqual({
      ok: false,
      issues: [
        "task_intake_receipt_mismatch",
        "task_intake_action_missing",
        "task_intake_execution_missing",
      ],
    })
  })

  it("rejects contradictory privileged camera execution semantics", () => {
    const result = validateIntakeDecisionConsistency({
      intent: { category: "task_intake" },
      userMessage: { mode: "accepted_receipt", text: "카메라 요청을 확인했습니다." },
      actionItems: [{
        type: "run_task",
        payload: { goal: "Capture and deliver a camera image." },
      }],
      execution: {
        requires_run: true,
        requires_delegation: false,
        needs_tools: true,
        execution_semantics: {
          filesystemEffect: "none",
          privilegedOperation: "none",
          artifactDelivery: "direct",
          approvalRequired: true,
          approvalTool: "yeonjang_camera_capture",
        },
      },
    })

    expect(result).toEqual({
      ok: false,
      issues: ["execution_approval_requires_privileged_operation"],
    })
  })

  it("requires privileged execution to retain its tool and approval contracts", () => {
    const result = validateIntakeDecisionConsistency({
      intent: { category: "task_intake" },
      userMessage: { mode: "accepted_receipt", text: "카메라 요청을 확인했습니다." },
      actionItems: [{
        type: "run_task",
        payload: { goal: "Capture and deliver a camera image." },
      }],
      execution: {
        requires_run: true,
        requires_delegation: false,
        needs_tools: false,
        execution_semantics: {
          filesystemEffect: "none",
          privilegedOperation: "required",
          artifactDelivery: "direct",
          approvalRequired: false,
          approvalTool: "yeonjang_camera_capture",
        },
      },
    })

    expect(result).toEqual({
      ok: false,
      issues: [
        "execution_privileged_operation_requires_tools",
        "execution_specific_approval_tool_requires_approval",
      ],
    })
  })

  it("rejects a model failed receipt for a schedule request", () => {
    expect(validateIntakeDecisionConsistency({
      intent: { category: "schedule_request" },
      userMessage: { mode: "failed_receipt", text: "일정을 처리할 수 없습니다." },
      actionItems: [],
      execution: { requires_run: false, requires_delegation: false },
    })).toEqual({
      ok: false,
      issues: ["model_failed_receipt_forbidden"],
    })
  })
})
