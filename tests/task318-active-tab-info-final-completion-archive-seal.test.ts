import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoFinalCompletionArchiveSeal,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-completion-archive-seal.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorCompletionArchiveAcknowledgement,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-completion-archive-acknowledgement.ts"

const READY_OPERATOR_COMPLETION_ARCHIVE_ACKNOWLEDGEMENT: YeonjangBrowserActiveTabInfoOperatorCompletionArchiveAcknowledgement = {
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
}

describe("task318 active tab info final completion archive seal", () => {
  it("builds a minimal redacted final completion archive seal without release or activation readiness", () => {
    const seal = buildYeonjangBrowserActiveTabInfoFinalCompletionArchiveSeal({
      operatorCompletionArchiveAcknowledgement:
        READY_OPERATOR_COMPLETION_ARCHIVE_ACKNOWLEDGEMENT,
      sanitizedFinalCompletionArchiveSealRef:
        "final-completion-archive-seal:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      finalCompletionArchiveAcknowledgementRef:
        "final-completion-archive:active-tab-info:ack:001",
    })

    expect(seal).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-final-completion-archive-seal.v1",
      method: "browser.active_tab_info",
      status: "final_completion_archive_seal_ready",
      reasonCode: "active_tab_info_final_completion_archive_seal_ready",
      seal: {
        finalCompletionArchiveSealId:
          "final-completion-archive-seal:browser.active_tab_info:4e1",
        operatorCompletionArchiveAcknowledgementId:
          "operator-completion-archive-acknowledgement:browser.active_tab_info:76c",
        sanitizedFinalCompletionArchiveSealRef:
          "final-completion-archive-seal:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalCompletionArchiveAcknowledgementRef:
          "final-completion-archive:active-tab-info:ack:001",
        sealStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready operator completion archive acknowledgement and unsafe refs", () => {
    const seal = buildYeonjangBrowserActiveTabInfoFinalCompletionArchiveSeal({
      operatorCompletionArchiveAcknowledgement: {
        ...READY_OPERATOR_COMPLETION_ARCHIVE_ACKNOWLEDGEMENT,
        status: "blocked",
        acknowledgement: undefined,
      },
      sanitizedFinalCompletionArchiveSealRef:
        "https://example.test/seal?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      finalCompletionArchiveAcknowledgementRef: "",
    })

    expect(seal.status).toBe("blocked")
    expect(seal.reasonCode).toBe(
      "active_tab_info_final_completion_archive_seal_blocked",
    )
    expect(seal.blockingReasonCodes).toEqual([
      "final_completion_archive_seal_acknowledgement_not_ready",
      "final_completion_archive_seal_ref_invalid",
      "final_completion_archive_seal_product_log_evidence_ref_invalid",
      "final_completion_archive_ack_ref_invalid",
    ])
    expect(seal.seal).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const seal = buildYeonjangBrowserActiveTabInfoFinalCompletionArchiveSeal({
      operatorCompletionArchiveAcknowledgement:
        READY_OPERATOR_COMPLETION_ARCHIVE_ACKNOWLEDGEMENT,
      sanitizedFinalCompletionArchiveSealRef:
        "final-completion-archive-seal:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      finalCompletionArchiveAcknowledgementRef:
        "final-completion-archive:active-tab-info:ack:001",
    })

    expect(JSON.stringify(seal)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
