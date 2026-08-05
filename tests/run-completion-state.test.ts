import { describe, expect, it } from "vitest"
import {
  deriveCompletionEvidenceState,
  deriveCompletionStageState,
} from "../packages/core/src/runs/completion-state.ts"

const baseExecutionSemantics = {
  filesystemEffect: "none",
  privilegedOperation: "none",
  artifactDelivery: "none",
  approvalRequired: false,
  approvalTool: "none",
} as const

describe("completion state", () => {
  it("does not treat a successful tool receipt as completion evidence by itself", () => {
    const result = deriveCompletionEvidenceState({
      executionSemantics: baseExecutionSemantics,
      preview: "",
      deliverySatisfied: false,
      successfulTools: [{ toolName: "stock_lookup", output: "request accepted" }],
      sawRealFilesystemMutation: false,
    })

    expect(result).toEqual({
      executionSatisfied: false,
      deliveryRequired: false,
      deliverySatisfied: true,
      completionSatisfied: false,
      conflictReason: "명확한 실행 근거가 확인되지 않았습니다.",
    })
  })

  it("treats text-only replies as completed execution when no direct delivery is required", () => {
    const result = deriveCompletionEvidenceState({
      executionSemantics: baseExecutionSemantics,
      preview: "인사를 보냈습니다.",
      deliverySatisfied: false,
      successfulTools: [],
      sawRealFilesystemMutation: false,
    })

    expect(result).toEqual({
      executionSatisfied: true,
      deliveryRequired: false,
      deliverySatisfied: true,
      completionSatisfied: true,
    })
  })

  it("treats LLM goal-validated Yeonjang evidence as execution evidence", () => {
    const result = deriveCompletionStageState({
      review: {
        status: "complete",
        summary: "목표 달성",
        reason: "LLM result diagnosis가 목표 달성을 검증했습니다.",
        remainingItems: [],
      },
      executionSemantics: baseExecutionSemantics,
      preview: "",
      deliverySatisfied: false,
      successfulTools: [{
        toolName: "mouse_click",
        output: "목표 검증 완료",
        details: {
          via: "yeonjang",
          evidence: {
            schemaVersion: "yeonjang-evidence-v1",
            postCheck: {
              kind: "goal_validated",
              diagnosisReceiptId: "diagnosis:work:root:run-074:executing:result",
            },
          },
        },
      }],
      sawRealFilesystemMutation: false,
      requiresFilesystemMutation: false,
      truncatedOutputRecoveryAttempted: false,
    })

    expect(result.executionStatus).toBe("satisfied")
    expect(result.interpretationStatus).toBe("satisfied")
    expect(result.recoveryStatus).toBe("settled")
    expect(result.completionSatisfied).toBe(true)
  })

  it("requires direct artifact delivery without treating the tool receipt as execution evidence", () => {
    const result = deriveCompletionEvidenceState({
      executionSemantics: {
        ...baseExecutionSemantics,
        artifactDelivery: "direct",
      },
      preview: "스크린샷을 만들었습니다.",
      deliverySatisfied: false,
      successfulTools: [{ toolName: "screencapture", output: "saved capture" }],
      sawRealFilesystemMutation: false,
    })

    expect(result).toEqual({
      executionSatisfied: false,
      deliveryRequired: true,
      deliverySatisfied: false,
      completionSatisfied: false,
      conflictReason: "명확한 실행 근거가 확인되지 않았습니다.",
    })
  })

  it("marks completion satisfied when direct delivery succeeds", () => {
    const result = deriveCompletionEvidenceState({
      executionSemantics: {
        ...baseExecutionSemantics,
        artifactDelivery: "direct",
      },
      preview: "스크린샷을 보냈습니다.",
      deliverySatisfied: true,
      successfulTools: [{ toolName: "screencapture", output: "saved capture" }],
      sawRealFilesystemMutation: false,
    })

    expect(result).toEqual({
      executionSatisfied: true,
      deliveryRequired: true,
      deliverySatisfied: true,
      completionSatisfied: true,
    })
  })

  it("splits completion into interpretation/execution/delivery/recovery axes", () => {
    const result = deriveCompletionStageState({
      review: {
        status: "followup",
        summary: "추가 작업 필요",
        reason: "남은 파일이 있습니다.",
        remainingItems: ["남은 파일 생성"],
        followupPrompt: "남은 파일만 생성하세요.",
      },
      executionSemantics: {
        ...baseExecutionSemantics,
        artifactDelivery: "direct",
      },
      preview: "스크린샷을 만들었습니다.",
      deliverySatisfied: false,
      successfulTools: [{ toolName: "screencapture", output: "saved capture" }],
      sawRealFilesystemMutation: false,
      requiresFilesystemMutation: false,
      truncatedOutputRecoveryAttempted: false,
    })

    expect(result).toEqual({
      executionSatisfied: false,
      deliveryRequired: true,
      deliverySatisfied: false,
      completionSatisfied: false,
      conflictReason: "completion review가 추가 follow-up 작업을 요구합니다.",
      interpretationStatus: "followup_required",
      executionStatus: "missing",
      deliveryStatus: "missing",
      recoveryStatus: "required",
      checklist: {
        items: [
          { key: "request", status: "completed" },
          { key: "execution", status: "pending", reason: "명확한 실행 근거가 확인되지 않았습니다." },
          { key: "delivery", status: "pending", reason: "요청된 직접 결과 전달이 아직 완료되지 않았습니다." },
          { key: "completion", status: "pending", reason: "completion review가 추가 follow-up 작업을 요구합니다." },
        ],
        completedCount: 1,
        actionableCount: 4,
        pendingCount: 3,
      },
      blockingReasons: [
        "completion review가 추가 follow-up 작업을 요구합니다.",
        "명확한 실행 근거가 확인되지 않았습니다.",
        "요청된 직접 결과 전달이 아직 완료되지 않았습니다.",
      ],
    })
  })
})
