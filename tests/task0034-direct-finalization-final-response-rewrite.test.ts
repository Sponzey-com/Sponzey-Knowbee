import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { completeRunWithAssistantMessage } from "../packages/core/src/runs/finalization.ts"
import { executeRootRunDriver } from "../packages/core/src/runs/root-run-driver.ts"
import { buildReviewedFinalResponse } from "./fixtures/final-response-review.ts"
import { type TestDbRuntimeFixture, createTestDbRuntimeFixture } from "./fixtures/runtime-db.ts"

let dbRuntime: TestDbRuntimeFixture
beforeEach(() => {
  dbRuntime = createTestDbRuntimeFixture("knowbee-direct-finalization-")
})
afterEach(() => {
  dbRuntime.dispose()
})

function createFinalizationDependencies() {
  return {
    appendRunEvent: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
    rememberRunSuccess: vi.fn(),
    rememberRunFailure: vi.fn(),
    onDeliveryError: vi.fn(),
    deliveryDependencies: {
      now: () => 0,
      createId: () => "message-1",
      insertMessage: vi.fn(),
      emitStart: vi.fn(),
      emitStream: vi.fn(),
      emitEnd: vi.fn(),
      writeReplyLog: vi.fn(),
    },
  }
}

function createDriverDependencies(finalizationDependencies = createFinalizationDependencies()) {
  return {
    appendRunEvent: vi.fn(),
    updateRunSummary: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
    rememberRunFailure: vi.fn(),
    incrementDelegationTurnCount: vi.fn(),
    markAbortedRunCancelledIfActive: vi.fn(),
    getDelegationTurnState: () => ({ usedTurns: 0, maxTurns: 3 }),
    getFinalizationDependencies: () => finalizationDependencies,
    insertMessage: vi.fn(),
    writeReplyLog: vi.fn(),
    createId: () => "message-1",
    now: () => 0,
    runVerificationSubtask: vi.fn(),
    rememberRunApprovalScope: vi.fn(),
    grantRunApprovalScope: vi.fn(),
    grantRunSingleApproval: vi.fn(),
    onDeliveryError: vi.fn(),
    recordCanonicalAttempt: vi.fn(async () => ({ ok: true as const })),
    recordCanonicalRecoveryReentry: vi.fn(async () => ({ ok: true as const })),
    recordCanonicalCompletionOutcome: vi.fn(async () => ({ ok: true as const })),
    recordCanonicalDelivery: vi.fn(async () => ({ ok: true as const })),
    stageCanonicalPendingResponse: vi.fn(async () => ({ ok: true as const })),
    consumeCanonicalPendingResponse: vi.fn(async () => ({ ok: true as const })),
    recordCanonicalCancellation: vi.fn(async () => ({
      ok: true as const,
      receiptRef: "receipt:cancellation:run:task0034:test",
    })),
    getCanonicalTerminalOutcome: vi.fn(() => null),
    getCanonicalTerminalEvidence: vi.fn(() => ({
      status: "evidence_missing" as const,
      reasonCode: "canonical_terminal_transition_missing" as const,
    })),
    admitCanonicalTopologyExecution: vi.fn(async () => ({ ok: true as const })),
    recordCanonicalTopologyResult: vi.fn(async () => ({
      ok: true as const,
      finalOutcome: "partial" as const,
    })),
    executeLoopDirective: vi.fn(),
    tryHandleActiveQueueCancellation: vi.fn(async () => null),
    tryHandleIntakeBridge: vi.fn(async () => null),
    getSyntheticApprovalAlreadyApproved: () => false,
  }
}

function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

describe("task0034 direct finalization final response rewrite", () => {
  it("records canonical delivery after channel commit and before RootRun completion", async () => {
    const dependencies = createFinalizationDependencies()
    const order: string[] = []
    dependencies.rememberRunSuccess.mockImplementation(() => order.push("root-completed"))
    const recordCanonicalDelivery = vi.fn(async (descriptor) => {
      order.push("canonical-delivery")
      expect(JSON.stringify(descriptor)).not.toContain("검토된 최종 결과")
      return { ok: true as const }
    })
    const stageCanonicalPendingResponse = vi.fn(async () => {
      order.push("response-staged")
      return { ok: true as const }
    })
    const consumeCanonicalPendingResponse = vi.fn(async () => {
      order.push("response-consumed")
      return { ok: true as const }
    })

    const outcome = await completeRunWithAssistantMessage({
      runId: uniqueId("run-canonical-delivery"),
      sessionId: uniqueId("session-canonical-delivery"),
      text: "원시 결과",
      textSource: "llm_generated",
      responseContext: {
        originalRequest: "결과를 알려줘",
        model: "gpt-test",
        providerId: "openai",
        workDir: "/tmp/project",
      },
      renderFinalResponseText: vi.fn(async (input) =>
        buildReviewedFinalResponse(input, "검토된 최종 결과"),
      ),
      source: "webui",
      onChunk: vi.fn(async () => {
        order.push("channel-delivery")
      }),
      recordCanonicalDelivery,
      stageCanonicalPendingResponse,
      consumeCanonicalPendingResponse,
      canonicalFinalOutcome: "succeeded",
      dependencies,
    })

    expect(outcome.status).toBe("completed")
    expect(order[0]).toBe("response-staged")
    const lastChannelDelivery = order.lastIndexOf("channel-delivery")
    expect(lastChannelDelivery).toBeGreaterThan(0)
    expect(order.slice(lastChannelDelivery + 1)).toEqual([
      "canonical-delivery",
      "response-consumed",
      "root-completed",
    ])
  })

  it("rewrites direct finalization text when a deterministic source and response context are provided", async () => {
    const dependencies = createFinalizationDependencies()
    const runId = uniqueId("run-direct-finalization-rewrite")
    const sessionId = uniqueId("session-direct-finalization-rewrite")
    const renderFinalResponseText = vi.fn(async (input) =>
      buildReviewedFinalResponse(input, "요청한 작업을 완료했습니다."),
    )

    await completeRunWithAssistantMessage({
      runId,
      sessionId,
      text: "완료했습니다.",
      textSource: "runtime_deterministic",
      responseContext: {
        originalRequest: "정리해서 보고해줘",
        responseLanguageMode: "translation",
        model: "gpt-test",
        providerId: "openai",
        config: DEFAULT_CONFIG,
        workDir: "/tmp/project",
      },
      renderFinalResponseText,
      source: "webui",
      onChunk: vi.fn().mockResolvedValue(undefined),
      dependencies,
    })

    expect(renderFinalResponseText).toHaveBeenCalledWith(
      expect.objectContaining({
        runId,
        originalRequest: "정리해서 보고해줘",
        responseLanguageMode: "translation",
        rawText: "완료했습니다.",
        textSource: "runtime_deterministic",
        model: "gpt-test",
        providerId: "openai",
        config: DEFAULT_CONFIG,
        workDir: "/tmp/project",
      }),
    )
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      runId,
      "user_facing_completion_rewritten:llm",
    )
    expect(dependencies.deliveryDependencies.writeReplyLog).toHaveBeenCalledWith(
      "webui",
      "요청한 작업을 완료했습니다.",
    )
    expect(dependencies.rememberRunSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "요청한 작업을 완료했습니다.",
        summary: "요청한 작업을 완료했습니다.",
      }),
    )
  })

  it("rewrites LLM-generated direct finalization text through final_response", async () => {
    const dependencies = createFinalizationDependencies()
    const runId = uniqueId("run-direct-finalization-llm-rewrite")
    const sessionId = uniqueId("session-direct-finalization-llm-rewrite")
    const renderFinalResponseText = vi.fn(async (input) =>
      buildReviewedFinalResponse(input, "최종 검토된 답변입니다."),
    )

    await completeRunWithAssistantMessage({
      runId,
      sessionId,
      text: "이미 모델이 만든 답변입니다.",
      textSource: "llm_generated",
      responseContext: {
        originalRequest: "정리해서 답해줘",
        model: "gpt-test",
        providerId: "openai",
        config: DEFAULT_CONFIG,
        workDir: "/tmp/project",
      },
      renderFinalResponseText,
      source: "webui",
      onChunk: vi.fn().mockResolvedValue(undefined),
      dependencies,
    })

    expect(renderFinalResponseText).toHaveBeenCalledWith(
      expect.objectContaining({
        runId,
        originalRequest: "정리해서 답해줘",
        rawText: "이미 모델이 만든 답변입니다.",
        textSource: "llm_generated",
        model: "gpt-test",
        providerId: "openai",
        config: DEFAULT_CONFIG,
        workDir: "/tmp/project",
      }),
    )
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      runId,
      "user_facing_completion_rewritten:llm",
    )
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      runId,
      "user_facing_completion_provenance:llm_reviewed:final_response:llm_generated",
    )
    expect(dependencies.deliveryDependencies.writeReplyLog).toHaveBeenCalledWith(
      "webui",
      "최종 검토된 답변입니다.",
    )
    expect(dependencies.rememberRunSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "최종 검토된 답변입니다.",
        summary: "최종 검토된 답변입니다.",
      }),
    )
  })

  it("blocks deterministic direct finalization when final response context is missing", async () => {
    const dependencies = createFinalizationDependencies()
    const runId = uniqueId("run-direct-finalization-missing-context")
    const sessionId = uniqueId("session-direct-finalization-missing-context")
    const renderFinalResponseText = vi.fn()

    const outcome = await completeRunWithAssistantMessage({
      runId,
      sessionId,
      text: "완료했습니다.",
      textSource: "runtime_deterministic",
      renderFinalResponseText,
      source: "webui",
      onChunk: vi.fn().mockResolvedValue(undefined),
      dependencies,
    })

    expect(outcome.status).toBe("blocked_by_final_response_rendering")
    expect(renderFinalResponseText).not.toHaveBeenCalled()
    expect(dependencies.deliveryDependencies.writeReplyLog).not.toHaveBeenCalled()
    expect(dependencies.rememberRunSuccess).not.toHaveBeenCalled()
    expect(dependencies.rememberRunFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "final_response_rendering_blocked",
        detail: "missing_context",
      }),
    )
    expect(dependencies.updateRunStatus).toHaveBeenCalledWith(
      runId,
      "failed",
      "최종 응답을 LLM으로 렌더링하지 못해 사용자 전달을 중단했습니다.",
      false,
    )
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      runId,
      "user_facing_completion_blocked:missing_context",
    )
  })

  it("treats missing direct finalization text source as deterministic and blocks without context", async () => {
    const dependencies = createFinalizationDependencies()
    const runId = uniqueId("run-direct-finalization-default-source")
    const sessionId = uniqueId("session-direct-finalization-default-source")
    const renderFinalResponseText = vi.fn()

    const outcome = await completeRunWithAssistantMessage({
      runId,
      sessionId,
      text: "완료했습니다.",
      renderFinalResponseText,
      source: "webui",
      onChunk: vi.fn().mockResolvedValue(undefined),
      dependencies,
    })

    expect(outcome.status).toBe("blocked_by_final_response_rendering")
    expect(renderFinalResponseText).not.toHaveBeenCalled()
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      runId,
      "user_facing_completion_text_source:runtime_deterministic",
    )
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      runId,
      "user_facing_completion_blocked:missing_context",
    )
    expect(dependencies.deliveryDependencies.writeReplyLog).not.toHaveBeenCalled()
  })

  it("blocks deterministic direct finalization when final response rendering returns empty output", async () => {
    const dependencies = createFinalizationDependencies()
    const runId = uniqueId("run-direct-finalization-empty-output")
    const sessionId = uniqueId("session-direct-finalization-empty-output")
    const renderFinalResponseText = vi.fn().mockResolvedValue({ text: "   " })

    const outcome = await completeRunWithAssistantMessage({
      runId,
      sessionId,
      text: "완료했습니다.",
      textSource: "runtime_deterministic",
      responseContext: {
        originalRequest: "정리해서 보고해줘",
        model: "gpt-test",
        providerId: "openai",
        workDir: "/tmp/project",
      },
      renderFinalResponseText,
      source: "webui",
      onChunk: vi.fn().mockResolvedValue(undefined),
      dependencies,
    })

    expect(outcome.status).toBe("blocked_by_final_response_rendering")
    expect(dependencies.deliveryDependencies.writeReplyLog).not.toHaveBeenCalled()
    expect(dependencies.rememberRunSuccess).not.toHaveBeenCalled()
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      runId,
      "user_facing_completion_blocked:empty_output",
    )
  })

  it("blocks deterministic direct finalization when final response rendering throws", async () => {
    const dependencies = createFinalizationDependencies()
    const runId = uniqueId("run-direct-finalization-render-error")
    const sessionId = uniqueId("session-direct-finalization-render-error")
    const renderFinalResponseText = vi.fn().mockRejectedValue(new Error("provider unavailable"))

    const outcome = await completeRunWithAssistantMessage({
      runId,
      sessionId,
      text: "완료했습니다.",
      textSource: "runtime_deterministic",
      responseContext: {
        originalRequest: "정리해서 보고해줘",
        model: "gpt-test",
        providerId: "openai",
        workDir: "/tmp/project",
      },
      renderFinalResponseText,
      source: "webui",
      onChunk: vi.fn().mockResolvedValue(undefined),
      dependencies,
    })

    expect(outcome.status).toBe("blocked_by_final_response_rendering")
    expect(dependencies.deliveryDependencies.writeReplyLog).not.toHaveBeenCalled()
    expect(dependencies.rememberRunSuccess).not.toHaveBeenCalled()
    expect(dependencies.rememberRunFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "final_response_rendering_blocked",
        detail: "provider unavailable",
      }),
    )
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      runId,
      "user_facing_completion_blocked:renderer_error",
    )
  })

  it("does not rewrite suppressed child final delivery", async () => {
    const dependencies = createFinalizationDependencies()
    const runId = uniqueId("run-direct-finalization-suppressed")
    const sessionId = uniqueId("session-direct-finalization-suppressed")
    const renderFinalResponseText = vi.fn()

    await completeRunWithAssistantMessage({
      runId,
      sessionId,
      text: "하위 실행 결과입니다.",
      textSource: "runtime_deterministic",
      responseContext: {
        originalRequest: "상위에서 취합해줘",
        model: "gpt-test",
        providerId: "openai",
        workDir: "/tmp/project",
      },
      renderFinalResponseText,
      source: "telegram",
      onChunk: vi.fn().mockResolvedValue(undefined),
      suppressFinalDelivery: true,
      suppressFinalDeliveryReasonCode: "child_result_parent_aggregation_required",
      dependencies,
    })

    expect(renderFinalResponseText).not.toHaveBeenCalled()
    expect(dependencies.deliveryDependencies.writeReplyLog).not.toHaveBeenCalled()
    expect(dependencies.rememberRunSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "하위 실행 결과입니다.",
      }),
    )
  })

  it("passes topology runtime deterministic final answers through final_response when provider context exists", async () => {
    const finalizationDependencies = createFinalizationDependencies()
    const driverDependencies = createDriverDependencies(finalizationDependencies)
    driverDependencies.recordCanonicalTopologyResult.mockResolvedValue({
      ok: true as const,
      finalOutcome: "succeeded" as const,
    })
    const runId = uniqueId("run-topology-direct-rewrite")
    const sessionId = uniqueId("session-topology-direct-rewrite")
    const requestGroupId = uniqueId("group-topology-direct-rewrite")
    const provider = {
      chat: vi.fn(async function* () {
        yield { type: "text_delta", delta: "토폴로지 실행 결과를 정리했습니다." } as const
      }),
    }
    const onChunk = vi.fn().mockResolvedValue(undefined)
    const applyRootRunDriverFailure = vi.fn()
    const topologyRuntime = vi.fn(async (input) => {
      await input.onPlanningAdmitted?.({
        requestDiagnosisReceiptId: "diagnosis:task0034",
        solutionPlanReceiptId: "solution-plan:task0034",
      })
      await input.onResultDiagnosed?.({
        resultDiagnosisReceiptId: "result-diagnosis:task0034",
      })
      return {
        ok: true,
        topologyRunId: "topology-run:test",
        topologyId: "topology:test",
        topologyVersion: 1,
        entryNodeId: "node:intake",
        entryNodeName: "Intake",
        finalAnswer: "Knowbee final answer: 원시 토폴로지 결과",
        nodeResultReport: {} as never,
        runtimeResult: {} as never,
        persistence: {} as never,
      }
    })

    await executeRootRunDriver(
      {
        runId,
        sessionId,
        requestGroupId,
        source: "webui",
        onChunk,
        controller: new AbortController(),
        message: "서브 에이전트 구성으로 처리해줘",
        currentModel: "gpt-test",
        currentProviderId: "openai",
        currentProvider: provider as never,
        currentTargetId: "topology:test",
        currentTargetLabel: "Test Topology",
        config: DEFAULT_CONFIG,
        workDir: process.cwd(),
        finalResponseIdentityContext: {
          promptLocale: "ko",
          mainAgentSelfName: "노비",
          promptContext: "Main agent self name: 노비\n",
        },
        reconnectNeedsClarification: false,
        queuedBehindRequestGroupRun: false,
        activeWorkerRuntime: undefined,
        isRootRequest: true,
        suppressFinalDelivery: false,
        contextMode: "isolated",
        taskProfile: "operations",
        topologyRouting: {
          mode: "route",
          reasonCode: "explicit_topology_target",
          featureFlagMode: "enforced",
          topologyId: "topology:test",
          topologyName: "Test Topology",
          topologyVersion: 1,
          topologyVersionId: "topology-version:test:1",
          compiledTopologySnapshotId: "compiled:test",
          entryNodeId: "node:intake",
          selectedExecutorId: "node:intake",
          selectedConnectionPath: ["node:intake"],
          availableDirectChildExecutorIds: ["topology:test:node:intake"],
          entrySelection: "execution_decision",
          explicit: true,
        },
        syntheticApprovalRuntimeDependencies: {} as never,
        defaultMaxDelegationTurns: 3,
      },
      driverDependencies,
      {
        createExecutionLoopRuntimeState: ((input: { message: string }) => ({
          originalUserRequest: input.message,
          executionProfile: {
            structuredRequest: undefined,
            executionSemantics: undefined,
            wantsDirectArtifactDelivery: false,
          },
          requiresFilesystemMutation: false,
          requiresPrivilegedToolExecution: false,
          pendingToolParams: [],
          filesystemMutationPaths: [],
          seenFollowupPrompts: new Set(),
          seenCommandFailureRecoveryKeys: new Set(),
          seenExecutionRecoveryKeys: new Set(),
          seenDeliveryRecoveryKeys: new Set(),
          seenAiRecoveryKeys: new Set(),
          recoveryBudgetUsage: {},
          priorAssistantMessages: [],
          message: input.message,
        })) as never,
        prepareRootLoopLaunch: (() => ({
          rootLoopParams: {},
          rootLoopDependencies: {},
        })) as never,
        runRootLoop: vi.fn() as never,
        applyRootRunDriverFailure: applyRootRunDriverFailure as never,
        runTopologyRootRun: topologyRuntime,
      },
    )

    expect(topologyRuntime).toHaveBeenCalledTimes(1)
    expect(driverDependencies.admitCanonicalTopologyExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        requestDiagnosisReceiptId: "diagnosis:task0034",
        solutionPlanReceiptId: "solution-plan:task0034",
      }),
    )
    expect(applyRootRunDriverFailure).not.toHaveBeenCalled()
    expect(provider.chat).toHaveBeenCalledTimes(1)
    expect(finalizationDependencies.appendRunEvent).toHaveBeenCalledWith(
      runId,
      "user_facing_completion_rewritten:llm",
    )
    expect(finalizationDependencies.deliveryDependencies.writeReplyLog).toHaveBeenCalledWith(
      "webui",
      "토폴로지 실행 결과를 정리했습니다.",
    )
  })
})
