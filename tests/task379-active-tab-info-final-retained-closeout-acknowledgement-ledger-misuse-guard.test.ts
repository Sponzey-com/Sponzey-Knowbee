import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalRetainedCloseoutAcknowledgementLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-closeout-acknowledgement-ledger.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-retained-closeout-acknowledgement-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_OPERATOR_RETAINED_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT: YeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-retained-closeout-acknowledgement-receipt.v1",
  method: "browser.active_tab_info",
  status: "operator_retained_closeout_acknowledgement_receipt_ready",
  reasonCode:
    "active_tab_info_operator_retained_closeout_acknowledgement_receipt_ready",
  receipt: {
    operatorRetainedCloseoutAcknowledgementReceiptId:
      "operator-retained-closeout-acknowledgement-receipt:browser.active_tab_info:d34",
    finalRetainedSealCloseoutLedgerId:
      "final-retained-seal-closeout-ledger:browser.active_tab_info:5c3",
    sanitizedOperatorRetainedCloseoutAcknowledgementReceiptRef:
      "operator-retained-closeout-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorRetainedCloseoutAcknowledgementRef:
      "operator-retained-closeout:active-tab-info:ack:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function finalRetainedCloseoutAcknowledgementLedger() {
  return buildYeonjangBrowserActiveTabInfoFinalRetainedCloseoutAcknowledgementLedger({
    operatorRetainedCloseoutAcknowledgementReceipt:
      READY_OPERATOR_RETAINED_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT,
    sanitizedFinalRetainedCloseoutAcknowledgementLedgerRef:
      "final-retained-closeout-acknowledgement-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetainedCloseoutAcknowledgementRef:
      "final-retained-closeout:active-tab-info:ack:001",
  })
}

describe("task379 active tab info final retained closeout acknowledgement ledger misuse guard", () => {
  it("rejects approval evidence that tries to carry final retained closeout acknowledgement ledger state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T06:08:00.000Z"),
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
      yeonjangBrowserActiveTabInfoFinalRetainedCloseoutAcknowledgementLedger:
        finalRetainedCloseoutAcknowledgementLedger(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept final retained closeout acknowledgement ledger as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoFinalRetainedCloseoutAcknowledgementLedger:
          finalRetainedCloseoutAcknowledgementLedger(),
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
        "yeonjangBrowserActiveTabInfoFinalRetainedCloseoutAcknowledgementLedger",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
