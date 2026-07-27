import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalRetainedLedgerAcknowledgementSeal,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-ledger-acknowledgement-seal.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorRetainedSealAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-retained-seal-acknowledgement-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_FINAL_RETAINED_LEDGER_ACKNOWLEDGEMENT_SEAL: YeonjangBrowserActiveTabInfoFinalRetainedLedgerAcknowledgementSeal = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-retained-ledger-acknowledgement-seal.v1",
  method: "browser.active_tab_info",
  status: "final_retained_ledger_acknowledgement_seal_ready",
  reasonCode:
    "active_tab_info_final_retained_ledger_acknowledgement_seal_ready",
  seal: {
    finalRetainedLedgerAcknowledgementSealId:
      "final-retained-ledger-acknowledgement-seal:browser.active_tab_info:170",
    operatorRetainedLedgerAcknowledgementReceiptId:
      "operator-retained-ledger-acknowledgement-receipt:browser.active_tab_info:d20",
    sanitizedFinalRetainedLedgerAcknowledgementSealRef:
      "final-retained-ledger-acknowledgement-seal:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetainedLedgerAcknowledgementRef:
      "final-retained-ledger:active-tab-info:ack:001",
    sealStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function operatorRetainedSealAcknowledgementReceipt() {
  return buildYeonjangBrowserActiveTabInfoOperatorRetainedSealAcknowledgementReceipt({
    finalRetainedLedgerAcknowledgementSeal:
      READY_FINAL_RETAINED_LEDGER_ACKNOWLEDGEMENT_SEAL,
    sanitizedOperatorRetainedSealAcknowledgementReceiptRef:
      "operator-retained-seal-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorRetainedSealAcknowledgementRef:
      "operator-retained-seal:active-tab-info:ack:001",
  })
}

describe("task373 active tab info operator retained seal acknowledgement receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry operator retained seal acknowledgement receipt state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T05:35:00.000Z"),
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
      yeonjangBrowserActiveTabInfoOperatorRetainedSealAcknowledgementReceipt:
        operatorRetainedSealAcknowledgementReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept operator retained seal acknowledgement receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoOperatorRetainedSealAcknowledgementReceipt:
          operatorRetainedSealAcknowledgementReceipt(),
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
        "yeonjangBrowserActiveTabInfoOperatorRetainedSealAcknowledgementReceipt",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
