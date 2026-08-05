import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoFinalRetentionClosureLedger,
} from "./yeonjang-browser-active-tab-info-final-retention-closure-ledger.js"

export type YeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceiptStatus = "ready"

export type YeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceiptBlockingReasonCode =
  | "operator_final_retention_acknowledgement_receipt_ledger_not_ready"
  | "operator_final_retention_acknowledgement_receipt_ref_invalid"
  | "operator_final_retention_acknowledgement_receipt_product_log_evidence_ref_invalid"
  | "operator_final_retention_acknowledgement_receipt_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceiptInput {
  finalRetentionClosureLedger: YeonjangBrowserActiveTabInfoFinalRetentionClosureLedger
  sanitizedOperatorFinalRetentionAcknowledgementReceiptRef: string
  productLogEvidenceRef: string
  operatorFinalRetentionAcknowledgementRef: string
}

export type YeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceipt = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-retention-acknowledgement-receipt.v1"
  method: "browser.active_tab_info"
  status: "operator_final_retention_acknowledgement_receipt_ready" | "blocked"
  reasonCode:
    | "active_tab_info_operator_final_retention_acknowledgement_receipt_ready"
    | "active_tab_info_operator_final_retention_acknowledgement_receipt_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceiptBlockingReasonCode[]
  receipt?: Readonly<{
    operatorFinalRetentionAcknowledgementReceiptId: string
    finalRetentionClosureLedgerId: string
    sanitizedOperatorFinalRetentionAcknowledgementReceiptRef: string
    productLogEvidenceRef: string
    operatorFinalRetentionAcknowledgementRef: string
    receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceiptStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_OPERATOR_FINAL_RETENTION_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN =
  /^operator-final-retention-acknowledgement-receipt:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_OPERATOR_FINAL_RETENTION_ACKNOWLEDGEMENT_REF_PATTERN =
  /^operator-final-retention-acknowledgement:active-tab-info:ack:[a-z0-9._:-]+$/u

function extractFinalRetentionClosureLedgerId(
  ledger: YeonjangBrowserActiveTabInfoFinalRetentionClosureLedger,
): string | undefined {
  if (
    ledger.status !== "final_retention_closure_ledger_ready" ||
    ledger.ledger === undefined
  ) {
    return undefined
  }
  return ledger.ledger.finalRetentionClosureLedgerId
}

function buildOperatorFinalRetentionAcknowledgementReceiptId(input: {
  finalRetentionClosureLedgerId: string
  sanitizedOperatorFinalRetentionAcknowledgementReceiptRef: string
  productLogEvidenceRef: string
  operatorFinalRetentionAcknowledgementRef: string
  receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceiptStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.finalRetentionClosureLedgerId,
    input.sanitizedOperatorFinalRetentionAcknowledgementReceiptRef,
    input.productLogEvidenceRef,
    input.operatorFinalRetentionAcknowledgementRef,
    input.receiptStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `operator-final-retention-acknowledgement-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceipt["status"]
  reasonCode: YeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceipt["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceiptBlockingReasonCode[]
  receipt?: YeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceipt["receipt"]
}): YeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceipt {
  return Object.freeze({
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-operator-final-retention-acknowledgement-receipt.v1",
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

export function buildYeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceipt(
  input: YeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceiptInput,
): YeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceipt {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceiptBlockingReasonCode[] = []
  const finalRetentionClosureLedgerId =
    extractFinalRetentionClosureLedgerId(input.finalRetentionClosureLedger)
  if (finalRetentionClosureLedgerId === undefined) {
    blockingReasonCodes.push("operator_final_retention_acknowledgement_receipt_ledger_not_ready")
  }
  const sanitizedOperatorFinalRetentionAcknowledgementReceiptRef =
    input.sanitizedOperatorFinalRetentionAcknowledgementReceiptRef.trim()
  if (!SAFE_OPERATOR_FINAL_RETENTION_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN.test(sanitizedOperatorFinalRetentionAcknowledgementReceiptRef)) {
    blockingReasonCodes.push("operator_final_retention_acknowledgement_receipt_ref_invalid")
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push("operator_final_retention_acknowledgement_receipt_product_log_evidence_ref_invalid")
  }
  const operatorFinalRetentionAcknowledgementRef =
    input.operatorFinalRetentionAcknowledgementRef.trim()
  if (!SAFE_OPERATOR_FINAL_RETENTION_ACKNOWLEDGEMENT_REF_PATTERN.test(operatorFinalRetentionAcknowledgementRef)) {
    blockingReasonCodes.push("operator_final_retention_acknowledgement_receipt_ack_ref_invalid")
  }

  if (blockingReasonCodes.length > 0 || finalRetentionClosureLedgerId === undefined) {
    return baseResult({
      status: "blocked",
      reasonCode:
        "active_tab_info_operator_final_retention_acknowledgement_receipt_blocked",
      blockingReasonCodes,
    })
  }

  const receiptStatus = "ready"
  return baseResult({
    status: "operator_final_retention_acknowledgement_receipt_ready",
    reasonCode:
      "active_tab_info_operator_final_retention_acknowledgement_receipt_ready",
    receipt: Object.freeze({
      operatorFinalRetentionAcknowledgementReceiptId:
        buildOperatorFinalRetentionAcknowledgementReceiptId({
          finalRetentionClosureLedgerId,
          sanitizedOperatorFinalRetentionAcknowledgementReceiptRef,
          productLogEvidenceRef,
          operatorFinalRetentionAcknowledgementRef,
          receiptStatus,
        }),
      finalRetentionClosureLedgerId,
      sanitizedOperatorFinalRetentionAcknowledgementReceiptRef,
      productLogEvidenceRef,
      operatorFinalRetentionAcknowledgementRef,
      receiptStatus,
    }),
  })
}
