import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceipt,
} from "./yeonjang-browser-active-tab-info-operator-retained-transfer-index-acknowledgement-receipt.js"

export type YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedgerStatus =
  "ready"

export type YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedgerBlockingReasonCode =
  | "final_retained_acknowledgement_ledger_receipt_not_ready"
  | "final_retained_acknowledgement_ledger_ref_invalid"
  | "final_retained_acknowledgement_ledger_product_log_evidence_ref_invalid"
  | "final_retained_acknowledgement_ledger_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedgerInput {
  operatorRetainedTransferIndexAcknowledgementReceipt: YeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceipt
  sanitizedFinalRetainedAcknowledgementLedgerRef: string
  productLogEvidenceRef: string
  finalRetainedAcknowledgementRef: string
}

export type YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedger = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-acknowledgement-ledger.v1"
  method: "browser.active_tab_info"
  status: "final_retained_acknowledgement_ledger_ready" | "blocked"
  reasonCode:
    | "active_tab_info_final_retained_acknowledgement_ledger_ready"
    | "active_tab_info_final_retained_acknowledgement_ledger_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedgerBlockingReasonCode[]
  ledger?: Readonly<{
    finalRetainedAcknowledgementLedgerId: string
    operatorRetainedTransferIndexAcknowledgementReceiptId: string
    sanitizedFinalRetainedAcknowledgementLedgerRef: string
    productLogEvidenceRef: string
    finalRetainedAcknowledgementRef: string
    ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedgerStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_FINAL_RETAINED_ACKNOWLEDGEMENT_LEDGER_REF_PATTERN =
  /^final-retained-acknowledgement-ledger:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_FINAL_RETAINED_ACKNOWLEDGEMENT_REF_PATTERN =
  /^final-retained-acknowledgement:active-tab-info:ack:[a-z0-9._:-]+$/u

function extractOperatorRetainedTransferIndexAcknowledgementReceiptId(
  receipt: YeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceipt,
): string | undefined {
  if (
    receipt.status !==
      "operator_retained_transfer_index_acknowledgement_receipt_ready" ||
    receipt.receipt === undefined
  ) {
    return undefined
  }
  return receipt.receipt.operatorRetainedTransferIndexAcknowledgementReceiptId
}

function buildFinalRetainedAcknowledgementLedgerId(input: {
  operatorRetainedTransferIndexAcknowledgementReceiptId: string
  sanitizedFinalRetainedAcknowledgementLedgerRef: string
  productLogEvidenceRef: string
  finalRetainedAcknowledgementRef: string
  ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedgerStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.operatorRetainedTransferIndexAcknowledgementReceiptId,
    input.sanitizedFinalRetainedAcknowledgementLedgerRef,
    input.productLogEvidenceRef,
    input.finalRetainedAcknowledgementRef,
    input.ledgerStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `final-retained-acknowledgement-ledger:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedger["status"]
  reasonCode: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedger["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedgerBlockingReasonCode[]
  ledger?: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedger["ledger"]
}): YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedger {
  return Object.freeze({
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-final-retained-acknowledgement-ledger.v1",
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

export function buildYeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedger(
  input: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedgerInput,
): YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedger {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedgerBlockingReasonCode[] = []
  const operatorRetainedTransferIndexAcknowledgementReceiptId =
    extractOperatorRetainedTransferIndexAcknowledgementReceiptId(
      input.operatorRetainedTransferIndexAcknowledgementReceipt,
    )
  if (operatorRetainedTransferIndexAcknowledgementReceiptId === undefined) {
    blockingReasonCodes.push(
      "final_retained_acknowledgement_ledger_receipt_not_ready",
    )
  }
  const sanitizedFinalRetainedAcknowledgementLedgerRef =
    input.sanitizedFinalRetainedAcknowledgementLedgerRef.trim()
  if (!SAFE_FINAL_RETAINED_ACKNOWLEDGEMENT_LEDGER_REF_PATTERN.test(sanitizedFinalRetainedAcknowledgementLedgerRef)) {
    blockingReasonCodes.push("final_retained_acknowledgement_ledger_ref_invalid")
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push(
      "final_retained_acknowledgement_ledger_product_log_evidence_ref_invalid",
    )
  }
  const finalRetainedAcknowledgementRef =
    input.finalRetainedAcknowledgementRef.trim()
  if (!SAFE_FINAL_RETAINED_ACKNOWLEDGEMENT_REF_PATTERN.test(finalRetainedAcknowledgementRef)) {
    blockingReasonCodes.push("final_retained_acknowledgement_ledger_ack_ref_invalid")
  }

  if (
    blockingReasonCodes.length > 0 ||
    operatorRetainedTransferIndexAcknowledgementReceiptId === undefined
  ) {
    return baseResult({
      status: "blocked",
      reasonCode: "active_tab_info_final_retained_acknowledgement_ledger_blocked",
      blockingReasonCodes,
    })
  }

  const ledgerStatus = "ready"
  return baseResult({
    status: "final_retained_acknowledgement_ledger_ready",
    reasonCode: "active_tab_info_final_retained_acknowledgement_ledger_ready",
    ledger: Object.freeze({
      finalRetainedAcknowledgementLedgerId:
        buildFinalRetainedAcknowledgementLedgerId({
          operatorRetainedTransferIndexAcknowledgementReceiptId,
          sanitizedFinalRetainedAcknowledgementLedgerRef,
          productLogEvidenceRef,
          finalRetainedAcknowledgementRef,
          ledgerStatus,
        }),
      operatorRetainedTransferIndexAcknowledgementReceiptId,
      sanitizedFinalRetainedAcknowledgementLedgerRef,
      productLogEvidenceRef,
      finalRetainedAcknowledgementRef,
      ledgerStatus,
    }),
  })
}
