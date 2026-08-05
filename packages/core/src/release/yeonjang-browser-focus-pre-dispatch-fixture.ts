import {
  YEONJANG_BROWSER_FOCUS_CONTRACT,
  type YeonjangBrowserFocusTargetProjection,
} from "../capabilities/yeonjang-browser-focus-contract.js"
import type {
  YeonjangBrowserFocusMacosExecutorReleaseBridge,
  YeonjangBrowserFocusPublicTargetEvidence,
} from "./yeonjang-browser-focus-macos-executor-release-bridge.js"
import type {
  YeonjangBrowserFocusRegistrationPreconditionDecision,
} from "./yeonjang-browser-focus-registration-precondition.js"

export type YeonjangBrowserFocusApprovalDecision = "allow_once" | "allow_run" | "deny"

export interface YeonjangBrowserFocusApprovalReceipt {
  method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
  decision: YeonjangBrowserFocusApprovalDecision
  scopeId: string
  approved: boolean
  rawReceiptPayload?: Record<string, unknown> | undefined
}

export type YeonjangBrowserFocusPreDispatchReasonCode =
  | "browser_focus_dispatch_prepared"
  | "target_identity_required"
  | "side_effect_authorization_required"
  | "readiness_not_ready"
  | "macos_bridge_not_verified"

export type YeonjangBrowserFocusPreDispatchDecision =
  | {
      schemaVersion: "yeonjang-browser-focus-pre-dispatch-v1"
      method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
      toolName: "yeonjang_browser_focus"
      platform: "macos"
      status: "dispatch_prepared"
      reasonCode: "browser_focus_dispatch_prepared"
      invokeNow: false
      addProductionBindingNow: false
      dispatcherRegistrationNow: false
      target: YeonjangBrowserFocusPublicTargetEvidence
      approvalScopeId: string
      macosBridgeStatus: "bridge_verified"
    }
  | {
      schemaVersion: "yeonjang-browser-focus-pre-dispatch-v1"
      method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
      toolName: "yeonjang_browser_focus"
      platform: "macos"
      status: "dispatch_blocked"
      reasonCode: Exclude<YeonjangBrowserFocusPreDispatchReasonCode, "browser_focus_dispatch_prepared">
      invokeNow: false
      addProductionBindingNow: false
      dispatcherRegistrationNow: false
      blockedBy?: string | undefined
    }

export function prepareYeonjangBrowserFocusPreDispatch(input: {
  target?: YeonjangBrowserFocusTargetProjection | undefined
  approvalReceipt?: YeonjangBrowserFocusApprovalReceipt | undefined
  registrationPrecondition: YeonjangBrowserFocusRegistrationPreconditionDecision
  macosBridge: YeonjangBrowserFocusMacosExecutorReleaseBridge
  auditOnlyDetails?: Record<string, unknown> | undefined
}): YeonjangBrowserFocusPreDispatchDecision {
  if (!input.target) {
    return blockedPreDispatch("target_identity_required")
  }

  if (!isApprovalReceiptAllowed(input.approvalReceipt)) {
    return blockedPreDispatch("side_effect_authorization_required")
  }

  if (input.registrationPrecondition.status !== "registration_ready") {
    return blockedPreDispatch(
      "readiness_not_ready",
      input.registrationPrecondition.blockedBy ?? input.registrationPrecondition.reasonCode,
    )
  }

  if (input.macosBridge.status !== "bridge_verified") {
    return blockedPreDispatch("macos_bridge_not_verified", input.macosBridge.reasonCode)
  }

  return Object.freeze({
    schemaVersion: "yeonjang-browser-focus-pre-dispatch-v1",
    method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
    toolName: "yeonjang_browser_focus",
    platform: "macos",
    status: "dispatch_prepared",
    reasonCode: "browser_focus_dispatch_prepared",
    invokeNow: false,
    addProductionBindingNow: false,
    dispatcherRegistrationNow: false,
    target: projectPublicTargetEvidence(input.target),
    approvalScopeId: input.approvalReceipt.scopeId,
    macosBridgeStatus: "bridge_verified",
  })
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

function blockedPreDispatch(
  reasonCode: Exclude<YeonjangBrowserFocusPreDispatchReasonCode, "browser_focus_dispatch_prepared">,
  blockedBy?: string,
): Extract<YeonjangBrowserFocusPreDispatchDecision, { status: "dispatch_blocked" }> {
  return Object.freeze({
    schemaVersion: "yeonjang-browser-focus-pre-dispatch-v1",
    method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
    toolName: "yeonjang_browser_focus",
    platform: "macos",
    status: "dispatch_blocked",
    reasonCode,
    invokeNow: false,
    addProductionBindingNow: false,
    dispatcherRegistrationNow: false,
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

