import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoFinalOperatorArchiveCompletionMarker,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-operator-archive-completion-marker.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorCompletionArchiveAcknowledgement,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-completion-archive-acknowledgement.ts"

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

describe("task316 active tab info operator completion archive acknowledgement", () => {
  it("builds a minimal redacted operator completion archive acknowledgement without release or activation readiness", () => {
    const acknowledgement =
      buildYeonjangBrowserActiveTabInfoOperatorCompletionArchiveAcknowledgement({
        finalOperatorArchiveCompletionMarker:
          READY_FINAL_OPERATOR_ARCHIVE_COMPLETION_MARKER,
        sanitizedOperatorCompletionArchiveAcknowledgementRef:
          "operator-completion-archive-acknowledgement:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorCompletionArchiveAcknowledgementRef:
          "operator-completion-archive:active-tab-info:ack:001",
      })

    expect(acknowledgement).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-operator-completion-archive-acknowledgement.v1",
      method: "browser.active_tab_info",
      status: "operator_completion_archive_acknowledgement_ready",
      reasonCode:
        "active_tab_info_operator_completion_archive_acknowledgement_ready",
      acknowledgement: {
        operatorCompletionArchiveAcknowledgementId:
          "operator-completion-archive-acknowledgement:browser.active_tab_info:76c",
        finalOperatorArchiveCompletionMarkerId:
          "final-operator-archive-completion-marker:browser.active_tab_info:d47",
        sanitizedOperatorCompletionArchiveAcknowledgementRef:
          "operator-completion-archive-acknowledgement:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorCompletionArchiveAcknowledgementRef:
          "operator-completion-archive:active-tab-info:ack:001",
        acknowledgementStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready final operator archive completion marker and unsafe refs", () => {
    const acknowledgement =
      buildYeonjangBrowserActiveTabInfoOperatorCompletionArchiveAcknowledgement({
        finalOperatorArchiveCompletionMarker: {
          ...READY_FINAL_OPERATOR_ARCHIVE_COMPLETION_MARKER,
          status: "blocked",
          marker: undefined,
        },
        sanitizedOperatorCompletionArchiveAcknowledgementRef:
          "https://example.test/ack?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        operatorCompletionArchiveAcknowledgementRef: "",
      })

    expect(acknowledgement.status).toBe("blocked")
    expect(acknowledgement.reasonCode).toBe(
      "active_tab_info_operator_completion_archive_acknowledgement_blocked",
    )
    expect(acknowledgement.blockingReasonCodes).toEqual([
      "operator_completion_archive_acknowledgement_marker_not_ready",
      "operator_completion_archive_acknowledgement_ref_invalid",
      "operator_completion_archive_acknowledgement_product_log_evidence_ref_invalid",
      "operator_completion_archive_ack_ref_invalid",
    ])
    expect(acknowledgement.acknowledgement).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const acknowledgement =
      buildYeonjangBrowserActiveTabInfoOperatorCompletionArchiveAcknowledgement({
        finalOperatorArchiveCompletionMarker:
          READY_FINAL_OPERATOR_ARCHIVE_COMPLETION_MARKER,
        sanitizedOperatorCompletionArchiveAcknowledgementRef:
          "operator-completion-archive-acknowledgement:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorCompletionArchiveAcknowledgementRef:
          "operator-completion-archive:active-tab-info:ack:001",
      })

    expect(JSON.stringify(acknowledgement)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
