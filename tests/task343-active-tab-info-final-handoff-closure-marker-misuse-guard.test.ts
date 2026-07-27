import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retention-acknowledgement-receipt.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalHandoffClosureMarker,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-handoff-closure-marker.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

const READY_OPERATOR_FINAL_RETENTION_ACKNOWLEDGEMENT_RECEIPT: YeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-final-retention-acknowledgement-receipt.v1",
  method: "browser.active_tab_info",
  status: "operator_final_retention_acknowledgement_receipt_ready",
  reasonCode:
    "active_tab_info_operator_final_retention_acknowledgement_receipt_ready",
  receipt: {
    operatorFinalRetentionAcknowledgementReceiptId:
      "operator-final-retention-acknowledgement-receipt:browser.active_tab_info:8b2",
    finalRetentionClosureLedgerId:
      "final-retention-closure-ledger:browser.active_tab_info:647",
    sanitizedOperatorFinalRetentionAcknowledgementReceiptRef:
      "operator-final-retention-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalRetentionAcknowledgementRef:
      "operator-final-retention-acknowledgement:active-tab-info:ack:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function finalHandoffClosureMarker() {
  return buildYeonjangBrowserActiveTabInfoFinalHandoffClosureMarker({
    operatorFinalRetentionAcknowledgementReceipt:
      READY_OPERATOR_FINAL_RETENTION_ACKNOWLEDGEMENT_RECEIPT,
    sanitizedFinalHandoffClosureMarkerRef:
      "final-handoff-closure-marker:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalHandoffClosureAcknowledgementRef:
      "final-handoff-closure:active-tab-info:ack:001",
  })
}

describe("task343 active tab info final handoff closure marker misuse guard", () => {
  it("rejects approval evidence that tries to carry final handoff closure marker state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T03:00:00.000Z"),
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
      yeonjangBrowserActiveTabInfoFinalHandoffClosureMarker:
        finalHandoffClosureMarker(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept final handoff closure marker as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoFinalHandoffClosureMarker:
          finalHandoffClosureMarker(),
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
        "yeonjangBrowserActiveTabInfoFinalHandoffClosureMarker",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
