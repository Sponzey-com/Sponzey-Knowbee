import { describe, expect, it } from "vitest"
import { buildCanonicalResultReportFacts } from "../packages/core/src/contracts/canonical-result-report.ts"
import {
  bindTerminalReportForDelivery,
} from "../packages/core/src/runs/terminal-report-delivery-binding.ts"

function partialFacts(runId = "run-1") {
  return buildCanonicalResultReportFacts({
    goalId: `goal:${runId}`,
    workId: `work:root:${runId}`,
    outcome: "partial",
    primaryLanguage: "ko",
    completedScope: ["가격 조회"],
    unresolvedScope: ["거래량 조회"],
    reasonCode: "source_unavailable",
    verifiedReasonFacts: ["거래량 데이터 소스가 응답하지 않았습니다."],
    evidenceRefs: ["evidence:market:1"],
    nextActions: [{ kind: "user_action", text: "거래량 조회를 다시 시도하세요." }],
  })
}

describe("terminal report delivery binding", () => {
  it("binds a partial terminal outcome to exact canonical facts", () => {
    const result = bindTerminalReportForDelivery({
      runId: "run-1",
      finalOutcome: "partial",
      facts: partialFacts(),
      draftText: "일부 결과를 확인했습니다.",
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.reportFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/u)
    expect(JSON.parse(result.reviewInput)).toEqual({
      schemaVersion: 1,
      result: "partial",
      language: "ko",
      completedScope: ["가격 조회"],
      unresolvedScope: ["거래량 조회"],
      verifiedReasonFacts: ["거래량 데이터 소스가 응답하지 않았습니다."],
      nextActions: [{ kind: "user_action", text: "거래량 조회를 다시 시도하세요." }],
      draftText: "일부 결과를 확인했습니다.",
    })
    expect(result.reviewInput).not.toMatch(/goal:run-1|work:root:run-1|evidence:market:1/u)
  })

  it("rejects a report whose work or outcome differs from finalization", () => {
    expect(bindTerminalReportForDelivery({
      runId: "run-other",
      finalOutcome: "partial",
      facts: partialFacts(),
      draftText: "partial",
    })).toEqual({ ok: false, reasonCode: "terminal_report_work_mismatch" })

    expect(bindTerminalReportForDelivery({
      runId: "run-1",
      finalOutcome: "blocked",
      facts: partialFacts(),
      draftText: "blocked",
    })).toEqual({ ok: false, reasonCode: "terminal_report_outcome_mismatch" })
  })
})
