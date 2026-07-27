import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "pages", "DashboardPage.tsx"),
  "utf-8",
)

describe("task0389 dashboard AI and status wording", () => {
  it("does not render backend and adapter raw labels in the dashboard header and metrics", () => {
    expect(source).not.toContain('label="Adapter"')
    expect(source).not.toContain('"Enabled Backends"')
    expect(source).not.toContain('"Configured Backends"')
    expect(source).not.toContain("value={setupState.currentStep}")
    expect(source).toContain('text("연결 방식", "Connection type")')
    expect(source).toContain('dashboardConnectionAdapterLabel(adapter, language)')
    expect(source).toContain('dashboardSetupStepLabel(setupState.currentStep, language)')
    expect(source).toContain('text("활성 AI 연결", "Active AI connections")')
    expect(source).toContain('text("설정된 AI 연결", "Configured AI connections")')
  })

  it("maps internal AI connection kind values before rendering them", () => {
    expect(source).not.toContain("{backend.kind}</div>")
    expect(source).toContain("function dashboardAiConnectionKindLabel(kind: AIBackendKind, language: UiLanguage): string")
    expect(source).toContain('case "provider"')
    expect(source).toContain('language === "ko" ? "AI 공급자 연결" : "AI provider connection"')
    expect(source).toContain("dashboardAiConnectionKindLabel(backend.kind, language)")
  })

  it("maps setup step ids to user-facing labels", () => {
    expect(source).toContain("function dashboardSetupStepLabel(step: SetupStepId, language: UiLanguage): string")
    expect(source).toContain('ai_backends: { ko: "AI 연결", en: "AI connection" }')
    expect(source).toContain('remote_access: { ko: "원격 접근", en: "Remote access" }')
    expect(source).toContain('done: { ko: "완료", en: "Done" }')
  })
})
