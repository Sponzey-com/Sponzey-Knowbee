import { describe, expect, it } from "vitest"
import {
  buildChannelArtifactDeliveryExecutionTargetRef,
  resolveChannelArtifactDeliveryRequirement,
} from "../packages/core/src/runs/channel-artifact-delivery-requirement.ts"

describe("channel artifact delivery requirement", () => {
  it("builds one opaque destination ref for planning and dispatch validation", () => {
    const first = buildChannelArtifactDeliveryExecutionTargetRef(
      "telegram",
      "telegram-chat:private-123",
    )
    const second = buildChannelArtifactDeliveryExecutionTargetRef(
      "telegram",
      "telegram-chat:private-123",
    )

    expect(first).toMatch(/^destination:telegram:sha256:[a-f0-9]{64}$/u)
    expect(second).toBe(first)
    expect(first).not.toContain("private-123")
  })

  it("selects the typed current-channel capability and hides the raw destination", () => {
    const result = resolveChannelArtifactDeliveryRequirement({
      required: true,
      source: "telegram",
      destinationId: "telegram-chat:private-123",
      ownerAgentId: "agent:knowbee",
      tools: [{
        name: "typed_delivery_tool",
        availableSources: ["telegram"],
        channelCapability: {
          kind: "direct_artifact_delivery",
          channel: "telegram",
        },
      }],
    })

    expect(result).toMatchObject({
      ok: true,
      requirement: {
        capabilityRef: "capability:typed_delivery_tool",
        bindingTargetId: "agent:knowbee",
        executionTargetId: expect.stringMatching(
          /^destination:telegram:sha256:[a-f0-9]{64}$/u,
        ),
      },
    })
    expect(JSON.stringify(result)).not.toContain("private-123")
  })

  it("rejects missing and ambiguous channel capabilities", () => {
    expect(resolveChannelArtifactDeliveryRequirement({
      required: true,
      source: "telegram",
      destinationId: "chat",
      ownerAgentId: "agent:knowbee",
      tools: [],
    })).toEqual({
      ok: false,
      reasonCode: "channel_delivery_capability_missing",
    })

    const tool = {
      name: "delivery",
      availableSources: ["telegram"],
      channelCapability: {
        kind: "direct_artifact_delivery" as const,
        channel: "telegram",
      },
    }
    expect(resolveChannelArtifactDeliveryRequirement({
      required: true,
      source: "telegram",
      destinationId: "chat",
      ownerAgentId: "agent:knowbee",
      tools: [tool, { ...tool, name: "delivery-two" }],
    })).toEqual({
      ok: false,
      reasonCode: "channel_delivery_capability_ambiguous",
    })
  })
})
