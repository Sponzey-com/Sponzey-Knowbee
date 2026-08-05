import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"
import {
  buildYeonjangBrowserActiveTabInfoCompletionAuditSummary,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-completion-audit-summary.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import type {
  YeonjangBrowserActiveTabInfoUserGoalCloseoutReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-user-goal-closeout-receipt.ts"

const READY_USER_GOAL_CLOSEOUT_RECEIPT: YeonjangBrowserActiveTabInfoUserGoalCloseoutReceipt = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-user-goal-closeout-receipt.v1",
  method: "browser.active_tab_info",
  status: "user_goal_closeout_receipt_ready",
  reasonCode: "active_tab_info_user_goal_closeout_receipt_ready",
  receipt: {
    userGoalCloseoutReceiptId: "user-goal-closeout-receipt:browser.active_tab_info:7a7",
    finalDeliveryGateId: "final-response-delivery-gate:browser.active_tab_info:8c7",
    llmSatisfactionDecisionStatus: "satisfied",
    userVisibleFinalResponseAcknowledgementRef: "user-visible-final-response:active-tab-info:ack:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
  },
  markUserGoalSucceededNow: true,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
  releaseReadinessNow: false,
  publicationReadinessNow: false,
}

function completionAuditSummary() {
  return buildYeonjangBrowserActiveTabInfoCompletionAuditSummary({
    userGoalCloseoutReceipt: READY_USER_GOAL_CLOSEOUT_RECEIPT,
    finalResultProjectionRef: "final-result-projection:active-tab-info:redacted:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    sanitizedOperatorCompletionNoteRef: "operator-completion-note:active-tab-info:sanitized:001",
  })
}

describe("task277 active tab info completion audit summary misuse guard", () => {
  it("rejects approval evidence that tries to carry completion audit summary state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T02:09:00.000Z"),
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
      yeonjangBrowserActiveTabInfoCompletionAuditSummary: completionAuditSummary(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept completion audit summary as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoCompletionAuditSummary: completionAuditSummary(),
      } as unknown as typeof redacted.observation,
      evidenceRef,
      verificationStatus: "verified",
    })).toEqual({
      ok: false,
      reasonCode: "final_result_redaction_required",
    })

    expect(buildYeonjangBrowserActiveTabInfoProductLogProjection({
      evidenceRef,
      fields: ["evidenceRef", "yeonjangBrowserActiveTabInfoCompletionAuditSummary"],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
