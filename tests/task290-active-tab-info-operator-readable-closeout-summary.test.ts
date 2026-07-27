import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummary,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-readable-closeout-summary.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorCompletionNotice,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-completion-notice.ts"

const READY_OPERATOR_COMPLETION_NOTICE: YeonjangBrowserActiveTabInfoOperatorCompletionNotice = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-completion-notice.v1",
  method: "browser.active_tab_info",
  status: "operator_completion_notice_ready",
  reasonCode: "active_tab_info_operator_completion_notice_ready",
  notice: {
    operatorCompletionNoticeId: "operator-completion-notice:browser.active_tab_info:201",
    finalAuditHandoffBundleId: "final-audit-handoff-bundle:browser.active_tab_info:20b",
    sanitizedOperatorNoticeRef: "operator-completion-notice:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    userVisibleResponseAcknowledgementRef: "user-visible-response:active-tab-info:ack:001",
    noticeStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task290 active tab info operator-readable closeout summary", () => {
  it("builds a minimal redacted operator-readable closeout summary without release or activation readiness", () => {
    const summary = buildYeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummary({
      operatorCompletionNotice: READY_OPERATOR_COMPLETION_NOTICE,
      sanitizedCloseoutSummaryRef: "operator-readable-closeout-summary:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      auditHandoffAcknowledgementRef: "audit-handoff:active-tab-info:ack:001",
    })

    expect(summary).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-readable-closeout-summary.v1",
      method: "browser.active_tab_info",
      status: "operator_readable_closeout_summary_ready",
      reasonCode: "active_tab_info_operator_readable_closeout_summary_ready",
      summary: {
        operatorReadableCloseoutSummaryId:
          "operator-readable-closeout-summary:browser.active_tab_info:4a0",
        operatorCompletionNoticeId: "operator-completion-notice:browser.active_tab_info:201",
        sanitizedCloseoutSummaryRef:
          "operator-readable-closeout-summary:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        auditHandoffAcknowledgementRef: "audit-handoff:active-tab-info:ack:001",
        summaryStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready operator completion notices and unsafe refs", () => {
    const summary = buildYeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummary({
      operatorCompletionNotice: {
        ...READY_OPERATOR_COMPLETION_NOTICE,
        status: "blocked",
        notice: undefined,
      },
      sanitizedCloseoutSummaryRef: "https://example.test/closeout?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      auditHandoffAcknowledgementRef: "",
    })

    expect(summary.status).toBe("blocked")
    expect(summary.reasonCode).toBe("active_tab_info_operator_readable_closeout_summary_blocked")
    expect(summary.blockingReasonCodes).toEqual([
      "operator_readable_closeout_summary_notice_not_ready",
      "operator_readable_closeout_summary_ref_invalid",
      "operator_readable_closeout_summary_product_log_evidence_ref_invalid",
      "operator_readable_closeout_summary_audit_handoff_ack_ref_invalid",
    ])
    expect(summary.summary).toBeUndefined()
  })

  it("does not expose raw response body, raw browser data, or downstream activation ids", () => {
    const summary = buildYeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummary({
      operatorCompletionNotice: READY_OPERATOR_COMPLETION_NOTICE,
      sanitizedCloseoutSummaryRef: "operator-readable-closeout-summary:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      auditHandoffAcknowledgementRef: "audit-handoff:active-tab-info:ack:001",
    })

    expect(JSON.stringify(summary)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
