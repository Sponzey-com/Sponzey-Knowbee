import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoFinalResponseDeliveryGate,
} from "./yeonjang-browser-active-tab-info-final-response-delivery-gate.js"
import type {
  YeonjangBrowserActiveTabInfoLlmPostCheckDecisionStatus,
} from "./yeonjang-browser-active-tab-info-llm-post-check-decision-receipt.js"

export type YeonjangBrowserActiveTabInfoUserGoalCloseoutBlockingReasonCode =
  | "user_goal_closeout_final_response_delivery_gate_not_ready"
  | "user_goal_closeout_satisfaction_decision_not_satisfied"
  | "user_goal_closeout_acknowledgement_ref_invalid"
  | "user_goal_closeout_product_log_evidence_ref_invalid"

export interface YeonjangBrowserActiveTabInfoUserGoalCloseoutReceiptInput {
  finalResponseDeliveryGate: YeonjangBrowserActiveTabInfoFinalResponseDeliveryGate
  userVisibleFinalResponseAcknowledgementRef: string
  llmResultSatisfactionDecision: YeonjangBrowserActiveTabInfoLlmPostCheckDecisionStatus
  productLogEvidenceRef: string
}

export type YeonjangBrowserActiveTabInfoUserGoalCloseoutReceipt = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-user-goal-closeout-receipt.v1"
  method: "browser.active_tab_info"
  status: "user_goal_closeout_receipt_ready" | "blocked"
  reasonCode:
    | "active_tab_info_user_goal_closeout_receipt_ready"
    | "active_tab_info_user_goal_closeout_receipt_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoUserGoalCloseoutBlockingReasonCode[]
  receipt?: Readonly<{
    userGoalCloseoutReceiptId: string
    finalDeliveryGateId: string
    llmSatisfactionDecisionStatus: "satisfied"
    userVisibleFinalResponseAcknowledgementRef: string
    productLogEvidenceRef: string
  }>
  markUserGoalSucceededNow: boolean
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
  releaseReadinessNow: false
  publicationReadinessNow: false
}>

const SAFE_USER_VISIBLE_FINAL_RESPONSE_ACK_REF_PATTERN =
  /^user-visible-final-response:active-tab-info:ack:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

function extractFinalDeliveryGateId(
  gate: YeonjangBrowserActiveTabInfoFinalResponseDeliveryGate,
): string | undefined {
  if (gate.status !== "final_response_delivery_gate_ready" || gate.gate === undefined) {
    return undefined
  }
  return gate.gate.finalDeliveryGateId
}

function buildUserGoalCloseoutReceiptId(input: {
  finalDeliveryGateId: string
  llmSatisfactionDecisionStatus: "satisfied"
  userVisibleFinalResponseAcknowledgementRef: string
  productLogEvidenceRef: string
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.finalDeliveryGateId,
    input.llmSatisfactionDecisionStatus,
    input.userVisibleFinalResponseAcknowledgementRef,
    input.productLogEvidenceRef,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `user-goal-closeout-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoUserGoalCloseoutReceipt["status"]
  reasonCode: YeonjangBrowserActiveTabInfoUserGoalCloseoutReceipt["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoUserGoalCloseoutBlockingReasonCode[]
  receipt?: YeonjangBrowserActiveTabInfoUserGoalCloseoutReceipt["receipt"]
}): YeonjangBrowserActiveTabInfoUserGoalCloseoutReceipt {
  return Object.freeze({
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-user-goal-closeout-receipt.v1",
    method: "browser.active_tab_info",
    status: input.status,
    reasonCode: input.reasonCode,
    ...(input.blockingReasonCodes === undefined
      ? {}
      : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
    ...(input.receipt === undefined ? {} : { receipt: input.receipt }),
    markUserGoalSucceededNow: input.receipt !== undefined,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
    releaseReadinessNow: false,
    publicationReadinessNow: false,
  })
}

export function buildYeonjangBrowserActiveTabInfoUserGoalCloseoutReceipt(
  input: YeonjangBrowserActiveTabInfoUserGoalCloseoutReceiptInput,
): YeonjangBrowserActiveTabInfoUserGoalCloseoutReceipt {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoUserGoalCloseoutBlockingReasonCode[] = []
  const finalDeliveryGateId = extractFinalDeliveryGateId(input.finalResponseDeliveryGate)
  if (finalDeliveryGateId === undefined) {
    blockingReasonCodes.push("user_goal_closeout_final_response_delivery_gate_not_ready")
  }
  if (input.llmResultSatisfactionDecision !== "satisfied") {
    blockingReasonCodes.push("user_goal_closeout_satisfaction_decision_not_satisfied")
  }
  const userVisibleFinalResponseAcknowledgementRef =
    input.userVisibleFinalResponseAcknowledgementRef.trim()
  if (!SAFE_USER_VISIBLE_FINAL_RESPONSE_ACK_REF_PATTERN.test(userVisibleFinalResponseAcknowledgementRef)) {
    blockingReasonCodes.push("user_goal_closeout_acknowledgement_ref_invalid")
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push("user_goal_closeout_product_log_evidence_ref_invalid")
  }

  if (
    blockingReasonCodes.length > 0 ||
    finalDeliveryGateId === undefined ||
    input.llmResultSatisfactionDecision !== "satisfied"
  ) {
    return baseResult({
      status: "blocked",
      reasonCode: "active_tab_info_user_goal_closeout_receipt_blocked",
      blockingReasonCodes,
    })
  }

  return baseResult({
    status: "user_goal_closeout_receipt_ready",
    reasonCode: "active_tab_info_user_goal_closeout_receipt_ready",
    receipt: Object.freeze({
      userGoalCloseoutReceiptId: buildUserGoalCloseoutReceiptId({
        finalDeliveryGateId,
        llmSatisfactionDecisionStatus: "satisfied",
        userVisibleFinalResponseAcknowledgementRef,
        productLogEvidenceRef,
      }),
      finalDeliveryGateId,
      llmSatisfactionDecisionStatus: "satisfied",
      userVisibleFinalResponseAcknowledgementRef,
      productLogEvidenceRef,
    }),
  })
}
