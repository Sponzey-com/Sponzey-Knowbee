import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalArchivalPointer,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-archival-pointer.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummary,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-readable-closeout-summary.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_OPERATOR_READABLE_CLOSEOUT_SUMMARY:
  YeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummary = {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-readable-closeout-summary.v1",
    method: "browser.active_tab_info",
    status: "operator_readable_closeout_summary_ready",
    reasonCode: "active_tab_info_operator_readable_closeout_summary_ready",
    summary: {
      operatorReadableCloseoutSummaryId:
        "operator-readable-closeout-summary:browser.active_tab_info:4a0",
      operatorCompletionNoticeId: "operator-completion-notice:browser.active_tab_info:201",
      sanitizedCloseoutSummaryRef:
        "operator-readable-closeout-summary:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      auditHandoffAcknowledgementRef: "audit-handoff:active-tab-info:ack:001",
      summaryStatus: "ready",
    },
    releaseReadinessNow: false,
    publicationReadinessNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
  }

function finalArchivalPointer() {
  return buildYeonjangBrowserActiveTabInfoFinalArchivalPointer({
    operatorReadableCloseoutSummary: READY_OPERATOR_READABLE_CLOSEOUT_SUMMARY,
    sanitizedArchiveDescriptorRef: "archive-descriptor:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    retentionPolicyAcknowledgementRef: "retention-policy:active-tab-info:ack:001",
  })
}

describe("task293 active tab info final archival pointer misuse guard", () => {
  it("rejects approval evidence that tries to carry final archival pointer state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T02:31:00.000Z"),
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
      yeonjangBrowserActiveTabInfoFinalArchivalPointer: finalArchivalPointer(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept final archival pointer as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoFinalArchivalPointer: finalArchivalPointer(),
      } as unknown as typeof redacted.observation,
      evidenceRef,
      verificationStatus: "verified",
    })).toEqual({
      ok: false,
      reasonCode: "final_result_redaction_required",
    })

    expect(buildYeonjangBrowserActiveTabInfoProductLogProjection({
      evidenceRef,
      fields: ["evidenceRef", "yeonjangBrowserActiveTabInfoFinalArchivalPointer"],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
