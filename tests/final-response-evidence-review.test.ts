import { describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { renderFinalResponseText } from "../packages/core/src/runs/final-response-renderer.ts"

const identityContext = {
  promptLocale: "ko" as const,
  mainAgentSelfName: "마당쇠",
  promptContext: "[Trusted Main Agent Identity]\nCurrent main-agent self name: `마당쇠`\n",
}

describe("final response evidence review", () => {
  it("repairs an unsupported device cause and accepts only the evidence-consistent response", async () => {
    const outputs = [
      JSON.stringify({
        text: "카메라 권한이 없어 사진 촬영에 실패했습니다.",
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
        reason_code: "unsupported_device_execution_claim",
        corrected_text: "요청 분석용 AI 연결 문제로 실행을 시작하지 못했습니다. AI 연결 상태를 확인한 뒤 다시 요청해 주세요.",
      }),
      JSON.stringify({
        supported: true,
        reason_code: "evidence_consistent",
        corrected_text: "",
      }),
    ]
    const chat = vi.fn(async function* () {
      yield { type: "text_delta", delta: outputs.shift() ?? "" } as const
    })

    const result = await renderFinalResponseText({
      config: DEFAULT_CONFIG,
      originalRequest: "컴퓨터 카메라로 사진찍어서 보내줘",
      rawText: "stage=intake\nreason_code=provider_unavailable\nNo tool or device execution was observed.",
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
      "요청 분석용 AI 연결 문제로 실행을 시작하지 못했습니다. AI 연결 상태를 확인한 뒤 다시 요청해 주세요.",
    )
    expect(chat).toHaveBeenCalledTimes(3)
  })

  it("blocks delivery when the corrected response still contradicts the typed evidence", async () => {
    const outputs = [
      JSON.stringify({
        text: "카메라 권한을 허용해 주세요.",
        accepted_failure: {
          phase: "intake",
          reason_code: "provider_unavailable",
          retryable: true,
          execution_observed: false,
          delivery_observed: false,
          evidence_refs: [],
        },
      }),
      JSON.stringify({
        supported: false,
        reason_code: "unsupported_device_execution_claim",
        corrected_text: "OS 카메라 권한을 다시 확인해 주세요.",
      }),
      JSON.stringify({
        supported: false,
        reason_code: "unsupported_permission_claim",
        corrected_text: "",
      }),
    ]
    const chat = vi.fn(async function* () {
      yield { type: "text_delta", delta: outputs.shift() ?? "" } as const
    })

    await expect(renderFinalResponseText({
      config: DEFAULT_CONFIG,
      originalRequest: "사진 찍어서 보내줘",
      rawText: "stage=intake\nreason_code=provider_unavailable",
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
        evidenceRefs: [],
      },
    })).resolves.toBeNull()
  })
})
