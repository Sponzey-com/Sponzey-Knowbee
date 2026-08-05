import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummary,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-readable-closeout-summary.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorCompletionNotice,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-completion-notice.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_OPERATOR_COMPLETION_NOTICE: YeonjangBrowserActiveTabInfoOperatorCompletionNotice = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-completion-notice.v1",
  method: "browser.active_tab_info",
  status: "operator_completion_notice_ready",
  reasonCode: "active_tab_info_operator_completion_notice_ready",
  notice: {
    operatorCompletionNoticeId: "operator-completion-notice:browser.active_tab_info:201",
    finalAuditHandoffBundleId: "final-audit-handoff-bundle:browser.active_tab_info:20b",
    sanitizedOperatorNoticeRef: "operator-completion-notice:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    userVisibleResponseAcknowledgementRef: "user-visible-response:active-tab-info:ack:001",
    noticeStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function operatorReadableCloseoutSummary() {
  return buildYeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummary({
    operatorCompletionNotice: READY_OPERATOR_COMPLETION_NOTICE,
    sanitizedCloseoutSummaryRef: "operator-readable-closeout-summary:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    auditHandoffAcknowledgementRef: "audit-handoff:active-tab-info:ack:001",
  })
}

describe("task291 active tab info operator-readable closeout summary misuse guard", () => {
  it("rejects approval evidence that tries to carry operator-readable closeout summary state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T02:25:00.000Z"),
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
      yeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummary:
        operatorReadableCloseoutSummary(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept operator-readable closeout summary as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummary:
          operatorReadableCloseoutSummary(),
      } as unknown as typeof redacted.observation,
      evidenceRef,
      verificationStatus: "verified",
    })).toEqual({
      ok: false,
      reasonCode: "final_result_redaction_required",
    })

    expect(buildYeonjangBrowserActiveTabInfoProductLogProjection({
      evidenceRef,
      fields: ["evidenceRef", "yeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummary"],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
