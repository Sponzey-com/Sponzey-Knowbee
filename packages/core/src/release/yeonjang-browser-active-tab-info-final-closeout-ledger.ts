import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoOperatorCloseoutNote,
} from "./yeonjang-browser-active-tab-info-operator-closeout-note.js"

export type YeonjangBrowserActiveTabInfoFinalCloseoutLedgerStatus = "closed"

export type YeonjangBrowserActiveTabInfoFinalCloseoutLedgerBlockingReasonCode =
  | "final_closeout_operator_note_not_ready"
  | "final_closeout_completion_audit_summary_ref_invalid"
  | "final_closeout_terminal_delivery_receipt_ref_invalid"
  | "final_closeout_product_log_evidence_ref_invalid"

export interface YeonjangBrowserActiveTabInfoFinalCloseoutLedgerInput {
  operatorCloseoutNote: YeonjangBrowserActiveTabInfoOperatorCloseoutNote
  completionAuditSummaryRef: string
  terminalDeliveryReceiptRef: string
  productLogEvidenceRef: string
}

export type YeonjangBrowserActiveTabInfoFinalCloseoutLedger = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-closeout-ledger.v1"
  method: "browser.active_tab_info"
  status: "final_closeout_ledger_ready" | "blocked"
  reasonCode:
    | "active_tab_info_final_closeout_ledger_ready"
    | "active_tab_info_final_closeout_ledger_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalCloseoutLedgerBlockingReasonCode[]
  ledger?: Readonly<{
    finalCloseoutLedgerId: string
    operatorCloseoutNoteId: string
    completionAuditSummaryRef: string
    terminalDeliveryReceiptRef: string
    productLogEvidenceRef: string
    ledgerStatus: YeonjangBrowserActiveTabInfoFinalCloseoutLedgerStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_COMPLETION_AUDIT_SUMMARY_REF_PATTERN =
  /^completion-audit-summary:active-tab-info:ref:[a-z0-9._:-]+$/u

const SAFE_TERMINAL_DELIVERY_RECEIPT_REF_PATTERN =
  /^terminal-delivery-receipt:active-tab-info:ref:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

function extractOperatorCloseoutNoteId(
  note: YeonjangBrowserActiveTabInfoOperatorCloseoutNote,
): string | undefined {
  if (note.status !== "operator_closeout_note_ready" || note.note === undefined) {
    return undefined
  }
  return note.note.operatorCloseoutNoteId
}

function buildFinalCloseoutLedgerId(input: {
  operatorCloseoutNoteId: string
  completionAuditSummaryRef: string
  terminalDeliveryReceiptRef: string
  productLogEvidenceRef: string
  ledgerStatus: YeonjangBrowserActiveTabInfoFinalCloseoutLedgerStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.operatorCloseoutNoteId,
    input.completionAuditSummaryRef,
    input.terminalDeliveryReceiptRef,
    input.productLogEvidenceRef,
    input.ledgerStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `final-closeout-ledger:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoFinalCloseoutLedger["status"]
  reasonCode: YeonjangBrowserActiveTabInfoFinalCloseoutLedger["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalCloseoutLedgerBlockingReasonCode[]
  ledger?: YeonjangBrowserActiveTabInfoFinalCloseoutLedger["ledger"]
}): YeonjangBrowserActiveTabInfoFinalCloseoutLedger {
  return Object.freeze({
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-closeout-ledger.v1",
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

export function buildYeonjangBrowserActiveTabInfoFinalCloseoutLedger(
  input: YeonjangBrowserActiveTabInfoFinalCloseoutLedgerInput,
): YeonjangBrowserActiveTabInfoFinalCloseoutLedger {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoFinalCloseoutLedgerBlockingReasonCode[] = []
  const operatorCloseoutNoteId = extractOperatorCloseoutNoteId(input.operatorCloseoutNote)
  if (operatorCloseoutNoteId === undefined) {
    blockingReasonCodes.push("final_closeout_operator_note_not_ready")
  }
  const completionAuditSummaryRef = input.completionAuditSummaryRef.trim()
  if (!SAFE_COMPLETION_AUDIT_SUMMARY_REF_PATTERN.test(completionAuditSummaryRef)) {
    blockingReasonCodes.push("final_closeout_completion_audit_summary_ref_invalid")
  }
  const terminalDeliveryReceiptRef = input.terminalDeliveryReceiptRef.trim()
  if (!SAFE_TERMINAL_DELIVERY_RECEIPT_REF_PATTERN.test(terminalDeliveryReceiptRef)) {
    blockingReasonCodes.push("final_closeout_terminal_delivery_receipt_ref_invalid")
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push("final_closeout_product_log_evidence_ref_invalid")
  }

  if (blockingReasonCodes.length > 0 || operatorCloseoutNoteId === undefined) {
    return baseResult({
      status: "blocked",
      reasonCode: "active_tab_info_final_closeout_ledger_blocked",
      blockingReasonCodes,
    })
  }

  const ledgerStatus = "closed"
  return baseResult({
    status: "final_closeout_ledger_ready",
    reasonCode: "active_tab_info_final_closeout_ledger_ready",
    ledger: Object.freeze({
      finalCloseoutLedgerId: buildFinalCloseoutLedgerId({
        operatorCloseoutNoteId,
        completionAuditSummaryRef,
        terminalDeliveryReceiptRef,
        productLogEvidenceRef,
        ledgerStatus,
      }),
      operatorCloseoutNoteId,
      completionAuditSummaryRef,
      terminalDeliveryReceiptRef,
      productLogEvidenceRef,
      ledgerStatus,
    }),
  })
}
