import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoFinalArchivalPointer,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-archival-pointer.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummary,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-readable-closeout-summary.ts"

const READY_OPERATOR_READABLE_CLOSEOUT_SUMMARY:
  YeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummary = {
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
  }

describe("task292 active tab info final archival pointer", () => {
  it("builds a minimal redacted final archival pointer without release or activation readiness", () => {
    const pointer = buildYeonjangBrowserActiveTabInfoFinalArchivalPointer({
      operatorReadableCloseoutSummary: READY_OPERATOR_READABLE_CLOSEOUT_SUMMARY,
      sanitizedArchiveDescriptorRef: "archive-descriptor:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      retentionPolicyAcknowledgementRef: "retention-policy:active-tab-info:ack:001",
    })

    expect(pointer).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-archival-pointer.v1",
      method: "browser.active_tab_info",
      status: "final_archival_pointer_ready",
      reasonCode: "active_tab_info_final_archival_pointer_ready",
      pointer: {
        finalArchivalPointerId: "final-archival-pointer:browser.active_tab_info:425",
        operatorReadableCloseoutSummaryId:
          "operator-readable-closeout-summary:browser.active_tab_info:4a0",
        sanitizedArchiveDescriptorRef: "archive-descriptor:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        retentionPolicyAcknowledgementRef: "retention-policy:active-tab-info:ack:001",
        archivalPointerStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready operator-readable closeout summaries and unsafe refs", () => {
    const pointer = buildYeonjangBrowserActiveTabInfoFinalArchivalPointer({
      operatorReadableCloseoutSummary: {
        ...READY_OPERATOR_READABLE_CLOSEOUT_SUMMARY,
        status: "blocked",
        summary: undefined,
      },
      sanitizedArchiveDescriptorRef: "https://example.test/archive?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      retentionPolicyAcknowledgementRef: "",
    })

    expect(pointer.status).toBe("blocked")
    expect(pointer.reasonCode).toBe("active_tab_info_final_archival_pointer_blocked")
    expect(pointer.blockingReasonCodes).toEqual([
      "final_archival_pointer_closeout_summary_not_ready",
      "final_archival_pointer_archive_descriptor_ref_invalid",
      "final_archival_pointer_product_log_evidence_ref_invalid",
      "final_archival_pointer_retention_policy_ack_ref_invalid",
    ])
    expect(pointer.pointer).toBeUndefined()
  })

  it("does not expose raw response body, raw browser data, or downstream activation ids", () => {
    const pointer = buildYeonjangBrowserActiveTabInfoFinalArchivalPointer({
      operatorReadableCloseoutSummary: READY_OPERATOR_READABLE_CLOSEOUT_SUMMARY,
      sanitizedArchiveDescriptorRef: "archive-descriptor:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      retentionPolicyAcknowledgementRef: "retention-policy:active-tab-info:ack:001",
    })

    expect(JSON.stringify(pointer)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
