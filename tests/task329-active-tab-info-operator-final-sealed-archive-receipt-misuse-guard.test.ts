import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffCompletionIndex,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-sealed-archive-handoff-completion-index.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalSealedArchiveReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-sealed-archive-receipt.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_FINAL_SEALED_ARCHIVE_HANDOFF_COMPLETION_INDEX: YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffCompletionIndex = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-sealed-archive-handoff-completion-index.v1",
  method: "browser.active_tab_info",
  status: "final_sealed_archive_handoff_completion_index_ready",
  reasonCode:
    "active_tab_info_final_sealed_archive_handoff_completion_index_ready",
  index: {
    finalSealedArchiveHandoffCompletionIndexId:
      "final-sealed-archive-handoff-completion-index:browser.active_tab_info:246",
    operatorSealedArchiveHandoffReceiptId:
      "operator-sealed-archive-handoff-receipt:browser.active_tab_info:263",
    sanitizedFinalSealedArchiveHandoffCompletionIndexRef:
      "final-sealed-archive-handoff-completion-index:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalSealedArchiveHandoffCompletionAcknowledgementRef:
      "final-sealed-archive-handoff-completion:active-tab-info:ack:001",
    indexStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function operatorFinalSealedArchiveReceipt() {
  return buildYeonjangBrowserActiveTabInfoOperatorFinalSealedArchiveReceipt({
    finalSealedArchiveHandoffCompletionIndex:
      READY_FINAL_SEALED_ARCHIVE_HANDOFF_COMPLETION_INDEX,
    sanitizedOperatorFinalSealedArchiveReceiptRef:
      "operator-final-sealed-archive-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalSealedArchiveReceiptRef:
      "operator-final-sealed-archive:active-tab-info:receipt:001",
  })
}

describe("task329 active tab info operator final sealed archive receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry operator final sealed archive receipt state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T01:55:00.000Z"),
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
      yeonjangBrowserActiveTabInfoOperatorFinalSealedArchiveReceipt:
        operatorFinalSealedArchiveReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept operator final sealed archive receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoOperatorFinalSealedArchiveReceipt:
          operatorFinalSealedArchiveReceipt(),
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
        "yeonjangBrowserActiveTabInfoOperatorFinalSealedArchiveReceipt",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
