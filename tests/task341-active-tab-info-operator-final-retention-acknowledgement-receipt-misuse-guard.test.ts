import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalRetentionClosureLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retention-closure-ledger.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retention-acknowledgement-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_FINAL_RETENTION_CLOSURE_LEDGER: YeonjangBrowserActiveTabInfoFinalRetentionClosureLedger = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-retention-closure-ledger.v1",
  method: "browser.active_tab_info",
  status: "final_retention_closure_ledger_ready",
  reasonCode:
    "active_tab_info_final_retention_closure_ledger_ready",
  ledger: {
    finalRetentionClosureLedgerId:
      "final-retention-closure-ledger:browser.active_tab_info:647",
    operatorFinalIndexRetentionReceiptId:
      "operator-final-index-retention-receipt:browser.active_tab_info:394",
    sanitizedFinalRetentionClosureLedgerRef:
      "final-retention-closure-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetentionClosureAcknowledgementRef:
      "final-retention-closure:active-tab-info:ack:001",
    ledgerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function operatorFinalRetentionAcknowledgementReceipt() {
  return buildYeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceipt({
    finalRetentionClosureLedger:
      READY_FINAL_RETENTION_CLOSURE_LEDGER,
    sanitizedOperatorFinalRetentionAcknowledgementReceiptRef:
      "operator-final-retention-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalRetentionAcknowledgementRef:
      "operator-final-retention-acknowledgement:active-tab-info:ack:001",
  })
}

describe("task341 active tab info operator final retention acknowledgement receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry operator final retention acknowledgement receipt state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T02:55:00.000Z"),
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
      yeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceipt:
        operatorFinalRetentionAcknowledgementReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept operator final retention acknowledgement receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceipt:
          operatorFinalRetentionAcknowledgementReceipt(),
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
        "yeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceipt",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
