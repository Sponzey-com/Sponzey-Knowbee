import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalRetainedLedgerAcknowledgementSeal,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-ledger-acknowledgement-seal.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorRetainedLedgerAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-retained-ledger-acknowledgement-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_OPERATOR_RETAINED_LEDGER_ACKNOWLEDGEMENT_RECEIPT: YeonjangBrowserActiveTabInfoOperatorRetainedLedgerAcknowledgementReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-retained-ledger-acknowledgement-receipt.v1",
  method: "browser.active_tab_info",
  status: "operator_retained_ledger_acknowledgement_receipt_ready",
  reasonCode:
    "active_tab_info_operator_retained_ledger_acknowledgement_receipt_ready",
  receipt: {
    operatorRetainedLedgerAcknowledgementReceiptId:
      "operator-retained-ledger-acknowledgement-receipt:browser.active_tab_info:d20",
    finalRetainedCompletionAcknowledgementLedgerId:
      "final-retained-completion-acknowledgement-ledger:browser.active_tab_info:6e8",
    sanitizedOperatorRetainedLedgerAcknowledgementReceiptRef:
      "operator-retained-ledger-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorRetainedLedgerAcknowledgementRef:
      "operator-retained-ledger:active-tab-info:ack:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function finalRetainedLedgerAcknowledgementSeal() {
  return buildYeonjangBrowserActiveTabInfoFinalRetainedLedgerAcknowledgementSeal({
    operatorRetainedLedgerAcknowledgementReceipt:
      READY_OPERATOR_RETAINED_LEDGER_ACKNOWLEDGEMENT_RECEIPT,
    sanitizedFinalRetainedLedgerAcknowledgementSealRef:
      "final-retained-ledger-acknowledgement-seal:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetainedLedgerAcknowledgementRef:
      "final-retained-ledger:active-tab-info:ack:001",
  })
}

describe("task371 active tab info final retained ledger acknowledgement seal misuse guard", () => {
  it("rejects approval evidence that tries to carry final retained ledger acknowledgement seal state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T05:26:00.000Z"),
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
      yeonjangBrowserActiveTabInfoFinalRetainedLedgerAcknowledgementSeal:
        finalRetainedLedgerAcknowledgementSeal(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept final retained ledger acknowledgement seal as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoFinalRetainedLedgerAcknowledgementSeal:
          finalRetainedLedgerAcknowledgementSeal(),
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
        "yeonjangBrowserActiveTabInfoFinalRetainedLedgerAcknowledgementSeal",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
