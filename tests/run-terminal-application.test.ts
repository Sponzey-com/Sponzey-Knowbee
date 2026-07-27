import { describe, expect, it, vi } from "vitest"
import { applyTerminalApplication } from "../packages/core/src/runs/terminal-application.ts"

function createFinalizationDependencies() {
  return {
    appendRunEvent: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
    rememberRunSuccess: vi.fn(),
    rememberRunFailure: vi.fn(),
  }
}

describe("run terminal application", () => {
  const responseContext = {
    originalRequest: "원본 요청",
    model: "gpt-test",
    providerId: "openai",
    workDir: "/tmp/project",
  }

  it("delegates awaiting_user application to finalization helper", async () => {
    const moveRunToAwaitingUser = vi.fn(async () => {})
    const moveRunToCancelledAfterStop = vi.fn(async () => {})

    const result = await applyTerminalApplication({
      runId: "run-1",
      sessionId: "session-1",
      source: "telegram",
      onChunk: undefined,
      application: {
        kind: "awaiting_user",
        preview: "현재까지 결과",
        summary: "추가 입력이 필요합니다.",
        reason: "대상이 모호합니다.",
        userMessage: "어느 파일을 바꿀지 알려 주세요.",
        remainingItems: ["파일명 지정"],
      },
      dependencies: createFinalizationDependencies(),
    }, {
      moveRunToAwaitingUser,
      moveRunToCancelledAfterStop,
    })

    expect(result).toBe("awaiting_user")
    expect(moveRunToAwaitingUser).toHaveBeenCalledTimes(1)
    expect(moveRunToAwaitingUser).toHaveBeenCalledWith({
      runId: "run-1",
      sessionId: "session-1",
      source: "telegram",
      onChunk: undefined,
      awaitingUser: {
        preview: "현재까지 결과",
        summary: "추가 입력이 필요합니다.",
        reason: "대상이 모호합니다.",
        userMessage: "어느 파일을 바꿀지 알려 주세요.",
        remainingItems: ["파일명 지정"],
      },
      textSource: "runtime_deterministic",
      dependencies: expect.any(Object),
    })
    expect(moveRunToCancelledAfterStop).not.toHaveBeenCalled()
  })

  it("delegates stop application to finalization helper", async () => {
    const moveRunToAwaitingUser = vi.fn(async () => {})
    const moveRunToCancelledAfterStop = vi.fn(async () => {})

    const result = await applyTerminalApplication({
      runId: "run-2",
      sessionId: "session-2",
      source: "webui",
      onChunk: undefined,
      application: {
        kind: "stop",
        preview: "중간 결과",
        summary: "자동 진행을 중단합니다.",
        reason: "복구 예산 소진",
        rawMessage: "claude exited with code 1",
        remainingItems: ["다른 대안 검토"],
      },
      dependencies: createFinalizationDependencies(),
    }, {
      moveRunToAwaitingUser,
      moveRunToCancelledAfterStop,
    })

    expect(result).toBe("cancelled")
    expect(moveRunToCancelledAfterStop).toHaveBeenCalledTimes(1)
    expect(moveRunToCancelledAfterStop).toHaveBeenCalledWith({
      runId: "run-2",
      sessionId: "session-2",
      source: "webui",
      onChunk: undefined,
      cancellation: {
        preview: "중간 결과",
        summary: "자동 진행을 중단합니다.",
        reason: "복구 예산 소진",
        rawMessage: "claude exited with code 1",
        remainingItems: ["다른 대안 검토"],
      },
      textSource: "runtime_deterministic",
      dependencies: expect.any(Object),
    })
    expect(moveRunToAwaitingUser).not.toHaveBeenCalled()
  })

  it("passes canonical exhausted report evidence to the stop finalizer", async () => {
    const moveRunToAwaitingUser = vi.fn(async () => {})
    const moveRunToCancelledAfterStop = vi.fn(async () => {})
    const terminalReport = {
      schemaVersion: 1 as const,
      goalId: "goal:run-exhausted",
      workId: "work:run-exhausted",
      outcome: "blocked" as const,
      primaryLanguage: "ko" as const,
      completedScope: [],
      unresolvedScope: ["사용자 요청"],
      reasonCode: "solution_paths_exhausted",
      verifiedReasonFacts: ["허용된 실행 경로가 소진되었습니다."],
      evidenceRefs: [`tool-result:tool:${"d".repeat(64)}`],
      nextActions: [{ kind: "required_condition" as const, text: "사용 가능한 기능이 추가되면 다시 요청하세요." }],
    }

    const result = await applyTerminalApplication({
      runId: "run-exhausted",
      sessionId: "session-exhausted",
      source: "webui",
      onChunk: undefined,
      application: {
        kind: "stop",
        preview: "요청한 기능을 실행할 수 없습니다.",
        summary: "허용된 다른 실행 경로가 없습니다.",
      },
      canonicalFinalOutcome: "exhausted",
      terminalReport,
      recordCanonicalDelivery: vi.fn(async () => ({ ok: true as const })),
      dependencies: createFinalizationDependencies(),
    }, {
      moveRunToAwaitingUser,
      moveRunToCancelledAfterStop,
    })

    expect(result).toBe("failed")
    expect(moveRunToCancelledAfterStop).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalFinalOutcome: "exhausted",
        terminalReport,
      }),
    )
  })

  it("passes explicit terminal message sources to finalization helpers", async () => {
    const moveRunToAwaitingUser = vi.fn(async () => {})
    const moveRunToCancelledAfterStop = vi.fn(async () => {})

    await applyTerminalApplication({
      runId: "run-source-awaiting",
      sessionId: "session-source-awaiting",
      source: "telegram",
      onChunk: undefined,
      application: {
        kind: "awaiting_user",
        preview: "",
        summary: "추가 입력이 필요합니다.",
        userMessage: "어느 파일을 바꿀까요?",
        userMessageSource: "llm_generated",
      },
      responseContext,
      dependencies: createFinalizationDependencies(),
    }, {
      moveRunToAwaitingUser,
      moveRunToCancelledAfterStop,
    })

    await applyTerminalApplication({
      runId: "run-source-stop",
      sessionId: "session-source-stop",
      source: "webui",
      onChunk: undefined,
      application: {
        kind: "stop",
        preview: "",
        summary: "자동 진행을 중단합니다.",
        reason: "안전한 대안 없음",
        userMessageSource: "runtime_deterministic",
      },
      dependencies: createFinalizationDependencies(),
    }, {
      moveRunToAwaitingUser,
      moveRunToCancelledAfterStop,
    })

    expect(moveRunToAwaitingUser).toHaveBeenCalledWith(expect.objectContaining({
      runId: "run-source-awaiting",
      textSource: "llm_generated",
      responseContext,
    }))
    expect(moveRunToCancelledAfterStop).toHaveBeenCalledWith(expect.objectContaining({
      runId: "run-source-stop",
      textSource: "runtime_deterministic",
    }))
  })
})
