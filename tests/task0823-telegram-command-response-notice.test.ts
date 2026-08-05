import { describe, expect, it } from "vitest"
import {
  buildTelegramCommandResponse,
  buildTelegramCommandResponseNotice,
} from "../packages/core/src/channels/telegram/commands.ts"

describe("task0823 Telegram command response notice", () => {
  it("builds command notices as non-final channel control notices", () => {
    expect(buildTelegramCommandResponseNotice("status")).toEqual({
      kind: "telegram_command_response_notice",
      command: "status",
      language: "en",
      deliveryMode: "command_response",
      textSource: "telegram_command_control_notice",
      renderingRequired: "llm_final_response",
      assistantIdentityClaim: false,
      finalAnswer: false,
    })
  })

  it("attaches notice metadata to status command responses", () => {
    const response = buildTelegramCommandResponse({
      command: "status",
      sessionKey: "telegram:1:main",
      runningCount: 1,
      status: {
        sessionId: "session-1",
        runId: "run-1",
        running: true,
      },
    })

    expect(response.notice).toMatchObject({
      kind: "telegram_command_response_notice",
      command: "status",
      language: "en",
      deliveryMode: "command_response",
      finalAnswer: false,
      assistantIdentityClaim: false,
    })
    expect(response.notice.textSource).toBe(response.textSource)
    expect(response.notice.renderingRequired).toBe(response.renderingRequired)
  })

  it.each(["start", "new", "cancel", "status", "help"] as const)(
    "attaches command notice to %s responses",
    (command) => {
      expect(buildTelegramCommandResponse({ command }).notice).toMatchObject({
        kind: "telegram_command_response_notice",
        command,
        language: "en",
        finalAnswer: false,
        assistantIdentityClaim: false,
      })
    },
  )
})
