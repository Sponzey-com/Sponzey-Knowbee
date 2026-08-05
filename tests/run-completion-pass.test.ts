import { describe, expect, it } from "vitest"
import { runCompletionPass } from "../packages/core/src/runs/completion-pass.ts"
import { createRecoveryBudgetUsage } from "../packages/core/src/runs/recovery-budget.ts"

const baseExecutionSemantics = {
  filesystemEffect: "none",
  privilegedOperation: "none",
  artifactDelivery: "none",
  approvalRequired: false,
  approvalTool: "none",
} as const

describe("run completion pass", () => {
  it("returns complete application for successful reviews", () => {
    const result = runCompletionPass({
      goalId: "run:complete",
      review: {
        status: "complete",
        summary: "완료되었습니다.",
        reason: "모든 작업이 끝났습니다.",
        remainingItems: [],
      },
      executionSemantics: baseExecutionSemantics,
      preview: "안녕",
      deliveryOutcome: {
        directArtifactDeliveryRequested: false,
        hasSuccessfulArtifactDelivery: false,
        deliverySatisfied: false,
        requiresDirectArtifactRecovery: false,
      },
      successfulTools: [],
      sawRealFilesystemMutation: false,
      requiresFilesystemMutation: false,
      truncatedOutputRecoveryAttempted: false,
      originalRequest: "인사해줘",
      recoveryBudgetUsage: createRecoveryBudgetUsage(),
      delegationTurnCount: 0,
      maxDelegationTurns: 5,
      defaultMaxDelegationTurns: 5,
      followupAlreadySeen: false,
    })

    expect(result.state.interpretationStatus).toBe("satisfied")
    expect(result.state.executionStatus).toBe("satisfied")
    expect(result.state.deliveryStatus).toBe("not_required")
    expect(result.state.recoveryStatus).toBe("settled")
    expect(result.decision.kind).toBe("complete")
    expect(result.application.kind).toBe("complete")
    expect(result.stopDecision).toMatchObject({ status: "stop_and_report", reasonCode: "goal_achieved" })
  })

  it("returns stop application for duplicated followup prompts", () => {
    const result = runCompletionPass({
      goalId: "run:duplicate",
      review: {
        status: "followup",
        summary: "추가 작업이 필요합니다.",
        reason: "남은 항목이 있습니다.",
        followupPrompt: "남은 파일만 생성하세요.",
        remainingItems: ["남은 파일 생성"],
      },
      executionSemantics: baseExecutionSemantics,
      preview: "부분 완료",
      deliveryOutcome: {
        directArtifactDeliveryRequested: false,
        hasSuccessfulArtifactDelivery: false,
        deliverySatisfied: false,
        requiresDirectArtifactRecovery: false,
      },
      successfulTools: [],
      sawRealFilesystemMutation: false,
      requiresFilesystemMutation: false,
      truncatedOutputRecoveryAttempted: false,
      originalRequest: "남은 파일을 만들어줘",
      recoveryBudgetUsage: createRecoveryBudgetUsage(),
      delegationTurnCount: 1,
      maxDelegationTurns: 5,
      defaultMaxDelegationTurns: 5,
      followupAlreadySeen: true,
    })

    expect(result.decision.kind).toBe("followup")
    expect(result.application.kind).toBe("stop")
  })

  it("returns execution retry for truncated output reviews", () => {
    const result = runCompletionPass({
      goalId: "run:truncated",
      review: {
        status: "ask_user",
        summary: "중간에 끊겨서 미완성입니다.",
        reason: "출력이 중간에 끊겼습니다.",
        userMessage: "계속할까요?",
        remainingItems: ["남은 항목 처리"],
      },
      executionSemantics: {
        ...baseExecutionSemantics,
        filesystemEffect: "mutate",
      },
      preview: "부분 코드",
      deliveryOutcome: {
        directArtifactDeliveryRequested: false,
        hasSuccessfulArtifactDelivery: false,
        deliverySatisfied: false,
        requiresDirectArtifactRecovery: false,
      },
      successfulTools: [],
      sawRealFilesystemMutation: true,
      requiresFilesystemMutation: true,
      truncatedOutputRecoveryAttempted: false,
      originalRequest: "코드를 끝까지 완성해줘",
      recoveryBudgetUsage: createRecoveryBudgetUsage(),
      delegationTurnCount: 1,
      maxDelegationTurns: 5,
      defaultMaxDelegationTurns: 5,
      followupAlreadySeen: false,
    })

    expect(result.decision.kind).toBe("retry_truncated")
    expect(result.application.kind).toBe("retry")
    if (result.application.kind === "retry") {
      expect(result.application.budgetKind).toBe("execution")
    }
  })

  it("keeps retrying past the legacy delegation turn boundary", () => {
    const result = runCompletionPass({
      goalId: "run:bounded",
      review: { status: "followup", summary: "남음", reason: "추가 작업", followupPrompt: "계속", remainingItems: ["work"] },
      executionSemantics: baseExecutionSemantics,
      preview: "부분 완료",
      deliveryOutcome: { directArtifactDeliveryRequested: false, hasSuccessfulArtifactDelivery: false, deliverySatisfied: false, requiresDirectArtifactRecovery: false },
      successfulTools: [],
      sawRealFilesystemMutation: false,
      requiresFilesystemMutation: false,
      truncatedOutputRecoveryAttempted: false,
      originalRequest: "완료해줘",
      recoveryBudgetUsage: createRecoveryBudgetUsage(),
      delegationTurnCount: 5,
      maxDelegationTurns: 5,
      defaultMaxDelegationTurns: 5,
      followupAlreadySeen: false,
    })

    expect(result.stopDecision).toEqual({ status: "continue", nextTurn: 6 })
    expect(result.application).toMatchObject({ kind: "retry" })
  })

  it("clears inherited tool requirements for a response-only follow-up", () => {
    const result = runCompletionPass({
      goalId: "run:response-only",
      review: {
        status: "followup",
        summary: "기존 근거로 답변을 보완합니다.",
        reason: "표현만 보완하면 됩니다.",
        followupPrompt: "기존 근거로 최종 답변을 작성하세요.",
        followupEvidenceRefs: ["tool-result:web:current"],
        followupExecutionMode: "response_only",
        followupRequiredToolNames: [],
        remainingItems: ["최종 답변 표현 보완"],
      },
      executionSemantics: baseExecutionSemantics,
      preview: "부분 답변",
      deliveryOutcome: {
        directArtifactDeliveryRequested: false,
        hasSuccessfulArtifactDelivery: false,
        deliverySatisfied: false,
        requiresDirectArtifactRecovery: false,
      },
      successfulTools: [],
      sawRealFilesystemMutation: false,
      requiresFilesystemMutation: false,
      truncatedOutputRecoveryAttempted: false,
      originalRequest: "현재 값을 알려줘",
      recoveryBudgetUsage: createRecoveryBudgetUsage(),
      delegationTurnCount: 1,
      maxDelegationTurns: 5,
      defaultMaxDelegationTurns: 5,
      followupAlreadySeen: false,
    })

    expect(result.application).toMatchObject({
      kind: "retry",
      requiredToolNames: [],
      nextAttemptToolPolicy: {
        mode: "forbidden",
      },
    })
  })

  it("projects an exact required Tool policy for a tool follow-up", () => {
    const result = runCompletionPass({
      goalId: "run:tool-followup",
      review: {
        status: "followup",
        summary: "다른 출처 확인이 필요합니다.",
        reason: "현재 근거가 부족합니다.",
        followupPrompt: "선택된 출처를 한 번 더 확인하세요.",
        followupEvidenceRefs: ["tool-result:web:search"],
        followupExecutionMode: "tool",
        followupRequiredToolNames: ["web_fetch", "web_fetch"],
        followupTargetRefs: ["source:alternate"],
        remainingItems: ["대체 출처 확인"],
      },
      executionSemantics: baseExecutionSemantics,
      preview: "부분 답변",
      deliveryOutcome: {
        directArtifactDeliveryRequested: false,
        hasSuccessfulArtifactDelivery: false,
        deliverySatisfied: false,
        requiresDirectArtifactRecovery: false,
      },
      successfulTools: [],
      sawRealFilesystemMutation: false,
      requiresFilesystemMutation: false,
      truncatedOutputRecoveryAttempted: false,
      originalRequest: "현재 값을 알려줘",
      recoveryBudgetUsage: createRecoveryBudgetUsage(),
      delegationTurnCount: 1,
      maxDelegationTurns: 5,
      defaultMaxDelegationTurns: 5,
      followupAlreadySeen: false,
    })

    expect(result.application).toMatchObject({
      kind: "retry",
      requiredToolNames: ["web_fetch"],
      nextAttemptToolPolicy: {
        mode: "required",
        toolNames: ["web_fetch"],
      },
    })
  })
})
