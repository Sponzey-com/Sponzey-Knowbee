import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-acknowledgement-ledger.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-retained-transfer-index-acknowledgement-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_OPERATOR_RETAINED_TRANSFER_INDEX_ACKNOWLEDGEMENT_RECEIPT: YeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-retained-transfer-index-acknowledgement-receipt.v1",
  method: "browser.active_tab_info",
  status:
    "operator_retained_transfer_index_acknowledgement_receipt_ready",
  reasonCode:
    "active_tab_info_operator_retained_transfer_index_acknowledgement_receipt_ready",
  receipt: {
    operatorRetainedTransferIndexAcknowledgementReceiptId:
      "operator-retained-transfer-index-acknowledgement-receipt:browser.active_tab_info:2bb",
    finalRetainedTransferIndexId:
      "final-retained-transfer-index:browser.active_tab_info:944",
    sanitizedOperatorRetainedTransferIndexAcknowledgementReceiptRef:
      "operator-retained-transfer-index-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorRetainedTransferAcknowledgementRef:
      "operator-retained-transfer:active-tab-info:ack:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function finalRetainedAcknowledgementLedger() {
  return buildYeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedger({
    operatorRetainedTransferIndexAcknowledgementReceipt:
      READY_OPERATOR_RETAINED_TRANSFER_INDEX_ACKNOWLEDGEMENT_RECEIPT,
    sanitizedFinalRetainedAcknowledgementLedgerRef:
      "final-retained-acknowledgement-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetainedAcknowledgementRef:
      "final-retained-acknowledgement:active-tab-info:ack:001",
  })
}

describe("task359 active tab info final retained acknowledgement ledger misuse guard", () => {
  it("rejects approval evidence that tries to carry final retained acknowledgement ledger state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T04:20:00.000Z"),
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
      yeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedger:
        finalRetainedAcknowledgementLedger(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept final retained acknowledgement ledger as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedger:
          finalRetainedAcknowledgementLedger(),
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
        "yeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedger",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
