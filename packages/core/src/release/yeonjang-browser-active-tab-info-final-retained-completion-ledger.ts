import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionReceipt,
} from "./yeonjang-browser-active-tab-info-operator-final-retained-completion-receipt.js"

export type YeonjangBrowserActiveTabInfoFinalRetainedCompletionLedgerStatus =
  "ready"

export type YeonjangBrowserActiveTabInfoFinalRetainedCompletionLedgerBlockingReasonCode =
  | "final_retained_completion_ledger_receipt_not_ready"
  | "final_retained_completion_ledger_ref_invalid"
  | "final_retained_completion_ledger_product_log_evidence_ref_invalid"
  | "final_retained_completion_ledger_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoFinalRetainedCompletionLedgerInput {
  operatorFinalRetainedCompletionReceipt: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionReceipt
  sanitizedFinalRetainedCompletionLedgerRef: string
  productLogEvidenceRef: string
  finalRetainedCompletionRef: string
}

export type YeonjangBrowserActiveTabInfoFinalRetainedCompletionLedger = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-completion-ledger.v1"
  method: "browser.active_tab_info"
  status: "final_retained_completion_ledger_ready" | "blocked"
  reasonCode:
    | "active_tab_info_final_retained_completion_ledger_ready"
    | "active_tab_info_final_retained_completion_ledger_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedCompletionLedgerBlockingReasonCode[]
  ledger?: Readonly<{
    finalRetainedCompletionLedgerId: string
    operatorFinalRetainedCompletionReceiptId: string
    sanitizedFinalRetainedCompletionLedgerRef: string
    productLogEvidenceRef: string
    finalRetainedCompletionRef: string
    ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedCompletionLedgerStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_FINAL_RETAINED_COMPLETION_LEDGER_REF_PATTERN =
  /^final-retained-completion-ledger:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_FINAL_RETAINED_COMPLETION_REF_PATTERN =
  /^final-retained-completion:active-tab-info:ack:[a-z0-9._:-]+$/u

function extractOperatorFinalRetainedCompletionReceiptId(
  receipt: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionReceipt,
): string | undefined {
  if (
    receipt.status !== "operator_final_retained_completion_receipt_ready" ||
    receipt.receipt === undefined
  ) {
    return undefined
  }
  return receipt.receipt.operatorFinalRetainedCompletionReceiptId
}

function buildFinalRetainedCompletionLedgerId(input: {
  operatorFinalRetainedCompletionReceiptId: string
  sanitizedFinalRetainedCompletionLedgerRef: string
  productLogEvidenceRef: string
  finalRetainedCompletionRef: string
  ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedCompletionLedgerStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.operatorFinalRetainedCompletionReceiptId,
    input.sanitizedFinalRetainedCompletionLedgerRef,
    input.productLogEvidenceRef,
    input.finalRetainedCompletionRef,
    input.ledgerStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `final-retained-completion-ledger:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoFinalRetainedCompletionLedger["status"]
  reasonCode: YeonjangBrowserActiveTabInfoFinalRetainedCompletionLedger["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedCompletionLedgerBlockingReasonCode[]
  ledger?: YeonjangBrowserActiveTabInfoFinalRetainedCompletionLedger["ledger"]
}): YeonjangBrowserActiveTabInfoFinalRetainedCompletionLedger {
  return Object.freeze({
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-final-retained-completion-ledger.v1",
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

export function buildYeonjangBrowserActiveTabInfoFinalRetainedCompletionLedger(
  input: YeonjangBrowserActiveTabInfoFinalRetainedCompletionLedgerInput,
): YeonjangBrowserActiveTabInfoFinalRetainedCompletionLedger {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoFinalRetainedCompletionLedgerBlockingReasonCode[] = []
  const operatorFinalRetainedCompletionReceiptId =
    extractOperatorFinalRetainedCompletionReceiptId(
      input.operatorFinalRetainedCompletionReceipt,
    )
  if (operatorFinalRetainedCompletionReceiptId === undefined) {
    blockingReasonCodes.push("final_retained_completion_ledger_receipt_not_ready")
  }
  const sanitizedFinalRetainedCompletionLedgerRef =
    input.sanitizedFinalRetainedCompletionLedgerRef.trim()
  if (!SAFE_FINAL_RETAINED_COMPLETION_LEDGER_REF_PATTERN.test(sanitizedFinalRetainedCompletionLedgerRef)) {
    blockingReasonCodes.push("final_retained_completion_ledger_ref_invalid")
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push(
      "final_retained_completion_ledger_product_log_evidence_ref_invalid",
    )
  }
  const finalRetainedCompletionRef = input.finalRetainedCompletionRef.trim()
  if (!SAFE_FINAL_RETAINED_COMPLETION_REF_PATTERN.test(finalRetainedCompletionRef)) {
    blockingReasonCodes.push("final_retained_completion_ledger_ack_ref_invalid")
  }

  if (
    blockingReasonCodes.length > 0 ||
    operatorFinalRetainedCompletionReceiptId === undefined
  ) {
    return baseResult({
      status: "blocked",
      reasonCode: "active_tab_info_final_retained_completion_ledger_blocked",
      blockingReasonCodes,
    })
  }

  const ledgerStatus = "ready"
  return baseResult({
    status: "final_retained_completion_ledger_ready",
    reasonCode: "active_tab_info_final_retained_completion_ledger_ready",
    ledger: Object.freeze({
      finalRetainedCompletionLedgerId: buildFinalRetainedCompletionLedgerId({
        operatorFinalRetainedCompletionReceiptId,
        sanitizedFinalRetainedCompletionLedgerRef,
        productLogEvidenceRef,
        finalRetainedCompletionRef,
        ledgerStatus,
      }),
      operatorFinalRetainedCompletionReceiptId,
      sanitizedFinalRetainedCompletionLedgerRef,
      productLogEvidenceRef,
      finalRetainedCompletionRef,
      ledgerStatus,
    }),
  })
}
