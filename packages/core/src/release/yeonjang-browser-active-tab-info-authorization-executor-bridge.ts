import type {
  YeonjangBrowserActiveTabInfoActivationExecutorBoundary,
} from "./yeonjang-browser-active-tab-info-activation-executor-boundary.js"
import type {
  YeonjangBrowserActiveTabInfoActivationScope,
} from "./yeonjang-browser-active-tab-info-activation-request.js"
import type {
  YeonjangBrowserActiveTabInfoHighRiskAuthorization,
} from "./yeonjang-browser-active-tab-info-high-risk-authorization.js"

export interface YeonjangBrowserActiveTabInfoAuthorizationExecutorBridgeInput {
  authorization: YeonjangBrowserActiveTabInfoHighRiskAuthorization
  executorBoundary: YeonjangBrowserActiveTabInfoActivationExecutorBoundary
  now: Date
}

export type YeonjangBrowserActiveTabInfoAuthorizationExecutorBridgeBlockingReasonCode =
  | "authorization_executor_bridge_authorization_not_accepted"
  | "authorization_executor_bridge_executor_not_dry_run_plan"
  | "authorization_executor_bridge_authorization_expired"
  | "authorization_executor_bridge_target_surface_mismatch"
  | "authorization_executor_bridge_rollback_acknowledgement_missing"
  | "authorization_executor_bridge_post_check_acknowledgement_missing"

export type YeonjangBrowserActiveTabInfoAuthorizationExecutorBridge = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-authorization-executor-bridge.v1"
  method: "browser.active_tab_info"
  status: "ready_for_separate_runtime_change" | "blocked"
  reasonCode:
    | "active_tab_info_authorization_executor_bridge_ready"
    | "active_tab_info_authorization_executor_bridge_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoAuthorizationExecutorBridgeBlockingReasonCode[]
  targetSurfaces: readonly YeonjangBrowserActiveTabInfoActivationScope[]
  executeNow: false
  addRustDispatchNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

function sameSurfaces(
  left: readonly YeonjangBrowserActiveTabInfoActivationScope[],
  right: readonly YeonjangBrowserActiveTabInfoActivationScope[],
): boolean {
  if (left.length !== right.length) return false
  const sortedLeft = [...left].sort()
  const sortedRight = [...right].sort()
  return sortedLeft.every((value, index) => value === sortedRight[index])
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoAuthorizationExecutorBridge["status"]
  reasonCode: YeonjangBrowserActiveTabInfoAuthorizationExecutorBridge["reasonCode"]
  targetSurfaces: readonly YeonjangBrowserActiveTabInfoActivationScope[]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoAuthorizationExecutorBridgeBlockingReasonCode[]
}): YeonjangBrowserActiveTabInfoAuthorizationExecutorBridge {
  return Object.freeze({
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-authorization-executor-bridge.v1",
    method: "browser.active_tab_info",
    status: input.status,
    reasonCode: input.reasonCode,
    ...(input.blockingReasonCodes === undefined
      ? {}
      : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
    targetSurfaces: Object.freeze([...input.targetSurfaces]),
    executeNow: false,
    addRustDispatchNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
  })
}

export function bridgeYeonjangBrowserActiveTabInfoAuthorizationToExecutor(
  input: YeonjangBrowserActiveTabInfoAuthorizationExecutorBridgeInput,
): YeonjangBrowserActiveTabInfoAuthorizationExecutorBridge {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoAuthorizationExecutorBridgeBlockingReasonCode[] = []
  const authorizationPayload =
    input.authorization.status === "accepted" ? input.authorization.authorization : undefined

  if (authorizationPayload === undefined) {
    blockingReasonCodes.push("authorization_executor_bridge_authorization_not_accepted")
  }
  if (input.executorBoundary.status !== "dry_run_plan") {
    blockingReasonCodes.push("authorization_executor_bridge_executor_not_dry_run_plan")
  }
  if (authorizationPayload !== undefined) {
    const expiresAt = new Date(authorizationPayload.expiresAt)
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= input.now.getTime()) {
      blockingReasonCodes.push("authorization_executor_bridge_authorization_expired")
    }
    if (!sameSurfaces(authorizationPayload.targetSurfaces, input.executorBoundary.targetSurfaces)) {
      blockingReasonCodes.push("authorization_executor_bridge_target_surface_mismatch")
    }
    if (!authorizationPayload.rollbackAcknowledged) {
      blockingReasonCodes.push("authorization_executor_bridge_rollback_acknowledgement_missing")
    }
    if (!authorizationPayload.postCheckAcknowledged) {
      blockingReasonCodes.push("authorization_executor_bridge_post_check_acknowledgement_missing")
    }
  }

  const targetSurfaces = input.executorBoundary.targetSurfaces
  if (blockingReasonCodes.length > 0) {
    return baseResult({
      status: "blocked",
      reasonCode: "active_tab_info_authorization_executor_bridge_blocked",
      targetSurfaces,
      blockingReasonCodes,
    })
  }

  return baseResult({
    status: "ready_for_separate_runtime_change",
    reasonCode: "active_tab_info_authorization_executor_bridge_ready",
    targetSurfaces,
  })
}
