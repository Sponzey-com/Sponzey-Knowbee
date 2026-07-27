import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-ledger.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_RECEIPT: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-receipt.v1",
  method: "browser.active_tab_info",
  status: "operator_final_retained_acknowledgement_completion_receipt_ready",
  reasonCode:
    "active_tab_info_operator_final_retained_acknowledgement_completion_receipt_ready",
  receipt: {
    operatorFinalRetainedAcknowledgementCompletionReceiptId:
      "operator-final-retained-acknowledgement-completion-receipt:browser.active_tab_info:d21",
    finalAcknowledgementLedgerId:
      "final-acknowledgement-ledger:browser.active_tab_info:828",
    sanitizedOperatorFinalRetainedAcknowledgementCompletionReceiptRef:
      "operator-final-retained-acknowledgement-completion-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalRetainedAcknowledgementCompletionRef:
      "operator-final-retained-acknowledgement-completion:active-tab-info:ack:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function finalRetainedAcknowledgementCompletionLedger() {
  return buildYeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionLedger({
    operatorFinalRetainedAcknowledgementCompletionReceipt:
      READY_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_RECEIPT,
    sanitizedFinalRetainedAcknowledgementCompletionLedgerRef:
      "final-retained-acknowledgement-completion-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetainedAcknowledgementCompletionRef:
      "final-retained-acknowledgement-completion:active-tab-info:ack:001",
  })
}

describe("task423 active tab info final retained acknowledgement completion ledger misuse guard", () => {
  it("rejects approval evidence that tries to carry final retained acknowledgement completion ledger state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T10:40:00.000Z"),
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
      yeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionLedger:
        finalRetainedAcknowledgementCompletionLedger(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept final retained acknowledgement completion ledger as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionLedger:
          finalRetainedAcknowledgementCompletionLedger(),
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
        "yeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionLedger",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
