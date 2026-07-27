import { describe, expect, it } from "vitest"
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

describe("cli chunk delivery helper", () => {
  it("writes reviewed text chunks to stdout", async () => {
    const stdout = createBufferWriter()
    const stderr = createBufferWriter()
    const handleChunk = createCliChunkDeliveryHandler({ stdout, stderr })

    await handleChunk({ type: "text", delta: "Hello", textSource: "llm_reviewed" })

    expect(stdout.read()).toBe("Hello")
    expect(stderr.read()).toBe("")
  })

  it("does not print unreviewed text chunks", async () => {
    const stdout = createBufferWriter()
    const stderr = createBufferWriter()
    const handleChunk = createCliChunkDeliveryHandler({ stdout, stderr })

    await handleChunk({ type: "text", delta: "raw model output" })
    await handleChunk({ type: "text", delta: "raw model output", textSource: "llm_generated" })

    expect(stdout.read()).toBe("")
    expect(stderr.read()).toBe("")
  })

  it("writes tool lifecycle messages to stderr", async () => {
    const stdout = createBufferWriter()
    const stderr = createBufferWriter()
    const handleChunk = createCliChunkDeliveryHandler({ stdout, stderr })

    await handleChunk({ type: "tool_start", toolName: "screen_capture", params: { full: true } })
    await handleChunk({ type: "tool_end", toolName: "screen_capture", success: true, output: "ok" })

    expect(stderr.read()).toContain("screen_capture")
    expect(stderr.read()).toContain("✓")
  })

  it("redacts internal evidence from tool params before writing it to stderr", async () => {
    const stdout = createBufferWriter()
    const stderr = createBufferWriter()
    const handleChunk = createCliChunkDeliveryHandler({ stdout, stderr })

    await handleChunk({
      type: "tool_start",
      toolName: "yeonjang_control",
      params: {
        operationId: "operation:run-086",
        summary:
          "yeonjang-goal-validation:camera_capture:candidate_not_validated:result_diagnosis_not_sufficient receipt payload raw observed state structured diagnosis payload",
      },
    })

    const output = stderr.read()
    expect(output).toContain("[internal-evidence-redacted]")
    expect(output).not.toContain("operationId")
    expect(output).not.toContain("operation:run-086")
    expect(output).not.toContain("yeonjang-goal-validation")
    expect(output).not.toContain("receipt payload")
    expect(output).not.toContain("raw observed state")
    expect(output).not.toContain("structured diagnosis payload")
  })

  it("sanitizes failed tool output before writing it to stderr", async () => {
    const stdout = createBufferWriter()
    const stderr = createBufferWriter()
    const handleChunk = createCliChunkDeliveryHandler({ stdout, stderr })

    await handleChunk({
      type: "tool_end",
      toolName: "screen_capture",
      success: false,
      output: [
        "401 invalid api key: sk-cli-secret",
        "    at screenCapture (/Users/me/private/screen.ts:12:3)",
      ].join("\n"),
    })

    expect(stderr.read()).toContain("✗ screen_capture: 인증 또는 접근 차단 문제로 요청이 실패했습니다.")
    expect(stderr.read()).not.toContain("sk-cli-secret")
    expect(stderr.read()).not.toContain("/Users/me/private")
  })

  it("redacts internal evidence from failed tool output before writing it to stderr", async () => {
    const stdout = createBufferWriter()
    const stderr = createBufferWriter()
    const handleChunk = createCliChunkDeliveryHandler({ stdout, stderr })

    await handleChunk({
      type: "tool_end",
      toolName: "yeonjang_control",
      success: false,
      output:
        "failed yeonjang-goal-validation:camera_capture:candidate_not_validated:result_diagnosis_not_sufficient operationId=operation:run-086 raw observed state",
    })

    const output = stderr.read()
    expect(output).toContain("[internal-evidence-redacted]")
    expect(output).not.toContain("yeonjang-goal-validation")
    expect(output).not.toContain("operationId")
    expect(output).not.toContain("operation:run-086")
    expect(output).not.toContain("raw observed state")
  })

  it("writes rendered error chunk notices to stderr", async () => {
    const stdout = createBufferWriter()
    const stderr = createBufferWriter()
    const handleChunk = createCliChunkDeliveryHandler({
      stdout,
      stderr,
      noticeRendering: {
        config: DEFAULT_CONFIG,
        workDir: DEFAULT_CONFIG.profile.workspace,
        getDefaultModel: () => "gpt-test",
        renderFinalResponseText: async (input) =>
          buildReviewedFinalResponse(input, `rendered ${input.rawText}`),
      },
    })

    await handleChunk({ type: "error", message: "failure" })

    expect(stderr.read()).toContain("rendered Execution failed. Reason: failure")
  })

  it("does not print raw error chunk notices when rendering is unavailable", async () => {
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
})
