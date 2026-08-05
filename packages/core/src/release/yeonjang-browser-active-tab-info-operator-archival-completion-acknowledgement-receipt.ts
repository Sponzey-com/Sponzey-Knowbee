import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoFinalArchivalCompletionIndex,
} from "./yeonjang-browser-active-tab-info-final-archival-completion-index.js"

export type YeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceiptStatus = "ready"

export type YeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceiptBlockingReasonCode =
  | "operator_archival_completion_acknowledgement_receipt_index_not_ready"
  | "operator_archival_completion_acknowledgement_ref_invalid"
  | "operator_archival_completion_acknowledgement_product_log_evidence_ref_invalid"
  | "operator_archival_completion_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceiptInput {
  finalArchivalCompletionIndex: YeonjangBrowserActiveTabInfoFinalArchivalCompletionIndex
  sanitizedArchivalCompletionAcknowledgementRef: string
  productLogEvidenceRef: string
  operatorArchivalCompletionAcknowledgementRef: string
}

export type YeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceipt = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-archival-completion-acknowledgement-receipt.v1"
  method: "browser.active_tab_info"
  status: "operator_archival_completion_acknowledgement_receipt_ready" | "blocked"
  reasonCode:
    | "active_tab_info_operator_archival_completion_acknowledgement_receipt_ready"
    | "active_tab_info_operator_archival_completion_acknowledgement_receipt_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceiptBlockingReasonCode[]
  receipt?: Readonly<{
    operatorArchivalCompletionAcknowledgementReceiptId: string
    finalArchivalCompletionIndexId: string
    sanitizedArchivalCompletionAcknowledgementRef: string
    productLogEvidenceRef: string
    operatorArchivalCompletionAcknowledgementRef: string
    receiptStatus: YeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceiptStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_ARCHIVAL_COMPLETION_ACKNOWLEDGEMENT_REF_PATTERN =
  /^archival-completion-acknowledgement:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_OPERATOR_ARCHIVAL_COMPLETION_ACK_REF_PATTERN =
  /^operator-archival-completion:active-tab-info:ack:[a-z0-9._:-]+$/u

function extractFinalArchivalCompletionIndexId(
  index: YeonjangBrowserActiveTabInfoFinalArchivalCompletionIndex,
): string | undefined {
  if (index.status !== "final_archival_completion_index_ready" || index.index === undefined) {
    return undefined
  }
  return index.index.finalArchivalCompletionIndexId
}

function buildOperatorArchivalCompletionAcknowledgementReceiptId(input: {
  finalArchivalCompletionIndexId: string
  sanitizedArchivalCompletionAcknowledgementRef: string
  productLogEvidenceRef: string
  operatorArchivalCompletionAcknowledgementRef: string
  receiptStatus: YeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceiptStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.finalArchivalCompletionIndexId,
    input.sanitizedArchivalCompletionAcknowledgementRef,
    input.productLogEvidenceRef,
    input.operatorArchivalCompletionAcknowledgementRef,
    input.receiptStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `operator-archival-completion-acknowledgement-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceipt["status"]
  reasonCode: YeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceipt["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceiptBlockingReasonCode[]
  receipt?: YeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceipt["receipt"]
}): YeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceipt {
  return Object.freeze({
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-archival-completion-acknowledgement-receipt.v1",
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

export function buildYeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceipt(
  input: YeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceiptInput,
): YeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceipt {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceiptBlockingReasonCode[] = []
  const finalArchivalCompletionIndexId =
    extractFinalArchivalCompletionIndexId(input.finalArchivalCompletionIndex)
  if (finalArchivalCompletionIndexId === undefined) {
    blockingReasonCodes.push("operator_archival_completion_acknowledgement_receipt_index_not_ready")
  }
  const sanitizedArchivalCompletionAcknowledgementRef =
    input.sanitizedArchivalCompletionAcknowledgementRef.trim()
  if (!SAFE_ARCHIVAL_COMPLETION_ACKNOWLEDGEMENT_REF_PATTERN.test(sanitizedArchivalCompletionAcknowledgementRef)) {
    blockingReasonCodes.push("operator_archival_completion_acknowledgement_ref_invalid")
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push("operator_archival_completion_acknowledgement_product_log_evidence_ref_invalid")
  }
  const operatorArchivalCompletionAcknowledgementRef =
    input.operatorArchivalCompletionAcknowledgementRef.trim()
  if (!SAFE_OPERATOR_ARCHIVAL_COMPLETION_ACK_REF_PATTERN.test(operatorArchivalCompletionAcknowledgementRef)) {
    blockingReasonCodes.push("operator_archival_completion_ack_ref_invalid")
  }

  if (blockingReasonCodes.length > 0 || finalArchivalCompletionIndexId === undefined) {
    return baseResult({
      status: "blocked",
      reasonCode: "active_tab_info_operator_archival_completion_acknowledgement_receipt_blocked",
      blockingReasonCodes,
    })
  }

  const receiptStatus = "ready"
  return baseResult({
    status: "operator_archival_completion_acknowledgement_receipt_ready",
    reasonCode: "active_tab_info_operator_archival_completion_acknowledgement_receipt_ready",
    receipt: Object.freeze({
      operatorArchivalCompletionAcknowledgementReceiptId:
        buildOperatorArchivalCompletionAcknowledgementReceiptId({
          finalArchivalCompletionIndexId,
          sanitizedArchivalCompletionAcknowledgementRef,
          productLogEvidenceRef,
          operatorArchivalCompletionAcknowledgementRef,
          receiptStatus,
        }),
      finalArchivalCompletionIndexId,
      sanitizedArchivalCompletionAcknowledgementRef,
      productLogEvidenceRef,
      operatorArchivalCompletionAcknowledgementRef,
      receiptStatus,
    }),
  })
}
