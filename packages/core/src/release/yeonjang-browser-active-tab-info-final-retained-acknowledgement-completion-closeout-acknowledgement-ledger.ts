import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceipt,
} from "./yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-closeout-acknowledgement-receipt.js"

export type YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerStatus =
  "ready"

export type YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerBlockingReasonCode =
  | "final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_receipt_not_ready"
  | "final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_ref_invalid"
  | "final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_product_log_evidence_ref_invalid"
  | "final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerInput {
  operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceipt: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceipt
  sanitizedFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerRef: string
  productLogEvidenceRef: string
  finalRetainedAcknowledgementCompletionCloseoutAcknowledgementRef: string
}

export type YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedger = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-closeout-acknowledgement-ledger.v1"
  method: "browser.active_tab_info"
  status:
    | "final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_ready"
    | "blocked"
  reasonCode:
    | "active_tab_info_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_ready"
    | "active_tab_info_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerBlockingReasonCode[]
  ledger?: Readonly<{
    finalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerId: string
    operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceiptId: string
    sanitizedFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerRef: string
    productLogEvidenceRef: string
    finalRetainedAcknowledgementCompletionCloseoutAcknowledgementRef: string
    ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_LEDGER_REF_PATTERN =
  /^final-retained-acknowledgement-completion-closeout-acknowledgement-ledger:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_REF_PATTERN =
  /^final-retained-acknowledgement-completion-closeout-acknowledgement:active-tab-info:ack:[a-z0-9._:-]+$/u

function extractOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceiptId(
  receipt: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceipt,
): string | undefined {
  if (
    receipt.status !==
      "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_receipt_ready" ||
    receipt.receipt === undefined
  ) {
    return undefined
  }
  return receipt.receipt.operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceiptId
}

function buildFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerId(input: {
  operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceiptId: string
  sanitizedFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerRef: string
  productLogEvidenceRef: string
  finalRetainedAcknowledgementCompletionCloseoutAcknowledgementRef: string
  ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceiptId,
    input.sanitizedFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerRef,
    input.productLogEvidenceRef,
    input.finalRetainedAcknowledgementCompletionCloseoutAcknowledgementRef,
    input.ledgerStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `final-retained-acknowledgement-completion-closeout-acknowledgement-ledger:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedger["status"]
  reasonCode: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedger["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerBlockingReasonCode[]
  ledger?: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedger["ledger"]
}): YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedger {
  return Object.freeze({
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-closeout-acknowledgement-ledger.v1",
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

export function buildYeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedger(
  input: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerInput,
): YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedger {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerBlockingReasonCode[] = []
  const operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceiptId =
    extractOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceiptId(
      input.operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceipt,
    )
  if (operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceiptId === undefined) {
    blockingReasonCodes.push(
      "final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_receipt_not_ready",
    )
  }
  const sanitizedFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerRef =
    input.sanitizedFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerRef.trim()
  if (!SAFE_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_LEDGER_REF_PATTERN.test(sanitizedFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerRef)) {
    blockingReasonCodes.push(
      "final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_ref_invalid",
    )
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push(
      "final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_product_log_evidence_ref_invalid",
    )
  }
  const finalRetainedAcknowledgementCompletionCloseoutAcknowledgementRef =
    input.finalRetainedAcknowledgementCompletionCloseoutAcknowledgementRef.trim()
  if (!SAFE_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_REF_PATTERN.test(finalRetainedAcknowledgementCompletionCloseoutAcknowledgementRef)) {
    blockingReasonCodes.push(
      "final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_ack_ref_invalid",
    )
  }

  if (
    blockingReasonCodes.length > 0 ||
    operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceiptId === undefined
  ) {
    return baseResult({
      status: "blocked",
      reasonCode:
        "active_tab_info_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_blocked",
      blockingReasonCodes,
    })
  }

  const ledgerStatus = "ready"
  return baseResult({
    status:
      "final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_ready",
    reasonCode:
      "active_tab_info_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_ready",
    ledger: Object.freeze({
      finalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerId:
        buildFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerId({
          operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceiptId,
          sanitizedFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerRef,
          productLogEvidenceRef,
          finalRetainedAcknowledgementCompletionCloseoutAcknowledgementRef,
          ledgerStatus,
        }),
      operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceiptId,
      sanitizedFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerRef,
      productLogEvidenceRef,
      finalRetainedAcknowledgementCompletionCloseoutAcknowledgementRef,
      ledgerStatus,
    }),
  })
}
