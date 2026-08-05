import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedger,
} from "./yeonjang-browser-active-tab-info-final-retained-seal-closeout-ledger.js"

export type YeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceiptStatus =
  "ready"

export type YeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceiptBlockingReasonCode =
  | "operator_retained_closeout_acknowledgement_receipt_ledger_not_ready"
  | "operator_retained_closeout_acknowledgement_receipt_ref_invalid"
  | "operator_retained_closeout_acknowledgement_receipt_product_log_evidence_ref_invalid"
  | "operator_retained_closeout_acknowledgement_receipt_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceiptInput {
  finalRetainedSealCloseoutLedger: YeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedger
  sanitizedOperatorRetainedCloseoutAcknowledgementReceiptRef: string
  productLogEvidenceRef: string
  operatorRetainedCloseoutAcknowledgementRef: string
}

export type YeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceipt = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-retained-closeout-acknowledgement-receipt.v1"
  method: "browser.active_tab_info"
  status: "operator_retained_closeout_acknowledgement_receipt_ready" | "blocked"
  reasonCode:
    | "active_tab_info_operator_retained_closeout_acknowledgement_receipt_ready"
    | "active_tab_info_operator_retained_closeout_acknowledgement_receipt_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceiptBlockingReasonCode[]
  receipt?: Readonly<{
    operatorRetainedCloseoutAcknowledgementReceiptId: string
    finalRetainedSealCloseoutLedgerId: string
    sanitizedOperatorRetainedCloseoutAcknowledgementReceiptRef: string
    productLogEvidenceRef: string
    operatorRetainedCloseoutAcknowledgementRef: string
    receiptStatus: YeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceiptStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_OPERATOR_RETAINED_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN =
  /^operator-retained-closeout-acknowledgement-receipt:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_OPERATOR_RETAINED_CLOSEOUT_ACKNOWLEDGEMENT_REF_PATTERN =
  /^operator-retained-closeout:active-tab-info:ack:[a-z0-9._:-]+$/u

function extractFinalRetainedSealCloseoutLedgerId(
  ledger: YeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedger,
): string | undefined {
  if (
    ledger.status !== "final_retained_seal_closeout_ledger_ready" ||
    ledger.ledger === undefined
  ) {
    return undefined
  }
  return ledger.ledger.finalRetainedSealCloseoutLedgerId
}

function buildOperatorRetainedCloseoutAcknowledgementReceiptId(input: {
  finalRetainedSealCloseoutLedgerId: string
  sanitizedOperatorRetainedCloseoutAcknowledgementReceiptRef: string
  productLogEvidenceRef: string
  operatorRetainedCloseoutAcknowledgementRef: string
  receiptStatus: YeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceiptStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.finalRetainedSealCloseoutLedgerId,
    input.sanitizedOperatorRetainedCloseoutAcknowledgementReceiptRef,
    input.productLogEvidenceRef,
    input.operatorRetainedCloseoutAcknowledgementRef,
    input.receiptStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `operator-retained-closeout-acknowledgement-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceipt["status"]
  reasonCode: YeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceipt["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceiptBlockingReasonCode[]
  receipt?: YeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceipt["receipt"]
}): YeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceipt {
  return Object.freeze({
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-operator-retained-closeout-acknowledgement-receipt.v1",
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

export function buildYeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceipt(
  input: YeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceiptInput,
): YeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceipt {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceiptBlockingReasonCode[] = []
  const finalRetainedSealCloseoutLedgerId =
    extractFinalRetainedSealCloseoutLedgerId(
      input.finalRetainedSealCloseoutLedger,
    )
  if (finalRetainedSealCloseoutLedgerId === undefined) {
    blockingReasonCodes.push(
      "operator_retained_closeout_acknowledgement_receipt_ledger_not_ready",
    )
  }
  const sanitizedOperatorRetainedCloseoutAcknowledgementReceiptRef =
    input.sanitizedOperatorRetainedCloseoutAcknowledgementReceiptRef.trim()
  if (!SAFE_OPERATOR_RETAINED_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN.test(sanitizedOperatorRetainedCloseoutAcknowledgementReceiptRef)) {
    blockingReasonCodes.push(
      "operator_retained_closeout_acknowledgement_receipt_ref_invalid",
    )
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push(
      "operator_retained_closeout_acknowledgement_receipt_product_log_evidence_ref_invalid",
    )
  }
  const operatorRetainedCloseoutAcknowledgementRef =
    input.operatorRetainedCloseoutAcknowledgementRef.trim()
  if (!SAFE_OPERATOR_RETAINED_CLOSEOUT_ACKNOWLEDGEMENT_REF_PATTERN.test(operatorRetainedCloseoutAcknowledgementRef)) {
    blockingReasonCodes.push(
      "operator_retained_closeout_acknowledgement_receipt_ack_ref_invalid",
    )
  }

  if (
    blockingReasonCodes.length > 0 ||
    finalRetainedSealCloseoutLedgerId === undefined
  ) {
    return baseResult({
      status: "blocked",
      reasonCode:
        "active_tab_info_operator_retained_closeout_acknowledgement_receipt_blocked",
      blockingReasonCodes,
    })
  }

  const receiptStatus = "ready"
  return baseResult({
    status: "operator_retained_closeout_acknowledgement_receipt_ready",
    reasonCode:
      "active_tab_info_operator_retained_closeout_acknowledgement_receipt_ready",
    receipt: Object.freeze({
      operatorRetainedCloseoutAcknowledgementReceiptId:
        buildOperatorRetainedCloseoutAcknowledgementReceiptId({
          finalRetainedSealCloseoutLedgerId,
          sanitizedOperatorRetainedCloseoutAcknowledgementReceiptRef,
          productLogEvidenceRef,
          operatorRetainedCloseoutAcknowledgementRef,
          receiptStatus,
        }),
      finalRetainedSealCloseoutLedgerId,
      sanitizedOperatorRetainedCloseoutAcknowledgementReceiptRef,
      productLogEvidenceRef,
      operatorRetainedCloseoutAcknowledgementRef,
      receiptStatus,
    }),
  })
}
