import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_CLOSURE_LEDGER: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedger = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger.v1",
  method: "browser.active_tab_info",
  status:
    "final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_ready",
  reasonCode:
    "active_tab_info_final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_ready",
  ledger: {
    finalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerId:
      "final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger:browser.active_tab_info:b33",
    operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptId:
      "operator-final-retained-acknowledgement-completion-closeout-acknowledgement-ledger-receipt:browser.active_tab_info:e0f",
    sanitizedFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerRef:
      "final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureRef:
      "final-retained-acknowledgement-completion-closeout-acknowledgement-closure:active-tab-info:ack:001",
    ledgerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceipt() {
  return buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceipt({
    finalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedger:
      READY_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_CLOSURE_LEDGER,
    sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceiptRef:
      "operator-final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerRef:
      "operator-final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger:active-tab-info:ack:001",
  })
}

describe("task437 active tab info operator final retained acknowledgement completion closeout acknowledgement closure ledger receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry operator final retained acknowledgement completion closeout acknowledgement closure ledger receipt state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T13:20:00.000Z"),
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
      yeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceipt:
        operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept operator final retained acknowledgement completion closeout acknowledgement closure ledger receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceipt:
          operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceipt(),
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
        "yeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceipt",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
