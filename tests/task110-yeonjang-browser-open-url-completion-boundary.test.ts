import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { deriveCompletionStageState } from "../packages/core/src/runs/completion-state.ts"
import { completeRunWithAssistantMessage } from "../packages/core/src/runs/finalization.ts"
import { runReviewCyclePass } from "../packages/core/src/runs/review-cycle-pass.ts"
import type { SuccessfulToolEvidence } from "../packages/core/src/runs/recovery.ts"
import {
  buildYeonjangEvidenceEnvelope,
  buildYeonjangGoalValidatedPostCheck,
} from "../packages/core/src/yeonjang/evidence.ts"
import { buildReviewedFinalResponse } from "./fixtures/final-response-review.ts"
import { type TestDbRuntimeFixture, createTestDbRuntimeFixture } from "./fixtures/runtime-db.ts"

const RAW_URL = "https://example.test/dashboard?token=private"
const INTERNAL_TEXT = [
  "yeonjang_browser_open_url browser.open_url",
  `raw browser URL ${RAW_URL}`,
  "operationId=operation:browser-open-url-110",
  "receipt payload",
  "raw observed state",
].join(" | ")

let dbRuntime: TestDbRuntimeFixture

beforeEach(() => {
  dbRuntime = createTestDbRuntimeFixture("knowbee-task110-browser-open-url-")
})

afterEach(() => {
  dbRuntime.dispose()
})

function buildBrowserGoalEvidence(): SuccessfulToolEvidence {
  return {
    toolName: "yeonjang_browser_open_url",
    output: "yeonjang_browser_open_url 목표 검증 완료",
    details: {
      via: "yeonjang",
      evidence: buildYeonjangEvidenceEnvelope({
        targetRef: "tool:yeonjang_browser_open_url:side-effect-goal",
        toolName: "yeonjang_browser_open_url",
        methodIds: ["browser.open_url"],
        group: "browser",
        riskLevel: "moderate",
        requiresApproval: true,
        summary: "browser.open_url goal validated by LLM result diagnosis.",
        postCheck: buildYeonjangGoalValidatedPostCheck({
          diagnosisReceiptId: "diagnosis:work:root:run-110:executing:result",
          diagnosisSubjectKind: "tool_result",
          evidenceRefs: ["operation-evidence:mark_manual:110"],
        }),
        collectedAt: 110,
      }),
    },
    evidenceSource: {
      sourceKind: "yeonjang",
      trustClass: "untrusted_external",
      instructionIsolation: "data_only",
      sourceRef: "tool-result:yeonjang:browser-open-url-110",
    },
  }
}

function dependencies() {
  return {
    rememberRunApprovalScope: vi.fn(),
    grantRunApprovalScope: vi.fn(),
    grantRunSingleApproval: vi.fn(),
    rememberRunFailure: vi.fn(),
    incrementDelegationTurnCount: vi.fn(),
    appendRunEvent: vi.fn(),
    updateRunSummary: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
  }
}

function finalizationDependencies() {
  return {
    appendRunEvent: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
    rememberRunSuccess: vi.fn(),
    rememberRunFailure: vi.fn(),
    onDeliveryError: vi.fn(),
    deliveryDependencies: {
      now: () => 0,
      createId: () => "message-task110",
      insertMessage: vi.fn(),
      emitStart: vi.fn(),
      emitStream: vi.fn(),
      emitEnd: vi.fn(),
      writeReplyLog: vi.fn(),
    },
  }
}

describe("Task 110 browser.open_url completion and final response boundary", () => {
  it("runs browser.open_url goal validation before the review gate observes successful evidence", async () => {
    const deps = dependencies()
    const order: string[] = []
    const successfulTools: SuccessfulToolEvidence[] = []
    const moduleDependencies = {
      getDb: vi.fn(() => ({} as never)),
      validateAndAppendYeonjangSideEffectGoalValidationEvidence: vi.fn(async (input) => {
        order.push("validate")
        input.successfulTools.push(buildBrowserGoalEvidence())
        return { added: 1, skipped: [] }
      }),
      resolveRuntimeToolMetadataFromDispatcher: vi.fn(() => ({
        methodIds: ["browser.open_url"],
        group: "browser",
        riskLevel: "moderate" as const,
        requiresApproval: true,
      })),
      decideReviewGate: vi.fn((input) => {
        order.push("gate")
        const serialized = JSON.stringify(input.successfulTools)
        expect(input.successfulTools).toHaveLength(1)
        expect(serialized).toContain("goal_validated")
        expect(serialized).not.toContain(RAW_URL)
        expect(serialized).not.toContain("token=private")
        expect(serialized).not.toContain("receipt payload")
        expect(serialized).not.toContain("raw observed state")
        return {
          kind: "run" as const,
          state: {
            executionSatisfied: true,
            deliveryRequired: false,
            deliverySatisfied: true,
            completionSatisfied: true,
            interpretationStatus: "satisfied" as const,
            executionStatus: "satisfied" as const,
            deliveryStatus: "not_required" as const,
            recoveryStatus: "settled" as const,
            blockingReasons: [],
          },
        }
      }),
      runReviewPass: vi.fn(async () => ({
        review: {
          status: "complete" as const,
          summary: "목표 달성",
          reason: "브라우저 URL 열기 목표가 LLM 결과 진단으로 검증되었습니다.",
          remainingItems: [],
        },
        syntheticApproval: null,
      })),
      runReviewOutcomePass: vi.fn(async () => ({ kind: "break" as const })),
      getRootRun: vi.fn(() => ({ delegationTurnCount: 1, maxDelegationTurns: 8 })),
    }

    await runReviewCyclePass({
      instructionRuntime: {} as never,
      runId: "run-110",
      sessionId: "session-110",
      source: "webui",
      onChunk: undefined,
      signal: new AbortController().signal,
      preview: "브라우저 URL 열기 결과가 검증되었습니다.",
      priorAssistantMessages: [],
      executionSemantics: {
        filesystemEffect: "none",
        artifactDelivery: "none",
        approvalRequired: true,
        approvalTool: "yeonjang_browser_open_url",
        privilegedOperation: "external_system",
      },
      requiresFilesystemMutation: false,
      originalRequest: "원격 컴퓨터 브라우저로 대시보드를 열어줘.",
      model: "test-model",
      provider: {
        id: "test-provider",
        supportedModels: ["test-model"],
        maxContextTokens: () => 100_000,
        async *chat() {},
      },
      diagnosisProvider: {
        diagnoseRequest: () => null,
        diagnoseResult: () => null,
      },
      config: DEFAULT_CONFIG,
      workDir: "/tmp",
      finalResponseIdentityContext: {
        promptLocale: "ko",
        mainAgentSelfName: "마당쇠",
        promptContext: "",
      },
      usesWorkerRuntime: false,
      requiresPrivilegedToolExecution: true,
      successfulTools,
      completionConditions: ["대시보드가 브라우저에서 열려야 한다."],
      successfulFileDeliveries: [],
      sawRealFilesystemMutation: false,
      deliveryOutcome: {
        directArtifactDeliveryRequested: false,
        hasSuccessfulArtifactDelivery: false,
        deliverySatisfied: false,
        requiresDirectArtifactRecovery: false,
      },
      yeonjangSideEffectGoalValidationCandidates: [{
        toolName: "yeonjang_browser_open_url",
        output: "scheme=https\nreason=llm_goal_validation_required",
        details: {
          kind: "side_effect_manual_intervention",
          operationId: "operation:browser-open-url-110",
          reasonCode: "side_effect_irreversible",
          goalValidationCandidate: true,
          rawObservedState: { url: RAW_URL, receiptPayload: { url: RAW_URL } },
        },
      }],
      truncatedOutputRecoveryAttempted: false,
      recoveryBudgetUsage: {
        interpretation: 0,
        execution: 0,
        delivery: 0,
        external: 0,
      },
      seenFollowupPrompts: new Set<string>(),
      syntheticApprovalAlreadyApproved: false,
      syntheticApprovalRuntimeDependencies: {
        timeoutSec: 30,
        fallback: "deny",
        appendRunEvent: vi.fn(),
        setRunStepStatus: vi.fn(),
        updateRunStatus: vi.fn(),
        cancelRun: vi.fn(),
        emitApprovalResolved: vi.fn(),
        emitApprovalRequest: vi.fn(),
        onRequested: vi.fn(),
      },
      finalizationDependencies: finalizationDependencies(),
      approvalRequired: false,
      approvalTool: "none",
      defaultMaxDelegationTurns: 8,
    }, deps, moduleDependencies)

    expect(order).toEqual(["validate", "gate"])
    expect(deps.appendRunEvent).toHaveBeenCalledWith(
      "run-110",
      "yeonjang_side_effect_goal_validation_added:1",
    )
  })

  it("treats browser.open_url goal_validated Yeonjang evidence as completion evidence", () => {
    const result = deriveCompletionStageState({
      review: {
        status: "complete",
        summary: "목표 달성",
        reason: "LLM result diagnosis가 브라우저 목표 달성을 검증했습니다.",
        remainingItems: [],
      },
      executionSemantics: {
        filesystemEffect: "none",
        privilegedOperation: "external_system",
        artifactDelivery: "none",
        approvalRequired: true,
        approvalTool: "yeonjang_browser_open_url",
      },
      preview: "",
      deliverySatisfied: false,
      successfulTools: [buildBrowserGoalEvidence()],
      sawRealFilesystemMutation: false,
      requiresFilesystemMutation: false,
      truncatedOutputRecoveryAttempted: false,
    })

    expect(result.executionStatus).toBe("satisfied")
    expect(result.recoveryStatus).toBe("settled")
    expect(result.completionSatisfied).toBe(true)
  })

  it("removes browser.open_url raw URL and internal evidence before final response rendering", async () => {
    const deps = finalizationDependencies()
    const renderFinalResponseText = vi.fn(async (input) => {
      expect(input.rawText).not.toContain(RAW_URL)
      expect(input.rawText).not.toContain("token=private")
      expect(input.rawText).not.toContain("operationId")
      expect(input.rawText).not.toContain("receipt payload")
      expect(input.rawText).not.toContain("raw observed state")
      return buildReviewedFinalResponse(input, "요청한 페이지를 브라우저에서 열었습니다.")
    })
    const delivered: string[] = []

    const outcome = await completeRunWithAssistantMessage({
      runId: "run-task110-final",
      sessionId: "session-task110-final",
      text: INTERNAL_TEXT,
      textSource: "runtime_deterministic",
      responseContext: {
        originalRequest: "원격 컴퓨터 브라우저로 대시보드를 열어줘.",
        model: "test-model",
        providerId: "openai",
        config: DEFAULT_CONFIG,
        workDir: "/tmp",
        identityContext: {
          promptLocale: "ko",
          mainAgentSelfName: "마당쇠",
          promptContext: "",
        },
      },
      renderFinalResponseText,
      source: "webui",
      onChunk: vi.fn(async (chunk) => {
        if (chunk.type === "text") delivered.push(chunk.delta)
      }),
      dependencies: deps,
    })

    const serialized = JSON.stringify({
      outcome,
      delivered,
      success: deps.rememberRunSuccess.mock.calls,
    })
    expect(outcome.status).toBe("completed")
    expect(serialized).not.toContain(RAW_URL)
    expect(serialized).not.toContain("token=private")
    expect(serialized).not.toContain("operationId")
    expect(serialized).not.toContain("receipt payload")
    expect(serialized).not.toContain("raw observed state")
  })
})
