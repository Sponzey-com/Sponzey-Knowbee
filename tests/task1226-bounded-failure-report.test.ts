import { describe, expect, it, vi } from "vitest"
import {
  buildVerifiedFailureReportFacts,
  type AuthorizedSolutionPathExhaustionAssessment,
  type StructuredFailureRecoveryDecision,
} from "../packages/core/src/index.ts"
import { renderVerifiedFailureReport } from "../packages/core/src/runs/verified-failure-report-rendering.ts"

function blockedDecision(): StructuredFailureRecoveryDecision {
  return {
    state: "stopped",
    outcome: "blocked",
    receiptId: "diagnosis:failure:1",
    stopCondition: "alternatives_exhausted",
    reason: "허용 가능한 해결 경로를 모두 확인했지만 필요한 자원을 사용할 수 없습니다.",
    evidenceRefs: ["evidence:resource-check:1"],
    partialResultRefs: ["result:partial:1"],
    unresolvedScope: ["파일 변환"],
    userActions: ["필요한 변환 도구를 설치한 뒤 다시 요청하세요."],
    stateTrace: ["diagnosing", "generating_candidates", "reviewing_constraints", "selecting_action", "stopped"],
  }
}

function exhausted(nextAction: "stop_blocked" | "partial_report" = "stop_blocked"): AuthorizedSolutionPathExhaustionAssessment {
  return {
    complete: true,
    canFinalizeFailure: nextAction === "stop_blocked",
    reviewedPaths: ["direct_answer", "plan", "tool", "sub_agent", "yeonjang", "ask_clarification", "partial_completion", "workaround_guidance"],
    missingPaths: [],
    partialResultRefs: ["result:partial:1"],
    workaroundGuidance: ["지원되는 변환 도구를 연결할 수 있습니다."],
    receiptId: "diagnosis:failure:1",
    nextAction,
    reviews: [],
  }
}

describe("task1226 bounded impossibility termination and verified failure reporting", () => {
  it("builds a verified report only from a terminal decision and fully reviewed solution paths", () => {
    expect(buildVerifiedFailureReportFacts({
      decision: blockedDecision(), exhaustion: exhausted(), primaryLanguage: "ko",
    })).toMatchObject({
      outcome: "blocked",
      failedScope: ["파일 변환"],
      verifiedReason: { reasonCode: "alternatives_exhausted", evidenceRefs: ["evidence:resource-check:1"] },
      nextActions: ["필요한 변환 도구를 설치한 뒤 다시 요청하세요.", "지원되는 변환 도구를 연결할 수 있습니다."],
      partialResultRefs: ["result:partial:1"],
    })
  })

  it("rejects mismatched receipts, non-terminal decisions, and lost partial results", () => {
    expect(() => buildVerifiedFailureReportFacts({
      decision: blockedDecision(), exhaustion: { ...exhausted(), receiptId: "diagnosis:other" }, primaryLanguage: "ko",
    })).toThrow(/same diagnosis receipt/i)
    expect(() => buildVerifiedFailureReportFacts({
      decision: { ...blockedDecision(), state: "retry_ready", outcome: "retry" }, exhaustion: exhausted(), primaryLanguage: "ko",
    })).toThrow(/blocked or partial/i)
    expect(() => buildVerifiedFailureReportFacts({
      decision: blockedDecision(), exhaustion: { ...exhausted(), partialResultRefs: [] }, primaryLanguage: "ko",
    })).toThrow(/preserve every exhausted partial result/i)
  })

  it("requires verified evidence and an available next action", () => {
    expect(() => buildVerifiedFailureReportFacts({
      decision: { ...blockedDecision(), evidenceRefs: [] }, exhaustion: exhausted(), primaryLanguage: "ko",
    })).toThrow(/evidence/i)
    expect(() => buildVerifiedFailureReportFacts({
      decision: { ...blockedDecision(), userActions: [] }, exhaustion: { ...exhausted(), workaroundGuidance: [] }, primaryLanguage: "ko",
    })).toThrow(/next action/i)
  })

  it("delivers a concise same-language report only through the LLM-reviewed renderer", async () => {
    const report = buildVerifiedFailureReportFacts({ decision: blockedDecision(), exhaustion: exhausted(), primaryLanguage: "ko" })
    const renderNotice = vi.fn(async () => ({
      status: "ready" as const,
      text: "파일 변환을 완료하지 못했습니다. 필요한 도구를 사용할 수 없습니다. 도구를 설치한 뒤 다시 요청하세요.",
      textSource: "llm_reviewed" as const,
    }))
    await expect(renderVerifiedFailureReport({ originalRequest: "파일을 변환해줘", report, renderNotice })).resolves.toEqual({
      status: "ready",
      text: "파일 변환을 완료하지 못했습니다. 필요한 도구를 사용할 수 없습니다. 도구를 설치한 뒤 다시 요청하세요.",
      textSource: "llm_reviewed",
    })
    expect(renderNotice).toHaveBeenCalledWith(expect.objectContaining({
      textSource: "runtime_deterministic", contentKind: "final_report", reasonPrefix: "verified_failure_report",
    }))
    const renderingInput = JSON.parse(renderNotice.mock.calls[0]![0].rawText)
    expect(renderingInput).toEqual({
      instruction: "Briefly report only the result, verified reason, and available next actions. Do not expose references or internal metadata.",
      language: "ko",
      result: "blocked",
      failed_scope: ["파일 변환"],
      verified_reason: "허용 가능한 해결 경로를 모두 확인했지만 필요한 자원을 사용할 수 없습니다.",
      next_actions: ["필요한 변환 도구를 설치한 뒤 다시 요청하세요.", "지원되는 변환 도구를 연결할 수 있습니다."],
      partial_result_available: true,
    })
    expect(renderNotice.mock.calls[0]![0].rawText).not.toMatch(/diagnosis:|evidence:|result:partial|stateTrace|raw payload|stack/)
  })

  it.each([
    ["아마 도구 문제인 것 같습니다. 다시 해보세요.", "verified_failure_report_speculation"],
    ["Failure could not be completed. Install the tool and retry.", "verified_failure_report_language_mismatch"],
    ["실패했습니다. diagnosis_id: abc를 확인하세요.", "verified_failure_report_internal_detail"],
  ])("blocks unverified or policy-violating LLM text: %s", async (text, reason) => {
    const report = buildVerifiedFailureReportFacts({ decision: blockedDecision(), exhaustion: exhausted(), primaryLanguage: "ko" })
    await expect(renderVerifiedFailureReport({
      originalRequest: "파일을 변환해줘",
      report,
      renderNotice: async () => ({ status: "ready", text, textSource: "llm_reviewed" }),
    })).resolves.toEqual({ status: "blocked", reason })
  })
})
