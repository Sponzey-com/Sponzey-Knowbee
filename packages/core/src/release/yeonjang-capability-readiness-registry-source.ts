import type Database from "better-sqlite3"
import { getDb } from "../db/index.js"
import { listYeonjangRegistryInstances } from "../yeonjang/registry.js"
import type {
  YeonjangCapabilityReadinessObservation,
  YeonjangCapabilityReadinessSummaryEntry,
  YeonjangCapabilityToolHealthStatus,
} from "./yeonjang-capability-readiness-collector.js"

interface YeonjangCapabilitySourceRow {
  instance_id: string
  permissions_json: string | null
  tool_health_json: string | null
  capability_matrix_json: string | null
}

export interface CollectYeonjangCapabilityReadinessObservationsFromRegistryInput {
  requiredMethods: readonly string[]
  now: number
  db?: Database.Database
}

export function collectYeonjangCapabilityReadinessObservationsFromRegistry(
  input: CollectYeonjangCapabilityReadinessObservationsFromRegistryInput,
): YeonjangCapabilityReadinessObservation[] {
  const db = input.db ?? getDb()
  const views = listYeonjangRegistryInstances({ db, now: input.now })
  const rows = db
    .prepare<[], YeonjangCapabilitySourceRow>(
      `SELECT instance_id, permissions_json, tool_health_json, capability_matrix_json
       FROM yeonjang_instances`,
    )
    .all()
  const rowById = new Map(rows.map((row) => [row.instance_id, row]))
  const requiredMethods = [...new Set(input.requiredMethods.map((method) => method.trim()).filter(Boolean))]
  const observations: YeonjangCapabilityReadinessObservation[] = []

  for (const view of views) {
    if (view.platform !== "macos" && view.platform !== "windows" && view.platform !== "linux") continue
    const row = rowById.get(view.instanceId)
    if (!row) continue
    const permissions = parseRecord(row.permissions_json)
    const toolHealth = parseRecord(row.tool_health_json)
    const capabilityMatrix = parseRecord(row.capability_matrix_json)
    const capabilitySummary: Record<string, YeonjangCapabilityReadinessSummaryEntry> = {}
    for (const method of requiredMethods) {
      capabilitySummary[method] = summarizeCapability(method, permissions, toolHealth, capabilityMatrix)
    }
    observations.push(Object.freeze({
      publicTargetName: view.displayName,
      platform: view.platform,
      runnableTarget: view.runnableTarget || isPermissionOnlyReadinessTarget(view.runnableReasonCodes),
      observedAt: view.lastSeenAt ?? input.now,
      capabilitySummary: Object.freeze(capabilitySummary),
    }))
  }
  return observations
}

function isPermissionOnlyReadinessTarget(reasonCodes: readonly string[]): boolean {
  return reasonCodes.length > 0 && reasonCodes.every((code) => code === "target_state_permission_required")
}

function summarizeCapability(
  method: string,
  permissions: Record<string, unknown>,
  toolHealth: Record<string, unknown>,
  capabilityMatrix: Record<string, unknown>,
): YeonjangCapabilityReadinessSummaryEntry {
  const matrixEntry = readRecord(capabilityMatrix[method])
  const healthEntry = readRecord(toolHealth[method])
  const supported = matrixEntry?.supported === true
  const permissionSetting = typeof matrixEntry?.permissionSetting === "string"
    ? matrixEntry.permissionSetting.trim()
    : ""
  const permissionEnabled = permissionSetting ? permissions[permissionSetting] !== false : supported
  const rawHealthStatus = typeof healthEntry?.status === "string" ? healthEntry.status.trim() : ""
  const toolHealthStatus = normalizeToolHealthStatus(rawHealthStatus, supported, permissionEnabled)
  return Object.freeze({
    supported,
    permissionEnabled,
    toolHealthStatus,
  })
}

function normalizeToolHealthStatus(
  value: string,
  supported: boolean,
  permissionEnabled: boolean,
): YeonjangCapabilityToolHealthStatus {
  if (value === "ready" || value === "permission_disabled" || value === "unsupported" || value === "unknown") {
    return value
  }
  if (!supported) return "unsupported"
  if (!permissionEnabled) return "permission_disabled"
  return "unknown"
}

function parseRecord(value: string | null): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value) as unknown
    return readRecord(parsed) ?? {}
  } catch {
    return {}
  }
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}
