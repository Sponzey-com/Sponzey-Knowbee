import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoOperatorCompletionNotice,
} from "./yeonjang-browser-active-tab-info-operator-completion-notice.js"

export type YeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummaryStatus = "ready"

export type YeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummaryBlockingReasonCode =
  | "operator_readable_closeout_summary_notice_not_ready"
  | "operator_readable_closeout_summary_ref_invalid"
  | "operator_readable_closeout_summary_product_log_evidence_ref_invalid"
  | "operator_readable_closeout_summary_audit_handoff_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummaryInput {
  operatorCompletionNotice: YeonjangBrowserActiveTabInfoOperatorCompletionNotice
  sanitizedCloseoutSummaryRef: string
  productLogEvidenceRef: string
  auditHandoffAcknowledgementRef: string
}

export type YeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummary = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-readable-closeout-summary.v1"
  method: "browser.active_tab_info"
  status: "operator_readable_closeout_summary_ready" | "blocked"
  reasonCode:
    | "active_tab_info_operator_readable_closeout_summary_ready"
    | "active_tab_info_operator_readable_closeout_summary_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummaryBlockingReasonCode[]
  summary?: Readonly<{
    operatorReadableCloseoutSummaryId: string
    operatorCompletionNoticeId: string
    sanitizedCloseoutSummaryRef: string
    productLogEvidenceRef: string
    auditHandoffAcknowledgementRef: string
    summaryStatus: YeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummaryStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_CLOSEOUT_SUMMARY_REF_PATTERN =
  /^operator-readable-closeout-summary:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_AUDIT_HANDOFF_ACK_REF_PATTERN =
  /^audit-handoff:active-tab-info:ack:[a-z0-9._:-]+$/u

function extractOperatorCompletionNoticeId(
  notice: YeonjangBrowserActiveTabInfoOperatorCompletionNotice,
): string | undefined {
  if (notice.status !== "operator_completion_notice_ready" || notice.notice === undefined) {
    return undefined
  }
  return notice.notice.operatorCompletionNoticeId
}

function buildOperatorReadableCloseoutSummaryId(input: {
  operatorCompletionNoticeId: string
  sanitizedCloseoutSummaryRef: string
  productLogEvidenceRef: string
  auditHandoffAcknowledgementRef: string
  summaryStatus: YeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummaryStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.operatorCompletionNoticeId,
    input.sanitizedCloseoutSummaryRef,
    input.productLogEvidenceRef,
    input.auditHandoffAcknowledgementRef,
    input.summaryStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `operator-readable-closeout-summary:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummary["status"]
  reasonCode: YeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummary["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummaryBlockingReasonCode[]
  summary?: YeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummary["summary"]
}): YeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummary {
  return Object.freeze({
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-readable-closeout-summary.v1",
    method: "browser.active_tab_info",
    status: input.status,
    reasonCode: input.reasonCode,
    ...(input.blockingReasonCodes === undefined
      ? {}
      : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
    ...(input.summary === undefined ? {} : { summary: input.summary }),
    releaseReadinessNow: false,
    publicationReadinessNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
  })
}

export function buildYeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummary(
  input: YeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummaryInput,
): YeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummary {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummaryBlockingReasonCode[] = []
  const operatorCompletionNoticeId = extractOperatorCompletionNoticeId(input.operatorCompletionNotice)
  if (operatorCompletionNoticeId === undefined) {
    blockingReasonCodes.push("operator_readable_closeout_summary_notice_not_ready")
  }
  const sanitizedCloseoutSummaryRef = input.sanitizedCloseoutSummaryRef.trim()
  if (!SAFE_CLOSEOUT_SUMMARY_REF_PATTERN.test(sanitizedCloseoutSummaryRef)) {
    blockingReasonCodes.push("operator_readable_closeout_summary_ref_invalid")
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push("operator_readable_closeout_summary_product_log_evidence_ref_invalid")
  }
  const auditHandoffAcknowledgementRef = input.auditHandoffAcknowledgementRef.trim()
  if (!SAFE_AUDIT_HANDOFF_ACK_REF_PATTERN.test(auditHandoffAcknowledgementRef)) {
    blockingReasonCodes.push("operator_readable_closeout_summary_audit_handoff_ack_ref_invalid")
  }

  if (blockingReasonCodes.length > 0 || operatorCompletionNoticeId === undefined) {
    return baseResult({
      status: "blocked",
      reasonCode: "active_tab_info_operator_readable_closeout_summary_blocked",
      blockingReasonCodes,
    })
  }

  const summaryStatus = "ready"
  return baseResult({
    status: "operator_readable_closeout_summary_ready",
    reasonCode: "active_tab_info_operator_readable_closeout_summary_ready",
    summary: Object.freeze({
      operatorReadableCloseoutSummaryId: buildOperatorReadableCloseoutSummaryId({
        operatorCompletionNoticeId,
        sanitizedCloseoutSummaryRef,
        productLogEvidenceRef,
        auditHandoffAcknowledgementRef,
        summaryStatus,
      }),
      operatorCompletionNoticeId,
      sanitizedCloseoutSummaryRef,
      productLogEvidenceRef,
      auditHandoffAcknowledgementRef,
      summaryStatus,
    }),
  })
}
