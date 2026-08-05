import { describe, expect, it } from "vitest"
import {
  createApiServerRuntimeContext,
  parseTelegramLiveSmokeTarget,
} from "../packages/core/src/api/server-runtime-context.ts"
import { createStartupProcessContext } from "../packages/core/src/runtime/startup-process-context.ts"

describe("Task 148 Telegram live smoke startup target", () => {
  it("captures a valid explicit target once without retaining environment access", () => {
    const startup = createStartupProcessContext({
      env: {
        KNOWBEE_CHANNEL_SMOKE_TELEGRAM_CHAT_ID: "-100148",
        KNOWBEE_CHANNEL_SMOKE_TELEGRAM_USER_ID: "148",
        KNOWBEE_CHANNEL_SMOKE_TELEGRAM_THREAD_ID: "7",
      },
      argv: [],
      cwd: "/workspace",
    })

    expect(createApiServerRuntimeContext(startup).telegramLiveSmokeTarget).toEqual({
      chatId: -100148,
      userId: 148,
      threadId: 7,
    })
  })

  it.each([
    [{}, "not_configured"],
    [{ KNOWBEE_CHANNEL_SMOKE_TELEGRAM_CHAT_ID: "1" }, "incomplete"],
    [
      {
        KNOWBEE_CHANNEL_SMOKE_TELEGRAM_CHAT_ID: "chat-private",
        KNOWBEE_CHANNEL_SMOKE_TELEGRAM_USER_ID: "148",
      },
      "invalid",
    ],
    [
      {
        KNOWBEE_CHANNEL_SMOKE_TELEGRAM_CHAT_ID: "-100148",
        KNOWBEE_CHANNEL_SMOKE_TELEGRAM_USER_ID: "148",
        KNOWBEE_CHANNEL_SMOKE_TELEGRAM_THREAD_ID: "0",
      },
      "invalid",
    ],
  ])("rejects absent or malformed target input", (env, reasonCode) => {
    expect(parseTelegramLiveSmokeTarget(env)).toEqual({ status: "unavailable", reasonCode })
  })
})
