import { YEONJANG_BROWSER_FOCUS_CONTRACT } from "../capabilities/yeonjang-browser-focus-contract.js"
import type { YeonjangPlatformCapabilityReadiness } from "./yeonjang-platform-acceptance.js"

export const YEONJANG_BROWSER_FOCUS_OBSERVATION_METHOD = "input.focused_target" as const

export const YEONJANG_BROWSER_FOCUS_RELEASE_GATE_METHODS = [
  YEONJANG_BROWSER_FOCUS_CONTRACT.method,
  YEONJANG_BROWSER_FOCUS_OBSERVATION_METHOD,
] as const

export type YeonjangBrowserFocusReleaseGatePlatform = "macos" | "windows" | "linux"

export type YeonjangBrowserFocusReleaseGateReasonCode =
  | "browser_focus_release_gate_ready"
  | "release_gate_not_ready"
  | "focused_target_observation_backend_required"

export type YeonjangBrowserFocusReleaseGateDecision =
  | {
      status: "ready"
      reasonCode: "browser_focus_release_gate_ready"
      platform: YeonjangBrowserFocusReleaseGatePlatform
      method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
      observationMethod: typeof YEONJANG_BROWSER_FOCUS_OBSERVATION_METHOD
      evidenceRefs: string[]
    }
  | {
      status: "blocked"
      reasonCode: Exclude<YeonjangBrowserFocusReleaseGateReasonCode, "browser_focus_release_gate_ready">
      platform: YeonjangBrowserFocusReleaseGatePlatform
      method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
      observationMethod: typeof YEONJANG_BROWSER_FOCUS_OBSERVATION_METHOD
      blockedMethod: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method | typeof YEONJANG_BROWSER_FOCUS_OBSERVATION_METHOD
      blockedStatus: YeonjangPlatformCapabilityReadiness["status"]
      evidenceRefs: string[]
    }

export function evaluateYeonjangBrowserFocusReleaseGate(input: {
  platform: YeonjangBrowserFocusReleaseGatePlatform
  capabilityReadiness: readonly YeonjangPlatformCapabilityReadiness[]
}): YeonjangBrowserFocusReleaseGateDecision {
  const command = readinessForMethod(input.capabilityReadiness, YEONJANG_BROWSER_FOCUS_CONTRACT.method)
  const observation = readinessForMethod(input.capabilityReadiness, YEONJANG_BROWSER_FOCUS_OBSERVATION_METHOD)
  const evidenceRefs = publicEvidenceRefs([command?.evidenceRef, observation?.evidenceRef])

  if (command?.status !== "passed") {
    return blockedReleaseGate({
      platform: input.platform,
      reasonCode: "release_gate_not_ready",
      blockedMethod: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
      blockedStatus: command?.status ?? "missing",
      evidenceRefs,
    })
  }

  if (observation?.status !== "passed") {
    return blockedReleaseGate({
      platform: input.platform,
      reasonCode: "focused_target_observation_backend_required",
      blockedMethod: YEONJANG_BROWSER_FOCUS_OBSERVATION_METHOD,
      blockedStatus: observation?.status ?? "missing",
      evidenceRefs,
    })
  }

  return Object.freeze({
    status: "ready",
    reasonCode: "browser_focus_release_gate_ready",
    platform: input.platform,
    method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
    observationMethod: YEONJANG_BROWSER_FOCUS_OBSERVATION_METHOD,
    evidenceRefs,
  })
}

function readinessForMethod(
  readiness: readonly YeonjangPlatformCapabilityReadiness[],
  method: string,
): YeonjangPlatformCapabilityReadiness | undefined {
  return readiness.find((item) => item.method === method)
}

function publicEvidenceRefs(values: readonly (string | undefined)[]): string[] {
  return Object.freeze(
    [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))].sort(),
  ) as string[]
}

function blockedReleaseGate(input: {
  platform: YeonjangBrowserFocusReleaseGatePlatform
  reasonCode: Exclude<YeonjangBrowserFocusReleaseGateReasonCode, "browser_focus_release_gate_ready">
  blockedMethod: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method | typeof YEONJANG_BROWSER_FOCUS_OBSERVATION_METHOD
  blockedStatus: YeonjangPlatformCapabilityReadiness["status"]
  evidenceRefs: string[]
}): YeonjangBrowserFocusReleaseGateDecision {
  return Object.freeze({
    status: "blocked",
    reasonCode: input.reasonCode,
    platform: input.platform,
    method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
    observationMethod: YEONJANG_BROWSER_FOCUS_OBSERVATION_METHOD,
    blockedMethod: input.blockedMethod,
    blockedStatus: input.blockedStatus,
    evidenceRefs: input.evidenceRefs,
  })
}
