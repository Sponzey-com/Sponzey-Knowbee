import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarker,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-sealed-archive-handoff-marker.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-sealed-archive-handoff-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_FINAL_SEALED_ARCHIVE_HANDOFF_MARKER: YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarker = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-sealed-archive-handoff-marker.v1",
  method: "browser.active_tab_info",
  status: "final_sealed_archive_handoff_marker_ready",
  reasonCode: "active_tab_info_final_sealed_archive_handoff_marker_ready",
  marker: {
    finalSealedArchiveHandoffMarkerId:
      "final-sealed-archive-handoff-marker:browser.active_tab_info:3b5",
    operatorSealedCompletionArchiveReceiptId:
      "operator-sealed-completion-archive-receipt:browser.active_tab_info:a91",
    sanitizedFinalSealedArchiveHandoffMarkerRef:
      "final-sealed-archive-handoff-marker:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalSealedArchiveHandoffAcknowledgementRef:
      "final-sealed-archive-handoff:active-tab-info:ack:001",
    markerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function operatorSealedArchiveHandoffReceipt() {
  return buildYeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceipt({
    finalSealedArchiveHandoffMarker:
      READY_FINAL_SEALED_ARCHIVE_HANDOFF_MARKER,
    sanitizedOperatorSealedArchiveHandoffReceiptRef:
      "operator-sealed-archive-handoff-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorSealedArchiveHandoffReceiptRef:
      "operator-sealed-archive-handoff:active-tab-info:receipt:001",
  })
}

describe("task325 active tab info operator sealed archive handoff receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry operator sealed archive handoff receipt state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T01:25:00.000Z"),
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
      yeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceipt:
        operatorSealedArchiveHandoffReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept operator sealed archive handoff receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceipt:
          operatorSealedArchiveHandoffReceipt(),
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
        "yeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceipt",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
