import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceipt,
} from "./yeonjang-browser-active-tab-info-operator-final-closeout-acknowledgement-receipt.js"

export type YeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndexStatus = "ready"

export type YeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndexBlockingReasonCode =
  | "final_operator_closeout_index_receipt_not_ready"
  | "final_operator_closeout_index_ref_invalid"
  | "final_operator_closeout_index_product_log_evidence_ref_invalid"
  | "final_operator_closeout_index_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndexInput {
  operatorFinalCloseoutAcknowledgementReceipt: YeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceipt
  sanitizedFinalOperatorCloseoutIndexRef: string
  productLogEvidenceRef: string
  finalOperatorCloseoutAcknowledgementRef: string
}

export type YeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndex = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-operator-closeout-index.v1"
  method: "browser.active_tab_info"
  status: "final_operator_closeout_index_ready" | "blocked"
  reasonCode:
    | "active_tab_info_final_operator_closeout_index_ready"
    | "active_tab_info_final_operator_closeout_index_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndexBlockingReasonCode[]
  index?: Readonly<{
    finalOperatorCloseoutIndexId: string
    operatorFinalCloseoutAcknowledgementReceiptId: string
    sanitizedFinalOperatorCloseoutIndexRef: string
    productLogEvidenceRef: string
    finalOperatorCloseoutAcknowledgementRef: string
    indexStatus: YeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndexStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_FINAL_OPERATOR_CLOSEOUT_INDEX_REF_PATTERN =
  /^final-operator-closeout-index:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_FINAL_OPERATOR_CLOSEOUT_ACK_REF_PATTERN =
  /^final-operator-closeout:active-tab-info:ack:[a-z0-9._:-]+$/u

function extractOperatorFinalCloseoutAcknowledgementReceiptId(
  receipt: YeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceipt,
): string | undefined {
  if (
    receipt.status !== "operator_final_closeout_acknowledgement_receipt_ready" ||
    receipt.receipt === undefined
  ) {
    return undefined
  }
  return receipt.receipt.operatorFinalCloseoutAcknowledgementReceiptId
}

function buildFinalOperatorCloseoutIndexId(input: {
  operatorFinalCloseoutAcknowledgementReceiptId: string
  sanitizedFinalOperatorCloseoutIndexRef: string
  productLogEvidenceRef: string
  finalOperatorCloseoutAcknowledgementRef: string
  indexStatus: YeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndexStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.operatorFinalCloseoutAcknowledgementReceiptId,
    input.sanitizedFinalOperatorCloseoutIndexRef,
    input.productLogEvidenceRef,
    input.finalOperatorCloseoutAcknowledgementRef,
    input.indexStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `final-operator-closeout-index:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndex["status"]
  reasonCode: YeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndex["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndexBlockingReasonCode[]
  index?: YeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndex["index"]
}): YeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndex {
  return Object.freeze({
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-final-operator-closeout-index.v1",
    method: "browser.active_tab_info",
    status: input.status,
    reasonCode: input.reasonCode,
    ...(input.blockingReasonCodes === undefined
      ? {}
      : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
    ...(input.index === undefined ? {} : { index: input.index }),
    releaseReadinessNow: false,
    publicationReadinessNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
  })
}

export function buildYeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndex(
  input: YeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndexInput,
): YeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndex {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndexBlockingReasonCode[] = []
  const operatorFinalCloseoutAcknowledgementReceiptId =
    extractOperatorFinalCloseoutAcknowledgementReceiptId(input.operatorFinalCloseoutAcknowledgementReceipt)
  if (operatorFinalCloseoutAcknowledgementReceiptId === undefined) {
    blockingReasonCodes.push("final_operator_closeout_index_receipt_not_ready")
  }
  const sanitizedFinalOperatorCloseoutIndexRef =
    input.sanitizedFinalOperatorCloseoutIndexRef.trim()
  if (!SAFE_FINAL_OPERATOR_CLOSEOUT_INDEX_REF_PATTERN.test(sanitizedFinalOperatorCloseoutIndexRef)) {
    blockingReasonCodes.push("final_operator_closeout_index_ref_invalid")
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push("final_operator_closeout_index_product_log_evidence_ref_invalid")
  }
  const finalOperatorCloseoutAcknowledgementRef =
    input.finalOperatorCloseoutAcknowledgementRef.trim()
  if (!SAFE_FINAL_OPERATOR_CLOSEOUT_ACK_REF_PATTERN.test(finalOperatorCloseoutAcknowledgementRef)) {
    blockingReasonCodes.push("final_operator_closeout_index_ack_ref_invalid")
  }

  if (blockingReasonCodes.length > 0 || operatorFinalCloseoutAcknowledgementReceiptId === undefined) {
    return baseResult({
      status: "blocked",
      reasonCode: "active_tab_info_final_operator_closeout_index_blocked",
      blockingReasonCodes,
    })
  }

  const indexStatus = "ready"
  return baseResult({
    status: "final_operator_closeout_index_ready",
    reasonCode: "active_tab_info_final_operator_closeout_index_ready",
    index: Object.freeze({
      finalOperatorCloseoutIndexId:
        buildFinalOperatorCloseoutIndexId({
          operatorFinalCloseoutAcknowledgementReceiptId,
          sanitizedFinalOperatorCloseoutIndexRef,
          productLogEvidenceRef,
          finalOperatorCloseoutAcknowledgementRef,
          indexStatus,
        }),
      operatorFinalCloseoutAcknowledgementReceiptId,
      sanitizedFinalOperatorCloseoutIndexRef,
      productLogEvidenceRef,
      finalOperatorCloseoutAcknowledgementRef,
      indexStatus,
    }),
  })
}
