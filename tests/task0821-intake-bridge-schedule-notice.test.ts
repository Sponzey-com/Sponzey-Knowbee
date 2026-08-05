import { describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { runIntakeBridgePass as runIntakeBridgePassCore } from "../packages/core/src/runs/intake-bridge-pass.ts"
import { buildScheduleActionResultNotice } from "../packages/core/src/runs/schedule-action-notice.ts"
import type { TaskIntakeResult } from "../packages/core/src/agent/intake.ts"
import { createTestAgentRuntimeDependencies } from "./fixtures/agent-runtime.ts"

const intakeRuntime = createTestAgentRuntimeDependencies("/tmp/knowbee-task0821-intake-bridge")

function runIntakeBridgePass(
  params: Omit<Parameters<typeof runIntakeBridgePassCore>[0], "artifactStorage" | "config">,
  dependencies: Parameters<typeof runIntakeBridgePassCore>[1],
  moduleDependencies?: Parameters<typeof runIntakeBridgePassCore>[2],
) {
  return runIntakeBridgePassCore(
    {
      ...params,
      artifactStorage: intakeRuntime.artifactStorage,
      config: DEFAULT_CONFIG,
    },
    dependencies,
    moduleDependencies,
  )
}

function createBaseIntakeResult(): TaskIntakeResult {
  return {
    intent: { category: "schedule_request", summary: "반복 예약", confidence: 0.9 },
    user_message: { mode: "accepted_receipt", text: "요청을 접수했습니다." },
    action_items: [
      {
        id: "schedule-1",
        type: "create_schedule",
        title: "매 분 안녕",
        priority: "normal",
        reason: "사용자 예약 요청",
        payload: {
          title: "매 분 안녕",
          task: "안녕이라고 해줘",
          cron: "* * * * *",
        },
      },
    ],
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
      schedule_spec: {
        detected: true,
        kind: "recurring",
        status: "accepted",
        schedule_text: "매 분",
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
      needs_tools: false,
      needs_web: false,
    },
    scheduling: { detected: true, kind: "recurring", status: "accepted", schedule_text: "매 분" },
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

function createDependencies() {
  return {
    appendRunEvent: vi.fn(),
    updateRunSummary: vi.fn(),
    incrementDelegationTurnCount: vi.fn(),
    emitScheduleCreated: vi.fn(),
    emitScheduleCancelled: vi.fn(),
    scheduleDelayedRun: vi.fn(),
    startDelegatedRun: vi.fn(),
    normalizeTaskProfile: vi.fn((profile) => profile ?? "general_chat"),
    recordCanonicalIntakeDiagnosis: vi.fn(async () => ({ ok: true as const })),
    authorizeCanonicalIntakePlan: vi.fn(async () => ({ ok: true as const })),
    recordCanonicalExecutionStart: vi.fn(async () => ({ ok: true as const })),
    releaseCanonicalSimplePath: vi.fn(async () => ({ ok: true as const })),
    logInfo: vi.fn(),
  }
}

describe("task0821 intake bridge schedule notice propagation", () => {
  it("propagates schedule action result notice to complete directive", async () => {
    const dependencies = createDependencies()
    const notice = buildScheduleActionResultNotice({
      ok: true,
      actionCount: 1,
      successCount: 1,
      failureCount: 0,
    })
    const moduleDependencies = {
      analyzeTaskIntake: vi.fn().mockResolvedValue(createBaseIntakeResult()),
      resolveRunRoute: vi.fn(),
      executeScheduleActions: vi.fn().mockReturnValue({
        ok: true,
        message: "스케줄이 저장되었습니다.",
        messageTextSource: "runtime_deterministic",
        requiresFinalResponseRendering: true,
        notice,
        detail: "매 분: 안녕이라고 해줘",
        successCount: 1,
        failureCount: 0,
        receipts: [],
      }),
      createDefaultScheduleActionDependencies: vi.fn().mockReturnValue({}),
      inferDelegatedTaskProfile: vi.fn(),
      buildFollowupPrompt: vi.fn(),
    }

    const result = await runIntakeBridgePass(
      {
        message: "매 분 안녕이라고 해줘",
        originalRequest: "매 분 안녕이라고 해줘",
        sessionId: "session-0821",
        requestGroupId: "group-0821",
        model: "gpt-test",
        workDir: "/tmp",
        source: "telegram",
        runId: "run-0821",
        onChunk: undefined,
        reuseConversationContext: false,
      },
      dependencies,
      moduleDependencies,
    )

    expect(result).toEqual({
      kind: "complete",
      text: "스케줄이 저장되었습니다.",
      textSource: "runtime_deterministic",
      notice,
      eventLabel: "intake 처리 결과 전달",
    })
  })
})
