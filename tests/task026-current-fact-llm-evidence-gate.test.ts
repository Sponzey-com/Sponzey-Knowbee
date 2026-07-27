import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  COMPLETION_REVIEW_CRITERION_KEYS,
  buildCompletionReviewContextReceipt,
  buildCompletionReviewEvidenceBlock,
  buildCompletionReviewExpectedConditions,
  buildCompletionReviewSystemPrompt,
  reviewTaskCompletion,
} from "../packages/core/src/agent/completion-review.ts"
import type { AIProvider, ChatParams } from "../packages/core/src/ai/types.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { createInstructionRuntimeContext } from "../packages/core/src/instructions/merge.ts"
import { buildCanonicalCompletionOutcomeDescriptor } from "../packages/core/src/runs/canonical-finalization-lifecycle.ts"
import type { SuccessfulToolEvidence } from "../packages/core/src/runs/recovery.ts"

const request = "SK하이닉스의 현재 주가를 알려줘"
const candidate = "SK하이닉스의 현재가는 295,000원입니다."

function sourceRef(char: string) {
  return {
    sourceKind: "web" as const,
    sourceRef: `tool-result:web:${char.repeat(64)}`,
    trustClass: "untrusted_external" as const,
    instructionIsolation: "data_only" as const,
  }
}

const staleAndWrongTargetEvidence: SuccessfulToolEvidence[] = [
  {
    toolName: "web_search",
    output: "SK하이닉스(000660) 전일 종가 289,500원",
    details: {
      fetchedAt: "2026-07-16T01:00:00.000Z",
      resultUrl: "https://example.test/search-result",
    },
    evidenceSource: sourceRef("a"),
  },
  {
    toolName: "web_fetch",
    output: JSON.stringify({
      ticker: "005930",
      currentPrice: 91_000,
      tradedAt: "2026-07-16T10:00:00+09:00",
    }),
    details: {
      sourceUrl: "https://example.test/quotes/005930",
      fetchedAt: "2026-07-16T01:00:01.000Z",
    },
    evidenceSource: sourceRef("b"),
  },
]

const currentTargetEvidence: SuccessfulToolEvidence[] = [
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
    evidenceSource: sourceRef("c"),
  },
]

function criterionAssessments(evidenceRef: string) {
  return COMPLETION_REVIEW_CRITERION_KEYS.map((criterionKey) => ({
    criterionKey,
    applicable: true,
    verdict: "satisfied" as const,
    evidenceRefs: [evidenceRef],
    uncertainty: "",
    reason: `${criterionKey} verified`,
  }))
}

function criterionAssessmentJson(evidenceRef: string, uncertainKey?: string) {
  return COMPLETION_REVIEW_CRITERION_KEYS.map((criterionKey) => ({
    criterion_key: criterionKey,
    applicable: true,
    verdict: criterionKey === uncertainKey ? "uncertain" : "satisfied",
    evidence_refs: [evidenceRef],
    uncertainty: criterionKey === uncertainKey ? "direct current quote missing" : "",
    reason: `${criterionKey} reviewed`,
  }))
}

function providerReturning(text: string, capture: (params: ChatParams) => void): AIProvider {
  return {
    id: "task026-review-provider",
    supportedModels: ["task026-model"],
    maxContextTokens: () => 16_384,
    async *chat(params) {
      capture(params)
      yield { type: "text_delta", delta: text }
    },
  }
}

const completeState = {
  executionSatisfied: true,
  deliveryRequired: false,
  deliverySatisfied: true,
  completionSatisfied: true,
  interpretationStatus: "satisfied" as const,
  executionStatus: "satisfied" as const,
  deliveryStatus: "not_required" as const,
  recoveryStatus: "settled" as const,
  blockingReasons: [],
  checklist: {
    items: [
      { key: "request", status: "completed" as const },
      { key: "execution", status: "completed" as const },
      { key: "delivery", status: "not_required" as const },
      { key: "completion", status: "completed" as const },
    ],
    completedCount: 3,
    actionableCount: 3,
    pendingCount: 0,
  },
}

describe("Task 026 current-fact LLM evidence gate", () => {
  it("sends the exact request, previous close, wrong ticker, timestamps and provenance to the LLM reviewer", async () => {
    let captured: ChatParams | undefined
    const completionConditions = ["000660 현재가와 기준 시각이 직접 출처로 검증됨"]
    const expectedConditions = buildCompletionReviewExpectedConditions(completionConditions)
    const review = await reviewTaskCompletion({
      instructionRuntime: createInstructionRuntimeContext("/tmp/knowbee-task026/state"),
      originalRequest: request,
      latestAssistantMessage: candidate,
      model: "task026-model",
      providerId: "task026-review-provider",
      provider: providerReturning(
        JSON.stringify({
          status: "followup",
          summary: "현재가 검증이 남았습니다.",
          reason: "전일 종가와 다른 종목 값만 확인되었습니다.",
          followup_prompt:
            "검색 결과 URL을 직접 조회하고 000660의 장중 현재가와 거래 시각을 확인하세요.",
          followup_evidence_refs: [sourceRef("a").sourceRef],
          followup_execution_mode: "tool",
          followup_required_tool_names: ["web_fetch"],
          followup_target_refs: ["https://example.test/search-result"],
          remaining_items: ["000660 현재가 직접 출처 검증"],
          criterion_assessments: criterionAssessmentJson(sourceRef("a").sourceRef, "freshness"),
          condition_assessments: expectedConditions.map((condition) => ({
            condition_id: condition.conditionId,
            verdict: "uncertain",
            evidence_refs: [sourceRef("a").sourceRef],
            uncertainty: "direct current quote missing",
            reason: "only previous close was observed",
          })),
        }),
        (params) => {
          captured = params
        },
      ),
      config: DEFAULT_CONFIG,
      workDir: process.cwd(),
      successfulTools: staleAndWrongTargetEvidence,
      completionConditions,
    })

    const llmInput = JSON.stringify(captured?.messages ?? [])
    expect(llmInput).toContain(request)
    expect(llmInput).toContain("289,500")
    expect(llmInput).toContain("005930")
    expect(llmInput).toContain("2026-07-16T10:00:00+09:00")
    expect(llmInput).toContain("https://example.test/quotes/005930")
    expect(expectedConditions).toHaveLength(1)
    expect(llmInput).toContain(expectedConditions[0]?.conditionId)
    expect(llmInput).toContain(completionConditions[0])
    expect(review).toMatchObject({
      status: "followup",
      followupPrompt: expect.stringContaining("직접 조회"),
      contextReceipt: {
        requestFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
        evidenceFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      },
    })
  })

  it("binds completion to the exact current-target evidence set", () => {
    const contextReceipt = buildCompletionReviewContextReceipt({
      originalRequest: request,
      latestAssistantMessage: candidate,
      successfulTools: currentTargetEvidence,
    })
    const review = {
      status: "complete" as const,
      summary: "현재가와 거래 시각이 직접 출처에서 확인되었습니다.",
      reason: "000660의 장중 현재가 근거가 일치합니다.",
      remainingItems: [],
      criterionAssessments: criterionAssessments(sourceRef("c").sourceRef),
      contextReceipt,
    }
    const base = {
      runId: "run:task026:current-quote",
      review,
      requiresLlmResultDiagnosis: true,
      state: completeState,
      application: {
        kind: "complete" as const,
        summary: "done",
        persistedText: candidate,
        statusText: "done",
      },
      preview: candidate,
    }

    expect(
      buildCanonicalCompletionOutcomeDescriptor({
        ...base,
        expectedLlmDiagnosisContext: contextReceipt,
      }),
    ).toMatchObject({ ok: true, descriptor: { event: "ALL_CRITERIA_VERIFIED" } })

    const changedEvidenceContext = buildCompletionReviewContextReceipt({
      originalRequest: request,
      latestAssistantMessage: candidate,
      successfulTools: staleAndWrongTargetEvidence,
    })
    expect(
      buildCanonicalCompletionOutcomeDescriptor({
        ...base,
        expectedLlmDiagnosisContext: changedEvidenceContext,
      }),
    ).toEqual({
      ok: false,
      reasonCode: "canonical_llm_result_diagnosis_context_mismatch",
    })
  })

  it("rejects a successful transport whose evidence has no valid provenance binding", () => {
    const unboundEvidence = [{ toolName: "web_fetch", output: "" }]
    const contextReceipt = buildCompletionReviewContextReceipt({
      originalRequest: request,
      latestAssistantMessage: candidate,
      successfulTools: unboundEvidence,
    })

    expect(
      buildCanonicalCompletionOutcomeDescriptor({
        runId: "run:task026:empty-evidence",
        review: {
          status: "complete",
          summary: "transport complete",
          reason: "HTTP success",
          remainingItems: [],
          criterionAssessments: criterionAssessments("tool-result:web:unbound"),
          contextReceipt,
        },
        requiresLlmResultDiagnosis: true,
        expectedLlmDiagnosisContext: contextReceipt,
        state: completeState,
        application: {
          kind: "complete",
          summary: "done",
          persistedText: candidate,
          statusText: "done",
        },
        preview: candidate,
      }),
    ).toEqual({
      ok: false,
      reasonCode: "canonical_llm_result_diagnosis_evidence_missing",
    })
  })

  it("keeps semantic freshness decisions in the LLM prompt and deterministic code limited to evidence binding", () => {
    const prompt = buildCompletionReviewSystemPrompt()
    const block = buildCompletionReviewEvidenceBlock(currentTargetEvidence)

    expect(prompt).toContain(
      "For a current/latest claim, distinguish the requested value from previous close",
    )
    expect(prompt).toContain("use a different concrete source path")
    expect(block).toContain("currentPrice")
    expect(block).toContain("previousClose")
    expect(block).toContain("marketStatus")
    expect(block).toContain("tradedAt")
  })

  it("keeps deterministic retrieval verdict modules outside the active completion call graph", () => {
    const inventory = JSON.parse(
      readFileSync("docs/audit/current-fact-llm-evidence-inventory.json", "utf8"),
    ) as { paths: Array<{ id: string; status: string; completionAuthority: string }> }
    const active = inventory.paths.find((path) => path.id === "root-tool-evidence-completion")
    const diagnostics = inventory.paths.find((path) => path.id === "retrieval-fixture-diagnostics")
    const activeOwners = [
      "packages/core/src/runs/review-gate.ts",
      "packages/core/src/runs/review-outcome-pass.ts",
      "packages/core/src/agent/completion-review.ts",
    ]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")

    expect(active).toMatchObject({ status: "active", completionAuthority: "llm_result_diagnosis" })
    expect(diagnostics).toMatchObject({
      status: "removed",
      completionAuthority: "llm_result_diagnosis",
      replacementContract: "web-evidence-llm-diagnosis-v2",
    })
    expect(activeOwners).not.toMatch(
      /current-fact-retrieval|web-retrieval-verification|retrieval-finalizer/u,
    )
  })
})
