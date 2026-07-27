import { describe, expect, it, vi } from "vitest"
import {
  buildAccessPolicyFromAllowedIds,
  evaluateInboundAccessPolicy,
} from "../packages/core/src/channels/index.ts"
import type { InboundEnvelope } from "../packages/core/src/channels/contracts.ts"

function createSlackEnvelope(overrides: Partial<InboundEnvelope> = {}): InboundEnvelope {
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

describe("task0790 channel access policy notice boundary", () => {
  it("returns structured access notices instead of deterministic user-facing text", () => {
    const result = evaluateInboundAccessPolicy({
      envelope: createSlackEnvelope(),
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

    expect(result.allowed).toBe(false)
    expect(result.policy.reasonCode).toBe("blocked_user")
    expect(result.responseText).toBeUndefined()
    expect(result.notice).toEqual({
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

  it("marks missing sender notices as unknown principal scope", () => {
    const result = evaluateInboundAccessPolicy({
      envelope: createSlackEnvelope({ sender: { id: "", providerType: "unknown" } }),
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

    expect(result.allowed).toBe(false)
    expect(result.notice).toMatchObject({
      reasonCode: "missing_sender",
      blockedScope: "unknown",
      textSource: "channel_access_policy_notice",
      renderingRequired: "llm_final_response",
      finalAnswer: false,
      assistantIdentityClaim: false,
    })
  })
})

const startIngressRunMock = vi.fn()
const sendReceiptMock = vi.fn(async () => "slack-message-1")

vi.mock("../packages/core/src/runs/ingress.js", () => ({
  startIngressRun: (...args: unknown[]) => startIngressRunMock(...args),
}))

vi.mock("../packages/core/src/channels/slack/chunk-delivery.js", () => ({
  createSlackChunkDeliveryHandler: () => vi.fn(),
}))

vi.mock("../packages/core/src/channels/slack/approval-handler.js", () => ({
  clearActiveSlackConversationForSession: vi.fn(),
  handleSlackApprovalAction: vi.fn(),
  handleSlackApprovalMessage: vi.fn(async () => false),
  registerSlackApprovalHandler: vi.fn(),
  setActiveSlackConversationForSession: vi.fn(),
}))

vi.mock("../packages/core/src/channels/slack/session.js", () => ({
  getOrCreateSlackSession: vi.fn(() => "session-slack-1"),
  newSlackSession: vi.fn(() => "session-slack-1"),
  resolveSlackSessionKey: vi.fn((channelId: string, threadTs: string) => `slack:${channelId}:${threadTs}`),
}))

vi.mock("../packages/core/src/channels/slack/responder.js", () => ({
  SlackResponder: vi.fn().mockImplementation(() => ({
    sendReceipt: sendReceiptMock,
    sendError: vi.fn(async () => "error-ts"),
    sendApprovalRequest: vi.fn(async () => "approval-ts"),
    sendToolStatus: vi.fn(async () => "tool-ts"),
    updateToolStatus: vi.fn(async () => undefined),
    sendFinalResponse: vi.fn(async () => ["final-ts"]),
    sendFile: vi.fn(async () => "file-ts"),
  })),
}))

vi.mock("../packages/core/src/db/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../packages/core/src/db/index.js")>()
  return {
    ...actual,
    findChannelMessageRef: vi.fn(() => null),
    findLatestChannelMessageRefForThread: vi.fn(() => null),
    insertChannelMessageRef: vi.fn(),
  }
})

vi.mock("../packages/core/src/runs/store.js", () => ({
  cancelRootRun: vi.fn(() => false),
  getRootRun: vi.fn(() => ({ requestGroupId: "request-group-1" })),
}))

describe("task0790 Slack policy delivery boundary", () => {
  it("does not start a run or send deterministic receipt when access is blocked before LLM rendering", async () => {
    const { SlackChannel } = await import("../packages/core/src/channels/slack/bot.ts")
    const channel = new SlackChannel({
      enabled: true,
      botToken: "xoxb-test",
      appToken: "xapp-test",
      allowedUserIds: ["U_ALLOWED"],
      allowedChannelIds: ["C_ALLOWED"],
    }) as unknown as {
      socket: { send: ReturnType<typeof vi.fn> }
      handleSocketMessage: (raw: string) => Promise<void>
    }

    channel.socket = { send: vi.fn() }
    startIngressRunMock.mockReset()
    sendReceiptMock.mockClear()

    await channel.handleSocketMessage(JSON.stringify({
      envelope_id: "env-blocked",
      payload: {
        event: {
          type: "message",
          user: "U_BLOCKED",
          channel: "C_ALLOWED",
          text: "run this",
          ts: "1712570000.900000",
        },
      },
    }))

    expect(startIngressRunMock).not.toHaveBeenCalled()
    expect(sendReceiptMock).not.toHaveBeenCalled()
  })
})
