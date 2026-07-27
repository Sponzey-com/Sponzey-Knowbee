import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoLlmPostCheckDecisionReceipt,
  YeonjangBrowserActiveTabInfoLlmPostCheckDecisionStatus,
} from "./yeonjang-browser-active-tab-info-llm-post-check-decision-receipt.js"

export type YeonjangBrowserActiveTabInfoFinalResponseDeliveryAcknowledgementStatus =
  | "acknowledged"
  | "missing"

export type YeonjangBrowserActiveTabInfoFinalResponseDeliveryGateBlockingReasonCode =
  | "final_response_delivery_gate_llm_post_check_receipt_not_ready"
  | "final_response_delivery_gate_decision_not_satisfied"
  | "final_response_delivery_gate_final_response_projection_ref_invalid"
  | "final_response_delivery_gate_product_log_evidence_ref_invalid"
  | "final_response_delivery_gate_delivery_acknowledgement_missing"

export interface YeonjangBrowserActiveTabInfoFinalResponseDeliveryGateInput {
  llmPostCheckDecisionReceipt: YeonjangBrowserActiveTabInfoLlmPostCheckDecisionReceipt
  finalResponseProjectionRef: string
  productLogEvidenceRef: string
  deliveryChannelAcknowledgement: YeonjangBrowserActiveTabInfoFinalResponseDeliveryAcknowledgementStatus
}

export type YeonjangBrowserActiveTabInfoFinalResponseDeliveryGate = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-response-delivery-gate.v1"
  method: "browser.active_tab_info"
  status: "final_response_delivery_gate_ready" | "blocked"
  reasonCode:
    | "active_tab_info_final_response_delivery_gate_ready"
    | "active_tab_info_final_response_delivery_gate_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalResponseDeliveryGateBlockingReasonCode[]
  gate?: Readonly<{
    finalDeliveryGateId: string
    llmPostCheckDecisionReceiptId: string
    decisionStatus: YeonjangBrowserActiveTabInfoLlmPostCheckDecisionStatus
    finalResponseProjectionRef: string
    productLogEvidenceRef: string
    deliveryChannelAcknowledgementStatus: "acknowledged"
  }>
  deliverFinalResponseNow: boolean
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
  markUserGoalSucceededNow: false
}>

const SAFE_FINAL_RESPONSE_PROJECTION_REF_PATTERN =
  /^final-response-projection:active-tab-info:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

function extractDecisionReceipt(
  receipt: YeonjangBrowserActiveTabInfoLlmPostCheckDecisionReceipt,
):
  | {
      llmPostCheckDecisionReceiptId: string
      decisionStatus: YeonjangBrowserActiveTabInfoLlmPostCheckDecisionStatus
    }
  | undefined {
  if (receipt.status !== "llm_post_check_decision_receipt_ready" || receipt.receipt === undefined) {
    return undefined
  }
  return {
    llmPostCheckDecisionReceiptId: receipt.receipt.llmPostCheckDecisionReceiptId,
    decisionStatus: receipt.receipt.decisionStatus,
  }
}

function buildFinalDeliveryGateId(input: {
  llmPostCheckDecisionReceiptId: string
  decisionStatus: YeonjangBrowserActiveTabInfoLlmPostCheckDecisionStatus
  finalResponseProjectionRef: string
  productLogEvidenceRef: string
  deliveryChannelAcknowledgementStatus: "acknowledged"
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.llmPostCheckDecisionReceiptId,
    input.decisionStatus,
    input.finalResponseProjectionRef,
    input.productLogEvidenceRef,
    input.deliveryChannelAcknowledgementStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `final-response-delivery-gate:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoFinalResponseDeliveryGate["status"]
  reasonCode: YeonjangBrowserActiveTabInfoFinalResponseDeliveryGate["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalResponseDeliveryGateBlockingReasonCode[]
  gate?: YeonjangBrowserActiveTabInfoFinalResponseDeliveryGate["gate"]
}): YeonjangBrowserActiveTabInfoFinalResponseDeliveryGate {
  return Object.freeze({
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-response-delivery-gate.v1",
    method: "browser.active_tab_info",
    status: input.status,
    reasonCode: input.reasonCode,
    ...(input.blockingReasonCodes === undefined
      ? {}
      : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
    ...(input.gate === undefined ? {} : { gate: input.gate }),
    deliverFinalResponseNow: input.gate !== undefined,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
    markUserGoalSucceededNow: false,
  })
}

export function buildYeonjangBrowserActiveTabInfoFinalResponseDeliveryGate(
  input: YeonjangBrowserActiveTabInfoFinalResponseDeliveryGateInput,
): YeonjangBrowserActiveTabInfoFinalResponseDeliveryGate {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoFinalResponseDeliveryGateBlockingReasonCode[] = []
  const receipt = extractDecisionReceipt(input.llmPostCheckDecisionReceipt)
  if (receipt === undefined) {
    blockingReasonCodes.push("final_response_delivery_gate_llm_post_check_receipt_not_ready")
  }
  if (receipt?.decisionStatus !== "satisfied") {
    blockingReasonCodes.push("final_response_delivery_gate_decision_not_satisfied")
  }
  const finalResponseProjectionRef = input.finalResponseProjectionRef.trim()
  if (!SAFE_FINAL_RESPONSE_PROJECTION_REF_PATTERN.test(finalResponseProjectionRef)) {
    blockingReasonCodes.push("final_response_delivery_gate_final_response_projection_ref_invalid")
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push("final_response_delivery_gate_product_log_evidence_ref_invalid")
  }
  if (input.deliveryChannelAcknowledgement !== "acknowledged") {
    blockingReasonCodes.push("final_response_delivery_gate_delivery_acknowledgement_missing")
  }

  if (blockingReasonCodes.length > 0 || receipt === undefined) {
    return baseResult({
      status: "blocked",
      reasonCode: "active_tab_info_final_response_delivery_gate_blocked",
      blockingReasonCodes,
    })
  }

  const deliveryChannelAcknowledgementStatus = "acknowledged"
  return baseResult({
    status: "final_response_delivery_gate_ready",
    reasonCode: "active_tab_info_final_response_delivery_gate_ready",
    gate: Object.freeze({
      finalDeliveryGateId: buildFinalDeliveryGateId({
        llmPostCheckDecisionReceiptId: receipt.llmPostCheckDecisionReceiptId,
        decisionStatus: receipt.decisionStatus,
        finalResponseProjectionRef,
        productLogEvidenceRef,
        deliveryChannelAcknowledgementStatus,
      }),
      llmPostCheckDecisionReceiptId: receipt.llmPostCheckDecisionReceiptId,
      decisionStatus: receipt.decisionStatus,
      finalResponseProjectionRef,
      productLogEvidenceRef,
      deliveryChannelAcknowledgementStatus,
    }),
  })
}
