import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedger,
} from "./yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger.js"

export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceiptStatus =
  "ready"

export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceiptBlockingReasonCode =
  | "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_receipt_ledger_not_ready"
  | "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_receipt_ref_invalid"
  | "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_receipt_product_log_evidence_ref_invalid"
  | "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_receipt_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceiptInput {
  finalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedger: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedger
  sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceiptRef: string
  productLogEvidenceRef: string
  operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerRef: string
}

export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceipt = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger-receipt.v1"
  method: "browser.active_tab_info"
  status:
    | "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_receipt_ready"
    | "blocked"
  reasonCode:
    | "active_tab_info_operator_final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_receipt_ready"
    | "active_tab_info_operator_final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_receipt_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceiptBlockingReasonCode[]
  receipt?: Readonly<{
    operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceiptId: string
    finalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerId: string
    sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceiptRef: string
    productLogEvidenceRef: string
    operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerRef: string
    receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceiptStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_CLOSURE_LEDGER_RECEIPT_REF_PATTERN =
  /^operator-final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger-receipt:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_CLOSURE_LEDGER_REF_PATTERN =
  /^operator-final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger:active-tab-info:ack:[a-z0-9._:-]+$/u

function extractFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerId(
  ledger: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedger,
): string | undefined {
  if (
    ledger.status !==
      "final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_ready" ||
    ledger.ledger === undefined
  ) {
    return undefined
  }
  return ledger.ledger.finalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerId
}

function buildOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceiptId(input: {
  finalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerId: string
  sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceiptRef: string
  productLogEvidenceRef: string
  operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerRef: string
  receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceiptStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.finalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerId,
    input.sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceiptRef,
    input.productLogEvidenceRef,
    input.operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerRef,
    input.receiptStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `operator-final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceipt["status"]
  reasonCode: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceipt["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceiptBlockingReasonCode[]
  receipt?: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceipt["receipt"]
}): YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceipt {
  return Object.freeze({
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger-receipt.v1",
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

export function buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceipt(
  input: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceiptInput,
): YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceipt {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceiptBlockingReasonCode[] = []
  const finalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerId =
    extractFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerId(
      input.finalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedger,
    )
  if (finalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerId === undefined) {
    blockingReasonCodes.push(
      "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_receipt_ledger_not_ready",
    )
  }
  const sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceiptRef =
    input.sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceiptRef.trim()
  if (!SAFE_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_CLOSURE_LEDGER_RECEIPT_REF_PATTERN.test(sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceiptRef)) {
    blockingReasonCodes.push(
      "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_receipt_ref_invalid",
    )
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push(
      "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_receipt_product_log_evidence_ref_invalid",
    )
  }
  const operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerRef =
    input.operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerRef.trim()
  if (!SAFE_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_CLOSURE_LEDGER_REF_PATTERN.test(operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerRef)) {
    blockingReasonCodes.push(
      "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_receipt_ack_ref_invalid",
    )
  }

  if (
    blockingReasonCodes.length > 0 ||
    finalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerId === undefined
  ) {
    return baseResult({
      status: "blocked",
      reasonCode:
        "active_tab_info_operator_final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_receipt_blocked",
      blockingReasonCodes,
    })
  }

  const receiptStatus = "ready"
  return baseResult({
    status:
      "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_receipt_ready",
    reasonCode:
      "active_tab_info_operator_final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_receipt_ready",
    receipt: Object.freeze({
      operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceiptId:
        buildOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceiptId({
          finalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerId,
          sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceiptRef,
          productLogEvidenceRef,
          operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerRef,
          receiptStatus,
        }),
      finalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerId,
      sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceiptRef,
      productLogEvidenceRef,
      operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerRef,
      receiptStatus,
    }),
  })
}
