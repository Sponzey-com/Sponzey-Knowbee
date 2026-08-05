import { describe, expect, it } from "vitest"
import { describeLateApproval } from "../packages/core/src/runs/approval-registry.ts"
import {
  buildTelegramApprovalCallbackNotice,
  buildTelegramApprovalResultLabel,
  resolveTelegramApprovalCallbackLanguage,
} from "../packages/core/src/channels/telegram/approval-callback-notice.ts"

describe("task0834 Telegram approval callback language boundary", () => {
  it("resolves Telegram approval callback language while preserving Korean fallback", () => {
    expect(resolveTelegramApprovalCallbackLanguage("ko")).toBe("ko")
    expect(resolveTelegramApprovalCallbackLanguage("ko-KR")).toBe("ko")
    expect(resolveTelegramApprovalCallbackLanguage("en")).toBe("en")
    expect(resolveTelegramApprovalCallbackLanguage("en-US")).toBe("en")
    expect(resolveTelegramApprovalCallbackLanguage(undefined)).toBe("ko")
  })

  it("builds non-final callback notices for English approval decisions", () => {
    const notice = buildTelegramApprovalCallbackNotice({
      language: "en",
      reason: "decision",
      approvalKind: "approval",
      decision: "allow_once",
    })

    expect(notice).toEqual({
      kind: "telegram_approval_callback_notice",
      language: "en",
      reason: "decision",
      deliveryMode: "callback_query_answer",
      textSource: "telegram_approval_callback_notice",
      renderingRequired: "llm_final_response",
      finalAnswer: false,
      assistantIdentityClaim: false,
      text: "Approved for this step.",
    })
  })

  it("builds Korean and English approval result labels", () => {
    expect(buildTelegramApprovalResultLabel({
      language: "ko",
      approvalKind: "approval",
      decision: "deny",
      username: "Tester",
    })).toBe("❌ Tester이 거부하고 요청을 취소함")

    expect(buildTelegramApprovalResultLabel({
      language: "en",
      approvalKind: "screen_confirmation",
      decision: "allow_run",
      username: "Tester",
    })).toBe("✅ Tester confirmed readiness and continued all steps")
  })

  it("describes late approval registry states in English when requested", () => {
    expect(describeLateApproval(undefined, "en")).toBe(
      "No approval request was found. Run the request again if approval is still needed.",
    )
    expect(buildTelegramApprovalCallbackNotice({
      language: "en",
      reason: "late",
      text: "This approval request has already been handled.",
    }).text).toBe("This approval request has already been handled.")
  })
})
