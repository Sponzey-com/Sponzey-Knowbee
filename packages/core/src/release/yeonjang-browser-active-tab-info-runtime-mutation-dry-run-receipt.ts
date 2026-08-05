import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlan,
} from "./yeonjang-browser-active-tab-info-runtime-mutation-executor-plan.js"

export type YeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceiptBlockingReasonCode =
  | "runtime_mutation_dry_run_receipt_executor_plan_not_planned"
  | "runtime_mutation_dry_run_receipt_executor_dry_run_id_invalid"
  | "runtime_mutation_dry_run_receipt_surface_count_mismatch"
  | "runtime_mutation_dry_run_receipt_rollback_dry_run_id_invalid"
  | "runtime_mutation_dry_run_receipt_post_check_dry_run_id_invalid"

export interface YeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceiptInput {
  runtimeMutationExecutorPlan: YeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlan
  runtimeExecutorDryRunId: string
  expectedMutationSurfaceCount: number
  rollbackDryRunId: string
  postCheckDryRunId: string
}

export type YeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceipt = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-runtime-mutation-dry-run-receipt.v1"
  method: "browser.active_tab_info"
  status: "dry_run_receipt_ready" | "blocked"
  reasonCode:
    | "active_tab_info_runtime_mutation_dry_run_receipt_ready"
    | "active_tab_info_runtime_mutation_dry_run_receipt_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceiptBlockingReasonCode[]
  dryRunReceiptId: string
  mutationSurfaceCount: number
  rollbackDryRunStatus: "passed" | "failed"
  postCheckDryRunStatus: "passed" | "failed"
  executeNow: false
  addRustDispatchNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
  createLiveExecutionReceiptNow: false
}>

const SAFE_DRY_RUN_ID_PATTERN = /^dry-run:[a-z0-9._:-]+$/u

function isSafeDryRunId(value: string): boolean {
  return SAFE_DRY_RUN_ID_PATTERN.test(value)
}

function buildDryRunReceiptId(input: {
  runtimeExecutorDryRunId: string
  rollbackDryRunId: string
  postCheckDryRunId: string
}): string {
  const hash = createHash("sha256")
    .update(input.runtimeExecutorDryRunId)
    .update("\n")
    .update(input.rollbackDryRunId)
    .update("\n")
    .update(input.postCheckDryRunId)
    .digest("hex")
    .slice(0, 3)
  return `dry-run-receipt:browser.active_tab_info:${hash}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceipt["status"]
  reasonCode: YeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceipt["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceiptBlockingReasonCode[]
  dryRunReceiptId: string
  mutationSurfaceCount: number
  rollbackDryRunStatus: "passed" | "failed"
  postCheckDryRunStatus: "passed" | "failed"
}): YeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceipt {
  return Object.freeze({
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-runtime-mutation-dry-run-receipt.v1",
    method: "browser.active_tab_info",
    status: input.status,
    reasonCode: input.reasonCode,
    ...(input.blockingReasonCodes === undefined
      ? {}
      : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
    dryRunReceiptId: input.dryRunReceiptId,
    mutationSurfaceCount: input.mutationSurfaceCount,
    rollbackDryRunStatus: input.rollbackDryRunStatus,
    postCheckDryRunStatus: input.postCheckDryRunStatus,
    executeNow: false,
    addRustDispatchNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
    createLiveExecutionReceiptNow: false,
  })
}

export function buildYeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceipt(
  input: YeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceiptInput,
): YeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceipt {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceiptBlockingReasonCode[] = []
  if (input.runtimeMutationExecutorPlan.state !== "planned") {
    blockingReasonCodes.push("runtime_mutation_dry_run_receipt_executor_plan_not_planned")
  }
  if (!isSafeDryRunId(input.runtimeExecutorDryRunId)) {
    blockingReasonCodes.push("runtime_mutation_dry_run_receipt_executor_dry_run_id_invalid")
  }
  if (
    input.expectedMutationSurfaceCount !==
    input.runtimeMutationExecutorPlan.mutationSurfaces.length
  ) {
    blockingReasonCodes.push("runtime_mutation_dry_run_receipt_surface_count_mismatch")
  }
  if (!isSafeDryRunId(input.rollbackDryRunId)) {
    blockingReasonCodes.push("runtime_mutation_dry_run_receipt_rollback_dry_run_id_invalid")
  }
  if (!isSafeDryRunId(input.postCheckDryRunId)) {
    blockingReasonCodes.push("runtime_mutation_dry_run_receipt_post_check_dry_run_id_invalid")
  }

  const dryRunReceiptId = blockingReasonCodes.length > 0
    ? "dry-run-receipt:browser.active_tab_info:blocked"
    : buildDryRunReceiptId({
      runtimeExecutorDryRunId: input.runtimeExecutorDryRunId,
      rollbackDryRunId: input.rollbackDryRunId,
      postCheckDryRunId: input.postCheckDryRunId,
    })

  if (blockingReasonCodes.length > 0) {
    return baseResult({
      status: "blocked",
      reasonCode: "active_tab_info_runtime_mutation_dry_run_receipt_blocked",
      blockingReasonCodes,
      dryRunReceiptId,
      mutationSurfaceCount: input.runtimeMutationExecutorPlan.mutationSurfaces.length,
      rollbackDryRunStatus: input.runtimeMutationExecutorPlan.rollbackDryRunSummary,
      postCheckDryRunStatus: input.runtimeMutationExecutorPlan.postCheckDryRunSummary,
    })
  }

  return baseResult({
    status: "dry_run_receipt_ready",
    reasonCode: "active_tab_info_runtime_mutation_dry_run_receipt_ready",
    dryRunReceiptId,
    mutationSurfaceCount: input.expectedMutationSurfaceCount,
    rollbackDryRunStatus: input.runtimeMutationExecutorPlan.rollbackDryRunSummary,
    postCheckDryRunStatus: input.runtimeMutationExecutorPlan.postCheckDryRunSummary,
  })
}
