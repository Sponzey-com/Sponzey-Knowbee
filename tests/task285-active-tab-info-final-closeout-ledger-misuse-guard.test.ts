import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalCloseoutLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-closeout-ledger.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorCloseoutNote,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-closeout-note.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_OPERATOR_CLOSEOUT_NOTE: YeonjangBrowserActiveTabInfoOperatorCloseoutNote = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-closeout-note.v1",
  method: "browser.active_tab_info",
  status: "operator_closeout_note_ready",
  reasonCode: "active_tab_info_operator_closeout_note_ready",
  note: {
    operatorCloseoutNoteId: "operator-closeout-note:browser.active_tab_info:54c",
    terminalDeliveryReceiptId: "terminal-delivery-receipt:browser.active_tab_info:59c",
    sanitizedUserAcknowledgementRef: "user-ack:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    sanitizedOperatorCloseoutNoteRef: "operator-closeout-note:active-tab-info:sanitized:001",
    closeoutStatus: "closed",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function finalCloseoutLedger() {
  return buildYeonjangBrowserActiveTabInfoFinalCloseoutLedger({
    operatorCloseoutNote: READY_OPERATOR_CLOSEOUT_NOTE,
    completionAuditSummaryRef: "completion-audit-summary:active-tab-info:ref:001",
    terminalDeliveryReceiptRef: "terminal-delivery-receipt:active-tab-info:ref:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
  })
}

describe("task285 active tab info final closeout ledger misuse guard", () => {
  it("rejects approval evidence that tries to carry final closeout ledger state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T02:12:00.000Z"),
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
      yeonjangBrowserActiveTabInfoFinalCloseoutLedger: finalCloseoutLedger(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept final closeout ledger as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoFinalCloseoutLedger: finalCloseoutLedger(),
      } as unknown as typeof redacted.observation,
      evidenceRef,
      verificationStatus: "verified",
    })).toEqual({
      ok: false,
      reasonCode: "final_result_redaction_required",
    })

    expect(buildYeonjangBrowserActiveTabInfoProductLogProjection({
      evidenceRef,
      fields: ["evidenceRef", "yeonjangBrowserActiveTabInfoFinalCloseoutLedger"],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
