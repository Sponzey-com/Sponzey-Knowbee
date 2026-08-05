import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalPostTransferArchivePointer,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-post-transfer-archive-pointer.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-post-transfer-archive-acknowledgement-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_FINAL_POST_TRANSFER_ARCHIVE_POINTER: YeonjangBrowserActiveTabInfoFinalPostTransferArchivePointer = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-post-transfer-archive-pointer.v1",
  method: "browser.active_tab_info",
  status: "final_post_transfer_archive_pointer_ready",
  reasonCode:
    "active_tab_info_final_post_transfer_archive_pointer_ready",
  pointer: {
    finalPostTransferArchivePointerId:
      "final-post-transfer-archive-pointer:browser.active_tab_info:5df",
    operatorFinalTransferAcknowledgementReceiptId:
      "operator-final-transfer-acknowledgement-receipt:browser.active_tab_info:b20",
    sanitizedPostTransferArchivePointerRef:
      "post-transfer-archive-pointer:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    archiveTransferAcknowledgementRef:
      "archive-transfer:active-tab-info:ack:001",
    pointerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function operatorPostTransferArchiveAcknowledgementReceipt() {
  return buildYeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceipt({
    finalPostTransferArchivePointer:
      READY_FINAL_POST_TRANSFER_ARCHIVE_POINTER,
    sanitizedOperatorPostTransferArchiveAcknowledgementReceiptRef:
      "operator-post-transfer-archive-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorPostTransferArchiveAcknowledgementRef:
      "operator-post-transfer-archive:active-tab-info:ack:001",
  })
}

describe("task353 active tab info operator post-transfer archive acknowledgement receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry operator post-transfer archive acknowledgement receipt state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T03:50:00.000Z"),
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
      yeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceipt:
        operatorPostTransferArchiveAcknowledgementReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept operator post-transfer archive acknowledgement receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceipt:
          operatorPostTransferArchiveAcknowledgementReceipt(),
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
        "yeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceipt",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
