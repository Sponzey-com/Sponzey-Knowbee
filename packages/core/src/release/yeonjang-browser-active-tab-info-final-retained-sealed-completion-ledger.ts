import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCompletionReceipt,
} from "./yeonjang-browser-active-tab-info-operator-final-retained-sealed-completion-receipt.js"

export type YeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedgerStatus =
  "ready"

export type YeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedgerBlockingReasonCode =
  | "final_retained_sealed_completion_ledger_receipt_not_ready"
  | "final_retained_sealed_completion_ledger_ref_invalid"
  | "final_retained_sealed_completion_ledger_product_log_evidence_ref_invalid"
  | "final_retained_sealed_completion_ledger_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedgerInput {
  operatorFinalRetainedSealedCompletionReceipt: YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCompletionReceipt
  sanitizedFinalRetainedSealedCompletionLedgerRef: string
  productLogEvidenceRef: string
  finalRetainedSealedCompletionRef: string
}

export type YeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedger = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-sealed-completion-ledger.v1"
  method: "browser.active_tab_info"
  status: "final_retained_sealed_completion_ledger_ready" | "blocked"
  reasonCode:
    | "active_tab_info_final_retained_sealed_completion_ledger_ready"
    | "active_tab_info_final_retained_sealed_completion_ledger_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedgerBlockingReasonCode[]
  ledger?: Readonly<{
    finalRetainedSealedCompletionLedgerId: string
    operatorFinalRetainedSealedCompletionReceiptId: string
    sanitizedFinalRetainedSealedCompletionLedgerRef: string
    productLogEvidenceRef: string
    finalRetainedSealedCompletionRef: string
    ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedgerStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_FINAL_RETAINED_SEALED_COMPLETION_LEDGER_REF_PATTERN =
  /^final-retained-sealed-completion-ledger:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_FINAL_RETAINED_SEALED_COMPLETION_REF_PATTERN =
  /^final-retained-sealed-completion:active-tab-info:ack:[a-z0-9._:-]+$/u

function extractOperatorFinalRetainedSealedCompletionReceiptId(
  receipt: YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCompletionReceipt,
): string | undefined {
  if (
    receipt.status !== "operator_final_retained_sealed_completion_receipt_ready" ||
    receipt.receipt === undefined
  ) {
    return undefined
  }
  return receipt.receipt.operatorFinalRetainedSealedCompletionReceiptId
}

function buildFinalRetainedSealedCompletionLedgerId(input: {
  operatorFinalRetainedSealedCompletionReceiptId: string
  sanitizedFinalRetainedSealedCompletionLedgerRef: string
  productLogEvidenceRef: string
  finalRetainedSealedCompletionRef: string
  ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedgerStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.operatorFinalRetainedSealedCompletionReceiptId,
    input.sanitizedFinalRetainedSealedCompletionLedgerRef,
    input.productLogEvidenceRef,
    input.finalRetainedSealedCompletionRef,
    input.ledgerStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `final-retained-sealed-completion-ledger:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedger["status"]
  reasonCode: YeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedger["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedgerBlockingReasonCode[]
  ledger?: YeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedger["ledger"]
}): YeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedger {
  return Object.freeze({
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-final-retained-sealed-completion-ledger.v1",
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

export function buildYeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedger(
  input: YeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedgerInput,
): YeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedger {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedgerBlockingReasonCode[] = []
  const operatorFinalRetainedSealedCompletionReceiptId =
    extractOperatorFinalRetainedSealedCompletionReceiptId(
      input.operatorFinalRetainedSealedCompletionReceipt,
    )
  if (operatorFinalRetainedSealedCompletionReceiptId === undefined) {
    blockingReasonCodes.push(
      "final_retained_sealed_completion_ledger_receipt_not_ready",
    )
  }
  const sanitizedFinalRetainedSealedCompletionLedgerRef =
    input.sanitizedFinalRetainedSealedCompletionLedgerRef.trim()
  if (!SAFE_FINAL_RETAINED_SEALED_COMPLETION_LEDGER_REF_PATTERN.test(sanitizedFinalRetainedSealedCompletionLedgerRef)) {
    blockingReasonCodes.push("final_retained_sealed_completion_ledger_ref_invalid")
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push(
      "final_retained_sealed_completion_ledger_product_log_evidence_ref_invalid",
    )
  }
  const finalRetainedSealedCompletionRef =
    input.finalRetainedSealedCompletionRef.trim()
  if (!SAFE_FINAL_RETAINED_SEALED_COMPLETION_REF_PATTERN.test(finalRetainedSealedCompletionRef)) {
    blockingReasonCodes.push("final_retained_sealed_completion_ledger_ack_ref_invalid")
  }

  if (
    blockingReasonCodes.length > 0 ||
    operatorFinalRetainedSealedCompletionReceiptId === undefined
  ) {
    return baseResult({
      status: "blocked",
      reasonCode: "active_tab_info_final_retained_sealed_completion_ledger_blocked",
      blockingReasonCodes,
    })
  }

  const ledgerStatus = "ready"
  return baseResult({
    status: "final_retained_sealed_completion_ledger_ready",
    reasonCode: "active_tab_info_final_retained_sealed_completion_ledger_ready",
    ledger: Object.freeze({
      finalRetainedSealedCompletionLedgerId:
        buildFinalRetainedSealedCompletionLedgerId({
          operatorFinalRetainedSealedCompletionReceiptId,
          sanitizedFinalRetainedSealedCompletionLedgerRef,
          productLogEvidenceRef,
          finalRetainedSealedCompletionRef,
          ledgerStatus,
        }),
      operatorFinalRetainedSealedCompletionReceiptId,
      sanitizedFinalRetainedSealedCompletionLedgerRef,
      productLogEvidenceRef,
      finalRetainedSealedCompletionRef,
      ledgerStatus,
    }),
  })
}
