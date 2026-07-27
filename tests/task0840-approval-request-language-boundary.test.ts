import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { eventBus } from "../packages/core/src/events/index.js"
import type { SlackConfig } from "../packages/core/src/config/types.ts"
import {
  appendApprovalAggregateItem,
  buildApprovalAggregateText,
  type ApprovalAggregateContext,
} from "../packages/core/src/channels/approval-aggregation.ts"
import { SlackResponder } from "../packages/core/src/channels/slack/responder.ts"

const getRootRunMock = vi.fn()

vi.mock("../packages/core/src/runs/store.js", () => ({
  getRootRun: (...args: unknown[]) => getRootRunMock(...args),
}))

const {
  registerSlackApprovalHandler,
  resetSlackApprovalStateForTest,
  setActiveSlackConversationForSession,
} = await import("../packages/core/src/channels/slack/approval-handler.ts")

const slackConfig: SlackConfig = {
  enabled: true,
  botToken: "xoxb-slack-secret-token",
  appToken: "xapp-slack-secret-token",
  allowedUserIds: [],
  allowedChannelIds: [],
}

beforeEach(() => {
  resetSlackApprovalStateForTest()
  getRootRunMock.mockReset()
})

afterEach(() => {
  resetSlackApprovalStateForTest()
  vi.unstubAllGlobals()
})

function buildContext(): ApprovalAggregateContext {
  let context: ApprovalAggregateContext | undefined
  context = appendApprovalAggregateItem(
    context,
    {
      approvalId: "approval-task0840-1",
      runId: "run-task0840",
      parentRunId: "run-parent",
      subSessionId: "sub-1",
      agentId: "agent-a",
      teamId: "team-a",
      toolName: "screen_capture",
      kind: "approval",
      riskSummary: "screen access",
      guidance: "Check the active window before approving.",
      paramsPreview: "{}",
      resolve: vi.fn(),
    },
    "U_APPROVER",
  ).context
  context = appendApprovalAggregateItem(
    context,
    {
      approvalId: "approval-task0840-2",
      runId: "run-task0840",
      toolName: "web_fetch",
      kind: "approval",
      paramsPreview: "{\"url\":\"https://example.test\"}",
      resolve: vi.fn(),
    },
    "U_APPROVER",
  ).context
  return context
}

describe("task0840 approval request language boundary", () => {
  it("builds English approval aggregate text without changing the default Korean text", () => {
    const context = buildContext()

    const defaultText = buildApprovalAggregateText({ context, channel: "slack" })
    const englishText = buildApprovalAggregateText({ context, channel: "slack", language: "en" })

    expect(defaultText).toContain("도구 실행 승인이 필요합니다.")
    expect(defaultText).toContain("승인 항목: 2개")
    expect(englishText).toContain("Tool execution approval required.")
    expect(englishText).toContain("Approval items: 2")
    expect(englishText).toContain("Tool: screen_capture")
    expect(englishText).not.toContain("run-parent")
    expect(englishText).not.toContain("sub-1")
    expect(englishText).not.toContain("agent-a")
    expect(englishText).not.toContain("team-a")
    expect(englishText).not.toContain("screen access")
    expect(englishText).not.toContain("Parameters")
    expect(englishText).not.toContain("https://example.test")
    expect(englishText).not.toContain("Check the active window")
    expect(englishText).toContain("Use the buttons below, or reply in this thread with `approve`, `approve once`, or `deny`.")
  })

  it("passes English language from the active Slack conversation to approval request delivery", async () => {
    const sendApprovalRequest = vi.fn(async () => undefined)
    const resolve = vi.fn()

    getRootRunMock.mockReturnValue({
      source: "slack",
      sessionId: "session-slack-task0840",
    })

    registerSlackApprovalHandler({ sendApprovalRequest })
    setActiveSlackConversationForSession(
      "session-slack-task0840",
      "C_APPROVAL",
      "U_APPROVER",
      "thread-123",
      "en",
    )

    eventBus.emit("approval.request", {
      runId: "run-slack-task0840",
      toolName: "screen_capture",
      params: { extensionId: "yeonjang-main" },
      kind: "approval",
      resolve,
    })
    await new Promise((resolveTick) => setTimeout(resolveTick, 0))

    expect(sendApprovalRequest).toHaveBeenCalledWith({
      channelId: "C_APPROVAL",
      threadTs: "thread-123",
      runId: "run-slack-task0840",
      language: "en",
      text: expect.stringContaining("Tool execution approval required."),
    })
  })

  it("renders English Slack approval fallback text, button labels, and top-level text", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) as { text?: string; blocks?: Array<{ elements?: Array<{ text?: { text?: string } }> }> } : {}
      if (body.blocks) {
        expect(body.text).toBe("Approval request: *Tool execution approval required.*")
        expect(body.blocks[1]?.elements?.map((element) => element.text?.text)).toEqual([
          "Approve all",
          "This step only",
          "Deny",
        ])
      } else {
        expect(body.text).toBe([
          "Approval is pending.",
          "Use the buttons below, or reply in this thread with `approve`, `approve once`, or `deny`.",
        ].join("\n"))
      }
      return new Response(JSON.stringify({ ok: true, ts: "1710000100.000100" }))
    })
    vi.stubGlobal("fetch", fetchMock)

    const responder = new SlackResponder(slackConfig, "C_APPROVAL", "thread-123")
    await expect(responder.sendApprovalRequest(
      "run-slack-task0840",
      "*Tool execution approval required.*",
      "en",
    )).resolves.toBe("1710000100.000100")

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
