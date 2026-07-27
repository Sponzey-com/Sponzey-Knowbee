import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalArchivalCompletionIndex,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-archival-completion-index.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgement,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-archived-release-acknowledgement.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

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

function finalArchivalCompletionIndex() {
  return buildYeonjangBrowserActiveTabInfoFinalArchivalCompletionIndex({
    operatorArchivedReleaseAcknowledgement: READY_OPERATOR_ARCHIVED_RELEASE_ACKNOWLEDGEMENT,
    sanitizedArchivalCompletionIndexRef:
      "archival-completion-index:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    archivalCompletionRetentionAcknowledgementRef:
      "archival-completion-retention:active-tab-info:ack:001",
  })
}

describe("task311 active tab info final archival completion index misuse guard", () => {
  it("rejects approval evidence that tries to carry final archival completion index state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T04:07:00.000Z"),
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
      yeonjangBrowserActiveTabInfoFinalArchivalCompletionIndex:
        finalArchivalCompletionIndex(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept final archival completion index as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoFinalArchivalCompletionIndex:
          finalArchivalCompletionIndex(),
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
        "yeonjangBrowserActiveTabInfoFinalArchivalCompletionIndex",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
