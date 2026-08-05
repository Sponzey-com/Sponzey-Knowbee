import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorFinalTransferAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-transfer-acknowledgement-receipt.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalPostTransferArchivePointer,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-post-transfer-archive-pointer.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_OPERATOR_FINAL_TRANSFER_ACKNOWLEDGEMENT_RECEIPT: YeonjangBrowserActiveTabInfoOperatorFinalTransferAcknowledgementReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-final-transfer-acknowledgement-receipt.v1",
  method: "browser.active_tab_info",
  status: "operator_final_transfer_acknowledgement_receipt_ready",
  reasonCode:
    "active_tab_info_operator_final_transfer_acknowledgement_receipt_ready",
  receipt: {
    operatorFinalTransferAcknowledgementReceiptId:
      "operator-final-transfer-acknowledgement-receipt:browser.active_tab_info:b20",
    finalTransferCloseoutLedgerId:
      "final-transfer-closeout-ledger:browser.active_tab_info:b00",
    sanitizedOperatorFinalTransferAcknowledgementReceiptRef:
      "operator-final-transfer-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalTransferAcknowledgementRef:
      "operator-final-transfer:active-tab-info:ack:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function finalPostTransferArchivePointer() {
  return buildYeonjangBrowserActiveTabInfoFinalPostTransferArchivePointer({
    operatorFinalTransferAcknowledgementReceipt:
      READY_OPERATOR_FINAL_TRANSFER_ACKNOWLEDGEMENT_RECEIPT,
    sanitizedPostTransferArchivePointerRef:
      "post-transfer-archive-pointer:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    archiveTransferAcknowledgementRef:
      "archive-transfer:active-tab-info:ack:001",
  })
}

describe("task351 active tab info final post-transfer archive pointer misuse guard", () => {
  it("rejects approval evidence that tries to carry final post-transfer archive pointer state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T03:45:00.000Z"),
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
      yeonjangBrowserActiveTabInfoFinalPostTransferArchivePointer:
        finalPostTransferArchivePointer(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept final post-transfer archive pointer as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoFinalPostTransferArchivePointer:
          finalPostTransferArchivePointer(),
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
        "yeonjangBrowserActiveTabInfoFinalPostTransferArchivePointer",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
