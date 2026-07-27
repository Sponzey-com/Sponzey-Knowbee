import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoTerminalDeliveryReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-terminal-delivery-receipt.ts"
import type {
  YeonjangBrowserActiveTabInfoTerminalReportProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-terminal-report-projection.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_TERMINAL_REPORT_PROJECTION: YeonjangBrowserActiveTabInfoTerminalReportProjection = {
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
}

function terminalDeliveryReceipt() {
  return buildYeonjangBrowserActiveTabInfoTerminalDeliveryReceipt({
    terminalReportProjection: READY_TERMINAL_REPORT_PROJECTION,
    terminalOutputChannelAcknowledgementRef: "terminal-output-channel:active-tab-info:ack:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    sanitizedTerminalDeliveryEventRef: "terminal-delivery-event:active-tab-info:sanitized:001",
  })
}

describe("task281 active tab info terminal delivery receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry terminal delivery receipt state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T02:10:00.000Z"),
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
      yeonjangBrowserActiveTabInfoTerminalDeliveryReceipt: terminalDeliveryReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept terminal delivery receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoTerminalDeliveryReceipt: terminalDeliveryReceipt(),
      } as unknown as typeof redacted.observation,
      evidenceRef,
      verificationStatus: "verified",
    })).toEqual({
      ok: false,
      reasonCode: "final_result_redaction_required",
    })

    expect(buildYeonjangBrowserActiveTabInfoProductLogProjection({
      evidenceRef,
      fields: ["evidenceRef", "yeonjangBrowserActiveTabInfoTerminalDeliveryReceipt"],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
