import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarker,
} from "./yeonjang-browser-active-tab-info-final-sealed-archive-handoff-marker.js"

export type YeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceiptStatus = "ready"

export type YeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceiptBlockingReasonCode =
  | "operator_sealed_archive_handoff_receipt_marker_not_ready"
  | "operator_sealed_archive_handoff_receipt_ref_invalid"
  | "operator_sealed_archive_handoff_receipt_product_log_evidence_ref_invalid"
  | "operator_sealed_archive_handoff_receipt_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceiptInput {
  finalSealedArchiveHandoffMarker: YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarker
  sanitizedOperatorSealedArchiveHandoffReceiptRef: string
  productLogEvidenceRef: string
  operatorSealedArchiveHandoffReceiptRef: string
}

export type YeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceipt = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-sealed-archive-handoff-receipt.v1"
  method: "browser.active_tab_info"
  status: "operator_sealed_archive_handoff_receipt_ready" | "blocked"
  reasonCode:
    | "active_tab_info_operator_sealed_archive_handoff_receipt_ready"
    | "active_tab_info_operator_sealed_archive_handoff_receipt_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceiptBlockingReasonCode[]
  receipt?: Readonly<{
    operatorSealedArchiveHandoffReceiptId: string
    finalSealedArchiveHandoffMarkerId: string
    sanitizedOperatorSealedArchiveHandoffReceiptRef: string
    productLogEvidenceRef: string
    operatorSealedArchiveHandoffReceiptRef: string
    receiptStatus: YeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceiptStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_OPERATOR_SEALED_ARCHIVE_HANDOFF_RECEIPT_REF_PATTERN =
  /^operator-sealed-archive-handoff-receipt:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_OPERATOR_SEALED_ARCHIVE_HANDOFF_RECEIPT_ACK_REF_PATTERN =
  /^operator-sealed-archive-handoff:active-tab-info:receipt:[a-z0-9._:-]+$/u

function extractFinalSealedArchiveHandoffMarkerId(
  marker: YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarker,
): string | undefined {
  if (
    marker.status !== "final_sealed_archive_handoff_marker_ready" ||
    marker.marker === undefined
  ) {
    return undefined
  }
  return marker.marker.finalSealedArchiveHandoffMarkerId
}

function buildOperatorSealedArchiveHandoffReceiptId(input: {
  finalSealedArchiveHandoffMarkerId: string
  sanitizedOperatorSealedArchiveHandoffReceiptRef: string
  productLogEvidenceRef: string
  operatorSealedArchiveHandoffReceiptRef: string
  receiptStatus: YeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceiptStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.finalSealedArchiveHandoffMarkerId,
    input.sanitizedOperatorSealedArchiveHandoffReceiptRef,
    input.productLogEvidenceRef,
    input.operatorSealedArchiveHandoffReceiptRef,
    input.receiptStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `operator-sealed-archive-handoff-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceipt["status"]
  reasonCode: YeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceipt["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceiptBlockingReasonCode[]
  receipt?: YeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceipt["receipt"]
}): YeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceipt {
  return Object.freeze({
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-operator-sealed-archive-handoff-receipt.v1",
    method: "browser.active_tab_info",
    status: input.status,
    reasonCode: input.reasonCode,
    ...(input.blockingReasonCodes === undefined
      ? {}
      : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
    ...(input.receipt === undefined ? {} : { receipt: input.receipt }),
    releaseReadinessNow: false,
    publicationReadinessNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
  })
}

export function buildYeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceipt(
  input: YeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceiptInput,
): YeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceipt {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceiptBlockingReasonCode[] = []
  const finalSealedArchiveHandoffMarkerId =
    extractFinalSealedArchiveHandoffMarkerId(input.finalSealedArchiveHandoffMarker)
  if (finalSealedArchiveHandoffMarkerId === undefined) {
    blockingReasonCodes.push("operator_sealed_archive_handoff_receipt_marker_not_ready")
  }
  const sanitizedOperatorSealedArchiveHandoffReceiptRef =
    input.sanitizedOperatorSealedArchiveHandoffReceiptRef.trim()
  if (!SAFE_OPERATOR_SEALED_ARCHIVE_HANDOFF_RECEIPT_REF_PATTERN.test(sanitizedOperatorSealedArchiveHandoffReceiptRef)) {
    blockingReasonCodes.push("operator_sealed_archive_handoff_receipt_ref_invalid")
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push("operator_sealed_archive_handoff_receipt_product_log_evidence_ref_invalid")
  }
  const operatorSealedArchiveHandoffReceiptRef =
    input.operatorSealedArchiveHandoffReceiptRef.trim()
  if (!SAFE_OPERATOR_SEALED_ARCHIVE_HANDOFF_RECEIPT_ACK_REF_PATTERN.test(operatorSealedArchiveHandoffReceiptRef)) {
    blockingReasonCodes.push("operator_sealed_archive_handoff_receipt_ack_ref_invalid")
  }

  if (blockingReasonCodes.length > 0 || finalSealedArchiveHandoffMarkerId === undefined) {
    return baseResult({
      status: "blocked",
      reasonCode: "active_tab_info_operator_sealed_archive_handoff_receipt_blocked",
      blockingReasonCodes,
    })
  }

  const receiptStatus = "ready"
  return baseResult({
    status: "operator_sealed_archive_handoff_receipt_ready",
    reasonCode: "active_tab_info_operator_sealed_archive_handoff_receipt_ready",
    receipt: Object.freeze({
      operatorSealedArchiveHandoffReceiptId:
        buildOperatorSealedArchiveHandoffReceiptId({
          finalSealedArchiveHandoffMarkerId,
          sanitizedOperatorSealedArchiveHandoffReceiptRef,
          productLogEvidenceRef,
          operatorSealedArchiveHandoffReceiptRef,
          receiptStatus,
        }),
      finalSealedArchiveHandoffMarkerId,
      sanitizedOperatorSealedArchiveHandoffReceiptRef,
      productLogEvidenceRef,
      operatorSealedArchiveHandoffReceiptRef,
      receiptStatus,
    }),
  })
}
