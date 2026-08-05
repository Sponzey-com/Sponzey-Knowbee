import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointer,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-release-archive-index-pointer.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorReleaseArchiveCompletionNotice,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-release-archive-completion-notice.ts"

const READY_OPERATOR_RELEASE_ARCHIVE_COMPLETION_NOTICE: YeonjangBrowserActiveTabInfoOperatorReleaseArchiveCompletionNotice = {
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
}

describe("task302 active tab info final release archive index pointer", () => {
  it("builds a minimal redacted release archive index pointer without release or activation readiness", () => {
    const pointer = buildYeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointer({
      operatorReleaseArchiveCompletionNotice: READY_OPERATOR_RELEASE_ARCHIVE_COMPLETION_NOTICE,
      sanitizedReleaseArchiveIndexPointerRef:
        "release-archive-index-pointer:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      archiveIndexRetentionAcknowledgementRef:
        "archive-index-retention:active-tab-info:ack:001",
    })

    expect(pointer).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-release-archive-index-pointer.v1",
      method: "browser.active_tab_info",
      status: "final_release_archive_index_pointer_ready",
      reasonCode: "active_tab_info_final_release_archive_index_pointer_ready",
      pointer: {
        finalReleaseArchiveIndexPointerId:
          "final-release-archive-index-pointer:browser.active_tab_info:f27",
        operatorReleaseArchiveCompletionNoticeId:
          "operator-release-archive-completion-notice:browser.active_tab_info:f4d",
        sanitizedReleaseArchiveIndexPointerRef:
          "release-archive-index-pointer:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        archiveIndexRetentionAcknowledgementRef:
          "archive-index-retention:active-tab-info:ack:001",
        pointerStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready operator release archive completion notices and unsafe refs", () => {
    const pointer = buildYeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointer({
      operatorReleaseArchiveCompletionNotice: {
        ...READY_OPERATOR_RELEASE_ARCHIVE_COMPLETION_NOTICE,
        status: "blocked",
        notice: undefined,
      },
      sanitizedReleaseArchiveIndexPointerRef: "https://example.test/archive?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      archiveIndexRetentionAcknowledgementRef: "",
    })

    expect(pointer.status).toBe("blocked")
    expect(pointer.reasonCode).toBe("active_tab_info_final_release_archive_index_pointer_blocked")
    expect(pointer.blockingReasonCodes).toEqual([
      "final_release_archive_index_pointer_notice_not_ready",
      "final_release_archive_index_pointer_ref_invalid",
      "final_release_archive_index_pointer_product_log_evidence_ref_invalid",
      "final_release_archive_index_pointer_retention_ack_ref_invalid",
    ])
    expect(pointer.pointer).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const pointer = buildYeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointer({
      operatorReleaseArchiveCompletionNotice: READY_OPERATOR_RELEASE_ARCHIVE_COMPLETION_NOTICE,
      sanitizedReleaseArchiveIndexPointerRef:
        "release-archive-index-pointer:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      archiveIndexRetentionAcknowledgementRef:
        "archive-index-retention:active-tab-info:ack:001",
    })

    expect(JSON.stringify(pointer)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
