import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndex,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-operator-closeout-index.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-closeout-acknowledgement-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_OPERATOR_FINAL_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT: YeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-final-closeout-acknowledgement-receipt.v1",
  method: "browser.active_tab_info",
  status: "operator_final_closeout_acknowledgement_receipt_ready",
  reasonCode:
    "active_tab_info_operator_final_closeout_acknowledgement_receipt_ready",
  receipt: {
    operatorFinalCloseoutAcknowledgementReceiptId:
      "operator-final-closeout-acknowledgement-receipt:browser.active_tab_info:21b",
    finalSealedArchiveCloseoutLedgerId:
      "final-sealed-archive-closeout-ledger:browser.active_tab_info:320",
    sanitizedOperatorFinalCloseoutAcknowledgementReceiptRef:
      "operator-final-closeout-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalCloseoutAcknowledgementReceiptRef:
      "operator-final-closeout:active-tab-info:receipt:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function finalOperatorCloseoutIndex() {
  return buildYeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndex({
    operatorFinalCloseoutAcknowledgementReceipt:
      READY_OPERATOR_FINAL_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT,
    sanitizedFinalOperatorCloseoutIndexRef:
      "final-operator-closeout-index:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalOperatorCloseoutAcknowledgementRef:
      "final-operator-closeout:active-tab-info:ack:001",
  })
}

describe("task335 active tab info final operator closeout index misuse guard", () => {
  it("rejects approval evidence that tries to carry final operator closeout index state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T02:25:00.000Z"),
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
      yeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndex:
        finalOperatorCloseoutIndex(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept final operator closeout index as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndex:
          finalOperatorCloseoutIndex(),
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
        "yeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndex",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
