export type YeonjangIdentityKind = "knowbee_runtime" | "yeonjang_instance" | "computer" | "operating_system"
export type YeonjangInstanceLocality = "local" | "remote"
export type YeonjangObservedOsFamily = "macos" | "windows" | "linux" | "other" | "unknown"

export interface KnowbeeRuntimeIdentitySnapshot {
  kind: "knowbee_runtime"
  runtimeId: string
  hostComputerId: string
  observedAt: number
}

export interface YeonjangInstanceIdentitySnapshot {
  kind: "yeonjang_instance"
  instanceId: string
  label: string
  instanceAlias: string
  callNames: string[]
  locality: YeonjangInstanceLocality
  computerId: string
  connectionState: "online" | "degraded" | "offline"
  trustState: "trusted" | "pending" | "revoked" | "quarantined"
  capabilitySnapshotRef: string
  permissionSnapshotRef: string
  capabilityIds: string[]
  observedAt: number
}

export interface ComputerIdentitySnapshot {
  kind: "computer"
  computerId: string
  label: string
  operatingSystemId: string
  observedAt: number
}

export interface OperatingSystemIdentitySnapshot {
  kind: "operating_system"
  operatingSystemId: string
  family: YeonjangObservedOsFamily
  version: string | null
  architecture: string | null
  observedAt: number
}

export interface YeonjangIdentityBoundarySnapshot {
  schemaVersion: 1
  runtime: KnowbeeRuntimeIdentitySnapshot
  instances: YeonjangInstanceIdentitySnapshot[]
  computers: ComputerIdentitySnapshot[]
  operatingSystems: OperatingSystemIdentitySnapshot[]
  capturedAt: number
}

export interface YeonjangUserFacingInstanceIdentity {
  label: string
  locality: YeonjangInstanceLocality
  connectionState: YeonjangInstanceIdentitySnapshot["connectionState"]
  computerName: string
  operatingSystem: {
    family: YeonjangObservedOsFamily
    version: string | null
    architecture: string | null
  }
  capabilityCount: number
}

function required(value: string, field: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} is required.`)
  return normalized
}

function timestamp(value: number, field: string, capturedAt: number, maxAgeMs: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${field} must be a non-negative integer.`)
  if (value > capturedAt) throw new Error(`${field} cannot be later than capturedAt.`)
  if (capturedAt - value > maxAgeMs) throw new Error(`${field} is stale.`)
  return value
}

function uniqueIds<T>(values: readonly T[], id: (value: T) => string, field: string): Map<string, T> {
  const result = new Map<string, T>()
  for (const value of values) {
    const key = required(id(value), field)
    if (result.has(key)) throw new Error(`${field} must be unique: ${key}.`)
    result.set(key, value)
  }
  return result
}

export function validateYeonjangIdentityBoundarySnapshot(input: {
  snapshot: YeonjangIdentityBoundarySnapshot
  maxAgeMs: number
}): YeonjangIdentityBoundarySnapshot {
  const { snapshot } = input
  if (snapshot.schemaVersion !== 1) throw new Error("Unsupported Yeonjang identity schema version.")
  if (!Number.isSafeInteger(input.maxAgeMs) || input.maxAgeMs < 0) throw new Error("maxAgeMs must be a non-negative integer.")
  timestamp(snapshot.capturedAt, "capturedAt", snapshot.capturedAt, input.maxAgeMs)
  required(snapshot.runtime.runtimeId, "Runtime ID")
  const hostComputerId = required(snapshot.runtime.hostComputerId, "Runtime host computer ID")
  timestamp(snapshot.runtime.observedAt, "Runtime observation", snapshot.capturedAt, input.maxAgeMs)

  const computers = uniqueIds(snapshot.computers, (item) => item.computerId, "Computer ID")
  const operatingSystems = uniqueIds(snapshot.operatingSystems, (item) => item.operatingSystemId, "Operating system ID")
  uniqueIds(snapshot.instances, (item) => item.instanceId, "Yeonjang instance ID")
  if (!computers.has(hostComputerId)) throw new Error("Runtime host computer association is missing.")

  for (const computer of snapshot.computers) {
    required(computer.label, "Computer label")
    if (!operatingSystems.has(required(computer.operatingSystemId, "Computer operating system ID"))) {
      throw new Error(`Computer operating system association is missing: ${computer.computerId}.`)
    }
    timestamp(computer.observedAt, "Computer observation", snapshot.capturedAt, input.maxAgeMs)
  }
  for (const operatingSystem of snapshot.operatingSystems) {
    timestamp(operatingSystem.observedAt, "Operating system observation", snapshot.capturedAt, input.maxAgeMs)
    if (operatingSystem.family === "unknown" && (operatingSystem.version !== null || operatingSystem.architecture !== null)) {
      throw new Error("Unknown operating systems cannot contain inferred version or architecture.")
    }
  }
  for (const instance of snapshot.instances) {
    required(instance.label, "Yeonjang instance label")
    required(instance.instanceAlias, "Yeonjang instance alias")
    uniqueIds(instance.callNames, (value) => value, "Yeonjang call name")
    const computerId = required(instance.computerId, "Yeonjang instance computer ID")
    if (!computers.has(computerId)) throw new Error(`Yeonjang instance computer association is missing: ${instance.instanceId}.`)
    const expectedLocality: YeonjangInstanceLocality = computerId === hostComputerId ? "local" : "remote"
    if (instance.locality !== expectedLocality) {
      throw new Error(`Yeonjang instance locality contradicts its verified computer association: ${instance.instanceId}.`)
    }
    required(instance.capabilitySnapshotRef, "Capability snapshot reference")
    required(instance.permissionSnapshotRef, "Permission snapshot reference")
    uniqueIds(instance.capabilityIds, (value) => value, "Capability ID")
    timestamp(instance.observedAt, "Yeonjang instance observation", snapshot.capturedAt, input.maxAgeMs)
  }
  return structuredClone(snapshot)
}

export function projectYeonjangUserFacingIdentities(
  snapshot: YeonjangIdentityBoundarySnapshot,
): YeonjangUserFacingInstanceIdentity[] {
  const computers = new Map(snapshot.computers.map((item) => [item.computerId, item]))
  const operatingSystems = new Map(snapshot.operatingSystems.map((item) => [item.operatingSystemId, item]))
  return snapshot.instances.map((instance) => {
    const computer = computers.get(instance.computerId)
    if (!computer) throw new Error("Validated computer association is required for user projection.")
    const operatingSystem = operatingSystems.get(computer.operatingSystemId)
    if (!operatingSystem) throw new Error("Validated operating system association is required for user projection.")
    return {
      label: instance.label,
      locality: instance.locality,
      connectionState: instance.connectionState,
      computerName: computer.label,
      operatingSystem: {
        family: operatingSystem.family,
        version: operatingSystem.version,
        architecture: operatingSystem.architecture,
      },
      capabilityCount: instance.capabilityIds.length,
    }
  })
}
