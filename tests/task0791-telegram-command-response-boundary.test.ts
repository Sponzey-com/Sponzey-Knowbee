import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  buildTelegramCommandResponse,
  replyTelegramCommandResponse,
  resolveTelegramCommandReply,
} from "../packages/core/src/channels/telegram/commands.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.js"
import { buildReviewedFinalResponse } from "./fixtures/final-response-review.ts"

const identityContext = {
  promptLocale: "en" as const,
  mainAgentSelfName: "Knowbee",
  promptContext: "[Trusted Main Agent Identity]\nCurrent main-agent self name: `Knowbee`\n",
}

describe("task0791 telegram command response boundary", () => {
  it("does not claim a hard-coded assistant identity in the start command", () => {
    const response = buildTelegramCommandResponse({
      command: "start",
      userFirstName: "Operator",
    })

    expect(response.command).toBe("start")
    expect(response.language).toBe("en")
    expect(response.textSource).toBe("telegram_command_control_notice")
    expect(response.renderingRequired).toBe("llm_final_response")
    expect(response.assistantIdentityClaim).toBe(false)
    expect(response.notice).toMatchObject({
      kind: "telegram_command_response_notice",
      command: "start",
      language: "en",
      finalAnswer: false,
      assistantIdentityClaim: false,
    })
    expect(response.text).not.toContain("I'm")
    expect(response.text).not.toContain("personal AI assistant")
    expect(response.text).not.toContain("스폰지 노비")
  })

  it("builds status as a channel control notice with operational fields", () => {
    const response = buildTelegramCommandResponse({
      command: "status",
      sessionKey: "telegram:1:main",
      runningCount: 2,
      status: {
        sessionId: "session-1",
        runId: "run-1",
        running: true,
      },
    })

    expect(response).toMatchObject({
      command: "status",
      textSource: "telegram_command_control_notice",
      assistantIdentityClaim: false,
      notice: {
        kind: "telegram_command_response_notice",
        command: "status",
        language: "en",
        finalAnswer: false,
        assistantIdentityClaim: false,
      },
      parseMode: "Markdown",
    })
    expect(response.text).toContain("Session Key: `telegram:1:main`")
    expect(response.text).toContain("Running: Yes")
    expect(response.text).toContain("Active Tasks: 2")
  })

  it("replies with final-response-rendered command text instead of raw command text", async () => {
    const response = buildTelegramCommandResponse({
      command: "start",
      userFirstName: "Operator",
    })
    const reply = vi.fn(async () => undefined)
    const renderFinalResponseText = vi.fn(async (input) =>
      buildReviewedFinalResponse(input, "Rendered command reply"))

    await replyTelegramCommandResponse({ reply }, response, {
      config: DEFAULT_CONFIG,
      renderFinalResponseText,
      getDefaultModel: () => "gpt-test",
      workDir: "/tmp",
      identityContext,
    })

    expect(renderFinalResponseText).toHaveBeenCalledWith(expect.objectContaining({
      originalRequest: "Telegram command /start",
      rawText: response.text,
      textSource: "runtime_deterministic",
      model: "gpt-test",
      workDir: "/tmp",
      identityContext,
    }))
    expect(reply).toHaveBeenCalledWith("Rendered command reply")
    expect(JSON.stringify(reply.mock.calls)).not.toContain(response.text)
  })

  it("derives command reply identity context from the explicit config", async () => {
    const response = buildTelegramCommandResponse({
      command: "help",
    })
    const renderFinalResponseText = vi.fn(async (input) =>
      buildReviewedFinalResponse(input, "Rendered command reply"))

    const resolution = await resolveTelegramCommandReply(response, {
      config: DEFAULT_CONFIG,
      renderFinalResponseText,
      getDefaultModel: () => "gpt-test",
      workDir: "/tmp",
    })

    expect(resolution).toEqual(expect.objectContaining({
      status: "ready",
      text: "Rendered command reply",
      textSource: "llm_reviewed",
    }))
    expect(renderFinalResponseText).toHaveBeenCalledWith(expect.objectContaining({
      identityContext: expect.objectContaining({
        mainAgentSelfName: expect.any(String),
        promptContext: expect.any(String),
      }),
    }))
  })

  it("does not send raw command text when final response rendering fails", async () => {
    const response = buildTelegramCommandResponse({
      command: "help",
    })
    const reply = vi.fn(async () => undefined)

    await replyTelegramCommandResponse({ reply }, response, {
      config: DEFAULT_CONFIG,
      renderFinalResponseText: vi.fn(async () => null),
      getDefaultModel: () => "gpt-test",
      workDir: "/tmp",
      identityContext,
    })

    expect(reply).not.toHaveBeenCalled()
  })

  it("does not read global config inside telegram command reply rendering", () => {
    const source = readFileSync("packages/core/src/channels/telegram/commands.ts", "utf-8")
    const botSource = readFileSync("packages/core/src/channels/telegram/bot.ts", "utf-8")

    expect(source).not.toContain("../config/index.js")
    expect(source).not.toContain("getConfig(")
    expect(source).toContain("identityContext")
    expect(botSource).toContain("registerCommands(this.bot, this, this.noticeRendering)")
  })
})
