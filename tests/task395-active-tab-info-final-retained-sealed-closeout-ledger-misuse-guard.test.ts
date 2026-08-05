import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-sealed-closeout-ledger.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-closeout-sealed-acknowledgement-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_OPERATOR_FINAL_RETAINED_CLOSEOUT_SEALED_ACKNOWLEDGEMENT_RECEIPT: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-closeout-sealed-acknowledgement-receipt.v1",
  method: "browser.active_tab_info",
  status:
    "operator_final_retained_closeout_sealed_acknowledgement_receipt_ready",
  reasonCode:
    "active_tab_info_operator_final_retained_closeout_sealed_acknowledgement_receipt_ready",
  receipt: {
    operatorFinalRetainedCloseoutSealedAcknowledgementReceiptId:
      "operator-final-retained-closeout-sealed-acknowledgement-receipt:browser.active_tab_info:f25",
    finalRetainedCloseoutSealedLedgerId:
      "final-retained-closeout-sealed-ledger:browser.active_tab_info:ac0",
    sanitizedOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptRef:
      "operator-final-retained-closeout-sealed-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalRetainedCloseoutSealedAcknowledgementRef:
      "operator-final-retained-closeout-sealed:active-tab-info:ack:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function finalRetainedSealedCloseoutLedger() {
  return buildYeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedger({
    operatorFinalRetainedCloseoutSealedAcknowledgementReceipt:
      READY_OPERATOR_FINAL_RETAINED_CLOSEOUT_SEALED_ACKNOWLEDGEMENT_RECEIPT,
    sanitizedFinalRetainedSealedCloseoutLedgerRef:
      "final-retained-sealed-closeout-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetainedSealedCloseoutRef:
      "final-retained-sealed-closeout:active-tab-info:ack:001",
  })
}

describe("task395 active tab info final retained sealed closeout ledger misuse guard", () => {
  it("rejects approval evidence that tries to carry final retained sealed closeout ledger state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T07:30:00.000Z"),
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
      yeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedger:
        finalRetainedSealedCloseoutLedger(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept final retained sealed closeout ledger as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedger:
          finalRetainedSealedCloseoutLedger(),
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
        "yeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedger",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
