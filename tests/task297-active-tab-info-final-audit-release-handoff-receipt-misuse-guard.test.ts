import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalAuditReleaseHandoffReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-audit-release-handoff-receipt.ts"
import type {
  YeonjangBrowserActiveTabInfoArchivalReleaseEvidenceIndex,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-archival-release-evidence-index.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_ARCHIVAL_RELEASE_EVIDENCE_INDEX: YeonjangBrowserActiveTabInfoArchivalReleaseEvidenceIndex = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-archival-release-evidence-index.v1",
  method: "browser.active_tab_info",
  status: "archival_release_evidence_index_ready",
  reasonCode: "active_tab_info_archival_release_evidence_index_ready",
  index: {
    archivalReleaseEvidenceIndexId: "archival-release-evidence-index:browser.active_tab_info:3be",
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
}

function finalAuditReleaseHandoffReceipt() {
  return buildYeonjangBrowserActiveTabInfoFinalAuditReleaseHandoffReceipt({
    archivalReleaseEvidenceIndex: READY_ARCHIVAL_RELEASE_EVIDENCE_INDEX,
    sanitizedReleaseHandoffReceiptRef: "release-handoff:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    manualAuditQueueAcknowledgementRef: "manual-audit-queue:active-tab-info:ack:001",
  })
}

describe("task297 active tab info final audit release handoff receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry final audit release handoff receipt state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T02:43:00.000Z"),
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
      yeonjangBrowserActiveTabInfoFinalAuditReleaseHandoffReceipt:
        finalAuditReleaseHandoffReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept final audit release handoff receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoFinalAuditReleaseHandoffReceipt:
          finalAuditReleaseHandoffReceipt(),
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
        "yeonjangBrowserActiveTabInfoFinalAuditReleaseHandoffReceipt",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
