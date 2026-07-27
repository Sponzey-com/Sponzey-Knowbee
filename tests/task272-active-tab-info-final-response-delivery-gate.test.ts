import { describe, expect, it } from "vitest"

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

describe("task272 active tab info final response delivery gate", () => {
  it("opens only the final response delivery gate with redacted refs", () => {
    const gate = buildYeonjangBrowserActiveTabInfoFinalResponseDeliveryGate({
      llmPostCheckDecisionReceipt: READY_LLM_POST_CHECK_DECISION_RECEIPT,
      finalResponseProjectionRef: "final-response-projection:active-tab-info:redacted:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      deliveryChannelAcknowledgement: "acknowledged",
    })

    expect(gate).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-response-delivery-gate.v1",
      method: "browser.active_tab_info",
      status: "final_response_delivery_gate_ready",
      reasonCode: "active_tab_info_final_response_delivery_gate_ready",
      gate: {
        finalDeliveryGateId: "final-response-delivery-gate:browser.active_tab_info:8c7",
        llmPostCheckDecisionReceiptId: "llm-post-check-decision-receipt:browser.active_tab_info:c09",
        decisionStatus: "satisfied",
        finalResponseProjectionRef: "final-response-projection:active-tab-info:redacted:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        deliveryChannelAcknowledgementStatus: "acknowledged",
      },
      deliverFinalResponseNow: true,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
      markUserGoalSucceededNow: false,
    })
  })

  it("blocks unready receipts, unsatisfied decisions, unsafe refs, and missing delivery acknowledgement", () => {
    const gate = buildYeonjangBrowserActiveTabInfoFinalResponseDeliveryGate({
      llmPostCheckDecisionReceipt: {
        ...READY_LLM_POST_CHECK_DECISION_RECEIPT,
        status: "blocked",
        receipt: {
          ...READY_LLM_POST_CHECK_DECISION_RECEIPT.receipt!,
          decisionStatus: "uncertain",
        },
      },
      finalResponseProjectionRef: "/Users/private/raw-response.md",
      productLogEvidenceRef: "https://example.test/product-log?token=secret",
      deliveryChannelAcknowledgement: "missing",
    })

    expect(gate.status).toBe("blocked")
    expect(gate.reasonCode).toBe("active_tab_info_final_response_delivery_gate_blocked")
    expect(gate.blockingReasonCodes).toEqual([
      "final_response_delivery_gate_llm_post_check_receipt_not_ready",
      "final_response_delivery_gate_decision_not_satisfied",
      "final_response_delivery_gate_final_response_projection_ref_invalid",
      "final_response_delivery_gate_product_log_evidence_ref_invalid",
      "final_response_delivery_gate_delivery_acknowledgement_missing",
    ])
    expect(gate.gate).toBeUndefined()
    expect(gate.deliverFinalResponseNow).toBe(false)
    expect(gate.markUserGoalSucceededNow).toBe(false)
  })

  it("does not expose raw final response body, raw browser data, or downstream activation ids", () => {
    const gate = buildYeonjangBrowserActiveTabInfoFinalResponseDeliveryGate({
      llmPostCheckDecisionReceipt: READY_LLM_POST_CHECK_DECISION_RECEIPT,
      finalResponseProjectionRef: "final-response-projection:active-tab-info:redacted:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      deliveryChannelAcknowledgement: "acknowledged",
    })

    expect(JSON.stringify(gate)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|user goal succeeded/iu,
    )
  })
})
