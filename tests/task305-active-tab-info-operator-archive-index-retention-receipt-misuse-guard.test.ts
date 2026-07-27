import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointer,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-release-archive-index-pointer.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorArchiveIndexRetentionReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-archive-index-retention-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_FINAL_RELEASE_ARCHIVE_INDEX_POINTER: YeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointer = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-release-archive-index-pointer.v1",
  method: "browser.active_tab_info",
  status: "final_release_archive_index_pointer_ready",
  reasonCode: "active_tab_info_final_release_archive_index_pointer_ready",
  pointer: {
    finalReleaseArchiveIndexPointerId:
      "final-release-archive-index-pointer:browser.active_tab_info:f27",
    operatorReleaseArchiveCompletionNoticeId:
      "operator-release-archive-completion-notice:browser.active_tab_info:f4d",
    sanitizedReleaseArchiveIndexPointerRef:
      "release-archive-index-pointer:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    archiveIndexRetentionAcknowledgementRef:
      "archive-index-retention:active-tab-info:ack:001",
    pointerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function operatorArchiveIndexRetentionReceipt() {
  return buildYeonjangBrowserActiveTabInfoOperatorArchiveIndexRetentionReceipt({
    finalReleaseArchiveIndexPointer: READY_FINAL_RELEASE_ARCHIVE_INDEX_POINTER,
    sanitizedArchiveIndexRetentionReceiptRef:
      "archive-index-retention-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorRetentionAcknowledgementRef:
      "operator-retention:active-tab-info:ack:001",
  })
}

describe("task305 active tab info operator archive index retention receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry operator archive index retention receipt state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T03:31:00.000Z"),
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
      yeonjangBrowserActiveTabInfoOperatorArchiveIndexRetentionReceipt:
        operatorArchiveIndexRetentionReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept operator archive index retention receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoOperatorArchiveIndexRetentionReceipt:
          operatorArchiveIndexRetentionReceipt(),
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
        "yeonjangBrowserActiveTabInfoOperatorArchiveIndexRetentionReceipt",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
