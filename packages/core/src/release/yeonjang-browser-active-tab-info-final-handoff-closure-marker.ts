import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceipt,
} from "./yeonjang-browser-active-tab-info-operator-final-retention-acknowledgement-receipt.js"

export type YeonjangBrowserActiveTabInfoFinalHandoffClosureMarkerStatus = "ready"

export type YeonjangBrowserActiveTabInfoFinalHandoffClosureMarkerBlockingReasonCode =
  | "final_handoff_closure_marker_receipt_not_ready"
  | "final_handoff_closure_marker_ref_invalid"
  | "final_handoff_closure_marker_product_log_evidence_ref_invalid"
  | "final_handoff_closure_marker_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoFinalHandoffClosureMarkerInput {
  operatorFinalRetentionAcknowledgementReceipt: YeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceipt
  sanitizedFinalHandoffClosureMarkerRef: string
  productLogEvidenceRef: string
  finalHandoffClosureAcknowledgementRef: string
}

export type YeonjangBrowserActiveTabInfoFinalHandoffClosureMarker = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-handoff-closure-marker.v1"
  method: "browser.active_tab_info"
  status: "final_handoff_closure_marker_ready" | "blocked"
  reasonCode:
    | "active_tab_info_final_handoff_closure_marker_ready"
    | "active_tab_info_final_handoff_closure_marker_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalHandoffClosureMarkerBlockingReasonCode[]
  marker?: Readonly<{
    finalHandoffClosureMarkerId: string
    operatorFinalRetentionAcknowledgementReceiptId: string
    sanitizedFinalHandoffClosureMarkerRef: string
    productLogEvidenceRef: string
    finalHandoffClosureAcknowledgementRef: string
    markerStatus: YeonjangBrowserActiveTabInfoFinalHandoffClosureMarkerStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_FINAL_HANDOFF_CLOSURE_MARKER_REF_PATTERN =
  /^final-handoff-closure-marker:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_FINAL_HANDOFF_CLOSURE_ACK_REF_PATTERN =
  /^final-handoff-closure:active-tab-info:ack:[a-z0-9._:-]+$/u

function extractOperatorFinalRetentionAcknowledgementReceiptId(
  receipt: YeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceipt,
): string | undefined {
  if (
    receipt.status !== "operator_final_retention_acknowledgement_receipt_ready" ||
    receipt.receipt === undefined
  ) {
    return undefined
  }
  return receipt.receipt.operatorFinalRetentionAcknowledgementReceiptId
}

function buildFinalHandoffClosureMarkerId(input: {
  operatorFinalRetentionAcknowledgementReceiptId: string
  sanitizedFinalHandoffClosureMarkerRef: string
  productLogEvidenceRef: string
  finalHandoffClosureAcknowledgementRef: string
  markerStatus: YeonjangBrowserActiveTabInfoFinalHandoffClosureMarkerStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.operatorFinalRetentionAcknowledgementReceiptId,
    input.sanitizedFinalHandoffClosureMarkerRef,
    input.productLogEvidenceRef,
    input.finalHandoffClosureAcknowledgementRef,
    input.markerStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `final-handoff-closure-marker:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoFinalHandoffClosureMarker["status"]
  reasonCode: YeonjangBrowserActiveTabInfoFinalHandoffClosureMarker["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalHandoffClosureMarkerBlockingReasonCode[]
  marker?: YeonjangBrowserActiveTabInfoFinalHandoffClosureMarker["marker"]
}): YeonjangBrowserActiveTabInfoFinalHandoffClosureMarker {
  return Object.freeze({
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-final-handoff-closure-marker.v1",
    method: "browser.active_tab_info",
    status: input.status,
    reasonCode: input.reasonCode,
    ...(input.blockingReasonCodes === undefined
      ? {}
      : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
    ...(input.marker === undefined ? {} : { marker: input.marker }),
    releaseReadinessNow: false,
    publicationReadinessNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
  })
}

export function buildYeonjangBrowserActiveTabInfoFinalHandoffClosureMarker(
  input: YeonjangBrowserActiveTabInfoFinalHandoffClosureMarkerInput,
): YeonjangBrowserActiveTabInfoFinalHandoffClosureMarker {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoFinalHandoffClosureMarkerBlockingReasonCode[] = []
  const operatorFinalRetentionAcknowledgementReceiptId =
    extractOperatorFinalRetentionAcknowledgementReceiptId(
      input.operatorFinalRetentionAcknowledgementReceipt,
    )
  if (operatorFinalRetentionAcknowledgementReceiptId === undefined) {
    blockingReasonCodes.push("final_handoff_closure_marker_receipt_not_ready")
  }
  const sanitizedFinalHandoffClosureMarkerRef =
    input.sanitizedFinalHandoffClosureMarkerRef.trim()
  if (!SAFE_FINAL_HANDOFF_CLOSURE_MARKER_REF_PATTERN.test(sanitizedFinalHandoffClosureMarkerRef)) {
    blockingReasonCodes.push("final_handoff_closure_marker_ref_invalid")
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push("final_handoff_closure_marker_product_log_evidence_ref_invalid")
  }
  const finalHandoffClosureAcknowledgementRef =
    input.finalHandoffClosureAcknowledgementRef.trim()
  if (!SAFE_FINAL_HANDOFF_CLOSURE_ACK_REF_PATTERN.test(finalHandoffClosureAcknowledgementRef)) {
    blockingReasonCodes.push("final_handoff_closure_marker_ack_ref_invalid")
  }

  if (blockingReasonCodes.length > 0 || operatorFinalRetentionAcknowledgementReceiptId === undefined) {
    return baseResult({
      status: "blocked",
      reasonCode: "active_tab_info_final_handoff_closure_marker_blocked",
      blockingReasonCodes,
    })
  }

  const markerStatus = "ready"
  return baseResult({
    status: "final_handoff_closure_marker_ready",
    reasonCode: "active_tab_info_final_handoff_closure_marker_ready",
    marker: Object.freeze({
      finalHandoffClosureMarkerId:
        buildFinalHandoffClosureMarkerId({
          operatorFinalRetentionAcknowledgementReceiptId,
          sanitizedFinalHandoffClosureMarkerRef,
          productLogEvidenceRef,
          finalHandoffClosureAcknowledgementRef,
          markerStatus,
        }),
      operatorFinalRetentionAcknowledgementReceiptId,
      sanitizedFinalHandoffClosureMarkerRef,
      productLogEvidenceRef,
      finalHandoffClosureAcknowledgementRef,
      markerStatus,
    }),
  })
}
