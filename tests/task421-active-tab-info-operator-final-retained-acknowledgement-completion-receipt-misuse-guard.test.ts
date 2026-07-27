import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalAcknowledgementLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-acknowledgement-ledger.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-receipt.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorFinalAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-acknowledgement-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_OPERATOR_FINAL_ACKNOWLEDGEMENT_RECEIPT: YeonjangBrowserActiveTabInfoOperatorFinalAcknowledgementReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-final-acknowledgement-receipt.v1",
  method: "browser.active_tab_info",
  status: "operator_final_acknowledgement_receipt_ready",
  reasonCode: "active_tab_info_operator_final_acknowledgement_receipt_ready",
  receipt: {
    operatorFinalAcknowledgementReceiptId:
      "operator-final-acknowledgement-receipt:browser.active_tab_info:fb2",
    finalCompletionLedgerId: "final-completion-ledger:browser.active_tab_info:158",
    sanitizedOperatorFinalAcknowledgementReceiptRef:
      "operator-final-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalAcknowledgementRef:
      "operator-final-acknowledgement:active-tab-info:ack:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function operatorFinalRetainedAcknowledgementCompletionReceipt() {
  const finalAcknowledgementLedger =
    buildYeonjangBrowserActiveTabInfoFinalAcknowledgementLedger({
      operatorFinalAcknowledgementReceipt:
        READY_OPERATOR_FINAL_ACKNOWLEDGEMENT_RECEIPT,
      sanitizedFinalAcknowledgementLedgerRef:
        "final-acknowledgement-ledger:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      finalAcknowledgementRef:
        "final-acknowledgement:active-tab-info:ack:001",
    })

  return buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionReceipt({
    finalAcknowledgementLedger,
    sanitizedOperatorFinalRetainedAcknowledgementCompletionReceiptRef:
      "operator-final-retained-acknowledgement-completion-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalRetainedAcknowledgementCompletionRef:
      "operator-final-retained-acknowledgement-completion:active-tab-info:ack:001",
  })
}

describe("task421 active tab info operator final retained acknowledgement completion receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry operator final retained acknowledgement completion receipt state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T10:10:00.000Z"),
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
      yeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionReceipt:
        operatorFinalRetainedAcknowledgementCompletionReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept operator final retained acknowledgement completion receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionReceipt:
          operatorFinalRetainedAcknowledgementCompletionReceipt(),
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
        "yeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionReceipt",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
