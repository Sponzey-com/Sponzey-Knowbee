import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorReleaseArchiveCompletionNotice,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-release-archive-completion-notice.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-audit-release-closure-ledger.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_FINAL_AUDIT_RELEASE_CLOSURE_LEDGER: YeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedger = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-audit-release-closure-ledger.v1",
  method: "browser.active_tab_info",
  status: "final_audit_release_closure_ledger_ready",
  reasonCode: "active_tab_info_final_audit_release_closure_ledger_ready",
  ledger: {
    finalAuditReleaseClosureLedgerId:
      "final-audit-release-closure-ledger:browser.active_tab_info:1c9",
    finalAuditReleaseHandoffReceiptId:
      "final-audit-release-handoff-receipt:browser.active_tab_info:3f8",
    sanitizedReleaseClosureLedgerRef:
      "release-closure-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    auditArchiveClosureAcknowledgementRef: "audit-archive-closure:active-tab-info:ack:001",
    ledgerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function operatorReleaseArchiveCompletionNotice() {
  return buildYeonjangBrowserActiveTabInfoOperatorReleaseArchiveCompletionNotice({
    finalAuditReleaseClosureLedger: READY_FINAL_AUDIT_RELEASE_CLOSURE_LEDGER,
    sanitizedArchiveCompletionNoticeRef:
      "archive-completion-notice:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorArchiveAcknowledgementRef: "operator-archive:active-tab-info:ack:001",
  })
}

describe("task301 active tab info operator release archive completion notice misuse guard", () => {
  it("rejects approval evidence that tries to carry operator release archive completion notice state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T03:07:00.000Z"),
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
      yeonjangBrowserActiveTabInfoOperatorReleaseArchiveCompletionNotice:
        operatorReleaseArchiveCompletionNotice(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept operator release archive completion notice as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoOperatorReleaseArchiveCompletionNotice:
          operatorReleaseArchiveCompletionNotice(),
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
        "yeonjangBrowserActiveTabInfoOperatorReleaseArchiveCompletionNotice",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
