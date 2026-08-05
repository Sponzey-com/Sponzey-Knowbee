import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalResponseDeliveryGate,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-response-delivery-gate.ts"
import type {
  YeonjangBrowserActiveTabInfoLlmPostCheckDecisionReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-llm-post-check-decision-receipt.ts"

const READY_LLM_POST_CHECK_DECISION_RECEIPT: YeonjangBrowserActiveTabInfoLlmPostCheckDecisionReceipt = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-llm-post-check-decision-receipt.v1",
  method: "browser.active_tab_info",
  status: "llm_post_check_decision_receipt_ready",
  reasonCode: "active_tab_info_llm_post_check_decision_receipt_ready",
  receipt: {
    llmPostCheckDecisionReceiptId: "llm-post-check-decision-receipt:browser.active_tab_info:c09",
    verificationAdmissionId: "dispatch-verification-admission:browser.active_tab_info:0f9",
    dispatchExecutionReceiptId: "dispatch-execution-receipt:browser.active_tab_info:8ba",
    decisionStatus: "satisfied",
    evidenceRefCount: 2,
    decidedAt: "2026-07-22T02:09:00.000Z",
  },
  goalSatisfied: true,
  deliverFinalResponseNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
  markUserGoalSucceededNow: false,
}

function finalResponseDeliveryGate() {
  return buildYeonjangBrowserActiveTabInfoFinalResponseDeliveryGate({
    llmPostCheckDecisionReceipt: READY_LLM_POST_CHECK_DECISION_RECEIPT,
    finalResponseProjectionRef: "final-response-projection:active-tab-info:redacted:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    deliveryChannelAcknowledgement: "acknowledged",
  })
}

describe("task273 active tab info final response delivery gate misuse guard", () => {
  it("rejects approval evidence that tries to carry final response delivery gate state", () => {
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
      yeonjangBrowserActiveTabInfoFinalResponseDeliveryGate: finalResponseDeliveryGate(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept final response delivery gate as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoFinalResponseDeliveryGate: finalResponseDeliveryGate(),
      } as unknown as typeof redacted.observation,
      evidenceRef,
      verificationStatus: "verified",
    })).toEqual({
      ok: false,
      reasonCode: "final_result_redaction_required",
    })

    expect(buildYeonjangBrowserActiveTabInfoProductLogProjection({
      evidenceRef,
      fields: ["evidenceRef", "yeonjangBrowserActiveTabInfoFinalResponseDeliveryGate"],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
