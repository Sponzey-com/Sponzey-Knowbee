import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoFinalPostTransferArchivePointer,
} from "./yeonjang-browser-active-tab-info-final-post-transfer-archive-pointer.js"

export type YeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceiptStatus = "ready"

export type YeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceiptBlockingReasonCode =
  | "operator_post_transfer_archive_acknowledgement_receipt_pointer_not_ready"
  | "operator_post_transfer_archive_acknowledgement_receipt_ref_invalid"
  | "operator_post_transfer_archive_acknowledgement_receipt_product_log_evidence_ref_invalid"
  | "operator_post_transfer_archive_acknowledgement_receipt_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceiptInput {
  finalPostTransferArchivePointer: YeonjangBrowserActiveTabInfoFinalPostTransferArchivePointer
  sanitizedOperatorPostTransferArchiveAcknowledgementReceiptRef: string
  productLogEvidenceRef: string
  operatorPostTransferArchiveAcknowledgementRef: string
}

export type YeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceipt = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-post-transfer-archive-acknowledgement-receipt.v1"
  method: "browser.active_tab_info"
  status: "operator_post_transfer_archive_acknowledgement_receipt_ready" | "blocked"
  reasonCode:
    | "active_tab_info_operator_post_transfer_archive_acknowledgement_receipt_ready"
    | "active_tab_info_operator_post_transfer_archive_acknowledgement_receipt_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceiptBlockingReasonCode[]
  receipt?: Readonly<{
    operatorPostTransferArchiveAcknowledgementReceiptId: string
    finalPostTransferArchivePointerId: string
    sanitizedOperatorPostTransferArchiveAcknowledgementReceiptRef: string
    productLogEvidenceRef: string
    operatorPostTransferArchiveAcknowledgementRef: string
    receiptStatus: YeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceiptStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_OPERATOR_POST_TRANSFER_ARCHIVE_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN =
  /^operator-post-transfer-archive-acknowledgement-receipt:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_OPERATOR_POST_TRANSFER_ARCHIVE_ACKNOWLEDGEMENT_REF_PATTERN =
  /^operator-post-transfer-archive:active-tab-info:ack:[a-z0-9._:-]+$/u

function extractFinalPostTransferArchivePointerId(
  pointer: YeonjangBrowserActiveTabInfoFinalPostTransferArchivePointer,
): string | undefined {
  if (
    pointer.status !== "final_post_transfer_archive_pointer_ready" ||
    pointer.pointer === undefined
  ) {
    return undefined
  }
  return pointer.pointer.finalPostTransferArchivePointerId
}

function buildOperatorPostTransferArchiveAcknowledgementReceiptId(input: {
  finalPostTransferArchivePointerId: string
  sanitizedOperatorPostTransferArchiveAcknowledgementReceiptRef: string
  productLogEvidenceRef: string
  operatorPostTransferArchiveAcknowledgementRef: string
  receiptStatus: YeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceiptStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.finalPostTransferArchivePointerId,
    input.sanitizedOperatorPostTransferArchiveAcknowledgementReceiptRef,
    input.productLogEvidenceRef,
    input.operatorPostTransferArchiveAcknowledgementRef,
    input.receiptStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `operator-post-transfer-archive-acknowledgement-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceipt["status"]
  reasonCode: YeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceipt["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceiptBlockingReasonCode[]
  receipt?: YeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceipt["receipt"]
}): YeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceipt {
  return Object.freeze({
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-operator-post-transfer-archive-acknowledgement-receipt.v1",
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

export function buildYeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceipt(
  input: YeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceiptInput,
): YeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceipt {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceiptBlockingReasonCode[] = []
  const finalPostTransferArchivePointerId =
    extractFinalPostTransferArchivePointerId(input.finalPostTransferArchivePointer)
  if (finalPostTransferArchivePointerId === undefined) {
    blockingReasonCodes.push("operator_post_transfer_archive_acknowledgement_receipt_pointer_not_ready")
  }
  const sanitizedOperatorPostTransferArchiveAcknowledgementReceiptRef =
    input.sanitizedOperatorPostTransferArchiveAcknowledgementReceiptRef.trim()
  if (!SAFE_OPERATOR_POST_TRANSFER_ARCHIVE_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN.test(sanitizedOperatorPostTransferArchiveAcknowledgementReceiptRef)) {
    blockingReasonCodes.push("operator_post_transfer_archive_acknowledgement_receipt_ref_invalid")
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push("operator_post_transfer_archive_acknowledgement_receipt_product_log_evidence_ref_invalid")
  }
  const operatorPostTransferArchiveAcknowledgementRef =
    input.operatorPostTransferArchiveAcknowledgementRef.trim()
  if (!SAFE_OPERATOR_POST_TRANSFER_ARCHIVE_ACKNOWLEDGEMENT_REF_PATTERN.test(operatorPostTransferArchiveAcknowledgementRef)) {
    blockingReasonCodes.push("operator_post_transfer_archive_acknowledgement_receipt_ack_ref_invalid")
  }

  if (blockingReasonCodes.length > 0 || finalPostTransferArchivePointerId === undefined) {
    return baseResult({
      status: "blocked",
      reasonCode:
        "active_tab_info_operator_post_transfer_archive_acknowledgement_receipt_blocked",
      blockingReasonCodes,
    })
  }

  const receiptStatus = "ready"
  return baseResult({
    status: "operator_post_transfer_archive_acknowledgement_receipt_ready",
    reasonCode:
      "active_tab_info_operator_post_transfer_archive_acknowledgement_receipt_ready",
    receipt: Object.freeze({
      operatorPostTransferArchiveAcknowledgementReceiptId:
        buildOperatorPostTransferArchiveAcknowledgementReceiptId({
          finalPostTransferArchivePointerId,
          sanitizedOperatorPostTransferArchiveAcknowledgementReceiptRef,
          productLogEvidenceRef,
          operatorPostTransferArchiveAcknowledgementRef,
          receiptStatus,
        }),
      finalPostTransferArchivePointerId,
      sanitizedOperatorPostTransferArchiveAcknowledgementReceiptRef,
      productLogEvidenceRef,
      operatorPostTransferArchiveAcknowledgementRef,
      receiptStatus,
    }),
  })
}
