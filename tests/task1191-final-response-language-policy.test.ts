import { describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.js"
import { renderFinalResponseText } from "../packages/core/src/runs/final-response-renderer.ts"

const identityContext = {
  promptLocale: "ko" as const,
  mainAgentSelfName: "마당쇠",
  promptContext: "[Trusted Main Agent Identity]\nCurrent main-agent self name: `마당쇠`\n",
}

function providerWithOutputs(outputs: string[]) {
  const chat = vi.fn(async function* () {
    const text = outputs.shift() ?? ""
    yield { type: "text_delta", delta: text } as const
  })
  return { provider: { chat }, chat }
}

describe("task1191 final-response language policy", () => {
  it("repairs a strict response once when the first output uses the wrong language", async () => {
    const { provider, chat } = providerWithOutputs([
      "The task is complete.",
      "요청한 작업을 완료했습니다.",
    ])

    const result = await renderFinalResponseText({
      config: DEFAULT_CONFIG,
      originalRequest: "작업 결과를 알려줘",
      rawText: "done",
      textSource: "runtime_deterministic",
      responseLanguageMode: "same_as_request",
      model: "gpt-test",
      provider,
      workDir: process.cwd(),
      identityContext,
    })

    expect(result?.text).toBe("요청한 작업을 완료했습니다.")
    expect(chat).toHaveBeenCalledTimes(2)
  })

  it("blocks delivery when the one correction attempt still uses the wrong language", async () => {
    const { provider, chat } = providerWithOutputs([
      "The task is complete.",
      "It is definitely complete.",
    ])

    const result = await renderFinalResponseText({
      config: DEFAULT_CONFIG,
      originalRequest: "작업 결과를 알려줘",
      rawText: "done",
      textSource: "runtime_deterministic",
      responseLanguageMode: "same_as_request",
      model: "gpt-test",
      provider,
      workDir: process.cwd(),
      identityContext,
    })

    expect(result).toBeNull()
    expect(chat).toHaveBeenCalledTimes(2)
  })

  it("repairs a strict English response when the first output uses Korean", async () => {
    const { provider, chat } = providerWithOutputs([
      "작업이 완료되었습니다.",
      "The requested task is complete.",
    ])

    const result = await renderFinalResponseText({
      config: DEFAULT_CONFIG,
      originalRequest: "Tell me the result.",
      rawText: "완료",
      textSource: "runtime_deterministic",
      responseLanguageMode: "same_as_request",
      model: "gpt-test",
      provider,
      workDir: process.cwd(),
      identityContext: {
        promptLocale: "en",
        mainAgentSelfName: "Knowbee",
        promptContext: "[Trusted Main Agent Identity]\nCurrent main-agent self name: `Knowbee`\n",
      },
    })

    expect(result?.text).toBe("The requested task is complete.")
    expect(chat).toHaveBeenCalledTimes(2)
  })

  it.each(["translation", "language_comparison", "multilingual"] as const)(
    "allows another language only after independently confirming the explicit %s request",
    async (responseLanguageMode) => {
      const { provider, chat } = providerWithOutputs([
        JSON.stringify({
          allowed: true,
          mode: responseLanguageMode,
          reason: "The user explicitly requested this language operation.",
        }),
        "Hello means 안녕하세요.",
      ])

      const result = await renderFinalResponseText({
        config: DEFAULT_CONFIG,
        originalRequest: "hello를 한국어로 번역해줘",
        rawText: "Hello means 안녕하세요.",
        textSource: "llm_generated",
        responseLanguageMode,
        model: "gpt-test",
        provider,
        workDir: process.cwd(),
        identityContext,
      })

      expect(result?.text).toBe("Hello means 안녕하세요.")
      expect(chat).toHaveBeenCalledTimes(2)
    },
  )

  it("downgrades an unconfirmed exception and repairs the response under the strict policy", async () => {
    const { provider, chat } = providerWithOutputs([
      JSON.stringify({
        allowed: false,
        mode: "translation",
        reason: "The request does not explicitly ask for translation.",
      }),
      "The task is complete.",
      "요청한 작업을 완료했습니다.",
    ])

    const result = await renderFinalResponseText({
      config: DEFAULT_CONFIG,
      originalRequest: "작업 결과를 알려줘",
      rawText: "done",
      textSource: "runtime_deterministic",
      responseLanguageMode: "translation",
      model: "gpt-test",
      provider,
      workDir: process.cwd(),
      identityContext,
    })

    expect(result?.text).toBe("요청한 작업을 완료했습니다.")
    expect(chat).toHaveBeenCalledTimes(3)
  })

  it.each([
    "not-json",
    JSON.stringify({ allowed: true, mode: "multilingual", reason: "Wrong mode." }),
  ])("fails closed when the exception review is invalid or mismatched", async (reviewOutput) => {
    const { provider, chat } = providerWithOutputs([
      reviewOutput,
      "The task is complete.",
      "요청한 작업을 완료했습니다.",
    ])

    const result = await renderFinalResponseText({
      config: DEFAULT_CONFIG,
      originalRequest: "작업 결과를 알려줘",
      rawText: "done",
      textSource: "runtime_deterministic",
      responseLanguageMode: "translation",
      model: "gpt-test",
      provider,
      workDir: process.cwd(),
      identityContext,
    })

    expect(result?.text).toBe("요청한 작업을 완료했습니다.")
    expect(chat).toHaveBeenCalledTimes(3)
  })
})
