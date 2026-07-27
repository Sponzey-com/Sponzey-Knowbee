import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoArchivalReleaseEvidenceIndex,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-archival-release-evidence-index.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalArchivalPointer,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-archival-pointer.ts"

const READY_FINAL_ARCHIVAL_POINTER: YeonjangBrowserActiveTabInfoFinalArchivalPointer = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-archival-pointer.v1",
  method: "browser.active_tab_info",
  status: "final_archival_pointer_ready",
  reasonCode: "active_tab_info_final_archival_pointer_ready",
  pointer: {
    finalArchivalPointerId: "final-archival-pointer:browser.active_tab_info:425",
    operatorReadableCloseoutSummaryId:
      "operator-readable-closeout-summary:browser.active_tab_info:4a0",
    sanitizedArchiveDescriptorRef: "archive-descriptor:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    retentionPolicyAcknowledgementRef: "retention-policy:active-tab-info:ack:001",
    archivalPointerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task294 active tab info archival release evidence index", () => {
  it("builds a minimal redacted archival release evidence index without release or activation readiness", () => {
    const index = buildYeonjangBrowserActiveTabInfoArchivalReleaseEvidenceIndex({
      finalArchivalPointer: READY_FINAL_ARCHIVAL_POINTER,
      sanitizedEvidenceIndexRef: "archival-evidence-index:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      auditRetrievalAcknowledgementRef: "audit-retrieval:active-tab-info:ack:001",
    })

    expect(index).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-archival-release-evidence-index.v1",
      method: "browser.active_tab_info",
      status: "archival_release_evidence_index_ready",
      reasonCode: "active_tab_info_archival_release_evidence_index_ready",
      index: {
        archivalReleaseEvidenceIndexId:
          "archival-release-evidence-index:browser.active_tab_info:3be",
        finalArchivalPointerId: "final-archival-pointer:browser.active_tab_info:425",
        sanitizedEvidenceIndexRef: "archival-evidence-index:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        auditRetrievalAcknowledgementRef: "audit-retrieval:active-tab-info:ack:001",
        indexStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready final archival pointers and unsafe refs", () => {
    const index = buildYeonjangBrowserActiveTabInfoArchivalReleaseEvidenceIndex({
      finalArchivalPointer: {
        ...READY_FINAL_ARCHIVAL_POINTER,
        status: "blocked",
        pointer: undefined,
      },
      sanitizedEvidenceIndexRef: "https://example.test/index?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      auditRetrievalAcknowledgementRef: "",
    })

    expect(index.status).toBe("blocked")
    expect(index.reasonCode).toBe("active_tab_info_archival_release_evidence_index_blocked")
    expect(index.blockingReasonCodes).toEqual([
      "archival_release_evidence_index_pointer_not_ready",
      "archival_release_evidence_index_ref_invalid",
      "archival_release_evidence_index_product_log_evidence_ref_invalid",
      "archival_release_evidence_index_audit_retrieval_ack_ref_invalid",
    ])
    expect(index.index).toBeUndefined()
  })

  it("does not expose raw response body, raw browser data, or downstream activation ids", () => {
    const index = buildYeonjangBrowserActiveTabInfoArchivalReleaseEvidenceIndex({
      finalArchivalPointer: READY_FINAL_ARCHIVAL_POINTER,
      sanitizedEvidenceIndexRef: "archival-evidence-index:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      auditRetrievalAcknowledgementRef: "audit-retrieval:active-tab-info:ack:001",
    })

    expect(JSON.stringify(index)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
