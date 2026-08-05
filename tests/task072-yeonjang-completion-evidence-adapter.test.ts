import { describe, expect, it } from "vitest"
import { buildCompletionReviewEvidenceBlock } from "../packages/core/src/agent/completion-review.ts"
import {
  buildYeonjangEvidenceEnvelope,
  buildYeonjangGoalValidatedPostCheck,
} from "../packages/core/src/yeonjang/evidence.ts"
import { buildSuccessfulToolEvidenceFromYeonjangGoalValidation } from "../packages/core/src/yeonjang/completion-evidence-adapter.ts"
import { evaluateSuccessfulToolEvidenceTrust } from "../packages/core/src/runs/recovery.ts"

const evidence = buildYeonjangEvidenceEnvelope({
  targetRef: "yeonjang-main",
  toolName: "mouse_click",
  methodIds: ["mouse.click"],
  group: "input",
  riskLevel: "moderate",
  requiresApproval: true,
  summary: "mouse_click goal validated by LLM result diagnosis.",
  postCheck: buildYeonjangGoalValidatedPostCheck({
    diagnosisReceiptId: "diagnosis:work-072:step-click:result",
    diagnosisSubjectKind: "tool_result",
    evidenceRefs: ["operation-evidence:mark-manual:072"],
  }),
  collectedAt: 72,
})

describe("Task 072 Yeonjang completion evidence adapter", () => {
  it("converts validated Yeonjang evidence into trusted SuccessfulToolEvidence", () => {
    const item = buildSuccessfulToolEvidenceFromYeonjangGoalValidation({
      evidence,
      output: "목표 검증 완료",
    })

    expect(item).toMatchObject({
      toolName: "mouse_click",
      output: "목표 검증 완료",
      details: {
        via: "yeonjang",
        evidence,
      },
      evidenceSource: {
        sourceKind: "yeonjang",
        trustClass: "untrusted_external",
        instructionIsolation: "data_only",
      },
    })
    expect(item.evidenceSource?.sourceRef).toMatch(/^tool-result:yeonjang:[a-f0-9]{64}$/u)
    expect(evaluateSuccessfulToolEvidenceTrust(item)).toMatchObject({
      allowed: true,
      reasonCode: "tool_evidence_data_only",
    })
  })

  it("feeds completion review with normalized evidence and not manual raw details", () => {
    const item = buildSuccessfulToolEvidenceFromYeonjangGoalValidation({
      evidence,
      output: "목표 검증 완료",
    })
    const block = buildCompletionReviewEvidenceBlock([{
      ...item,
      details: {
        ...item.details as Record<string, unknown>,
        rawManualDetails: "do-not-project",
        rawObservedState: { preCursor: "do-not-project", postCursor: "do-not-project" },
      },
    }])

    expect(block).toContain("yeonjang_evidence")
    expect(block).toContain("goal_validated")
    expect(block).toContain("mouse.click")
    expect(block).not.toContain("rawManualDetails")
    expect(block).not.toContain("rawObservedState")
    expect(block).not.toContain("do-not-project")
  })
})
