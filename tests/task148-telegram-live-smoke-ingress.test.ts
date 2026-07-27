import { describe, expect, it, vi } from "vitest"
import { TelegramChannel } from "../packages/core/src/channels/telegram/bot.ts"
import type { RootRun } from "../packages/core/src/runs/types.ts"

interface TelegramChannelInternals {
  bot: {
    isRunning(): boolean
    handleUpdate(update: {
      message?: {
        message_id: number
        text?: string
        chat: { id: number }
        from?: { id: number }
        message_thread_id?: number
      }
    }): Promise<void>
  }
  liveSmokeStartObservers: Map<
    string,
    (receipt: {
      requestId: string
      runId: string
      requestGroupId: string
      finished: Promise<RootRun | undefined>
    }) => void
  >
}

function channel() {
  return new TelegramChannel(
    {
      enabled: true,
      botToken: "148:test-token",
      allowedUserIds: [148],
      allowedGroupIds: [-100148],
    },
    {} as ConstructorParameters<typeof TelegramChannel>[1],
  )
}

describe("Task 148 Telegram live smoke inbound boundary", () => {
  it("does not inject a provider update when runtime or target authorization is unavailable", async () => {
    const instance = channel()
    const internals = instance as unknown as TelegramChannelInternals
    const handleUpdate = vi.fn(async () => undefined)
    internals.bot.handleUpdate = handleUpdate

    await expect(
      instance.acceptLiveSmokeRequest({
        request: "status",
        target: { chatId: -100148, userId: 148, threadId: 7 },
      }),
    ).rejects.toThrow("telegram_live_smoke_runtime_unavailable")
    expect(handleUpdate).not.toHaveBeenCalled()

    internals.bot.isRunning = () => true
    await expect(
      instance.acceptLiveSmokeRequest({
        request: "status",
        target: { chatId: -100999, userId: 999, threadId: 7 },
      }),
    ).rejects.toThrow("telegram_live_smoke_target_not_allowed")
    expect(handleUpdate).not.toHaveBeenCalled()
  })

  it("injects an authorized request through Bot.handleUpdate and returns its canonical run", async () => {
    const instance = channel()
    const internals = instance as unknown as TelegramChannelInternals
    internals.bot.isRunning = () => true
    internals.bot.handleUpdate = vi.fn(async (update) => {
      const message = update.message
      if (!message) throw new Error("message missing")
      const key = `${message.chat.id}:${message.message_thread_id ?? "main"}:${message.message_id}`
      internals.liveSmokeStartObservers.get(key)?.({
        requestId: "run-148",
        runId: "run-148",
        requestGroupId: "run-148",
        finished: Promise.resolve(undefined),
      })
    })

    await expect(
      instance.acceptLiveSmokeRequest({
        request: "Report current status.",
        target: { chatId: -100148, userId: 148, threadId: 7 },
      }),
    ).resolves.toMatchObject({
      requestId: "run-148",
      runId: "run-148",
      requestGroupId: "run-148",
    })
    expect(internals.bot.handleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({
          text: "Report current status.",
          chat: expect.objectContaining({ id: -100148 }),
          from: expect.objectContaining({ id: 148 }),
          message_thread_id: 7,
        }),
      }),
    )
  })
})
