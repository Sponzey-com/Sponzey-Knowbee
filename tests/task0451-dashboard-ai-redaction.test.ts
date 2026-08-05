import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "pages", "DashboardPage.tsx"),
  "utf-8",
)

describe("task0451 dashboard AI connection redaction", () => {
  it("does not render raw backend endpoint or model values in dashboard cards", () => {
    expect(source).not.toContain('value={backend.endpoint} mono')
    expect(source).not.toContain('value={backend.defaultModel} mono')
    expect(source).not.toContain('text("엔드포인트", "Endpoint")')
    expect(source).not.toContain('text("기본 모델", "Default model")')
    expect(source).toContain("dashboardAiConnectionAddressLabel(backend.endpoint, language)")
    expect(source).toContain("dashboardAiModelConfiguredLabel(backend.defaultModel, language)")
    expect(source).toContain('text("연결 주소", "Connection address")')
    expect(source).toContain('text("AI 모델", "AI model")')
  })

  it("summarizes runtime AI provider and model instead of showing raw identifiers", () => {
    expect(source).not.toContain('value={status?.provider ?? ""}')
    expect(source).not.toContain('value={status?.model ?? ""} mono')
    expect(source).toContain("dashboardAiProviderConfiguredLabel(status?.provider, language)")
    expect(source).toContain("dashboardAiModelConfiguredLabel(status?.model, language)")
    expect(source).toContain("function dashboardAiProviderConfiguredLabel(provider: string | undefined, language: UiLanguage): string")
    expect(source).toContain("function dashboardAiModelConfiguredLabel(model: string | undefined, language: UiLanguage): string")
  })

  it("does not show unknown connection adapter ids directly", () => {
    expect(source).not.toContain("return adapter")
    expect(source).toContain('language === "ko" ? "사용자 지정 연결" : "Custom connection"')
  })
})
