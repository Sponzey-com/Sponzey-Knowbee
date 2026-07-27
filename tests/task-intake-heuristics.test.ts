import { describe, expect, it } from "vitest"
import { promotePromissoryDirectAnswer } from "../packages/core/src/agent/intake.ts"

describe("promotePromissoryDirectAnswer", () => {
  it("promotes a direct answer when the LLM contract says web execution is required", () => {
    const result = promotePromissoryDirectAnswer({
      intent: {
        category: "direct_answer",
        summary: "실시간 날씨 확인",
        confidence: 0.9,
      },
      user_message: {
        mode: "direct_answer",
        text: "현재 동천동 날씨를 확인하려면 실시간 조회가 필요해요. 지금 바로 확인해드릴게요.",
      },
      action_items: [{
        id: "reply-1",
        type: "reply",
        title: "reply",
        priority: "normal",
        reason: "direct reply",
        payload: { content: "현재 동천동 날씨를 확인하려면 실시간 조회가 필요해요. 지금 바로 확인해드릴게요." },
      }],
      structured_request: {
        source_language: "ko",
        normalized_english: "Check the current weather in Dongcheon-dong.",
        target: "current weather in Dongcheon-dong",
        to: "telegram chat 1, main thread",
        context: ["User asked for current weather in Dongcheon-dong."],
        complete_condition: ["Return the current weather for Dongcheon-dong."],
      },
      intent_envelope: {
        intent_type: "direct_answer",
        source_language: "ko",
        normalized_english: "Check the current weather in Dongcheon-dong.",
        target: "current weather in Dongcheon-dong",
        destination: "telegram chat 1, main thread",
        context: ["User asked for current weather in Dongcheon-dong."],
        complete_condition: ["Return the current weather for Dongcheon-dong."],
        schedule_spec: {
          detected: false,
          kind: "none",
          status: "not_applicable",
          schedule_text: "",
        },
        execution_semantics: {
          filesystemEffect: "none",
          privilegedOperation: "none",
          artifactDelivery: "none",
          approvalRequired: false,
          approvalTool: "external_action",
        },
        delivery_mode: "none",
        requires_approval: false,
        approval_tool: "external_action",
        preferred_target: "auto",
        needs_tools: true,
        needs_web: true,
      },
      scheduling: {
        detected: false,
        kind: "none",
        status: "not_applicable",
        schedule_text: "",
      },
      execution: {
        requires_run: false,
        requires_delegation: false,
        suggested_target: "auto",
        max_delegation_turns: 5,
        needs_tools: true,
        needs_web: true,
        execution_semantics: {
          filesystemEffect: "none",
          privilegedOperation: "none",
          artifactDelivery: "none",
          approvalRequired: false,
          approvalTool: "external_action",
        },
      },
      notes: [],
    }, "오늘 동천동 지금 날씨 어때?")

    expect(result.intent.category).toBe("task_intake")
    expect(result.user_message.mode).toBe("accepted_receipt")
    expect(result.execution.requires_run).toBe(true)
    expect(result.execution.needs_web).toBe(true)
    expect(result.action_items[0]?.type).toBe("run_task")
  })
})
