import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-closeout-receipt.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-ledger.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_LEDGER: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionLedger = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-ledger.v1",
  method: "browser.active_tab_info",
  status: "final_retained_acknowledgement_completion_ledger_ready",
  reasonCode:
    "active_tab_info_final_retained_acknowledgement_completion_ledger_ready",
  ledger: {
    finalRetainedAcknowledgementCompletionLedgerId:
      "final-retained-acknowledgement-completion-ledger:browser.active_tab_info:799",
    operatorFinalRetainedAcknowledgementCompletionReceiptId:
      "operator-final-retained-acknowledgement-completion-receipt:browser.active_tab_info:d21",
    sanitizedFinalRetainedAcknowledgementCompletionLedgerRef:
      "final-retained-acknowledgement-completion-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetainedAcknowledgementCompletionRef:
      "final-retained-acknowledgement-completion:active-tab-info:ack:001",
    ledgerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function operatorFinalRetainedAcknowledgementCompletionCloseoutReceipt() {
  return buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceipt({
    finalRetainedAcknowledgementCompletionLedger:
      READY_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_LEDGER,
    sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptRef:
      "operator-final-retained-acknowledgement-completion-closeout-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalRetainedAcknowledgementCompletionCloseoutRef:
      "operator-final-retained-acknowledgement-completion-closeout:active-tab-info:ack:001",
  })
}

describe("task425 active tab info operator final retained acknowledgement completion closeout receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry operator final retained acknowledgement completion closeout receipt state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T11:20:00.000Z"),
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
      yeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceipt:
        operatorFinalRetainedAcknowledgementCompletionCloseoutReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept operator final retained acknowledgement completion closeout receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceipt:
          operatorFinalRetainedAcknowledgementCompletionCloseoutReceipt(),
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
        "yeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceipt",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
