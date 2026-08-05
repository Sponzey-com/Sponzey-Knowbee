import { describe, expect, it, vi } from "vitest"
import {
  executeScheduleActions,
  type ScheduleActionDependencies,
} from "../packages/core/src/runs/action-execution.ts"
import type { TaskIntakeActionItem, TaskIntakeResult } from "../packages/core/src/agent/intake.ts"

function buildIntake(overrides: Partial<TaskIntakeResult> = {}): TaskIntakeResult {
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
    ...overrides,
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

describe("task0794 schedule action result provenance", () => {
  it("passes the intake response-language mode into recurring schedule persistence", () => {
    const dependencies = buildDependencies()
    const intake = buildIntake({
      structured_request: {
        ...buildIntake().structured_request,
        response_language_mode: "translation",
      },
    })

    executeScheduleActions([{
      id: "schedule-language-mode",
      type: "create_schedule",
      title: "매일 번역",
      priority: "normal",
      reason: "사용자 반복 번역 요청",
      payload: {
        title: "매일 번역",
        task: "Translate the daily report into Korean.",
        cron: "0 9 * * *",
      },
    }], intake, {
      runId: "run-language-mode",
      message: "매일 보고서를 한국어로 번역해줘",
      originalRequest: "매일 보고서를 한국어로 번역해줘",
      sessionId: "session-language-mode",
      requestGroupId: "group-language-mode",
      model: "gpt-test",
      source: "telegram",
      onChunk: undefined,
    }, dependencies)

    expect(dependencies.createRecurringSchedule).toHaveBeenCalledWith(expect.objectContaining({
      responseLanguageMode: "translation",
    }))
  })

  it("marks successful schedule result messages as deterministic raw text requiring final rendering", () => {
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

    expect(result.ok).toBe(true)
    expect(result.messageTextSource).toBe("runtime_deterministic")
    expect(result.requiresFinalResponseRendering).toBe(true)
  })

  it("marks failed schedule result messages with the same provenance", () => {
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

    expect(result.ok).toBe(false)
    expect(result.messageTextSource).toBe("runtime_deterministic")
    expect(result.requiresFinalResponseRendering).toBe(true)
  })
})
