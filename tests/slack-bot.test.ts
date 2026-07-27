import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import type { AgentHierarchyStorage } from "../packages/core/src/orchestration/hierarchy.ts"
import { createTestAgentRuntimeDependencies } from "./fixtures/agent-runtime.ts"

const startIngressRunMock = vi.fn()
const sendReceiptMock = vi.fn(async () => "slack-message-1")
const findChannelMessageRefMock = vi.fn((..._args: unknown[]): unknown => null)
const findLatestChannelMessageRefForThreadMock = vi.fn((..._args: unknown[]): unknown => null)

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
    sendIntakeAcknowledgement: sendReceiptMock,
    sendError: vi.fn(async () => "error-ts"),
    sendApprovalRequest: vi.fn(async () => "approval-ts"),
    sendToolStatus: vi.fn(async () => "tool-ts"),
    updateToolStatus: vi.fn(async () => undefined),
    sendFinalResponse: vi.fn(async () => ["final-ts"]),
    sendFile: vi.fn(async () => "file-ts"),
  })),
}))

vi.mock("../packages/core/src/db/index.js", () => ({
  findChannelMessageRef: (...args: unknown[]) => findChannelMessageRefMock(...args),
  findLatestChannelMessageRefForThread: (...args: unknown[]) => findLatestChannelMessageRefForThreadMock(...args),
  insertChannelMessageRef: vi.fn(),
}))

vi.mock("../packages/core/src/runs/store.js", () => ({
  cancelRootRun: vi.fn(() => false),
  getRootRun: vi.fn(() => ({
    requestGroupId: "request-group-1",
  })),
}))

const { SlackChannel } = await import("../packages/core/src/channels/slack/bot.ts")
const runtimeDependencies = createTestAgentRuntimeDependencies("/tmp/knowbee-slack-bot-test")
const hierarchyStorage = {} as AgentHierarchyStorage

function createNoticeRendering() {
  return {
    config: DEFAULT_CONFIG,
    workDir: DEFAULT_CONFIG.profile.workspace,
    getDefaultModel: () => "gpt-test",
    renderFinalResponseText: vi.fn(async (input: { rawText: string; textSource: string }) => ({
      text: input.rawText,
      textSource: "llm_reviewed" as const,
      promptSourceId: "final_response" as const,
      rawTextSource: input.textSource,
    })),
  }
}

describe("slack channel", () => {
  beforeEach(() => {
    startIngressRunMock.mockReset()
    sendReceiptMock.mockClear()
    startIngressRunMock.mockReturnValue({
      started: {
        runId: "run-slack-1",
        finished: Promise.resolve(),
      },
      acknowledgement: {
        kind: "intake_acknowledgement",
        state: "request_received",
        language: "ko",
        deliveryMode: "interactive_control",
        finalAnswer: false,
        assistantIdentityClaim: false,
      },
    })
    findChannelMessageRefMock.mockReset().mockReturnValue(null)
    findLatestChannelMessageRefForThreadMock.mockReset().mockReturnValue(null)
  })

  it("deduplicates the same inbound Slack message delivered as app_mention and message", async () => {
    const channel = new SlackChannel({
      enabled: true,
      botToken: "xoxb-test",
      appToken: "xapp-test",
      allowedUserIds: ["U_ALLOWED"],
      allowedChannelIds: ["C_ALLOWED"],
    }, runtimeDependencies.artifactStorage, createNoticeRendering(), runtimeDependencies.memoryJournal, hierarchyStorage) as unknown as {
      socket: { send: ReturnType<typeof vi.fn> }
      handleSocketMessage: (raw: string) => Promise<void>
    }

    channel.socket = {
      send: vi.fn(),
    }

    const appMentionEnvelope = JSON.stringify({
      envelope_id: "env-1",
      payload: {
        event: {
          type: "app_mention",
          user: "U_ALLOWED",
          channel: "C_ALLOWED",
          text: "<@B_KNOWBEE> 메인화면 캡쳐해서 보여줘",
          ts: "1712570000.100000",
        },
      },
    })

    const messageEnvelope = JSON.stringify({
      envelope_id: "env-2",
      payload: {
        event: {
          type: "message",
          user: "U_ALLOWED",
          channel: "C_ALLOWED",
          text: "<@B_KNOWBEE> 메인화면 캡쳐해서 보여줘",
          ts: "1712570000.100000",
        },
      },
    })

    await channel.handleSocketMessage(appMentionEnvelope)
    await channel.handleSocketMessage(messageEnvelope)

    expect(startIngressRunMock).toHaveBeenCalledTimes(1)
    expect(startIngressRunMock).toHaveBeenCalledWith(expect.objectContaining({ config: DEFAULT_CONFIG }))
    expect(sendReceiptMock).toHaveBeenCalledTimes(1)
  })

  it("keeps Slack thread comments isolated unless an explicit continuation target exists", async () => {
    findLatestChannelMessageRefForThreadMock.mockReturnValue({
      id: "ref-thread-final",
      source: "slack",
      session_id: "session-slack-1",
      root_run_id: "run-thread-root",
      request_group_id: "request-group-thread",
      external_chat_id: "C_ALLOWED",
      external_thread_id: "1712570000.100000",
      external_message_id: "1712570000.300000",
      role: "assistant",
      created_at: 1712570000300,
    })

    const channel = new SlackChannel({
      enabled: true,
      botToken: "xoxb-test",
      appToken: "xapp-test",
      allowedUserIds: ["U_ALLOWED"],
      allowedChannelIds: ["C_ALLOWED"],
    }, runtimeDependencies.artifactStorage, createNoticeRendering(), runtimeDependencies.memoryJournal, hierarchyStorage) as unknown as {
      socket: { send: ReturnType<typeof vi.fn> }
      handleSocketMessage: (raw: string) => Promise<void>
    }

    channel.socket = {
      send: vi.fn(),
    }

    await channel.handleSocketMessage(JSON.stringify({
      envelope_id: "env-thread-comment",
      payload: {
        event: {
          type: "message",
          user: "U_ALLOWED",
          channel: "C_ALLOWED",
          text: "이전 답변 기준으로 이어서 진행해줘",
          ts: "1712570000.400000",
          thread_ts: "1712570000.100000",
        },
      },
    }))

    expect(findChannelMessageRefMock).toHaveBeenCalledWith({
      source: "slack",
      externalChatId: "C_ALLOWED",
      externalMessageId: "1712570000.400000",
      externalThreadId: "1712570000.100000",
    })
    expect(findLatestChannelMessageRefForThreadMock).not.toHaveBeenCalled()
    expect(startIngressRunMock).toHaveBeenCalledWith(expect.objectContaining({
      message: "이전 답변 기준으로 이어서 진행해줘",
    }))
    expect(startIngressRunMock.mock.calls[0]?.[0]).not.toMatchObject({
      requestGroupId: "request-group-thread",
      forceRequestGroupReuse: true,
    })
  })
})
