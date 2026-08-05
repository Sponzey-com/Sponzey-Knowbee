import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndex,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-operator-closeout-index.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalIndexRetentionReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-index-retention-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_FINAL_OPERATOR_CLOSEOUT_INDEX: YeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndex = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-operator-closeout-index.v1",
  method: "browser.active_tab_info",
  status: "final_operator_closeout_index_ready",
  reasonCode:
    "active_tab_info_final_operator_closeout_index_ready",
  index: {
    finalOperatorCloseoutIndexId:
      "final-operator-closeout-index:browser.active_tab_info:d25",
    operatorFinalCloseoutAcknowledgementReceiptId:
      "operator-final-closeout-acknowledgement-receipt:browser.active_tab_info:21b",
    sanitizedFinalOperatorCloseoutIndexRef:
      "final-operator-closeout-index:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalOperatorCloseoutAcknowledgementRef:
      "final-operator-closeout:active-tab-info:ack:001",
    indexStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function operatorFinalIndexRetentionReceipt() {
  return buildYeonjangBrowserActiveTabInfoOperatorFinalIndexRetentionReceipt({
    finalOperatorCloseoutIndex:
      READY_FINAL_OPERATOR_CLOSEOUT_INDEX,
    sanitizedOperatorFinalIndexRetentionReceiptRef:
      "operator-final-index-retention-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalIndexRetentionReceiptRef:
      "operator-final-index-retention:active-tab-info:receipt:001",
  })
}

describe("task337 active tab info operator final index retention receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry operator final index retention receipt state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T02:35:00.000Z"),
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
      yeonjangBrowserActiveTabInfoOperatorFinalIndexRetentionReceipt:
        operatorFinalIndexRetentionReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept operator final index retention receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoOperatorFinalIndexRetentionReceipt:
          operatorFinalIndexRetentionReceipt(),
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
        "yeonjangBrowserActiveTabInfoOperatorFinalIndexRetentionReceipt",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
