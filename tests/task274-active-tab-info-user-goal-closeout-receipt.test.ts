import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoFinalResponseDeliveryGate,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-response-delivery-gate.ts"
import {
  buildYeonjangBrowserActiveTabInfoUserGoalCloseoutReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-user-goal-closeout-receipt.ts"

const READY_FINAL_RESPONSE_DELIVERY_GATE: YeonjangBrowserActiveTabInfoFinalResponseDeliveryGate = {
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
}

describe("task274 active tab info user goal closeout receipt", () => {
  it("builds a minimal redacted user goal closeout receipt without release or activation readiness", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoUserGoalCloseoutReceipt({
      finalResponseDeliveryGate: READY_FINAL_RESPONSE_DELIVERY_GATE,
      userVisibleFinalResponseAcknowledgementRef: "user-visible-final-response:active-tab-info:ack:001",
      llmResultSatisfactionDecision: "satisfied",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    })

    expect(receipt).toEqual({
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
    })
  })

  it("blocks unready delivery gates, unsatisfied decisions, unsafe acknowledgements, and unsafe product refs", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoUserGoalCloseoutReceipt({
      finalResponseDeliveryGate: {
        ...READY_FINAL_RESPONSE_DELIVERY_GATE,
        status: "blocked",
        gate: undefined,
      },
      userVisibleFinalResponseAcknowledgementRef: "https://example.test/ack?token=secret",
      llmResultSatisfactionDecision: "uncertain",
      productLogEvidenceRef: "/Users/private/product-log.json",
    })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe("active_tab_info_user_goal_closeout_receipt_blocked")
    expect(receipt.blockingReasonCodes).toEqual([
      "user_goal_closeout_final_response_delivery_gate_not_ready",
      "user_goal_closeout_satisfaction_decision_not_satisfied",
      "user_goal_closeout_acknowledgement_ref_invalid",
      "user_goal_closeout_product_log_evidence_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
    expect(receipt.markUserGoalSucceededNow).toBe(false)
  })

  it("does not expose raw response body, raw browser data, or downstream activation ids", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoUserGoalCloseoutReceipt({
      finalResponseDeliveryGate: READY_FINAL_RESPONSE_DELIVERY_GATE,
      userVisibleFinalResponseAcknowledgementRef: "user-visible-final-response:active-tab-info:ack:001",
      llmResultSatisfactionDecision: "satisfied",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    })

    expect(JSON.stringify(receipt)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
