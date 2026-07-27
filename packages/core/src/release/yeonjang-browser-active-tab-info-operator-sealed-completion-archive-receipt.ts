import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoFinalCompletionArchiveSeal,
} from "./yeonjang-browser-active-tab-info-final-completion-archive-seal.js"

export type YeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceiptStatus = "ready"

export type YeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceiptBlockingReasonCode =
  | "operator_sealed_completion_archive_receipt_seal_not_ready"
  | "operator_sealed_completion_archive_receipt_ref_invalid"
  | "operator_sealed_completion_archive_receipt_product_log_evidence_ref_invalid"
  | "operator_sealed_completion_archive_receipt_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceiptInput {
  finalCompletionArchiveSeal: YeonjangBrowserActiveTabInfoFinalCompletionArchiveSeal
  sanitizedOperatorSealedCompletionArchiveReceiptRef: string
  productLogEvidenceRef: string
  operatorSealedCompletionArchiveReceiptRef: string
}

export type YeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceipt = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-sealed-completion-archive-receipt.v1"
  method: "browser.active_tab_info"
  status: "operator_sealed_completion_archive_receipt_ready" | "blocked"
  reasonCode:
    | "active_tab_info_operator_sealed_completion_archive_receipt_ready"
    | "active_tab_info_operator_sealed_completion_archive_receipt_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceiptBlockingReasonCode[]
  receipt?: Readonly<{
    operatorSealedCompletionArchiveReceiptId: string
    finalCompletionArchiveSealId: string
    sanitizedOperatorSealedCompletionArchiveReceiptRef: string
    productLogEvidenceRef: string
    operatorSealedCompletionArchiveReceiptRef: string
    receiptStatus: YeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceiptStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_OPERATOR_SEALED_COMPLETION_ARCHIVE_RECEIPT_REF_PATTERN =
  /^operator-sealed-completion-archive-receipt:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_OPERATOR_SEALED_COMPLETION_ARCHIVE_RECEIPT_ACK_REF_PATTERN =
  /^operator-sealed-completion-archive:active-tab-info:receipt:[a-z0-9._:-]+$/u

function extractFinalCompletionArchiveSealId(
  seal: YeonjangBrowserActiveTabInfoFinalCompletionArchiveSeal,
): string | undefined {
  if (
    seal.status !== "final_completion_archive_seal_ready" ||
    seal.seal === undefined
  ) {
    return undefined
  }
  return seal.seal.finalCompletionArchiveSealId
}

function buildOperatorSealedCompletionArchiveReceiptId(input: {
  finalCompletionArchiveSealId: string
  sanitizedOperatorSealedCompletionArchiveReceiptRef: string
  productLogEvidenceRef: string
  operatorSealedCompletionArchiveReceiptRef: string
  receiptStatus: YeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceiptStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.finalCompletionArchiveSealId,
    input.sanitizedOperatorSealedCompletionArchiveReceiptRef,
    input.productLogEvidenceRef,
    input.operatorSealedCompletionArchiveReceiptRef,
    input.receiptStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `operator-sealed-completion-archive-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceipt["status"]
  reasonCode: YeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceipt["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceiptBlockingReasonCode[]
  receipt?: YeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceipt["receipt"]
}): YeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceipt {
  return Object.freeze({
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-operator-sealed-completion-archive-receipt.v1",
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

export function buildYeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceipt(
  input: YeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceiptInput,
): YeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceipt {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceiptBlockingReasonCode[] = []
  const finalCompletionArchiveSealId =
    extractFinalCompletionArchiveSealId(input.finalCompletionArchiveSeal)
  if (finalCompletionArchiveSealId === undefined) {
    blockingReasonCodes.push("operator_sealed_completion_archive_receipt_seal_not_ready")
  }
  const sanitizedOperatorSealedCompletionArchiveReceiptRef =
    input.sanitizedOperatorSealedCompletionArchiveReceiptRef.trim()
  if (!SAFE_OPERATOR_SEALED_COMPLETION_ARCHIVE_RECEIPT_REF_PATTERN.test(sanitizedOperatorSealedCompletionArchiveReceiptRef)) {
    blockingReasonCodes.push("operator_sealed_completion_archive_receipt_ref_invalid")
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push("operator_sealed_completion_archive_receipt_product_log_evidence_ref_invalid")
  }
  const operatorSealedCompletionArchiveReceiptRef =
    input.operatorSealedCompletionArchiveReceiptRef.trim()
  if (!SAFE_OPERATOR_SEALED_COMPLETION_ARCHIVE_RECEIPT_ACK_REF_PATTERN.test(operatorSealedCompletionArchiveReceiptRef)) {
    blockingReasonCodes.push("operator_sealed_completion_archive_receipt_ack_ref_invalid")
  }

  if (blockingReasonCodes.length > 0 || finalCompletionArchiveSealId === undefined) {
    return baseResult({
      status: "blocked",
      reasonCode: "active_tab_info_operator_sealed_completion_archive_receipt_blocked",
      blockingReasonCodes,
    })
  }

  const receiptStatus = "ready"
  return baseResult({
    status: "operator_sealed_completion_archive_receipt_ready",
    reasonCode: "active_tab_info_operator_sealed_completion_archive_receipt_ready",
    receipt: Object.freeze({
      operatorSealedCompletionArchiveReceiptId:
        buildOperatorSealedCompletionArchiveReceiptId({
          finalCompletionArchiveSealId,
          sanitizedOperatorSealedCompletionArchiveReceiptRef,
          productLogEvidenceRef,
          operatorSealedCompletionArchiveReceiptRef,
          receiptStatus,
        }),
      finalCompletionArchiveSealId,
      sanitizedOperatorSealedCompletionArchiveReceiptRef,
      productLogEvidenceRef,
      operatorSealedCompletionArchiveReceiptRef,
      receiptStatus,
    }),
  })
}
