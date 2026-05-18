import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { buildArtifactAccessDescriptor } from "../artifacts/lifecycle.js"
import {
  normalizeYeonjangBroadcastIntent,
  normalizeYeonjangBroadcastRetryReceipt,
  validateYeonjangBroadcastIntent,
  validateYeonjangBroadcastRetryReceipt,
  validateYeonjangBroadcastSelector,
  type YeonjangBroadcastIntent,
  type YeonjangBroadcastRetryReceipt,
  type YeonjangBroadcastToolName,
} from "../contracts/yeonjang-broadcast.js"
import type { YeonjangTargetSelector } from "../contracts/yeonjang-target.js"
import type { MqttExtensionSnapshot } from "../mqtt/broker.js"
import {
  buildYeonjangFleetProjection,
  normalizeYeonjangSupportProfile,
  type YeonjangFleetProjectionInput,
  type YeonjangProjectedInstance,
  type YeonjangSupportProfile,
} from "./topology.js"
import { getYeonjangBroadcastPolicy, type YeonjangBroadcastPolicy } from "./broadcast-policy.js"

export type YeonjangBroadcastTargetStatus = "planned" | "skipped" | "succeeded" | "failed"

export interface YeonjangBroadcastPlannedTarget {
  broadcastIndex: number
  broadcastTotal: number
  instanceId: string
  extensionId: string
  sessionId: string | null
  instanceAlias: string
  displayName: string
  location: YeonjangProjectedInstance["location"]
  supportProfile: YeonjangSupportProfile
  trustState: YeonjangProjectedInstance["trustState"]
  requiredMethods: string[]
}

export interface YeonjangBroadcastSkippedTarget {
  instanceId: string
  extensionId: string
  instanceAlias: string
  displayName: string
  reasonCodes: string[]
}

export interface YeonjangBroadcastPlanTrace {
  selector: YeonjangTargetSelector
  broadcastIntent: YeonjangBroadcastIntent
  requestedToolName: YeonjangBroadcastToolName
  requiredMethods: string[]
  plannedTargetIds: string[]
  skippedTargetIds: string[]
  retryReceipt: {
    requested: boolean
    retryMode: "failed_only"
    previousBroadcastRunId: string | null
    previousTargetCount: number
    previousSucceededCount: number
    previousIncompleteCount: number
    skippedSucceededTargetIds: string[]
    skippedUnknownTargetIds: string[]
    retriedTargetIds: string[]
  }
}

export interface YeonjangBroadcastRunPlan {
  broadcastRunId: string
  toolName: YeonjangBroadcastToolName
  transportMethod: string
  policy: YeonjangBroadcastPolicy
  selector: YeonjangTargetSelector
  broadcastIntent: YeonjangBroadcastIntent
  targets: YeonjangBroadcastPlannedTarget[]
  skippedTargets: YeonjangBroadcastSkippedTarget[]
  trace: YeonjangBroadcastPlanTrace
}

export type YeonjangBroadcastPlanResult =
  | { ok: true; plan: YeonjangBroadcastRunPlan }
  | {
      ok: false
      code:
        | "invalid_broadcast_selector"
        | "missing_broadcast_intent"
        | "invalid_broadcast_intent"
        | "invalid_retry_receipt"
        | "broadcast_target_selection_empty"
        | "broadcast_policy_denied"
      message: string
      reasonCodes: string[]
      details?: Record<string, unknown>
    }

export interface YeonjangBroadcastTargetExecutionRecord {
  status: Exclude<YeonjangBroadcastTargetStatus, "planned">
  broadcastIndex: number
  instanceId: string
  extensionId: string
  sessionId: string | null
  instanceAlias: string
  displayName: string
  reasonCodes: string[]
  output?: string
  error?: string
  artifactPath?: string | null
  artifact?: ReturnType<typeof buildArtifactAccessDescriptor>
}

export interface YeonjangBroadcastAggregateSummary {
  broadcastRunId: string
  totalTargets: number
  successCount: number
  failedCount: number
  skippedCount: number
  partialSuccess: boolean
  reasonCodes: string[]
  retryRequested: boolean
  retrySkippedSucceededCount: number
  retrySkippedUnknownCount: number
  retryTargetCount: number
}

interface NormalizedBroadcastRetryReceipt {
  requested: boolean
  retryMode: "failed_only"
  previousBroadcastRunId: string | null
  previousTargetIds: Set<string>
  previousSucceededIds: Set<string>
  previousIncompleteIds: Set<string>
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function uniqueStrings(values: Iterable<string>): string[] {
  return [...new Set([...values].filter((value) => value.trim().length > 0))].sort()
}

function matchesFilteredSelector(instance: YeonjangProjectedInstance, selector: Extract<YeonjangTargetSelector, { type: "filtered_group" }>): boolean {
  if (selector.location && instance.location !== selector.location) return false
  if (selector.supportProfiles?.length) {
    const normalizedProfiles = selector.supportProfiles.map((item) => normalizeYeonjangSupportProfile(item))
    if (!normalizedProfiles.includes(instance.supportProfile)) return false
  }
  if (selector.platforms?.length) {
    const platform = normalizeString(instance.platform).toLowerCase()
    const platforms = selector.platforms.map((item) => normalizeString(item).toLowerCase()).filter(Boolean)
    if (!platforms.includes(platform)) return false
  }
  if (selector.states?.length && !selector.states.includes(instance.state)) return false
  return true
}

function filterInstancesForSelector(
  instances: YeonjangProjectedInstance[],
  selector: YeonjangTargetSelector,
): YeonjangProjectedInstance[] {
  switch (selector.type) {
    case "all_online":
      return instances.filter((instance) => instance.state === "online")
    case "filtered_group":
      return instances.filter((instance) => matchesFilteredSelector(instance, selector))
    default:
      return []
  }
}

function buildSkippedTarget(instance: YeonjangProjectedInstance, reasonCodes: string[]): YeonjangBroadcastSkippedTarget {
  return {
    instanceId: instance.instanceId,
    extensionId: instance.nodeId,
    instanceAlias: instance.instanceAlias,
    displayName: instance.displayName,
    reasonCodes: uniqueStrings(reasonCodes),
  }
}

function buildPlannedTarget(
  instance: YeonjangProjectedInstance,
  broadcastIndex: number,
  broadcastTotal: number,
  requiredMethods: string[],
): YeonjangBroadcastPlannedTarget {
  return {
    broadcastIndex,
    broadcastTotal,
    instanceId: instance.instanceId,
    extensionId: instance.nodeId,
    sessionId: instance.session?.sessionId ?? null,
    instanceAlias: instance.instanceAlias,
    displayName: instance.displayName,
    location: instance.location,
    supportProfile: instance.supportProfile,
    trustState: instance.trustState,
    requiredMethods,
  }
}

function normalizeBroadcastRetryReceipt(
  receipt: YeonjangBroadcastRetryReceipt,
): NormalizedBroadcastRetryReceipt {
  const normalized = normalizeYeonjangBroadcastRetryReceipt(receipt)
  const previousTargetIds = new Set<string>()
  const previousSucceededIds = new Set<string>()
  const previousIncompleteIds = new Set<string>()

  for (const item of normalized.targetReceipts ?? []) {
    previousTargetIds.add(item.instanceId)
    if (item.status === "succeeded") {
      previousSucceededIds.add(item.instanceId)
      continue
    }
    previousIncompleteIds.add(item.instanceId)
  }
  for (const skipped of normalized.skippedTargets ?? []) {
    previousTargetIds.add(skipped.instanceId)
    previousIncompleteIds.add(skipped.instanceId)
  }

  return {
    requested: previousTargetIds.size > 0,
    retryMode: "failed_only",
    previousBroadcastRunId: normalizeString(normalized.previousBroadcastRunId) || null,
    previousTargetIds,
    previousSucceededIds,
    previousIncompleteIds,
  }
}

export function planYeonjangBroadcastRun(params: {
  toolName: YeonjangBroadcastToolName
  targetSelector?: unknown
  broadcastIntent?: unknown
  retryReceipt?: unknown
  policy?: YeonjangBroadcastPolicy
  snapshots?: YeonjangFleetProjectionInput["snapshots"]
  instances?: YeonjangFleetProjectionInput["instances"]
  now?: number
}): YeonjangBroadcastPlanResult {
  const selectorValidation = validateYeonjangBroadcastSelector(params.targetSelector)
  if (!selectorValidation.ok) {
    return {
      ok: false,
      code: "invalid_broadcast_selector",
      message: "Broadcast run은 all_online 또는 filtered_group selector가 필요합니다.",
      reasonCodes: selectorValidation.issues.map((issue) => `selector_validation:${issue.path}`),
    }
  }
  if (params.broadcastIntent == null) {
    return {
      ok: false,
      code: "missing_broadcast_intent",
      message: "명시적 broadcast intent 없이 여러 Yeonjang 인스턴스로 확장하지 않습니다.",
      reasonCodes: ["broadcast_intent_required"],
    }
  }
  const intentValidation = validateYeonjangBroadcastIntent(params.broadcastIntent)
  if (!intentValidation.ok) {
    return {
      ok: false,
      code: "invalid_broadcast_intent",
      message: "broadcast intent 형식이 올바르지 않습니다.",
      reasonCodes: intentValidation.issues.map((issue) => `broadcast_intent_validation:${issue.path}`),
    }
  }
  const retryReceiptValidation = validateYeonjangBroadcastRetryReceipt(params.retryReceipt)
  if (!retryReceiptValidation.ok) {
    return {
      ok: false,
      code: "invalid_retry_receipt",
      message: "broadcast retry receipt 형식이 올바르지 않습니다.",
      reasonCodes: retryReceiptValidation.issues.map((issue) => `retry_receipt_validation:${issue.path}`),
    }
  }
  const policy = params.policy ?? getYeonjangBroadcastPolicy(params.toolName)
  if (policy.defaultDecision === "deny") {
    return {
      ok: false,
      code: "broadcast_policy_denied",
      message: policy.userMessage,
      reasonCodes: [policy.reasonCode],
      details: {
        policy,
      },
    }
  }

  const selector = selectorValidation.value
  const broadcastIntent = normalizeYeonjangBroadcastIntent(intentValidation.value)
  const retryReceipt = normalizeBroadcastRetryReceipt(retryReceiptValidation.value)
  const fleet = buildYeonjangFleetProjection({
    ...(params.snapshots ? { snapshots: params.snapshots } : {}),
    ...(params.instances ? { instances: params.instances } : {}),
    ...(params.now != null ? { now: params.now } : {}),
  })
  const requiredMethods = uniqueStrings([
    policy.transportMethod,
    ...(broadcastIntent.requiredMethods ?? []),
  ])
  const supportProfiles = uniqueStrings([
    ...(selector.type === "filtered_group" ? selector.supportProfiles ?? [] : []),
    ...(broadcastIntent.supportProfiles ?? []),
  ]).map((item) => normalizeYeonjangSupportProfile(item))

  const plannedInstances: YeonjangProjectedInstance[] = []
  const skippedTargets: YeonjangBroadcastSkippedTarget[] = []
  const skippedSucceededTargetIds: string[] = []
  const skippedUnknownTargetIds: string[] = []
  for (const instance of filterInstancesForSelector(fleet.instances, selector)) {
    const reasonCodes: string[] = []
    if (retryReceipt.requested) {
      if (!retryReceipt.previousTargetIds.has(instance.instanceId)) {
        reasonCodes.push("retry_target_not_in_previous_receipt")
        skippedUnknownTargetIds.push(instance.instanceId)
      } else if (retryReceipt.previousSucceededIds.has(instance.instanceId)) {
        reasonCodes.push("retry_target_already_succeeded")
        skippedSucceededTargetIds.push(instance.instanceId)
      }
    }
    if (instance.state !== "online") {
      reasonCodes.push(`target_state_${instance.state}`)
    }
    const trustedOnly = broadcastIntent.trustedOnly !== false || policy.targetRequirement === "trusted_only"
    if (trustedOnly && instance.trustState !== "trusted") {
      reasonCodes.push(
        instance.trustState === "pending"
          ? "target_trust_pending"
          : instance.trustState === "quarantined"
            ? "target_trust_quarantined"
            : instance.trustState === "revoked"
              ? "target_trust_revoked"
              : "target_not_trusted",
      )
    }
    if (instance.scopeAccess === "foreign" || instance.scopeAccess === "unassigned") {
      reasonCodes.push(
        instance.scopeAccess === "foreign"
          ? "workspace_scope_forbidden"
          : "workspace_scope_unassigned",
      )
    }
    if (supportProfiles.length > 0 && !supportProfiles.includes(instance.supportProfile)) {
      reasonCodes.push("support_profile_filter_mismatch")
    }
    if (requiredMethods.some((method) => !instance.supportedMethods.includes(method))) {
      reasonCodes.push("required_capability_missing")
    }
    if (reasonCodes.length > 0) {
      skippedTargets.push(buildSkippedTarget(instance, reasonCodes))
      continue
    }
    plannedInstances.push(instance)
  }

  if (plannedInstances.length === 0) {
    return {
      ok: false,
      code: "broadcast_target_selection_empty",
      message: "broadcast 조건을 만족하는 online Yeonjang 인스턴스를 찾지 못했습니다.",
      reasonCodes: ["broadcast_target_selection_empty"],
      details: {
        skippedTargets,
      },
    }
  }

  const broadcastRunId = randomUUID()
  const targets = plannedInstances.map((instance, index) =>
    buildPlannedTarget(instance, index, plannedInstances.length, requiredMethods))
  return {
    ok: true,
    plan: {
      broadcastRunId,
      toolName: params.toolName,
      transportMethod: policy.transportMethod,
      policy,
      selector,
      broadcastIntent,
      targets,
      skippedTargets,
      trace: {
        selector,
        broadcastIntent,
        requestedToolName: params.toolName,
        requiredMethods,
        plannedTargetIds: targets.map((target) => target.instanceId),
        skippedTargetIds: skippedTargets.map((target) => target.instanceId),
        retryReceipt: {
          requested: retryReceipt.requested,
          retryMode: retryReceipt.retryMode,
          previousBroadcastRunId: retryReceipt.previousBroadcastRunId,
          previousTargetCount: retryReceipt.previousTargetIds.size,
          previousSucceededCount: retryReceipt.previousSucceededIds.size,
          previousIncompleteCount: retryReceipt.previousIncompleteIds.size,
          skippedSucceededTargetIds: uniqueStrings(skippedSucceededTargetIds),
          skippedUnknownTargetIds: uniqueStrings(skippedUnknownTargetIds),
          retriedTargetIds: targets.map((target) => target.instanceId),
        },
      },
    },
  }
}

export function buildYeonjangBroadcastArtifactPath(params: {
  broadcastRunId: string
  instanceId: string
  sessionId?: string | null
  fileName: string
  rootDir: string
}): string {
  const sessionSegment = normalizeString(params.sessionId) || "session-unknown"
  return join(params.rootDir, params.broadcastRunId, params.instanceId, sessionSegment, params.fileName)
}

export function buildYeonjangBroadcastAggregateSummary(params: {
  broadcastRunId: string
  records: YeonjangBroadcastTargetExecutionRecord[]
  skippedTargets?: YeonjangBroadcastSkippedTarget[]
  retryTrace?: YeonjangBroadcastPlanTrace["retryReceipt"]
}): YeonjangBroadcastAggregateSummary {
  const successCount = params.records.filter((record) => record.status === "succeeded").length
  const failedCount = params.records.filter((record) => record.status === "failed").length
  const skippedCount = (params.skippedTargets?.length ?? 0) + params.records.filter((record) => record.status === "skipped").length
  const totalTargets = params.records.length + (params.skippedTargets?.length ?? 0)
  return {
    broadcastRunId: params.broadcastRunId,
    totalTargets,
    successCount,
    failedCount,
    skippedCount,
    partialSuccess: successCount > 0 && (failedCount > 0 || skippedCount > 0),
    reasonCodes: uniqueStrings([
      ...params.records.flatMap((record) => record.reasonCodes),
      ...(params.skippedTargets?.flatMap((record) => record.reasonCodes) ?? []),
    ]),
    retryRequested: params.retryTrace?.requested ?? false,
    retrySkippedSucceededCount: params.retryTrace?.skippedSucceededTargetIds.length ?? 0,
    retrySkippedUnknownCount: params.retryTrace?.skippedUnknownTargetIds.length ?? 0,
    retryTargetCount: params.retryTrace?.retriedTargetIds.length ?? params.records.length,
  }
}
