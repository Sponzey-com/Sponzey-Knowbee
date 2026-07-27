import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutCompletionLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-sealed-closeout-completion-ledger.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCompletionReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-sealed-completion-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_FINAL_RETAINED_SEALED_CLOSEOUT_COMPLETION_LEDGER: YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutCompletionLedger = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-retained-sealed-closeout-completion-ledger.v1",
  method: "browser.active_tab_info",
  status: "final_retained_sealed_closeout_completion_ledger_ready",
  reasonCode:
    "active_tab_info_final_retained_sealed_closeout_completion_ledger_ready",
  ledger: {
    finalRetainedSealedCloseoutCompletionLedgerId:
      "final-retained-sealed-closeout-completion-ledger:browser.active_tab_info:35d",
    operatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptId:
      "operator-final-retained-sealed-closeout-completion-acknowledgement-receipt:browser.active_tab_info:162",
    sanitizedFinalRetainedSealedCloseoutCompletionLedgerRef:
      "final-retained-sealed-closeout-completion-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetainedSealedCloseoutCompletionRef:
      "final-retained-sealed-closeout-completion:active-tab-info:ack:001",
    ledgerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function operatorFinalRetainedSealedCompletionReceipt() {
  return buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCompletionReceipt({
    finalRetainedSealedCloseoutCompletionLedger:
      READY_FINAL_RETAINED_SEALED_CLOSEOUT_COMPLETION_LEDGER,
    sanitizedOperatorFinalRetainedSealedCompletionReceiptRef:
      "operator-final-retained-sealed-completion-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalRetainedSealedCompletionRef:
      "operator-final-retained-sealed-completion:active-tab-info:ack:001",
  })
}

describe("task405 active tab info operator final retained sealed completion receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry operator final retained sealed completion receipt state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T08:25:00.000Z"),
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
      yeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCompletionReceipt:
        operatorFinalRetainedSealedCompletionReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept operator final retained sealed completion receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCompletionReceipt:
          operatorFinalRetainedSealedCompletionReceipt(),
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
        "yeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCompletionReceipt",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
