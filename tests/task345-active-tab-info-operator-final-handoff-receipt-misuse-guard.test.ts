import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalHandoffClosureMarker,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-handoff-closure-marker.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalHandoffReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-handoff-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_FINAL_HANDOFF_CLOSURE_MARKER: YeonjangBrowserActiveTabInfoFinalHandoffClosureMarker = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-handoff-closure-marker.v1",
  method: "browser.active_tab_info",
  status: "final_handoff_closure_marker_ready",
  reasonCode:
    "active_tab_info_final_handoff_closure_marker_ready",
  marker: {
    finalHandoffClosureMarkerId:
      "final-handoff-closure-marker:browser.active_tab_info:cbb",
    operatorFinalRetentionAcknowledgementReceiptId:
      "operator-final-retention-acknowledgement-receipt:browser.active_tab_info:8b2",
    sanitizedFinalHandoffClosureMarkerRef:
      "final-handoff-closure-marker:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalHandoffClosureAcknowledgementRef:
      "final-handoff-closure:active-tab-info:ack:001",
    markerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function operatorFinalHandoffReceipt() {
  return buildYeonjangBrowserActiveTabInfoOperatorFinalHandoffReceipt({
    finalHandoffClosureMarker:
      READY_FINAL_HANDOFF_CLOSURE_MARKER,
    sanitizedOperatorFinalHandoffReceiptRef:
      "operator-final-handoff-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalHandoffAcknowledgementRef:
      "operator-final-handoff:active-tab-info:ack:001",
  })
}

describe("task345 active tab info operator final handoff receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry operator final handoff receipt state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T03:10:00.000Z"),
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
      yeonjangBrowserActiveTabInfoOperatorFinalHandoffReceipt:
        operatorFinalHandoffReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept operator final handoff receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoOperatorFinalHandoffReceipt:
          operatorFinalHandoffReceipt(),
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
        "yeonjangBrowserActiveTabInfoOperatorFinalHandoffReceipt",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
