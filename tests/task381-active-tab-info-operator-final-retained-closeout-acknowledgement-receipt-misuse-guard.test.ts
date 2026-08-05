import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalRetainedCloseoutAcknowledgementLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-closeout-acknowledgement-ledger.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-closeout-acknowledgement-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_FINAL_RETAINED_CLOSEOUT_ACKNOWLEDGEMENT_LEDGER: YeonjangBrowserActiveTabInfoFinalRetainedCloseoutAcknowledgementLedger = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-retained-closeout-acknowledgement-ledger.v1",
  method: "browser.active_tab_info",
  status: "final_retained_closeout_acknowledgement_ledger_ready",
  reasonCode:
    "active_tab_info_final_retained_closeout_acknowledgement_ledger_ready",
  ledger: {
    finalRetainedCloseoutAcknowledgementLedgerId:
      "final-retained-closeout-acknowledgement-ledger:browser.active_tab_info:b87",
    operatorRetainedCloseoutAcknowledgementReceiptId:
      "operator-retained-closeout-acknowledgement-receipt:browser.active_tab_info:d34",
    sanitizedFinalRetainedCloseoutAcknowledgementLedgerRef:
      "final-retained-closeout-acknowledgement-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetainedCloseoutAcknowledgementRef:
      "final-retained-closeout:active-tab-info:ack:001",
    ledgerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function operatorFinalRetainedCloseoutAcknowledgementReceipt() {
  return buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceipt({
    finalRetainedCloseoutAcknowledgementLedger:
      READY_FINAL_RETAINED_CLOSEOUT_ACKNOWLEDGEMENT_LEDGER,
    sanitizedOperatorFinalRetainedCloseoutAcknowledgementReceiptRef:
      "operator-final-retained-closeout-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalRetainedCloseoutAcknowledgementRef:
      "operator-final-retained-closeout:active-tab-info:ack:001",
  })
}

describe("task381 active tab info operator final retained closeout acknowledgement receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry operator final retained closeout acknowledgement receipt state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T06:18:00.000Z"),
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
      yeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceipt:
        operatorFinalRetainedCloseoutAcknowledgementReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept operator final retained closeout acknowledgement receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceipt:
          operatorFinalRetainedCloseoutAcknowledgementReceipt(),
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
        "yeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceipt",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
