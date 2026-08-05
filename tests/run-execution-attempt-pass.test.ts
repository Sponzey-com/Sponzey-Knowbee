import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import { runExecutionAttemptPass } from "../packages/core/src/runs/execution-attempt-pass.ts"

async function* toAsyncGenerator<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item
  }
}

function createDependencies() {
  return {
    rememberRunFailure: vi.fn(),
    incrementDelegationTurnCount: vi.fn(),
    appendRunEvent: vi.fn(),
    updateRunSummary: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
    markAbortedRunCancelledIfActive: vi.fn(),
  }
}

function createParams() {
  return {
    runId: "run-1",
    sessionId: "session-1",
    source: "telegram" as const,
    onChunk: undefined,
    onDeliveryError: vi.fn(),
    currentMessage: "do work",
    memorySearchQuery: "do work",
    workDir: "/tmp",
    signal: new AbortController().signal,
    isRootRequest: true,
    requestGroupId: "group-1",
    contextMode: "full" as const,
    preview: "",
    activeWorkerRuntime: {
      kind: "internal_ai" as const,
      targetId: "worker:internal_ai",
      label: "코드 작업 보조 세션",
      command: "disabled",
    },
    workerSessionId: "worker-1",
    pendingToolParams: new Map<string, unknown>(),
    successfulTools: [],
    filesystemMutationPaths: new Set<string>(),
    failedCommandTools: [],
    successfulFileDeliveries: [],
    successfulTextDeliveries: [],
    commandFailureSeen: false,
    recoveryBudgetUsage: {
      interpretation: 0,
      execution: 0,
      delivery: 0,
      external: 0,
    },
    defaultMaxDelegationTurns: 3,
    executionRecoveryLimitStop: null,
    stopAfterDirectArtifactDeliverySuccess: false,
    abortExecutionStream: vi.fn(),
  }
}

describe("run execution attempt pass", () => {
  it("does not read global config for delegation turn fallback", () => {
    const source = readFileSync("packages/core/src/runs/execution-attempt-pass.ts", "utf-8")

    expect(source).not.toContain("getConfig(")
    expect(source).toContain("defaultMaxDelegationTurns: number")
    expect(source).toContain("params.defaultMaxDelegationTurns")
  })

  it("defers reviewed root chunk stream until canonical verification", async () => {
    const dependencies = createDependencies()
    const moduleDependencies = {
      createExecutionChunkStream: vi.fn(() => toAsyncGenerator([
        { type: "text", delta: "hello", textSource: "llm_reviewed" as const },
        { type: "done", totalTokens: 1 },
      ])),
      applyExecutionChunkPass: vi.fn(() => ({
        handled: true,
        preview: "hello",
        previewSource: "llm_reviewed" as const,
      })),
      applyErrorChunkPass: vi.fn(),
      deliverTrackedChunk: vi.fn().mockResolvedValue(undefined),
      getRootRun: vi.fn(() => ({
        delegationTurnCount: 1,
        maxDelegationTurns: 3,
      })),
    }

    const result = await runExecutionAttemptPass(createParams(), dependencies, moduleDependencies)

    expect(result.preview).toBe("hello")
    expect(result.failed).toBe(false)
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith("run-1", "worker-1 실행 시작")
    expect(dependencies.updateRunSummary).toHaveBeenCalledWith("run-1", "코드 작업 보조 세션에서 작업을 실행 중입니다.")
    expect(result.deferredPreviewDelivery).toBe(true)
    expect(moduleDependencies.deliverTrackedChunk).not.toHaveBeenCalled()
  })

  it("defers LLM-generated text chunks until final response review", async () => {
    const dependencies = createDependencies()
    const moduleDependencies = {
      createExecutionChunkStream: vi.fn(() => toAsyncGenerator([
        { type: "text", delta: "모델이 생성한 원문입니다.", textSource: "llm_generated" as const },
        { type: "done", totalTokens: 1 },
      ])),
      applyExecutionChunkPass: vi.fn(() => ({
        handled: true,
        preview: "모델이 생성한 원문입니다.",
        previewSource: "llm_generated" as const,
      })),
      applyErrorChunkPass: vi.fn(),
      deliverTrackedChunk: vi.fn().mockResolvedValue(undefined),
      getRootRun: vi.fn(() => ({
        delegationTurnCount: 1,
        maxDelegationTurns: 3,
      })),
    }

    const result = await runExecutionAttemptPass(createParams(), dependencies, moduleDependencies)

    expect(result.preview).toBe("모델이 생성한 원문입니다.")
    expect(result.previewSource).toBe("llm_generated")
    expect(result.deferredPreviewDelivery).toBe(true)
    expect(moduleDependencies.deliverTrackedChunk).not.toHaveBeenCalled()
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-1",
      "user_facing_stream_text_delivery_deferred:llm_generated",
    )
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-1",
      "user_facing_stream_done_delivery_deferred",
    )
  })

  it("treats text chunks without an explicit source as LLM-generated and defers delivery", async () => {
    const dependencies = createDependencies()
    const moduleDependencies = {
      createExecutionChunkStream: vi.fn(() => toAsyncGenerator([
        { type: "text", delta: "출처가 없는 모델 원문입니다." },
        { type: "done", totalTokens: 1 },
      ])),
      applyExecutionChunkPass: vi.fn(() => ({
        handled: true,
        preview: "출처가 없는 모델 원문입니다.",
        previewSource: "llm_generated" as const,
      })),
      applyErrorChunkPass: vi.fn(),
      deliverTrackedChunk: vi.fn().mockResolvedValue(undefined),
      getRootRun: vi.fn(() => ({
        delegationTurnCount: 1,
        maxDelegationTurns: 3,
      })),
    }

    const result = await runExecutionAttemptPass(createParams(), dependencies, moduleDependencies)

    expect(result.preview).toBe("출처가 없는 모델 원문입니다.")
    expect(result.previewSource).toBe("llm_generated")
    expect(result.deferredPreviewDelivery).toBe(true)
    expect(moduleDependencies.deliverTrackedChunk).not.toHaveBeenCalled()
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-1",
      "user_facing_stream_text_delivery_deferred:llm_generated",
    )
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-1",
      "user_facing_stream_done_delivery_deferred",
    )
  })

  it("defers runtime deterministic text chunks and raw done delivery", async () => {
    const dependencies = createDependencies()
    const moduleDependencies = {
      createExecutionChunkStream: vi.fn(() => toAsyncGenerator([
        { type: "text", delta: "인증 또는 접근 차단 문제로 요청이 실패했습니다.", textSource: "runtime_deterministic" as const },
        { type: "done", totalTokens: 1 },
      ])),
      applyExecutionChunkPass: vi.fn(() => ({
        handled: true,
        preview: "인증 또는 접근 차단 문제로 요청이 실패했습니다.",
        previewSource: "runtime_deterministic" as const,
      })),
      applyErrorChunkPass: vi.fn(),
      deliverTrackedChunk: vi.fn().mockResolvedValue(undefined),
      getRootRun: vi.fn(() => ({
        delegationTurnCount: 1,
        maxDelegationTurns: 3,
      })),
    }

    const result = await runExecutionAttemptPass(createParams(), dependencies, moduleDependencies)

    expect(result.preview).toBe("인증 또는 접근 차단 문제로 요청이 실패했습니다.")
    expect(result.previewSource).toBe("runtime_deterministic")
    expect(result.deferredPreviewDelivery).toBe(true)
    expect(moduleDependencies.deliverTrackedChunk).not.toHaveBeenCalled()
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-1",
      "user_facing_stream_text_delivery_deferred:runtime_deterministic",
    )
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-1",
      "user_facing_stream_done_delivery_deferred",
    )
  })

  it("delegates error chunks and returns worker runtime recovery", async () => {
    const dependencies = createDependencies()
    const moduleDependencies = {
      createExecutionChunkStream: vi.fn(() => toAsyncGenerator([
        { type: "error", message: "boom" },
      ])),
      applyExecutionChunkPass: vi.fn(),
      applyErrorChunkPass: vi.fn().mockResolvedValue({
        failed: false,
        workerRuntimeRecovery: {
          summary: "retry runtime",
          reason: "boom",
          message: "boom",
        },
      }),
      deliverTrackedChunk: vi.fn(),
      getRootRun: vi.fn(() => ({
        delegationTurnCount: 0,
        maxDelegationTurns: 3,
      })),
    }

    const result = await runExecutionAttemptPass(createParams(), dependencies, moduleDependencies)

    expect(moduleDependencies.applyErrorChunkPass).toHaveBeenCalled()
    expect(result.workerRuntimeRecovery).toEqual({
      summary: "retry runtime",
      reason: "boom",
      message: "boom",
    })
    expect(result.failed).toBe(false)
  })

  it("aborts execution stream when execution chunk requests stop", async () => {
    const dependencies = createDependencies()
    const params = createParams()
    const moduleDependencies = {
      createExecutionChunkStream: vi.fn(() => toAsyncGenerator([
        { type: "execution_recovery", toolNames: ["tool"], summary: "retry", reason: "limit" },
      ])),
      applyExecutionChunkPass: vi.fn(() => ({
        handled: true,
        executionRecoveryLimitStop: {
          summary: "cannot continue safely",
          reason: "reason",
          remainingItems: ["item"],
        },
        abortExecutionStream: true,
      })),
      applyErrorChunkPass: vi.fn(),
      deliverTrackedChunk: vi.fn().mockResolvedValue(undefined),
      getRootRun: vi.fn(() => ({
        delegationTurnCount: 1,
        maxDelegationTurns: 3,
      })),
    }

    const result = await runExecutionAttemptPass(params, dependencies, moduleDependencies)

    expect(params.abortExecutionStream).toHaveBeenCalled()
    expect(result.executionRecoveryLimitStop).toEqual({
      summary: "cannot continue safely",
      reason: "reason",
      remainingItems: ["item"],
    })
  })

  it("does not consume cosmetic Tool variations after a structural abort", async () => {
    const dependencies = createDependencies()
    const params = createParams()
    const moduleDependencies = {
      createExecutionChunkStream: vi.fn(() => toAsyncGenerator([
        {
          type: "tool_end",
          toolName: "yeonjang_camera_capture",
          success: false,
          output: "",
        },
        {
          type: "tool_end",
          toolName: "yeonjang_camera_capture",
          success: false,
          output: "cosmetic variation",
        },
      ])),
      applyExecutionChunkPass: vi.fn(() => ({
        handled: true,
        executionRecovery: {
          summary: "scope failure",
          reason: "run_scoped_target_ambiguous",
          reasonCode: "run_scoped_target_ambiguous",
          toolNames: ["yeonjang_camera_capture"],
          evidenceRefs: [`sha256:${"c".repeat(64)}`],
        },
        abortExecutionStream: true,
      })),
      applyErrorChunkPass: vi.fn(),
      deliverTrackedChunk: vi.fn().mockResolvedValue(undefined),
      getRootRun: vi.fn(() => ({
        delegationTurnCount: 1,
        maxDelegationTurns: 3,
      })),
    }

    const result = await runExecutionAttemptPass(
      params,
      dependencies,
      moduleDependencies,
    )

    expect(result.executionRecovery).toMatchObject({
      reasonCode: "run_scoped_target_ambiguous",
    })
    expect(moduleDependencies.applyExecutionChunkPass).toHaveBeenCalledTimes(1)
    expect(params.abortExecutionStream).toHaveBeenCalledTimes(1)
  })

  it("stops consuming further chunks after direct artifact delivery succeeds", async () => {
    const dependencies = createDependencies()
    const params = createParams()
    params.stopAfterDirectArtifactDeliverySuccess = true
    const moduleDependencies = {
      createExecutionChunkStream: vi.fn(() => toAsyncGenerator([
        {
          type: "tool_end",
          toolName: "telegram_send_file",
          success: true,
          output: "sent",
          details: {
            kind: "artifact_delivery",
            channel: "telegram",
            filePath: "/tmp/result.png",
          },
        },
        { type: "text", delta: "this should not be emitted" },
        { type: "done", totalTokens: 1 },
      ])),
      applyExecutionChunkPass: vi.fn(() => ({ handled: true })),
      applyErrorChunkPass: vi.fn(),
      deliverTrackedChunk: vi.fn().mockResolvedValue({
        artifactDeliveries: [{
          toolName: "telegram_send_file",
          channel: "telegram",
          filePath: "/tmp/result.png",
        }],
      }),
      getRootRun: vi.fn(() => ({
        delegationTurnCount: 0,
        maxDelegationTurns: 3,
      })),
    }

    const result = await runExecutionAttemptPass(params, dependencies, moduleDependencies)

    expect(result.failed).toBe(false)
    expect(moduleDependencies.applyExecutionChunkPass).toHaveBeenCalledTimes(1)
    expect(moduleDependencies.deliverTrackedChunk).toHaveBeenCalledTimes(1)
    expect(params.abortExecutionStream).toHaveBeenCalledTimes(1)
  })
})
