import { describe, expect, it } from "vitest"
import type { LlmResultDiagnosisRecord } from "../packages/core/src/contracts/work-record.ts"
import { validateYeonjangGoalWithLlm } from "../packages/core/src/yeonjang/goal-validation.ts"

function diagnosis(overrides: Partial<LlmResultDiagnosisRecord> = {}): LlmResultDiagnosisRecord {
  return {
    diagnosis_summary: "The observed result satisfies the user's requested outcome.",
    sufficiency: "sufficient",
    missing_information: [],
    conflicts: [],
    risk: "low",
    risks: [],
    confidence: "high",
    recommended_action: "final_report",
    reason: "The sanitized evidence shows the requested state.",
    ...overrides,
  }
}

const baseInput = {
  ownerAgentName: "노비",
  workId: "work-067",
  stepId: "step-click",
  toolName: "mouse_click",
  userRequestSummary: "설정 화면의 다음 버튼을 누른다.",
  expectedOutput: "다음 단계로 이동했다는 증거가 있어야 한다.",
  publicToolOutput: "마우스 클릭 command accepted.",
  sanitizedObservedStateSummary: "pre_cursor=(10,20), post_cursor=(100,200), screen_summary=next step visible",
  evidenceRefs: ["operation-evidence:post-state:cursor", "artifact:screen-summary:next-step"],
}

describe("Task 067 Yeonjang LLM goal validation use-case", () => {
  it("creates a goal_validated post-check only from sufficient final_report result diagnosis", async () => {
    const result = await validateYeonjangGoalWithLlm({
      ...baseInput,
      provider: {
        diagnoseRequest: () => {
          throw new Error("unused")
        },
        diagnoseResult: () => diagnosis(),
      },
    })

    expect(result).toMatchObject({
      status: "validated",
      postCheck: {
        kind: "goal_validated",
        verified: true,
        diagnosisReceiptId: "diagnosis:work-067:step-click:result",
        diagnosisTarget: "result_diagnosis",
        diagnosisSubjectKind: "tool_result",
        evidenceRefs: ["operation-evidence:post-state:cursor", "artifact:screen-summary:next-step"],
      },
    })
  })

  it("does not validate when result diagnosis recommends retry", async () => {
    const result = await validateYeonjangGoalWithLlm({
      ...baseInput,
      provider: {
        diagnoseRequest: () => {
          throw new Error("unused")
        },
        diagnoseResult: () => diagnosis({
          sufficiency: "partial",
          recommended_action: "retry",
          missing_information: ["The screen did not show the next step."],
        }),
      },
    })

    expect(result).toMatchObject({
      status: "not_validated",
      reasonCode: "result_diagnosis_not_sufficient",
    })
  })

  it("does not validate when provider output is invalid", async () => {
    const result = await validateYeonjangGoalWithLlm({
      ...baseInput,
      provider: {
        diagnoseRequest: () => {
          throw new Error("unused")
        },
        diagnoseResult: () => ({ status: "ok" }),
      },
    })

    expect(result).toMatchObject({
      status: "not_validated",
      reasonCode: "result_diagnosis_invalid",
    })
  })
})
