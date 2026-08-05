import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const runsPageSource = readFileSync(join(process.cwd(), "packages", "webui", "src", "pages", "RunsDiagnosticPage.tsx"), "utf-8")

describe("task0436 retrieval evidence wording", () => {
  it("does not describe retrieval evidence as raw control timeline data", () => {
    expect(runsPageSource).not.toContain("control timeline")
    expect(runsPageSource).toContain("검색 증거 수집, LLM 결과 진단, 전달 상태를 실행 기록에서 재구성합니다.")
    expect(runsPageSource).toContain("from run records")
  })

  it("maps summary delivery and stop states through user-facing helpers", () => {
    expect(runsPageSource).not.toContain('summary.finalDeliveryStatus ?? "unknown"')
    expect(runsPageSource).not.toContain('summary.stopReason ?? "none"')

    expect(runsPageSource).toContain("function retrievalStatusLabel")
    expect(runsPageSource).toContain("function retrievalStopReasonLabel")
    expect(runsPageSource).toContain("retrievalStatusLabel(summary.finalDeliveryStatus, text)")
    expect(runsPageSource).toContain("retrievalStopReasonLabel(summary.stopReason, text)")
  })

  it("does not render raw retrieval event kind, type, source, semantic verdict, or duplicate text", () => {
    expect(runsPageSource).not.toContain("displayText(event.kind)")
    expect(runsPageSource).not.toContain("displayText(event.eventType)")
    expect(runsPageSource).not.toContain("[event.source.toolName, event.source.method, event.source.domain]")
    expect(runsPageSource).not.toContain("event.verdict.acceptedValue")
    expect(runsPageSource).not.toContain("duplicate {event.duplicate.kind}")

    expect(runsPageSource).toContain("function retrievalEventKindLabel")
    expect(runsPageSource).toContain("function retrievalEventTypeLabel")
    expect(runsPageSource).toContain("function retrievalSourceLabel")
    expect(runsPageSource).not.toContain("function retrievalVerdictLabel")
    expect(runsPageSource).toContain("retrievalEventKindLabel(event.kind, text)")
    expect(runsPageSource).toContain("retrievalEventTypeLabel(event.eventType, text)")
    expect(runsPageSource).toContain('text("중복 억제", "Duplicate suppressed")')
  })
})
