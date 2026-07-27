import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceipt,
} from "./yeonjang-browser-active-tab-info-operator-final-retained-completion-closeout-acknowledgement-receipt.js"

export type YeonjangBrowserActiveTabInfoFinalRetainedCloseoutSealedLedgerStatus =
  "ready"

export type YeonjangBrowserActiveTabInfoFinalRetainedCloseoutSealedLedgerBlockingReasonCode =
  | "final_retained_closeout_sealed_ledger_receipt_not_ready"
  | "final_retained_closeout_sealed_ledger_ref_invalid"
  | "final_retained_closeout_sealed_ledger_product_log_evidence_ref_invalid"
  | "final_retained_closeout_sealed_ledger_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoFinalRetainedCloseoutSealedLedgerInput {
  operatorFinalRetainedCompletionCloseoutAcknowledgementReceipt: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceipt
  sanitizedFinalRetainedCloseoutSealedLedgerRef: string
  productLogEvidenceRef: string
  finalRetainedCloseoutSealedRef: string
}

export type YeonjangBrowserActiveTabInfoFinalRetainedCloseoutSealedLedger = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-closeout-sealed-ledger.v1"
  method: "browser.active_tab_info"
  status: "final_retained_closeout_sealed_ledger_ready" | "blocked"
  reasonCode:
    | "active_tab_info_final_retained_closeout_sealed_ledger_ready"
    | "active_tab_info_final_retained_closeout_sealed_ledger_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedCloseoutSealedLedgerBlockingReasonCode[]
  ledger?: Readonly<{
    finalRetainedCloseoutSealedLedgerId: string
    operatorFinalRetainedCompletionCloseoutAcknowledgementReceiptId: string
    sanitizedFinalRetainedCloseoutSealedLedgerRef: string
    productLogEvidenceRef: string
    finalRetainedCloseoutSealedRef: string
    ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedCloseoutSealedLedgerStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_FINAL_RETAINED_CLOSEOUT_SEALED_LEDGER_REF_PATTERN =
  /^final-retained-closeout-sealed-ledger:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_FINAL_RETAINED_CLOSEOUT_SEALED_REF_PATTERN =
  /^final-retained-closeout-sealed:active-tab-info:ack:[a-z0-9._:-]+$/u

function extractOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptId(
  receipt: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceipt,
): string | undefined {
  if (
    receipt.status !==
      "operator_final_retained_completion_closeout_acknowledgement_receipt_ready" ||
    receipt.receipt === undefined
  ) {
    return undefined
  }
  return receipt.receipt.operatorFinalRetainedCompletionCloseoutAcknowledgementReceiptId
}

function buildFinalRetainedCloseoutSealedLedgerId(input: {
  operatorFinalRetainedCompletionCloseoutAcknowledgementReceiptId: string
  sanitizedFinalRetainedCloseoutSealedLedgerRef: string
  productLogEvidenceRef: string
  finalRetainedCloseoutSealedRef: string
  ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedCloseoutSealedLedgerStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.operatorFinalRetainedCompletionCloseoutAcknowledgementReceiptId,
    input.sanitizedFinalRetainedCloseoutSealedLedgerRef,
    input.productLogEvidenceRef,
    input.finalRetainedCloseoutSealedRef,
    input.ledgerStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `final-retained-closeout-sealed-ledger:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoFinalRetainedCloseoutSealedLedger["status"]
  reasonCode: YeonjangBrowserActiveTabInfoFinalRetainedCloseoutSealedLedger["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedCloseoutSealedLedgerBlockingReasonCode[]
  ledger?: YeonjangBrowserActiveTabInfoFinalRetainedCloseoutSealedLedger["ledger"]
}): YeonjangBrowserActiveTabInfoFinalRetainedCloseoutSealedLedger {
  return Object.freeze({
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-final-retained-closeout-sealed-ledger.v1",
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

export function buildYeonjangBrowserActiveTabInfoFinalRetainedCloseoutSealedLedger(
  input: YeonjangBrowserActiveTabInfoFinalRetainedCloseoutSealedLedgerInput,
): YeonjangBrowserActiveTabInfoFinalRetainedCloseoutSealedLedger {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoFinalRetainedCloseoutSealedLedgerBlockingReasonCode[] = []
  const operatorFinalRetainedCompletionCloseoutAcknowledgementReceiptId =
    extractOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptId(
      input.operatorFinalRetainedCompletionCloseoutAcknowledgementReceipt,
    )
  if (
    operatorFinalRetainedCompletionCloseoutAcknowledgementReceiptId ===
    undefined
  ) {
    blockingReasonCodes.push(
      "final_retained_closeout_sealed_ledger_receipt_not_ready",
    )
  }
  const sanitizedFinalRetainedCloseoutSealedLedgerRef =
    input.sanitizedFinalRetainedCloseoutSealedLedgerRef.trim()
  if (!SAFE_FINAL_RETAINED_CLOSEOUT_SEALED_LEDGER_REF_PATTERN.test(sanitizedFinalRetainedCloseoutSealedLedgerRef)) {
    blockingReasonCodes.push("final_retained_closeout_sealed_ledger_ref_invalid")
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push(
      "final_retained_closeout_sealed_ledger_product_log_evidence_ref_invalid",
    )
  }
  const finalRetainedCloseoutSealedRef =
    input.finalRetainedCloseoutSealedRef.trim()
  if (!SAFE_FINAL_RETAINED_CLOSEOUT_SEALED_REF_PATTERN.test(finalRetainedCloseoutSealedRef)) {
    blockingReasonCodes.push(
      "final_retained_closeout_sealed_ledger_ack_ref_invalid",
    )
  }

  if (
    blockingReasonCodes.length > 0 ||
    operatorFinalRetainedCompletionCloseoutAcknowledgementReceiptId === undefined
  ) {
    return baseResult({
      status: "blocked",
      reasonCode: "active_tab_info_final_retained_closeout_sealed_ledger_blocked",
      blockingReasonCodes,
    })
  }

  const ledgerStatus = "ready"
  return baseResult({
    status: "final_retained_closeout_sealed_ledger_ready",
    reasonCode: "active_tab_info_final_retained_closeout_sealed_ledger_ready",
    ledger: Object.freeze({
      finalRetainedCloseoutSealedLedgerId:
        buildFinalRetainedCloseoutSealedLedgerId({
          operatorFinalRetainedCompletionCloseoutAcknowledgementReceiptId,
          sanitizedFinalRetainedCloseoutSealedLedgerRef,
          productLogEvidenceRef,
          finalRetainedCloseoutSealedRef,
          ledgerStatus,
        }),
      operatorFinalRetainedCompletionCloseoutAcknowledgementReceiptId,
      sanitizedFinalRetainedCloseoutSealedLedgerRef,
      productLogEvidenceRef,
      finalRetainedCloseoutSealedRef,
      ledgerStatus,
    }),
  })
}
