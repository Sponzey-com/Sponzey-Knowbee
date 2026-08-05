import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-sealed-archive-closeout-ledger.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-closeout-acknowledgement-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_FINAL_SEALED_ARCHIVE_CLOSEOUT_LEDGER: YeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedger = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-sealed-archive-closeout-ledger.v1",
  method: "browser.active_tab_info",
  status: "final_sealed_archive_closeout_ledger_ready",
  reasonCode:
    "active_tab_info_final_sealed_archive_closeout_ledger_ready",
  ledger: {
    finalSealedArchiveCloseoutLedgerId:
      "final-sealed-archive-closeout-ledger:browser.active_tab_info:320",
    operatorFinalSealedArchiveReceiptId:
      "operator-final-sealed-archive-receipt:browser.active_tab_info:a63",
    sanitizedFinalSealedArchiveCloseoutLedgerRef:
      "final-sealed-archive-closeout-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalSealedArchiveCloseoutAcknowledgementRef:
      "final-sealed-archive-closeout:active-tab-info:ack:001",
    ledgerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function operatorFinalCloseoutAcknowledgementReceipt() {
  return buildYeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceipt({
    finalSealedArchiveCloseoutLedger:
      READY_FINAL_SEALED_ARCHIVE_CLOSEOUT_LEDGER,
    sanitizedOperatorFinalCloseoutAcknowledgementReceiptRef:
      "operator-final-closeout-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalCloseoutAcknowledgementReceiptRef:
      "operator-final-closeout:active-tab-info:receipt:001",
  })
}

describe("task333 active tab info operator final closeout acknowledgement receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry operator final closeout acknowledgement receipt state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T02:15:00.000Z"),
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
      yeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceipt:
        operatorFinalCloseoutAcknowledgementReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept operator final closeout acknowledgement receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceipt:
          operatorFinalCloseoutAcknowledgementReceipt(),
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
        "yeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceipt",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
