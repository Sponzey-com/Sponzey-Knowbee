import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-completion-acknowledgement-ledger.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorRetainedLedgerAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-retained-ledger-acknowledgement-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_FINAL_RETAINED_COMPLETION_ACKNOWLEDGEMENT_LEDGER: YeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedger = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-retained-completion-acknowledgement-ledger.v1",
  method: "browser.active_tab_info",
  status: "final_retained_completion_acknowledgement_ledger_ready",
  reasonCode:
    "active_tab_info_final_retained_completion_acknowledgement_ledger_ready",
  ledger: {
    finalRetainedCompletionAcknowledgementLedgerId:
      "final-retained-completion-acknowledgement-ledger:browser.active_tab_info:6e8",
    operatorRetainedCompletionAcknowledgementReceiptId:
      "operator-retained-completion-acknowledgement-receipt:browser.active_tab_info:fd3",
    sanitizedFinalRetainedCompletionAcknowledgementLedgerRef:
      "final-retained-completion-acknowledgement-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetainedCompletionAcknowledgementRef:
      "final-retained-completion:active-tab-info:ack:001",
    ledgerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function operatorRetainedLedgerAcknowledgementReceipt() {
  return buildYeonjangBrowserActiveTabInfoOperatorRetainedLedgerAcknowledgementReceipt({
    finalRetainedCompletionAcknowledgementLedger:
      READY_FINAL_RETAINED_COMPLETION_ACKNOWLEDGEMENT_LEDGER,
    sanitizedOperatorRetainedLedgerAcknowledgementReceiptRef:
      "operator-retained-ledger-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorRetainedLedgerAcknowledgementRef:
      "operator-retained-ledger:active-tab-info:ack:001",
  })
}

describe("task369 active tab info operator retained ledger acknowledgement receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry operator retained ledger acknowledgement receipt state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T05:16:00.000Z"),
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
      yeonjangBrowserActiveTabInfoOperatorRetainedLedgerAcknowledgementReceipt:
        operatorRetainedLedgerAcknowledgementReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept operator retained ledger acknowledgement receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoOperatorRetainedLedgerAcknowledgementReceipt:
          operatorRetainedLedgerAcknowledgementReceipt(),
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
        "yeonjangBrowserActiveTabInfoOperatorRetainedLedgerAcknowledgementReceipt",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
