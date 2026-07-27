import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  buildTelegramCommandResponse,
} from "../packages/core/src/channels/telegram/commands.ts"

describe("task0805 Telegram command final answer flag", () => {
  it("marks start command response as non-final notice", () => {
    expect(buildTelegramCommandResponse({
      command: "start",
      userFirstName: "Operator",
    })).toMatchObject({
      command: "start",
      language: "en",
      textSource: "telegram_command_control_notice",
      renderingRequired: "llm_final_response",
      assistantIdentityClaim: false,
      finalAnswer: false,
      notice: {
        kind: "telegram_command_response_notice",
        command: "start",
        language: "en",
        assistantIdentityClaim: false,
        finalAnswer: false,
      },
    })
  })

  it("marks status command response as non-final notice", () => {
    expect(buildTelegramCommandResponse({
      command: "status",
      sessionKey: "telegram:1:main",
    })).toMatchObject({
      command: "status",
      language: "en",
      parseMode: "Markdown",
      finalAnswer: false,
      notice: {
        kind: "telegram_command_response_notice",
        command: "status",
        language: "en",
        finalAnswer: false,
      },
    })
  })

  it("keeps the final answer flag in the command response factory", () => {
    const source = readFileSync(join(process.cwd(), "packages/core/src/channels/telegram/commands.ts"), "utf-8")

    expect(source).toContain("finalAnswer: false")
    expect(source).toContain("function commandResponse")
  })
})
