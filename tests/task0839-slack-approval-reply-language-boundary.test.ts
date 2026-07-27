import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { eventBus } from "../packages/core/src/events/index.js"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { closeDb } from "../packages/core/src/db/index.js"
import {
  createApprovalRegistryRequest,
  resolveApprovalRegistryDecision,
} from "../packages/core/src/runs/approval-registry.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"
import { buildReviewedFinalResponse } from "./fixtures/final-response-review.ts"

const getRootRunMock = vi.fn()

vi.mock("../packages/core/src/runs/store.js", () => ({
  getRootRun: (...args: unknown[]) => getRootRunMock(...args),
}))

const {
  buildSlackApprovalReplyNotice,
  handleSlackApprovalAction,
  handleSlackApprovalMessage,
  registerSlackApprovalHandler,
  resetSlackApprovalStateForTest,
  setActiveSlackConversationForSession,
} = await import("../packages/core/src/channels/slack/approval-handler.ts")

const tempDirs: string[] = []

function createPassThroughNoticeRendering() {
  return {
    config: DEFAULT_CONFIG,
    workDir: process.cwd(),
    getDefaultModel: () => "test-model",
    renderFinalResponseText: vi.fn(async (input) =>
      buildReviewedFinalResponse(input, input.rawText)),
  }
}

function useTempState(): void {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task0839-slack-approval-"))
  tempDirs.push(rootDir)
  const runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
}

beforeEach(() => {
  useTempState()
  resetSlackApprovalStateForTest()
  getRootRunMock.mockReset()
})

afterEach(() => {
  resetSlackApprovalStateForTest()
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0839 Slack approval reply language boundary", () => {
  it("builds English Slack approval reply notices as non-final control notices", () => {
    expect(buildSlackApprovalReplyNotice({
      language: "en",
      reason: "decision",
      decision: "allow_run",
    })).toEqual({
      kind: "slack_approval_reply_notice",
      language: "en",
      reason: "decision",
      deliveryMode: "thread_reply",
      textSource: "slack_approval_reply_notice",
      renderingRequired: "llm_final_response",
      finalAnswer: false,
      assistantIdentityClaim: false,
      text: "Approved for this whole request.",
    })
  })

  it("uses English reply text for Slack approval actions when language is explicit", async () => {
    const sendApprovalRequest = vi.fn(async () => undefined)
    const reply = vi.fn(async () => undefined)
    const resolve = vi.fn()

    getRootRunMock.mockReturnValue({ source: "slack", sessionId: "session-slack-task0839" })
    registerSlackApprovalHandler({ sendApprovalRequest })
    setActiveSlackConversationForSession("session-slack-task0839", "C_APPROVAL", "U_APPROVER", "thread-123")

    eventBus.emit("approval.request", {
      runId: "run-slack-task0839",
      toolName: "screen_capture",
      params: {},
      kind: "approval",
      resolve,
    })
    await new Promise((resolveTick) => setTimeout(resolveTick, 0))

    await expect(handleSlackApprovalAction({
      runId: "run-slack-task0839",
      decision: "allow_once",
      channelId: "C_APPROVAL",
      threadTs: "thread-123",
      userId: "U_APPROVER",
      language: "en",
      noticeRendering: createPassThroughNoticeRendering(),
      reply,
    })).resolves.toBe(true)

    expect(reply).toHaveBeenCalledWith("Approved for this step only.")
    expect(resolve).toHaveBeenCalledWith("allow_once", "user")
  })

  it("uses English reply text for Slack approval text commands when language is explicit", async () => {
    const sendApprovalRequest = vi.fn(async () => undefined)
    const reply = vi.fn(async () => undefined)
    const resolve = vi.fn()

    getRootRunMock.mockReturnValue({ source: "slack", sessionId: "session-slack-message-task0839" })
    registerSlackApprovalHandler({ sendApprovalRequest })
    setActiveSlackConversationForSession("session-slack-message-task0839", "C_APPROVAL", "U_APPROVER", "thread-456")

    eventBus.emit("approval.request", {
      runId: "run-slack-message-task0839",
      toolName: "screen_capture",
      params: {},
      kind: "approval",
      resolve,
    })
    await new Promise((resolveTick) => setTimeout(resolveTick, 0))

    await expect(handleSlackApprovalMessage({
      channelId: "C_APPROVAL",
      threadTs: "thread-456",
      userId: "U_APPROVER",
      text: "deny",
      language: "en",
      noticeRendering: createPassThroughNoticeRendering(),
      reply,
    })).resolves.toBe(true)

    expect(reply).toHaveBeenCalledWith("Denied and cancelled the request.")
    expect(resolve).toHaveBeenCalledWith("deny", "user")
  })

  it("passes English language to late approval descriptions", async () => {
    const reply = vi.fn(async () => undefined)
    const approval = createApprovalRegistryRequest({
      id: "approval-task0839-late",
      runId: "run-slack-late-task0839",
      channel: "slack",
      channelMessageId: "slack:C_APPROVAL:thread-late",
      toolName: "screen_capture",
      riskLevel: "safe",
      kind: "approval",
      params: {},
    })
    resolveApprovalRegistryDecision({
      approvalId: approval.id,
      decision: "deny",
      decisionBy: "U_APPROVER",
      decisionSource: "slack",
    })

    await expect(handleSlackApprovalMessage({
      channelId: "C_APPROVAL",
      threadTs: "thread-late",
      userId: "U_APPROVER",
      text: "approve",
      language: "en",
      noticeRendering: createPassThroughNoticeRendering(),
      reply,
    })).resolves.toBe(true)

    expect(reply).toHaveBeenCalledWith("This approval request was already denied. Run the request again if approval is still needed.")
  })

  it("routes Slack approval replies through final response rendering", () => {
    const source = readFileSync("packages/core/src/channels/slack/approval-handler.ts", "utf8")

    expect(source).toContain("renderChannelNoticeText")
    expect(source).toContain("replyRenderedSlackApprovalText")
    expect(source).toContain("Skipped Slack approval reply delivery")
    expect(source).not.toContain("params.reply(notice.text)")
    expect(source).not.toContain("params.reply(describeLateApproval")
  })
})
