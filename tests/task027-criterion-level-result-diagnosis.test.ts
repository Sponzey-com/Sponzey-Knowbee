import { describe, expect, it } from "vitest"
import {
  COMPLETION_REVIEW_CRITERION_KEYS,
  type CompletionReviewCriterionAssessment,
  type CompletionReviewResult,
  buildCompletionReviewContextReceipt,
  buildCompletionReviewExpectedConditions,
  evaluateCompletionReviewCriterionGate,
  parseCompletionReviewResult,
} from "../packages/core/src/agent/completion-review.ts"
import { buildCanonicalCompletionOutcomeDescriptor } from "../packages/core/src/runs/canonical-finalization-lifecycle.ts"
import type { SuccessfulToolEvidence } from "../packages/core/src/runs/recovery.ts"

const evidenceRef = `tool-result:tool:${"d".repeat(64)}`
const evidence: SuccessfulToolEvidence[] = [
  {
    toolName: "web_fetch",
    output: JSON.stringify({
      ticker: "000660",
      currentPrice: 295_000,
      tradedAt: "2026-07-16T10:01:03+09:00",
    }),
    evidenceSource: {
      sourceKind: "tool",
      sourceRef: evidenceRef,
      trustClass: "untrusted_external",
      instructionIsolation: "data_only",
    },
  },
]

function assessments(
  overrides: Partial<
    Record<
      (typeof COMPLETION_REVIEW_CRITERION_KEYS)[number],
      Partial<CompletionReviewCriterionAssessment>
    >
  > = {},
): CompletionReviewCriterionAssessment[] {
  return COMPLETION_REVIEW_CRITERION_KEYS.map((criterionKey) => ({
    criterionKey,
    applicable: true,
    verdict: "satisfied",
    evidenceRefs: [evidenceRef],
    uncertainty: "",
    reason: `${criterionKey} verified by the LLM`,
    ...overrides[criterionKey],
  }))
}

function completeReview(
  criterionAssessments: CompletionReviewCriterionAssessment[] | undefined,
  conditionAssessments?: CompletionReviewResult["conditionAssessments"],
): CompletionReviewResult {
  return {
    status: "complete",
    summary: "검증 완료",
    reason: "모든 적용 기준을 확인했습니다.",
    remainingItems: [],
    ...(criterionAssessments ? { criterionAssessments } : {}),
    ...(conditionAssessments ? { conditionAssessments } : {}),
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
      { key: "completion", status: "completed" as const },
    ],
    completedCount: 3,
    actionableCount: 3,
    pendingCount: 0,
  },
}

describe("Task 027 criterion-level LLM result diagnosis", () => {
  it("parses all general criterion axes without interpreting their meaning in code", () => {
    const parsed = parseCompletionReviewResult(
      JSON.stringify({
        status: "complete",
        summary: "verified",
        reason: "all applicable criteria satisfied",
        remaining_items: [],
        criterion_assessments: assessments().map((assessment) => ({
          criterion_key: assessment.criterionKey,
          applicable: assessment.applicable,
          verdict: assessment.verdict,
          evidence_refs: assessment.evidenceRefs,
          uncertainty: assessment.uncertainty,
          reason: assessment.reason,
        })),
      }),
    )

    expect(parsed?.criterionAssessments?.map((item) => item.criterionKey)).toEqual(
      COMPLETION_REVIEW_CRITERION_KEYS,
    )
    if (!parsed) throw new Error("Expected a parsed criterion-level review.")
    expect(
      evaluateCompletionReviewCriterionGate({
        review: parsed,
        allowedEvidenceRefs: [evidenceRef],
      }),
    ).toEqual({ ok: true })
  })

  it("rejects missing, incomplete and foreign-reference criterion contracts", () => {
    expect(
      evaluateCompletionReviewCriterionGate({
        review: completeReview(undefined),
        allowedEvidenceRefs: [evidenceRef],
      }),
    ).toEqual({ ok: false, reasonCode: "completion_review_criteria_missing" })

    expect(
      evaluateCompletionReviewCriterionGate({
        review: completeReview(assessments().slice(0, -1)),
        allowedEvidenceRefs: [evidenceRef],
      }),
    ).toEqual({ ok: false, reasonCode: "completion_review_criteria_incomplete" })

    expect(
      evaluateCompletionReviewCriterionGate({
        review: completeReview(
          assessments({ accuracy: { evidenceRefs: ["tool-result:tool:foreign"] } }),
        ),
        allowedEvidenceRefs: [evidenceRef],
      }),
    ).toEqual({ ok: false, reasonCode: "completion_review_evidence_ref_foreign" })
  })

  it("requires evidence for every applicable criterion and expected condition", () => {
    expect(
      evaluateCompletionReviewCriterionGate({
        review: completeReview(assessments()),
        allowedEvidenceRefs: [evidenceRef],
        requiresSuccessfulToolEvidence: true,
        successfulToolEvidenceRefs: [],
      }),
    ).toEqual({
      ok: false,
      reasonCode: "completion_review_required_tool_evidence_missing",
    })

    expect(
      evaluateCompletionReviewCriterionGate({
        review: completeReview(assessments({ accuracy: { evidenceRefs: [] } })),
        allowedEvidenceRefs: [evidenceRef],
      }),
    ).toEqual({
      ok: false,
      reasonCode: "completion_review_criterion_evidence_missing",
    })

    const expectedConditions = buildCompletionReviewExpectedConditions(["현재가를 검증한다."])
    expect(
      evaluateCompletionReviewCriterionGate({
        review: completeReview(
          assessments(),
          expectedConditions.map((condition) => ({
            conditionId: condition.conditionId,
            verdict: "satisfied",
            evidenceRefs: [],
            uncertainty: "",
            reason: "근거 없는 완료 주장",
          })),
        ),
        allowedEvidenceRefs: [evidenceRef],
        expectedConditions,
      }),
    ).toEqual({
      ok: false,
      reasonCode: "completion_review_condition_evidence_missing",
    })
  })

  it("does not allow a complete status when one requested condition remains uncertain", () => {
    const originalRequest = "SK하이닉스와 삼성전자의 현재 주가를 알려줘"
    const preview = "SK하이닉스 현재가는 295,000원입니다."
    const completionConditions = [
      "SK하이닉스 현재가와 기준 시각이 검증됨",
      "삼성전자 현재가와 기준 시각이 검증됨",
    ]
    const expectedConditions = buildCompletionReviewExpectedConditions([...completionConditions])
    const review = completeReview(
      assessments(),
      expectedConditions.map((condition, index) => ({
        conditionId: condition.conditionId,
        verdict: index === 0 ? "satisfied" : "uncertain",
        evidenceRefs: [evidenceRef],
        uncertainty: index === 0 ? "" : "삼성전자 현재가 evidence가 없습니다.",
        reason: index === 0 ? "첫 번째 종목 검증 완료" : "두 번째 종목 미검증",
      })),
    )

    expect(
      evaluateCompletionReviewCriterionGate({
        review,
        allowedEvidenceRefs: [evidenceRef],
        expectedConditions,
      }),
    ).toEqual({
      ok: false,
      reasonCode: "completion_review_condition_not_satisfied",
    })

    const contextReceipt = buildCompletionReviewContextReceipt({
      originalRequest,
      latestAssistantMessage: preview,
      successfulTools: evidence,
      completionConditions,
    })
    expect(
      buildCanonicalCompletionOutcomeDescriptor({
        runId: "run:task027:partial-multi-condition",
        review: { ...review, contextReceipt },
        requiresLlmResultDiagnosis: true,
        expectedLlmDiagnosisContext: contextReceipt,
        expectedLlmDiagnosisConditions: expectedConditions,
        state: completeState,
        application: {
          kind: "complete",
          summary: "done",
          persistedText: preview,
          statusText: "done",
        },
        preview,
      }),
    ).toEqual({
      ok: false,
      reasonCode: "canonical_completion_review_condition_not_satisfied",
    })
  })

  it("requires criterion-level diagnosis at the canonical tool-backed completion gate", () => {
    const originalRequest = "SK하이닉스와 삼성전자의 현재 주가를 알려줘"
    const preview = "SK하이닉스 현재가는 295,000원입니다."
    const contextReceipt = buildCompletionReviewContextReceipt({
      originalRequest,
      latestAssistantMessage: preview,
      successfulTools: evidence,
    })

    expect(
      buildCanonicalCompletionOutcomeDescriptor({
        runId: "run:task027:missing-criteria",
        review: { ...completeReview(undefined), contextReceipt },
        requiresLlmResultDiagnosis: true,
        expectedLlmDiagnosisContext: contextReceipt,
        state: completeState,
        application: {
          kind: "complete",
          summary: "done",
          persistedText: preview,
          statusText: "done",
        },
        preview,
      }),
    ).toEqual({
      ok: false,
      reasonCode: "canonical_completion_review_criteria_missing",
    })
  })

  it("records criterion evidence mapping in the canonical verification receipt", () => {
    const originalRequest = "SK하이닉스 현재가를 알려줘"
    const preview = "SK하이닉스 현재가는 295,000원입니다."
    const contextReceipt = buildCompletionReviewContextReceipt({
      originalRequest,
      latestAssistantMessage: preview,
      successfulTools: evidence,
    })
    const built = buildCanonicalCompletionOutcomeDescriptor({
      runId: "run:task027:evidence-map",
      review: {
        ...completeReview(assessments()),
        contextReceipt,
      },
      requiresLlmResultDiagnosis: true,
      expectedLlmDiagnosisContext: contextReceipt,
      state: completeState,
      application: {
        kind: "complete",
        summary: "done",
        persistedText: preview,
        statusText: "done",
      },
      preview,
    })

    expect(built).toMatchObject({
      ok: true,
      descriptor: {
        receipt: {
          evidence: {
            criterionEvidenceRefs: [...COMPLETION_REVIEW_CRITERION_KEYS]
              .sort()
              .map((criterionKey) => ({
                criterionKey,
                evidenceRefs: [evidenceRef],
              })),
          },
        },
      },
    })
  })
})
