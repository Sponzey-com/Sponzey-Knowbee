import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalArchivedReleaseClosureMarker,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-archived-release-closure-marker.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorArchiveIndexRetentionReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-archive-index-retention-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_OPERATOR_ARCHIVE_INDEX_RETENTION_RECEIPT: YeonjangBrowserActiveTabInfoOperatorArchiveIndexRetentionReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-archive-index-retention-receipt.v1",
  method: "browser.active_tab_info",
  status: "operator_archive_index_retention_receipt_ready",
  reasonCode: "active_tab_info_operator_archive_index_retention_receipt_ready",
  receipt: {
    operatorArchiveIndexRetentionReceiptId:
      "operator-archive-index-retention-receipt:browser.active_tab_info:51a",
    finalReleaseArchiveIndexPointerId:
      "final-release-archive-index-pointer:browser.active_tab_info:f27",
    sanitizedArchiveIndexRetentionReceiptRef:
      "archive-index-retention-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorRetentionAcknowledgementRef:
      "operator-retention:active-tab-info:ack:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function finalArchivedReleaseClosureMarker() {
  return buildYeonjangBrowserActiveTabInfoFinalArchivedReleaseClosureMarker({
    operatorArchiveIndexRetentionReceipt: READY_OPERATOR_ARCHIVE_INDEX_RETENTION_RECEIPT,
    sanitizedArchivedReleaseClosureMarkerRef:
      "archived-release-closure-marker:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalArchiveRetentionAcknowledgementRef:
      "final-archive-retention:active-tab-info:ack:001",
  })
}

describe("task307 active tab info final archived release closure marker misuse guard", () => {
  it("rejects approval evidence that tries to carry final archived release closure marker state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T03:43:00.000Z"),
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
      yeonjangBrowserActiveTabInfoFinalArchivedReleaseClosureMarker:
        finalArchivedReleaseClosureMarker(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept final archived release closure marker as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoFinalArchivedReleaseClosureMarker:
          finalArchivedReleaseClosureMarker(),
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
        "yeonjangBrowserActiveTabInfoFinalArchivedReleaseClosureMarker",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
