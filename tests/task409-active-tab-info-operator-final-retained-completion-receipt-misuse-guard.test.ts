import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-sealed-completion-ledger.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-completion-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_FINAL_RETAINED_SEALED_COMPLETION_LEDGER: YeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedger = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-retained-sealed-completion-ledger.v1",
  method: "browser.active_tab_info",
  status: "final_retained_sealed_completion_ledger_ready",
  reasonCode: "active_tab_info_final_retained_sealed_completion_ledger_ready",
  ledger: {
    finalRetainedSealedCompletionLedgerId:
      "final-retained-sealed-completion-ledger:browser.active_tab_info:965",
    operatorFinalRetainedSealedCompletionReceiptId:
      "operator-final-retained-sealed-completion-receipt:browser.active_tab_info:4b2",
    sanitizedFinalRetainedSealedCompletionLedgerRef:
      "final-retained-sealed-completion-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetainedSealedCompletionRef:
      "final-retained-sealed-completion:active-tab-info:ack:001",
    ledgerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function operatorFinalRetainedCompletionReceipt() {
  return buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionReceipt({
    finalRetainedSealedCompletionLedger:
      READY_FINAL_RETAINED_SEALED_COMPLETION_LEDGER,
    sanitizedOperatorFinalRetainedCompletionReceiptRef:
      "operator-final-retained-completion-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalRetainedCompletionRef:
      "operator-final-retained-completion:active-tab-info:ack:001",
  })
}

describe("task409 active tab info operator final retained completion receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry operator final retained completion receipt state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T08:45:00.000Z"),
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
      yeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionReceipt:
        operatorFinalRetainedCompletionReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept operator final retained completion receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionReceipt:
          operatorFinalRetainedCompletionReceipt(),
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
        "yeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionReceipt",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
