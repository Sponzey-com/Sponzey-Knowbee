import {
  YEONJANG_BROWSER_FOCUS_CONTRACT,
  type YeonjangBrowserFocusTargetProjection,
} from "../capabilities/yeonjang-browser-focus-contract.js"
import type {
  YeonjangBrowserFocusMacosExecutorReleaseBridge,
  YeonjangBrowserFocusPublicTargetEvidence,
} from "./yeonjang-browser-focus-macos-executor-release-bridge.js"
import type {
  YeonjangBrowserFocusApprovalReceipt,
  YeonjangBrowserFocusPreDispatchDecision,
} from "./yeonjang-browser-focus-pre-dispatch-fixture.js"

export interface YeonjangBrowserFocusToolBindingDescriptor {
  toolName: "yeonjang_browser_focus"
  method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
  riskLevel: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.riskLevel
  requiresApproval: true
  runtimeHealthMode: "required"
  runtimeMethodIds: readonly [typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method] | readonly string[]
  sideEffectMethodContractBound: boolean
  requiresPreDispatchFixture: true
  requiresMacosBridgeVerified: true
  rawPayloadVisibility: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.rawPayloadVisibility
  targetSchemaVersion: YeonjangBrowserFocusTargetProjection["schemaVersion"]
}

export type YeonjangBrowserFocusToolBindingPlanReasonCode =
  | "browser_focus_tool_binding_plan_ready"
  | "descriptor_contract_mismatch"
  | "side_effect_method_contract_not_bound"
  | "target_identity_required"
  | "side_effect_authorization_required"
  | "pre_dispatch_not_ready"
  | "macos_bridge_not_verified"
  | "yeonjang_capability_not_ready"

export type YeonjangBrowserFocusToolBindingPlan =
  | {
      schemaVersion: "yeonjang-browser-focus-tool-binding-plan-v1"
      method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
      toolName: "yeonjang_browser_focus"
      status: "binding_plan_ready"
      reasonCode: "browser_focus_tool_binding_plan_ready"
      addProductionBindingNow: false
      registerSkillCatalogNow: false
      dispatcherRegistrationNow: false
      invokeNow: false
      target: YeonjangBrowserFocusPublicTargetEvidence
      approvalScopeId: string
      requiredGates: readonly YeonjangBrowserFocusToolBindingGate[]
    }
  | {
      schemaVersion: "yeonjang-browser-focus-tool-binding-plan-v1"
      method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
      toolName: "yeonjang_browser_focus"
      status: "binding_plan_blocked"
      reasonCode: Exclude<YeonjangBrowserFocusToolBindingPlanReasonCode, "browser_focus_tool_binding_plan_ready">
      addProductionBindingNow: false
      registerSkillCatalogNow: false
      dispatcherRegistrationNow: false
      invokeNow: false
      blockedBy?: string | undefined
    }

export type YeonjangBrowserFocusToolBindingGate =
  | "tool_descriptor"
  | "side_effect_method_contract"
  | "target_projection"
  | "approval_receipt"
  | "pre_dispatch_fixture"
  | "macos_executor_bridge"
  | "yeonjang_capability_readiness"
  | "raw_payload_redaction"

const REQUIRED_GATES: readonly YeonjangBrowserFocusToolBindingGate[] = [
  "tool_descriptor",
  "side_effect_method_contract",
  "target_projection",
  "approval_receipt",
  "pre_dispatch_fixture",
  "macos_executor_bridge",
  "yeonjang_capability_readiness",
  "raw_payload_redaction",
] as const

export function buildYeonjangBrowserFocusToolBindingPlan(input: {
  descriptor?: YeonjangBrowserFocusToolBindingDescriptor | undefined
  target?: YeonjangBrowserFocusTargetProjection | undefined
  approvalReceipt?: YeonjangBrowserFocusApprovalReceipt | undefined
  preDispatch?: YeonjangBrowserFocusPreDispatchDecision | undefined
  macosBridge?: YeonjangBrowserFocusMacosExecutorReleaseBridge | undefined
  yeonjangCapabilityReady: boolean
  auditOnlyDetails?: Record<string, unknown> | undefined
}): YeonjangBrowserFocusToolBindingPlan {
  if (!isDescriptorShapeValid(input.descriptor)) {
    return blockedToolBindingPlan("descriptor_contract_mismatch")
  }
  if (!input.descriptor.sideEffectMethodContractBound) {
    return blockedToolBindingPlan("side_effect_method_contract_not_bound")
  }
  if (!input.target) {
    return blockedToolBindingPlan("target_identity_required")
  }
  if (!isApprovalReceiptAllowed(input.approvalReceipt)) {
    return blockedToolBindingPlan("side_effect_authorization_required")
  }
  if (!input.preDispatch || input.preDispatch.status !== "dispatch_prepared") {
    return blockedToolBindingPlan(
      "pre_dispatch_not_ready",
      input.preDispatch?.reasonCode ?? "pre_dispatch_required",
    )
  }
  if (!input.macosBridge || input.macosBridge.status !== "bridge_verified") {
    return blockedToolBindingPlan(
      "macos_bridge_not_verified",
      input.macosBridge?.reasonCode ?? "macos_bridge_required",
    )
  }
  if (!input.yeonjangCapabilityReady) {
    return blockedToolBindingPlan("yeonjang_capability_not_ready")
  }

  return Object.freeze({
    schemaVersion: "yeonjang-browser-focus-tool-binding-plan-v1",
    method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
    toolName: "yeonjang_browser_focus",
    status: "binding_plan_ready",
    reasonCode: "browser_focus_tool_binding_plan_ready",
    addProductionBindingNow: false,
    registerSkillCatalogNow: false,
    dispatcherRegistrationNow: false,
    invokeNow: false,
    target: projectPublicTargetEvidence(input.target),
    approvalScopeId: input.approvalReceipt.scopeId,
    requiredGates: [...REQUIRED_GATES],
  })
}

function isDescriptorShapeValid(
  descriptor: YeonjangBrowserFocusToolBindingDescriptor | undefined,
): descriptor is YeonjangBrowserFocusToolBindingDescriptor {
  return Boolean(
    descriptor
      && descriptor.toolName === "yeonjang_browser_focus"
      && descriptor.method === YEONJANG_BROWSER_FOCUS_CONTRACT.method
      && descriptor.riskLevel === YEONJANG_BROWSER_FOCUS_CONTRACT.riskLevel
      && descriptor.requiresApproval === true
      && descriptor.runtimeHealthMode === "required"
      && descriptor.runtimeMethodIds.includes(YEONJANG_BROWSER_FOCUS_CONTRACT.method)
      && descriptor.requiresPreDispatchFixture === true
      && descriptor.requiresMacosBridgeVerified === true
      && descriptor.rawPayloadVisibility === YEONJANG_BROWSER_FOCUS_CONTRACT.rawPayloadVisibility
      && descriptor.targetSchemaVersion === "yeonjang-browser-focus-target-v1",
  )
}

function isApprovalReceiptAllowed(
  receipt: YeonjangBrowserFocusApprovalReceipt | undefined,
): receipt is YeonjangBrowserFocusApprovalReceipt {
  return Boolean(
    receipt
      && receipt.method === YEONJANG_BROWSER_FOCUS_CONTRACT.method
      && receipt.approved
      && (receipt.decision === "allow_once" || receipt.decision === "allow_run")
      && receipt.scopeId.trim().length > 0,
  )
}

function blockedToolBindingPlan(
  reasonCode: Extract<YeonjangBrowserFocusToolBindingPlan, { status: "binding_plan_blocked" }>["reasonCode"],
  blockedBy?: string,
): Extract<YeonjangBrowserFocusToolBindingPlan, { status: "binding_plan_blocked" }> {
  return Object.freeze({
    schemaVersion: "yeonjang-browser-focus-tool-binding-plan-v1",
    method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
    toolName: "yeonjang_browser_focus",
    status: "binding_plan_blocked",
    reasonCode,
    addProductionBindingNow: false,
    registerSkillCatalogNow: false,
    dispatcherRegistrationNow: false,
    invokeNow: false,
    ...(blockedBy ? { blockedBy } : {}),
  })
}

function projectPublicTargetEvidence(
  target: YeonjangBrowserFocusTargetProjection,
): YeonjangBrowserFocusPublicTargetEvidence {
  return Object.freeze({
    schemaVersion: target.schemaVersion,
    targetKind: target.targetKind,
    ...(target.targetAlias ? { targetAlias: target.targetAlias } : {}),
    displayName: target.displayName,
    ...(target.processName ? { processName: target.processName } : {}),
    ...(target.titleHash ? { titleHash: target.titleHash } : {}),
    ...(typeof target.titleLength === "number" ? { titleLength: target.titleLength } : {}),
    ...(target.urlScheme ? { urlScheme: target.urlScheme } : {}),
    ...(target.urlHash ? { urlHash: target.urlHash } : {}),
    ...(typeof target.urlLength === "number" ? { urlLength: target.urlLength } : {}),
  })
}

