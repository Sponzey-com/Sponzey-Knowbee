import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "pages", "DashboardPage.tsx"),
  "utf-8",
)

describe("task0452 dashboard setup connection redaction", () => {
  it("does not render raw device message host or port values", () => {
    expect(source).not.toContain('value={draft.mqtt.host} mono')
    expect(source).not.toContain("value={String(draft.mqtt.port)}")
    expect(source).toContain("dashboardConnectionHostConfiguredLabel(draft.mqtt.host, language)")
    expect(source).toContain("dashboardConnectionPortConfiguredLabel(draft.mqtt.port, language)")
  })

  it("does not render raw web app host or port values", () => {
    expect(source).not.toContain('value={draft.remoteAccess.host} mono')
    expect(source).not.toContain("value={String(draft.remoteAccess.port)}")
    expect(source).toContain("dashboardConnectionHostConfiguredLabel(draft.remoteAccess.host, language)")
    expect(source).toContain("dashboardConnectionPortConfiguredLabel(draft.remoteAccess.port, language)")
  })

  it("uses explicit optional connection status instead of blank values", () => {
    expect(source).not.toContain('value={checks?.telegramConfigured ? text("설정됨", "Configured") : ""}')
    expect(source).toContain("function dashboardOptionalConnectionLabel(configured: boolean | undefined, language: UiLanguage): string")
    expect(source).toContain("dashboardOptionalConnectionLabel(checks?.telegramConfigured, language)")
  })
})
