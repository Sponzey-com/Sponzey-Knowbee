import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceipt,
} from "./yeonjang-browser-active-tab-info-operator-final-retained-closeout-sealed-acknowledgement-receipt.js"

export type YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedgerStatus =
  "ready"

export type YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedgerBlockingReasonCode =
  | "final_retained_sealed_closeout_ledger_receipt_not_ready"
  | "final_retained_sealed_closeout_ledger_ref_invalid"
  | "final_retained_sealed_closeout_ledger_product_log_evidence_ref_invalid"
  | "final_retained_sealed_closeout_ledger_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedgerInput {
  operatorFinalRetainedCloseoutSealedAcknowledgementReceipt: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceipt
  sanitizedFinalRetainedSealedCloseoutLedgerRef: string
  productLogEvidenceRef: string
  finalRetainedSealedCloseoutRef: string
}

export type YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedger = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-sealed-closeout-ledger.v1"
  method: "browser.active_tab_info"
  status: "final_retained_sealed_closeout_ledger_ready" | "blocked"
  reasonCode:
    | "active_tab_info_final_retained_sealed_closeout_ledger_ready"
    | "active_tab_info_final_retained_sealed_closeout_ledger_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedgerBlockingReasonCode[]
  ledger?: Readonly<{
    finalRetainedSealedCloseoutLedgerId: string
    operatorFinalRetainedCloseoutSealedAcknowledgementReceiptId: string
    sanitizedFinalRetainedSealedCloseoutLedgerRef: string
    productLogEvidenceRef: string
    finalRetainedSealedCloseoutRef: string
    ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedgerStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_FINAL_RETAINED_SEALED_CLOSEOUT_LEDGER_REF_PATTERN =
  /^final-retained-sealed-closeout-ledger:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_FINAL_RETAINED_SEALED_CLOSEOUT_REF_PATTERN =
  /^final-retained-sealed-closeout:active-tab-info:ack:[a-z0-9._:-]+$/u

function extractOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptId(
  receipt: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceipt,
): string | undefined {
  if (
    receipt.status !==
      "operator_final_retained_closeout_sealed_acknowledgement_receipt_ready" ||
    receipt.receipt === undefined
  ) {
    return undefined
  }
  return receipt.receipt.operatorFinalRetainedCloseoutSealedAcknowledgementReceiptId
}

function buildFinalRetainedSealedCloseoutLedgerId(input: {
  operatorFinalRetainedCloseoutSealedAcknowledgementReceiptId: string
  sanitizedFinalRetainedSealedCloseoutLedgerRef: string
  productLogEvidenceRef: string
  finalRetainedSealedCloseoutRef: string
  ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedgerStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.operatorFinalRetainedCloseoutSealedAcknowledgementReceiptId,
    input.sanitizedFinalRetainedSealedCloseoutLedgerRef,
    input.productLogEvidenceRef,
    input.finalRetainedSealedCloseoutRef,
    input.ledgerStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `final-retained-sealed-closeout-ledger:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedger["status"]
  reasonCode: YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedger["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedgerBlockingReasonCode[]
  ledger?: YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedger["ledger"]
}): YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedger {
  return Object.freeze({
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-final-retained-sealed-closeout-ledger.v1",
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

export function buildYeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedger(
  input: YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedgerInput,
): YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedger {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedgerBlockingReasonCode[] = []
  const operatorFinalRetainedCloseoutSealedAcknowledgementReceiptId =
    extractOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptId(
      input.operatorFinalRetainedCloseoutSealedAcknowledgementReceipt,
    )
  if (
    operatorFinalRetainedCloseoutSealedAcknowledgementReceiptId === undefined
  ) {
    blockingReasonCodes.push(
      "final_retained_sealed_closeout_ledger_receipt_not_ready",
    )
  }
  const sanitizedFinalRetainedSealedCloseoutLedgerRef =
    input.sanitizedFinalRetainedSealedCloseoutLedgerRef.trim()
  if (!SAFE_FINAL_RETAINED_SEALED_CLOSEOUT_LEDGER_REF_PATTERN.test(sanitizedFinalRetainedSealedCloseoutLedgerRef)) {
    blockingReasonCodes.push("final_retained_sealed_closeout_ledger_ref_invalid")
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push(
      "final_retained_sealed_closeout_ledger_product_log_evidence_ref_invalid",
    )
  }
  const finalRetainedSealedCloseoutRef =
    input.finalRetainedSealedCloseoutRef.trim()
  if (!SAFE_FINAL_RETAINED_SEALED_CLOSEOUT_REF_PATTERN.test(finalRetainedSealedCloseoutRef)) {
    blockingReasonCodes.push(
      "final_retained_sealed_closeout_ledger_ack_ref_invalid",
    )
  }

  if (
    blockingReasonCodes.length > 0 ||
    operatorFinalRetainedCloseoutSealedAcknowledgementReceiptId === undefined
  ) {
    return baseResult({
      status: "blocked",
      reasonCode: "active_tab_info_final_retained_sealed_closeout_ledger_blocked",
      blockingReasonCodes,
    })
  }

  const ledgerStatus = "ready"
  return baseResult({
    status: "final_retained_sealed_closeout_ledger_ready",
    reasonCode: "active_tab_info_final_retained_sealed_closeout_ledger_ready",
    ledger: Object.freeze({
      finalRetainedSealedCloseoutLedgerId:
        buildFinalRetainedSealedCloseoutLedgerId({
          operatorFinalRetainedCloseoutSealedAcknowledgementReceiptId,
          sanitizedFinalRetainedSealedCloseoutLedgerRef,
          productLogEvidenceRef,
          finalRetainedSealedCloseoutRef,
          ledgerStatus,
        }),
      operatorFinalRetainedCloseoutSealedAcknowledgementReceiptId,
      sanitizedFinalRetainedSealedCloseoutLedgerRef,
      productLogEvidenceRef,
      finalRetainedSealedCloseoutRef,
      ledgerStatus,
    }),
  })
}
