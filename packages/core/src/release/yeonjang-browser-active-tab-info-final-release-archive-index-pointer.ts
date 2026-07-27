import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoOperatorReleaseArchiveCompletionNotice,
} from "./yeonjang-browser-active-tab-info-operator-release-archive-completion-notice.js"

export type YeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointerStatus = "ready"

export type YeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointerBlockingReasonCode =
  | "final_release_archive_index_pointer_notice_not_ready"
  | "final_release_archive_index_pointer_ref_invalid"
  | "final_release_archive_index_pointer_product_log_evidence_ref_invalid"
  | "final_release_archive_index_pointer_retention_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointerInput {
  operatorReleaseArchiveCompletionNotice: YeonjangBrowserActiveTabInfoOperatorReleaseArchiveCompletionNotice
  sanitizedReleaseArchiveIndexPointerRef: string
  productLogEvidenceRef: string
  archiveIndexRetentionAcknowledgementRef: string
}

export type YeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointer = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-release-archive-index-pointer.v1"
  method: "browser.active_tab_info"
  status: "final_release_archive_index_pointer_ready" | "blocked"
  reasonCode:
    | "active_tab_info_final_release_archive_index_pointer_ready"
    | "active_tab_info_final_release_archive_index_pointer_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointerBlockingReasonCode[]
  pointer?: Readonly<{
    finalReleaseArchiveIndexPointerId: string
    operatorReleaseArchiveCompletionNoticeId: string
    sanitizedReleaseArchiveIndexPointerRef: string
    productLogEvidenceRef: string
    archiveIndexRetentionAcknowledgementRef: string
    pointerStatus: YeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointerStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_RELEASE_ARCHIVE_INDEX_POINTER_REF_PATTERN =
  /^release-archive-index-pointer:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_ARCHIVE_INDEX_RETENTION_ACK_REF_PATTERN =
  /^archive-index-retention:active-tab-info:ack:[a-z0-9._:-]+$/u

function extractOperatorReleaseArchiveCompletionNoticeId(
  notice: YeonjangBrowserActiveTabInfoOperatorReleaseArchiveCompletionNotice,
): string | undefined {
  if (notice.status !== "operator_release_archive_completion_notice_ready" || notice.notice === undefined) {
    return undefined
  }
  return notice.notice.operatorReleaseArchiveCompletionNoticeId
}

function buildFinalReleaseArchiveIndexPointerId(input: {
  operatorReleaseArchiveCompletionNoticeId: string
  sanitizedReleaseArchiveIndexPointerRef: string
  productLogEvidenceRef: string
  archiveIndexRetentionAcknowledgementRef: string
  pointerStatus: YeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointerStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.operatorReleaseArchiveCompletionNoticeId,
    input.sanitizedReleaseArchiveIndexPointerRef,
    input.productLogEvidenceRef,
    input.archiveIndexRetentionAcknowledgementRef,
    input.pointerStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `final-release-archive-index-pointer:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointer["status"]
  reasonCode: YeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointer["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointerBlockingReasonCode[]
  pointer?: YeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointer["pointer"]
}): YeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointer {
  return Object.freeze({
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-release-archive-index-pointer.v1",
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

export function buildYeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointer(
  input: YeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointerInput,
): YeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointer {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointerBlockingReasonCode[] = []
  const operatorReleaseArchiveCompletionNoticeId =
    extractOperatorReleaseArchiveCompletionNoticeId(input.operatorReleaseArchiveCompletionNotice)
  if (operatorReleaseArchiveCompletionNoticeId === undefined) {
    blockingReasonCodes.push("final_release_archive_index_pointer_notice_not_ready")
  }
  const sanitizedReleaseArchiveIndexPointerRef =
    input.sanitizedReleaseArchiveIndexPointerRef.trim()
  if (!SAFE_RELEASE_ARCHIVE_INDEX_POINTER_REF_PATTERN.test(sanitizedReleaseArchiveIndexPointerRef)) {
    blockingReasonCodes.push("final_release_archive_index_pointer_ref_invalid")
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push("final_release_archive_index_pointer_product_log_evidence_ref_invalid")
  }
  const archiveIndexRetentionAcknowledgementRef =
    input.archiveIndexRetentionAcknowledgementRef.trim()
  if (!SAFE_ARCHIVE_INDEX_RETENTION_ACK_REF_PATTERN.test(archiveIndexRetentionAcknowledgementRef)) {
    blockingReasonCodes.push("final_release_archive_index_pointer_retention_ack_ref_invalid")
  }

  if (blockingReasonCodes.length > 0 || operatorReleaseArchiveCompletionNoticeId === undefined) {
    return baseResult({
      status: "blocked",
      reasonCode: "active_tab_info_final_release_archive_index_pointer_blocked",
      blockingReasonCodes,
    })
  }

  const pointerStatus = "ready"
  return baseResult({
    status: "final_release_archive_index_pointer_ready",
    reasonCode: "active_tab_info_final_release_archive_index_pointer_ready",
    pointer: Object.freeze({
      finalReleaseArchiveIndexPointerId: buildFinalReleaseArchiveIndexPointerId({
        operatorReleaseArchiveCompletionNoticeId,
        sanitizedReleaseArchiveIndexPointerRef,
        productLogEvidenceRef,
        archiveIndexRetentionAcknowledgementRef,
        pointerStatus,
      }),
      operatorReleaseArchiveCompletionNoticeId,
      sanitizedReleaseArchiveIndexPointerRef,
      productLogEvidenceRef,
      archiveIndexRetentionAcknowledgementRef,
      pointerStatus,
    }),
  })
}
