import { describe, expect, it, vi } from "vitest"
import { renderFinalResponseText } from "../packages/core/src/runs/final-response-renderer.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.js"

const identityContext = {
  promptLocale: "ko" as const,
  mainAgentSelfName: "마당쇠",
  promptContext: "[Trusted Main Agent Identity]\nCurrent main-agent self name: `마당쇠`\n",
}

describe("task0667 final response renderer prompt source contract", () => {
  it("uses final_response.md as the provider system prompt", async () => {
    const chat = vi.fn(async function* (input: {
      system: string
      messages: Array<{ role: string; content: string }>
    }) {
      expect(input.system).toContain("# Final Response Policy")
      expect(input.system).toContain("Own the final user-facing natural-language answer.")
      expect(input.messages[0]?.content).toContain("Original user request:\n내 작업 결과 알려줘")
      expect(input.messages[0]?.content).toContain("Raw completion text:\n완료했습니다.")
      expect(input.messages[0]?.content).toContain("Raw text source: runtime_deterministic")
      expect(input.messages[0]?.content).not.toContain("Use the same language as the original user request.")
      expect(input.messages[0]?.content).not.toContain("Keep the answer concise and factual.")
      expect(input.messages[0]?.content).not.toContain("Do not expose internal IDs")
      yield { type: "text_delta", delta: "작업을 완료했습니다." } as const
    })

    const result = await renderFinalResponseText({
      config: DEFAULT_CONFIG,
      originalRequest: "내 작업 결과 알려줘",
      rawText: "완료했습니다.",
      textSource: "runtime_deterministic",
      model: "gpt-test",
      provider: { chat },
      workDir: process.cwd(),
      identityContext,
    })

    expect(result).toEqual(expect.objectContaining({
      text: "작업을 완료했습니다.",
      textSource: "llm_reviewed",
      promptSourceId: "final_response",
      rawTextSource: "runtime_deterministic",
      reviewReceipt: expect.objectContaining({
        reviewedBy: "llm_final_response",
        promptSourceId: "final_response",
      }),
    }))
    expect(chat).toHaveBeenCalledTimes(1)
  })
})
