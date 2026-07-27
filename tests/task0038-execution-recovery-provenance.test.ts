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
    runId: "run-execution-recovery-provenance",
    sessionId: "session-execution-recovery-provenance",
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

describe("task0038 execution recovery provenance", () => {
  it("records internal control events for execution recovery retry", () => {
    const dependencies = createDependencies()

    const result = applyExecutionChunkPass({
      ...createBaseParams(),
      chunk: {
        type: "execution_recovery",
        toolNames: ["screen_capture"],
        summary: "화면 캡처 실패 원인을 분석하고 다시 시도합니다.",
        reason: "권한이 필요합니다.",
      },
    }, dependencies, {
      applyToolStartChunk: vi.fn(),
      applyToolEndChunk: vi.fn(),
      applyExecutionRecoveryAttempt: vi.fn().mockReturnValue({
        kind: "retry",
        payload: {
          toolNames: ["screen_capture"],
          summary: "화면 캡처 실패 원인을 분석하고 다시 시도합니다.",
          reason: "권한이 필요합니다.",
        },
      }),
      applyExternalRecoveryAttempt: vi.fn(),
    })

    expect(result).toEqual({
      handled: true,
      executionRecovery: {
        toolNames: ["screen_capture"],
        summary: "화면 캡처 실패 원인을 분석하고 다시 시도합니다.",
        reason: "권한이 필요합니다.",
      },
    })
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-execution-recovery-provenance",
      "internal_recovery_execution_payload_source:runtime_deterministic",
    )
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-execution-recovery-provenance",
      "internal_recovery_execution_payload_delivery:control_flow_only",
    )
    expect(JSON.stringify(dependencies.appendRunEvent.mock.calls)).not.toContain(
      "user_facing_execution_recovery_rewrite_skipped",
    )
  })

  it("keeps stop handling while recording internal execution recovery provenance", () => {
    const dependencies = createDependencies()

    const result = applyExecutionChunkPass({
      ...createBaseParams(),
      chunk: {
        type: "execution_recovery",
        toolNames: ["shell_exec"],
        summary: "명령 실행 실패 원인을 분석합니다.",
        reason: "실행 대상 명령을 찾지 못했습니다.",
      },
    }, dependencies, {
      applyToolStartChunk: vi.fn(),
      applyToolEndChunk: vi.fn(),
      applyExecutionRecoveryAttempt: vi.fn().mockReturnValue({
        kind: "stop",
        stop: {
          summary: "실행 복구를 자동으로 계속할 수 없습니다.",
          reason: "실행 대상 명령을 찾지 못했습니다.",
          remainingItems: ["사용 가능한 명령을 확인해야 합니다."],
        },
      }),
      applyExternalRecoveryAttempt: vi.fn(),
    })

    expect(result).toEqual({
      handled: true,
      executionRecoveryLimitStop: {
        summary: "실행 복구를 자동으로 계속할 수 없습니다.",
        reason: "실행 대상 명령을 찾지 못했습니다.",
        remainingItems: ["사용 가능한 명령을 확인해야 합니다."],
      },
      abortExecutionStream: true,
    })
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-execution-recovery-provenance",
      "internal_recovery_execution_payload_source:runtime_deterministic",
    )
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-execution-recovery-provenance",
      "internal_recovery_execution_payload_delivery:control_flow_only",
    )
    expect(JSON.stringify(dependencies.appendRunEvent.mock.calls)).not.toContain(
      "user_facing_execution_recovery_rewrite_skipped",
    )
  })
})
