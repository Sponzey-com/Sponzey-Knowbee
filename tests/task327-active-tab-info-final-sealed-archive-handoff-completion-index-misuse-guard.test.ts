import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffCompletionIndex,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-sealed-archive-handoff-completion-index.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-sealed-archive-handoff-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_OPERATOR_SEALED_ARCHIVE_HANDOFF_RECEIPT: YeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-sealed-archive-handoff-receipt.v1",
  method: "browser.active_tab_info",
  status: "operator_sealed_archive_handoff_receipt_ready",
  reasonCode:
    "active_tab_info_operator_sealed_archive_handoff_receipt_ready",
  receipt: {
    operatorSealedArchiveHandoffReceiptId:
      "operator-sealed-archive-handoff-receipt:browser.active_tab_info:263",
    finalSealedArchiveHandoffMarkerId:
      "final-sealed-archive-handoff-marker:browser.active_tab_info:3b5",
    sanitizedOperatorSealedArchiveHandoffReceiptRef:
      "operator-sealed-archive-handoff-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorSealedArchiveHandoffReceiptRef:
      "operator-sealed-archive-handoff:active-tab-info:receipt:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function finalSealedArchiveHandoffCompletionIndex() {
  return buildYeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffCompletionIndex({
    operatorSealedArchiveHandoffReceipt:
      READY_OPERATOR_SEALED_ARCHIVE_HANDOFF_RECEIPT,
    sanitizedFinalSealedArchiveHandoffCompletionIndexRef:
      "final-sealed-archive-handoff-completion-index:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalSealedArchiveHandoffCompletionAcknowledgementRef:
      "final-sealed-archive-handoff-completion:active-tab-info:ack:001",
  })
}

describe("task327 active tab info final sealed archive handoff completion index misuse guard", () => {
  it("rejects approval evidence that tries to carry final sealed archive handoff completion index state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T01:40:00.000Z"),
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
      yeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffCompletionIndex:
        finalSealedArchiveHandoffCompletionIndex(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept final sealed archive handoff completion index as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffCompletionIndex:
          finalSealedArchiveHandoffCompletionIndex(),
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
        "yeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffCompletionIndex",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
