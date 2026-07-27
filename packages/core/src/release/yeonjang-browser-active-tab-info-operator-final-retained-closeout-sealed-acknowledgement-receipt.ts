import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoFinalRetainedCloseoutSealedLedger,
} from "./yeonjang-browser-active-tab-info-final-retained-closeout-sealed-ledger.js"

export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptStatus =
  "ready"

export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptBlockingReasonCode =
  | "operator_final_retained_closeout_sealed_acknowledgement_receipt_ledger_not_ready"
  | "operator_final_retained_closeout_sealed_acknowledgement_receipt_ref_invalid"
  | "operator_final_retained_closeout_sealed_acknowledgement_receipt_product_log_evidence_ref_invalid"
  | "operator_final_retained_closeout_sealed_acknowledgement_receipt_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptInput {
  finalRetainedCloseoutSealedLedger: YeonjangBrowserActiveTabInfoFinalRetainedCloseoutSealedLedger
  sanitizedOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptRef: string
  productLogEvidenceRef: string
  operatorFinalRetainedCloseoutSealedAcknowledgementRef: string
}

export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceipt = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-closeout-sealed-acknowledgement-receipt.v1"
  method: "browser.active_tab_info"
  status:
    | "operator_final_retained_closeout_sealed_acknowledgement_receipt_ready"
    | "blocked"
  reasonCode:
    | "active_tab_info_operator_final_retained_closeout_sealed_acknowledgement_receipt_ready"
    | "active_tab_info_operator_final_retained_closeout_sealed_acknowledgement_receipt_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptBlockingReasonCode[]
  receipt?: Readonly<{
    operatorFinalRetainedCloseoutSealedAcknowledgementReceiptId: string
    finalRetainedCloseoutSealedLedgerId: string
    sanitizedOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptRef: string
    productLogEvidenceRef: string
    operatorFinalRetainedCloseoutSealedAcknowledgementRef: string
    receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_OPERATOR_FINAL_RETAINED_CLOSEOUT_SEALED_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN =
  /^operator-final-retained-closeout-sealed-acknowledgement-receipt:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_OPERATOR_FINAL_RETAINED_CLOSEOUT_SEALED_ACKNOWLEDGEMENT_REF_PATTERN =
  /^operator-final-retained-closeout-sealed:active-tab-info:ack:[a-z0-9._:-]+$/u

function extractFinalRetainedCloseoutSealedLedgerId(
  ledger: YeonjangBrowserActiveTabInfoFinalRetainedCloseoutSealedLedger,
): string | undefined {
  if (
    ledger.status !== "final_retained_closeout_sealed_ledger_ready" ||
    ledger.ledger === undefined
  ) {
    return undefined
  }
  return ledger.ledger.finalRetainedCloseoutSealedLedgerId
}

function buildOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptId(input: {
  finalRetainedCloseoutSealedLedgerId: string
  sanitizedOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptRef: string
  productLogEvidenceRef: string
  operatorFinalRetainedCloseoutSealedAcknowledgementRef: string
  receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.finalRetainedCloseoutSealedLedgerId,
    input.sanitizedOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptRef,
    input.productLogEvidenceRef,
    input.operatorFinalRetainedCloseoutSealedAcknowledgementRef,
    input.receiptStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `operator-final-retained-closeout-sealed-acknowledgement-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceipt["status"]
  reasonCode: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceipt["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptBlockingReasonCode[]
  receipt?: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceipt["receipt"]
}): YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceipt {
  return Object.freeze({
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-closeout-sealed-acknowledgement-receipt.v1",
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

export function buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceipt(
  input: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptInput,
): YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceipt {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptBlockingReasonCode[] = []
  const finalRetainedCloseoutSealedLedgerId =
    extractFinalRetainedCloseoutSealedLedgerId(
      input.finalRetainedCloseoutSealedLedger,
    )
  if (finalRetainedCloseoutSealedLedgerId === undefined) {
    blockingReasonCodes.push(
      "operator_final_retained_closeout_sealed_acknowledgement_receipt_ledger_not_ready",
    )
  }
  const sanitizedOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptRef =
    input.sanitizedOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptRef.trim()
  if (!SAFE_OPERATOR_FINAL_RETAINED_CLOSEOUT_SEALED_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN.test(sanitizedOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptRef)) {
    blockingReasonCodes.push(
      "operator_final_retained_closeout_sealed_acknowledgement_receipt_ref_invalid",
    )
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push(
      "operator_final_retained_closeout_sealed_acknowledgement_receipt_product_log_evidence_ref_invalid",
    )
  }
  const operatorFinalRetainedCloseoutSealedAcknowledgementRef =
    input.operatorFinalRetainedCloseoutSealedAcknowledgementRef.trim()
  if (!SAFE_OPERATOR_FINAL_RETAINED_CLOSEOUT_SEALED_ACKNOWLEDGEMENT_REF_PATTERN.test(operatorFinalRetainedCloseoutSealedAcknowledgementRef)) {
    blockingReasonCodes.push(
      "operator_final_retained_closeout_sealed_acknowledgement_receipt_ack_ref_invalid",
    )
  }

  if (
    blockingReasonCodes.length > 0 ||
    finalRetainedCloseoutSealedLedgerId === undefined
  ) {
    return baseResult({
      status: "blocked",
      reasonCode:
        "active_tab_info_operator_final_retained_closeout_sealed_acknowledgement_receipt_blocked",
      blockingReasonCodes,
    })
  }

  const receiptStatus = "ready"
  return baseResult({
    status:
      "operator_final_retained_closeout_sealed_acknowledgement_receipt_ready",
    reasonCode:
      "active_tab_info_operator_final_retained_closeout_sealed_acknowledgement_receipt_ready",
    receipt: Object.freeze({
      operatorFinalRetainedCloseoutSealedAcknowledgementReceiptId:
        buildOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptId({
          finalRetainedCloseoutSealedLedgerId,
          sanitizedOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptRef,
          productLogEvidenceRef,
          operatorFinalRetainedCloseoutSealedAcknowledgementRef,
          receiptStatus,
        }),
      finalRetainedCloseoutSealedLedgerId,
      sanitizedOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptRef,
      productLogEvidenceRef,
      operatorFinalRetainedCloseoutSealedAcknowledgementRef,
      receiptStatus,
    }),
  })
}
