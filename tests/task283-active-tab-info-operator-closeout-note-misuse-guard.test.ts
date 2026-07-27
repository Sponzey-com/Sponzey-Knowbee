import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorCloseoutNote,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-closeout-note.ts"
import type {
  YeonjangBrowserActiveTabInfoTerminalDeliveryReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-terminal-delivery-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_TERMINAL_DELIVERY_RECEIPT: YeonjangBrowserActiveTabInfoTerminalDeliveryReceipt = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-terminal-delivery-receipt.v1",
  method: "browser.active_tab_info",
  status: "terminal_delivery_receipt_ready",
  reasonCode: "active_tab_info_terminal_delivery_receipt_ready",
  receipt: {
    terminalDeliveryReceiptId: "terminal-delivery-receipt:browser.active_tab_info:59c",
    terminalReportProjectionId: "terminal-report-projection:browser.active_tab_info:ab0",
    terminalOutputChannelAcknowledgementRef: "terminal-output-channel:active-tab-info:ack:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    sanitizedTerminalDeliveryEventRef: "terminal-delivery-event:active-tab-info:sanitized:001",
    deliveryStatus: "delivered",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function operatorCloseoutNote() {
  return buildYeonjangBrowserActiveTabInfoOperatorCloseoutNote({
    terminalDeliveryReceipt: READY_TERMINAL_DELIVERY_RECEIPT,
    sanitizedUserAcknowledgementRef: "user-ack:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    sanitizedOperatorCloseoutNoteRef: "operator-closeout-note:active-tab-info:sanitized:001",
  })
}

describe("task283 active tab info operator closeout note misuse guard", () => {
  it("rejects approval evidence that tries to carry operator closeout note state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T02:11:00.000Z"),
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
      yeonjangBrowserActiveTabInfoOperatorCloseoutNote: operatorCloseoutNote(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept operator closeout note as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoOperatorCloseoutNote: operatorCloseoutNote(),
      } as unknown as typeof redacted.observation,
      evidenceRef,
      verificationStatus: "verified",
    })).toEqual({
      ok: false,
      reasonCode: "final_result_redaction_required",
    })

    expect(buildYeonjangBrowserActiveTabInfoProductLogProjection({
      evidenceRef,
      fields: ["evidenceRef", "yeonjangBrowserActiveTabInfoOperatorCloseoutNote"],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
