import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorFinalIndexRetentionReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-index-retention-receipt.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalRetentionClosureLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retention-closure-ledger.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_OPERATOR_FINAL_INDEX_RETENTION_RECEIPT: YeonjangBrowserActiveTabInfoOperatorFinalIndexRetentionReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-final-index-retention-receipt.v1",
  method: "browser.active_tab_info",
  status: "operator_final_index_retention_receipt_ready",
  reasonCode:
    "active_tab_info_operator_final_index_retention_receipt_ready",
  receipt: {
    operatorFinalIndexRetentionReceiptId:
      "operator-final-index-retention-receipt:browser.active_tab_info:394",
    finalOperatorCloseoutIndexId:
      "final-operator-closeout-index:browser.active_tab_info:d25",
    sanitizedOperatorFinalIndexRetentionReceiptRef:
      "operator-final-index-retention-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalIndexRetentionReceiptRef:
      "operator-final-index-retention:active-tab-info:receipt:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function finalRetentionClosureLedger() {
  return buildYeonjangBrowserActiveTabInfoFinalRetentionClosureLedger({
    operatorFinalIndexRetentionReceipt:
      READY_OPERATOR_FINAL_INDEX_RETENTION_RECEIPT,
    sanitizedFinalRetentionClosureLedgerRef:
      "final-retention-closure-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetentionClosureAcknowledgementRef:
      "final-retention-closure:active-tab-info:ack:001",
  })
}

describe("task339 active tab info final retention closure ledger misuse guard", () => {
  it("rejects approval evidence that tries to carry final retention closure ledger state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T02:45:00.000Z"),
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
      yeonjangBrowserActiveTabInfoFinalRetentionClosureLedger:
        finalRetentionClosureLedger(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept final retention closure ledger as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoFinalRetentionClosureLedger:
          finalRetentionClosureLedger(),
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
        "yeonjangBrowserActiveTabInfoFinalRetentionClosureLedger",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
