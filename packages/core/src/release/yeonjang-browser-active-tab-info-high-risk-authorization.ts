import type {
  YeonjangBrowserActiveTabInfoActivationScope,
} from "./yeonjang-browser-active-tab-info-activation-request.js"

export type YeonjangBrowserActiveTabInfoHighRiskAuthorizationScope =
  "runtime_activation_executor"

export interface YeonjangBrowserActiveTabInfoHighRiskAuthorizationInput {
  operatorIdentityProof: string
  authorizationScope: YeonjangBrowserActiveTabInfoHighRiskAuthorizationScope
  targetSurfaces: readonly YeonjangBrowserActiveTabInfoActivationScope[]
  rollbackAcknowledged: boolean
  postCheckAcknowledged: boolean
  auditReference: string
  authorizedAt: string
  expiresAt: string
}

export interface YeonjangBrowserActiveTabInfoHighRiskAuthorizationOptions {
  now: Date
}

export type YeonjangBrowserActiveTabInfoHighRiskAuthorizationBlockingReasonCode =
  | "high_risk_authorization_operator_identity_proof_required"
  | "high_risk_authorization_operator_identity_proof_unsafe"
  | "high_risk_authorization_scope_required"
  | "high_risk_authorization_target_surfaces_required"
  | "high_risk_authorization_rollback_acknowledgement_required"
  | "high_risk_authorization_post_check_acknowledgement_required"
  | "high_risk_authorization_audit_reference_required"
  | "high_risk_authorization_audit_reference_unsafe"
  | "high_risk_authorization_authorized_at_invalid"
  | "high_risk_authorization_expires_at_invalid"
  | "high_risk_authorization_expired"

export type YeonjangBrowserActiveTabInfoHighRiskAuthorization = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-high-risk-authorization.v1"
  method: "browser.active_tab_info"
  status: "accepted" | "rejected"
  reasonCode:
    | "active_tab_info_high_risk_authorization_accepted"
    | "active_tab_info_high_risk_authorization_invalid"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoHighRiskAuthorizationBlockingReasonCode[]
  authorization?: Readonly<{
    authorizationScope: YeonjangBrowserActiveTabInfoHighRiskAuthorizationScope
    targetSurfaces: readonly YeonjangBrowserActiveTabInfoActivationScope[]
    rollbackAcknowledged: true
    postCheckAcknowledged: true
    auditReference: string
    authorizedAt: string
    expiresAt: string
  }>
  executeNow: false
  addRustDispatchNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const UNSAFE_PATTERN = /(?:https?:\/\/|\/Users\/|token=|operator-secret)/iu

function hasText(value: string): boolean {
  return value.trim().length > 0
}

function parseDate(value: string): Date | undefined {
  if (!hasText(value)) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoHighRiskAuthorization["status"]
  reasonCode: YeonjangBrowserActiveTabInfoHighRiskAuthorization["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoHighRiskAuthorizationBlockingReasonCode[]
  authorization?: YeonjangBrowserActiveTabInfoHighRiskAuthorization["authorization"]
}): YeonjangBrowserActiveTabInfoHighRiskAuthorization {
  return Object.freeze({
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-high-risk-authorization.v1",
    method: "browser.active_tab_info",
    status: input.status,
    reasonCode: input.reasonCode,
    ...(input.blockingReasonCodes === undefined
      ? {}
      : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
    ...(input.authorization === undefined ? {} : { authorization: input.authorization }),
    executeNow: false,
    addRustDispatchNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
  })
}

export function buildYeonjangBrowserActiveTabInfoHighRiskAuthorization(
  input: YeonjangBrowserActiveTabInfoHighRiskAuthorizationInput,
  options: YeonjangBrowserActiveTabInfoHighRiskAuthorizationOptions,
): YeonjangBrowserActiveTabInfoHighRiskAuthorization {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoHighRiskAuthorizationBlockingReasonCode[] = []
  if (!hasText(input.operatorIdentityProof)) {
    blockingReasonCodes.push("high_risk_authorization_operator_identity_proof_required")
  } else if (UNSAFE_PATTERN.test(input.operatorIdentityProof)) {
    blockingReasonCodes.push("high_risk_authorization_operator_identity_proof_unsafe")
  }
  if (input.authorizationScope !== "runtime_activation_executor") {
    blockingReasonCodes.push("high_risk_authorization_scope_required")
  }
  if (input.targetSurfaces.length === 0) {
    blockingReasonCodes.push("high_risk_authorization_target_surfaces_required")
  }
  if (!input.rollbackAcknowledged) {
    blockingReasonCodes.push("high_risk_authorization_rollback_acknowledgement_required")
  }
  if (!input.postCheckAcknowledged) {
    blockingReasonCodes.push("high_risk_authorization_post_check_acknowledgement_required")
  }
  if (!hasText(input.auditReference)) {
    blockingReasonCodes.push("high_risk_authorization_audit_reference_required")
  } else if (UNSAFE_PATTERN.test(input.auditReference)) {
    blockingReasonCodes.push("high_risk_authorization_audit_reference_unsafe")
  }

  const authorizedAt = parseDate(input.authorizedAt)
  const expiresAt = parseDate(input.expiresAt)
  if (authorizedAt === undefined) {
    blockingReasonCodes.push("high_risk_authorization_authorized_at_invalid")
  }
  if (expiresAt === undefined) {
    blockingReasonCodes.push("high_risk_authorization_expires_at_invalid")
  } else if (expiresAt.getTime() <= options.now.getTime()) {
    blockingReasonCodes.push("high_risk_authorization_expired")
  }

  if (blockingReasonCodes.length > 0) {
    return baseResult({
      status: "rejected",
      reasonCode: "active_tab_info_high_risk_authorization_invalid",
      blockingReasonCodes,
    })
  }

  return baseResult({
    status: "accepted",
    reasonCode: "active_tab_info_high_risk_authorization_accepted",
    authorization: Object.freeze({
      authorizationScope: input.authorizationScope,
      targetSurfaces: Object.freeze([...input.targetSurfaces]),
      rollbackAcknowledged: true,
      postCheckAcknowledged: true,
      auditReference: input.auditReference.trim(),
      authorizedAt: authorizedAt?.toISOString() ?? input.authorizedAt,
      expiresAt: expiresAt?.toISOString() ?? input.expiresAt,
    }),
  })
}
