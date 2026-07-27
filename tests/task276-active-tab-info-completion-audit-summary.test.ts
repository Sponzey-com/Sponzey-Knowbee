import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoCompletionAuditSummary,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-completion-audit-summary.ts"
import type {
  YeonjangBrowserActiveTabInfoUserGoalCloseoutReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-user-goal-closeout-receipt.ts"

const READY_USER_GOAL_CLOSEOUT_RECEIPT: YeonjangBrowserActiveTabInfoUserGoalCloseoutReceipt = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-user-goal-closeout-receipt.v1",
  method: "browser.active_tab_info",
  status: "user_goal_closeout_receipt_ready",
  reasonCode: "active_tab_info_user_goal_closeout_receipt_ready",
  receipt: {
    userGoalCloseoutReceiptId: "user-goal-closeout-receipt:browser.active_tab_info:7a7",
    finalDeliveryGateId: "final-response-delivery-gate:browser.active_tab_info:8c7",
    llmSatisfactionDecisionStatus: "satisfied",
    userVisibleFinalResponseAcknowledgementRef: "user-visible-final-response:active-tab-info:ack:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
  },
  markUserGoalSucceededNow: true,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
  releaseReadinessNow: false,
  publicationReadinessNow: false,
}

describe("task276 active tab info completion audit summary", () => {
  it("builds a minimal redacted completion audit summary without release or activation readiness", () => {
    const summary = buildYeonjangBrowserActiveTabInfoCompletionAuditSummary({
      userGoalCloseoutReceipt: READY_USER_GOAL_CLOSEOUT_RECEIPT,
      finalResultProjectionRef: "final-result-projection:active-tab-info:redacted:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      sanitizedOperatorCompletionNoteRef: "operator-completion-note:active-tab-info:sanitized:001",
    })

    expect(summary).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-completion-audit-summary.v1",
      method: "browser.active_tab_info",
      status: "completion_audit_summary_ready",
      reasonCode: "active_tab_info_completion_audit_summary_ready",
      summary: {
        completionAuditSummaryId: "completion-audit-summary:browser.active_tab_info:19b",
        userGoalCloseoutReceiptId: "user-goal-closeout-receipt:browser.active_tab_info:7a7",
        finalResultProjectionRef: "final-result-projection:active-tab-info:redacted:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        sanitizedOperatorCompletionNoteRef: "operator-completion-note:active-tab-info:sanitized:001",
        completionStatus: "closed",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready closeout receipts and unsafe refs", () => {
    const summary = buildYeonjangBrowserActiveTabInfoCompletionAuditSummary({
      userGoalCloseoutReceipt: {
        ...READY_USER_GOAL_CLOSEOUT_RECEIPT,
        status: "blocked",
        receipt: undefined,
      },
      finalResultProjectionRef: "https://example.test/final?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      sanitizedOperatorCompletionNoteRef: "",
    })

    expect(summary.status).toBe("blocked")
    expect(summary.reasonCode).toBe("active_tab_info_completion_audit_summary_blocked")
    expect(summary.blockingReasonCodes).toEqual([
      "completion_audit_user_goal_closeout_receipt_not_ready",
      "completion_audit_final_result_projection_ref_invalid",
      "completion_audit_product_log_evidence_ref_invalid",
      "completion_audit_operator_completion_note_ref_invalid",
    ])
    expect(summary.summary).toBeUndefined()
  })

  it("does not expose raw response body, raw browser data, or downstream activation ids", () => {
    const summary = buildYeonjangBrowserActiveTabInfoCompletionAuditSummary({
      userGoalCloseoutReceipt: READY_USER_GOAL_CLOSEOUT_RECEIPT,
      finalResultProjectionRef: "final-result-projection:active-tab-info:redacted:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      sanitizedOperatorCompletionNoteRef: "operator-completion-note:active-tab-info:sanitized:001",
    })

    expect(JSON.stringify(summary)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
