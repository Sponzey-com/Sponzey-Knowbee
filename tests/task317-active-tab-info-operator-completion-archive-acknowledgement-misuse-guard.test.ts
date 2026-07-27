import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalOperatorArchiveCompletionMarker,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-operator-archive-completion-marker.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorCompletionArchiveAcknowledgement,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-completion-archive-acknowledgement.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_FINAL_OPERATOR_ARCHIVE_COMPLETION_MARKER: YeonjangBrowserActiveTabInfoFinalOperatorArchiveCompletionMarker = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-operator-archive-completion-marker.v1",
  method: "browser.active_tab_info",
  status: "final_operator_archive_completion_marker_ready",
  reasonCode: "active_tab_info_final_operator_archive_completion_marker_ready",
  marker: {
    finalOperatorArchiveCompletionMarkerId:
      "final-operator-archive-completion-marker:browser.active_tab_info:d47",
    operatorArchivalCompletionAcknowledgementReceiptId:
      "operator-archival-completion-acknowledgement-receipt:browser.active_tab_info:59e",
    sanitizedFinalOperatorArchiveCompletionMarkerRef:
      "final-operator-archive-completion-marker:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalOperatorArchiveCompletionAcknowledgementRef:
      "final-operator-archive-completion:active-tab-info:ack:001",
    markerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function operatorCompletionArchiveAcknowledgement() {
  return buildYeonjangBrowserActiveTabInfoOperatorCompletionArchiveAcknowledgement({
    finalOperatorArchiveCompletionMarker:
      READY_FINAL_OPERATOR_ARCHIVE_COMPLETION_MARKER,
    sanitizedOperatorCompletionArchiveAcknowledgementRef:
      "operator-completion-archive-acknowledgement:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorCompletionArchiveAcknowledgementRef:
      "operator-completion-archive:active-tab-info:ack:001",
  })
}

describe("task317 active tab info operator completion archive acknowledgement misuse guard", () => {
  it("rejects approval evidence that tries to carry operator completion archive acknowledgement state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T00:20:00.000Z"),
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
      yeonjangBrowserActiveTabInfoOperatorCompletionArchiveAcknowledgement:
        operatorCompletionArchiveAcknowledgement(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept operator completion archive acknowledgement as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoOperatorCompletionArchiveAcknowledgement:
          operatorCompletionArchiveAcknowledgement(),
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
        "yeonjangBrowserActiveTabInfoOperatorCompletionArchiveAcknowledgement",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
