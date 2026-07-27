import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalAuditHandoffBundle,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-audit-handoff-bundle.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalCloseoutLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-closeout-ledger.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_FINAL_CLOSEOUT_LEDGER: YeonjangBrowserActiveTabInfoFinalCloseoutLedger = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-closeout-ledger.v1",
  method: "browser.active_tab_info",
  status: "final_closeout_ledger_ready",
  reasonCode: "active_tab_info_final_closeout_ledger_ready",
  ledger: {
    finalCloseoutLedgerId: "final-closeout-ledger:browser.active_tab_info:0b3",
    operatorCloseoutNoteId: "operator-closeout-note:browser.active_tab_info:54c",
    completionAuditSummaryRef: "completion-audit-summary:active-tab-info:ref:001",
    terminalDeliveryReceiptRef: "terminal-delivery-receipt:active-tab-info:ref:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    ledgerStatus: "closed",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function finalAuditHandoffBundle() {
  return buildYeonjangBrowserActiveTabInfoFinalAuditHandoffBundle({
    finalCloseoutLedger: READY_FINAL_CLOSEOUT_LEDGER,
    sanitizedAuditArtifactDescriptorRef: "audit-artifact-descriptor:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    releaseSurfaceMatrixAcknowledgementRef: "release-surface-matrix:active-tab-info:ack:001",
  })
}

describe("task287 active tab info final audit handoff bundle misuse guard", () => {
  it("rejects approval evidence that tries to carry final audit handoff bundle state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T02:13:00.000Z"),
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
      yeonjangBrowserActiveTabInfoFinalAuditHandoffBundle: finalAuditHandoffBundle(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept final audit handoff bundle as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoFinalAuditHandoffBundle: finalAuditHandoffBundle(),
      } as unknown as typeof redacted.observation,
      evidenceRef,
      verificationStatus: "verified",
    })).toEqual({
      ok: false,
      reasonCode: "final_result_redaction_required",
    })

    expect(buildYeonjangBrowserActiveTabInfoProductLogProjection({
      evidenceRef,
      fields: ["evidenceRef", "yeonjangBrowserActiveTabInfoFinalAuditHandoffBundle"],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
