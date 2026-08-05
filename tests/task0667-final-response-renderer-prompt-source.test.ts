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

  it("repairs an unsupported device cause against typed canonical failure facts", async () => {
    const outputs = [
      JSON.stringify({
        text: "카메라 권한이 없어 사진을 찍지 못했습니다.",
        accepted_failure: {
          phase: "intake",
          reason_code: "provider_unavailable",
          retryable: true,
          execution_observed: false,
          delivery_observed: false,
          evidence_refs: ["llm-invocation:intake:invocation-1"],
        },
      }),
      JSON.stringify({
        supported: false,
        reason_code: "unsupported_device_or_os_cause",
        corrected_text: "요청 분석용 AI provider가 응답하지 않아 실행을 시작하지 못했습니다.",
      }),
      JSON.stringify({
        supported: true,
        reason_code: "evidence_consistent",
        corrected_text: "",
      }),
    ]
    const chat = vi.fn(async function* (input: {
      system: string
      messages: Array<{ role: string; content: string }>
    }) {
      const output = outputs.shift()
      if (!output) throw new Error("unexpected provider call")
      if (chat.mock.calls.length === 2 || chat.mock.calls.length === 3) {
        expect(input.messages[0]?.content).toContain('"phase":"intake"')
        expect(input.messages[0]?.content).toContain('"reasonCode":"provider_unavailable"')
        expect(input.messages[0]?.content).toContain('"executionObserved":false')
      }
      yield { type: "text_delta", delta: output } as const
    })

    const result = await renderFinalResponseText({
      config: DEFAULT_CONFIG,
      originalRequest: "컴퓨터 카메라로 사진찍어서 보내줘",
      rawText: "요청 분석 단계가 실행 전에 중단되었습니다.",
      textSource: "runtime_deterministic",
      model: "gpt-test",
      provider: { chat },
      workDir: process.cwd(),
      identityContext,
      failureEvidence: {
        schemaVersion: 1,
        phase: "intake",
        reasonCode: "provider_unavailable",
        retryable: true,
        executionObserved: false,
        deliveryObserved: false,
        evidenceRefs: ["llm-invocation:intake:invocation-1"],
      },
    })

    expect(result?.text).toBe(
      "요청 분석용 AI provider가 응답하지 않아 실행을 시작하지 못했습니다.",
    )
    expect(chat).toHaveBeenCalledTimes(3)
  })
})
