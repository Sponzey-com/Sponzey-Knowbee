import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoFinalArchivalCompletionIndex,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-archival-completion-index.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgement,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-archived-release-acknowledgement.ts"

const READY_OPERATOR_ARCHIVED_RELEASE_ACKNOWLEDGEMENT: YeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgement = {
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
}

describe("task310 active tab info final archival completion index", () => {
  it("builds a minimal redacted archival completion index without release or activation readiness", () => {
    const index = buildYeonjangBrowserActiveTabInfoFinalArchivalCompletionIndex({
      operatorArchivedReleaseAcknowledgement: READY_OPERATOR_ARCHIVED_RELEASE_ACKNOWLEDGEMENT,
      sanitizedArchivalCompletionIndexRef:
        "archival-completion-index:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      archivalCompletionRetentionAcknowledgementRef:
        "archival-completion-retention:active-tab-info:ack:001",
    })

    expect(index).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-archival-completion-index.v1",
      method: "browser.active_tab_info",
      status: "final_archival_completion_index_ready",
      reasonCode: "active_tab_info_final_archival_completion_index_ready",
      index: {
        finalArchivalCompletionIndexId:
          "final-archival-completion-index:browser.active_tab_info:7f7",
        operatorArchivedReleaseAcknowledgementId:
          "operator-archived-release-acknowledgement:browser.active_tab_info:a4b",
        sanitizedArchivalCompletionIndexRef:
          "archival-completion-index:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        archivalCompletionRetentionAcknowledgementRef:
          "archival-completion-retention:active-tab-info:ack:001",
        indexStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready operator archived release acknowledgements and unsafe refs", () => {
    const index = buildYeonjangBrowserActiveTabInfoFinalArchivalCompletionIndex({
      operatorArchivedReleaseAcknowledgement: {
        ...READY_OPERATOR_ARCHIVED_RELEASE_ACKNOWLEDGEMENT,
        status: "blocked",
        acknowledgement: undefined,
      },
      sanitizedArchivalCompletionIndexRef:
        "https://example.test/index?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      archivalCompletionRetentionAcknowledgementRef: "",
    })

    expect(index.status).toBe("blocked")
    expect(index.reasonCode).toBe("active_tab_info_final_archival_completion_index_blocked")
    expect(index.blockingReasonCodes).toEqual([
      "final_archival_completion_index_acknowledgement_not_ready",
      "final_archival_completion_index_ref_invalid",
      "final_archival_completion_index_product_log_evidence_ref_invalid",
      "archival_completion_retention_ack_ref_invalid",
    ])
    expect(index.index).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const index = buildYeonjangBrowserActiveTabInfoFinalArchivalCompletionIndex({
      operatorArchivedReleaseAcknowledgement: READY_OPERATOR_ARCHIVED_RELEASE_ACKNOWLEDGEMENT,
      sanitizedArchivalCompletionIndexRef:
        "archival-completion-index:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      archivalCompletionRetentionAcknowledgementRef:
        "archival-completion-retention:active-tab-info:ack:001",
    })

    expect(JSON.stringify(index)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
