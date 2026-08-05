import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoLlmPostCheckDecisionReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-llm-post-check-decision-receipt.ts"
import type {
  YeonjangBrowserActiveTabInfoDispatchVerificationAdmission,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-dispatch-verification-admission.ts"

const READY_VERIFICATION_ADMISSION: YeonjangBrowserActiveTabInfoDispatchVerificationAdmission = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-dispatch-verification-admission.v1",
  method: "browser.active_tab_info",
  status: "verification_admission_ready",
  reasonCode: "active_tab_info_dispatch_verification_admission_ready",
  admission: {
    verificationAdmissionId: "dispatch-verification-admission:browser.active_tab_info:0f9",
    dispatchExecutionReceiptId: "dispatch-execution-receipt:browser.active_tab_info:8ba",
    redactedRuntimeObservationRef: "runtime-observation:active-tab-info:redacted:001",
    verificationChecklistStatus: "passed",
    llmDecisionSummaryRef: "llm-verification-decision:active-tab-info:summary:001",
  },
  admitNow: true,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
  markUserGoalSucceededNow: false,
}

describe("task270 active tab info LLM post-check decision receipt", () => {
  it("builds a minimal redacted LLM post-check decision receipt without final delivery", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoLlmPostCheckDecisionReceipt({
      verificationAdmission: READY_VERIFICATION_ADMISSION,
      llmPostCheckDecision: "satisfied",
      goalSatisfactionEvidenceRefs: [
        "runtime-observation:active-tab-info:redacted:001",
        "tool-result:yeonjang:browser-active-tab-info:1234567890abcdef1234567890abcdef1234567890abcdef",
      ],
      decidedAt: "2026-07-22T02:09:00.000Z",
    })

    expect(receipt).toEqual({
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
    })
  })

  it("blocks missing admission readiness, invalid decisions, unsafe evidence refs, and invalid dates", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoLlmPostCheckDecisionReceipt({
      verificationAdmission: {
        ...READY_VERIFICATION_ADMISSION,
        status: "blocked",
        admission: undefined,
      },
      llmPostCheckDecision: "maybe" as "satisfied",
      goalSatisfactionEvidenceRefs: ["https://example.test/raw?token=secret"],
      decidedAt: "invalid",
    })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe("active_tab_info_llm_post_check_decision_receipt_blocked")
    expect(receipt.blockingReasonCodes).toEqual([
      "llm_post_check_decision_verification_admission_not_ready",
      "llm_post_check_decision_status_invalid",
      "llm_post_check_decision_evidence_ref_unsafe",
      "llm_post_check_decision_decided_at_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
    expect(receipt.goalSatisfied).toBe(false)
    expect(receipt.deliverFinalResponseNow).toBe(false)
  })

  it("does not expose evidence refs, raw reasoning, raw browser data, or downstream ids", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoLlmPostCheckDecisionReceipt({
      verificationAdmission: READY_VERIFICATION_ADMISSION,
      llmPostCheckDecision: "satisfied",
      goalSatisfactionEvidenceRefs: [
        "runtime-observation:active-tab-info:redacted:001",
        "tool-result:yeonjang:browser-active-tab-info:1234567890abcdef1234567890abcdef1234567890abcdef",
      ],
      decidedAt: "2026-07-22T02:09:00.000Z",
    })

    expect(JSON.stringify(receipt)).not.toMatch(
      /1234567890abcdef1234567890abcdef1234567890abcdef|Private Ticket|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|final response delivered/iu,
    )
  })
})
