import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoTerminalDeliveryReceipt,
} from "./yeonjang-browser-active-tab-info-terminal-delivery-receipt.js"

export type YeonjangBrowserActiveTabInfoOperatorCloseoutStatus = "closed"

export type YeonjangBrowserActiveTabInfoOperatorCloseoutNoteBlockingReasonCode =
  | "operator_closeout_terminal_delivery_receipt_not_ready"
  | "operator_closeout_user_ack_ref_invalid"
  | "operator_closeout_product_log_evidence_ref_invalid"
  | "operator_closeout_note_ref_invalid"

export interface YeonjangBrowserActiveTabInfoOperatorCloseoutNoteInput {
  terminalDeliveryReceipt: YeonjangBrowserActiveTabInfoTerminalDeliveryReceipt
  sanitizedUserAcknowledgementRef: string
  productLogEvidenceRef: string
  sanitizedOperatorCloseoutNoteRef: string
}

export type YeonjangBrowserActiveTabInfoOperatorCloseoutNote = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-closeout-note.v1"
  method: "browser.active_tab_info"
  status: "operator_closeout_note_ready" | "blocked"
  reasonCode:
    | "active_tab_info_operator_closeout_note_ready"
    | "active_tab_info_operator_closeout_note_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorCloseoutNoteBlockingReasonCode[]
  note?: Readonly<{
    operatorCloseoutNoteId: string
    terminalDeliveryReceiptId: string
    sanitizedUserAcknowledgementRef: string
    productLogEvidenceRef: string
    sanitizedOperatorCloseoutNoteRef: string
    closeoutStatus: YeonjangBrowserActiveTabInfoOperatorCloseoutStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_USER_ACK_REF_PATTERN = /^user-ack:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_OPERATOR_CLOSEOUT_NOTE_REF_PATTERN =
  /^operator-closeout-note:active-tab-info:sanitized:[a-z0-9._:-]+$/u

function extractTerminalDeliveryReceiptId(
  receipt: YeonjangBrowserActiveTabInfoTerminalDeliveryReceipt,
): string | undefined {
  if (receipt.status !== "terminal_delivery_receipt_ready" || receipt.receipt === undefined) {
    return undefined
  }
  return receipt.receipt.terminalDeliveryReceiptId
}

function buildOperatorCloseoutNoteId(input: {
  terminalDeliveryReceiptId: string
  sanitizedUserAcknowledgementRef: string
  productLogEvidenceRef: string
  sanitizedOperatorCloseoutNoteRef: string
  closeoutStatus: YeonjangBrowserActiveTabInfoOperatorCloseoutStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.terminalDeliveryReceiptId,
    input.sanitizedUserAcknowledgementRef,
    input.productLogEvidenceRef,
    input.sanitizedOperatorCloseoutNoteRef,
    input.closeoutStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `operator-closeout-note:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoOperatorCloseoutNote["status"]
  reasonCode: YeonjangBrowserActiveTabInfoOperatorCloseoutNote["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorCloseoutNoteBlockingReasonCode[]
  note?: YeonjangBrowserActiveTabInfoOperatorCloseoutNote["note"]
}): YeonjangBrowserActiveTabInfoOperatorCloseoutNote {
  return Object.freeze({
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-closeout-note.v1",
    method: "browser.active_tab_info",
    status: input.status,
    reasonCode: input.reasonCode,
    ...(input.blockingReasonCodes === undefined
      ? {}
      : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
    ...(input.note === undefined ? {} : { note: input.note }),
    releaseReadinessNow: false,
    publicationReadinessNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
  })
}

export function buildYeonjangBrowserActiveTabInfoOperatorCloseoutNote(
  input: YeonjangBrowserActiveTabInfoOperatorCloseoutNoteInput,
): YeonjangBrowserActiveTabInfoOperatorCloseoutNote {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoOperatorCloseoutNoteBlockingReasonCode[] = []
  const terminalDeliveryReceiptId = extractTerminalDeliveryReceiptId(input.terminalDeliveryReceipt)
  if (terminalDeliveryReceiptId === undefined) {
    blockingReasonCodes.push("operator_closeout_terminal_delivery_receipt_not_ready")
  }
  const sanitizedUserAcknowledgementRef = input.sanitizedUserAcknowledgementRef.trim()
  if (!SAFE_USER_ACK_REF_PATTERN.test(sanitizedUserAcknowledgementRef)) {
    blockingReasonCodes.push("operator_closeout_user_ack_ref_invalid")
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push("operator_closeout_product_log_evidence_ref_invalid")
  }
  const sanitizedOperatorCloseoutNoteRef = input.sanitizedOperatorCloseoutNoteRef.trim()
  if (!SAFE_OPERATOR_CLOSEOUT_NOTE_REF_PATTERN.test(sanitizedOperatorCloseoutNoteRef)) {
    blockingReasonCodes.push("operator_closeout_note_ref_invalid")
  }

  if (blockingReasonCodes.length > 0 || terminalDeliveryReceiptId === undefined) {
    return baseResult({
      status: "blocked",
      reasonCode: "active_tab_info_operator_closeout_note_blocked",
      blockingReasonCodes,
    })
  }

  const closeoutStatus = "closed"
  return baseResult({
    status: "operator_closeout_note_ready",
    reasonCode: "active_tab_info_operator_closeout_note_ready",
    note: Object.freeze({
      operatorCloseoutNoteId: buildOperatorCloseoutNoteId({
        terminalDeliveryReceiptId,
        sanitizedUserAcknowledgementRef,
        productLogEvidenceRef,
        sanitizedOperatorCloseoutNoteRef,
        closeoutStatus,
      }),
      terminalDeliveryReceiptId,
      sanitizedUserAcknowledgementRef,
      productLogEvidenceRef,
      sanitizedOperatorCloseoutNoteRef,
      closeoutStatus,
    }),
  })
}
