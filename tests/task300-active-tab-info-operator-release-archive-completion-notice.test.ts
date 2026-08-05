import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoOperatorReleaseArchiveCompletionNotice,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-release-archive-completion-notice.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-audit-release-closure-ledger.ts"

const READY_FINAL_AUDIT_RELEASE_CLOSURE_LEDGER: YeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedger = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-audit-release-closure-ledger.v1",
  method: "browser.active_tab_info",
  status: "final_audit_release_closure_ledger_ready",
  reasonCode: "active_tab_info_final_audit_release_closure_ledger_ready",
  ledger: {
    finalAuditReleaseClosureLedgerId:
      "final-audit-release-closure-ledger:browser.active_tab_info:1c9",
    finalAuditReleaseHandoffReceiptId:
      "final-audit-release-handoff-receipt:browser.active_tab_info:3f8",
    sanitizedReleaseClosureLedgerRef:
      "release-closure-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    auditArchiveClosureAcknowledgementRef: "audit-archive-closure:active-tab-info:ack:001",
    ledgerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task300 active tab info operator release archive completion notice", () => {
  it("builds a minimal redacted archive completion notice without release or activation readiness", () => {
    const notice = buildYeonjangBrowserActiveTabInfoOperatorReleaseArchiveCompletionNotice({
      finalAuditReleaseClosureLedger: READY_FINAL_AUDIT_RELEASE_CLOSURE_LEDGER,
      sanitizedArchiveCompletionNoticeRef:
        "archive-completion-notice:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      operatorArchiveAcknowledgementRef: "operator-archive:active-tab-info:ack:001",
    })

    expect(notice).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-operator-release-archive-completion-notice.v1",
      method: "browser.active_tab_info",
      status: "operator_release_archive_completion_notice_ready",
      reasonCode: "active_tab_info_operator_release_archive_completion_notice_ready",
      notice: {
        operatorReleaseArchiveCompletionNoticeId:
          "operator-release-archive-completion-notice:browser.active_tab_info:f4d",
        finalAuditReleaseClosureLedgerId:
          "final-audit-release-closure-ledger:browser.active_tab_info:1c9",
        sanitizedArchiveCompletionNoticeRef:
          "archive-completion-notice:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorArchiveAcknowledgementRef: "operator-archive:active-tab-info:ack:001",
        noticeStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready final audit release closure ledgers and unsafe refs", () => {
    const notice = buildYeonjangBrowserActiveTabInfoOperatorReleaseArchiveCompletionNotice({
      finalAuditReleaseClosureLedger: {
        ...READY_FINAL_AUDIT_RELEASE_CLOSURE_LEDGER,
        status: "blocked",
        ledger: undefined,
      },
      sanitizedArchiveCompletionNoticeRef: "https://example.test/archive?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      operatorArchiveAcknowledgementRef: "",
    })

    expect(notice.status).toBe("blocked")
    expect(notice.reasonCode).toBe(
      "active_tab_info_operator_release_archive_completion_notice_blocked",
    )
    expect(notice.blockingReasonCodes).toEqual([
      "operator_release_archive_completion_notice_closure_ledger_not_ready",
      "operator_release_archive_completion_notice_ref_invalid",
      "operator_release_archive_completion_notice_product_log_evidence_ref_invalid",
      "operator_release_archive_completion_notice_operator_archive_ack_ref_invalid",
    ])
    expect(notice.notice).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const notice = buildYeonjangBrowserActiveTabInfoOperatorReleaseArchiveCompletionNotice({
      finalAuditReleaseClosureLedger: READY_FINAL_AUDIT_RELEASE_CLOSURE_LEDGER,
      sanitizedArchiveCompletionNoticeRef:
        "archive-completion-notice:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      operatorArchiveAcknowledgementRef: "operator-archive:active-tab-info:ack:001",
    })

    expect(JSON.stringify(notice)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
