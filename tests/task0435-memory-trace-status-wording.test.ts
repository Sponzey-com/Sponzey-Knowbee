import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const runsPageSource = readFileSync(join(process.cwd(), "packages", "webui", "src", "pages", "RunsPage.tsx"), "utf-8")

describe("task0435 memory trace status wording", () => {
  it("maps memory trace scope, source, and reason through user-facing helpers", () => {
    expect(runsPageSource).not.toContain('displayText(trace.scope ?? "unknown")')
    expect(runsPageSource).not.toContain("displayText(trace.result_source)")
    expect(runsPageSource).not.toContain('displayText(trace.reason ?? "accepted")')

    expect(runsPageSource).toContain("function memoryTraceScopeLabel")
    expect(runsPageSource).toContain("function memoryTraceResultSourceLabel")
    expect(runsPageSource).toContain("function memoryTraceReasonLabel")
    expect(runsPageSource).toContain("memoryTraceScopeLabel(trace.scope, text)")
    expect(runsPageSource).toContain("memoryTraceResultSourceLabel(trace.result_source, text)")
    expect(runsPageSource).toContain("memoryTraceReasonLabel(trace.reason, text)")
  })

  it("does not use n/a or fake zero latency for missing memory trace metrics", () => {
    expect(runsPageSource).not.toContain('trace.score == null ? "n/a"')
    expect(runsPageSource).not.toContain("trace.latency_ms ?? 0")

    expect(runsPageSource).toContain('trace.score == null ? text("확인 필요", "Needs check")')
    expect(runsPageSource).toContain('trace.latency_ms == null ? text("확인 필요", "Needs check")')
  })

  it("contains clear labels for common memory trace states", () => {
    expect(runsPageSource).toContain('text("범위 확인 필요", "Scope needs check")')
    expect(runsPageSource).toContain('text("출처 확인 필요", "Source needs check")')
    expect(runsPageSource).toContain('text("답변 근거로 사용됨", "Used as answer context")')
    expect(runsPageSource).toContain('text("벡터 검색", "Vector search")')
    expect(runsPageSource).toContain('text("장기 기억", "Long-term memory")')
  })
})

