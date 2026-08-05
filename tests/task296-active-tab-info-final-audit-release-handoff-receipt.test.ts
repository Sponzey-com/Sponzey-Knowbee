import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoFinalAuditReleaseHandoffReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-audit-release-handoff-receipt.ts"
import type {
  YeonjangBrowserActiveTabInfoArchivalReleaseEvidenceIndex,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-archival-release-evidence-index.ts"

const READY_ARCHIVAL_RELEASE_EVIDENCE_INDEX: YeonjangBrowserActiveTabInfoArchivalReleaseEvidenceIndex = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-archival-release-evidence-index.v1",
  method: "browser.active_tab_info",
  status: "archival_release_evidence_index_ready",
  reasonCode: "active_tab_info_archival_release_evidence_index_ready",
  index: {
    archivalReleaseEvidenceIndexId: "archival-release-evidence-index:browser.active_tab_info:3be",
    finalArchivalPointerId: "final-archival-pointer:browser.active_tab_info:425",
    sanitizedEvidenceIndexRef: "archival-evidence-index:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    auditRetrievalAcknowledgementRef: "audit-retrieval:active-tab-info:ack:001",
    indexStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task296 active tab info final audit release handoff receipt", () => {
  it("builds a minimal redacted manual audit handoff receipt without release or activation readiness", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoFinalAuditReleaseHandoffReceipt({
      archivalReleaseEvidenceIndex: READY_ARCHIVAL_RELEASE_EVIDENCE_INDEX,
      sanitizedReleaseHandoffReceiptRef: "release-handoff:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      manualAuditQueueAcknowledgementRef: "manual-audit-queue:active-tab-info:ack:001",
    })

    expect(receipt).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-audit-release-handoff-receipt.v1",
      method: "browser.active_tab_info",
      status: "final_audit_release_handoff_receipt_ready",
      reasonCode: "active_tab_info_final_audit_release_handoff_receipt_ready",
      receipt: {
        finalAuditReleaseHandoffReceiptId:
          "final-audit-release-handoff-receipt:browser.active_tab_info:3f8",
        archivalReleaseEvidenceIndexId:
          "archival-release-evidence-index:browser.active_tab_info:3be",
        sanitizedReleaseHandoffReceiptRef: "release-handoff:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        manualAuditQueueAcknowledgementRef: "manual-audit-queue:active-tab-info:ack:001",
        receiptStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready archival release evidence indexes and unsafe refs", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoFinalAuditReleaseHandoffReceipt({
      archivalReleaseEvidenceIndex: {
        ...READY_ARCHIVAL_RELEASE_EVIDENCE_INDEX,
        status: "blocked",
        index: undefined,
      },
      sanitizedReleaseHandoffReceiptRef: "https://example.test/handoff?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      manualAuditQueueAcknowledgementRef: "",
    })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe(
      "active_tab_info_final_audit_release_handoff_receipt_blocked",
    )
    expect(receipt.blockingReasonCodes).toEqual([
      "final_audit_release_handoff_receipt_index_not_ready",
      "final_audit_release_handoff_receipt_ref_invalid",
      "final_audit_release_handoff_receipt_product_log_evidence_ref_invalid",
      "final_audit_release_handoff_receipt_manual_audit_queue_ack_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoFinalAuditReleaseHandoffReceipt({
      archivalReleaseEvidenceIndex: READY_ARCHIVAL_RELEASE_EVIDENCE_INDEX,
      sanitizedReleaseHandoffReceiptRef: "release-handoff:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      manualAuditQueueAcknowledgementRef: "manual-audit-queue:active-tab-info:ack:001",
    })

    expect(JSON.stringify(receipt)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
