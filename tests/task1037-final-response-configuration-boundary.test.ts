import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import { renderFinalResponseText } from "../packages/core/src/runs/final-response-renderer.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.js"

describe("task1037 final response configuration boundary", () => {
  it("does not read global config inside the renderer", () => {
    const source = readFileSync(
      "packages/core/src/runs/final-response-renderer.ts",
      "utf-8",
    )

    expect(source).not.toContain("../config/index.js")
    expect(source).not.toContain("getConfig(")
    expect(source).toContain("identityContext")
  })

  it("requires an explicit identity context before calling the provider", async () => {
    const chat = vi.fn(async function* () {
      yield { type: "text_delta", delta: "호출되면 안 됩니다." } as const
    })

    const result = await renderFinalResponseText({
      config: DEFAULT_CONFIG,
      originalRequest: "니 이름이 뭐니?",
      rawText: "제 이름은 마당쇠입니다.",
      textSource: "llm_generated",
      model: "gpt-test",
      provider: { chat },
      workDir: process.cwd(),
    })

    expect(result).toBeNull()
    expect(chat).not.toHaveBeenCalled()
  })

  it("passes the explicit identity context into the provider system prompt", async () => {
    const chat = vi.fn(async function* (input: { system: string }) {
      expect(input.system).toContain("[Trusted Main Agent Identity]")
      expect(input.system).toContain("Current main-agent self name: `마당쇠`")
      yield { type: "text_delta", delta: "제 이름은 마당쇠입니다." } as const
    })

    const result = await renderFinalResponseText({
      config: DEFAULT_CONFIG,
      originalRequest: "니 이름이 뭐니?",
      rawText: "제 이름은 마당쇠입니다.",
      textSource: "llm_generated",
      model: "gpt-test",
      provider: { chat },
      workDir: process.cwd(),
      identityContext: {
        promptLocale: "ko",
        mainAgentSelfName: "마당쇠",
        promptContext: "[Trusted Main Agent Identity]\nCurrent main-agent self name: `마당쇠`\n",
      },
    })

    expect(result?.text).toBe("제 이름은 마당쇠입니다.")
    expect(chat).toHaveBeenCalledTimes(1)
  })
})
