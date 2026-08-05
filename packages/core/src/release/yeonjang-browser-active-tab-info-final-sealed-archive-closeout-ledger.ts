import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoOperatorFinalSealedArchiveReceipt,
} from "./yeonjang-browser-active-tab-info-operator-final-sealed-archive-receipt.js"

export type YeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedgerStatus = "ready"

export type YeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedgerBlockingReasonCode =
  | "final_sealed_archive_closeout_ledger_receipt_not_ready"
  | "final_sealed_archive_closeout_ledger_ref_invalid"
  | "final_sealed_archive_closeout_ledger_product_log_evidence_ref_invalid"
  | "final_sealed_archive_closeout_ledger_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedgerInput {
  operatorFinalSealedArchiveReceipt: YeonjangBrowserActiveTabInfoOperatorFinalSealedArchiveReceipt
  sanitizedFinalSealedArchiveCloseoutLedgerRef: string
  productLogEvidenceRef: string
  finalSealedArchiveCloseoutAcknowledgementRef: string
}

export type YeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedger = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-sealed-archive-closeout-ledger.v1"
  method: "browser.active_tab_info"
  status: "final_sealed_archive_closeout_ledger_ready" | "blocked"
  reasonCode:
    | "active_tab_info_final_sealed_archive_closeout_ledger_ready"
    | "active_tab_info_final_sealed_archive_closeout_ledger_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedgerBlockingReasonCode[]
  ledger?: Readonly<{
    finalSealedArchiveCloseoutLedgerId: string
    operatorFinalSealedArchiveReceiptId: string
    sanitizedFinalSealedArchiveCloseoutLedgerRef: string
    productLogEvidenceRef: string
    finalSealedArchiveCloseoutAcknowledgementRef: string
    ledgerStatus: YeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedgerStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_FINAL_SEALED_ARCHIVE_CLOSEOUT_LEDGER_REF_PATTERN =
  /^final-sealed-archive-closeout-ledger:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_FINAL_SEALED_ARCHIVE_CLOSEOUT_ACK_REF_PATTERN =
  /^final-sealed-archive-closeout:active-tab-info:ack:[a-z0-9._:-]+$/u

function extractOperatorFinalSealedArchiveReceiptId(
  receipt: YeonjangBrowserActiveTabInfoOperatorFinalSealedArchiveReceipt,
): string | undefined {
  if (
    receipt.status !== "operator_final_sealed_archive_receipt_ready" ||
    receipt.receipt === undefined
  ) {
    return undefined
  }
  return receipt.receipt.operatorFinalSealedArchiveReceiptId
}

function buildFinalSealedArchiveCloseoutLedgerId(input: {
  operatorFinalSealedArchiveReceiptId: string
  sanitizedFinalSealedArchiveCloseoutLedgerRef: string
  productLogEvidenceRef: string
  finalSealedArchiveCloseoutAcknowledgementRef: string
  ledgerStatus: YeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedgerStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.operatorFinalSealedArchiveReceiptId,
    input.sanitizedFinalSealedArchiveCloseoutLedgerRef,
    input.productLogEvidenceRef,
    input.finalSealedArchiveCloseoutAcknowledgementRef,
    input.ledgerStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `final-sealed-archive-closeout-ledger:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedger["status"]
  reasonCode: YeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedger["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedgerBlockingReasonCode[]
  ledger?: YeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedger["ledger"]
}): YeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedger {
  return Object.freeze({
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-final-sealed-archive-closeout-ledger.v1",
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

export function buildYeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedger(
  input: YeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedgerInput,
): YeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedger {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedgerBlockingReasonCode[] = []
  const operatorFinalSealedArchiveReceiptId =
    extractOperatorFinalSealedArchiveReceiptId(input.operatorFinalSealedArchiveReceipt)
  if (operatorFinalSealedArchiveReceiptId === undefined) {
    blockingReasonCodes.push("final_sealed_archive_closeout_ledger_receipt_not_ready")
  }
  const sanitizedFinalSealedArchiveCloseoutLedgerRef =
    input.sanitizedFinalSealedArchiveCloseoutLedgerRef.trim()
  if (!SAFE_FINAL_SEALED_ARCHIVE_CLOSEOUT_LEDGER_REF_PATTERN.test(sanitizedFinalSealedArchiveCloseoutLedgerRef)) {
    blockingReasonCodes.push("final_sealed_archive_closeout_ledger_ref_invalid")
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push("final_sealed_archive_closeout_ledger_product_log_evidence_ref_invalid")
  }
  const finalSealedArchiveCloseoutAcknowledgementRef =
    input.finalSealedArchiveCloseoutAcknowledgementRef.trim()
  if (!SAFE_FINAL_SEALED_ARCHIVE_CLOSEOUT_ACK_REF_PATTERN.test(finalSealedArchiveCloseoutAcknowledgementRef)) {
    blockingReasonCodes.push("final_sealed_archive_closeout_ledger_ack_ref_invalid")
  }

  if (blockingReasonCodes.length > 0 || operatorFinalSealedArchiveReceiptId === undefined) {
    return baseResult({
      status: "blocked",
      reasonCode: "active_tab_info_final_sealed_archive_closeout_ledger_blocked",
      blockingReasonCodes,
    })
  }

  const ledgerStatus = "ready"
  return baseResult({
    status: "final_sealed_archive_closeout_ledger_ready",
    reasonCode: "active_tab_info_final_sealed_archive_closeout_ledger_ready",
    ledger: Object.freeze({
      finalSealedArchiveCloseoutLedgerId:
        buildFinalSealedArchiveCloseoutLedgerId({
          operatorFinalSealedArchiveReceiptId,
          sanitizedFinalSealedArchiveCloseoutLedgerRef,
          productLogEvidenceRef,
          finalSealedArchiveCloseoutAcknowledgementRef,
          ledgerStatus,
        }),
      operatorFinalSealedArchiveReceiptId,
      sanitizedFinalSealedArchiveCloseoutLedgerRef,
      productLogEvidenceRef,
      finalSealedArchiveCloseoutAcknowledgementRef,
      ledgerStatus,
    }),
  })
}
