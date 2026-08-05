import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalArchivalCompletionIndex,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-archival-completion-index.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-archival-completion-acknowledgement-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_FINAL_ARCHIVAL_COMPLETION_INDEX: YeonjangBrowserActiveTabInfoFinalArchivalCompletionIndex = {
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
}

function operatorArchivalCompletionAcknowledgementReceipt() {
  return buildYeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceipt({
    finalArchivalCompletionIndex: READY_FINAL_ARCHIVAL_COMPLETION_INDEX,
    sanitizedArchivalCompletionAcknowledgementRef:
      "archival-completion-acknowledgement:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorArchivalCompletionAcknowledgementRef:
      "operator-archival-completion:active-tab-info:ack:001",
  })
}

describe("task313 active tab info operator archival completion acknowledgement receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry operator archival completion acknowledgement receipt state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T04:13:00.000Z"),
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
      yeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceipt:
        operatorArchivalCompletionAcknowledgementReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept operator archival completion acknowledgement receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceipt:
          operatorArchivalCompletionAcknowledgementReceipt(),
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
        "yeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceipt",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
