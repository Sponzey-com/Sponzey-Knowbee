import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoFinalArchivedReleaseClosureMarker,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-archived-release-closure-marker.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgement,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-archived-release-acknowledgement.ts"

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

describe("task308 active tab info operator archived release acknowledgement", () => {
  it("builds a minimal redacted archived release acknowledgement without release or activation readiness", () => {
    const acknowledgement = buildYeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgement({
      finalArchivedReleaseClosureMarker: READY_FINAL_ARCHIVED_RELEASE_CLOSURE_MARKER,
      sanitizedArchivedReleaseAcknowledgementRef:
        "archived-release-acknowledgement:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      operatorArchivedReleaseAcknowledgementRef:
        "operator-archived-release:active-tab-info:ack:001",
    })

    expect(acknowledgement).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-archived-release-acknowledgement.v1",
      method: "browser.active_tab_info",
      status: "operator_archived_release_acknowledgement_ready",
      reasonCode: "active_tab_info_operator_archived_release_acknowledgement_ready",
      acknowledgement: {
        operatorArchivedReleaseAcknowledgementId:
          "operator-archived-release-acknowledgement:browser.active_tab_info:a4b",
        finalArchivedReleaseClosureMarkerId:
          "final-archived-release-closure-marker:browser.active_tab_info:b25",
        sanitizedArchivedReleaseAcknowledgementRef:
          "archived-release-acknowledgement:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorArchivedReleaseAcknowledgementRef:
          "operator-archived-release:active-tab-info:ack:001",
        acknowledgementStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready final archived release closure markers and unsafe refs", () => {
    const acknowledgement = buildYeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgement({
      finalArchivedReleaseClosureMarker: {
        ...READY_FINAL_ARCHIVED_RELEASE_CLOSURE_MARKER,
        status: "blocked",
        marker: undefined,
      },
      sanitizedArchivedReleaseAcknowledgementRef:
        "https://example.test/ack?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      operatorArchivedReleaseAcknowledgementRef: "",
    })

    expect(acknowledgement.status).toBe("blocked")
    expect(acknowledgement.reasonCode).toBe("active_tab_info_operator_archived_release_acknowledgement_blocked")
    expect(acknowledgement.blockingReasonCodes).toEqual([
      "operator_archived_release_acknowledgement_marker_not_ready",
      "operator_archived_release_acknowledgement_ref_invalid",
      "operator_archived_release_acknowledgement_product_log_evidence_ref_invalid",
      "operator_archived_release_ack_ref_invalid",
    ])
    expect(acknowledgement.acknowledgement).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const acknowledgement = buildYeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgement({
      finalArchivedReleaseClosureMarker: READY_FINAL_ARCHIVED_RELEASE_CLOSURE_MARKER,
      sanitizedArchivedReleaseAcknowledgementRef:
        "archived-release-acknowledgement:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      operatorArchivedReleaseAcknowledgementRef:
        "operator-archived-release:active-tab-info:ack:001",
    })

    expect(JSON.stringify(acknowledgement)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
