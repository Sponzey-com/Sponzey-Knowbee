import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { eventBus } from "../packages/core/src/events/index.js"
import { createTestDbRuntimeFixture, type TestDbRuntimeFixture } from "./fixtures/runtime-db.ts"

const getRootRunMock = vi.fn()
let dbRuntime: TestDbRuntimeFixture

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
  dbRuntime = createTestDbRuntimeFixture("knowbee-telegram-late-approval-")
  getRootRunMock.mockReset()
  resetTelegramApprovalStateForTest()
})

afterEach(() => {
  resetTelegramApprovalStateForTest()
  dbRuntime.dispose()
})

describe("task0854 Telegram late approval resolved language boundary", () => {
  it("uses cached resolved request language for duplicate Telegram approval callbacks", async () => {
    const callbackHandlers: Array<(ctx: {
      callbackQuery: { data: string }
      from: { id: number; first_name?: string; username?: string; language_code?: string }
      answerCallbackQuery: (text?: string) => Promise<void>
    }) => Promise<void>> = []
    const bot = {
      api: {
        sendMessage: vi.fn(async () => ({ message_id: 854 })),
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
      sessionId: "session-telegram-task0854",
    })

    registerApprovalHandler(bot as never)
    setActiveChatForSession("session-telegram-task0854", 1001, 2002, 3003, "en")

    eventBus.emit("approval.request", {
      runId: "run-telegram-task0854",
      toolName: "screen_capture",
      params: { extensionId: "yeonjang-main" },
      kind: "approval",
      resolve,
    })
    await flushMicrotasks()

    await callbackHandlers[0]?.({
      callbackQuery: { data: "approve:run-telegram-task0854:all" },
      from: { id: 2002, first_name: "Tester", language_code: "ko-KR" },
      answerCallbackQuery,
    })
    await callbackHandlers[0]?.({
      callbackQuery: { data: "approve:run-telegram-task0854:all" },
      from: { id: 2002, first_name: "Tester", language_code: "ko-KR" },
      answerCallbackQuery,
    })

    expect(answerCallbackQuery).toHaveBeenNthCalledWith(1, "Approved for this request.")
    expect(answerCallbackQuery).toHaveBeenNthCalledWith(2, "This approval request has already been handled.")
  })
})
