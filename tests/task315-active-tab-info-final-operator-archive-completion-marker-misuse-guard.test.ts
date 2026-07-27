import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalOperatorArchiveCompletionMarker,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-operator-archive-completion-marker.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-archival-completion-acknowledgement-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_OPERATOR_ARCHIVAL_COMPLETION_ACKNOWLEDGEMENT_RECEIPT: YeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-archival-completion-acknowledgement-receipt.v1",
  method: "browser.active_tab_info",
  status: "operator_archival_completion_acknowledgement_receipt_ready",
  reasonCode:
    "active_tab_info_operator_archival_completion_acknowledgement_receipt_ready",
  receipt: {
    operatorArchivalCompletionAcknowledgementReceiptId:
      "operator-archival-completion-acknowledgement-receipt:browser.active_tab_info:59e",
    finalArchivalCompletionIndexId:
      "final-archival-completion-index:browser.active_tab_info:7f7",
    sanitizedArchivalCompletionAcknowledgementRef:
      "archival-completion-acknowledgement:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorArchivalCompletionAcknowledgementRef:
      "operator-archival-completion:active-tab-info:ack:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function finalOperatorArchiveCompletionMarker() {
  return buildYeonjangBrowserActiveTabInfoFinalOperatorArchiveCompletionMarker({
    operatorArchivalCompletionAcknowledgementReceipt:
      READY_OPERATOR_ARCHIVAL_COMPLETION_ACKNOWLEDGEMENT_RECEIPT,
    sanitizedFinalOperatorArchiveCompletionMarkerRef:
      "final-operator-archive-completion-marker:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalOperatorArchiveCompletionAcknowledgementRef:
      "final-operator-archive-completion:active-tab-info:ack:001",
  })
}

describe("task315 active tab info final operator archive completion marker misuse guard", () => {
  it("rejects approval evidence that tries to carry final operator archive completion marker state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T00:17:00.000Z"),
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
      yeonjangBrowserActiveTabInfoFinalOperatorArchiveCompletionMarker:
        finalOperatorArchiveCompletionMarker(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept final operator archive completion marker as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoFinalOperatorArchiveCompletionMarker:
          finalOperatorArchiveCompletionMarker(),
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
        "yeonjangBrowserActiveTabInfoFinalOperatorArchiveCompletionMarker",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
