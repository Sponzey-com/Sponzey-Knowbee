import { describe, expect, it, vi } from "vitest"
import { applyExecutionChunkPass } from "../packages/core/src/runs/execution-chunk-pass.ts"

function createDependencies() {
  return {
    rememberRunFailure: vi.fn(),
    incrementDelegationTurnCount: vi.fn(),
    appendRunEvent: vi.fn(),
    updateRunSummary: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
  }
}

function createBaseParams() {
  return {
    runId: "run-1",
    sessionId: "session-1",
    source: "telegram" as const,
    preview: "",
    workDir: "/tmp",
    pendingToolParams: new Map<string, unknown>(),
    successfulTools: [],
    filesystemMutationPaths: new Set<string>(),
    failedCommandTools: [],
    commandFailureSeen: false,
    recoveryBudgetUsage: {
      interpretation: 0,
      execution: 0,
      delivery: 0,
      external: 0,
    },
    usedTurns: 0,
    maxDelegationTurns: 3,
  }
}

describe("execution chunk pass", () => {
  it("updates preview for text chunks", () => {
    const dependencies = createDependencies()

    const result = applyExecutionChunkPass({
      ...createBaseParams(),
      chunk: { type: "text", delta: "hello" },
    }, dependencies)

    expect(result).toEqual({
      handled: true,
      preview: "hello",
      previewSource: "llm_generated",
    })
    expect(dependencies.updateRunSummary).toHaveBeenCalledWith("run-1", "hello")
  })

  it("turns an agent terminal tool failure into a terminal stop before completion review", () => {
    const dependencies = createDependencies()

    const result = applyExecutionChunkPass({
      ...createBaseParams(),
      chunk: {
        type: "text",
        delta: "Yeonjang 화면 캡처 실패: capability advertisement is unavailable.",
        textSource: "runtime_deterministic",
        notice: {
          kind: "agent_terminal_failure",
          toolName: "screen_capture",
          failureTrust: "sanitized_tool_failure",
          reason: "SIDE_EFFECT_MANUAL_INTERVENTION",
          deliveryMode: "diagnostic",
          textSource: "agent_terminal_failure_notice",
          renderingRequired: "llm_final_response",
          finalAnswer: false,
          assistantIdentityClaim: false,
        },
      },
    }, dependencies)

    expect(result).toEqual({
      handled: true,
      preview: "Yeonjang 화면 캡처 실패: capability advertisement is unavailable.",
      previewSource: "runtime_deterministic",
      executionRecoveryLimitStop: {
        summary: "screen_capture 실행이 확인된 실패로 중단되었습니다.",
        reason: "SIDE_EFFECT_MANUAL_INTERVENTION",
        rawMessage: "Yeonjang 화면 캡처 실패: capability advertisement is unavailable.",
        remainingItems: ["screen_capture의 확인된 실패 원인을 해소해야 합니다."],
      },
      abortExecutionStream: true,
    })
  })

  it("returns execution recovery stop with abort flag", () => {
    const dependencies = createDependencies()

    const result = applyExecutionChunkPass({
      ...createBaseParams(),
      chunk: {
        type: "execution_recovery",
        toolNames: ["screencapture"],
        summary: "retry",
        reason: "missing permission",
      },
    }, dependencies, {
      applyToolStartChunk: vi.fn(),
      applyToolEndChunk: vi.fn(),
      applyExecutionRecoveryAttempt: vi.fn().mockReturnValue({
        kind: "stop",
        stop: {
          summary: "실행 복구를 자동으로 계속할 수 없습니다.",
          reason: "missing permission",
          remainingItems: ["manual action"],
        },
      }),
      applyExternalRecoveryAttempt: vi.fn(),
    })

    expect(result).toEqual({
      handled: true,
      executionRecoveryLimitStop: {
        summary: "실행 복구를 자동으로 계속할 수 없습니다.",
        reason: "missing permission",
        remainingItems: ["manual action"],
      },
      abortExecutionStream: true,
    })
  })

  it("applies tool end state updates", () => {
    const dependencies = createDependencies()

    const result = applyExecutionChunkPass({
      ...createBaseParams(),
      chunk: {
        type: "tool_end",
        toolName: "write_file",
        success: true,
        output: "ok",
      },
    }, dependencies, {
      applyToolStartChunk: vi.fn(),
      applyToolEndChunk: vi.fn().mockReturnValue({
        sawRealFilesystemMutation: true,
        commandFailureSeen: true,
        commandRecoveredWithinSamePass: false,
      }),
      applyExecutionRecoveryAttempt: vi.fn(),
      applyExternalRecoveryAttempt: vi.fn(),
    })

    expect(result).toEqual({
      handled: true,
      sawRealFilesystemMutation: true,
      commandFailureSeen: true,
      commandRecoveredWithinSamePass: false,
    })
  })

  it("turns a structural pre-dispatch failure into bounded recovery and aborts", () => {
    const dependencies = createDependencies()
    const pendingToolParams = new Map<string, unknown>([
      ["yeonjang_camera_capture", { extensionId: "model-variation" }],
    ])
    const applyToolEndChunk = vi.fn()
    const applyExecutionRecoveryAttempt = vi.fn().mockImplementation(
      (input: { payload: unknown }) => ({
        kind: "retry",
        payload: input.payload,
      }),
    )
    const fingerprint = `sha256:${"c".repeat(64)}`

    const result = applyExecutionChunkPass({
      ...createBaseParams(),
      pendingToolParams,
      chunk: {
        type: "tool_end",
        toolName: "yeonjang_camera_capture",
        success: false,
        output: "",
        details: {
          kind: "run_scoped_pre_dispatch_failure",
          reasonCode: "run_scoped_target_ambiguous",
          effectStarted: false,
          repairRequired: true,
          failureFingerprint: fingerprint,
        },
      },
    }, dependencies, {
      applyToolStartChunk: vi.fn(),
      applyToolEndChunk,
      applyExecutionRecoveryAttempt,
      applyExternalRecoveryAttempt: vi.fn(),
    })

    expect(result).toEqual({
      handled: true,
      executionRecovery: {
        summary: "실행 범위 검증 실패 후 다른 허용 전략을 검토합니다.",
        reason: "run_scoped_target_ambiguous",
        reasonCode: "run_scoped_target_ambiguous",
        toolNames: ["yeonjang_camera_capture"],
        evidenceRefs: [fingerprint],
      },
      abortExecutionStream: true,
    })
    expect(applyExecutionRecoveryAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          reasonCode: "run_scoped_target_ambiguous",
          evidenceRefs: [fingerprint],
        }),
      }),
      dependencies,
    )
    expect(applyToolEndChunk).not.toHaveBeenCalled()
    expect(pendingToolParams.has("yeonjang_camera_capture")).toBe(false)
  })

  it("returns ai recovery retry payload", () => {
    const dependencies = createDependencies()

    const result = applyExecutionChunkPass({
      ...createBaseParams(),
      chunk: {
        type: "ai_recovery",
        summary: "AI 오류를 분석하고 다른 방법으로 재시도합니다.",
        reason: "403 blocked",
        message: "forbidden",
        providerFailureReasonCode: "provider_contract_rejected",
      },
    }, dependencies, {
      applyToolStartChunk: vi.fn(),
      applyToolEndChunk: vi.fn(),
      applyExecutionRecoveryAttempt: vi.fn(),
      applyExternalRecoveryAttempt: vi.fn().mockReturnValue({
        kind: "retry",
        payload: {
          summary: "AI 오류를 분석하고 다른 방법으로 재시도합니다.",
          reason: "403 blocked",
          message: "forbidden",
          providerFailureReasonCode: "provider_contract_rejected",
        },
      }),
    })

    expect(result).toEqual({
      handled: true,
      aiRecovery: {
        summary: "AI 오류를 분석하고 다른 방법으로 재시도합니다.",
        reason: "403 blocked",
        message: "forbidden",
        providerFailureReasonCode: "provider_contract_rejected",
      },
    })
  })
})
