import { describe, expect, it } from "vitest"
import type { SuccessfulToolEvidence } from "../packages/core/src/runs/recovery.ts"
import {
  validateAndAppendYeonjangSideEffectGoalValidationEvidence,
  type YeonjangSideEffectGoalValidationCandidate,
} from "../packages/core/src/yeonjang/side-effect-goal-validation-review.ts"
import {
  buildYeonjangEvidenceEnvelope,
  buildYeonjangGoalValidatedPostCheck,
} from "../packages/core/src/yeonjang/evidence.ts"

const RAW_URL = "https://example.test/dashboard?token=private"

const browserCandidate: YeonjangSideEffectGoalValidationCandidate = {
  toolName: "yeonjang_browser_open_url",
  output: [
    '연장 "yeonjang-main" 브라우저 URL 열기 요청이 전달되었습니다.',
    "scheme=https",
    "사후검증: LLM 목표 검증 필요",
    "reason=llm_goal_validation_required",
  ].join("\n"),
  details: {
    kind: "side_effect_manual_intervention",
    operationId: "operation:browser-open-url-109",
    reasonCode: "side_effect_irreversible",
    goalValidationCandidate: true,
    rawObservedState: {
      url: RAW_URL,
      receiptPayload: { url: RAW_URL },
    },
  },
}

describe("Task 109 browser.open_url LLM goal validation review", () => {
  it("passes only sanitized browser.open_url context to runtime goal validation", async () => {
    const successfulTools: SuccessfulToolEvidence[] = []
    const validationInputs: unknown[] = []

    const result = await validateAndAppendYeonjangSideEffectGoalValidationEvidence({
      db: {} as never,
      provider: {
        diagnoseRequest: () => null,
        diagnoseResult: () => null,
      },
      runId: "run-109",
      ownerAgentName: "마당쇠",
      originalRequest: "원격 컴퓨터 브라우저로 대시보드를 열어줘.",
      completionConditions: ["대시보드가 브라우저에서 열려야 한다."],
      candidates: [browserCandidate],
      successfulTools,
      resolveToolMetadata: () => ({
        methodIds: ["browser.open_url"],
        group: "browser",
        riskLevel: "moderate",
        requiresApproval: true,
      }),
      validateRuntimeGoal: async (input) => {
        validationInputs.push(input)
        expect(JSON.stringify(input)).not.toContain(RAW_URL)
        expect(JSON.stringify(input)).not.toContain("token=private")
        expect(input).toMatchObject({
          toolName: "yeonjang_browser_open_url",
          methodIds: ["browser.open_url"],
          group: "browser",
          riskLevel: "moderate",
          requiresApproval: true,
          publicToolOutput: browserCandidate.output,
        })
        return {
          status: "validated",
          publicSummary: {
            operationId: "operation:browser-open-url-109",
            runId: "run-109",
            workId: "work:root:run-109",
            adapterId: "tool:yeonjang_browser_open_url",
            state: "MANUAL_INTERVENTION",
            revision: 5,
            transitionCount: 5,
          },
          evidence: buildYeonjangEvidenceEnvelope({
            targetRef: "tool:yeonjang_browser_open_url:side-effect-goal",
            toolName: "yeonjang_browser_open_url",
            methodIds: ["browser.open_url"],
            group: "browser",
            riskLevel: "moderate",
            requiresApproval: true,
            summary: "yeonjang_browser_open_url goal validated by LLM result diagnosis.",
            postCheck: buildYeonjangGoalValidatedPostCheck({
              diagnosisReceiptId: "diagnosis:work:root:run-109:executing:result",
              diagnosisSubjectKind: "tool_result",
              evidenceRefs: ["operation-evidence:mark_manual:109"],
            }),
            collectedAt: 109,
          }),
        }
      },
    })

    expect(result).toEqual({ added: 1, skipped: [] })
    expect(validationInputs).toHaveLength(1)
    expect(successfulTools).toHaveLength(1)
    expect(successfulTools[0]).toMatchObject({
      toolName: "yeonjang_browser_open_url",
      details: {
        via: "yeonjang",
        evidence: {
          schemaVersion: "yeonjang-evidence-v1",
          rawPayloadVisibility: "audit_only",
          postCheck: {
            kind: "goal_validated",
            diagnosisReceiptId: "diagnosis:work:root:run-109:executing:result",
          },
        },
      },
      evidenceSource: {
        sourceKind: "yeonjang",
        trustClass: "untrusted_external",
        instructionIsolation: "data_only",
      },
    })
    expect(JSON.stringify(successfulTools)).not.toContain(RAW_URL)
    expect(JSON.stringify(successfulTools)).not.toContain("token=private")
  })

  it("does not append browser.open_url evidence when runtime diagnosis is insufficient", async () => {
    const successfulTools: SuccessfulToolEvidence[] = []

    const result = await validateAndAppendYeonjangSideEffectGoalValidationEvidence({
      db: {} as never,
      provider: {
        diagnoseRequest: () => null,
        diagnoseResult: () => null,
      },
      runId: "run-109",
      ownerAgentName: "마당쇠",
      originalRequest: "원격 컴퓨터 브라우저로 대시보드를 열어줘.",
      completionConditions: ["대시보드가 브라우저에서 열려야 한다."],
      candidates: [browserCandidate],
      successfulTools,
      resolveToolMetadata: () => ({
        methodIds: ["browser.open_url"],
        group: "browser",
        riskLevel: "moderate",
        requiresApproval: true,
      }),
      validateRuntimeGoal: async () => ({
        status: "not_validated",
        reasonCode: "llm_goal_validation_failed",
        detail: "result_diagnosis_insufficient",
      }),
    })

    expect(result).toEqual({
      added: 0,
      skipped: [{
        toolName: "yeonjang_browser_open_url",
        reasonCode: "candidate_not_validated",
        detail: "llm_goal_validation_failed",
      }],
    })
    expect(successfulTools).toEqual([])
  })
})
