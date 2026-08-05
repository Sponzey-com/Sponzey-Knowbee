import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-completion-acknowledgement-ledger.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-retained-completion-acknowledgement-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_OPERATOR_RETAINED_COMPLETION_ACKNOWLEDGEMENT_RECEIPT: YeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-retained-completion-acknowledgement-receipt.v1",
  method: "browser.active_tab_info",
  status: "operator_retained_completion_acknowledgement_receipt_ready",
  reasonCode:
    "active_tab_info_operator_retained_completion_acknowledgement_receipt_ready",
  receipt: {
    operatorRetainedCompletionAcknowledgementReceiptId:
      "operator-retained-completion-acknowledgement-receipt:browser.active_tab_info:fd3",
    finalRetainedCompletionIndexId:
      "final-retained-completion-index:browser.active_tab_info:252",
    sanitizedOperatorRetainedCompletionAcknowledgementReceiptRef:
      "operator-retained-completion-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorRetainedCompletionAcknowledgementRef:
      "operator-retained-completion:active-tab-info:ack:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function finalRetainedCompletionAcknowledgementLedger() {
  return buildYeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedger({
    operatorRetainedCompletionAcknowledgementReceipt:
      READY_OPERATOR_RETAINED_COMPLETION_ACKNOWLEDGEMENT_RECEIPT,
    sanitizedFinalRetainedCompletionAcknowledgementLedgerRef:
      "final-retained-completion-acknowledgement-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetainedCompletionAcknowledgementRef:
      "final-retained-completion:active-tab-info:ack:001",
  })
}

describe("task367 active tab info final retained completion acknowledgement ledger misuse guard", () => {
  it("rejects approval evidence that tries to carry final retained completion acknowledgement ledger state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T05:04:00.000Z"),
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
      yeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedger:
        finalRetainedCompletionAcknowledgementLedger(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept final retained completion acknowledgement ledger as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedger:
          finalRetainedCompletionAcknowledgementLedger(),
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
        "yeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedger",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
