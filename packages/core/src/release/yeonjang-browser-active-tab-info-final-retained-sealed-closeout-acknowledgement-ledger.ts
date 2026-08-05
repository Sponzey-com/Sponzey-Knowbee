import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutAcknowledgementReceipt,
} from "./yeonjang-browser-active-tab-info-operator-final-retained-sealed-closeout-acknowledgement-receipt.js"

export type YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedgerStatus =
  "ready"

export type YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedgerBlockingReasonCode =
  | "final_retained_sealed_closeout_acknowledgement_ledger_receipt_not_ready"
  | "final_retained_sealed_closeout_acknowledgement_ledger_ref_invalid"
  | "final_retained_sealed_closeout_acknowledgement_ledger_product_log_evidence_ref_invalid"
  | "final_retained_sealed_closeout_acknowledgement_ledger_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedgerInput {
  operatorFinalRetainedSealedCloseoutAcknowledgementReceipt: YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutAcknowledgementReceipt
  sanitizedFinalRetainedSealedCloseoutAcknowledgementLedgerRef: string
  productLogEvidenceRef: string
  finalRetainedSealedCloseoutAcknowledgementRef: string
}

export type YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedger = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-sealed-closeout-acknowledgement-ledger.v1"
  method: "browser.active_tab_info"
  status:
    | "final_retained_sealed_closeout_acknowledgement_ledger_ready"
    | "blocked"
  reasonCode:
    | "active_tab_info_final_retained_sealed_closeout_acknowledgement_ledger_ready"
    | "active_tab_info_final_retained_sealed_closeout_acknowledgement_ledger_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedgerBlockingReasonCode[]
  ledger?: Readonly<{
    finalRetainedSealedCloseoutAcknowledgementLedgerId: string
    operatorFinalRetainedSealedCloseoutAcknowledgementReceiptId: string
    sanitizedFinalRetainedSealedCloseoutAcknowledgementLedgerRef: string
    productLogEvidenceRef: string
    finalRetainedSealedCloseoutAcknowledgementRef: string
    ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedgerStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_FINAL_RETAINED_SEALED_CLOSEOUT_ACKNOWLEDGEMENT_LEDGER_REF_PATTERN =
  /^final-retained-sealed-closeout-acknowledgement-ledger:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_FINAL_RETAINED_SEALED_CLOSEOUT_ACKNOWLEDGEMENT_REF_PATTERN =
  /^final-retained-sealed-closeout-acknowledgement:active-tab-info:ack:[a-z0-9._:-]+$/u

function extractOperatorFinalRetainedSealedCloseoutAcknowledgementReceiptId(
  receipt: YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutAcknowledgementReceipt,
): string | undefined {
  if (
    receipt.status !==
      "operator_final_retained_sealed_closeout_acknowledgement_receipt_ready" ||
    receipt.receipt === undefined
  ) {
    return undefined
  }
  return receipt.receipt.operatorFinalRetainedSealedCloseoutAcknowledgementReceiptId
}

function buildFinalRetainedSealedCloseoutAcknowledgementLedgerId(input: {
  operatorFinalRetainedSealedCloseoutAcknowledgementReceiptId: string
  sanitizedFinalRetainedSealedCloseoutAcknowledgementLedgerRef: string
  productLogEvidenceRef: string
  finalRetainedSealedCloseoutAcknowledgementRef: string
  ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedgerStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.operatorFinalRetainedSealedCloseoutAcknowledgementReceiptId,
    input.sanitizedFinalRetainedSealedCloseoutAcknowledgementLedgerRef,
    input.productLogEvidenceRef,
    input.finalRetainedSealedCloseoutAcknowledgementRef,
    input.ledgerStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `final-retained-sealed-closeout-acknowledgement-ledger:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedger["status"]
  reasonCode: YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedger["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedgerBlockingReasonCode[]
  ledger?: YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedger["ledger"]
}): YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedger {
  return Object.freeze({
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-final-retained-sealed-closeout-acknowledgement-ledger.v1",
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

export function buildYeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedger(
  input: YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedgerInput,
): YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedger {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedgerBlockingReasonCode[] = []
  const operatorFinalRetainedSealedCloseoutAcknowledgementReceiptId =
    extractOperatorFinalRetainedSealedCloseoutAcknowledgementReceiptId(
      input.operatorFinalRetainedSealedCloseoutAcknowledgementReceipt,
    )
  if (
    operatorFinalRetainedSealedCloseoutAcknowledgementReceiptId === undefined
  ) {
    blockingReasonCodes.push(
      "final_retained_sealed_closeout_acknowledgement_ledger_receipt_not_ready",
    )
  }
  const sanitizedFinalRetainedSealedCloseoutAcknowledgementLedgerRef =
    input.sanitizedFinalRetainedSealedCloseoutAcknowledgementLedgerRef.trim()
  if (!SAFE_FINAL_RETAINED_SEALED_CLOSEOUT_ACKNOWLEDGEMENT_LEDGER_REF_PATTERN.test(sanitizedFinalRetainedSealedCloseoutAcknowledgementLedgerRef)) {
    blockingReasonCodes.push(
      "final_retained_sealed_closeout_acknowledgement_ledger_ref_invalid",
    )
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push(
      "final_retained_sealed_closeout_acknowledgement_ledger_product_log_evidence_ref_invalid",
    )
  }
  const finalRetainedSealedCloseoutAcknowledgementRef =
    input.finalRetainedSealedCloseoutAcknowledgementRef.trim()
  if (!SAFE_FINAL_RETAINED_SEALED_CLOSEOUT_ACKNOWLEDGEMENT_REF_PATTERN.test(finalRetainedSealedCloseoutAcknowledgementRef)) {
    blockingReasonCodes.push(
      "final_retained_sealed_closeout_acknowledgement_ledger_ack_ref_invalid",
    )
  }

  if (
    blockingReasonCodes.length > 0 ||
    operatorFinalRetainedSealedCloseoutAcknowledgementReceiptId === undefined
  ) {
    return baseResult({
      status: "blocked",
      reasonCode:
        "active_tab_info_final_retained_sealed_closeout_acknowledgement_ledger_blocked",
      blockingReasonCodes,
    })
  }

  const ledgerStatus = "ready"
  return baseResult({
    status: "final_retained_sealed_closeout_acknowledgement_ledger_ready",
    reasonCode:
      "active_tab_info_final_retained_sealed_closeout_acknowledgement_ledger_ready",
    ledger: Object.freeze({
      finalRetainedSealedCloseoutAcknowledgementLedgerId:
        buildFinalRetainedSealedCloseoutAcknowledgementLedgerId({
          operatorFinalRetainedSealedCloseoutAcknowledgementReceiptId,
          sanitizedFinalRetainedSealedCloseoutAcknowledgementLedgerRef,
          productLogEvidenceRef,
          finalRetainedSealedCloseoutAcknowledgementRef,
          ledgerStatus,
        }),
      operatorFinalRetainedSealedCloseoutAcknowledgementReceiptId,
      sanitizedFinalRetainedSealedCloseoutAcknowledgementLedgerRef,
      productLogEvidenceRef,
      finalRetainedSealedCloseoutAcknowledgementRef,
      ledgerStatus,
    }),
  })
}
