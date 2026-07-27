import { describe, expect, it, vi } from "vitest"
import {
  COMPLETION_REVIEW_CRITERION_KEYS,
  buildCompletionReviewContextReceipt,
} from "../packages/core/src/agent/completion-review.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { createInstructionRuntimeContext } from "../packages/core/src/instructions/merge.ts"
import type { SuccessfulToolEvidence } from "../packages/core/src/runs/recovery.ts"
import { runReviewCyclePass } from "../packages/core/src/runs/review-cycle-pass.ts"
import { decideReviewGate } from "../packages/core/src/runs/review-gate.ts"
import { runReviewOutcomePass } from "../packages/core/src/runs/review-outcome-pass.ts"
import { buildCompletionReviewOperationalEvidence } from "../packages/core/src/runs/review-pass.ts"

const request = "SK하이닉스의 현재 주가를 알려줘"
const staleCandidate = "SK하이닉스의 전일 종가는 289,500원입니다."
const currentCandidate =
  "SK하이닉스 현재가는 295,000원입니다. 기준 시각 2026-07-16 10:01 KST, KRX 장중, 출처 example.test."

function webSource(char: string) {
  return {
    sourceKind: "web" as const,
    sourceRef: `tool-result:web:${char.repeat(64)}`,
    trustClass: "untrusted_external" as const,
    instructionIsolation: "data_only" as const,
  }
}

const staleEvidence: SuccessfulToolEvidence[] = [
  {
    toolName: "web_search",
    output: "SK하이닉스(000660) 전일 종가 289,500원",
    details: {
      resultUrl: "https://example.test/search-result",
      fetchedAt: "2026-07-16T01:00:00.000Z",
    },
    evidenceSource: webSource("a"),
  },
  {
    toolName: "web_fetch",
    output: JSON.stringify({ ticker: "005930", currentPrice: 91_000 }),
    details: {
      sourceUrl: "https://example.test/quotes/005930",
      fetchedAt: "2026-07-16T01:00:01.000Z",
    },
    evidenceSource: webSource("b"),
  },
]

const currentEvidence: SuccessfulToolEvidence[] = [
  {
    toolName: "web_fetch",
    output: JSON.stringify({
      ticker: "000660",
      name: "SK하이닉스",
      currentPrice: 295_000,
      previousClose: 289_500,
      marketStatus: "OPEN",
      tradedAt: "2026-07-16T10:01:03+09:00",
    }),
    details: {
      sourceUrl: "https://example.test/quotes/000660",
      fetchedAt: "2026-07-16T01:01:04.000Z",
    },
    evidenceSource: webSource("c"),
  },
]

function createRuntimeDependencies() {
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
    onReviewError: vi.fn(),
  }
}

function createFinalizationDependencies() {
  return {
    appendRunEvent: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
    rememberRunSuccess: vi.fn(),
    rememberRunFailure: vi.fn(),
  }
}

function createParams(input: {
  preview: string
  successfulTools: SuccessfulToolEvidence[]
  finalizationDependencies: ReturnType<typeof createFinalizationDependencies>
}) {
  return {
    instructionRuntime: createInstructionRuntimeContext("/tmp/knowbee-task042/state"),
    runId: "run:task042:current-quote",
    sessionId: "session:task042",
    source: "telegram" as const,
    onChunk: vi.fn(),
    signal: new AbortController().signal,
    preview: input.preview,
    priorAssistantMessages: [],
    executionSemantics: {
      filesystemEffect: "none",
      artifactDelivery: "none",
      approvalRequired: false,
      approvalTool: "none",
      privilegedOperation: "none",
    } as const,
    requiresFilesystemMutation: false,
    originalRequest: request,
    config: DEFAULT_CONFIG,
    usesWorkerRuntime: false,
    requiresPrivilegedToolExecution: false,
    successfulTools: input.successfulTools,
    completionConditions: [],
    successfulFileDeliveries: [],
    sawRealFilesystemMutation: false,
    deliveryOutcome: {
      directArtifactDeliveryRequested: false,
      hasSuccessfulArtifactDelivery: false,
      deliverySatisfied: false,
      requiresDirectArtifactRecovery: false,
    },
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
      fallback: "deny" as const,
      appendRunEvent: vi.fn(),
      setRunStepStatus: vi.fn(),
      updateRunStatus: vi.fn(),
      cancelRun: vi.fn(),
      emitApprovalResolved: vi.fn(),
      emitApprovalRequest: vi.fn(),
      onRequested: vi.fn(),
    },
    finalizationDependencies: input.finalizationDependencies,
    approvalRequired: false,
    approvalTool: "none",
    defaultMaxDelegationTurns: 8,
  }
}

function criterionAssessments(evidenceRef: string) {
  return COMPLETION_REVIEW_CRITERION_KEYS.map((criterionKey) => ({
    criterionKey,
    applicable: true,
    verdict: "satisfied" as const,
    evidenceRefs: [evidenceRef],
    uncertainty: "",
    reason: `${criterionKey} verified by the current quote evidence`,
  }))
}

describe("Task 042 current-fact root runtime", () => {
  it("re-enters with a changed strategy after stale evidence and finalizes only the verified current result", async () => {
    const runtimeDependencies = createRuntimeDependencies()
    const firstFinalization = createFinalizationDependencies()
    const firstParams = createParams({
      preview: staleCandidate,
      successfulTools: staleEvidence,
      finalizationDependencies: firstFinalization,
    })
    const directCurrentSourceFollowup =
      "Open https://example.test/quotes/000660 directly and retrieve ticker 000660 current price, market status, and source timestamp. Do not reuse the search snippet or ticker 005930."
    const runReviewPass = vi.fn(
      async (input: {
        originalRequest: string
        preview: string
        successfulTools: SuccessfulToolEvidence[]
      }) => ({
        review: {
          status: "followup" as const,
          summary: "A direct current quote for 000660 is still required.",
          reason: "The evidence contains only a previous close and another ticker.",
          followupPrompt: directCurrentSourceFollowup,
          remainingItems: ["000660 current quote and source time"],
          contextReceipt: buildCompletionReviewContextReceipt({
            originalRequest: input.originalRequest,
            latestAssistantMessage: input.preview,
            successfulTools: input.successfulTools,
          }),
        },
        syntheticApproval: null,
      }),
    )
    const moduleDependencies = {
      decideReviewGate,
      runReviewPass,
      runReviewOutcomePass,
      getRootRun: vi.fn(() => null),
    }

    const firstResult = await runReviewCyclePass(
      firstParams,
      runtimeDependencies,
      moduleDependencies,
    )

    expect(firstResult).toMatchObject({
      kind: "retry",
      nextMessage: directCurrentSourceFollowup,
    })
    expect(firstResult.kind === "retry" ? firstResult.nextMessage : "").not.toBe(staleCandidate)
    expect(firstParams.onChunk).not.toHaveBeenCalled()
    expect(firstFinalization.rememberRunSuccess).not.toHaveBeenCalled()
    expect(JSON.stringify(firstFinalization.appendRunEvent.mock.calls)).not.toContain("289,500")
    expect(runReviewPass).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        originalRequest: request,
        successfulTools: staleEvidence,
      }),
      expect.anything(),
    )

    const secondFinalization = createFinalizationDependencies()
    const secondParams = createParams({
      preview: currentCandidate,
      successfulTools: currentEvidence,
      finalizationDependencies: secondFinalization,
    })
    const currentContext = buildCompletionReviewContextReceipt({
      originalRequest: request,
      latestAssistantMessage: currentCandidate,
      successfulTools: currentEvidence,
      operationalEvidence: buildCompletionReviewOperationalEvidence({
        successfulFileDeliveries: secondParams.successfulFileDeliveries,
        sawRealFilesystemMutation: secondParams.sawRealFilesystemMutation,
        deliveryOutcome: secondParams.deliveryOutcome,
      }),
    })
    runReviewPass.mockResolvedValueOnce({
      review: {
        status: "complete",
        summary: "The requested current quote is verified.",
        reason: "Ticker, current value, market state, and source time match.",
        remainingItems: [],
        criterionAssessments: criterionAssessments(webSource("c").sourceRef),
        contextReceipt: currentContext,
      },
      syntheticApproval: null,
    })
    const recordCanonicalCompletionOutcome = vi.fn(async () => ({ ok: true as const }))
    secondParams.recordCanonicalCompletionOutcome = recordCanonicalCompletionOutcome

    const secondResult = await runReviewCyclePass(
      secondParams,
      runtimeDependencies,
      moduleDependencies,
    )

    expect(secondResult).toEqual({ kind: "break" })
    expect(recordCanonicalCompletionOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "ALL_CRITERIA_VERIFIED",
        receipt: expect.objectContaining({
          kind: "verification",
          receiptId: expect.stringMatching(/^receipt:completion-verification:/u),
        }),
      }),
    )
    expect(runReviewPass).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        originalRequest: request,
        successfulTools: currentEvidence,
      }),
      expect.anything(),
    )
    expect(secondFinalization.rememberRunSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        text: currentCandidate,
      }),
    )
    const deliveredProjection = secondFinalization.rememberRunSuccess.mock.calls[0]?.[0]?.text ?? ""
    expect(deliveredProjection).toContain("295,000원")
    expect(deliveredProjection).toContain("2026-07-16 10:01 KST")
    expect(deliveredProjection).toContain("KRX 장중")
    expect(deliveredProjection).toContain("example.test")
    expect(deliveredProjection).not.toContain("previousClose")
    expect(deliveredProjection).not.toContain("005930")
  })
})
