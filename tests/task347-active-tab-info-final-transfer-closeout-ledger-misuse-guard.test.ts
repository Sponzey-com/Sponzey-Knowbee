import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorFinalHandoffReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-handoff-receipt.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalTransferCloseoutLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-transfer-closeout-ledger.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_OPERATOR_FINAL_HANDOFF_RECEIPT: YeonjangBrowserActiveTabInfoOperatorFinalHandoffReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-final-handoff-receipt.v1",
  method: "browser.active_tab_info",
  status: "operator_final_handoff_receipt_ready",
  reasonCode:
    "active_tab_info_operator_final_handoff_receipt_ready",
  receipt: {
    operatorFinalHandoffReceiptId:
      "operator-final-handoff-receipt:browser.active_tab_info:a14",
    finalHandoffClosureMarkerId:
      "final-handoff-closure-marker:browser.active_tab_info:cbb",
    sanitizedOperatorFinalHandoffReceiptRef:
      "operator-final-handoff-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalHandoffAcknowledgementRef:
      "operator-final-handoff:active-tab-info:ack:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function finalTransferCloseoutLedger() {
  return buildYeonjangBrowserActiveTabInfoFinalTransferCloseoutLedger({
    operatorFinalHandoffReceipt:
      READY_OPERATOR_FINAL_HANDOFF_RECEIPT,
    sanitizedFinalTransferCloseoutLedgerRef:
      "final-transfer-closeout-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalTransferCloseoutAcknowledgementRef:
      "final-transfer-closeout:active-tab-info:ack:001",
  })
}

describe("task347 active tab info final transfer closeout ledger misuse guard", () => {
  it("rejects approval evidence that tries to carry final transfer closeout ledger state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T03:25:00.000Z"),
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
      yeonjangBrowserActiveTabInfoFinalTransferCloseoutLedger:
        finalTransferCloseoutLedger(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept final transfer closeout ledger as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoFinalTransferCloseoutLedger:
          finalTransferCloseoutLedger(),
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
        "yeonjangBrowserActiveTabInfoFinalTransferCloseoutLedger",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
