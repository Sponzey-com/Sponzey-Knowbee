import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { buildCliChunkErrorNotice } from "../packages/cli/src/chunk-error-notice.ts"
import { createCliChunkDeliveryHandler } from "../packages/cli/src/chunk-delivery.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.js"
import { buildReviewedFinalResponse } from "./fixtures/final-response-review.ts"

function createBufferWriter() {
  let buffer = ""
  return {
    write(text: string) {
      buffer += text
    },
    read() {
      return buffer
    },
    isTTY: false,
  }
}

describe("task0801 CLI chunk error notice", () => {
  it("builds CLI chunk error diagnostic notice", () => {
    expect(buildCliChunkErrorNotice({
      reason: "execution failed",
    })).toEqual({
      kind: "cli_chunk_error",
      surface: "cli",
      stage: "chunk_delivery",
      reason: "execution failed",
      text: "Execution failed. Reason: execution failed",
      deliveryMode: "diagnostic",
      textSource: "cli_chunk_error_notice",
      renderingRequired: "llm_final_response",
      finalAnswer: false,
      assistantIdentityClaim: false,
    })
  })

  it("prints rendered sanitized diagnostic notice instead of raw Error text", async () => {
    const stdout = createBufferWriter()
    const stderr = createBufferWriter()
    const handleChunk = createCliChunkDeliveryHandler({
      stdout,
      stderr,
      originalRequest: "명령을 실행해줘",
      noticeRendering: {
        config: DEFAULT_CONFIG,
        workDir: DEFAULT_CONFIG.profile.workspace,
        getDefaultModel: () => "gpt-test",
        renderFinalResponseText: async (input) =>
          buildReviewedFinalResponse(input, `rendered: ${input.rawText}`),
      },
    })

    await handleChunk({
      type: "error",
      message: [
        "401 invalid api key: sk-cli-error-secret",
        "    at run (/Users/me/private/run.ts:12:3)",
      ].join("\n"),
    })

    expect(stderr.read()).toContain("rendered: Execution failed. Reason: 인증 또는 접근 차단 문제로 요청이 실패했습니다.")
    expect(stderr.read()).not.toContain("Error: 401")
    expect(stderr.read()).not.toContain("sk-cli-error-secret")
    expect(stderr.read()).not.toContain("/Users/me/private")
  })

  it("does not print raw CLI chunk error notice when rendering fails", async () => {
    const stdout = createBufferWriter()
    const stderr = createBufferWriter()
    const handleChunk = createCliChunkDeliveryHandler({
      stdout,
      stderr,
      noticeRendering: {
        config: DEFAULT_CONFIG,
        workDir: DEFAULT_CONFIG.profile.workspace,
        getDefaultModel: () => "gpt-test",
        renderFinalResponseText: async () => null,
      },
    })

    await handleChunk({ type: "error", message: "failure" })

    expect(stderr.read()).toBe("")
  })

  it("keeps CLI chunk error delivery behind final response rendering", () => {
    const source = readFileSync("packages/cli/src/chunk-delivery.ts", "utf8")

    expect(source).toContain("renderUserFacingNoticeText")
    expect(source).toContain("renderedNotice.status")
    expect(source).not.toContain("colorize(stdoutIsTty, RED, notice.text)")
  })
})
