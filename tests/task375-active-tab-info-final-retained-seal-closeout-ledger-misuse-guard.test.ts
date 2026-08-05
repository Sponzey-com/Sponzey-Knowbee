import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-seal-closeout-ledger.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorRetainedSealAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-retained-seal-acknowledgement-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_OPERATOR_RETAINED_SEAL_ACKNOWLEDGEMENT_RECEIPT: YeonjangBrowserActiveTabInfoOperatorRetainedSealAcknowledgementReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-retained-seal-acknowledgement-receipt.v1",
  method: "browser.active_tab_info",
  status: "operator_retained_seal_acknowledgement_receipt_ready",
  reasonCode:
    "active_tab_info_operator_retained_seal_acknowledgement_receipt_ready",
  receipt: {
    operatorRetainedSealAcknowledgementReceiptId:
      "operator-retained-seal-acknowledgement-receipt:browser.active_tab_info:53e",
    finalRetainedLedgerAcknowledgementSealId:
      "final-retained-ledger-acknowledgement-seal:browser.active_tab_info:170",
    sanitizedOperatorRetainedSealAcknowledgementReceiptRef:
      "operator-retained-seal-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorRetainedSealAcknowledgementRef:
      "operator-retained-seal:active-tab-info:ack:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function finalRetainedSealCloseoutLedger() {
  return buildYeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedger({
    operatorRetainedSealAcknowledgementReceipt:
      READY_OPERATOR_RETAINED_SEAL_ACKNOWLEDGEMENT_RECEIPT,
    sanitizedFinalRetainedSealCloseoutLedgerRef:
      "final-retained-seal-closeout-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetainedSealCloseoutAcknowledgementRef:
      "final-retained-seal-closeout:active-tab-info:ack:001",
  })
}

describe("task375 active tab info final retained seal closeout ledger misuse guard", () => {
  it("rejects approval evidence that tries to carry final retained seal closeout ledger state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T05:45:00.000Z"),
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
      yeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedger:
        finalRetainedSealCloseoutLedger(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept final retained seal closeout ledger as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedger:
          finalRetainedSealCloseoutLedger(),
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
        "yeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedger",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
