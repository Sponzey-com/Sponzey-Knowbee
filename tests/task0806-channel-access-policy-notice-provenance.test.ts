import { describe, expect, it } from "vitest"
import {
  buildAccessPolicyFromAllowedIds,
  evaluateInboundAccessPolicy,
} from "../packages/core/src/channels/index.ts"
import type { InboundEnvelope } from "../packages/core/src/channels/contracts.ts"

function createEnvelope(overrides: Partial<InboundEnvelope> = {}): InboundEnvelope {
  return {
    channelId: "slack:workspace",
    provider: "slack",
    connectionId: "slack:primary",
    messageId: "1710000100.000400",
    sender: { id: "U_BLOCKED", providerType: "user" },
    room: { id: "C_ALLOWED", type: "channel" },
    workspace: { id: "T123" },
    text: "run this",
    attachments: [],
    mentions: [],
    timestamp: 1_710_000_400_000,
    rawPayloadRef: {
      storage: "none",
      redactionState: "not_stored",
      provider: "slack",
      createdAt: 1_710_000_400_000,
    },
    dedupeKey: "slack:C_ALLOWED:1710000100.000400",
    ...overrides,
  }
}

function blockedResult(overrides: Partial<InboundEnvelope> = {}) {
  return evaluateInboundAccessPolicy({
    envelope: createEnvelope(overrides),
    workspaceId: "T123",
    policy: buildAccessPolicyFromAllowedIds({
      provider: "slack",
      teamId: "T123",
      allowedUserIds: ["U_ALLOWED"],
      allowedRoomIds: ["C_ALLOWED"],
      requireAllowedPrincipal: true,
      emptyAllowlistAllows: false,
    }),
  })
}

describe("task0806 channel access policy notice provenance", () => {
  it("marks blocked user access notice as non-final control notice", () => {
    expect(blockedResult().notice).toEqual({
      kind: "channel_access_policy_blocked",
      reasonCode: "blocked_user",
      blockedScope: "user",
      textSource: "channel_access_policy_notice",
      renderingRequired: "llm_final_response",
      finalAnswer: false,
      assistantIdentityClaim: false,
      fallbackDelivery: "block_without_llm_rendering",
    })
  })

  it("marks missing sender access notice with the same provenance fields", () => {
    expect(blockedResult({ sender: { id: "", providerType: "unknown" } }).notice).toMatchObject({
      reasonCode: "missing_sender",
      blockedScope: "unknown",
      textSource: "channel_access_policy_notice",
      renderingRequired: "llm_final_response",
      finalAnswer: false,
      assistantIdentityClaim: false,
    })
  })
})
