import { describe, expect, it } from "vitest"
import { buildCompletionFollowupExecutionMessage } from "../packages/core/src/runs/completion-application.ts"

describe("Task 145 Yeonjang browser.focus recovery guidance", () => {
  it("adds reason-specific browser.focus recovery actions without raw target data", () => {
    const message = buildCompletionFollowupExecutionMessage({
      kind: "followup",
      summary: "브라우저 포커스 결과 검증이 부족합니다.",
      reason: "브라우저 포커스 부작용 검증이 완료되지 않았습니다.",
      followupPrompt: "같은 browser.focus 명령을 다시 실행하세요.",
      followupEvidenceRefs: [
        "yeonjang-goal-validation:yeonjang_browser_focus:candidate_not_validated:target_observation_required",
        "yeonjang-goal-validation:yeonjang_browser_focus:candidate_not_validated:focused_target_mismatch",
        "yeonjang-goal-validation:yeonjang_browser_focus:candidate_not_validated:side_effect_authorization_required",
        "yeonjang-goal-validation:yeonjang_browser_focus:candidate_not_validated:pre_dispatch_required",
        "yeonjang-goal-validation:yeonjang_browser_focus:candidate_not_validated:macos_bridge_not_verified",
      ],
      remainingItems: ["요청한 브라우저가 실제 foreground target인지 확인"],
    })

    expect(message).toContain("Browser focus recovery actions:")
    expect(message).toContain("collect focused target observation before reporting completion")
    expect(message).toContain("ask the user to choose the exact browser target")
    expect(message).toContain("request explicit user approval before dispatch")
    expect(message).toContain("prepare browser.focus pre-dispatch receipt")
    expect(message).toContain("verify the macOS bridge before dispatch")
    expect(message).toContain("Do not repeat commandAccepted-only browser.focus execution")
    expect(message).not.toContain("Private Admin Console")
    expect(message).not.toContain("token=private")
    expect(message).not.toContain("pid")
    expect(message).not.toContain("windowId")
    expect(message).not.toContain("tabId")
    expect(message).not.toContain("AppleScript")
    expect(message).not.toContain("internal instance")
  })
})
