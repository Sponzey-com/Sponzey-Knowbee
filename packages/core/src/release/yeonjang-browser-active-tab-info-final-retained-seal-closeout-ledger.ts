import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoOperatorRetainedSealAcknowledgementReceipt,
} from "./yeonjang-browser-active-tab-info-operator-retained-seal-acknowledgement-receipt.js"

export type YeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedgerStatus =
  "ready"

export type YeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedgerBlockingReasonCode =
  | "final_retained_seal_closeout_ledger_receipt_not_ready"
  | "final_retained_seal_closeout_ledger_ref_invalid"
  | "final_retained_seal_closeout_ledger_product_log_evidence_ref_invalid"
  | "final_retained_seal_closeout_ledger_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedgerInput {
  operatorRetainedSealAcknowledgementReceipt: YeonjangBrowserActiveTabInfoOperatorRetainedSealAcknowledgementReceipt
  sanitizedFinalRetainedSealCloseoutLedgerRef: string
  productLogEvidenceRef: string
  finalRetainedSealCloseoutAcknowledgementRef: string
}

export type YeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedger = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-seal-closeout-ledger.v1"
  method: "browser.active_tab_info"
  status: "final_retained_seal_closeout_ledger_ready" | "blocked"
  reasonCode:
    | "active_tab_info_final_retained_seal_closeout_ledger_ready"
    | "active_tab_info_final_retained_seal_closeout_ledger_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedgerBlockingReasonCode[]
  ledger?: Readonly<{
    finalRetainedSealCloseoutLedgerId: string
    operatorRetainedSealAcknowledgementReceiptId: string
    sanitizedFinalRetainedSealCloseoutLedgerRef: string
    productLogEvidenceRef: string
    finalRetainedSealCloseoutAcknowledgementRef: string
    ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedgerStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_FINAL_RETAINED_SEAL_CLOSEOUT_LEDGER_REF_PATTERN =
  /^final-retained-seal-closeout-ledger:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_FINAL_RETAINED_SEAL_CLOSEOUT_ACKNOWLEDGEMENT_REF_PATTERN =
  /^final-retained-seal-closeout:active-tab-info:ack:[a-z0-9._:-]+$/u

function extractOperatorRetainedSealAcknowledgementReceiptId(
  receipt: YeonjangBrowserActiveTabInfoOperatorRetainedSealAcknowledgementReceipt,
): string | undefined {
  if (
    receipt.status !== "operator_retained_seal_acknowledgement_receipt_ready" ||
    receipt.receipt === undefined
  ) {
    return undefined
  }
  return receipt.receipt.operatorRetainedSealAcknowledgementReceiptId
}

function buildFinalRetainedSealCloseoutLedgerId(input: {
  operatorRetainedSealAcknowledgementReceiptId: string
  sanitizedFinalRetainedSealCloseoutLedgerRef: string
  productLogEvidenceRef: string
  finalRetainedSealCloseoutAcknowledgementRef: string
  ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedgerStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.operatorRetainedSealAcknowledgementReceiptId,
    input.sanitizedFinalRetainedSealCloseoutLedgerRef,
    input.productLogEvidenceRef,
    input.finalRetainedSealCloseoutAcknowledgementRef,
    input.ledgerStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `final-retained-seal-closeout-ledger:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedger["status"]
  reasonCode: YeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedger["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedgerBlockingReasonCode[]
  ledger?: YeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedger["ledger"]
}): YeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedger {
  return Object.freeze({
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-final-retained-seal-closeout-ledger.v1",
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

export function buildYeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedger(
  input: YeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedgerInput,
): YeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedger {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedgerBlockingReasonCode[] = []
  const operatorRetainedSealAcknowledgementReceiptId =
    extractOperatorRetainedSealAcknowledgementReceiptId(
      input.operatorRetainedSealAcknowledgementReceipt,
    )
  if (operatorRetainedSealAcknowledgementReceiptId === undefined) {
    blockingReasonCodes.push(
      "final_retained_seal_closeout_ledger_receipt_not_ready",
    )
  }
  const sanitizedFinalRetainedSealCloseoutLedgerRef =
    input.sanitizedFinalRetainedSealCloseoutLedgerRef.trim()
  if (!SAFE_FINAL_RETAINED_SEAL_CLOSEOUT_LEDGER_REF_PATTERN.test(sanitizedFinalRetainedSealCloseoutLedgerRef)) {
    blockingReasonCodes.push(
      "final_retained_seal_closeout_ledger_ref_invalid",
    )
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push(
      "final_retained_seal_closeout_ledger_product_log_evidence_ref_invalid",
    )
  }
  const finalRetainedSealCloseoutAcknowledgementRef =
    input.finalRetainedSealCloseoutAcknowledgementRef.trim()
  if (!SAFE_FINAL_RETAINED_SEAL_CLOSEOUT_ACKNOWLEDGEMENT_REF_PATTERN.test(finalRetainedSealCloseoutAcknowledgementRef)) {
    blockingReasonCodes.push(
      "final_retained_seal_closeout_ledger_ack_ref_invalid",
    )
  }

  if (
    blockingReasonCodes.length > 0 ||
    operatorRetainedSealAcknowledgementReceiptId === undefined
  ) {
    return baseResult({
      status: "blocked",
      reasonCode:
        "active_tab_info_final_retained_seal_closeout_ledger_blocked",
      blockingReasonCodes,
    })
  }

  const ledgerStatus = "ready"
  return baseResult({
    status: "final_retained_seal_closeout_ledger_ready",
    reasonCode: "active_tab_info_final_retained_seal_closeout_ledger_ready",
    ledger: Object.freeze({
      finalRetainedSealCloseoutLedgerId:
        buildFinalRetainedSealCloseoutLedgerId({
          operatorRetainedSealAcknowledgementReceiptId,
          sanitizedFinalRetainedSealCloseoutLedgerRef,
          productLogEvidenceRef,
          finalRetainedSealCloseoutAcknowledgementRef,
          ledgerStatus,
        }),
      operatorRetainedSealAcknowledgementReceiptId,
      sanitizedFinalRetainedSealCloseoutLedgerRef,
      productLogEvidenceRef,
      finalRetainedSealCloseoutAcknowledgementRef,
      ledgerStatus,
    }),
  })
}
