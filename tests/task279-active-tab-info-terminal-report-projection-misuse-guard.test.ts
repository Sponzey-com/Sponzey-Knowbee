import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import type {
  YeonjangBrowserActiveTabInfoCompletionAuditSummary,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-completion-audit-summary.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoTerminalReportProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-terminal-report-projection.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_COMPLETION_AUDIT_SUMMARY: YeonjangBrowserActiveTabInfoCompletionAuditSummary = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-completion-audit-summary.v1",
  method: "browser.active_tab_info",
  status: "completion_audit_summary_ready",
  reasonCode: "active_tab_info_completion_audit_summary_ready",
  summary: {
    completionAuditSummaryId: "completion-audit-summary:browser.active_tab_info:19b",
    userGoalCloseoutReceiptId: "user-goal-closeout-receipt:browser.active_tab_info:7a7",
    finalResultProjectionRef: "final-result-projection:active-tab-info:redacted:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    sanitizedOperatorCompletionNoteRef: "operator-completion-note:active-tab-info:sanitized:001",
    completionStatus: "closed",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function terminalReportProjection() {
  return buildYeonjangBrowserActiveTabInfoTerminalReportProjection({
    completionAuditSummary: READY_COMPLETION_AUDIT_SUMMARY,
    userFacingResponseAcknowledgementRef: "user-facing-response:active-tab-info:ack:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    sanitizedTerminalReportRef: "terminal-report:active-tab-info:sanitized:001",
  })
}

describe("task279 active tab info terminal report projection misuse guard", () => {
  it("rejects approval evidence that tries to carry terminal report projection state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T02:09:00.000Z"),
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
      yeonjangBrowserActiveTabInfoTerminalReportProjection: terminalReportProjection(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept terminal report projection as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoTerminalReportProjection: terminalReportProjection(),
      } as unknown as typeof redacted.observation,
      evidenceRef,
      verificationStatus: "verified",
    })).toEqual({
      ok: false,
      reasonCode: "final_result_redaction_required",
    })

    expect(buildYeonjangBrowserActiveTabInfoProductLogProjection({
      evidenceRef,
      fields: ["evidenceRef", "yeonjangBrowserActiveTabInfoTerminalReportProjection"],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
