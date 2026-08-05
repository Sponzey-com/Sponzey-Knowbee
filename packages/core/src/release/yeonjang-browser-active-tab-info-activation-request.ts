import type {
  YeonjangBrowserActiveTabInfoLiveEnablePrerequisitesProjection,
} from "./yeonjang-browser-active-tab-info-live-enable-prerequisites.js"

export type YeonjangBrowserActiveTabInfoActivationTargetPlatform =
  | "macos"
  | "windows"
  | "linux"

export type YeonjangBrowserActiveTabInfoActivationScope =
  | "rust_live_handler"
  | "skill_mapping"
  | "production_binding"
  | "default_live_smoke"

export interface YeonjangBrowserActiveTabInfoActivationRequestInput {
  prerequisiteProjection: YeonjangBrowserActiveTabInfoLiveEnablePrerequisitesProjection
  manualApprovalReference: string
  targetPlatform: YeonjangBrowserActiveTabInfoActivationTargetPlatform
  operatorIdentityProof: string
  rollbackRequirement: string
  explicitEnableScope: readonly YeonjangBrowserActiveTabInfoActivationScope[]
}

export type YeonjangBrowserActiveTabInfoActivationRequestBlockingReasonCode =
  | "activation_request_prerequisites_not_ready"
  | "activation_request_manual_approval_reference_required"
  | "activation_request_target_platform_required"
  | "activation_request_operator_identity_proof_required"
  | "activation_request_rollback_requirement_required"
  | "activation_request_explicit_enable_scope_required"

export interface YeonjangBrowserActiveTabInfoActivationRequestPayload {
  manualApprovalReference: string
  targetPlatform: YeonjangBrowserActiveTabInfoActivationTargetPlatform
  operatorIdentityProof: string
  rollbackRequirement: string
  explicitEnableScope: readonly YeonjangBrowserActiveTabInfoActivationScope[]
}

export type YeonjangBrowserActiveTabInfoActivationRequest =
  | {
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-activation-request.v1"
      method: "browser.active_tab_info"
      status: "activation_request_ready"
      blockingReasonCodes: readonly []
      activationRequest: Readonly<YeonjangBrowserActiveTabInfoActivationRequestPayload>
      executeNow: false
      addRustDispatchNow: false
      enableSkillMappingNow: false
      addProductionBindingNow: false
      enableDefaultLiveSmokeNow: false
    }
  | {
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-activation-request.v1"
      method: "browser.active_tab_info"
      status: "blocked"
      blockingReasonCodes: readonly YeonjangBrowserActiveTabInfoActivationRequestBlockingReasonCode[]
      activationRequest?: undefined
      executeNow: false
      addRustDispatchNow: false
      enableSkillMappingNow: false
      addProductionBindingNow: false
      enableDefaultLiveSmokeNow: false
    }

const UNSAFE_DETAIL_PATTERN = /(?:https?:\/\/|\/Users\/|token=|raw title|raw url|tabId|windowId)/giu

function sanitizedValue(value: string): string {
  return value.replace(UNSAFE_DETAIL_PATTERN, "[redacted]").trim()
}

function hasText(value: string): boolean {
  return sanitizedValue(value).length > 0
}

export function buildYeonjangBrowserActiveTabInfoActivationRequest(
  input: YeonjangBrowserActiveTabInfoActivationRequestInput,
): YeonjangBrowserActiveTabInfoActivationRequest {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoActivationRequestBlockingReasonCode[] = []

  if (input.prerequisiteProjection.status !== "ready_for_explicit_enable_task") {
    blockingReasonCodes.push("activation_request_prerequisites_not_ready")
  }
  if (!hasText(input.manualApprovalReference)) {
    blockingReasonCodes.push("activation_request_manual_approval_reference_required")
  }
  if (!hasText(input.targetPlatform)) {
    blockingReasonCodes.push("activation_request_target_platform_required")
  }
  if (!hasText(input.operatorIdentityProof)) {
    blockingReasonCodes.push("activation_request_operator_identity_proof_required")
  }
  if (!hasText(input.rollbackRequirement)) {
    blockingReasonCodes.push("activation_request_rollback_requirement_required")
  }
  if (input.explicitEnableScope.length === 0) {
    blockingReasonCodes.push("activation_request_explicit_enable_scope_required")
  }

  const base = {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-activation-request.v1",
    method: "browser.active_tab_info",
    executeNow: false,
    addRustDispatchNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
  } as const

  if (blockingReasonCodes.length > 0) {
    return Object.freeze({
      ...base,
      status: "blocked",
      blockingReasonCodes: Object.freeze([...blockingReasonCodes]),
    })
  }

  return Object.freeze({
    ...base,
    status: "activation_request_ready",
    blockingReasonCodes: Object.freeze([]) as readonly [],
    activationRequest: Object.freeze({
      manualApprovalReference: sanitizedValue(input.manualApprovalReference),
      targetPlatform: input.targetPlatform,
      operatorIdentityProof: sanitizedValue(input.operatorIdentityProof),
      rollbackRequirement: sanitizedValue(input.rollbackRequirement),
      explicitEnableScope: Object.freeze([...input.explicitEnableScope]),
    }),
  })
}
