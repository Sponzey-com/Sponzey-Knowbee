import { describe, expect, it } from "vitest"
import { decideReviewGate } from "../packages/core/src/runs/review-gate.ts"

const baseExecutionSemantics = {
  filesystemEffect: "none",
  artifactDelivery: "direct",
  approvalRequired: false,
  approvalTool: "none",
  privilegedOperation: "none",
} as const

describe("review gate", () => {
  it("runs LLM review after verified camera capture even when direct delivery is already satisfied", () => {
    const decision = decideReviewGate({
      executionSemantics: {
        filesystemEffect: "create_or_modify",
        artifactDelivery: "direct",
        approvalRequired: true,
        approvalTool: "yeonjang_camera_capture",
        privilegedOperation: "camera_capture",
      },
      preview: "",
      deliveryOutcome: {
        mode: "direct_artifact",
        directArtifactDeliveryRequested: true,
        hasSuccessfulArtifactDelivery: true,
        deliverySatisfied: true,
        requiresDirectArtifactRecovery: false,
      },
      successfulTools: [{
        toolName: "yeonjang_camera_capture",
        output: "camera artifact captured",
        details: {
          via: "yeonjang",
          evidence: {
            schemaVersion: "yeonjang-evidence-v1",
            postCheck: { kind: "verified", verified: true },
          },
        },
      }],
      sawRealFilesystemMutation: false,
      requiresFilesystemMutation: false,
      truncatedOutputRecoveryAttempted: false,
    })

    expect(decision).toMatchObject({
      kind: "run",
      reason: "successful_tool_result_requires_llm_result_diagnosis",
      state: {
        executionSatisfied: true,
        deliverySatisfied: true,
        completionSatisfied: false,
        interpretationStatus: "followup_required",
      },
    })
  })

  it("keeps verified capture and failed direct delivery as separate completion evidence", () => {
    const decision = decideReviewGate({
      executionSemantics: {
        filesystemEffect: "create_or_modify",
        artifactDelivery: "direct",
        approvalRequired: true,
        approvalTool: "yeonjang_camera_capture",
        privilegedOperation: "camera_capture",
      },
      preview: "",
      deliveryOutcome: {
        mode: "direct_artifact",
        directArtifactDeliveryRequested: true,
        hasSuccessfulArtifactDelivery: false,
        deliverySatisfied: false,
        requiresDirectArtifactRecovery: true,
      },
      successfulTools: [{
        toolName: "yeonjang_camera_capture",
        output: "camera artifact captured",
        details: {
          via: "yeonjang",
          evidence: {
            schemaVersion: "yeonjang-evidence-v1",
            postCheck: { kind: "verified", verified: true },
          },
        },
      }],
      sawRealFilesystemMutation: false,
      requiresFilesystemMutation: false,
      truncatedOutputRecoveryAttempted: false,
    })

    expect(decision).toMatchObject({
      kind: "run",
      state: {
        executionSatisfied: true,
        deliveryRequired: true,
        deliverySatisfied: false,
        completionSatisfied: false,
        recoveryStatus: "required",
      },
    })
  })

  it("reviews direct delivery because transport success does not prove the user goal", () => {
    const decision = decideReviewGate({
      executionSemantics: baseExecutionSemantics,
      preview: "스크린샷을 전송했습니다.",
      deliveryOutcome: {
        directArtifactDeliveryRequested: true,
        hasSuccessfulArtifactDelivery: true,
        deliverySatisfied: true,
        requiresDirectArtifactRecovery: false,
      },
      successfulTools: [{ toolName: "screencapture", output: "saved capture" }],
      sawRealFilesystemMutation: false,
      requiresFilesystemMutation: false,
      truncatedOutputRecoveryAttempted: false,
    })

    expect(decision.kind).toBe("run")
    expect(decision.reason).toBe("successful_tool_result_requires_llm_result_diagnosis")
    expect(decision.state.completionSatisfied).toBe(false)
  })

  it("keeps completion review when direct delivery is not yet satisfied", () => {
    const decision = decideReviewGate({
      executionSemantics: baseExecutionSemantics,
      preview: "스크린샷을 만들었습니다.",
      deliveryOutcome: {
        directArtifactDeliveryRequested: true,
        hasSuccessfulArtifactDelivery: false,
        deliverySatisfied: false,
        requiresDirectArtifactRecovery: true,
      },
      successfulTools: [{ toolName: "screencapture", output: "saved capture" }],
      sawRealFilesystemMutation: false,
      requiresFilesystemMutation: false,
      truncatedOutputRecoveryAttempted: false,
    })

    expect(decision.kind).toBe("run")
    expect(decision.state.deliveryStatus).toBe("missing")
  })

  it("reviews read-only tool results because tool success does not prove the user goal", () => {
    const decision = decideReviewGate({
      executionSemantics: {
        ...baseExecutionSemantics,
        artifactDelivery: "none",
      },
      preview: "모니터는 2개이고 메인 디스플레이 해상도는 2560x1440입니다.",
      deliveryOutcome: {
        directArtifactDeliveryRequested: false,
        hasSuccessfulArtifactDelivery: false,
        deliverySatisfied: false,
        requiresDirectArtifactRecovery: false,
      },
      successfulTools: [{ toolName: "shell_exec", output: "Displays: 2\n2560x1440" }],
      sawRealFilesystemMutation: false,
      requiresFilesystemMutation: false,
      truncatedOutputRecoveryAttempted: false,
    })

    expect(decision.kind).toBe("run")
    expect(decision.state.completionSatisfied).toBe(false)
  })

  it("skips completion review when a reply text receipt already exists", () => {
    const decision = decideReviewGate({
      executionSemantics: {
        ...baseExecutionSemantics,
        artifactDelivery: "none",
      },
      preview: "동천동은 지금 대체로 맑고 포근합니다.",
      deliveryOutcome: {
        mode: "reply",
        directArtifactDeliveryRequested: false,
        hasSuccessfulArtifactDelivery: false,
        hasSuccessfulTextDelivery: true,
        textDeliverySatisfied: true,
        deliverySatisfied: true,
        requiresDirectArtifactRecovery: false,
      },
      successfulTools: [],
      sawRealFilesystemMutation: false,
      requiresFilesystemMutation: false,
      truncatedOutputRecoveryAttempted: false,
    })

    expect(decision.kind).toBe("skip")
    expect(decision.reason).toContain("reply 텍스트 전달 receipt")
    expect(decision.state.completionSatisfied).toBe(true)
  })
})
