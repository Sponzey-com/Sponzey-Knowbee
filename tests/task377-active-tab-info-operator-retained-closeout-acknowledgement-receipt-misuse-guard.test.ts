import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-seal-closeout-ledger.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-retained-closeout-acknowledgement-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_FINAL_RETAINED_SEAL_CLOSEOUT_LEDGER: YeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedger = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-retained-seal-closeout-ledger.v1",
  method: "browser.active_tab_info",
  status: "final_retained_seal_closeout_ledger_ready",
  reasonCode: "active_tab_info_final_retained_seal_closeout_ledger_ready",
  ledger: {
    finalRetainedSealCloseoutLedgerId:
      "final-retained-seal-closeout-ledger:browser.active_tab_info:5c3",
    operatorRetainedSealAcknowledgementReceiptId:
      "operator-retained-seal-acknowledgement-receipt:browser.active_tab_info:53e",
    sanitizedFinalRetainedSealCloseoutLedgerRef:
      "final-retained-seal-closeout-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetainedSealCloseoutAcknowledgementRef:
      "final-retained-seal-closeout:active-tab-info:ack:001",
    ledgerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function operatorRetainedCloseoutAcknowledgementReceipt() {
  return buildYeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceipt({
    finalRetainedSealCloseoutLedger:
      READY_FINAL_RETAINED_SEAL_CLOSEOUT_LEDGER,
    sanitizedOperatorRetainedCloseoutAcknowledgementReceiptRef:
      "operator-retained-closeout-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorRetainedCloseoutAcknowledgementRef:
      "operator-retained-closeout:active-tab-info:ack:001",
  })
}

describe("task377 active tab info operator retained closeout acknowledgement receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry operator retained closeout acknowledgement receipt state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T05:58:00.000Z"),
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
      yeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceipt:
        operatorRetainedCloseoutAcknowledgementReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept operator retained closeout acknowledgement receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceipt:
          operatorRetainedCloseoutAcknowledgementReceipt(),
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
        "yeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceipt",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
