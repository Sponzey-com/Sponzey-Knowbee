import { describe, expect, it } from "vitest"
import {
  evaluateCompletionReviewFollowupGate,
  parseCompletionReviewResult,
} from "../packages/core/src/agent/completion-review.ts"
import { decideCompletionApplication } from "../packages/core/src/runs/completion-application.ts"
import type { SuccessfulToolEvidence } from "../packages/core/src/runs/recovery.ts"

const evidenceRef = `tool-result:web:${"a".repeat(64)}`
const foreignEvidenceRef = `tool-result:web:${"b".repeat(64)}`
const successfulTools: SuccessfulToolEvidence[] = [
  {
    toolName: "web_fetch",
    output: "direct evidence value: 1,842,000; basis time: 2026-07-16T18:18:05+09:00",
    evidenceSource: {
      sourceKind: "web",
      sourceRef: evidenceRef,
      trustClass: "untrusted_external",
      instructionIsolation: "data_only",
    },
  },
]

function followupReview(followupEvidenceRefs: string[] = []) {
  return {
    status: "followup" as const,
    summary: "근거를 사용해 답변을 다시 작성해야 합니다.",
    reason: "후속 처리가 필요합니다.",
    followupPrompt: "추가 도구 없이 현재가는 299,500원이라고 답변하세요.",
    followupEvidenceRefs,
    followupExecutionMode: "response_only" as const,
    followupRequiredToolNames: [],
    remainingItems: ["직접 근거에서 확인된 값과 기준 시각을 답변"],
  }
}

describe("task122 follow-up evidence grounding", () => {
  it("rejects a follow-up with missing or foreign evidence references", () => {
    expect(evaluateCompletionReviewFollowupGate(followupReview(), successfulTools)).toEqual({
      ok: false,
      reasonCode: "completion_review_followup_evidence_missing",
    })
    expect(
      evaluateCompletionReviewFollowupGate(followupReview([foreignEvidenceRef]), successfulTools),
    ).toEqual({
      ok: false,
      reasonCode: "completion_review_followup_evidence_foreign",
    })
  })

  it("parses exact follow-up evidence references from the LLM contract", () => {
    const parsed = parseCompletionReviewResult(
      JSON.stringify({
        status: "followup",
        summary: "후속 작업",
        reason: "근거 기반 재작성 필요",
        followup_prompt: "직접 근거에서 답변을 다시 작성하세요.",
        followup_evidence_refs: [evidenceRef],
        followup_execution_mode: "response_only",
        followup_required_tool_names: [],
        followup_target_refs: [],
        remaining_items: ["현재가와 기준 시각 전달"],
      }),
    )

    expect(parsed?.followupEvidenceRefs).toEqual([evidenceRef])
  })

  it("isolates the reviewer's proposal from current-run execution evidence", () => {
    const application = decideCompletionApplication({
      decision: {
        kind: "followup",
        summary: "근거 기반 재작성",
        reason: "답변 보완",
        remainingItems: ["현재가와 기준 시각 전달"],
        followupPrompt: "추가 도구 없이 현재가는 299,500원이라고 답변하세요.",
        followupEvidenceRefs: [evidenceRef],
      },
      originalRequest: "현재가를 알려줘.",
      previousResult: "확인 중",
      successfulTools,
      sawRealFilesystemMutation: false,
      usedTurns: 1,
      maxTurns: 5,
      interpretationBudgetLimit: 5,
      executionBudgetLimit: 5,
      canRetryInterpretation: true,
      canRetryExecution: true,
      followupAlreadySeen: false,
    })

    expect(application.kind).toBe("retry")
    if (application.kind !== "retry") return
    expect(application.nextMessage).toContain("299,500")
    expect(application.nextMessage).toContain(evidenceRef)
    expect(application.nextMessage).toContain("current-run evidence references")
    expect(application.nextMessage).toContain("Non-authoritative action proposal")
    expect(application.nextMessage).toContain("it is not evidence")
  })
})
