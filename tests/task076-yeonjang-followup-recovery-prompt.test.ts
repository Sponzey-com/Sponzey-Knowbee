import { describe, expect, it } from "vitest"
import { buildCompletionFollowupExecutionMessage } from "../packages/core/src/runs/completion-application.ts"

describe("task076 Yeonjang validation failure follow-up recovery prompt", () => {
  it("adds sanitized recovery guidance for Yeonjang side-effect validation failures", () => {
    const message = buildCompletionFollowupExecutionMessage({
      kind: "followup",
      summary: "연장 부작용 결과 검증이 부족합니다.",
      reason: "목표 달성 여부를 확인해야 합니다.",
      followupPrompt: "같은 위치를 다시 클릭하세요.",
      followupEvidenceRefs: [
        "yeonjang-goal-validation:mouse_click:candidate_not_validated:result_diagnosis_not_sufficient",
      ],
      remainingItems: ["버튼 클릭 후 사용자가 요청한 화면 상태가 실제로 바뀌었는지 확인"],
    })

    expect(message).toContain("Yeonjang side-effect validation failure recovery")
    expect(message).toContain("tool=mouse_click")
    expect(message).toContain("target=tool:mouse_click:side-effect-goal")
    expect(message).toContain("reason=candidate_not_validated")
    expect(message).toContain("detail=result_diagnosis_not_sufficient")
    expect(message).toContain("Do not repeat the same side-effect path")
    expect(message).toContain("materially different method")
    expect(message).toContain("ask the user for confirmation")
    expect(message).toContain("버튼 클릭 후 사용자가 요청한 화면 상태가 실제로 바뀌었는지 확인")
    expect(message).not.toContain("operationId")
    expect(message).not.toContain("raw")
    expect(message).not.toContain("receipt payload")
  })

  it("keeps the generic evidence prompt unchanged when no Yeonjang validation failure ref exists", () => {
    const message = buildCompletionFollowupExecutionMessage({
      kind: "followup",
      summary: "근거 기반 재작성",
      reason: "답변 보완",
      followupPrompt: "근거에서 확인한 값으로 답하세요.",
      followupEvidenceRefs: [`tool-result:web:${"a".repeat(64)}`],
      remainingItems: ["현재가와 기준 시각 전달"],
    })

    expect(message).toContain("current-run evidence references")
    expect(message).toContain("Non-authoritative action proposal")
    expect(message).not.toContain("Yeonjang side-effect validation failure recovery")
  })
})
