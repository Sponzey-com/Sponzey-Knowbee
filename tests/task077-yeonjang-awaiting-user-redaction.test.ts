import { describe, expect, it, vi } from "vitest"
import { applyCompletionApplicationPass } from "../packages/core/src/runs/completion-application-pass.ts"

function createFinalizationDependencies() {
  return {
    appendRunEvent: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
    rememberRunSuccess: vi.fn(),
    rememberRunFailure: vi.fn(),
  }
}

function createRetryDependencies() {
  return {
    rememberRunFailure: vi.fn(),
    incrementDelegationTurnCount: vi.fn(),
    appendRunEvent: vi.fn(),
    updateRunSummary: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
  }
}

describe("task077 Yeonjang ask-user redaction", () => {
  it("does not pass internal Yeonjang validation evidence to user-facing awaiting_user text", async () => {
    const applyTerminalApplication = vi.fn().mockResolvedValue("awaiting_user")

    await applyCompletionApplicationPass({
      runId: "run-077",
      sessionId: "session-077",
      source: "telegram",
      onChunk: undefined,
      preview: "",
      state: {
        executionSatisfied: false,
        deliveryRequired: false,
        deliverySatisfied: false,
        completionSatisfied: false,
        interpretationStatus: "user_input_required",
        executionStatus: "missing",
        deliveryStatus: "not_required",
        recoveryStatus: "required",
        blockingReasons: ["completion review가 사용자 추가 입력을 요구합니다."],
        conflictReason: "completion review가 사용자 추가 입력을 요구합니다.",
      },
      application: {
        kind: "awaiting_user",
        summary:
          "yeonjang-goal-validation:mouse_click:candidate_not_validated:result_diagnosis_not_sufficient",
        reason: "operationId=operation:run-077 receipt payload raw observed state",
        userMessage:
          "yeonjang-goal-validation:mouse_click:candidate_not_validated:result_diagnosis_not_sufficient 확인 필요",
        remainingItems: [
          "DB row와 structured diagnosis payload를 확인",
          "사용자에게 버튼 클릭 후 화면 상태를 확인 요청",
        ],
      },
      responseContext: {
        originalRequest: "버튼을 눌러줘",
        model: "gpt-test",
        providerId: "openai",
        workDir: "/tmp/project",
      },
      maxTurns: 3,
      recoveryBudgetUsage: {
        interpretation: 0,
        execution: 0,
        delivery: 0,
        external: 0,
      },
      finalizationDependencies: createFinalizationDependencies(),
    }, createRetryDependencies(), {
      decideCompletionTerminalOutcome: vi.fn(),
      markRunCompleted: vi.fn(),
      applyTerminalApplication,
      applyRecoveryRetryState: vi.fn(),
    })

    const application = applyTerminalApplication.mock.calls[0]?.[0]?.application
    expect(application).toMatchObject({
      kind: "awaiting_user",
      summary: "연장 작업 결과 확인이 더 필요합니다.",
      reason: "연장 작업 결과 확인이 더 필요합니다.",
      userMessage: "작업 결과를 확인하기 위해 추가 확인이 필요합니다.",
    })
    const rendered = JSON.stringify(application)
    expect(rendered).not.toContain("yeonjang-goal-validation")
    expect(rendered).not.toContain("operationId")
    expect(rendered).not.toContain("operation:run-077")
    expect(rendered).not.toContain("receipt payload")
    expect(rendered).not.toContain("raw observed state")
    expect(rendered).not.toContain("DB row")
    expect(rendered).not.toContain("structured diagnosis payload")
  })
})
