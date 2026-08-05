import { describe, expect, it } from "vitest"
import {
  enforceDirectArtifactDeliveryFollowup,
} from "../packages/core/src/runs/direct-artifact-delivery-followup.ts"
import {
  buildCompletionFollowupExecutionMessage,
} from "../packages/core/src/runs/completion-application.ts"

describe("direct artifact delivery follow-up", () => {
  it("requires the channel delivery tool after a verified camera artifact instead of recapturing", () => {
    const result = enforceDirectArtifactDeliveryFollowup({
      source: "telegram",
      deliveryOutcome: {
        directArtifactDeliveryRequested: true,
        hasSuccessfulArtifactDelivery: false,
        deliverySatisfied: false,
        requiresDirectArtifactRecovery: true,
      },
      successfulTools: [{
        toolName: "yeonjang_camera_capture",
        output: "카메라 촬영 결과가 검증된 artifact로 저장되었습니다.",
        details: {
          kind: "camera_artifact",
          artifactRef: "artifact:7ea8e0d1-6e8b-4666-b26e-52d9698ed667",
          mimeType: "image/jpeg",
          sizeBytes: 128,
        },
        evidenceSource: {
          sourceKind: "yeonjang",
          sourceRef: "tool-result:yeonjang:camera-success",
          trustClass: "untrusted_external",
          instructionIsolation: "data_only",
        },
      }],
      review: {
        status: "followup",
        summary: "이미지를 전달해야 합니다.",
        reason: "이미지가 아직 전송되지 않았습니다.",
        followupPrompt: "사진을 전달하세요.",
        followupEvidenceRefs: ["tool-result:yeonjang:camera-success"],
        followupExecutionMode: "tool",
        followupRequiredToolNames: ["yeonjang_camera_capture"],
        remainingItems: ["이미지 전달"],
      },
    })

    expect(result).toMatchObject({
      status: "followup",
      followupExecutionMode: "tool",
      followupRequiredToolNames: ["telegram_send_file"],
      followupEvidenceRefs: ["tool-result:yeonjang:camera-success"],
    })
    expect(result?.followupPrompt).toContain("artifact:7ea8e0d1-6e8b-4666-b26e-52d9698ed667")
    if (!result || result.status !== "followup") throw new Error("followup required")
    expect(buildCompletionFollowupExecutionMessage(result)).toContain("Do not invoke another capture")
  })

  it("does not override review when direct delivery is already receipted", () => {
    const review = {
      status: "complete" as const,
      summary: "완료",
      reason: "전송됨",
      followupEvidenceRefs: [],
      remainingItems: [],
    }

    expect(enforceDirectArtifactDeliveryFollowup({
      source: "telegram",
      deliveryOutcome: {
        directArtifactDeliveryRequested: true,
        hasSuccessfulArtifactDelivery: true,
        deliverySatisfied: true,
        requiresDirectArtifactRecovery: false,
      },
      successfulTools: [],
      review,
    })).toBe(review)
  })

  it("uses the durable artifact reference when the public projection omits raw Yeonjang evidence", () => {
    const result = enforceDirectArtifactDeliveryFollowup({
      source: "telegram",
      deliveryOutcome: {
        directArtifactDeliveryRequested: true,
        hasSuccessfulArtifactDelivery: false,
        deliverySatisfied: false,
        requiresDirectArtifactRecovery: true,
      },
      successfulTools: [{
        toolName: "yeonjang_camera_capture",
        output: "camera artifact ready",
        details: {
          kind: "camera_artifact",
          artifactRef: "artifact:570f93b7-2204-454f-af17-b84337fc40c7",
          mimeType: "image/jpeg",
          sizeBytes: 128,
        },
      }],
      review: null,
    })

    expect(result).toMatchObject({
      followupEvidenceRefs: ["artifact:570f93b7-2204-454f-af17-b84337fc40c7"],
      followupRequiredToolNames: ["telegram_send_file"],
    })
  })
})
