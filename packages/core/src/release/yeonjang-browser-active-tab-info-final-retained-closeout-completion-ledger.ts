import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceipt,
} from "./yeonjang-browser-active-tab-info-operator-final-retained-closeout-acknowledgement-receipt.js"

export type YeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedgerStatus =
  "ready"

export type YeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedgerBlockingReasonCode =
  | "final_retained_closeout_completion_ledger_receipt_not_ready"
  | "final_retained_closeout_completion_ledger_ref_invalid"
  | "final_retained_closeout_completion_ledger_product_log_evidence_ref_invalid"
  | "final_retained_closeout_completion_ledger_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedgerInput {
  operatorFinalRetainedCloseoutAcknowledgementReceipt: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceipt
  sanitizedFinalRetainedCloseoutCompletionLedgerRef: string
  productLogEvidenceRef: string
  finalRetainedCloseoutCompletionRef: string
}

export type YeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedger = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-closeout-completion-ledger.v1"
  method: "browser.active_tab_info"
  status: "final_retained_closeout_completion_ledger_ready" | "blocked"
  reasonCode:
    | "active_tab_info_final_retained_closeout_completion_ledger_ready"
    | "active_tab_info_final_retained_closeout_completion_ledger_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedgerBlockingReasonCode[]
  ledger?: Readonly<{
    finalRetainedCloseoutCompletionLedgerId: string
    operatorFinalRetainedCloseoutAcknowledgementReceiptId: string
    sanitizedFinalRetainedCloseoutCompletionLedgerRef: string
    productLogEvidenceRef: string
    finalRetainedCloseoutCompletionRef: string
    ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedgerStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_FINAL_RETAINED_CLOSEOUT_COMPLETION_LEDGER_REF_PATTERN =
  /^final-retained-closeout-completion-ledger:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_FINAL_RETAINED_CLOSEOUT_COMPLETION_REF_PATTERN =
  /^final-retained-closeout-completion:active-tab-info:ack:[a-z0-9._:-]+$/u

function extractOperatorFinalRetainedCloseoutAcknowledgementReceiptId(
  receipt: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceipt,
): string | undefined {
  if (
    receipt.status !== "operator_final_retained_closeout_acknowledgement_receipt_ready" ||
    receipt.receipt === undefined
  ) {
    return undefined
  }
  return receipt.receipt.operatorFinalRetainedCloseoutAcknowledgementReceiptId
}

function buildFinalRetainedCloseoutCompletionLedgerId(input: {
  operatorFinalRetainedCloseoutAcknowledgementReceiptId: string
  sanitizedFinalRetainedCloseoutCompletionLedgerRef: string
  productLogEvidenceRef: string
  finalRetainedCloseoutCompletionRef: string
  ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedgerStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.operatorFinalRetainedCloseoutAcknowledgementReceiptId,
    input.sanitizedFinalRetainedCloseoutCompletionLedgerRef,
    input.productLogEvidenceRef,
    input.finalRetainedCloseoutCompletionRef,
    input.ledgerStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `final-retained-closeout-completion-ledger:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedger["status"]
  reasonCode: YeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedger["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedgerBlockingReasonCode[]
  ledger?: YeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedger["ledger"]
}): YeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedger {
  return Object.freeze({
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-final-retained-closeout-completion-ledger.v1",
    method: "browser.active_tab_info",
    status: input.status,
    reasonCode: input.reasonCode,
    ...(input.blockingReasonCodes === undefined
      ? {}
      : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
    ...(input.ledger === undefined ? {} : { ledger: input.ledger }),
    releaseReadinessNow: false,
    publicationReadinessNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
  })
}

export function buildYeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedger(
  input: YeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedgerInput,
): YeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedger {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedgerBlockingReasonCode[] = []
  const operatorFinalRetainedCloseoutAcknowledgementReceiptId =
    extractOperatorFinalRetainedCloseoutAcknowledgementReceiptId(
      input.operatorFinalRetainedCloseoutAcknowledgementReceipt,
    )
  if (operatorFinalRetainedCloseoutAcknowledgementReceiptId === undefined) {
    blockingReasonCodes.push(
      "final_retained_closeout_completion_ledger_receipt_not_ready",
    )
  }
  const sanitizedFinalRetainedCloseoutCompletionLedgerRef =
    input.sanitizedFinalRetainedCloseoutCompletionLedgerRef.trim()
  if (!SAFE_FINAL_RETAINED_CLOSEOUT_COMPLETION_LEDGER_REF_PATTERN.test(sanitizedFinalRetainedCloseoutCompletionLedgerRef)) {
    blockingReasonCodes.push(
      "final_retained_closeout_completion_ledger_ref_invalid",
    )
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push(
      "final_retained_closeout_completion_ledger_product_log_evidence_ref_invalid",
    )
  }
  const finalRetainedCloseoutCompletionRef =
    input.finalRetainedCloseoutCompletionRef.trim()
  if (!SAFE_FINAL_RETAINED_CLOSEOUT_COMPLETION_REF_PATTERN.test(finalRetainedCloseoutCompletionRef)) {
    blockingReasonCodes.push(
      "final_retained_closeout_completion_ledger_ack_ref_invalid",
    )
  }

  if (
    blockingReasonCodes.length > 0 ||
    operatorFinalRetainedCloseoutAcknowledgementReceiptId === undefined
  ) {
    return baseResult({
      status: "blocked",
      reasonCode:
        "active_tab_info_final_retained_closeout_completion_ledger_blocked",
      blockingReasonCodes,
    })
  }

  const ledgerStatus = "ready"
  return baseResult({
    status: "final_retained_closeout_completion_ledger_ready",
    reasonCode:
      "active_tab_info_final_retained_closeout_completion_ledger_ready",
    ledger: Object.freeze({
      finalRetainedCloseoutCompletionLedgerId:
        buildFinalRetainedCloseoutCompletionLedgerId({
          operatorFinalRetainedCloseoutAcknowledgementReceiptId,
          sanitizedFinalRetainedCloseoutCompletionLedgerRef,
          productLogEvidenceRef,
          finalRetainedCloseoutCompletionRef,
          ledgerStatus,
        }),
      operatorFinalRetainedCloseoutAcknowledgementReceiptId,
      sanitizedFinalRetainedCloseoutCompletionLedgerRef,
      productLogEvidenceRef,
      finalRetainedCloseoutCompletionRef,
      ledgerStatus,
    }),
  })
}
