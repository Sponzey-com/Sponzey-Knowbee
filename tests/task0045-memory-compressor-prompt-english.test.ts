import { describe, expect, it, vi } from "vitest"
import { compressContext } from "../packages/core/src/memory/compressor.ts"
import type { AIProvider, ChatParams, Message } from "../packages/core/src/ai/types.ts"
import type { DbMessage } from "../packages/core/src/db/index.ts"

function createMessages(count: number): Message[] {
  return Array.from({ length: count }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: `message ${index}`,
  }))
}

function createDbMessages(count: number): DbMessage[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `db-message-${index}`,
    session_id: "session-compressor",
    root_run_id: "run-compressor",
    role: index % 2 === 0 ? "user" : "assistant",
    content: `message ${index}`,
    tool_calls: null,
    tool_call_id: null,
    created_at: index,
  }))
}

describe("task0045 memory compressor prompt English normalization", () => {
  it("uses an English summarization prompt and English compressed memory label", async () => {
    let capturedParams: ChatParams | undefined
    const provider: AIProvider = {
      id: "test-provider",
      supportedModels: ["test-model"],
      maxContextTokens: () => 100_000,
      chat: vi.fn(async function* (params: ChatParams) {
        capturedParams = params
        yield { type: "text_delta", delta: "Important decisions and executed commands summarized." } as const
        yield {
          type: "message_stop",
          usage: { input_tokens: 1, output_tokens: 1 },
        } as const
      }),
    }

    const result = await compressContext(
      createMessages(12),
      createDbMessages(12),
      provider,
      "test-model",
    )

    expect(capturedParams?.messages[0]?.content).toContain("Summarize the following conversation concisely.")
    expect(capturedParams?.messages[0]?.content).toContain("[Conversation]")
    expect(capturedParams?.messages[0]?.content).toContain("User: message 0")
    expect(capturedParams?.messages[0]?.content).toContain("Assistant: message 1")
    expect(capturedParams?.messages[0]?.content).not.toContain("다음 대화 내용을")
    expect(capturedParams?.messages[0]?.content).not.toContain("[대화 내용]")
    expect(result.messages[0]).toEqual({
      role: "user",
      content: "[Previous Conversation Summary]\nImportant decisions and executed commands summarized.",
    })
    expect(result.compressedIds).toEqual(["db-message-0", "db-message-1"])
  })
})
