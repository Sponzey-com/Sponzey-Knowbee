import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarker,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-sealed-archive-handoff-marker.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-sealed-completion-archive-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_OPERATOR_SEALED_COMPLETION_ARCHIVE_RECEIPT: YeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-sealed-completion-archive-receipt.v1",
  method: "browser.active_tab_info",
  status: "operator_sealed_completion_archive_receipt_ready",
  reasonCode:
    "active_tab_info_operator_sealed_completion_archive_receipt_ready",
  receipt: {
    operatorSealedCompletionArchiveReceiptId:
      "operator-sealed-completion-archive-receipt:browser.active_tab_info:a91",
    finalCompletionArchiveSealId:
      "final-completion-archive-seal:browser.active_tab_info:4e1",
    sanitizedOperatorSealedCompletionArchiveReceiptRef:
      "operator-sealed-completion-archive-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorSealedCompletionArchiveReceiptRef:
      "operator-sealed-completion-archive:active-tab-info:receipt:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function finalSealedArchiveHandoffMarker() {
  return buildYeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarker({
    operatorSealedCompletionArchiveReceipt:
      READY_OPERATOR_SEALED_COMPLETION_ARCHIVE_RECEIPT,
    sanitizedFinalSealedArchiveHandoffMarkerRef:
      "final-sealed-archive-handoff-marker:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalSealedArchiveHandoffAcknowledgementRef:
      "final-sealed-archive-handoff:active-tab-info:ack:001",
  })
}

describe("task323 active tab info final sealed archive handoff marker misuse guard", () => {
  it("rejects approval evidence that tries to carry final sealed archive handoff marker state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T01:10:00.000Z"),
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
      yeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarker:
        finalSealedArchiveHandoffMarker(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept final sealed archive handoff marker as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarker:
          finalSealedArchiveHandoffMarker(),
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
        "yeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarker",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
