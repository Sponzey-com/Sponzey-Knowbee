import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalRetainedTransferIndex,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-transfer-index.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-retained-transfer-index-acknowledgement-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_FINAL_RETAINED_TRANSFER_INDEX: YeonjangBrowserActiveTabInfoFinalRetainedTransferIndex = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-retained-transfer-index.v1",
  method: "browser.active_tab_info",
  status: "final_retained_transfer_index_ready",
  reasonCode: "active_tab_info_final_retained_transfer_index_ready",
  index: {
    finalRetainedTransferIndexId:
      "final-retained-transfer-index:browser.active_tab_info:944",
    operatorPostTransferArchiveAcknowledgementReceiptId:
      "operator-post-transfer-archive-acknowledgement-receipt:browser.active_tab_info:cf2",
    sanitizedRetainedTransferIndexRef:
      "retained-transfer-index:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    retentionTransferAcknowledgementRef:
      "retention-transfer:active-tab-info:ack:001",
    indexStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function operatorRetainedTransferIndexAcknowledgementReceipt() {
  return buildYeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceipt({
    finalRetainedTransferIndex: READY_FINAL_RETAINED_TRANSFER_INDEX,
    sanitizedOperatorRetainedTransferIndexAcknowledgementReceiptRef:
      "operator-retained-transfer-index-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorRetainedTransferAcknowledgementRef:
      "operator-retained-transfer:active-tab-info:ack:001",
  })
}

describe("task357 active tab info operator retained transfer index acknowledgement receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry operator retained transfer index acknowledgement receipt state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T04:10:00.000Z"),
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
      yeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceipt:
        operatorRetainedTransferIndexAcknowledgementReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept operator retained transfer index acknowledgement receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceipt:
          operatorRetainedTransferIndexAcknowledgementReceipt(),
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
        "yeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceipt",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
