import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-closeout-completion-ledger.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutCompletionAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-closeout-completion-acknowledgement-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_FINAL_RETAINED_CLOSEOUT_COMPLETION_LEDGER: YeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedger = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-retained-closeout-completion-ledger.v1",
  method: "browser.active_tab_info",
  status: "final_retained_closeout_completion_ledger_ready",
  reasonCode:
    "active_tab_info_final_retained_closeout_completion_ledger_ready",
  ledger: {
    finalRetainedCloseoutCompletionLedgerId:
      "final-retained-closeout-completion-ledger:browser.active_tab_info:bc1",
    operatorFinalRetainedCloseoutAcknowledgementReceiptId:
      "operator-final-retained-closeout-acknowledgement-receipt:browser.active_tab_info:31f",
    sanitizedFinalRetainedCloseoutCompletionLedgerRef:
      "final-retained-closeout-completion-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetainedCloseoutCompletionRef:
      "final-retained-closeout-completion:active-tab-info:ack:001",
    ledgerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function operatorFinalRetainedCloseoutCompletionAcknowledgementReceipt() {
  return buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutCompletionAcknowledgementReceipt({
    finalRetainedCloseoutCompletionLedger:
      READY_FINAL_RETAINED_CLOSEOUT_COMPLETION_LEDGER,
    sanitizedOperatorFinalRetainedCloseoutCompletionAcknowledgementReceiptRef:
      "operator-final-retained-closeout-completion-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalRetainedCloseoutCompletionAcknowledgementRef:
      "operator-final-retained-closeout-completion:active-tab-info:ack:001",
  })
}

describe("task385 active tab info operator final retained closeout completion acknowledgement receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry operator final retained closeout completion acknowledgement receipt state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T06:40:00.000Z"),
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
      yeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutCompletionAcknowledgementReceipt:
        operatorFinalRetainedCloseoutCompletionAcknowledgementReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept operator final retained closeout completion acknowledgement receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutCompletionAcknowledgementReceipt:
          operatorFinalRetainedCloseoutCompletionAcknowledgementReceipt(),
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
        "yeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutCompletionAcknowledgementReceipt",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
