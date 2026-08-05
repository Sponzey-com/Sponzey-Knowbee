import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-sealed-archive-closeout-ledger.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorFinalSealedArchiveReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-sealed-archive-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_OPERATOR_FINAL_SEALED_ARCHIVE_RECEIPT: YeonjangBrowserActiveTabInfoOperatorFinalSealedArchiveReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-final-sealed-archive-receipt.v1",
  method: "browser.active_tab_info",
  status: "operator_final_sealed_archive_receipt_ready",
  reasonCode:
    "active_tab_info_operator_final_sealed_archive_receipt_ready",
  receipt: {
    operatorFinalSealedArchiveReceiptId:
      "operator-final-sealed-archive-receipt:browser.active_tab_info:a63",
    finalSealedArchiveHandoffCompletionIndexId:
      "final-sealed-archive-handoff-completion-index:browser.active_tab_info:246",
    sanitizedOperatorFinalSealedArchiveReceiptRef:
      "operator-final-sealed-archive-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalSealedArchiveReceiptRef:
      "operator-final-sealed-archive:active-tab-info:receipt:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function finalSealedArchiveCloseoutLedger() {
  return buildYeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedger({
    operatorFinalSealedArchiveReceipt:
      READY_OPERATOR_FINAL_SEALED_ARCHIVE_RECEIPT,
    sanitizedFinalSealedArchiveCloseoutLedgerRef:
      "final-sealed-archive-closeout-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalSealedArchiveCloseoutAcknowledgementRef:
      "final-sealed-archive-closeout:active-tab-info:ack:001",
  })
}

describe("task331 active tab info final sealed archive closeout ledger misuse guard", () => {
  it("rejects approval evidence that tries to carry final sealed archive closeout ledger state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T02:05:00.000Z"),
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
      yeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedger:
        finalSealedArchiveCloseoutLedger(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept final sealed archive closeout ledger as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedger:
          finalSealedArchiveCloseoutLedger(),
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
        "yeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedger",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
