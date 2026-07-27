import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceipt,
} from "./yeonjang-browser-active-tab-info-operator-sealed-completion-archive-receipt.js"

export type YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarkerStatus = "ready"

export type YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarkerBlockingReasonCode =
  | "final_sealed_archive_handoff_marker_receipt_not_ready"
  | "final_sealed_archive_handoff_marker_ref_invalid"
  | "final_sealed_archive_handoff_marker_product_log_evidence_ref_invalid"
  | "final_sealed_archive_handoff_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarkerInput {
  operatorSealedCompletionArchiveReceipt: YeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceipt
  sanitizedFinalSealedArchiveHandoffMarkerRef: string
  productLogEvidenceRef: string
  finalSealedArchiveHandoffAcknowledgementRef: string
}

export type YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarker = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-sealed-archive-handoff-marker.v1"
  method: "browser.active_tab_info"
  status: "final_sealed_archive_handoff_marker_ready" | "blocked"
  reasonCode:
    | "active_tab_info_final_sealed_archive_handoff_marker_ready"
    | "active_tab_info_final_sealed_archive_handoff_marker_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarkerBlockingReasonCode[]
  marker?: Readonly<{
    finalSealedArchiveHandoffMarkerId: string
    operatorSealedCompletionArchiveReceiptId: string
    sanitizedFinalSealedArchiveHandoffMarkerRef: string
    productLogEvidenceRef: string
    finalSealedArchiveHandoffAcknowledgementRef: string
    markerStatus: YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarkerStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_FINAL_SEALED_ARCHIVE_HANDOFF_MARKER_REF_PATTERN =
  /^final-sealed-archive-handoff-marker:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_FINAL_SEALED_ARCHIVE_HANDOFF_ACK_REF_PATTERN =
  /^final-sealed-archive-handoff:active-tab-info:ack:[a-z0-9._:-]+$/u

function extractOperatorSealedCompletionArchiveReceiptId(
  receipt: YeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceipt,
): string | undefined {
  if (
    receipt.status !== "operator_sealed_completion_archive_receipt_ready" ||
    receipt.receipt === undefined
  ) {
    return undefined
  }
  return receipt.receipt.operatorSealedCompletionArchiveReceiptId
}

function buildFinalSealedArchiveHandoffMarkerId(input: {
  operatorSealedCompletionArchiveReceiptId: string
  sanitizedFinalSealedArchiveHandoffMarkerRef: string
  productLogEvidenceRef: string
  finalSealedArchiveHandoffAcknowledgementRef: string
  markerStatus: YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarkerStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.operatorSealedCompletionArchiveReceiptId,
    input.sanitizedFinalSealedArchiveHandoffMarkerRef,
    input.productLogEvidenceRef,
    input.finalSealedArchiveHandoffAcknowledgementRef,
    input.markerStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `final-sealed-archive-handoff-marker:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarker["status"]
  reasonCode: YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarker["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarkerBlockingReasonCode[]
  marker?: YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarker["marker"]
}): YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarker {
  return Object.freeze({
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-final-sealed-archive-handoff-marker.v1",
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

export function buildYeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarker(
  input: YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarkerInput,
): YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarker {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarkerBlockingReasonCode[] = []
  const operatorSealedCompletionArchiveReceiptId =
    extractOperatorSealedCompletionArchiveReceiptId(input.operatorSealedCompletionArchiveReceipt)
  if (operatorSealedCompletionArchiveReceiptId === undefined) {
    blockingReasonCodes.push("final_sealed_archive_handoff_marker_receipt_not_ready")
  }
  const sanitizedFinalSealedArchiveHandoffMarkerRef =
    input.sanitizedFinalSealedArchiveHandoffMarkerRef.trim()
  if (!SAFE_FINAL_SEALED_ARCHIVE_HANDOFF_MARKER_REF_PATTERN.test(sanitizedFinalSealedArchiveHandoffMarkerRef)) {
    blockingReasonCodes.push("final_sealed_archive_handoff_marker_ref_invalid")
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push("final_sealed_archive_handoff_marker_product_log_evidence_ref_invalid")
  }
  const finalSealedArchiveHandoffAcknowledgementRef =
    input.finalSealedArchiveHandoffAcknowledgementRef.trim()
  if (!SAFE_FINAL_SEALED_ARCHIVE_HANDOFF_ACK_REF_PATTERN.test(finalSealedArchiveHandoffAcknowledgementRef)) {
    blockingReasonCodes.push("final_sealed_archive_handoff_ack_ref_invalid")
  }

  if (blockingReasonCodes.length > 0 || operatorSealedCompletionArchiveReceiptId === undefined) {
    return baseResult({
      status: "blocked",
      reasonCode: "active_tab_info_final_sealed_archive_handoff_marker_blocked",
      blockingReasonCodes,
    })
  }

  const markerStatus = "ready"
  return baseResult({
    status: "final_sealed_archive_handoff_marker_ready",
    reasonCode: "active_tab_info_final_sealed_archive_handoff_marker_ready",
    marker: Object.freeze({
      finalSealedArchiveHandoffMarkerId:
        buildFinalSealedArchiveHandoffMarkerId({
          operatorSealedCompletionArchiveReceiptId,
          sanitizedFinalSealedArchiveHandoffMarkerRef,
          productLogEvidenceRef,
          finalSealedArchiveHandoffAcknowledgementRef,
          markerStatus,
        }),
      operatorSealedCompletionArchiveReceiptId,
      sanitizedFinalSealedArchiveHandoffMarkerRef,
      productLogEvidenceRef,
      finalSealedArchiveHandoffAcknowledgementRef,
      markerStatus,
    }),
  })
}
