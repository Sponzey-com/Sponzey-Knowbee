import { describe, expect, it } from "vitest"
import { createLlmDiagnosisReceipt } from "../packages/core/src/contracts/diagnosis-action-routing.ts"
import {
  aggregateDiagnosedResults,
  decideMandatoryResultReview,
  decideParentResultAction,
  normalizeResultReviewSubject,
  type NormalizedResultReviewSubject,
  type ParentResultAction,
  type ResultReviewSourceKind,
} from "../packages/core/src/contracts/result-review-decision.ts"
import type { LlmResultDiagnosisRecord, RecommendedAction } from "../packages/core/src/contracts/work-record.ts"
import { selectCanonicalAssistantFlow } from "../packages/core/src/runs/assistant-flow-finalization.ts"

function subject(
  sourceKind: ResultReviewSourceKind = "sub_agent_result",
  overrides: Partial<Omit<NormalizedResultReviewSubject, "schemaVersion" | "sourceKind">> = {},
): NormalizedResultReviewSubject {
  return normalizeResultReviewSubject({
    sourceKind,
    sourceRef: sourceKind === "tool_result" ? "tool:search:1" : sourceKind === "yeonjang_result" ? "yeonjang:desktop:1" : "result:child:1",
    sourceAgentName: "검증원",
    status: "completed",
    risk: "low",
    evidenceRefs: ["evidence:source:1"],
    missingItems: [],
    conflicts: [],
    risks: [],
    failureReasons: [],
    ...overrides,
  })
}

function diagnosis(
  recommended_action: RecommendedAction = "final_report",
  overrides: Partial<LlmResultDiagnosisRecord> = {},
): LlmResultDiagnosisRecord {
  return {
    diagnosis_summary: "The result was reviewed.",
    sufficiency: recommended_action === "final_report" ? "sufficient" : "insufficient",
    missing_information: [],
    conflicts: [],
    risk: "low",
    risks: [],
    confidence: "high",
    recommended_action,
    reason: "The selected action follows the result evidence.",
    ...overrides,
  }
}

function decision(
  normalized: NormalizedResultReviewSubject,
  resultDiagnosis: LlmResultDiagnosisRecord,
  aggregateRequested = false,
) {
  const receipt = createLlmDiagnosisReceipt({
    receiptId: `diagnosis:${normalized.sourceKind}:${normalized.sourceRef}`,
    target: "result_diagnosis",
    subjectKind: normalized.sourceKind,
    subjectPayload: normalized,
    diagnosis: resultDiagnosis,
  })
  return {
    receipt,
    parentDecision: decideParentResultAction({
      subject: normalized,
      diagnosis: resultDiagnosis,
      receipt,
      aggregateRequested,
    }),
  }
}

describe("task1225 mandatory result review and parent aggregation", () => {
  it.each<ResultReviewSourceKind>(["sub_agent_result", "tool_result", "yeonjang_result"])(
    "normalizes %s with the same review contract",
    (sourceKind) => {
      expect(subject(sourceKind)).toMatchObject({
        schemaVersion: 1,
        sourceKind,
        status: "completed",
        risk: "low",
        evidenceRefs: ["evidence:source:1"],
      })
    },
  )

  it("allows review to be optional only for an evidenced low-risk completed result", () => {
    expect(decideMandatoryResultReview({ subject: subject(), reviewConfigured: false })).toEqual({
      reviewRequired: false,
      reasonCodes: [],
    })
  })

  it.each([
    ["configured", subject(), true, "review_configured"],
    ["risk", subject("tool_result", { risk: "high" }), false, "risk_high"],
    ["partial", subject("sub_agent_result", { status: "partial" }), false, "status_partial"],
    ["missing evidence", subject("yeonjang_result", { evidenceRefs: [] }), false, "evidence_missing"],
    ["conflict", subject("tool_result", { conflicts: ["sources disagree"] }), false, "result_conflict_present"],
    ["failure", subject("yeonjang_result", { failureReasons: ["permission denied"] }), false, "result_failure_present"],
  ] as const)("requires review when %s is present", (_label, normalized, reviewConfigured, reasonCode) => {
    expect(decideMandatoryResultReview({ subject: normalized, reviewConfigured })).toMatchObject({
      reviewRequired: true,
      reasonCodes: expect.arrayContaining([reasonCode]),
    })
  })

  it.each([
    ["final_report", false, "accept"],
    ["final_report", true, "aggregate"],
    ["redelegate", false, "redelegate"],
    ["retry", false, "verify_more"],
    ["partial_report", false, "report_partial"],
    ["stop_blocked", false, "terminate"],
  ] as Array<[RecommendedAction, boolean, ParentResultAction]>)(
    "maps diagnosis action %s to parent action %s",
    (recommendedAction, aggregateRequested, expectedAction) => {
      const normalized = subject()
      const resultDiagnosis = diagnosis(recommendedAction)
      expect(decision(normalized, resultDiagnosis, aggregateRequested).parentDecision.action).toBe(expectedAction)
    },
  )

  it("rejects a stale diagnosis receipt after the result subject changes", () => {
    const original = subject()
    const resultDiagnosis = diagnosis()
    const { receipt } = decision(original, resultDiagnosis)
    expect(() => decideParentResultAction({
      subject: { ...original, conflicts: ["new conflict"] },
      diagnosis: resultDiagnosis,
      receipt,
    })).toThrow(/subject fingerprint does not match/)
  })

  it.each<ResultReviewSourceKind>(["tool_result", "yeonjang_result"])(
    "routes a diagnosed %s through the canonical assistant final flow",
    (sourceKind) => {
      const normalized = subject(sourceKind)
      const resultDiagnosis = diagnosis("final_report")
      const reviewed = decision(normalized, resultDiagnosis)
      expect(selectCanonicalAssistantFlow({
        subjectPayload: normalized,
        diagnosis: resultDiagnosis,
        receipt: reviewed.receipt,
        requestedFlow: "standard",
      })).toMatchObject({
        flow: "final_reporting",
        diagnosisTarget: "result_diagnosis",
        diagnosisReceiptId: reviewed.receipt.receiptId,
      })
      expect(reviewed.parentDecision.action).toBe("accept")
    },
  )

  it("preserves attribution, conflicts, uncertainty, missing evidence, risk, and failure reasons", () => {
    const accepted = subject("sub_agent_result", { sourceRef: "result:child:accepted" })
    const limited = subject("tool_result", {
      sourceRef: "tool:search:limited",
      status: "partial",
      conflicts: ["date values conflict"],
      missingItems: ["primary source"],
      risks: ["stale result"],
      failureReasons: ["secondary endpoint failed"],
    })
    const acceptedDiagnosis = diagnosis("final_report")
    const limitedDiagnosis = diagnosis("partial_report", {
      sufficiency: "partial",
      conflicts: ["provider conflict"],
      missing_information: ["publication timestamp"],
      risk: "medium",
      risks: ["source freshness"],
      confidence: "low",
    })
    const acceptedDecision = decision(accepted, acceptedDiagnosis, true)
    const limitedDecision = decision(limited, limitedDiagnosis, true)

    const aggregate = aggregateDiagnosedResults([
      {
        subject: accepted,
        diagnosis: acceptedDiagnosis,
        ...acceptedDecision,
        confirmedClaims: [{ text: "Verified claim", sourceRef: accepted.sourceRef, evidenceRefs: ["evidence:source:1"] }],
      },
      {
        subject: limited,
        diagnosis: limitedDiagnosis,
        ...limitedDecision,
        confirmedClaims: [{ text: "Partial claim", sourceRef: limited.sourceRef, evidenceRefs: ["evidence:source:1"] }],
      },
    ])

    expect(aggregate).toMatchObject({
      finalizationEligible: false,
      nextAction: "report_partial",
      sourceRefs: ["result:child:accepted", "tool:search:limited"],
    })
    expect(aggregate.conflicts.map((item) => item.text)).toEqual(expect.arrayContaining(["date values conflict", "provider conflict"]))
    expect(aggregate.uncertainties).toContainEqual({ text: "low", sourceRef: "tool:search:limited" })
    expect(aggregate.missingItems.map((item) => item.text)).toEqual(expect.arrayContaining(["primary source", "publication timestamp"]))
    expect(aggregate.risks.map((item) => item.text)).toEqual(expect.arrayContaining(["stale result", "medium", "source freshness"]))
    expect(aggregate.failureReasons).toContainEqual({ text: "secondary endpoint failed", sourceRef: "tool:search:limited" })
  })

  it("rejects claims without evidence instead of losing their provenance", () => {
    const normalized = subject()
    const resultDiagnosis = diagnosis()
    const reviewed = decision(normalized, resultDiagnosis)
    expect(() => aggregateDiagnosedResults([{
      subject: normalized,
      diagnosis: resultDiagnosis,
      ...reviewed,
      confirmedClaims: [{ text: "Unsupported claim", sourceRef: normalized.sourceRef, evidenceRefs: [] }],
    }])).toThrow(/claims require evidence references/)
  })
})
