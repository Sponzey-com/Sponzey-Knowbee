import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoActivationScope,
} from "./yeonjang-browser-active-tab-info-activation-request.js"
import type {
  YeonjangBrowserActiveTabInfoLiveExecutionAuthorization,
} from "./yeonjang-browser-active-tab-info-live-execution-authorization.js"

export type YeonjangBrowserActiveTabInfoLiveExecutionReceiptBlockingReasonCode =
  | "live_execution_receipt_authorization_not_ready"
  | "live_execution_receipt_target_instance_id_invalid"
  | "live_execution_receipt_runtime_config_snapshot_id_invalid"
  | "live_execution_receipt_window_starts_at_invalid"
  | "live_execution_receipt_window_expires_at_invalid"
  | "live_execution_receipt_window_order_invalid"
  | "live_execution_receipt_window_not_active"
  | "live_execution_receipt_authorization_expires_before_window"
  | "live_execution_receipt_rollback_command_ref_invalid"
  | "live_execution_receipt_post_execution_verification_plan_ref_invalid"

export interface YeonjangBrowserActiveTabInfoLiveExecutionReceiptInput {
  liveExecutionAuthorization: YeonjangBrowserActiveTabInfoLiveExecutionAuthorization
  targetInstanceId: string
  runtimeConfigSnapshotId: string
  operatorExecutionWindow: Readonly<{
    startsAt: string
    expiresAt: string
  }>
  rollbackCommandRef: string
  postExecutionVerificationPlanRef: string
}

export interface YeonjangBrowserActiveTabInfoLiveExecutionReceiptOptions {
  now: Date
}

export type YeonjangBrowserActiveTabInfoLiveExecutionReceipt = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-live-execution-receipt.v1"
  method: "browser.active_tab_info"
  status: "live_execution_receipt_ready" | "blocked"
  reasonCode:
    | "active_tab_info_live_execution_receipt_ready"
    | "active_tab_info_live_execution_receipt_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoLiveExecutionReceiptBlockingReasonCode[]
  receipt?: Readonly<{
    liveExecutionReceiptId: string
    authorizationRef: string
    dryRunReceiptId: string
    targetInstanceRef: string
    targetSurfaces: readonly YeonjangBrowserActiveTabInfoActivationScope[]
    runtimeConfigSnapshotId: string
    executionWindow: Readonly<{
      startsAt: string
      expiresAt: string
    }>
    rollbackCommandRef: string
    postExecutionVerificationPlanRef: string
  }>
  dispatchNow: false
  addRustDispatchNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
  markUserGoalSucceededNow: false
}>

const TARGET_INSTANCE_ID_PATTERN = /^knowbee-instance:[a-z0-9._:-]+$/u
const RUNTIME_CONFIG_SNAPSHOT_ID_PATTERN = /^runtime-config-snapshot:[a-z0-9._:-]+$/u
const ROLLBACK_COMMAND_REF_PATTERN = /^rollback-command:[a-z0-9._:-]+$/u
const POST_EXECUTION_VERIFICATION_PLAN_REF_PATTERN = /^post-check-plan:[a-z0-9._:-]+$/u

function parseDate(value: string): Date | undefined {
  if (!value.trim()) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function hashRef(prefix: string, value: string): string {
  return `${prefix}:${createHash("sha256").update(value).digest("hex").slice(0, 3)}`
}

function buildLiveExecutionReceiptId(input: {
  authorizationRef: string
  targetInstanceId: string
  runtimeConfigSnapshotId: string
  startsAt: string
  expiresAt: string
  rollbackCommandRef: string
  postExecutionVerificationPlanRef: string
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.authorizationRef,
    input.targetInstanceId,
    input.runtimeConfigSnapshotId,
    input.startsAt,
    input.expiresAt,
    input.rollbackCommandRef,
    input.postExecutionVerificationPlanRef,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `live-execution-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoLiveExecutionReceipt["status"]
  reasonCode: YeonjangBrowserActiveTabInfoLiveExecutionReceipt["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoLiveExecutionReceiptBlockingReasonCode[]
  receipt?: YeonjangBrowserActiveTabInfoLiveExecutionReceipt["receipt"]
}): YeonjangBrowserActiveTabInfoLiveExecutionReceipt {
  return Object.freeze({
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-live-execution-receipt.v1",
    method: "browser.active_tab_info",
    status: input.status,
    reasonCode: input.reasonCode,
    ...(input.blockingReasonCodes === undefined
      ? {}
      : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
    ...(input.receipt === undefined ? {} : { receipt: input.receipt }),
    dispatchNow: false,
    addRustDispatchNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
    markUserGoalSucceededNow: false,
  })
}

export function buildYeonjangBrowserActiveTabInfoLiveExecutionReceipt(
  input: YeonjangBrowserActiveTabInfoLiveExecutionReceiptInput,
  options: YeonjangBrowserActiveTabInfoLiveExecutionReceiptOptions,
): YeonjangBrowserActiveTabInfoLiveExecutionReceipt {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoLiveExecutionReceiptBlockingReasonCode[] = []
  const authorization = input.liveExecutionAuthorization.authorization
  if (
    input.liveExecutionAuthorization.status !== "live_execution_authorization_ready" ||
    authorization === undefined
  ) {
    blockingReasonCodes.push("live_execution_receipt_authorization_not_ready")
  }
  if (!TARGET_INSTANCE_ID_PATTERN.test(input.targetInstanceId)) {
    blockingReasonCodes.push("live_execution_receipt_target_instance_id_invalid")
  }
  if (!RUNTIME_CONFIG_SNAPSHOT_ID_PATTERN.test(input.runtimeConfigSnapshotId)) {
    blockingReasonCodes.push("live_execution_receipt_runtime_config_snapshot_id_invalid")
  }

  const startsAt = parseDate(input.operatorExecutionWindow.startsAt)
  const expiresAt = parseDate(input.operatorExecutionWindow.expiresAt)
  const authorizationExpiresAt = authorization === undefined
    ? undefined
    : parseDate(authorization.expiresAt)
  if (startsAt === undefined) {
    blockingReasonCodes.push("live_execution_receipt_window_starts_at_invalid")
  }
  if (expiresAt === undefined) {
    blockingReasonCodes.push("live_execution_receipt_window_expires_at_invalid")
  }
  if (startsAt !== undefined && expiresAt !== undefined) {
    if (expiresAt.getTime() <= startsAt.getTime()) {
      blockingReasonCodes.push("live_execution_receipt_window_order_invalid")
    } else if (
      startsAt.getTime() > options.now.getTime() ||
      expiresAt.getTime() <= options.now.getTime()
    ) {
      blockingReasonCodes.push("live_execution_receipt_window_not_active")
    }
  }
  if (
    authorizationExpiresAt !== undefined &&
    expiresAt !== undefined &&
    authorizationExpiresAt.getTime() < expiresAt.getTime()
  ) {
    blockingReasonCodes.push("live_execution_receipt_authorization_expires_before_window")
  }
  if (!ROLLBACK_COMMAND_REF_PATTERN.test(input.rollbackCommandRef)) {
    blockingReasonCodes.push("live_execution_receipt_rollback_command_ref_invalid")
  }
  if (!POST_EXECUTION_VERIFICATION_PLAN_REF_PATTERN.test(input.postExecutionVerificationPlanRef)) {
    blockingReasonCodes.push("live_execution_receipt_post_execution_verification_plan_ref_invalid")
  }

  if (blockingReasonCodes.length > 0 || authorization === undefined) {
    return baseResult({
      status: "blocked",
      reasonCode: "active_tab_info_live_execution_receipt_blocked",
      blockingReasonCodes,
    })
  }

  const normalizedStartsAt = startsAt?.toISOString() ?? input.operatorExecutionWindow.startsAt
  const normalizedExpiresAt = expiresAt?.toISOString() ?? input.operatorExecutionWindow.expiresAt
  return baseResult({
    status: "live_execution_receipt_ready",
    reasonCode: "active_tab_info_live_execution_receipt_ready",
    receipt: Object.freeze({
      liveExecutionReceiptId: buildLiveExecutionReceiptId({
        authorizationRef: authorization.authorizationRef,
        targetInstanceId: input.targetInstanceId,
        runtimeConfigSnapshotId: input.runtimeConfigSnapshotId,
        startsAt: normalizedStartsAt,
        expiresAt: normalizedExpiresAt,
        rollbackCommandRef: input.rollbackCommandRef,
        postExecutionVerificationPlanRef: input.postExecutionVerificationPlanRef,
      }),
      authorizationRef: authorization.authorizationRef,
      dryRunReceiptId: authorization.dryRunReceiptId,
      targetInstanceRef: hashRef("target-instance:browser.active_tab_info", input.targetInstanceId),
      targetSurfaces: Object.freeze([...authorization.targetSurfaces]),
      runtimeConfigSnapshotId: input.runtimeConfigSnapshotId,
      executionWindow: Object.freeze({
        startsAt: normalizedStartsAt,
        expiresAt: normalizedExpiresAt,
      }),
      rollbackCommandRef: input.rollbackCommandRef,
      postExecutionVerificationPlanRef: input.postExecutionVerificationPlanRef,
    }),
  })
}
