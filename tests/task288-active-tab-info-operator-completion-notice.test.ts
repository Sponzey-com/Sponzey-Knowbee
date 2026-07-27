import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoOperatorCompletionNotice,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-completion-notice.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalAuditHandoffBundle,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-audit-handoff-bundle.ts"

const READY_FINAL_AUDIT_HANDOFF_BUNDLE: YeonjangBrowserActiveTabInfoFinalAuditHandoffBundle = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-audit-handoff-bundle.v1",
  method: "browser.active_tab_info",
  status: "final_audit_handoff_bundle_ready",
  reasonCode: "active_tab_info_final_audit_handoff_bundle_ready",
  bundle: {
    finalAuditHandoffBundleId: "final-audit-handoff-bundle:browser.active_tab_info:20b",
    finalCloseoutLedgerId: "final-closeout-ledger:browser.active_tab_info:0b3",
    sanitizedAuditArtifactDescriptorRef: "audit-artifact-descriptor:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    releaseSurfaceMatrixAcknowledgementRef: "release-surface-matrix:active-tab-info:ack:001",
    handoffStatus: "handoff_ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task288 active tab info operator completion notice", () => {
  it("builds a minimal redacted operator completion notice without release or activation readiness", () => {
    const notice = buildYeonjangBrowserActiveTabInfoOperatorCompletionNotice({
      finalAuditHandoffBundle: READY_FINAL_AUDIT_HANDOFF_BUNDLE,
      sanitizedOperatorNoticeRef: "operator-completion-notice:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      userVisibleResponseAcknowledgementRef: "user-visible-response:active-tab-info:ack:001",
    })

    expect(notice).toEqual({
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
    })
  })

  it("blocks unready final audit handoff bundles and unsafe refs", () => {
    const notice = buildYeonjangBrowserActiveTabInfoOperatorCompletionNotice({
      finalAuditHandoffBundle: {
        ...READY_FINAL_AUDIT_HANDOFF_BUNDLE,
        status: "blocked",
        bundle: undefined,
      },
      sanitizedOperatorNoticeRef: "https://example.test/operator?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      userVisibleResponseAcknowledgementRef: "",
    })

    expect(notice.status).toBe("blocked")
    expect(notice.reasonCode).toBe("active_tab_info_operator_completion_notice_blocked")
    expect(notice.blockingReasonCodes).toEqual([
      "operator_completion_notice_handoff_bundle_not_ready",
      "operator_completion_notice_ref_invalid",
      "operator_completion_notice_product_log_evidence_ref_invalid",
      "operator_completion_notice_user_visible_ack_ref_invalid",
    ])
    expect(notice.notice).toBeUndefined()
  })

  it("does not expose raw response body, raw browser data, or downstream activation ids", () => {
    const notice = buildYeonjangBrowserActiveTabInfoOperatorCompletionNotice({
      finalAuditHandoffBundle: READY_FINAL_AUDIT_HANDOFF_BUNDLE,
      sanitizedOperatorNoticeRef: "operator-completion-notice:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      userVisibleResponseAcknowledgementRef: "user-visible-response:active-tab-info:ack:001",
    })

    expect(JSON.stringify(notice)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
