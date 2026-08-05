import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalTransferCloseoutLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-transfer-closeout-ledger.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalTransferAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-transfer-acknowledgement-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_FINAL_TRANSFER_CLOSEOUT_LEDGER: YeonjangBrowserActiveTabInfoFinalTransferCloseoutLedger = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-transfer-closeout-ledger.v1",
  method: "browser.active_tab_info",
  status: "final_transfer_closeout_ledger_ready",
  reasonCode:
    "active_tab_info_final_transfer_closeout_ledger_ready",
  ledger: {
    finalTransferCloseoutLedgerId:
      "final-transfer-closeout-ledger:browser.active_tab_info:b00",
    operatorFinalHandoffReceiptId:
      "operator-final-handoff-receipt:browser.active_tab_info:a14",
    sanitizedFinalTransferCloseoutLedgerRef:
      "final-transfer-closeout-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalTransferCloseoutAcknowledgementRef:
      "final-transfer-closeout:active-tab-info:ack:001",
    ledgerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function operatorFinalTransferAcknowledgementReceipt() {
  return buildYeonjangBrowserActiveTabInfoOperatorFinalTransferAcknowledgementReceipt({
    finalTransferCloseoutLedger:
      READY_FINAL_TRANSFER_CLOSEOUT_LEDGER,
    sanitizedOperatorFinalTransferAcknowledgementReceiptRef:
      "operator-final-transfer-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalTransferAcknowledgementRef:
      "operator-final-transfer:active-tab-info:ack:001",
  })
}

describe("task349 active tab info operator final transfer acknowledgement receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry operator final transfer acknowledgement receipt state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T03:35:00.000Z"),
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
      yeonjangBrowserActiveTabInfoOperatorFinalTransferAcknowledgementReceipt:
        operatorFinalTransferAcknowledgementReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept operator final transfer acknowledgement receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoOperatorFinalTransferAcknowledgementReceipt:
          operatorFinalTransferAcknowledgementReceipt(),
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
        "yeonjangBrowserActiveTabInfoOperatorFinalTransferAcknowledgementReceipt",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
