import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-audit-release-closure-ledger.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalAuditReleaseHandoffReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-audit-release-handoff-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

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

function finalAuditReleaseClosureLedger() {
  return buildYeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedger({
    finalAuditReleaseHandoffReceipt: READY_FINAL_AUDIT_RELEASE_HANDOFF_RECEIPT,
    sanitizedReleaseClosureLedgerRef: "release-closure-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    auditArchiveClosureAcknowledgementRef: "audit-archive-closure:active-tab-info:ack:001",
  })
}

describe("task299 active tab info final audit release closure ledger misuse guard", () => {
  it("rejects approval evidence that tries to carry final audit release closure ledger state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T02:55:00.000Z"),
      yeonjangBrowserActiveTabInfoReleaseGateEvidence: {
        moduleEvidence: [],
        testEvidence: [],
      },
    })
    const evidence = buildReleaseApprovalEvidenceProjection({
      manifest,
      readiness: evaluateReleaseReadiness(manifest),
    })

    expect(validateReleaseApprovalEvidenceProjection({
      ...evidence,
      yeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedger:
        finalAuditReleaseClosureLedger(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept final audit release closure ledger as final response or product log evidence", () => {
    const redacted = projectYeonjangBrowserActiveTabInfo({
      browserName: "Google Chrome",
      title: "Private Ticket",
      url: "https://example.test/account?token=private",
      observationStatus: "available",
    })
    if (!redacted.ok) throw new Error(redacted.reasonCode)
    const evidenceRef = buildYeonjangBrowserActiveTabInfoEvidenceRef({
      publicTargetName: "Studio Mac",
      observation: redacted.observation,
    })

    expect(buildYeonjangBrowserActiveTabInfoFinalResultProjection({
      publicTargetName: "Studio Mac",
      observation: {
        ...redacted.observation,
        yeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedger:
          finalAuditReleaseClosureLedger(),
      } as unknown as typeof redacted.observation,
      evidenceRef,
      verificationStatus: "verified",
    })).toEqual({
      ok: false,
      reasonCode: "final_result_redaction_required",
    })

    expect(buildYeonjangBrowserActiveTabInfoProductLogProjection({
      evidenceRef,
      fields: [
        "evidenceRef",
        "yeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedger",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
