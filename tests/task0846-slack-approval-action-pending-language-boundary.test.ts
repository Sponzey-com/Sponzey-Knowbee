import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { eventBus } from "../packages/core/src/events/index.js"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.js"
import { buildReviewedFinalResponse } from "./fixtures/final-response-review.ts"

const getRootRunMock = vi.fn()

vi.mock("../packages/core/src/runs/store.js", () => ({
  getRootRun: (...args: unknown[]) => getRootRunMock(...args),
}))

const {
  handleSlackApprovalAction,
  registerSlackApprovalHandler,
  resetSlackApprovalStateForTest,
  setActiveSlackConversationForSession,
} = await import("../packages/core/src/channels/slack/approval-handler.ts")

function createPassThroughNoticeRendering() {
  return {
    config: DEFAULT_CONFIG,
    workDir: DEFAULT_CONFIG.profile.workspace,
    getDefaultModel: () => "test-model",
    renderFinalResponseText: vi.fn(async (input) =>
      buildReviewedFinalResponse(input, input.rawText)),
  }
}

beforeEach(() => {
  getRootRunMock.mockReset()
  resetSlackApprovalStateForTest()
})

afterEach(() => {
  resetSlackApprovalStateForTest()
})

describe("task0846 Slack approval action pending language boundary", () => {
  it("uses pending approval language for Slack block action replies when action payload has no language", async () => {
    const sendApprovalRequest = vi.fn(async () => undefined)
    const reply = vi.fn(async () => undefined)
    const resolve = vi.fn()

    getRootRunMock.mockReturnValue({ source: "slack", sessionId: "session-slack-task0846" })
    registerSlackApprovalHandler({ sendApprovalRequest })
    setActiveSlackConversationForSession(
      "session-slack-task0846",
      "C_APPROVAL",
      "U_APPROVER",
      "thread-123",
      "en",
    )

    eventBus.emit("approval.request", {
      runId: "run-slack-task0846",
      toolName: "screen_capture",
      params: {},
      kind: "approval",
      resolve,
    })
    await new Promise((resolveTick) => setTimeout(resolveTick, 0))

    await expect(handleSlackApprovalAction({
      runId: "run-slack-task0846",
      decision: "allow_run",
      channelId: "C_APPROVAL",
      threadTs: "thread-123",
      userId: "U_APPROVER",
      noticeRendering: createPassThroughNoticeRendering(),
      reply,
    })).resolves.toBe(true)

    expect(reply).toHaveBeenCalledWith("Approved for this whole request.")
    expect(resolve).toHaveBeenCalledWith("allow_run", "user")
  })
})
