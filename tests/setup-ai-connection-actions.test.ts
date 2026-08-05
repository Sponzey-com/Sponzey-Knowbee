import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { UiRequestFailure } from "../packages/webui/src/api/request-failure"
import { getAIProviderSuggestedModels } from "../packages/webui/src/contracts/ai"
import { sanitizeBeginnerSetupError } from "../packages/webui/src/lib/beginner-setup"
import { sanitizeUserFacingError } from "../packages/core/src/runs/error-sanitizer.ts"

const setupPageSource = readFileSync(
  "packages/webui/src/pages/SetupPage.tsx",
  "utf8",
)

function functionBody(name: string, nextName: string): string {
  const start = setupPageSource.indexOf(`async function ${name}`)
  const end = setupPageSource.indexOf(`async function ${nextName}`, start + 1)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return setupPageSource.slice(start, end)
}

describe("AI connection settings actions", () => {
  it("keeps saving separate from live connection testing", () => {
    const saveBody = functionBody(
      "handleSaveBeginnerAi",
      "handleTestSavedBeginnerAi",
    )
    const testBody = functionBody(
      "handleTestSavedBeginnerAi",
      "handleSaveBeginnerChannels",
    )

    expect(saveBody).toContain("saveDraftSnapshot")
    expect(saveBody).not.toContain("api.testAi")
    expect(saveBody).not.toContain("api.testBackend")
    expect(testBody).toContain("api.testAi({")
    expect(testBody).not.toContain("if (aiInputDirty)")
  })

  it("renders fetched models, custom model input, refresh, and an always reachable test action", () => {
    expect(setupPageSource).toContain('pickUiText(uiLanguage, "저장", "Save")')
    expect(setupPageSource).toContain(
      'pickUiText(uiLanguage, "연결 테스트", "Test connection")',
    )
    expect(setupPageSource).toContain('list="ai-default-model-options"')
    expect(setupPageSource).toContain('<datalist id="ai-default-model-options">')
    expect(setupPageSource).toContain(
      'pickUiText(uiLanguage, "모델 목록 새로고침", "Refresh model list")',
    )
    expect(setupPageSource).toContain("discoverModelsFromEndpoint(")
    expect(setupPageSource).toContain("beginnerDiscoveredModels")
    expect(setupPageSource).toContain(
      "onClick={() => patchBeginnerAiInput({ defaultModel: model })}",
    )
    expect(setupPageSource).toContain('role="status"')
    expect(setupPageSource).toContain("{beginnerNotice}")
  })

  it("uses current fallbacks while allowing the fetched account list and custom model IDs", () => {
    expect(getAIProviderSuggestedModels("openai", "chatgpt_oauth")).toEqual([
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
    ])
    expect(getAIProviderSuggestedModels("anthropic")).toContain("claude-sonnet-4-5")
    expect(getAIProviderSuggestedModels("gemini")).toContain("gemini-2.5-pro")
    expect(getAIProviderSuggestedModels("custom")).toEqual([])
  })

  it("shows a localized OAuth access failure instead of a generic request error", () => {
    const failure = new UiRequestFailure({
      status: 503,
      reasonCode: "access_blocked",
      safeMessage: "인증 또는 접근 차단 문제로 요청이 실패했습니다.",
    })

    expect(sanitizeBeginnerSetupError(failure, "ko")).toBe(
      "AI 인증 또는 권한 확인에 실패했습니다. API 키와 접근 권한을 확인해 주세요.",
    )
    expect(sanitizeBeginnerSetupError(failure, "en")).toBe(
      "AI authentication or permission check failed. Check the API key and access permissions.",
    )
  })

  it("classifies the Codex unsupported-model response without exposing its raw body", () => {
    const result = sanitizeUserFacingError(
      `{"detail":"The '5.5' model is not supported when using Codex with a ChatGPT account."}`,
    )

    expect(result.kind).toBe("not_found")
    expect(result.userMessage).toBe(
      "현재 설정된 모델을 provider가 지원하지 않거나 찾을 수 없습니다.",
    )
    expect(result.userMessage).not.toContain("5.5")
  })
})
