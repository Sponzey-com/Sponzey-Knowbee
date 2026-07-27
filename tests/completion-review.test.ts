import { describe, expect, it } from "vitest"
import {
  buildCompletionReviewSystemPrompt,
  evaluateCompletionReviewFollowupGate,
  parseCompletionReviewResult,
} from "../packages/core/src/agent/completion-review.ts"

describe("parseCompletionReviewResult", () => {
  it("parses followup review results", () => {
    const parsed = parseCompletionReviewResult(`{
      "status": "followup",
      "summary": "남은 작업이 있습니다.",
      "reason": "두 번째 요청이 처리되지 않았습니다.",
      "followup_prompt": "남은 두 번째 요청만 처리하세요.",
      "followup_execution_mode": "tool",
      "followup_required_tool_names": ["web_fetch", "web_fetch"],
      "followup_target_refs": ["https://example.com/direct"],
      "remaining_items": ["두 번째 요청 처리"]
    }`)

    expect(parsed?.status).toBe("followup")
    expect(parsed?.followupPrompt).toBe("남은 두 번째 요청만 처리하세요.")
    expect(parsed?.followupExecutionMode).toBe("tool")
    expect(parsed?.followupRequiredToolNames).toEqual(["web_fetch"])
    expect(parsed?.followupTargetRefs).toEqual(["https://example.com/direct"])
    expect(parsed?.remainingItems).toEqual(["두 번째 요청 처리"])
  })

  it("rejects a followup that does not declare how the next pass must execute", () => {
    expect(evaluateCompletionReviewFollowupGate({
      status: "followup",
      summary: "추가 확인이 필요합니다.",
      reason: "직접 출처가 필요합니다.",
      followupPrompt: "직접 출처를 확인하세요.",
      followupEvidenceRefs: [],
      remainingItems: ["직접 출처 확인"],
    })).toEqual({
      ok: false,
      reasonCode: "completion_review_followup_execution_missing",
    })
  })

  it("rejects response-only recovery while an evidence criterion remains unresolved", () => {
    expect(evaluateCompletionReviewFollowupGate({
      status: "followup",
      summary: "직접 근거가 필요합니다.",
      reason: "시세 기준 시각이 확인되지 않았습니다.",
      followupPrompt: "직접 출처를 확인하세요.",
      followupEvidenceRefs: [],
      followupExecutionMode: "response_only",
      followupRequiredToolNames: [],
      remainingItems: ["시세 기준 시각 확인"],
      criterionAssessments: [{
        criterionKey: "freshness",
        applicable: true,
        verdict: "uncertain",
        evidenceRefs: [],
        uncertainty: "기준 시각 없음",
        reason: "검색 수집 시각만 있습니다.",
      }],
    })).toEqual({
      ok: false,
      reasonCode: "completion_review_followup_execution_invalid",
    })
  })

  it("rejects response-only recovery when cited freshness evidence is not freshness-valid", () => {
    const searchEvidenceRef = `tool-result:web:${"c".repeat(64)}`
    expect(evaluateCompletionReviewFollowupGate({
      status: "followup",
      summary: "기준 시각을 답변해야 합니다.",
      reason: "검색 근거만 있습니다.",
      followupPrompt: "직접 출처를 확인하세요.",
      followupEvidenceRefs: [searchEvidenceRef],
      followupExecutionMode: "response_only",
      followupRequiredToolNames: [],
      remainingItems: ["시세 기준 시각 확인"],
      criterionAssessments: [{
        criterionKey: "freshness",
        applicable: true,
        verdict: "satisfied",
        evidenceRefs: [searchEvidenceRef],
        uncertainty: "",
        reason: "검색 결과에 시각이 있습니다.",
      }],
    }, [], [searchEvidenceRef], [])).toEqual({
      ok: false,
      reasonCode: "completion_review_followup_execution_invalid",
    })
  })

  it("parses ask_user review results", () => {
    const parsed = parseCompletionReviewResult(`{
      "status": "ask_user",
      "summary": "추가 정보가 필요합니다.",
      "reason": "대상 파일 경로가 없습니다.",
      "user_message": "어느 파일을 수정해야 하나요?",
      "remaining_items": ["대상 파일 확인"]
    }`)

    expect(parsed?.status).toBe("ask_user")
    expect(parsed?.userMessage).toBe("어느 파일을 수정해야 하나요?")
    expect(parsed?.remainingItems).toEqual(["대상 파일 확인"])
  })

  it("parses a terminal blocked review when no materially different path remains", () => {
    const parsed = parseCompletionReviewResult(`{
      "status": "blocked",
      "summary": "확인 가능한 범위까지 조사했습니다.",
      "reason": "현재 증거에는 검증 가능한 직접 출처가 없습니다.",
      "remaining_items": ["직접 출처의 기준 시각 확인"]
    }`)

    expect(parsed?.status).toBe("blocked")
    expect(parsed?.remainingItems).toEqual(["직접 출처의 기준 시각 확인"])
  })

  it("instructs current value misses to continue with concrete fetch sources", () => {
    const prompt = buildCompletionReviewSystemPrompt()

    expect(prompt).toContain("current/latest externally retrievable value")
    expect(prompt).toContain("choose followup")
    expect(prompt).toContain("web_fetch")
    expect(prompt).toContain("followup_required_tool_names")
    expect(prompt).toContain("followup_target_refs")
    expect(prompt).toContain("followup_execution_mode")
    expect(prompt).toContain("do not repeat the same search query")
    expect(prompt).toContain("generic new search")
    expect(prompt).toContain("choose blocked")
  })

  it("does not force Korean review text for non-Korean requests", () => {
    const prompt = buildCompletionReviewSystemPrompt()

    expect(prompt).toContain("short summary in the original request language")
    expect(prompt).toContain("same language as the original user request")
    expect(prompt).not.toContain("short Korean summary")
  })

  it("judges an ordinary reply before final delivery without creating a delivery loop", () => {
    const prompt = buildCompletionReviewSystemPrompt()

    expect(prompt).toContain("ordinary reply")
    expect(prompt).toContain("before final reply dispatch")
    expect(prompt).toContain("Do not choose followup solely to deliver")
  })

  it("requires compact structured fields for the latency-sensitive review stage", () => {
    const prompt = buildCompletionReviewSystemPrompt()

    expect(prompt).toContain("Keep every human-language field to one short sentence")
    expect(prompt).toContain("Do not repeat evidence content")
    expect(prompt).toContain(
      "every applicable criterion and every expected condition must cite",
    )
  })
})
