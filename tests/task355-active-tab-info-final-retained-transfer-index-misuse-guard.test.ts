import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalRetainedTransferIndex,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-transfer-index.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-post-transfer-archive-acknowledgement-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_OPERATOR_POST_TRANSFER_ARCHIVE_ACKNOWLEDGEMENT_RECEIPT: YeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-post-transfer-archive-acknowledgement-receipt.v1",
  method: "browser.active_tab_info",
  status: "operator_post_transfer_archive_acknowledgement_receipt_ready",
  reasonCode:
    "active_tab_info_operator_post_transfer_archive_acknowledgement_receipt_ready",
  receipt: {
    operatorPostTransferArchiveAcknowledgementReceiptId:
      "operator-post-transfer-archive-acknowledgement-receipt:browser.active_tab_info:cf2",
    finalPostTransferArchivePointerId:
      "final-post-transfer-archive-pointer:browser.active_tab_info:5df",
    sanitizedOperatorPostTransferArchiveAcknowledgementReceiptRef:
      "operator-post-transfer-archive-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorPostTransferArchiveAcknowledgementRef:
      "operator-post-transfer-archive:active-tab-info:ack:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function finalRetainedTransferIndex() {
  return buildYeonjangBrowserActiveTabInfoFinalRetainedTransferIndex({
    operatorPostTransferArchiveAcknowledgementReceipt:
      READY_OPERATOR_POST_TRANSFER_ARCHIVE_ACKNOWLEDGEMENT_RECEIPT,
    sanitizedRetainedTransferIndexRef:
      "retained-transfer-index:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    retentionTransferAcknowledgementRef:
      "retention-transfer:active-tab-info:ack:001",
  })
}

describe("task355 active tab info final retained transfer index misuse guard", () => {
  it("rejects approval evidence that tries to carry final retained transfer index state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T04:05:00.000Z"),
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
      yeonjangBrowserActiveTabInfoFinalRetainedTransferIndex:
        finalRetainedTransferIndex(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept final retained transfer index as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoFinalRetainedTransferIndex:
          finalRetainedTransferIndex(),
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
        "yeonjangBrowserActiveTabInfoFinalRetainedTransferIndex",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
