import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-sealed-closeout-acknowledgement-ledger.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-sealed-closeout-completion-acknowledgement-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_FINAL_RETAINED_SEALED_CLOSEOUT_ACKNOWLEDGEMENT_LEDGER: YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedger = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-retained-sealed-closeout-acknowledgement-ledger.v1",
  method: "browser.active_tab_info",
  status:
    "final_retained_sealed_closeout_acknowledgement_ledger_ready",
  reasonCode:
    "active_tab_info_final_retained_sealed_closeout_acknowledgement_ledger_ready",
  ledger: {
    finalRetainedSealedCloseoutAcknowledgementLedgerId:
      "final-retained-sealed-closeout-acknowledgement-ledger:browser.active_tab_info:c1f",
    operatorFinalRetainedSealedCloseoutAcknowledgementReceiptId:
      "operator-final-retained-sealed-closeout-acknowledgement-receipt:browser.active_tab_info:76c",
    sanitizedFinalRetainedSealedCloseoutAcknowledgementLedgerRef:
      "final-retained-sealed-closeout-acknowledgement-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetainedSealedCloseoutAcknowledgementRef:
      "final-retained-sealed-closeout-acknowledgement:active-tab-info:ack:001",
    ledgerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function operatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceipt() {
  return buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceipt({
    finalRetainedSealedCloseoutAcknowledgementLedger:
      READY_FINAL_RETAINED_SEALED_CLOSEOUT_ACKNOWLEDGEMENT_LEDGER,
    sanitizedOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptRef:
      "operator-final-retained-sealed-closeout-completion-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalRetainedSealedCloseoutCompletionAcknowledgementRef:
      "operator-final-retained-sealed-closeout-completion:active-tab-info:ack:001",
  })
}

describe("task401 active tab info operator final retained sealed closeout completion acknowledgement receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry operator final retained sealed closeout completion acknowledgement receipt state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T08:00:00.000Z"),
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
      yeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceipt:
        operatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept operator final retained sealed closeout completion acknowledgement receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceipt:
          operatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceipt(),
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
        "yeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceipt",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
