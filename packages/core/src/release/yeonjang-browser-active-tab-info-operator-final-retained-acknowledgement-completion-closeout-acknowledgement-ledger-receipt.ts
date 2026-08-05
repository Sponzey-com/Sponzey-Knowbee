import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedger,
} from "./yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-closeout-acknowledgement-ledger.js"

export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptStatus =
  "ready"

export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptBlockingReasonCode =
  | "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_receipt_ledger_not_ready"
  | "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_receipt_ref_invalid"
  | "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_receipt_product_log_evidence_ref_invalid"
  | "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_receipt_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptInput {
  finalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedger: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedger
  sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptRef: string
  productLogEvidenceRef: string
  operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerRef: string
}

export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceipt = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-closeout-acknowledgement-ledger-receipt.v1"
  method: "browser.active_tab_info"
  status:
    | "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_receipt_ready"
    | "blocked"
  reasonCode:
    | "active_tab_info_operator_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_receipt_ready"
    | "active_tab_info_operator_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_receipt_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptBlockingReasonCode[]
  receipt?: Readonly<{
    operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptId: string
    finalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerId: string
    sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptRef: string
    productLogEvidenceRef: string
    operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerRef: string
    receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_LEDGER_RECEIPT_REF_PATTERN =
  /^operator-final-retained-acknowledgement-completion-closeout-acknowledgement-ledger-receipt:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_LEDGER_REF_PATTERN =
  /^operator-final-retained-acknowledgement-completion-closeout-acknowledgement-ledger:active-tab-info:ack:[a-z0-9._:-]+$/u

function extractFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerId(
  ledger: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedger,
): string | undefined {
  if (
    ledger.status !==
      "final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_ready" ||
    ledger.ledger === undefined
  ) {
    return undefined
  }
  return ledger.ledger.finalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerId
}

function buildOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptId(input: {
  finalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerId: string
  sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptRef: string
  productLogEvidenceRef: string
  operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerRef: string
  receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.finalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerId,
    input.sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptRef,
    input.productLogEvidenceRef,
    input.operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerRef,
    input.receiptStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `operator-final-retained-acknowledgement-completion-closeout-acknowledgement-ledger-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceipt["status"]
  reasonCode: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceipt["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptBlockingReasonCode[]
  receipt?: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceipt["receipt"]
}): YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceipt {
  return Object.freeze({
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-closeout-acknowledgement-ledger-receipt.v1",
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

export function buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceipt(
  input: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptInput,
): YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceipt {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptBlockingReasonCode[] = []
  const finalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerId =
    extractFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerId(
      input.finalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedger,
    )
  if (finalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerId === undefined) {
    blockingReasonCodes.push(
      "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_receipt_ledger_not_ready",
    )
  }
  const sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptRef =
    input.sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptRef.trim()
  if (!SAFE_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_LEDGER_RECEIPT_REF_PATTERN.test(sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptRef)) {
    blockingReasonCodes.push(
      "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_receipt_ref_invalid",
    )
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push(
      "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_receipt_product_log_evidence_ref_invalid",
    )
  }
  const operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerRef =
    input.operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerRef.trim()
  if (!SAFE_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_LEDGER_REF_PATTERN.test(operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerRef)) {
    blockingReasonCodes.push(
      "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_receipt_ack_ref_invalid",
    )
  }

  if (
    blockingReasonCodes.length > 0 ||
    finalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerId === undefined
  ) {
    return baseResult({
      status: "blocked",
      reasonCode:
        "active_tab_info_operator_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_receipt_blocked",
      blockingReasonCodes,
    })
  }

  const receiptStatus = "ready"
  return baseResult({
    status:
      "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_receipt_ready",
    reasonCode:
      "active_tab_info_operator_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_receipt_ready",
    receipt: Object.freeze({
      operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptId:
        buildOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptId({
          finalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerId,
          sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptRef,
          productLogEvidenceRef,
          operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerRef,
          receiptStatus,
        }),
      finalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerId,
      sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptRef,
      productLogEvidenceRef,
      operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerRef,
      receiptStatus,
    }),
  })
}
