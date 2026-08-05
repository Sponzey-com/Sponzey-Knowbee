import { describe, expect, it, vi } from "vitest"
import {
  executeScheduleActions,
  type ScheduleActionDependencies,
} from "../packages/core/src/runs/action-execution.ts"
import { buildScheduleActionResultNotice } from "../packages/core/src/runs/schedule-action-notice.ts"
import type { TaskIntakeActionItem, TaskIntakeResult } from "../packages/core/src/agent/intake.ts"

function buildIntake(): TaskIntakeResult {
  return {
    intent: { category: "schedule_request", summary: "예약", confidence: 0.9 },
    user_message: { mode: "accepted_receipt", text: "요청을 접수했습니다." },
    action_items: [],
    structured_request: {
      source_language: "ko",
      normalized_english: "Schedule a task.",
      target: "예약",
      to: "telegram chat",
      context: [],
      complete_condition: ["예약 결과가 확인됩니다."],
    },
    intent_envelope: {
      intent_type: "schedule_request",
      source_language: "ko",
      normalized_english: "Schedule a task.",
      target: "예약",
      destination: "telegram chat",
      context: [],
      complete_condition: ["예약 결과가 확인됩니다."],
      schedule_spec: { detected: true, kind: "one_time", status: "accepted", schedule_text: "30초 뒤" },
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
      needs_tools: false,
      needs_web: false,
    },
    scheduling: { detected: true, kind: "one_time", status: "accepted", schedule_text: "30초 뒤" },
    execution: {
      requires_run: true,
      requires_delegation: false,
      suggested_target: "auto",
      max_delegation_turns: 3,
      needs_tools: false,
      needs_web: false,
      execution_semantics: {
        filesystemEffect: "none",
        privilegedOperation: "none",
        artifactDelivery: "none",
        approvalRequired: false,
        approvalTool: "external_action",
      },
    },
    notes: [],
  }
}

function buildDependencies(): ScheduleActionDependencies {
  return {
    scheduleDelayedRun: vi.fn(),
    createRecurringSchedule: vi.fn(() => ({ scheduleId: "schedule-1", driver: "internal" as const })),
    cancelSchedules: vi.fn(() => []),
  }
}

function execute(actions: TaskIntakeActionItem[]) {
  return executeScheduleActions(actions, buildIntake(), {
    runId: "run-1",
    message: "30초 뒤 알려줘",
    originalRequest: "30초 뒤 알려줘",
    sessionId: "session-1",
    requestGroupId: "group-1",
    model: "gpt-test",
    source: "telegram",
    onChunk: undefined,
  }, buildDependencies())
}

describe("task0820 schedule action result notice", () => {
  it("builds non-final schedule action notice metadata", () => {
    expect(buildScheduleActionResultNotice({
      ok: true,
      actionCount: 1.8,
      successCount: 1.2,
      failureCount: 0,
    })).toEqual({
      kind: "schedule_action_result",
      ok: true,
      actionCount: 1,
      successCount: 1,
      failureCount: 0,
      deliveryMode: "control",
      textSource: "schedule_action_result_notice",
      renderingRequired: "llm_final_response",
      finalAnswer: false,
      assistantIdentityClaim: false,
    })
  })

  it("attaches notice to successful schedule action results", () => {
    const result = execute([{
      id: "schedule-1",
      type: "create_schedule",
      title: "30초 뒤",
      priority: "normal",
      reason: "사용자 예약 요청",
      payload: {
        title: "30초 뒤",
        task: "알림",
        run_at: "2026-04-01T00:00:30.000Z",
      },
    }])

    expect(result.notice).toMatchObject({
      kind: "schedule_action_result",
      ok: true,
      actionCount: 1,
      successCount: 1,
      failureCount: 0,
      finalAnswer: false,
    })
  })

  it("attaches notice to failed schedule action results", () => {
    const result = execute([{
      id: "schedule-fail",
      type: "create_schedule",
      title: "잘못된 예약",
      priority: "normal",
      reason: "invalid run_at",
      payload: {
        title: "잘못된 예약",
        task: "알림",
        run_at: "not-a-date",
      },
    }])

    expect(result.notice).toMatchObject({
      kind: "schedule_action_result",
      ok: false,
      actionCount: 1,
      successCount: 0,
      failureCount: 1,
      textSource: "schedule_action_result_notice",
      finalAnswer: false,
    })
  })
})
