import { describe, expect, it } from "vitest"
import {
  buildSideEffectOperationIdentity,
  buildSideEffectOperationReceipt,
  type SideEffectOperationReceipt,
} from "../packages/core/src/contracts/side-effect-operation.ts"
import type { LlmResultDiagnosisRecord } from "../packages/core/src/contracts/work-record.ts"
import type { SideEffectOperationAggregate } from "../packages/core/src/runs/side-effect-operation-use-case.ts"
import { validateYeonjangSideEffectGoal } from "../packages/core/src/yeonjang/side-effect-goal-validation.ts"

function diagnosis(overrides: Partial<LlmResultDiagnosisRecord> = {}): LlmResultDiagnosisRecord {
  return {
    diagnosis_summary: "The side effect completed the user goal.",
    sufficiency: "sufficient",
    missing_information: [],
    conflicts: [],
    risk: "low",
    risks: [],
    confidence: "high",
    recommended_action: "final_report",
    reason: "The sanitized public evidence satisfies the expected output.",
    ...overrides,
  }
}

const identity = buildSideEffectOperationIdentity({
  runId: "run-068",
  workId: "work-068",
  stepKey: "step-click",
  adapterId: "tool:mouse_click",
  targetFingerprint: `sha256:${"a".repeat(64)}`,
  paramsFingerprint: `sha256:${"b".repeat(64)}`,
})

function receipt(event: SideEffectOperationReceipt["event"], revision: number, ref: string) {
  return buildSideEffectOperationReceipt({
    identity,
    event,
    operationRevision: revision,
    evidenceFingerprint: `sha256:${revision.toString(16).repeat(64).slice(0, 64)}`,
    evidenceRefs: [ref],
    issuedAt: revision,
  })
}

const receipts = [
  receipt("START_EFFECT", 1, "policy:allow:068"),
  receipt("RECORD_EFFECT", 2, "operation-evidence:record-effect:068"),
  receipt("BEGIN_VERIFICATION", 3, "operation-evidence:begin-verification:068"),
  receipt("VERIFICATION_FAILED", 4, "operation-evidence:verification-failed:068"),
  receipt("MARK_MANUAL", 5, "operation-evidence:mark-manual:068"),
]

const operation: SideEffectOperationAggregate = {
  identity,
  state: "MANUAL_INTERVENTION",
  revision: 5,
  transitions: [
    { revision: 1, previousState: "RESERVED", event: "START_EFFECT", nextState: "EFFECT_STARTED", receiptRef: receipts[0].receiptId },
    { revision: 2, previousState: "EFFECT_STARTED", event: "RECORD_EFFECT", nextState: "EFFECT_RECORDED", receiptRef: receipts[1].receiptId },
    { revision: 3, previousState: "EFFECT_RECORDED", event: "BEGIN_VERIFICATION", nextState: "VERIFYING", receiptRef: receipts[2].receiptId },
    { revision: 4, previousState: "VERIFYING", event: "VERIFICATION_FAILED", nextState: "VERIFY_FAILED", receiptRef: receipts[3].receiptId },
    { revision: 5, previousState: "VERIFY_FAILED", event: "MARK_MANUAL", nextState: "MANUAL_INTERVENTION", receiptRef: receipts[4].receiptId },
  ],
}

const baseInput = {
  operation,
  loadReceipt: (receiptId: string) => receipts.find((item) => item.receiptId === receiptId),
  ownerAgentName: "노비",
  toolName: "mouse_click",
  methodIds: ["mouse.click"],
  group: "input",
  riskLevel: "moderate" as const,
  requiresApproval: true,
  targetRef: "yeonjang-main",
  userRequestSummary: "다음 버튼을 클릭한다.",
  expectedOutput: "설정 화면이 다음 단계로 이동해야 한다.",
  publicToolOutput: "마우스 클릭 command accepted.",
  sanitizedObservedStateSummary: "pre/post cursor observed; screen summary indicates next step",
  collectedAt: 68,
}

describe("Task 068 Yeonjang side-effect goal validation service", () => {
  it("creates normalized Yeonjang evidence from a manual side-effect operation and LLM goal validation", async () => {
    const result = await validateYeonjangSideEffectGoal({
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
      evidence: {
        schemaVersion: "yeonjang-evidence-v1",
        targetRef: "yeonjang-main",
        toolName: "mouse_click",
        methodIds: ["mouse.click"],
        group: "input",
        riskLevel: "moderate",
        requiresApproval: true,
        collectedAt: 68,
        postCheck: {
          kind: "goal_validated",
          verified: true,
          diagnosisReceiptId: "diagnosis:work-068:step-click:result",
          evidenceRefs: [
            "policy:allow:068",
            "operation-evidence:record-effect:068",
            "operation-evidence:begin-verification:068",
            "operation-evidence:verification-failed:068",
            "operation-evidence:mark-manual:068",
          ],
        },
        rawPayloadVisibility: "audit_only",
      },
    })
  })

  it("does not validate non-manual operations", async () => {
    const result = await validateYeonjangSideEffectGoal({
      ...baseInput,
      operation: { ...operation, state: "VERIFIED" },
      provider: {
        diagnoseRequest: () => null,
        diagnoseResult: () => diagnosis(),
      },
    })

    expect(result).toEqual({
      status: "not_validated",
      reasonCode: "side_effect_operation_not_manual",
    })
  })

  it("does not validate when LLM diagnosis cannot prove the goal", async () => {
    const result = await validateYeonjangSideEffectGoal({
      ...baseInput,
      provider: {
        diagnoseRequest: () => null,
        diagnoseResult: () => diagnosis({
          sufficiency: "partial",
          recommended_action: "retry",
          missing_information: ["Next step is not visible."],
        }),
      },
    })

    expect(result).toEqual({
      status: "not_validated",
      reasonCode: "llm_goal_validation_failed",
      detail: "result_diagnosis_not_sufficient",
    })
  })
})
