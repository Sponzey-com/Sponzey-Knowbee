import { describe, expect, it } from "vitest"
import {
  resolveApprovedArtifactDeliveryOperation,
} from "../packages/core/src/tools/approved-artifact-delivery-operation.ts"
import type {
  AnyTool,
  ToolContext,
} from "../packages/core/src/tools/types.ts"

const tool = {
  name: "telegram_send_file",
  description: "test",
  parameters: { type: "object", properties: {} },
  riskLevel: "moderate",
  requiresApproval: true,
  channelCapability: {
    kind: "direct_artifact_delivery",
    channel: "telegram",
  },
  execute: async () => ({ success: true, output: "prepared" }),
} satisfies AnyTool

function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    artifactStorage: {} as ToolContext["artifactStorage"],
    sessionId: "session:telegram:chat-a",
    runId: "run:camera:1",
    requestGroupId: "group:camera:1",
    workDir: "/tmp",
    userMessage: "Take a photo and send it here.",
    source: "telegram",
    allowWebAccess: false,
    onProgress: () => undefined,
    signal: new AbortController().signal,
    ...overrides,
  }
}

describe("approved artifact delivery operation", () => {
  it("binds one opaque artifact and current channel target without persisting a raw path", () => {
    const resolved = resolveApprovedArtifactDeliveryOperation({
      tool,
      params: {
        artifactRef: "artifact:11111111-1111-4111-8111-111111111111",
        filePath: "/private/raw-camera.jpg",
        caption: "camera result",
      },
      ctx: context(),
    })

    expect(resolved.status).toBe("resolved")
    if (resolved.status !== "resolved") return
    expect(resolved.operation.authorizationParams).toEqual({
      operationId: resolved.operation.binding.operationId,
      operationBindingHash:
        resolved.operation.binding.operationBindingHash,
      artifactRef: "artifact:11111111-1111-4111-8111-111111111111",
      targetFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
    })
    expect(JSON.stringify(resolved.operation)).not.toContain("/private/raw-camera.jpg")
  })

  it("changes the immutable binding for another chat or artifact", () => {
    const first = resolveApprovedArtifactDeliveryOperation({
      tool,
      params: {
        artifactRef: "artifact:11111111-1111-4111-8111-111111111111",
      },
      ctx: context(),
    })
    const anotherChat = resolveApprovedArtifactDeliveryOperation({
      tool,
      params: {
        artifactRef: "artifact:11111111-1111-4111-8111-111111111111",
      },
      ctx: context({ sessionId: "session:telegram:chat-b" }),
    })
    const anotherArtifact = resolveApprovedArtifactDeliveryOperation({
      tool,
      params: {
        artifactRef: "artifact:22222222-2222-4222-8222-222222222222",
      },
      ctx: context(),
    })

    expect(first.status).toBe("resolved")
    expect(anotherChat.status).toBe("resolved")
    expect(anotherArtifact.status).toBe("resolved")
    if (
      first.status !== "resolved"
      || anotherChat.status !== "resolved"
      || anotherArtifact.status !== "resolved"
    ) return
    expect(anotherChat.operation.binding).not.toEqual(first.operation.binding)
    expect(anotherArtifact.operation.binding).not.toEqual(first.operation.binding)
  })

  it("does not create a restart continuation from a raw path or wrong channel", () => {
    expect(resolveApprovedArtifactDeliveryOperation({
      tool,
      params: { filePath: "/tmp/legacy.jpg" },
      ctx: context(),
    })).toEqual({
      status: "rejected",
      reasonCode: "approved_artifact_delivery_ref_required",
    })
    expect(resolveApprovedArtifactDeliveryOperation({
      tool,
      params: {
        artifactRef: "artifact:11111111-1111-4111-8111-111111111111",
      },
      ctx: context({ source: "webui" }),
    })).toEqual({
      status: "rejected",
      reasonCode: "approved_artifact_delivery_channel_mismatch",
    })
  })
})
