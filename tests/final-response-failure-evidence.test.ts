import { describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.js"
import { renderFinalResponseText } from "../packages/core/src/runs/final-response-renderer.ts"

const identityContext = {
  promptLocale: "ko" as const,
  mainAgentSelfName: "마당쇠",
  promptContext: "[Trusted Main Agent Identity]\nCurrent main-agent self name: `마당쇠`\n",
}

const failureEvidence = {
  schemaVersion: 1 as const,
  phase: "intake" as const,
  reasonCode: "provider_unavailable",
  retryable: true,
  executionObserved: false,
  deliveryObserved: false,
  evidenceRefs: ["llm-invocation:intake:invocation-1"],
}

function providerWithOutputs(outputs: string[]) {
  const chat = vi.fn(async function* () {
    yield { type: "text_delta", delta: outputs.shift() ?? "" } as const
  })
  return { provider: { chat }, chat }
}

function acceptedEnvelope(text: string, overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    text,
    accepted_failure: {
      phase: failureEvidence.phase,
      reason_code: failureEvidence.reasonCode,
      retryable: failureEvidence.retryable,
      execution_observed: failureEvidence.executionObserved,
      delivery_observed: failureEvidence.deliveryObserved,
      evidence_refs: failureEvidence.evidenceRefs,
      ...overrides,
    },
  })
}

describe("final response failure evidence", () => {
  it("repairs an invented device cause and emits only an exactly accepted failure envelope", async () => {
    const { provider, chat } = providerWithOutputs([
      "카메라 권한 문제로 사진 촬영에 실패했습니다.",
      acceptedEnvelope("요청 분석용 AI 연결 문제로 실행을 시작하지 못했습니다. 연결 상태를 확인한 뒤 다시 요청해 주세요."),
      JSON.stringify({
        supported: true,
        reason_code: "evidence_consistent",
        corrected_text: "",
      }),
    ])

    const result = await renderFinalResponseText({
      config: DEFAULT_CONFIG,
      originalRequest: "컴퓨터 카메라로 사진찍어서 보내줘",
      rawText: "Request analysis failed before execution.",
      textSource: "runtime_deterministic",
      responseLanguageMode: "same_as_request",
      model: "gpt-test",
      provider,
      workDir: process.cwd(),
      identityContext,
      failureEvidence,
    })

    expect(result?.text).toBe(
      "요청 분석용 AI 연결 문제로 실행을 시작하지 못했습니다. 연결 상태를 확인한 뒤 다시 요청해 주세요.",
    )
    expect(result?.text).not.toContain("카메라 권한")
    expect(chat).toHaveBeenCalledTimes(3)
  })

  it("blocks delivery when the repair changes the observed failure stage", async () => {
    const { provider, chat } = providerWithOutputs([
      acceptedEnvelope("카메라 실행이 실패했습니다.", { phase: "execution" }),
      acceptedEnvelope("카메라 실행이 실패했습니다.", { phase: "execution" }),
    ])

    const result = await renderFinalResponseText({
      config: DEFAULT_CONFIG,
      originalRequest: "컴퓨터 카메라로 사진찍어서 보내줘",
      rawText: "Request analysis failed before execution.",
      textSource: "runtime_deterministic",
      responseLanguageMode: "same_as_request",
      model: "gpt-test",
      provider,
      workDir: process.cwd(),
      identityContext,
      failureEvidence,
    })

    expect(result).toBeNull()
    expect(chat).toHaveBeenCalledTimes(2)
  })
})
