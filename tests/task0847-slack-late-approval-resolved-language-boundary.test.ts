import { mkdtempSync, rmSync } from "node:fs"
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
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task0847-slack-approval-"))
  tempDirs.push(rootDir)
  const runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
}

beforeEach(() => {
  useTempState()
  getRootRunMock.mockReset()
  resetSlackApprovalStateForTest()
})

afterEach(() => {
  resetSlackApprovalStateForTest()
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0847 Slack late approval resolved language boundary", () => {
  it("keeps the pending English language for duplicate Slack approval actions after resolution", async () => {
    const sendApprovalRequest = vi.fn(async () => "thread-123")
    const reply = vi.fn(async () => undefined)
    const resolve = vi.fn()

    getRootRunMock.mockReturnValue({ source: "slack", sessionId: "session-slack-task0847" })
    const approval = createApprovalRegistryRequest({
      id: "approval-task0847",
      runId: "run-slack-task0847",
      channel: "slack",
      channelMessageId: "slack:C_APPROVAL:thread-123",
      toolName: "screen_capture",
      riskLevel: "safe",
      kind: "approval",
      params: {},
    })
    registerSlackApprovalHandler({ sendApprovalRequest })
    setActiveSlackConversationForSession(
      "session-slack-task0847",
      "C_APPROVAL",
      "U_APPROVER",
      "thread-123",
      "en",
    )

    eventBus.emit("approval.request", {
      approvalId: "approval-task0847",
      runId: "run-slack-task0847",
      toolName: "screen_capture",
      params: {},
      kind: "approval",
      resolve,
    })
    await new Promise((resolveTick) => setTimeout(resolveTick, 0))

    await expect(handleSlackApprovalAction({
      runId: "run-slack-task0847",
      decision: "allow_run",
      channelId: "C_APPROVAL",
      threadTs: "thread-123",
      userId: "U_APPROVER",
      noticeRendering: createPassThroughNoticeRendering(),
      reply,
    })).resolves.toBe(true)
    resolveApprovalRegistryDecision({
      approvalId: approval.id,
      decision: "allow_run",
      decisionBy: "U_APPROVER",
      decisionSource: "slack",
    })
    await expect(handleSlackApprovalAction({
      runId: "run-slack-task0847",
      decision: "allow_run",
      channelId: "C_APPROVAL",
      threadTs: "thread-123",
      userId: "U_APPROVER",
      noticeRendering: createPassThroughNoticeRendering(),
      reply,
    })).resolves.toBe(true)

    expect(reply).toHaveBeenNthCalledWith(1, "Approved for this whole request.")
    expect(reply).toHaveBeenNthCalledWith(2, "This approval request has already been approved. Duplicate execution will not run.")
  })

  it("uses cached resolved language for Slack text-command late approval by channel message", async () => {
    const sendApprovalRequest = vi.fn(async () => "thread-456")
    const reply = vi.fn(async () => undefined)
    const resolve = vi.fn()

    getRootRunMock.mockReturnValue({ source: "slack", sessionId: "session-slack-message-task0847" })
    const approval = createApprovalRegistryRequest({
      id: "approval-message-task0847",
      runId: "run-slack-message-task0847",
      channel: "slack",
      channelMessageId: "slack:C_APPROVAL:thread-456",
      toolName: "screen_capture",
      riskLevel: "safe",
      kind: "approval",
      params: {},
    })
    registerSlackApprovalHandler({ sendApprovalRequest })
    setActiveSlackConversationForSession(
      "session-slack-message-task0847",
      "C_APPROVAL",
      "U_APPROVER",
      "thread-456",
      "en",
    )

    eventBus.emit("approval.request", {
      approvalId: "approval-message-task0847",
      runId: "run-slack-message-task0847",
      toolName: "screen_capture",
      params: {},
      kind: "approval",
      resolve,
    })
    await new Promise((resolveTick) => setTimeout(resolveTick, 0))

    await expect(handleSlackApprovalAction({
      runId: "run-slack-message-task0847",
      decision: "deny",
      channelId: "C_APPROVAL",
      threadTs: "thread-456",
      userId: "U_APPROVER",
      noticeRendering: createPassThroughNoticeRendering(),
      reply,
    })).resolves.toBe(true)
    resolveApprovalRegistryDecision({
      approvalId: approval.id,
      decision: "deny",
      decisionBy: "U_APPROVER",
      decisionSource: "slack",
    })
    await expect(handleSlackApprovalMessage({
      channelId: "C_APPROVAL",
      threadTs: "thread-456",
      userId: "U_APPROVER",
      text: "deny",
      noticeRendering: createPassThroughNoticeRendering(),
      reply,
    })).resolves.toBe(true)

    expect(reply).toHaveBeenNthCalledWith(1, "Denied and cancelled the request.")
    expect(reply).toHaveBeenNthCalledWith(2, "This approval request was already denied. Run the request again if approval is still needed.")
  })
})
