import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import type { AgentHierarchyStorage } from "../packages/core/src/orchestration/hierarchy.ts"
import { createTestAgentRuntimeDependencies } from "./fixtures/agent-runtime.ts"

const mocks = vi.hoisted(() => ({
  startIngressRun: vi.fn(),
  createSlackChunkDeliveryHandler: vi.fn(() => vi.fn()),
  handleSlackApprovalMessage: vi.fn(async () => false),
  setActiveSlackConversationForSession: vi.fn(),
  clearActiveSlackConversationForSession: vi.fn(),
  registerSlackApprovalHandler: vi.fn(),
  SlackResponder: vi.fn().mockImplementation(() => ({
    sendReceipt: vi.fn(async () => "slack-message-1"),
    sendIntakeAcknowledgement: vi.fn(async () => "slack-message-1"),
    sendError: vi.fn(async () => "error-ts"),
    sendApprovalRequest: vi.fn(async () => "approval-ts"),
    sendToolStatus: vi.fn(async () => "tool-ts"),
    updateToolStatus: vi.fn(async () => undefined),
    sendFinalResponse: vi.fn(async () => ["final-ts"]),
    sendFile: vi.fn(async () => "file-ts"),
  })),
}))

vi.mock("../packages/core/src/runs/ingress.js", () => ({
  startIngressRun: (...args: unknown[]) => mocks.startIngressRun(...args),
}))

vi.mock("../packages/core/src/channels/slack/chunk-delivery.js", () => ({
  createSlackChunkDeliveryHandler: (...args: unknown[]) => mocks.createSlackChunkDeliveryHandler(...args),
}))

vi.mock("../packages/core/src/channels/slack/approval-handler.js", () => ({
  clearActiveSlackConversationForSession: (...args: unknown[]) => mocks.clearActiveSlackConversationForSession(...args),
  handleSlackApprovalAction: vi.fn(),
  handleSlackApprovalMessage: (...args: unknown[]) => mocks.handleSlackApprovalMessage(...args),
  registerSlackApprovalHandler: (...args: unknown[]) => mocks.registerSlackApprovalHandler(...args),
  setActiveSlackConversationForSession: (...args: unknown[]) => mocks.setActiveSlackConversationForSession(...args),
}))

vi.mock("../packages/core/src/channels/slack/session.js", () => ({
  getOrCreateSlackSession: vi.fn(() => "session-slack-task0845"),
  newSlackSession: vi.fn(() => "session-slack-task0845"),
  resolveSlackSessionKey: vi.fn((channelId: string, threadTs: string) => `slack:${channelId}:${threadTs}`),
}))

vi.mock("../packages/core/src/channels/slack/responder.js", () => ({
  SlackResponder: mocks.SlackResponder,
}))

vi.mock("../packages/core/src/db/index.js", () => ({
  findChannelMessageRef: vi.fn(() => null),
  findLatestChannelMessageRefForThread: vi.fn(() => null),
  insertChannelMessageRef: vi.fn(),
}))

vi.mock("../packages/core/src/runs/store.js", () => ({
  cancelRootRun: vi.fn(() => false),
  getRootRun: vi.fn(() => ({ requestGroupId: "request-group-task0845" })),
}))

const { SlackChannel, resolveSlackInboundMessageLanguage } = await import("../packages/core/src/channels/slack/bot.ts")
const runtimeDependencies = createTestAgentRuntimeDependencies("/tmp/knowbee-task0845")
const hierarchyStorage = {} as AgentHierarchyStorage

function createChannel(): { handleSocketMessage(raw: string): Promise<void>; socket: { send: ReturnType<typeof vi.fn> } } {
  const channel = new SlackChannel({
    enabled: true,
    botToken: "xoxb-test",
    appToken: "xapp-test",
    allowedUserIds: ["U_ALLOWED"],
    allowedChannelIds: ["C_ALLOWED"],
  }, runtimeDependencies.artifactStorage, {
    config: DEFAULT_CONFIG,
    workDir: DEFAULT_CONFIG.profile.workspace,
  }, runtimeDependencies.memoryJournal, hierarchyStorage) as unknown as {
    socket: { send: ReturnType<typeof vi.fn> }
    handleSocketMessage(raw: string): Promise<void>
  }
  channel.socket = { send: vi.fn() }
  return channel
}

function slackMessageEnvelope(text: string): string {
  return JSON.stringify({
    envelope_id: `env-${text.length}`,
    payload: {
      event: {
        type: "message",
        user: "U_ALLOWED",
        channel: "C_ALLOWED",
        text,
        ts: "1712570000.100000",
      },
    },
  })
}

describe("task0845 Slack inbound message language boundary", () => {
  beforeEach(() => {
    for (const value of Object.values(mocks)) {
      if ("mockClear" in value) value.mockClear()
    }
    mocks.startIngressRun.mockReturnValue({
      started: {
        runId: "run-slack-task0845",
        finished: Promise.resolve(),
      },
      acknowledgement: {
        kind: "intake_acknowledgement",
        state: "request_received",
        language: "en",
        deliveryMode: "interactive_control",
        finalAnswer: false,
        assistantIdentityClaim: false,
      },
    })
  })

  it("resolves Slack inbound text language from user-visible message text", () => {
    expect(resolveSlackInboundMessageLanguage("Please capture the main screen")).toBe("en")
    expect(resolveSlackInboundMessageLanguage("메인 화면 캡쳐해서 보여줘")).toBe("ko")
    expect(resolveSlackInboundMessageLanguage("<@B_KNOWBEE> 메인 화면 capture")).toBe("ko")
  })

  it("passes English Slack inbound language to approval handling, active conversation, responder, and chunk delivery", async () => {
    const channel = createChannel()
    await channel.handleSocketMessage(slackMessageEnvelope("Please capture the main screen"))

    expect(mocks.handleSlackApprovalMessage).toHaveBeenCalledWith(expect.objectContaining({ language: "en" }))
    expect(mocks.setActiveSlackConversationForSession).toHaveBeenCalledWith(
      "session-slack-task0845",
      "C_ALLOWED",
      "U_ALLOWED",
      "1712570000.100000",
      "en",
    )
    expect(mocks.SlackResponder).toHaveBeenCalledWith(
      expect.objectContaining({ botToken: "xoxb-test" }),
      "C_ALLOWED",
      "1712570000.100000",
      "en",
    )
    expect(mocks.createSlackChunkDeliveryHandler).toHaveBeenCalledWith(expect.objectContaining({ language: "en" }))
    expect(mocks.startIngressRun).toHaveBeenCalledWith(expect.objectContaining({ config: DEFAULT_CONFIG }))
  })

  it("passes Korean Slack inbound language for Korean user text", async () => {
    const channel = createChannel()
    await channel.handleSocketMessage(slackMessageEnvelope("메인 화면 캡쳐해서 보여줘"))

    expect(mocks.handleSlackApprovalMessage).toHaveBeenCalledWith(expect.objectContaining({ language: "ko" }))
    expect(mocks.setActiveSlackConversationForSession).toHaveBeenCalledWith(
      "session-slack-task0845",
      "C_ALLOWED",
      "U_ALLOWED",
      "1712570000.100000",
      "ko",
    )
    expect(mocks.createSlackChunkDeliveryHandler).toHaveBeenCalledWith(expect.objectContaining({ language: "ko" }))
    expect(mocks.startIngressRun).toHaveBeenCalledWith(expect.objectContaining({ config: DEFAULT_CONFIG }))
  })
})
