import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalRetainedCompletionLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-completion-ledger.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalCompletionReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-completion-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_FINAL_RETAINED_COMPLETION_LEDGER: YeonjangBrowserActiveTabInfoFinalRetainedCompletionLedger = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-retained-completion-ledger.v1",
  method: "browser.active_tab_info",
  status: "final_retained_completion_ledger_ready",
  reasonCode: "active_tab_info_final_retained_completion_ledger_ready",
  ledger: {
    finalRetainedCompletionLedgerId:
      "final-retained-completion-ledger:browser.active_tab_info:0d3",
    operatorFinalRetainedCompletionReceiptId:
      "operator-final-retained-completion-receipt:browser.active_tab_info:b03",
    sanitizedFinalRetainedCompletionLedgerRef:
      "final-retained-completion-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetainedCompletionRef:
      "final-retained-completion:active-tab-info:ack:001",
    ledgerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function operatorFinalCompletionReceipt() {
  return buildYeonjangBrowserActiveTabInfoOperatorFinalCompletionReceipt({
    finalRetainedCompletionLedger: READY_FINAL_RETAINED_COMPLETION_LEDGER,
    sanitizedOperatorFinalCompletionReceiptRef:
      "operator-final-completion-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalCompletionRef:
      "operator-final-completion:active-tab-info:ack:001",
  })
}

describe("task413 active tab info operator final completion receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry operator final completion receipt state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T09:05:00.000Z"),
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
      yeonjangBrowserActiveTabInfoOperatorFinalCompletionReceipt:
        operatorFinalCompletionReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept operator final completion receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoOperatorFinalCompletionReceipt:
          operatorFinalCompletionReceipt(),
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
        "yeonjangBrowserActiveTabInfoOperatorFinalCompletionReceipt",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
