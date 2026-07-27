import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalRetainedCompletionCloseoutLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-completion-closeout-ledger.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-completion-closeout-acknowledgement-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_FINAL_RETAINED_COMPLETION_CLOSEOUT_LEDGER: YeonjangBrowserActiveTabInfoFinalRetainedCompletionCloseoutLedger = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-retained-completion-closeout-ledger.v1",
  method: "browser.active_tab_info",
  status: "final_retained_completion_closeout_ledger_ready",
  reasonCode:
    "active_tab_info_final_retained_completion_closeout_ledger_ready",
  ledger: {
    finalRetainedCompletionCloseoutLedgerId:
      "final-retained-completion-closeout-ledger:browser.active_tab_info:7b7",
    operatorFinalRetainedCloseoutCompletionAcknowledgementReceiptId:
      "operator-final-retained-closeout-completion-acknowledgement-receipt:browser.active_tab_info:8ae",
    sanitizedFinalRetainedCompletionCloseoutLedgerRef:
      "final-retained-completion-closeout-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetainedCompletionCloseoutRef:
      "final-retained-completion-closeout:active-tab-info:ack:001",
    ledgerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function operatorFinalRetainedCompletionCloseoutAcknowledgementReceipt() {
  return buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceipt({
    finalRetainedCompletionCloseoutLedger:
      READY_FINAL_RETAINED_COMPLETION_CLOSEOUT_LEDGER,
    sanitizedOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptRef:
      "operator-final-retained-completion-closeout-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalRetainedCompletionCloseoutAcknowledgementRef:
      "operator-final-retained-completion-closeout:active-tab-info:ack:001",
  })
}

describe("task389 active tab info operator final retained completion closeout acknowledgement receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry operator final retained completion closeout acknowledgement receipt state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T07:00:00.000Z"),
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
      yeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceipt:
        operatorFinalRetainedCompletionCloseoutAcknowledgementReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept operator final retained completion closeout acknowledgement receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceipt:
          operatorFinalRetainedCompletionCloseoutAcknowledgementReceipt(),
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
        "yeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceipt",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
