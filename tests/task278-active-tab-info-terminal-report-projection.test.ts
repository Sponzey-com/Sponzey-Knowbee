import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoCompletionAuditSummary,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-completion-audit-summary.ts"
import {
  buildYeonjangBrowserActiveTabInfoTerminalReportProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-terminal-report-projection.ts"

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

describe("task278 active tab info terminal report projection", () => {
  it("builds a minimal redacted terminal report projection without release or activation readiness", () => {
    const projection = buildYeonjangBrowserActiveTabInfoTerminalReportProjection({
      completionAuditSummary: READY_COMPLETION_AUDIT_SUMMARY,
      userFacingResponseAcknowledgementRef: "user-facing-response:active-tab-info:ack:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      sanitizedTerminalReportRef: "terminal-report:active-tab-info:sanitized:001",
    })

    expect(projection).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-terminal-report-projection.v1",
      method: "browser.active_tab_info",
      status: "terminal_report_projection_ready",
      reasonCode: "active_tab_info_terminal_report_projection_ready",
      projection: {
        terminalReportProjectionId: "terminal-report-projection:browser.active_tab_info:ab0",
        completionAuditSummaryId: "completion-audit-summary:browser.active_tab_info:19b",
        userFacingResponseAcknowledgementRef: "user-facing-response:active-tab-info:ack:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        sanitizedTerminalReportRef: "terminal-report:active-tab-info:sanitized:001",
        terminalReportStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready completion summaries and unsafe refs", () => {
    const projection = buildYeonjangBrowserActiveTabInfoTerminalReportProjection({
      completionAuditSummary: {
        ...READY_COMPLETION_AUDIT_SUMMARY,
        status: "blocked",
        summary: undefined,
      },
      userFacingResponseAcknowledgementRef: "https://example.test/ack?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      sanitizedTerminalReportRef: "",
    })

    expect(projection.status).toBe("blocked")
    expect(projection.reasonCode).toBe("active_tab_info_terminal_report_projection_blocked")
    expect(projection.blockingReasonCodes).toEqual([
      "terminal_report_completion_audit_summary_not_ready",
      "terminal_report_user_facing_ack_ref_invalid",
      "terminal_report_product_log_evidence_ref_invalid",
      "terminal_report_sanitized_report_ref_invalid",
    ])
    expect(projection.projection).toBeUndefined()
  })

  it("does not expose raw response body, raw browser data, or downstream activation ids", () => {
    const projection = buildYeonjangBrowserActiveTabInfoTerminalReportProjection({
      completionAuditSummary: READY_COMPLETION_AUDIT_SUMMARY,
      userFacingResponseAcknowledgementRef: "user-facing-response:active-tab-info:ack:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      sanitizedTerminalReportRef: "terminal-report:active-tab-info:sanitized:001",
    })

    expect(JSON.stringify(projection)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
