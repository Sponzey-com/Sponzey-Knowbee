import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-sealed-completion-archive-receipt.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalCompletionArchiveSeal,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-completion-archive-seal.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_FINAL_COMPLETION_ARCHIVE_SEAL: YeonjangBrowserActiveTabInfoFinalCompletionArchiveSeal = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-completion-archive-seal.v1",
  method: "browser.active_tab_info",
  status: "final_completion_archive_seal_ready",
  reasonCode: "active_tab_info_final_completion_archive_seal_ready",
  seal: {
    finalCompletionArchiveSealId:
      "final-completion-archive-seal:browser.active_tab_info:4e1",
    operatorCompletionArchiveAcknowledgementId:
      "operator-completion-archive-acknowledgement:browser.active_tab_info:76c",
    sanitizedFinalCompletionArchiveSealRef:
      "final-completion-archive-seal:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalCompletionArchiveAcknowledgementRef:
      "final-completion-archive:active-tab-info:ack:001",
    sealStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function operatorSealedCompletionArchiveReceipt() {
  return buildYeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceipt({
    finalCompletionArchiveSeal: READY_FINAL_COMPLETION_ARCHIVE_SEAL,
    sanitizedOperatorSealedCompletionArchiveReceiptRef:
      "operator-sealed-completion-archive-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorSealedCompletionArchiveReceiptRef:
      "operator-sealed-completion-archive:active-tab-info:receipt:001",
  })
}

describe("task321 active tab info operator sealed completion archive receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry operator sealed completion archive receipt state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T01:00:00.000Z"),
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
      yeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceipt:
        operatorSealedCompletionArchiveReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept operator sealed completion archive receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceipt:
          operatorSealedCompletionArchiveReceipt(),
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
        "yeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceipt",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
