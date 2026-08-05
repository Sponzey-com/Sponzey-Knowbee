import { describe, expect, it, vi } from "vitest"
import { LLM_INTAKE_RESULT_NOTE } from "../packages/core/src/agent/intake.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import {
  resolveIntakeDirectReceiptCompletion,
  runIntakeBridgePass as runIntakeBridgePassCore,
} from "../packages/core/src/runs/intake-bridge-pass.ts"
import { createTestAgentRuntimeDependencies } from "./fixtures/agent-runtime.ts"

const intakeRuntime = createTestAgentRuntimeDependencies("/tmp/knowbee-task0025-intake-bridge")

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

function createDependencies() {
  return {
    appendRunEvent: vi.fn(),
    updateRunSummary: vi.fn(),
    incrementDelegationTurnCount: vi.fn(),
    emitScheduleCreated: vi.fn(),
    emitScheduleCancelled: vi.fn(),
    scheduleDelayedRun: vi.fn(),
    startDelegatedRun: vi.fn(),
    normalizeTaskProfile: vi.fn((taskProfile) => taskProfile ?? "general_chat"),
    recordCanonicalIntakeDiagnosis: vi.fn(async () => ({ ok: true as const })),
    authorizeCanonicalIntakePlan: vi.fn(async () => ({ ok: true as const })),
    recordCanonicalExecutionStart: vi.fn(async () => ({ ok: true as const })),
    releaseCanonicalSimplePath: vi.fn(async () => ({ ok: true as const })),
    logInfo: vi.fn(),
  }
}

function createClarificationIntake(notes: string[]) {
  return {
    intent: {
      category: "clarification" as const,
      summary: "날짜 확인 필요",
      confidence: 0.7,
    },
    user_message: {
      mode: "clarification_receipt" as const,
      text: "언제 실행할지 알려주세요.",
    },
    action_items: [],
    structured_request: {
      source_language: "ko" as const,
      normalized_english: "Schedule a task.",
      target: "schedule task",
      to: "telegram chat 1, main thread",
      context: ["missing time"],
      complete_condition: ["ask user for missing time"],
    },
    intent_envelope: {
      intent_type: "clarification" as const,
      source_language: "ko" as const,
      normalized_english: "Schedule a task.",
      target: "schedule task",
      destination: "telegram chat 1, main thread",
      context: ["missing time"],
      complete_condition: ["ask user for missing time"],
      schedule_spec: {
        detected: false,
        kind: "none" as const,
        status: "not_applicable" as const,
        schedule_text: "",
      },
      execution_semantics: {
        filesystemEffect: "none" as const,
        privilegedOperation: "none" as const,
        artifactDelivery: "none" as const,
        approvalRequired: false,
        approvalTool: "external_action" as const,
      },
      delivery_mode: "none" as const,
      requires_approval: false,
      approval_tool: "external_action" as const,
      preferred_target: "auto",
      needs_tools: false,
      needs_web: false,
    },
    scheduling: {
      detected: false,
      kind: "none" as const,
      status: "not_applicable" as const,
      schedule_text: "",
    },
    execution: {
      requires_run: false,
      requires_delegation: false,
      suggested_target: "auto",
      max_delegation_turns: 3,
      needs_tools: false,
      needs_web: false,
      execution_semantics: {
        filesystemEffect: "none" as const,
        privilegedOperation: "none" as const,
        artifactDelivery: "none" as const,
        approvalRequired: false,
        approvalTool: "external_action" as const,
      },
    },
    notes,
  }
}

function createFailedIntake(notes: string[]) {
  return {
    ...createClarificationIntake(notes),
    intent: {
      category: "general_chat" as const,
      summary: "처리 불가",
      confidence: 0.6,
    },
    user_message: {
      mode: "failed_receipt" as const,
      text: "현재 정보로는 요청을 처리할 수 없습니다.",
    },
  }
}

describe("task0025 intake bridge direct receipt gate", () => {
  it("routes an LLM-generated clarification receipt to awaiting user", () => {
    expect(
      resolveIntakeDirectReceiptCompletion({
        user_message: {
          mode: "clarification_receipt",
          text: "언제 실행할지 알려주세요.",
        },
        notes: [LLM_INTAKE_RESULT_NOTE],
      }),
    ).toEqual({
      kind: "awaiting_user",
      preview: "",
      summary: "추가 입력이 필요합니다.",
      userMessage: "언제 실행할지 알려주세요.",
      userMessageSource: "llm_generated",
      eventLabel: "intake 확인 질문 대기",
    })
  })

  it("routes a deterministic clarification receipt to awaiting user", () => {
    expect(
      resolveIntakeDirectReceiptCompletion({
        user_message: {
          mode: "clarification_receipt",
          text: "언제 실행할지 알려주세요.",
        },
        notes: ["relative-delay-heuristic"],
      }),
    ).toEqual({
      kind: "awaiting_user",
      preview: "",
      summary: "추가 입력이 필요합니다.",
      userMessage: "언제 실행할지 알려주세요.",
      userMessageSource: "runtime_deterministic",
      eventLabel: "intake 런타임 확인 질문 대기",
    })
  })

  it("does not treat accepted receipts as direct clarification or failure replies", () => {
    expect(
      resolveIntakeDirectReceiptCompletion({
        user_message: {
          mode: "accepted_receipt",
          text: "요청을 접수했습니다.",
        },
        notes: [LLM_INTAKE_RESULT_NOTE],
      }),
    ).toBeNull()
  })

  it("routes an LLM-generated failed receipt to stop", () => {
    expect(
      resolveIntakeDirectReceiptCompletion({
        user_message: {
          mode: "failed_receipt",
          text: "현재 정보로는 요청을 처리할 수 없습니다.",
        },
        notes: [LLM_INTAKE_RESULT_NOTE],
      }),
    ).toEqual({
      kind: "stop",
      preview: "",
      summary: "요청을 처리할 수 없습니다.",
      userMessage: "현재 정보로는 요청을 처리할 수 없습니다.",
      userMessageSource: "llm_generated",
      eventLabel: "intake 실패 응답 종료",
    })
  })

  it("routes a deterministic failed receipt to stop", () => {
    expect(
      resolveIntakeDirectReceiptCompletion({
        user_message: {
          mode: "failed_receipt",
          text: "현재 정보로는 요청을 처리할 수 없습니다.",
        },
        notes: ["intake-guard"],
      }),
    ).toEqual({
      kind: "stop",
      preview: "",
      summary: "요청을 처리할 수 없습니다.",
      userMessage: "현재 정보로는 요청을 처리할 수 없습니다.",
      userMessageSource: "runtime_deterministic",
      eventLabel: "intake 런타임 실패 응답 종료",
    })
  })

  it("returns awaiting_user from the bridge pass for deterministic clarification receipts", async () => {
    const dependencies = createDependencies()
    const moduleDependencies = {
      analyzeTaskIntake: vi
        .fn()
        .mockResolvedValue(createClarificationIntake(["relative-delay-heuristic"])),
      resolveRunRoute: vi.fn(),
      executeScheduleActions: vi.fn(),
      createDefaultScheduleActionDependencies: vi.fn(),
      inferDelegatedTaskProfile: vi.fn(),
      buildFollowupPrompt: vi.fn(),
    }

    const result = await runIntakeBridgePass(
      {
        message: "내일 알려줘",
        originalRequest: "내일 알려줘",
        sessionId: "session-1",
        requestGroupId: "group-1",
        model: "gpt-test",
        workDir: "/tmp",
        source: "telegram",
        runId: "run-1",
        onChunk: undefined,
        reuseConversationContext: false,
      },
      dependencies,
      moduleDependencies,
    )

    expect(result).toEqual({
      kind: "awaiting_user",
      preview: "",
      summary: "추가 입력이 필요합니다.",
      userMessage: "언제 실행할지 알려주세요.",
      userMessageSource: "runtime_deterministic",
      eventLabel: "intake 런타임 확인 질문 대기",
    })
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith("run-1", "Intake: clarification")
    expect(dependencies.updateRunSummary).toHaveBeenCalledWith("run-1", "날짜 확인 필요")
  })

  it("returns stop from the bridge pass for deterministic failed receipts", async () => {
    const dependencies = createDependencies()
    const moduleDependencies = {
      analyzeTaskIntake: vi.fn().mockResolvedValue(createFailedIntake(["intake-guard"])),
      resolveRunRoute: vi.fn(),
      executeScheduleActions: vi.fn(),
      createDefaultScheduleActionDependencies: vi.fn(),
      inferDelegatedTaskProfile: vi.fn(),
      buildFollowupPrompt: vi.fn(),
    }

    const result = await runIntakeBridgePass(
      {
        message: "이 요청은 처리하지 마",
        originalRequest: "이 요청은 처리하지 마",
        sessionId: "session-2",
        requestGroupId: "group-2",
        model: "gpt-test",
        workDir: "/tmp",
        source: "telegram",
        runId: "run-2",
        onChunk: undefined,
        reuseConversationContext: false,
      },
      dependencies,
      moduleDependencies,
    )

    expect(result).toEqual({
      kind: "stop",
      preview: "",
      summary: "요청을 처리할 수 없습니다.",
      userMessage: "현재 정보로는 요청을 처리할 수 없습니다.",
      userMessageSource: "runtime_deterministic",
      eventLabel: "intake 런타임 실패 응답 종료",
    })
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith("run-2", "Intake: general_chat")
    expect(dependencies.updateRunSummary).toHaveBeenCalledWith("run-2", "처리 불가")
  })
})
