import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoFinalAuditHandoffBundle,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-audit-handoff-bundle.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalCloseoutLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-closeout-ledger.ts"

const READY_FINAL_CLOSEOUT_LEDGER: YeonjangBrowserActiveTabInfoFinalCloseoutLedger = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-closeout-ledger.v1",
  method: "browser.active_tab_info",
  status: "final_closeout_ledger_ready",
  reasonCode: "active_tab_info_final_closeout_ledger_ready",
  ledger: {
    finalCloseoutLedgerId: "final-closeout-ledger:browser.active_tab_info:0b3",
    operatorCloseoutNoteId: "operator-closeout-note:browser.active_tab_info:54c",
    completionAuditSummaryRef: "completion-audit-summary:active-tab-info:ref:001",
    terminalDeliveryReceiptRef: "terminal-delivery-receipt:active-tab-info:ref:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    ledgerStatus: "closed",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task286 active tab info final audit handoff bundle", () => {
  it("builds a minimal redacted final audit handoff bundle without release or activation readiness", () => {
    const bundle = buildYeonjangBrowserActiveTabInfoFinalAuditHandoffBundle({
      finalCloseoutLedger: READY_FINAL_CLOSEOUT_LEDGER,
      sanitizedAuditArtifactDescriptorRef: "audit-artifact-descriptor:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      releaseSurfaceMatrixAcknowledgementRef: "release-surface-matrix:active-tab-info:ack:001",
    })

    expect(bundle).toEqual({
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
    })
  })

  it("blocks unready final closeout ledgers and unsafe refs", () => {
    const bundle = buildYeonjangBrowserActiveTabInfoFinalAuditHandoffBundle({
      finalCloseoutLedger: {
        ...READY_FINAL_CLOSEOUT_LEDGER,
        status: "blocked",
        ledger: undefined,
      },
      sanitizedAuditArtifactDescriptorRef: "https://example.test/audit?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      releaseSurfaceMatrixAcknowledgementRef: "",
    })

    expect(bundle.status).toBe("blocked")
    expect(bundle.reasonCode).toBe("active_tab_info_final_audit_handoff_bundle_blocked")
    expect(bundle.blockingReasonCodes).toEqual([
      "final_audit_handoff_ledger_not_ready",
      "final_audit_handoff_descriptor_ref_invalid",
      "final_audit_handoff_product_log_evidence_ref_invalid",
      "final_audit_handoff_surface_matrix_ack_ref_invalid",
    ])
    expect(bundle.bundle).toBeUndefined()
  })

  it("does not expose raw response body, raw browser data, or downstream activation ids", () => {
    const bundle = buildYeonjangBrowserActiveTabInfoFinalAuditHandoffBundle({
      finalCloseoutLedger: READY_FINAL_CLOSEOUT_LEDGER,
      sanitizedAuditArtifactDescriptorRef: "audit-artifact-descriptor:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      releaseSurfaceMatrixAcknowledgementRef: "release-surface-matrix:active-tab-info:ack:001",
    })

    expect(JSON.stringify(bundle)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
