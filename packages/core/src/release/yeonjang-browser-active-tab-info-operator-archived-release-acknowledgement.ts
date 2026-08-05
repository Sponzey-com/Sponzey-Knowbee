import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoFinalArchivedReleaseClosureMarker,
} from "./yeonjang-browser-active-tab-info-final-archived-release-closure-marker.js"

export type YeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgementStatus = "ready"

export type YeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgementBlockingReasonCode =
  | "operator_archived_release_acknowledgement_marker_not_ready"
  | "operator_archived_release_acknowledgement_ref_invalid"
  | "operator_archived_release_acknowledgement_product_log_evidence_ref_invalid"
  | "operator_archived_release_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgementInput {
  finalArchivedReleaseClosureMarker: YeonjangBrowserActiveTabInfoFinalArchivedReleaseClosureMarker
  sanitizedArchivedReleaseAcknowledgementRef: string
  productLogEvidenceRef: string
  operatorArchivedReleaseAcknowledgementRef: string
}

export type YeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgement = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-archived-release-acknowledgement.v1"
  method: "browser.active_tab_info"
  status: "operator_archived_release_acknowledgement_ready" | "blocked"
  reasonCode:
    | "active_tab_info_operator_archived_release_acknowledgement_ready"
    | "active_tab_info_operator_archived_release_acknowledgement_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgementBlockingReasonCode[]
  acknowledgement?: Readonly<{
    operatorArchivedReleaseAcknowledgementId: string
    finalArchivedReleaseClosureMarkerId: string
    sanitizedArchivedReleaseAcknowledgementRef: string
    productLogEvidenceRef: string
    operatorArchivedReleaseAcknowledgementRef: string
    acknowledgementStatus: YeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgementStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_ARCHIVED_RELEASE_ACKNOWLEDGEMENT_REF_PATTERN =
  /^archived-release-acknowledgement:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_OPERATOR_ARCHIVED_RELEASE_ACK_REF_PATTERN =
  /^operator-archived-release:active-tab-info:ack:[a-z0-9._:-]+$/u

function extractFinalArchivedReleaseClosureMarkerId(
  marker: YeonjangBrowserActiveTabInfoFinalArchivedReleaseClosureMarker,
): string | undefined {
  if (marker.status !== "final_archived_release_closure_marker_ready" || marker.marker === undefined) {
    return undefined
  }
  return marker.marker.finalArchivedReleaseClosureMarkerId
}

function buildOperatorArchivedReleaseAcknowledgementId(input: {
  finalArchivedReleaseClosureMarkerId: string
  sanitizedArchivedReleaseAcknowledgementRef: string
  productLogEvidenceRef: string
  operatorArchivedReleaseAcknowledgementRef: string
  acknowledgementStatus: YeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgementStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.finalArchivedReleaseClosureMarkerId,
    input.sanitizedArchivedReleaseAcknowledgementRef,
    input.productLogEvidenceRef,
    input.operatorArchivedReleaseAcknowledgementRef,
    input.acknowledgementStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `operator-archived-release-acknowledgement:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgement["status"]
  reasonCode: YeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgement["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgementBlockingReasonCode[]
  acknowledgement?: YeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgement["acknowledgement"]
}): YeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgement {
  return Object.freeze({
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-archived-release-acknowledgement.v1",
    method: "browser.active_tab_info",
    status: input.status,
    reasonCode: input.reasonCode,
    ...(input.blockingReasonCodes === undefined
      ? {}
      : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
    ...(input.acknowledgement === undefined ? {} : { acknowledgement: input.acknowledgement }),
    releaseReadinessNow: false,
    publicationReadinessNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
  })
}

export function buildYeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgement(
  input: YeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgementInput,
): YeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgement {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgementBlockingReasonCode[] = []
  const finalArchivedReleaseClosureMarkerId =
    extractFinalArchivedReleaseClosureMarkerId(input.finalArchivedReleaseClosureMarker)
  if (finalArchivedReleaseClosureMarkerId === undefined) {
    blockingReasonCodes.push("operator_archived_release_acknowledgement_marker_not_ready")
  }
  const sanitizedArchivedReleaseAcknowledgementRef =
    input.sanitizedArchivedReleaseAcknowledgementRef.trim()
  if (!SAFE_ARCHIVED_RELEASE_ACKNOWLEDGEMENT_REF_PATTERN.test(sanitizedArchivedReleaseAcknowledgementRef)) {
    blockingReasonCodes.push("operator_archived_release_acknowledgement_ref_invalid")
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push("operator_archived_release_acknowledgement_product_log_evidence_ref_invalid")
  }
  const operatorArchivedReleaseAcknowledgementRef =
    input.operatorArchivedReleaseAcknowledgementRef.trim()
  if (!SAFE_OPERATOR_ARCHIVED_RELEASE_ACK_REF_PATTERN.test(operatorArchivedReleaseAcknowledgementRef)) {
    blockingReasonCodes.push("operator_archived_release_ack_ref_invalid")
  }

  if (blockingReasonCodes.length > 0 || finalArchivedReleaseClosureMarkerId === undefined) {
    return baseResult({
      status: "blocked",
      reasonCode: "active_tab_info_operator_archived_release_acknowledgement_blocked",
      blockingReasonCodes,
    })
  }

  const acknowledgementStatus = "ready"
  return baseResult({
    status: "operator_archived_release_acknowledgement_ready",
    reasonCode: "active_tab_info_operator_archived_release_acknowledgement_ready",
    acknowledgement: Object.freeze({
      operatorArchivedReleaseAcknowledgementId: buildOperatorArchivedReleaseAcknowledgementId({
        finalArchivedReleaseClosureMarkerId,
        sanitizedArchivedReleaseAcknowledgementRef,
        productLogEvidenceRef,
        operatorArchivedReleaseAcknowledgementRef,
        acknowledgementStatus,
      }),
      finalArchivedReleaseClosureMarkerId,
      sanitizedArchivedReleaseAcknowledgementRef,
      productLogEvidenceRef,
      operatorArchivedReleaseAcknowledgementRef,
      acknowledgementStatus,
    }),
  })
}
