import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { eventBus } from "../packages/core/src/events/index.js"

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

describe("task0853 Telegram pending approval callback request language boundary", () => {
  it("uses pending request language for requester approval callback even when Telegram language_code differs", async () => {
    const callbackHandlers: Array<(ctx: {
      callbackQuery: { data: string }
      from: { id: number; first_name?: string; username?: string; language_code?: string }
      answerCallbackQuery: (text?: string) => Promise<void>
    }) => Promise<void>> = []
    const bot = {
      api: {
        sendMessage: vi.fn(async () => ({ message_id: 853 })),
        editMessageText: vi.fn(async () => undefined),
        editMessageReplyMarkup: vi.fn(async () => undefined),
      },
      on: vi.fn((event: string, handler: (typeof callbackHandlers)[number]) => {
        if (event === "callback_query:data") callbackHandlers.push(handler)
      }),
    }
    const resolve = vi.fn()
    const answerCallbackQuery = vi.fn(async () => undefined)

    getRootRunMock.mockReturnValue({
      source: "telegram",
      sessionId: "session-telegram-task0853",
    })

    registerApprovalHandler(bot as never)
    setActiveChatForSession("session-telegram-task0853", 1001, 2002, 3003, "en")

    eventBus.emit("approval.request", {
      runId: "run-telegram-task0853",
      toolName: "screen_capture",
      params: { extensionId: "yeonjang-main" },
      kind: "approval",
      resolve,
    })
    await flushMicrotasks()

    await callbackHandlers[0]?.({
      callbackQuery: { data: "approve:run-telegram-task0853:all" },
      from: { id: 2002, first_name: "Tester", language_code: "ko-KR" },
      answerCallbackQuery,
    })

    expect(resolve).toHaveBeenCalledWith("allow_run", "user")
    expect(answerCallbackQuery).toHaveBeenCalledWith("Approved for this request.")
    expect(bot.api.editMessageReplyMarkup).toHaveBeenCalledWith(
      1001,
      853,
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          inline_keyboard: [
            [{ text: "✅ Tester approved this whole request", callback_data: "noop" }],
          ],
        }),
      }),
    )
  })
})
