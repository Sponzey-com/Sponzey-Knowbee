import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoDispatchVerificationAdmission,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-dispatch-verification-admission.ts"
import type {
  YeonjangBrowserActiveTabInfoDispatchExecutionReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-dispatch-execution-receipt.ts"

const READY_DISPATCH_EXECUTION_RECEIPT: YeonjangBrowserActiveTabInfoDispatchExecutionReceipt = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-dispatch-execution-receipt.v1",
  method: "browser.active_tab_info",
  status: "dispatch_execution_receipt_ready",
  reasonCode: "active_tab_info_dispatch_execution_receipt_ready",
  receipt: {
    dispatchExecutionReceiptId: "dispatch-execution-receipt:browser.active_tab_info:8ba",
    dispatchDryRunReceiptId: "dispatch-dry-run-receipt:browser.active_tab_info:d92",
    liveExecutionReceiptId: "live-execution-receipt:browser.active_tab_info:b42",
    targetSurfaceCount: 2,
    executedAt: "2026-07-22T02:08:00.000Z",
    postDispatchRedactedResultRef: "post-dispatch-result:active-tab-info:redacted:001",
  },
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
  markUserGoalSucceededNow: false,
}

describe("task268 active tab info dispatch verification admission", () => {
  it("admits a redacted dispatch result to verification without downstream activation", () => {
    const admission = buildYeonjangBrowserActiveTabInfoDispatchVerificationAdmission({
      dispatchExecutionReceipt: READY_DISPATCH_EXECUTION_RECEIPT,
      redactedRuntimeObservationRef: "runtime-observation:active-tab-info:redacted:001",
      llmVerificationDecision: "verified",
      llmDecisionSummaryRef: "llm-verification-decision:active-tab-info:summary:001",
      verificationChecklistStatus: "passed",
    })

    expect(admission).toEqual({
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
    })
  })

  it("blocks missing receipt readiness, unsafe refs, non-verified LLM decisions, and failed checklist", () => {
    const admission = buildYeonjangBrowserActiveTabInfoDispatchVerificationAdmission({
      dispatchExecutionReceipt: {
        ...READY_DISPATCH_EXECUTION_RECEIPT,
        status: "blocked",
        receipt: undefined,
      },
      redactedRuntimeObservationRef: "https://example.test/raw?token=secret",
      llmVerificationDecision: "unverifiable",
      llmDecisionSummaryRef: "/Users/private/llm-summary",
      verificationChecklistStatus: "failed",
    })

    expect(admission.status).toBe("blocked")
    expect(admission.reasonCode).toBe("active_tab_info_dispatch_verification_admission_blocked")
    expect(admission.blockingReasonCodes).toEqual([
      "dispatch_verification_admission_execution_receipt_not_ready",
      "dispatch_verification_admission_observation_ref_invalid",
      "dispatch_verification_admission_llm_decision_not_verified",
      "dispatch_verification_admission_llm_summary_ref_invalid",
      "dispatch_verification_admission_checklist_not_passed",
    ])
    expect(admission.admission).toBeUndefined()
    expect(admission.admitNow).toBe(false)
  })

  it("does not expose raw browser data, local paths, downstream ids, or success claims", () => {
    const admission = buildYeonjangBrowserActiveTabInfoDispatchVerificationAdmission({
      dispatchExecutionReceipt: READY_DISPATCH_EXECUTION_RECEIPT,
      redactedRuntimeObservationRef: "runtime-observation:active-tab-info:redacted:001",
      llmVerificationDecision: "verified",
      llmDecisionSummaryRef: "llm-verification-decision:active-tab-info:summary:001",
      verificationChecklistStatus: "passed",
    })

    expect(JSON.stringify(admission)).not.toMatch(
      /Private Ticket|https?:\/\/|\/Users\/|token=|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|user goal succeeded/iu,
    )
  })
})
