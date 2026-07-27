import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalCompletionLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-completion-ledger.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorFinalCompletionReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-completion-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_OPERATOR_FINAL_COMPLETION_RECEIPT: YeonjangBrowserActiveTabInfoOperatorFinalCompletionReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-final-completion-receipt.v1",
  method: "browser.active_tab_info",
  status: "operator_final_completion_receipt_ready",
  reasonCode: "active_tab_info_operator_final_completion_receipt_ready",
  receipt: {
    operatorFinalCompletionReceiptId:
      "operator-final-completion-receipt:browser.active_tab_info:5d7",
    finalRetainedCompletionLedgerId:
      "final-retained-completion-ledger:browser.active_tab_info:0d3",
    sanitizedOperatorFinalCompletionReceiptRef:
      "operator-final-completion-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalCompletionRef:
      "operator-final-completion:active-tab-info:ack:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function finalCompletionLedger() {
  return buildYeonjangBrowserActiveTabInfoFinalCompletionLedger({
    operatorFinalCompletionReceipt: READY_OPERATOR_FINAL_COMPLETION_RECEIPT,
    sanitizedFinalCompletionLedgerRef:
      "final-completion-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalCompletionRef: "final-completion:active-tab-info:ack:001",
  })
}

describe("task415 active tab info final completion ledger misuse guard", () => {
  it("rejects approval evidence that tries to carry final completion ledger state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T09:20:00.000Z"),
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
      yeonjangBrowserActiveTabInfoFinalCompletionLedger:
        finalCompletionLedger(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept final completion ledger as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoFinalCompletionLedger:
          finalCompletionLedger(),
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
        "yeonjangBrowserActiveTabInfoFinalCompletionLedger",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
