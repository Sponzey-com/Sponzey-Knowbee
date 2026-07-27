import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { eventBus } from "../packages/core/src/events/index.js"
import { buildApprovalKeyboard } from "../packages/core/src/channels/telegram/keyboards.ts"

const getRootRunMock = vi.fn()

vi.mock("../packages/core/src/runs/store.js", () => ({
  getRootRun: (...args: unknown[]) => getRootRunMock(...args),
}))

const {
  registerApprovalHandler,
  resetTelegramApprovalStateForTest,
  setActiveChatForSession,
} = await import("../packages/core/src/channels/telegram/approval-handler.ts")

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  getRootRunMock.mockReset()
  resetTelegramApprovalStateForTest()
})

afterEach(() => {
  resetTelegramApprovalStateForTest()
})

describe("task0841 Telegram approval request language boundary", () => {
  it("keeps Korean approval keyboard labels by default and supports English labels explicitly", () => {
    expect(JSON.parse(JSON.stringify(buildApprovalKeyboard("run-ko")))).toEqual({
      inline_keyboard: [
        [{ text: "✅ 전체 승인", callback_data: "approve:run-ko:all" }],
        [{ text: "🔹 이번 단계만", callback_data: "approve:run-ko:once" }],
        [{ text: "❌ 거부 후 취소", callback_data: "deny:run-ko" }],
      ],
    })
    expect(JSON.parse(JSON.stringify(buildApprovalKeyboard("run-en", "en")))).toEqual({
      inline_keyboard: [
        [{ text: "✅ Approve all", callback_data: "approve:run-en:all" }],
        [{ text: "🔹 This step only", callback_data: "approve:run-en:once" }],
        [{ text: "❌ Deny and cancel", callback_data: "deny:run-en" }],
      ],
    })
  })

  it("uses active chat language for Telegram approval request text and keyboard", async () => {
    const bot = {
      api: {
        sendMessage: vi.fn(async () => ({ message_id: 8481 })),
        editMessageText: vi.fn(async () => undefined),
      },
      on: vi.fn(),
    }
    const resolve = vi.fn()

    getRootRunMock.mockReturnValue({
      source: "telegram",
      sessionId: "session-telegram-task0841",
    })

    registerApprovalHandler(bot as never)
    setActiveChatForSession("session-telegram-task0841", 1001, 2002, 3003, "en")

    eventBus.emit("approval.request", {
      runId: "run-telegram-task0841",
      toolName: "screen_capture",
      params: { extensionId: "yeonjang-main" },
      kind: "approval",
      resolve,
    })
    await flushMicrotasks()

    expect(bot.api.sendMessage).toHaveBeenCalledWith(
      1001,
      expect.stringContaining("Tool execution approval request"),
      expect.objectContaining({
        message_thread_id: 3003,
        reply_markup: expect.objectContaining({
          inline_keyboard: [
            [{ text: "✅ Approve all", callback_data: "approve:run-telegram-task0841:all" }],
            [{ text: "🔹 This step only", callback_data: "approve:run-telegram-task0841:once" }],
            [{ text: "❌ Deny and cancel", callback_data: "deny:run-telegram-task0841" }],
          ],
        }),
      }),
    )
  })

  it("passes Telegram inbound message language into active approval chat registration", () => {
    const source = readFileSync(
      join(process.cwd(), "packages/core/src/channels/telegram/bot.ts"),
      "utf8",
    )

    expect(source).toContain("const language = resolveTelegramInboundMessageLanguage(text)")
    expect(source).toContain("setActiveChatForSession(sessionId, chatId, userId, threadId, language)")
    expect(source).not.toContain("const approvalLanguage = resolveTelegramApprovalRequestLanguage(ctx.from?.language_code)")
  })
})
