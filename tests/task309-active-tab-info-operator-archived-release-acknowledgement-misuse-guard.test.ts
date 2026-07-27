import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalArchivedReleaseClosureMarker,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-archived-release-closure-marker.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgement,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-archived-release-acknowledgement.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_FINAL_ARCHIVED_RELEASE_CLOSURE_MARKER: YeonjangBrowserActiveTabInfoFinalArchivedReleaseClosureMarker = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-archived-release-closure-marker.v1",
  method: "browser.active_tab_info",
  status: "final_archived_release_closure_marker_ready",
  reasonCode: "active_tab_info_final_archived_release_closure_marker_ready",
  marker: {
    finalArchivedReleaseClosureMarkerId:
      "final-archived-release-closure-marker:browser.active_tab_info:b25",
    operatorArchiveIndexRetentionReceiptId:
      "operator-archive-index-retention-receipt:browser.active_tab_info:51a",
    sanitizedArchivedReleaseClosureMarkerRef:
      "archived-release-closure-marker:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalArchiveRetentionAcknowledgementRef:
      "final-archive-retention:active-tab-info:ack:001",
    markerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function operatorArchivedReleaseAcknowledgement() {
  return buildYeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgement({
    finalArchivedReleaseClosureMarker: READY_FINAL_ARCHIVED_RELEASE_CLOSURE_MARKER,
    sanitizedArchivedReleaseAcknowledgementRef:
      "archived-release-acknowledgement:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorArchivedReleaseAcknowledgementRef:
      "operator-archived-release:active-tab-info:ack:001",
  })
}

describe("task309 active tab info operator archived release acknowledgement misuse guard", () => {
  it("rejects approval evidence that tries to carry operator archived release acknowledgement state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T03:55:00.000Z"),
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
      yeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgement:
        operatorArchivedReleaseAcknowledgement(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept operator archived release acknowledgement as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgement:
          operatorArchivedReleaseAcknowledgement(),
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
        "yeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgement",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
