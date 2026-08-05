import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoFinalAuditReleaseHandoffReceipt,
} from "./yeonjang-browser-active-tab-info-final-audit-release-handoff-receipt.js"

export type YeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedgerStatus = "ready"

export type YeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedgerBlockingReasonCode =
  | "final_audit_release_closure_ledger_handoff_receipt_not_ready"
  | "final_audit_release_closure_ledger_ref_invalid"
  | "final_audit_release_closure_ledger_product_log_evidence_ref_invalid"
  | "final_audit_release_closure_ledger_audit_archive_closure_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedgerInput {
  finalAuditReleaseHandoffReceipt: YeonjangBrowserActiveTabInfoFinalAuditReleaseHandoffReceipt
  sanitizedReleaseClosureLedgerRef: string
  productLogEvidenceRef: string
  auditArchiveClosureAcknowledgementRef: string
}

export type YeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedger = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-audit-release-closure-ledger.v1"
  method: "browser.active_tab_info"
  status: "final_audit_release_closure_ledger_ready" | "blocked"
  reasonCode:
    | "active_tab_info_final_audit_release_closure_ledger_ready"
    | "active_tab_info_final_audit_release_closure_ledger_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedgerBlockingReasonCode[]
  ledger?: Readonly<{
    finalAuditReleaseClosureLedgerId: string
    finalAuditReleaseHandoffReceiptId: string
    sanitizedReleaseClosureLedgerRef: string
    productLogEvidenceRef: string
    auditArchiveClosureAcknowledgementRef: string
    ledgerStatus: YeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedgerStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_RELEASE_CLOSURE_LEDGER_REF_PATTERN =
  /^release-closure-ledger:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_AUDIT_ARCHIVE_CLOSURE_ACK_REF_PATTERN =
  /^audit-archive-closure:active-tab-info:ack:[a-z0-9._:-]+$/u

function extractFinalAuditReleaseHandoffReceiptId(
  receipt: YeonjangBrowserActiveTabInfoFinalAuditReleaseHandoffReceipt,
): string | undefined {
  if (receipt.status !== "final_audit_release_handoff_receipt_ready" || receipt.receipt === undefined) {
    return undefined
  }
  return receipt.receipt.finalAuditReleaseHandoffReceiptId
}

function buildFinalAuditReleaseClosureLedgerId(input: {
  finalAuditReleaseHandoffReceiptId: string
  sanitizedReleaseClosureLedgerRef: string
  productLogEvidenceRef: string
  auditArchiveClosureAcknowledgementRef: string
  ledgerStatus: YeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedgerStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.finalAuditReleaseHandoffReceiptId,
    input.sanitizedReleaseClosureLedgerRef,
    input.productLogEvidenceRef,
    input.auditArchiveClosureAcknowledgementRef,
    input.ledgerStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `final-audit-release-closure-ledger:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedger["status"]
  reasonCode: YeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedger["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedgerBlockingReasonCode[]
  ledger?: YeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedger["ledger"]
}): YeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedger {
  return Object.freeze({
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-audit-release-closure-ledger.v1",
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

export function buildYeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedger(
  input: YeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedgerInput,
): YeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedger {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedgerBlockingReasonCode[] = []
  const finalAuditReleaseHandoffReceiptId = extractFinalAuditReleaseHandoffReceiptId(
    input.finalAuditReleaseHandoffReceipt,
  )
  if (finalAuditReleaseHandoffReceiptId === undefined) {
    blockingReasonCodes.push("final_audit_release_closure_ledger_handoff_receipt_not_ready")
  }
  const sanitizedReleaseClosureLedgerRef = input.sanitizedReleaseClosureLedgerRef.trim()
  if (!SAFE_RELEASE_CLOSURE_LEDGER_REF_PATTERN.test(sanitizedReleaseClosureLedgerRef)) {
    blockingReasonCodes.push("final_audit_release_closure_ledger_ref_invalid")
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push("final_audit_release_closure_ledger_product_log_evidence_ref_invalid")
  }
  const auditArchiveClosureAcknowledgementRef = input.auditArchiveClosureAcknowledgementRef.trim()
  if (!SAFE_AUDIT_ARCHIVE_CLOSURE_ACK_REF_PATTERN.test(auditArchiveClosureAcknowledgementRef)) {
    blockingReasonCodes.push("final_audit_release_closure_ledger_audit_archive_closure_ack_ref_invalid")
  }

  if (blockingReasonCodes.length > 0 || finalAuditReleaseHandoffReceiptId === undefined) {
    return baseResult({
      status: "blocked",
      reasonCode: "active_tab_info_final_audit_release_closure_ledger_blocked",
      blockingReasonCodes,
    })
  }

  const ledgerStatus = "ready"
  return baseResult({
    status: "final_audit_release_closure_ledger_ready",
    reasonCode: "active_tab_info_final_audit_release_closure_ledger_ready",
    ledger: Object.freeze({
      finalAuditReleaseClosureLedgerId: buildFinalAuditReleaseClosureLedgerId({
        finalAuditReleaseHandoffReceiptId,
        sanitizedReleaseClosureLedgerRef,
        productLogEvidenceRef,
        auditArchiveClosureAcknowledgementRef,
        ledgerStatus,
      }),
      finalAuditReleaseHandoffReceiptId,
      sanitizedReleaseClosureLedgerRef,
      productLogEvidenceRef,
      auditArchiveClosureAcknowledgementRef,
      ledgerStatus,
    }),
  })
}
