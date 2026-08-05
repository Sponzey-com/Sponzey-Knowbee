import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "pages", "DashboardPage.tsx"),
  "utf-8",
)

describe("task0391 dashboard runtime and setup wording", () => {
  it("uses user-facing app status labels instead of gateway/setup jargon", () => {
    expect(source).not.toContain('text("Gateway 연결", "Gateway connection")')
    expect(source).not.toContain('text("Gateway 상태", "Gateway status")')
    expect(source).not.toContain('text("Setup 완료", "Setup complete")')
    expect(source).not.toContain('text("Setup 열기", "Open setup")')
    expect(source).not.toContain('text("설정 상태", "Setup status")')
    expect(source).toContain('text("앱 연결", "App connection")')
    expect(source).toContain('text("앱 상태", "App status")')
    expect(source).toContain('text("초기 설정", "Initial setup")')
    expect(source).toContain('text("초기 설정 열기", "Open initial setup")')
    expect(source).toContain('text("초기 설정 상태", "Initial setup status")')
  })

  it("uses explicit runtime labels and maps raw health status values", () => {
    expect(source).not.toContain('<StatusRow label="Provider"')
    expect(source).not.toContain('<StatusRow label="Model"')
    expect(source).not.toContain('<StatusRow label="Uptime"')
    expect(source).not.toContain("`${fastResponse.status} ·")
    expect(source).toContain('text("AI 공급자", "AI provider")')
    expect(source).toContain('text("AI 모델", "AI model")')
    expect(source).toContain('text("실행 시간", "Running time")')
    expect(source).toContain("function dashboardHealthStatusLabel(status: string, language: UiLanguage): string")
    expect(source).toContain("dashboardHealthStatusLabel(fastResponse.status, language)")
  })

  it("hides protocol-heavy setup labels behind user-facing connection names", () => {
    expect(source).not.toContain('<StatusRow label="MQTT Host"')
    expect(source).not.toContain('<StatusRow label="MQTT Port"')
    expect(source).not.toContain('<StatusRow label="WebUI Host"')
    expect(source).not.toContain('<StatusRow label="WebUI Port"')
    expect(source).not.toContain('<StatusRow label="Scheduler"')
    expect(source).toContain('text("기기 메시지 연결", "Device message connection")')
    expect(source).toContain('text("기기 메시지 주소", "Device message host")')
    expect(source).toContain('text("화면 접속 주소", "Web app host")')
    expect(source).toContain('text("화면 접속 보호", "Web app protection")')
    expect(source).toContain('text("예약 실행", "Scheduled execution")')
  })
})
