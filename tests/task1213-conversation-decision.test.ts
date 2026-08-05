import { describe, expect, it } from "vitest"
import {
  validateConversationDecision,
  type ConversationDecision,
} from "../packages/core/src/agent/conversation-decision.ts"

function decision(overrides: Partial<ConversationDecision> = {}): ConversationDecision {
  return {
    requestKind: "work_request",
    goal: "문서를 정리한다",
    constraints: ["원문을 삭제하지 않는다"],
    availableContext: ["작업 폴더가 지정됨"],
    requiredTools: ["filesystem"],
    ambiguity: { impact: "none", missingFields: [], assumptions: [] },
    selectedAction: "plan_work",
    ...overrides,
  }
}

describe("task1213 conversational request decision", () => {
  it.each(["general_conversation", "simple_question"] as const)(
    "routes %s to an LLM direct answer without execution",
    (requestKind) => {
      expect(validateConversationDecision(decision({
        requestKind,
        goal: "사용자와 대화한다",
        requiredTools: [],
        selectedAction: "direct_answer",
      }))).toEqual({ ok: true, issues: [] })
    },
  )

  it("requires a concise clarification for ambiguity that can change the result", () => {
    expect(validateConversationDecision(decision({
      ambiguity: { impact: "high_impact", missingFields: ["target_folder"], assumptions: [] },
      selectedAction: "ask_clarification",
      clarificationQuestion: "어느 폴더를 정리할까요?",
    }))).toEqual({ ok: true, issues: [] })
  })

  it("continues with a disclosed assumption for low-impact ambiguity", () => {
    expect(validateConversationDecision(decision({
      ambiguity: { impact: "low_impact", missingFields: [], assumptions: ["파일명 오름차순으로 정렬한다"] },
    }))).toEqual({ ok: true, issues: [] })
  })

  it("rejects workflow execution for conversation and unnecessary clarification for low impact ambiguity", () => {
    expect(validateConversationDecision(decision({
      requestKind: "general_conversation",
      requiredTools: ["filesystem"],
      selectedAction: "plan_work",
    })).issues).toEqual(expect.arrayContaining([
      "direct_answer_action_required",
      "direct_answer_execution_forbidden",
    ]))

    expect(validateConversationDecision(decision({
      ambiguity: { impact: "low_impact", missingFields: [], assumptions: [] },
      selectedAction: "ask_clarification",
    })).issues).toEqual(expect.arrayContaining([
      "low_impact_assumption_required",
      "low_impact_clarification_forbidden",
    ]))

    expect(validateConversationDecision(decision({ goal: "" })).issues).toContain("goal_required")
  })
})
