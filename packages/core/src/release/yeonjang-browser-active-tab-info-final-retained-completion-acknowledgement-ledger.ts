import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceipt,
} from "./yeonjang-browser-active-tab-info-operator-retained-completion-acknowledgement-receipt.js"

export type YeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedgerStatus =
  "ready"

export type YeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedgerBlockingReasonCode =
  | "final_retained_completion_acknowledgement_ledger_receipt_not_ready"
  | "final_retained_completion_acknowledgement_ledger_ref_invalid"
  | "final_retained_completion_acknowledgement_ledger_product_log_evidence_ref_invalid"
  | "final_retained_completion_acknowledgement_ledger_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedgerInput {
  operatorRetainedCompletionAcknowledgementReceipt: YeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceipt
  sanitizedFinalRetainedCompletionAcknowledgementLedgerRef: string
  productLogEvidenceRef: string
  finalRetainedCompletionAcknowledgementRef: string
}

export type YeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedger = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-completion-acknowledgement-ledger.v1"
  method: "browser.active_tab_info"
  status:
    | "final_retained_completion_acknowledgement_ledger_ready"
    | "blocked"
  reasonCode:
    | "active_tab_info_final_retained_completion_acknowledgement_ledger_ready"
    | "active_tab_info_final_retained_completion_acknowledgement_ledger_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedgerBlockingReasonCode[]
  ledger?: Readonly<{
    finalRetainedCompletionAcknowledgementLedgerId: string
    operatorRetainedCompletionAcknowledgementReceiptId: string
    sanitizedFinalRetainedCompletionAcknowledgementLedgerRef: string
    productLogEvidenceRef: string
    finalRetainedCompletionAcknowledgementRef: string
    ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedgerStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_FINAL_RETAINED_COMPLETION_ACKNOWLEDGEMENT_LEDGER_REF_PATTERN =
  /^final-retained-completion-acknowledgement-ledger:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_FINAL_RETAINED_COMPLETION_ACKNOWLEDGEMENT_REF_PATTERN =
  /^final-retained-completion:active-tab-info:ack:[a-z0-9._:-]+$/u

function extractOperatorRetainedCompletionAcknowledgementReceiptId(
  receipt: YeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceipt,
): string | undefined {
  if (
    receipt.status !==
      "operator_retained_completion_acknowledgement_receipt_ready" ||
    receipt.receipt === undefined
  ) {
    return undefined
  }
  return receipt.receipt.operatorRetainedCompletionAcknowledgementReceiptId
}

function buildFinalRetainedCompletionAcknowledgementLedgerId(input: {
  operatorRetainedCompletionAcknowledgementReceiptId: string
  sanitizedFinalRetainedCompletionAcknowledgementLedgerRef: string
  productLogEvidenceRef: string
  finalRetainedCompletionAcknowledgementRef: string
  ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedgerStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.operatorRetainedCompletionAcknowledgementReceiptId,
    input.sanitizedFinalRetainedCompletionAcknowledgementLedgerRef,
    input.productLogEvidenceRef,
    input.finalRetainedCompletionAcknowledgementRef,
    input.ledgerStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `final-retained-completion-acknowledgement-ledger:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedger["status"]
  reasonCode: YeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedger["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedgerBlockingReasonCode[]
  ledger?: YeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedger["ledger"]
}): YeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedger {
  return Object.freeze({
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-final-retained-completion-acknowledgement-ledger.v1",
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

export function buildYeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedger(
  input: YeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedgerInput,
): YeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedger {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedgerBlockingReasonCode[] = []
  const operatorRetainedCompletionAcknowledgementReceiptId =
    extractOperatorRetainedCompletionAcknowledgementReceiptId(
      input.operatorRetainedCompletionAcknowledgementReceipt,
    )
  if (operatorRetainedCompletionAcknowledgementReceiptId === undefined) {
    blockingReasonCodes.push(
      "final_retained_completion_acknowledgement_ledger_receipt_not_ready",
    )
  }
  const sanitizedFinalRetainedCompletionAcknowledgementLedgerRef =
    input.sanitizedFinalRetainedCompletionAcknowledgementLedgerRef.trim()
  if (!SAFE_FINAL_RETAINED_COMPLETION_ACKNOWLEDGEMENT_LEDGER_REF_PATTERN.test(sanitizedFinalRetainedCompletionAcknowledgementLedgerRef)) {
    blockingReasonCodes.push(
      "final_retained_completion_acknowledgement_ledger_ref_invalid",
    )
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push(
      "final_retained_completion_acknowledgement_ledger_product_log_evidence_ref_invalid",
    )
  }
  const finalRetainedCompletionAcknowledgementRef =
    input.finalRetainedCompletionAcknowledgementRef.trim()
  if (!SAFE_FINAL_RETAINED_COMPLETION_ACKNOWLEDGEMENT_REF_PATTERN.test(finalRetainedCompletionAcknowledgementRef)) {
    blockingReasonCodes.push(
      "final_retained_completion_acknowledgement_ledger_ack_ref_invalid",
    )
  }

  if (
    blockingReasonCodes.length > 0 ||
    operatorRetainedCompletionAcknowledgementReceiptId === undefined
  ) {
    return baseResult({
      status: "blocked",
      reasonCode:
        "active_tab_info_final_retained_completion_acknowledgement_ledger_blocked",
      blockingReasonCodes,
    })
  }

  const ledgerStatus = "ready"
  return baseResult({
    status: "final_retained_completion_acknowledgement_ledger_ready",
    reasonCode:
      "active_tab_info_final_retained_completion_acknowledgement_ledger_ready",
    ledger: Object.freeze({
      finalRetainedCompletionAcknowledgementLedgerId:
        buildFinalRetainedCompletionAcknowledgementLedgerId({
          operatorRetainedCompletionAcknowledgementReceiptId,
          sanitizedFinalRetainedCompletionAcknowledgementLedgerRef,
          productLogEvidenceRef,
          finalRetainedCompletionAcknowledgementRef,
          ledgerStatus,
        }),
      operatorRetainedCompletionAcknowledgementReceiptId,
      sanitizedFinalRetainedCompletionAcknowledgementLedgerRef,
      productLogEvidenceRef,
      finalRetainedCompletionAcknowledgementRef,
      ledgerStatus,
    }),
  })
}
