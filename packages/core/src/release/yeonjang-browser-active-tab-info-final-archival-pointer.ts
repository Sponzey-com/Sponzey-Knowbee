import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummary,
} from "./yeonjang-browser-active-tab-info-operator-readable-closeout-summary.js"

export type YeonjangBrowserActiveTabInfoFinalArchivalPointerStatus = "ready"

export type YeonjangBrowserActiveTabInfoFinalArchivalPointerBlockingReasonCode =
  | "final_archival_pointer_closeout_summary_not_ready"
  | "final_archival_pointer_archive_descriptor_ref_invalid"
  | "final_archival_pointer_product_log_evidence_ref_invalid"
  | "final_archival_pointer_retention_policy_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoFinalArchivalPointerInput {
  operatorReadableCloseoutSummary: YeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummary
  sanitizedArchiveDescriptorRef: string
  productLogEvidenceRef: string
  retentionPolicyAcknowledgementRef: string
}

export type YeonjangBrowserActiveTabInfoFinalArchivalPointer = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-archival-pointer.v1"
  method: "browser.active_tab_info"
  status: "final_archival_pointer_ready" | "blocked"
  reasonCode:
    | "active_tab_info_final_archival_pointer_ready"
    | "active_tab_info_final_archival_pointer_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalArchivalPointerBlockingReasonCode[]
  pointer?: Readonly<{
    finalArchivalPointerId: string
    operatorReadableCloseoutSummaryId: string
    sanitizedArchiveDescriptorRef: string
    productLogEvidenceRef: string
    retentionPolicyAcknowledgementRef: string
    archivalPointerStatus: YeonjangBrowserActiveTabInfoFinalArchivalPointerStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_ARCHIVE_DESCRIPTOR_REF_PATTERN =
  /^archive-descriptor:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_RETENTION_POLICY_ACK_REF_PATTERN =
  /^retention-policy:active-tab-info:ack:[a-z0-9._:-]+$/u

function extractOperatorReadableCloseoutSummaryId(
  summary: YeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummary,
): string | undefined {
  if (summary.status !== "operator_readable_closeout_summary_ready" || summary.summary === undefined) {
    return undefined
  }
  return summary.summary.operatorReadableCloseoutSummaryId
}

function buildFinalArchivalPointerId(input: {
  operatorReadableCloseoutSummaryId: string
  sanitizedArchiveDescriptorRef: string
  productLogEvidenceRef: string
  retentionPolicyAcknowledgementRef: string
  archivalPointerStatus: YeonjangBrowserActiveTabInfoFinalArchivalPointerStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.operatorReadableCloseoutSummaryId,
    input.sanitizedArchiveDescriptorRef,
    input.productLogEvidenceRef,
    input.retentionPolicyAcknowledgementRef,
    input.archivalPointerStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `final-archival-pointer:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoFinalArchivalPointer["status"]
  reasonCode: YeonjangBrowserActiveTabInfoFinalArchivalPointer["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalArchivalPointerBlockingReasonCode[]
  pointer?: YeonjangBrowserActiveTabInfoFinalArchivalPointer["pointer"]
}): YeonjangBrowserActiveTabInfoFinalArchivalPointer {
  return Object.freeze({
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-archival-pointer.v1",
    method: "browser.active_tab_info",
    status: input.status,
    reasonCode: input.reasonCode,
    ...(input.blockingReasonCodes === undefined
      ? {}
      : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
    ...(input.pointer === undefined ? {} : { pointer: input.pointer }),
    releaseReadinessNow: false,
    publicationReadinessNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
  })
}

export function buildYeonjangBrowserActiveTabInfoFinalArchivalPointer(
  input: YeonjangBrowserActiveTabInfoFinalArchivalPointerInput,
): YeonjangBrowserActiveTabInfoFinalArchivalPointer {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoFinalArchivalPointerBlockingReasonCode[] = []
  const operatorReadableCloseoutSummaryId = extractOperatorReadableCloseoutSummaryId(
    input.operatorReadableCloseoutSummary,
  )
  if (operatorReadableCloseoutSummaryId === undefined) {
    blockingReasonCodes.push("final_archival_pointer_closeout_summary_not_ready")
  }
  const sanitizedArchiveDescriptorRef = input.sanitizedArchiveDescriptorRef.trim()
  if (!SAFE_ARCHIVE_DESCRIPTOR_REF_PATTERN.test(sanitizedArchiveDescriptorRef)) {
    blockingReasonCodes.push("final_archival_pointer_archive_descriptor_ref_invalid")
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push("final_archival_pointer_product_log_evidence_ref_invalid")
  }
  const retentionPolicyAcknowledgementRef = input.retentionPolicyAcknowledgementRef.trim()
  if (!SAFE_RETENTION_POLICY_ACK_REF_PATTERN.test(retentionPolicyAcknowledgementRef)) {
    blockingReasonCodes.push("final_archival_pointer_retention_policy_ack_ref_invalid")
  }

  if (blockingReasonCodes.length > 0 || operatorReadableCloseoutSummaryId === undefined) {
    return baseResult({
      status: "blocked",
      reasonCode: "active_tab_info_final_archival_pointer_blocked",
      blockingReasonCodes,
    })
  }

  const archivalPointerStatus = "ready"
  return baseResult({
    status: "final_archival_pointer_ready",
    reasonCode: "active_tab_info_final_archival_pointer_ready",
    pointer: Object.freeze({
      finalArchivalPointerId: buildFinalArchivalPointerId({
        operatorReadableCloseoutSummaryId,
        sanitizedArchiveDescriptorRef,
        productLogEvidenceRef,
        retentionPolicyAcknowledgementRef,
        archivalPointerStatus,
      }),
      operatorReadableCloseoutSummaryId,
      sanitizedArchiveDescriptorRef,
      productLogEvidenceRef,
      retentionPolicyAcknowledgementRef,
      archivalPointerStatus,
    }),
  })
}
