import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-audit-release-closure-ledger.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalAuditReleaseHandoffReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-audit-release-handoff-receipt.ts"

const READY_FINAL_AUDIT_RELEASE_HANDOFF_RECEIPT: YeonjangBrowserActiveTabInfoFinalAuditReleaseHandoffReceipt = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-audit-release-handoff-receipt.v1",
  method: "browser.active_tab_info",
  status: "final_audit_release_handoff_receipt_ready",
  reasonCode: "active_tab_info_final_audit_release_handoff_receipt_ready",
  receipt: {
    finalAuditReleaseHandoffReceiptId:
      "final-audit-release-handoff-receipt:browser.active_tab_info:3f8",
    archivalReleaseEvidenceIndexId: "archival-release-evidence-index:browser.active_tab_info:3be",
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
}

describe("task298 active tab info final audit release closure ledger", () => {
  it("builds a minimal redacted audit archive closure ledger without release or activation readiness", () => {
    const ledger = buildYeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedger({
      finalAuditReleaseHandoffReceipt: READY_FINAL_AUDIT_RELEASE_HANDOFF_RECEIPT,
      sanitizedReleaseClosureLedgerRef: "release-closure-ledger:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      auditArchiveClosureAcknowledgementRef: "audit-archive-closure:active-tab-info:ack:001",
    })

    expect(ledger).toEqual({
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
        auditArchiveClosureAcknowledgementRef:
          "audit-archive-closure:active-tab-info:ack:001",
        ledgerStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready final audit release handoff receipts and unsafe refs", () => {
    const ledger = buildYeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedger({
      finalAuditReleaseHandoffReceipt: {
        ...READY_FINAL_AUDIT_RELEASE_HANDOFF_RECEIPT,
        status: "blocked",
        receipt: undefined,
      },
      sanitizedReleaseClosureLedgerRef: "https://example.test/closure?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      auditArchiveClosureAcknowledgementRef: "",
    })

    expect(ledger.status).toBe("blocked")
    expect(ledger.reasonCode).toBe("active_tab_info_final_audit_release_closure_ledger_blocked")
    expect(ledger.blockingReasonCodes).toEqual([
      "final_audit_release_closure_ledger_handoff_receipt_not_ready",
      "final_audit_release_closure_ledger_ref_invalid",
      "final_audit_release_closure_ledger_product_log_evidence_ref_invalid",
      "final_audit_release_closure_ledger_audit_archive_closure_ack_ref_invalid",
    ])
    expect(ledger.ledger).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const ledger = buildYeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedger({
      finalAuditReleaseHandoffReceipt: READY_FINAL_AUDIT_RELEASE_HANDOFF_RECEIPT,
      sanitizedReleaseClosureLedgerRef: "release-closure-ledger:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      auditArchiveClosureAcknowledgementRef: "audit-archive-closure:active-tab-info:ack:001",
    })

    expect(JSON.stringify(ledger)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
