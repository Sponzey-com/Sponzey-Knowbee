import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const diagnosticsSource = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "pages", "RunsDiagnosticPage.tsx"),
  "utf-8",
)

describe("task0405 runs diagnostics wording", () => {
  it("uses user-facing wording for internal instruction and activity diagnostics", () => {
    expect(diagnosticsSource).not.toContain('text("프롬프트 출처", "Prompt sources")')
    expect(diagnosticsSource).not.toContain('text("도구 실행 기록", "Tool receipt trace")')
    expect(diagnosticsSource).not.toContain('text("결과 전달 기록", "Delivery receipt trace")')

    expect(diagnosticsSource).toContain('text("적용된 내부 지침", "Applied internal instructions")')
    expect(diagnosticsSource).toContain('text("외부 도구 활동", "External tool activity")')
    expect(diagnosticsSource).toContain('text("결과 전달 기록", "Result delivery activity")')
  })
})
