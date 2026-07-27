import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import type { AIProvider, ChatParams, Message } from "../packages/core/src/ai/types.ts"
import type { DbMessage } from "../packages/core/src/db/index.ts"
import { compressContext } from "../packages/core/src/memory/compressor.ts"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"

const repoRoot = process.cwd()

function dbMessage(id: string, role: string, content: string): DbMessage {
  return {
    id,
    session_id: "session-transcript-labels",
    root_run_id: "run-transcript-labels",
    role,
    content,
    tool_calls: null,
    tool_call_id: null,
    created_at: Number(id.replace(/\D+/g, "")) || 0,
  }
}

describe("task0979 memory compressor transcript labels", () => {
  it("keeps compressor transcript labels in the memory context prompt source", () => {
    const source = loadPromptSourceRegistry(repoRoot).find(
      (item) => item.sourceId === "memory_restore_prompt_context_labels_user" && item.locale === "en",
    )

    expect(source).toMatchObject({ sourceId: "memory_restore_prompt_context_labels_user", usageScope: "internal", enabled: true })
    expect(source?.content).toContain("transcript_user_label=User")
    expect(source?.content).toContain("transcript_assistant_label=Assistant")
    expect(source?.content).toContain("transcript_speaker_separator=:")
    expect(source?.content).toContain("transcript_tool_calls_results_label=[Tool calls/results]")
  })

  it("renders memory compressor transcript labels from source values", async () => {
    let capturedParams: ChatParams | undefined
    const provider: AIProvider = {
      id: "test-provider",
      supportedModels: ["test-model"],
      maxContextTokens: () => 100_000,
      chat: vi.fn(async function* (params: ChatParams) {
        capturedParams = params
        yield { type: "text_delta", delta: "summary" } as const
        yield { type: "message_stop", usage: { input_tokens: 1, output_tokens: 1 } } as const
      }),
    }
    const messages: Message[] = [
      { role: "user", content: "first" },
      { role: "assistant", content: [{ type: "tool_use", id: "call-1", name: "lookup", input: { q: "x" } }] },
      ...Array.from({ length: 10 }, (_, index): Message => ({
        role: index % 2 === 0 ? "user" : "assistant",
        content: `tail ${index}`,
      })),
    ]
    const dbMessages = messages.map((message, index) => dbMessage(`db-${index}`, message.role, typeof message.content === "string" ? message.content : "structured"))

    await compressContext(messages, dbMessages, provider, "test-model")

    expect(capturedParams?.messages[0]?.content).toContain("User: first")
    expect(capturedParams?.messages[0]?.content).toContain("Assistant: [Tool calls/results]")
  })

  it("removes compressor transcript labels from TypeScript", () => {
    const source = readFileSync(join(repoRoot, "packages/core/src/memory/compressor.ts"), "utf8")

    expect(source).toContain("transcript_user_label")
    expect(source).toContain("transcript_tool_calls_results_label")
    expect(source).not.toContain("? \"User\" : \"Assistant\"")
    expect(source).not.toContain("\"[Tool calls/results]\"")
    expect(source).not.toContain("`${role}: ${content.slice(0, 500)}`")
  })
})
