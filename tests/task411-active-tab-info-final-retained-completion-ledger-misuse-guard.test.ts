import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalRetainedCompletionLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-completion-ledger.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-completion-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_OPERATOR_FINAL_RETAINED_COMPLETION_RECEIPT: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-completion-receipt.v1",
  method: "browser.active_tab_info",
  status: "operator_final_retained_completion_receipt_ready",
  reasonCode: "active_tab_info_operator_final_retained_completion_receipt_ready",
  receipt: {
    operatorFinalRetainedCompletionReceiptId:
      "operator-final-retained-completion-receipt:browser.active_tab_info:b03",
    finalRetainedSealedCompletionLedgerId:
      "final-retained-sealed-completion-ledger:browser.active_tab_info:965",
    sanitizedOperatorFinalRetainedCompletionReceiptRef:
      "operator-final-retained-completion-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalRetainedCompletionRef:
      "operator-final-retained-completion:active-tab-info:ack:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function finalRetainedCompletionLedger() {
  return buildYeonjangBrowserActiveTabInfoFinalRetainedCompletionLedger({
    operatorFinalRetainedCompletionReceipt:
      READY_OPERATOR_FINAL_RETAINED_COMPLETION_RECEIPT,
    sanitizedFinalRetainedCompletionLedgerRef:
      "final-retained-completion-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetainedCompletionRef:
      "final-retained-completion:active-tab-info:ack:001",
  })
}

describe("task411 active tab info final retained completion ledger misuse guard", () => {
  it("rejects approval evidence that tries to carry final retained completion ledger state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T08:45:00.000Z"),
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
      yeonjangBrowserActiveTabInfoFinalRetainedCompletionLedger:
        finalRetainedCompletionLedger(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept final retained completion ledger as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoFinalRetainedCompletionLedger:
          finalRetainedCompletionLedger(),
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
        "yeonjangBrowserActiveTabInfoFinalRetainedCompletionLedger",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
