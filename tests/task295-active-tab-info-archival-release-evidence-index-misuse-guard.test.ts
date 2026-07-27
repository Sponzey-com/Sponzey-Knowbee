import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoArchivalReleaseEvidenceIndex,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-archival-release-evidence-index.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalArchivalPointer,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-archival-pointer.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

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

function archivalReleaseEvidenceIndex() {
  return buildYeonjangBrowserActiveTabInfoArchivalReleaseEvidenceIndex({
    finalArchivalPointer: READY_FINAL_ARCHIVAL_POINTER,
    sanitizedEvidenceIndexRef: "archival-evidence-index:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    auditRetrievalAcknowledgementRef: "audit-retrieval:active-tab-info:ack:001",
  })
}

describe("task295 active tab info archival release evidence index misuse guard", () => {
  it("rejects approval evidence that tries to carry archival release evidence index state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T02:36:00.000Z"),
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
      yeonjangBrowserActiveTabInfoArchivalReleaseEvidenceIndex: archivalReleaseEvidenceIndex(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept archival release evidence index as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoArchivalReleaseEvidenceIndex:
          archivalReleaseEvidenceIndex(),
      } as unknown as typeof redacted.observation,
      evidenceRef,
      verificationStatus: "verified",
    })).toEqual({
      ok: false,
      reasonCode: "final_result_redaction_required",
    })

    expect(buildYeonjangBrowserActiveTabInfoProductLogProjection({
      evidenceRef,
      fields: ["evidenceRef", "yeonjangBrowserActiveTabInfoArchivalReleaseEvidenceIndex"],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
