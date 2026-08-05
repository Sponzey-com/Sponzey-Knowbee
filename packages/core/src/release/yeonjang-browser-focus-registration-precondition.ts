import type {
  YeonjangBrowserFocusBindingReadinessDecision,
  YeonjangBrowserFocusProductionBindingDesign,
} from "../capabilities/yeonjang-browser-focus-contract.js"
import { YEONJANG_BROWSER_FOCUS_CONTRACT } from "../capabilities/yeonjang-browser-focus-contract.js"
import type { YeonjangBrowserFocusProductionExposureDecision } from "./yeonjang-browser-focus-production-exposure.js"
import type { YeonjangBrowserFocusReleaseGateDecision } from "./yeonjang-browser-focus-release-gate.js"

export type YeonjangBrowserFocusRegistrationPrecondition =
  | "release_gate"
  | "production_exposure"
  | "binding_readiness"
  | "binding_design"

export type YeonjangBrowserFocusRegistrationPreconditionReasonCode =
  | "browser_focus_dispatcher_registration_ready"
  | "release_gate_not_ready"
  | "production_exposure_not_executable"
  | "binding_readiness_not_ready"
  | "binding_design_not_ready"

export type YeonjangBrowserFocusRegistrationPreconditionDecision =
  | {
      status: "registration_ready"
      reasonCode: "browser_focus_dispatcher_registration_ready"
      method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
      toolName: "yeonjang_browser_focus"
      registerDispatcherNow: false
      releaseGateStatus: "ready"
      exposureStatus: "executable"
      bindingReadinessStatus: "ready_for_binding"
      bindingDesignStatus: "binding_design_ready"
      requiredPreconditions: YeonjangBrowserFocusRegistrationPrecondition[]
    }
  | {
      status: "registration_blocked"
      reasonCode: Exclude<
        YeonjangBrowserFocusRegistrationPreconditionReasonCode,
        "browser_focus_dispatcher_registration_ready"
      >
      method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
      toolName: "yeonjang_browser_focus"
      registerDispatcherNow: false
      releaseGateStatus: YeonjangBrowserFocusReleaseGateDecision["status"]
      exposureStatus: YeonjangBrowserFocusProductionExposureDecision["status"]
      bindingReadinessStatus: YeonjangBrowserFocusBindingReadinessDecision["status"]
      bindingDesignStatus: YeonjangBrowserFocusProductionBindingDesign["status"]
      blockedBy: string
    }

const REQUIRED_PRECONDITIONS: YeonjangBrowserFocusRegistrationPrecondition[] = [
  "release_gate",
  "production_exposure",
  "binding_readiness",
  "binding_design",
]

export function evaluateYeonjangBrowserFocusRegistrationPrecondition(input: {
  releaseGate: YeonjangBrowserFocusReleaseGateDecision
  exposure: YeonjangBrowserFocusProductionExposureDecision
  bindingReadiness: YeonjangBrowserFocusBindingReadinessDecision
  bindingDesign: YeonjangBrowserFocusProductionBindingDesign
}): YeonjangBrowserFocusRegistrationPreconditionDecision {
  const base = preconditionStatusBase(input)
  if (input.releaseGate.status !== "ready") {
    return blockedRegistrationPrecondition({
      ...base,
      reasonCode: "release_gate_not_ready",
      blockedBy: input.releaseGate.reasonCode,
    })
  }
  if (input.exposure.status !== "executable") {
    return blockedRegistrationPrecondition({
      ...base,
      reasonCode: "production_exposure_not_executable",
      blockedBy: input.exposure.reasonCode,
    })
  }
  if (input.bindingReadiness.status !== "ready_for_binding") {
    return blockedRegistrationPrecondition({
      ...base,
      reasonCode: "binding_readiness_not_ready",
      blockedBy: input.bindingReadiness.reasonCode,
    })
  }
  if (input.bindingDesign.status !== "binding_design_ready") {
    return blockedRegistrationPrecondition({
      ...base,
      reasonCode: "binding_design_not_ready",
      blockedBy: input.bindingDesign.reasonCode,
    })
  }
  return Object.freeze({
    status: "registration_ready",
    reasonCode: "browser_focus_dispatcher_registration_ready",
    method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
    toolName: "yeonjang_browser_focus",
    registerDispatcherNow: false,
    releaseGateStatus: "ready",
    exposureStatus: "executable",
    bindingReadinessStatus: "ready_for_binding",
    bindingDesignStatus: "binding_design_ready",
    requiredPreconditions: [...REQUIRED_PRECONDITIONS],
  })
}

function preconditionStatusBase(input: {
  releaseGate: YeonjangBrowserFocusReleaseGateDecision
  exposure: YeonjangBrowserFocusProductionExposureDecision
  bindingReadiness: YeonjangBrowserFocusBindingReadinessDecision
  bindingDesign: YeonjangBrowserFocusProductionBindingDesign
}): Omit<
  Extract<YeonjangBrowserFocusRegistrationPreconditionDecision, { status: "registration_blocked" }>,
  "status" | "reasonCode" | "blockedBy"
> {
  return {
    method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
    toolName: "yeonjang_browser_focus",
    registerDispatcherNow: false,
    releaseGateStatus: input.releaseGate.status,
    exposureStatus: input.exposure.status,
    bindingReadinessStatus: input.bindingReadiness.status,
    bindingDesignStatus: input.bindingDesign.status,
  }
}

function blockedRegistrationPrecondition(input: Omit<
  Extract<YeonjangBrowserFocusRegistrationPreconditionDecision, { status: "registration_blocked" }>,
  "status"
>): Extract<YeonjangBrowserFocusRegistrationPreconditionDecision, { status: "registration_blocked" }> {
  return Object.freeze({
    status: "registration_blocked",
    ...input,
  })
}
