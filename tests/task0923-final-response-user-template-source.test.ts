import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import { renderFinalResponseText } from "../packages/core/src/runs/final-response-renderer.ts"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.js"

const identityContext = {
  promptLocale: "ko" as const,
  mainAgentSelfName: "마당쇠",
  promptContext: "[Trusted Main Agent Identity]\nCurrent main-agent self name: `마당쇠`\n",
}

describe("task0923 final response rewrite input prompt source", () => {
  it("registers final response user input as a file-backed internal prompt source", () => {
    const source = loadPromptSourceRegistry(process.cwd())
      .find((item) => item.sourceId === "final_response_user" && item.locale === "en")

    expect(source).toMatchObject({
      sourceId: "final_response_user",
      usageScope: "internal",
      enabled: true,
    })
    expect(source?.path.endsWith("prompts/final_response_user.md")).toBe(true)
    expect(source?.content).toContain("{{originalRequest}}")
    expect(source?.content).toContain("{{rawText}}")
    expect(source?.content).toContain("{{textSource}}")
  })

  it("renders final response provider user input from the prompt source", async () => {
    const chat = vi.fn(async function* (input: {
      messages: Array<{ role: string; content: string }>
    }) {
      expect(input.messages[0]?.content).toContain("[Final Response Rewrite Input]")
      expect(input.messages[0]?.content).toContain("Original user request:\n내 작업 결과 알려줘")
      expect(input.messages[0]?.content).toContain("Raw completion text:\n완료했습니다.")
      expect(input.messages[0]?.content).toContain("Raw text source: runtime_deterministic")
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

    expect(result?.text).toBe("작업을 완료했습니다.")
  })

  it("does not keep the final response rewrite input envelope hardcoded in TypeScript", () => {
    const source = readFileSync("packages/core/src/runs/final-response-renderer.ts", "utf-8")

    expect(source).toContain('sourceId: "final_response_user"')
    expect(source).not.toContain("[Final Response Rewrite Input]")
    expect(source).not.toContain("Original user request:")
    expect(source).not.toContain("Raw completion text:")
  })
})
