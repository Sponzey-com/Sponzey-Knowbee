import { describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.js"
import {
  finalResponseRenderProvenanceEvent,
  renderFinalResponseText,
} from "../packages/core/src/runs/final-response-renderer.ts"

const identityContext = {
  promptLocale: "ko" as const,
  mainAgentSelfName: "마당쇠",
  promptContext: "[Trusted Main Agent Identity]\nCurrent main-agent self name: `마당쇠`\n",
}

describe("task0783 final response render provenance", () => {
  it("marks rendered user-facing text as LLM-reviewed final_response output", async () => {
    const chat = vi.fn(async function* () {
      yield { type: "text_delta", delta: "처리할 수 있는 부분을 먼저 정리했습니다." } as const
    })

    const result = await renderFinalResponseText({
      config: DEFAULT_CONFIG,
      originalRequest: "연장이 없으면 어떻게 돼?",
      rawText: "YEONJANG_REQUIRED",
      textSource: "runtime_deterministic",
      model: "gpt-test",
      provider: { chat },
      workDir: process.cwd(),
      identityContext,
    })

    expect(result).toEqual(expect.objectContaining({
      text: "처리할 수 있는 부분을 먼저 정리했습니다.",
      textSource: "llm_reviewed",
      promptSourceId: "final_response",
      rawTextSource: "runtime_deterministic",
      reviewReceipt: expect.objectContaining({
        reviewedBy: "llm_final_response",
        contentKind: "fixed_notice",
        responseLanguage: "ko",
      }),
    }))
  })

  it("formats final response render provenance events with safe defaults", () => {
    expect(finalResponseRenderProvenanceEvent({
      eventPrefix: "user_facing_completion",
      rendered: {
        textSource: "llm_reviewed",
        promptSourceId: "final_response",
        rawTextSource: "runtime_deterministic",
      },
      fallbackRawTextSource: "mixed",
    })).toBe("user_facing_completion_provenance:llm_reviewed:final_response:runtime_deterministic")

    expect(finalResponseRenderProvenanceEvent({
      eventPrefix: "user_facing_completion",
      rendered: {},
      fallbackRawTextSource: "mixed",
    })).toBe("user_facing_completion_provenance:llm_reviewed:final_response:mixed")
  })
})
