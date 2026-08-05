import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalRetainedCompletionIndex,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-completion-index.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-retained-completion-acknowledgement-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_FINAL_RETAINED_COMPLETION_INDEX: YeonjangBrowserActiveTabInfoFinalRetainedCompletionIndex = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-retained-completion-index.v1",
  method: "browser.active_tab_info",
  status: "final_retained_completion_index_ready",
  reasonCode: "active_tab_info_final_retained_completion_index_ready",
  index: {
    finalRetainedCompletionIndexId:
      "final-retained-completion-index:browser.active_tab_info:252",
    operatorFinalRetainedAcknowledgementReceiptId:
      "operator-final-retained-acknowledgement-receipt:browser.active_tab_info:dbd",
    sanitizedFinalRetainedCompletionIndexRef:
      "final-retained-completion-index:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    retainedCompletionAcknowledgementRef:
      "retained-completion:active-tab-info:ack:001",
    indexStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function operatorRetainedCompletionAcknowledgementReceipt() {
  return buildYeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceipt({
    finalRetainedCompletionIndex: READY_FINAL_RETAINED_COMPLETION_INDEX,
    sanitizedOperatorRetainedCompletionAcknowledgementReceiptRef:
      "operator-retained-completion-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorRetainedCompletionAcknowledgementRef:
      "operator-retained-completion:active-tab-info:ack:001",
  })
}

describe("task365 active tab info operator retained completion acknowledgement receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry operator retained completion acknowledgement receipt state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T04:56:00.000Z"),
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
      yeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceipt:
        operatorRetainedCompletionAcknowledgementReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept operator retained completion acknowledgement receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceipt:
          operatorRetainedCompletionAcknowledgementReceipt(),
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
        "yeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceipt",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
