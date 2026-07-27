import {
  YEONJANG_BROWSER_FOCUS_CONTRACT,
  type YeonjangBrowserFocusPreflightDecision,
} from "../capabilities/yeonjang-browser-focus-contract.js"
import type { YeonjangBrowserFocusRegistrationPreconditionDecision } from "./yeonjang-browser-focus-registration-precondition.js"

export interface YeonjangBrowserFocusToolDescriptorSkeleton {
  toolName: "yeonjang_browser_focus"
  method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
  riskLevel: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.riskLevel
  sideEffectClass: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.sideEffectClass
  permissionSetting: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.permissionSetting
  requiresApproval: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.requiresApproval
  runtimeHealthMode: "required"
  postCheckMode: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.postCheckMode
  rawPayloadVisibility: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.rawPayloadVisibility
  defaultLiveSmokeAllowed: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.defaultLiveSmokeAllowed
}

export interface YeonjangBrowserFocusCommandSkeletonIntegrationInput {
  status: "skeleton_ready" | "skeleton_blocked"
  reasonCode: string
  commandAccepted: false
  executeOsFocusNow: false
  postCheckMode: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.postCheckMode
  auditOnlyFields: readonly string[]
}

export type YeonjangBrowserFocusToolDescriptorIntegrationGate =
  | "tool_descriptor"
  | "side_effect_method_contract"
  | "approval_preflight"
  | "registration_precondition"
  | "command_skeleton"
  | "focused_target_observation_backend"
  | "raw_payload_redaction"

export type YeonjangBrowserFocusToolDescriptorIntegrationSkeletonReasonCode =
  | "browser_focus_tool_descriptor_integration_skeleton_ready"
  | "tool_not_registered"
  | "descriptor_contract_mismatch"
  | "production_exposure_not_executable"
  | "side_effect_method_contract_not_bound"
  | "side_effect_authorization_required"
  | "preflight_not_ready"
  | "command_skeleton_not_ready"
  | "focused_target_observation_backend_required"

export type YeonjangBrowserFocusToolDescriptorIntegrationSkeleton =
  | {
      status: "integration_skeleton_ready"
      reasonCode: "browser_focus_tool_descriptor_integration_skeleton_ready"
      method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
      toolName: "yeonjang_browser_focus"
      addProductionBindingNow: false
      executable: false
      dispatcherIntegrationNow: false
      descriptor: YeonjangBrowserFocusToolDescriptorSkeleton
      requiredGates: YeonjangBrowserFocusToolDescriptorIntegrationGate[]
    }
  | {
      status: "integration_blocked"
      reasonCode: Exclude<
        YeonjangBrowserFocusToolDescriptorIntegrationSkeletonReasonCode,
        "browser_focus_tool_descriptor_integration_skeleton_ready"
      >
      method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
      toolName: "yeonjang_browser_focus"
      addProductionBindingNow: false
      executable: false
      dispatcherIntegrationNow: false
      blockedBy: string
      requiredGates: YeonjangBrowserFocusToolDescriptorIntegrationGate[]
    }

const REQUIRED_GATES: YeonjangBrowserFocusToolDescriptorIntegrationGate[] = [
  "tool_descriptor",
  "side_effect_method_contract",
  "approval_preflight",
  "registration_precondition",
  "command_skeleton",
  "focused_target_observation_backend",
  "raw_payload_redaction",
]

export function evaluateYeonjangBrowserFocusToolDescriptorIntegrationSkeleton(input: {
  descriptor?: YeonjangBrowserFocusToolDescriptorSkeleton | undefined
  registrationPrecondition: YeonjangBrowserFocusRegistrationPreconditionDecision
  sideEffectMethodContractBound: boolean
  preflight: YeonjangBrowserFocusPreflightDecision
  commandSkeleton: YeonjangBrowserFocusCommandSkeletonIntegrationInput
  focusedTargetObservationBackendReady: boolean
}): YeonjangBrowserFocusToolDescriptorIntegrationSkeleton {
  if (!input.descriptor) {
    return blockedToolDescriptorIntegration("tool_not_registered", "missing_tool_descriptor")
  }
  if (!descriptorMatchesBrowserFocusContract(input.descriptor)) {
    return blockedToolDescriptorIntegration("descriptor_contract_mismatch", "tool_descriptor")
  }
  if (!input.sideEffectMethodContractBound) {
    return blockedToolDescriptorIntegration(
      "side_effect_method_contract_not_bound",
      "side_effect_method_contract",
    )
  }
  if (input.registrationPrecondition.status !== "registration_ready") {
    return blockedToolDescriptorIntegration(
      "production_exposure_not_executable",
      input.registrationPrecondition.reasonCode === "production_exposure_not_executable"
        ? input.registrationPrecondition.blockedBy
        : input.registrationPrecondition.reasonCode,
    )
  }
  if (input.preflight.reasonCode === "side_effect_authorization_required") {
    return blockedToolDescriptorIntegration("side_effect_authorization_required", "approval_preflight")
  }
  if (input.preflight.status !== "ready") {
    return blockedToolDescriptorIntegration("preflight_not_ready", input.preflight.reasonCode)
  }
  if (input.commandSkeleton.status !== "skeleton_ready") {
    return blockedToolDescriptorIntegration("command_skeleton_not_ready", input.commandSkeleton.reasonCode)
  }
  if (!input.focusedTargetObservationBackendReady) {
    return blockedToolDescriptorIntegration(
      "focused_target_observation_backend_required",
      "focused_target_observation_backend",
    )
  }
  return Object.freeze({
    status: "integration_skeleton_ready",
    reasonCode: "browser_focus_tool_descriptor_integration_skeleton_ready",
    method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
    toolName: "yeonjang_browser_focus",
    addProductionBindingNow: false,
    executable: false,
    dispatcherIntegrationNow: false,
    descriptor: input.descriptor,
    requiredGates: [...REQUIRED_GATES],
  })
}

function descriptorMatchesBrowserFocusContract(descriptor: YeonjangBrowserFocusToolDescriptorSkeleton): boolean {
  return descriptor.toolName === "yeonjang_browser_focus" &&
    descriptor.method === YEONJANG_BROWSER_FOCUS_CONTRACT.method &&
    descriptor.riskLevel === YEONJANG_BROWSER_FOCUS_CONTRACT.riskLevel &&
    descriptor.sideEffectClass === YEONJANG_BROWSER_FOCUS_CONTRACT.sideEffectClass &&
    descriptor.permissionSetting === YEONJANG_BROWSER_FOCUS_CONTRACT.permissionSetting &&
    descriptor.requiresApproval === YEONJANG_BROWSER_FOCUS_CONTRACT.requiresApproval &&
    descriptor.runtimeHealthMode === "required" &&
    descriptor.postCheckMode === YEONJANG_BROWSER_FOCUS_CONTRACT.postCheckMode &&
    descriptor.rawPayloadVisibility === YEONJANG_BROWSER_FOCUS_CONTRACT.rawPayloadVisibility &&
    descriptor.defaultLiveSmokeAllowed === YEONJANG_BROWSER_FOCUS_CONTRACT.defaultLiveSmokeAllowed
}

function blockedToolDescriptorIntegration(
  reasonCode: Extract<
    YeonjangBrowserFocusToolDescriptorIntegrationSkeleton,
    { status: "integration_blocked" }
  >["reasonCode"],
  blockedBy: string,
): Extract<YeonjangBrowserFocusToolDescriptorIntegrationSkeleton, { status: "integration_blocked" }> {
  return Object.freeze({
    status: "integration_blocked",
    reasonCode,
    method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
    toolName: "yeonjang_browser_focus",
    addProductionBindingNow: false,
    executable: false,
    dispatcherIntegrationNow: false,
    blockedBy,
    requiredGates: [...REQUIRED_GATES],
  })
}
