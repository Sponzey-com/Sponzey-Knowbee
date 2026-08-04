import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "lib", "advanced-dashboard.ts"),
  "utf-8",
)

describe("task0455 advanced dashboard run prompt redaction", () => {
  it("does not use raw run prompts as dashboard card fallback text", () => {
    expect(source).not.toContain("run.title || run.prompt")
    expect(source).not.toContain("recentRuns[0]?.title ||")
    expect(source).not.toContain("run.prompt")
    expect(source).toContain("function dashboardRunTitle(run: RootRun, language: UiLanguage): string")
    expect(source).toContain('pickUiText(language, "제목 없는 실행", "Untitled run")')
  })

  it("uses the sanitized run title helper for recent, pending, and warning cards", () => {
    expect(source).toContain("dashboardRunTitle(recentRuns[0], input.language)")
    expect(source.match(/dashboardRunTitle\((?:recentRuns\[0\]|run), input\.language\)/gu)).toHaveLength(4)
  })
})
