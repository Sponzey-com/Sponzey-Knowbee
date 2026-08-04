import { createHash } from "node:crypto"
import type {
  YeonjangMqttV2CapabilitiesObservation,
  YeonjangMqttV2StatusObservation,
} from "./mqtt-v2-contract.js"
import type {
  YeonjangInstanceTrustState,
  YeonjangRegistryObservation,
} from "./registry.js"

export interface ExistingYeonjangV2RegistryIdentity {
  readonly instanceId: string
  readonly instanceAlias: string
  readonly displayName: string
  readonly nodeId: string
  readonly supportProfile: string
  readonly platform: string | null
  readonly arch: string | null
  readonly version: string | null
  readonly capabilityHash: string | null
  readonly methodCount: number
  readonly workspaceScopeId: string | null
  readonly trustState: YeonjangInstanceTrustState
  readonly state?: string
}

export function projectYeonjangMqttV2CapabilitiesToRegistryObservation(input: {
  readonly capabilities: YeonjangMqttV2CapabilitiesObservation
  readonly clientId: string | null
  readonly existing: ExistingYeonjangV2RegistryIdentity | null
}): YeonjangRegistryObservation {
  const existing = input.existing
  const capabilityMatrix = Object.fromEntries(input.capabilities.capabilities.map((row) => [
    row.method,
    {
      supported: row.implementationStatus === "executable",
      supportState: row.implementationStatus,
      requiresApproval: true,
      requiresPermission: true,
      permissionSetting: row.resource === "camera" ? "allow_camera_access" : "allow_screen_capture",
      knownLimitations: row.knownLimitation ? [row.knownLimitation] : [],
      outputModes: ["artifact"],
      lastCheckedAt: input.capabilities.observedAt,
    },
  ]))
  const permissions = Object.fromEntries(input.capabilities.capabilities.map((row) => [
    row.resource === "camera" ? "allow_camera_access" : "allow_screen_capture",
    row.localPolicy === "allowed" && row.platformAvailable,
  ]))
  const capabilityHash = `sha256:${createHash("sha256").update(JSON.stringify({
    protocolVersion: 2,
    platform: input.capabilities.platform,
    policyRevision: input.capabilities.policyRevision,
    capabilities: input.capabilities.capabilities,
  })).digest("hex")}`
  return {
    instanceId: input.capabilities.instanceId,
    instanceAlias: existing?.instanceAlias ?? input.capabilities.instanceId,
    displayName: existing?.displayName ?? input.capabilities.instanceId,
    nodeId: existing?.nodeId ?? input.capabilities.instanceId,
    supportProfile: existing?.supportProfile ?? "desktop_interactive",
    platform: input.capabilities.platform,
    arch: existing?.arch ?? null,
    sessionId: input.capabilities.sessionId,
    clientId: input.clientId,
    connectionState: existing?.state ?? "discovered",
    message: "mqtt_v2_capabilities_verified",
    version: existing?.version ?? null,
    protocolVersion: "2",
    capabilityHash,
    transport: ["mqtt_v2"],
    permissions,
    capabilityMatrix,
    methodCount: input.capabilities.advertisedMethods.length,
    workspaceScopeId: existing?.workspaceScopeId ?? null,
    trustState: existing?.trustState ?? "pending",
    observedAt: input.capabilities.observedAt,
  }
}

/**
 * Converts admitted v2 liveness into the existing registry command shape.
 * Alias, trust, workspace, and capability facts stay owned by the registry;
 * a status packet cannot replace them with user-facing or transport text.
 */
export function projectYeonjangMqttV2StatusToRegistryObservation(input: {
  readonly status: YeonjangMqttV2StatusObservation
  readonly clientId: string | null
  readonly existing: ExistingYeonjangV2RegistryIdentity | null
}): YeonjangRegistryObservation {
  const existing = input.existing
  return {
    instanceId: input.status.instanceId,
    instanceAlias: existing?.instanceAlias ?? input.status.instanceId,
    displayName: existing?.displayName ?? input.status.instanceId,
    nodeId: existing?.nodeId ?? input.status.instanceId,
    supportProfile: existing?.supportProfile ?? "desktop_interactive",
    platform: existing?.platform ?? null,
    arch: existing?.arch ?? null,
    sessionId: input.status.sessionId,
    clientId: input.clientId,
    connectionState: input.status.state,
    message: input.status.state === "online" ? "mqtt_v2_online" : "mqtt_v2_offline",
    version: existing?.version ?? null,
    protocolVersion: "2",
    // A v1 capability snapshot cannot authorize a v2 command. The signed v2
    // capabilities projection repopulates these fields in its own pass.
    capabilityHash: null,
    transport: ["mqtt_v2"],
    methodCount: 0,
    workspaceScopeId: existing?.workspaceScopeId ?? null,
    trustState: existing?.trustState ?? "pending",
    observedAt: input.status.observedAt,
  }
}
