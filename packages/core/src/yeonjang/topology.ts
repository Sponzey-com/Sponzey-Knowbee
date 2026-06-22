import type { MqttExtensionSnapshot } from "../mqtt/broker.js"
import { getMqttExtensionSnapshots } from "../mqtt/broker.js"
import {
  type YeonjangInstanceTrustState,
  getYeonjangRegistrySummary,
  listYeonjangRegistryInstances,
  normalizeYeonjangCallName,
  type YeonjangRegistryInstanceView,
  type YeonjangRegistrySummary,
} from "./registry.js"

export type YeonjangSupportProfile = "desktop_interactive" | "desktop_limited" | "headless_managed"
export type YeonjangInstanceLocation = "local" | "remote"
export type YeonjangLocalityConfidence = "high" | "medium" | "low"
export type YeonjangTrustState = YeonjangInstanceTrustState
export type YeonjangDefaultTargetUiAction = "none" | "ask_user" | "ui_selection"

export interface YeonjangProjectedInstance extends YeonjangRegistryInstanceView {
  supportProfile: YeonjangSupportProfile
  location: YeonjangInstanceLocation
  localityConfidence: YeonjangLocalityConfidence
  localityReasonCodes: string[]
  trustState: YeonjangTrustState
  scopeAccess: YeonjangRegistryInstanceView["scopeAccess"]
  runnableTarget: boolean
  runnableReasonCodes: string[]
  interactiveDesktop: boolean
  trayWindowExpected: boolean
  buildTarget: string | null
  supportedMethods: string[]
  connectivityLatencyMs: number | null
  lastHeartbeatAgeMs: number | null
  defaultTargetEligible: boolean
  defaultTargetReasonCodes: string[]
}

export interface YeonjangDiffField<T> {
  local: T
  remote: T
  different: boolean
}

export interface YeonjangLocalRemoteDiffSummary {
  localInstanceId: string
  localNodeId: string
  remoteInstanceId: string
  remoteNodeId: string
  reasonCodes: string[]
  version: YeonjangDiffField<string | null>
  protocolVersion: YeonjangDiffField<string | null>
  permissionState: YeonjangDiffField<string>
  buildTarget: YeonjangDiffField<string | null>
  platform: YeonjangDiffField<string | null>
  connectivityLatencyMs: YeonjangDiffField<number | null>
  lastHeartbeatAgeMs: YeonjangDiffField<number | null>
  supportedMethods: {
    localOnly: string[]
    remoteOnly: string[]
  }
  updateRequired: boolean
  permissionMismatch: boolean
}

export interface YeonjangDefaultTargetSelection {
  ok: boolean
  status:
    | "auto_selected_local_interactive"
    | "auto_selected_pinned_remote"
    | "selection_required"
    | "ambiguous_state"
  reasonCodes: string[]
  uiAction: YeonjangDefaultTargetUiAction
  extensionId?: string
  instanceId?: string
  targetSessionId?: string | null
}

export interface YeonjangProjectionSummary extends YeonjangRegistrySummary {
  supportProfiles: {
    desktopInteractive: number
    desktopLimited: number
    headlessManaged: number
  }
  duplicateLocalDetected: boolean
  defaultTarget: YeonjangDefaultTargetSelection
}

export interface YeonjangPromptTargetCandidate {
  instanceId: string
  nodeId: string
  instanceAlias: string
  displayName: string
  normalizedCallName: string
  location: YeonjangInstanceLocation
  supportProfile: YeonjangSupportProfile
  trustState: YeonjangTrustState
  scopeAccess: YeonjangRegistryInstanceView["scopeAccess"]
  state: YeonjangProjectedInstance["state"]
  defaultTargetEligible: boolean
}

export interface YeonjangPromptProjection {
  registrySummary: YeonjangProjectionSummary
  exactTargetCandidates: YeonjangPromptTargetCandidate[]
  defaultTarget: YeonjangDefaultTargetSelection
  localRemoteDiffs: YeonjangLocalRemoteDiffSummary[]
}

export interface YeonjangFleetProjection {
  summary: YeonjangProjectionSummary
  instances: YeonjangProjectedInstance[]
  diffSummaries: YeonjangLocalRemoteDiffSummary[]
  promptProjection: YeonjangPromptProjection
}

export interface YeonjangFleetProjectionInput {
  instances?: YeonjangRegistryInstanceView[]
  snapshots?: MqttExtensionSnapshot[]
  registrySummary?: YeonjangRegistrySummary
  now?: number
  pinnedDefaultRemoteInstanceId?: string | null
}

const DEFAULT_LOCAL_NODE_ID = "yeonjang-main"

function normalizeString(value: string | null | undefined): string {
  return value?.trim() ?? ""
}

function previewFingerprint(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 6)}...${value.slice(-4)}`
}

function hostnameCandidate(): string {
  return normalizeString(process.env["KNOWBEE_HOSTNAME"])
    || normalizeString(process.env["COMPUTERNAME"])
    || normalizeString(process.env["HOSTNAME"])
    || "localhost"
}

function normalizeGatewayOs(): string {
  switch (process.platform) {
    case "darwin":
      return "macos"
    case "win32":
      return "windows"
    default:
      return process.platform
  }
}

function normalizeGatewayArch(): string {
  switch (process.arch) {
    case "x64":
      return "x86_64"
    case "arm64":
      return "aarch64"
    case "ia32":
      return "x86"
    default:
      return process.arch
  }
}

function stableHexHash(value: string): string {
  let hash = 0xcbf29ce484222325n
  for (const byte of Buffer.from(value, "utf-8")) {
    hash ^= BigInt(byte)
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return hash.toString(16).padStart(16, "0")
}

function gatewayHostFingerprintPreview(): string {
  return previewFingerprint(
    stableHexHash(`${hostnameCandidate()}|${normalizeGatewayOs()}|${normalizeGatewayArch()}`),
  )
}

export function normalizeYeonjangSupportProfile(
  value: string | null | undefined,
): YeonjangSupportProfile {
  switch (normalizeString(value).toLowerCase()) {
    case "desktop_limited":
      return "desktop_limited"
    case "headless_managed":
      return "headless_managed"
    default:
      return "desktop_interactive"
  }
}

export function normalizeYeonjangTrustState(
  value: string | null | undefined,
): YeonjangTrustState {
  switch (normalizeString(value).toLowerCase()) {
    case "trusted":
      return "trusted"
    case "pending":
    case "trust_pending":
      return "pending"
    case "revoked":
    case "untrusted":
    case "trust_revoked":
      return "revoked"
    case "quarantined":
    case "quarantine":
      return "quarantined"
    default:
      return "pending"
  }
}

function uniqueStrings(values: Iterable<string>): string[] {
  return [...new Set([...values].filter((value) => value.trim().length > 0))].sort()
}

function buildSnapshotIndex(
  snapshots: MqttExtensionSnapshot[],
): Map<string, MqttExtensionSnapshot> {
  const index = new Map<string, MqttExtensionSnapshot>()
  for (const snapshot of snapshots) {
    index.set(snapshot.extensionId, snapshot)
  }
  return index
}

function resolveProjectedLocation(input: {
  instance: YeonjangRegistryInstanceView
  gatewayHostPreview: string
}): Pick<YeonjangProjectedInstance, "location" | "localityConfidence" | "localityReasonCodes"> {
  const reasonCodes: string[] = []
  if (
    input.instance.hostFingerprintPreview
    && input.instance.hostFingerprintPreview === input.gatewayHostPreview
  ) {
    reasonCodes.push("matched_gateway_host_fingerprint")
    if (input.instance.installFingerprintPreview) {
      reasonCodes.push("install_context_observed")
    }
    return {
      location: "local",
      localityConfidence: "high",
      localityReasonCodes: reasonCodes,
    }
  }

  if (input.instance.isLocalCandidate || input.instance.nodeId === DEFAULT_LOCAL_NODE_ID) {
    reasonCodes.push("matched_gateway_default_node")
    if (!input.instance.hostFingerprintPreview) {
      reasonCodes.push("host_fingerprint_unavailable")
    }
    return {
      location: "local",
      localityConfidence: "medium",
      localityReasonCodes: reasonCodes,
    }
  }

  reasonCodes.push("gateway_host_mismatch")
  if (!input.instance.hostFingerprintPreview) {
    reasonCodes.push("host_fingerprint_unavailable")
  }
  return {
    location: "remote",
    localityConfidence: "low",
    localityReasonCodes: reasonCodes,
  }
}

function buildDefaultTargetEligibility(
  instance: Pick<
    YeonjangProjectedInstance,
    "state" | "location" | "supportProfile" | "localityConfidence" | "isLocalCandidate" | "trustState" | "scopeAccess"
  >,
): Pick<YeonjangProjectedInstance, "defaultTargetEligible" | "defaultTargetReasonCodes"> {
  const reasonCodes: string[] = []
  if (instance.state !== "online") {
    reasonCodes.push("state_not_online")
  }
  if (instance.location !== "local") {
    reasonCodes.push("not_local")
  }
  if (instance.supportProfile !== "desktop_interactive") {
    reasonCodes.push("profile_not_desktop_interactive")
  }
  const trustedLocal =
    instance.localityConfidence === "high"
    || (instance.localityConfidence === "medium" && instance.isLocalCandidate)
  if (!trustedLocal) {
    reasonCodes.push("local_not_trusted")
  }
  if (instance.trustState !== "trusted") {
    reasonCodes.push(instance.trustState === "quarantined" ? "local_trust_quarantined" : "local_trust_not_approved")
  }
  if (instance.scopeAccess !== "allowed") {
    reasonCodes.push(instance.scopeAccess === "foreign" ? "local_scope_forbidden" : "local_scope_unassigned")
  }
  if (reasonCodes.length === 0) {
    reasonCodes.push("eligible_local_interactive")
  }
  return {
    defaultTargetEligible: reasonCodes.length === 1 && reasonCodes[0] === "eligible_local_interactive",
    defaultTargetReasonCodes: reasonCodes,
  }
}

export function projectYeonjangInstances(
  input: Omit<YeonjangFleetProjectionInput, "pinnedDefaultRemoteInstanceId" | "registrySummary"> = {},
): YeonjangProjectedInstance[] {
  const instances = [...(input.instances ?? listYeonjangRegistryInstances())]
  const snapshots = input.snapshots ?? getMqttExtensionSnapshots()
  const snapshotIndex = buildSnapshotIndex(snapshots)
  const now = input.now ?? Date.now()
  const gatewayHostPreview = gatewayHostFingerprintPreview()
  for (const snapshot of snapshots) {
    if (instances.some((instance) => instance.nodeId === snapshot.extensionId)) continue
    const isSyntheticLocal = snapshot.extensionId === DEFAULT_LOCAL_NODE_ID
    instances.push({
      instanceId: normalizeString(snapshot.instanceId) || `snapshot:${snapshot.extensionId}`,
      instanceAlias: normalizeString(snapshot.instanceAlias) || snapshot.extensionId,
      displayName: normalizeString(snapshot.displayName) || snapshot.extensionId,
      normalizedCallName: normalizeYeonjangCallName(
        normalizeString(snapshot.instanceAlias) || normalizeString(snapshot.displayName) || snapshot.extensionId,
      ),
      nodeId: snapshot.extensionId,
      supportProfile: normalizeString(snapshot.supportProfile) || "desktop_interactive",
      platform: snapshot.platform ?? snapshot.os ?? null,
      arch: snapshot.arch ?? null,
      version: snapshot.version ?? null,
      protocolVersion: snapshot.protocolVersion ?? null,
      capabilityHash: snapshot.capabilityHash ?? null,
      methodCount: snapshot.methods.length,
      state: normalizeString(snapshot.state).toLowerCase() === "offline" ? "offline" : "online",
      stateMessage: snapshot.message ?? null,
      lastSeenAt: snapshot.lastSeenAt ?? now,
      liveSessionCount: snapshot.sessionId ? 1 : 0,
      duplicateLiveSessionDetected: false,
      isLocalCandidate: isSyntheticLocal,
      localMarker: isSyntheticLocal,
      ownerUserId: isSyntheticLocal ? "system:auto-local" : null,
      workspaceScopeId: snapshot.workspaceScopeId ?? (isSyntheticLocal ? "workspace:local-default" : null),
      scopeAccess: isSyntheticLocal ? "allowed" : "unassigned",
      trustState: isSyntheticLocal ? "trusted" : "pending",
      trustReason: isSyntheticLocal ? "snapshot_only_auto_local" : "snapshot_only_pairing_required",
      pairingFingerprintPreview: snapshot.pairingFingerprint
        ? previewFingerprint(snapshot.pairingFingerprint)
        : null,
      runnableTarget: isSyntheticLocal,
      runnableReasonCodes: isSyntheticLocal ? [] : ["target_trust_pending", "workspace_scope_unassigned"],
      hostFingerprintPreview: snapshot.hostFingerprint ? previewFingerprint(snapshot.hostFingerprint) : null,
      installFingerprintPreview: snapshot.installFingerprint ? previewFingerprint(snapshot.installFingerprint) : null,
      transport: snapshot.transport ?? [],
      session: snapshot.sessionId
        ? {
            sessionId: snapshot.sessionId,
            clientId: snapshot.clientId ?? null,
            startupMode: snapshot.startupMode ?? null,
            windowMode: snapshot.windowMode ?? null,
            trayState: snapshot.trayState ?? null,
            state: normalizeString(snapshot.state) || "online",
            message: snapshot.message ?? null,
            startedAt: snapshot.lastSeenAt ?? now,
            lastSeenAt: snapshot.lastSeenAt ?? now,
            endedAt: normalizeString(snapshot.state).toLowerCase() === "offline" ? snapshot.lastSeenAt ?? now : null,
            stale: false,
          }
        : null,
    })
  }
  return instances.map<YeonjangProjectedInstance>((instance) => {
    const snapshot = snapshotIndex.get(instance.nodeId)
    const supportProfile = normalizeYeonjangSupportProfile(
      snapshot?.supportProfile ?? instance.supportProfile,
    )
    const location = resolveProjectedLocation({ instance, gatewayHostPreview })
    const supportedMethods = uniqueStrings(snapshot?.methods ?? [])
    const lastHeartbeatAt = instance.lastSeenAt ?? snapshot?.lastSeenAt ?? null
    const lastHeartbeatAgeMs = lastHeartbeatAt != null ? Math.max(0, now - lastHeartbeatAt) : null
    const projectedBase: YeonjangProjectedInstance = {
      ...instance,
      supportProfile,
      location: location.location,
      localityConfidence: location.localityConfidence,
      localityReasonCodes: location.localityReasonCodes,
      trustState: instance.trustState ?? normalizeYeonjangTrustState(snapshot?.trustState),
      scopeAccess: instance.scopeAccess,
      runnableTarget: instance.runnableTarget,
      runnableReasonCodes: instance.runnableReasonCodes,
      interactiveDesktop: supportProfile === "desktop_interactive",
      trayWindowExpected: supportProfile !== "headless_managed",
      platform: snapshot?.platform ?? snapshot?.os ?? instance.platform,
      arch: snapshot?.arch ?? instance.arch,
      version: snapshot?.version ?? instance.version,
      protocolVersion: snapshot?.protocolVersion ?? instance.protocolVersion,
      buildTarget: normalizeString(snapshot?.buildTarget) || null,
      supportedMethods,
      connectivityLatencyMs: null,
      lastHeartbeatAgeMs,
      defaultTargetEligible: false,
      defaultTargetReasonCodes: [],
    }
    return {
      ...projectedBase,
      ...buildDefaultTargetEligibility(projectedBase),
    }
  })
}

export function resolveYeonjangDefaultTargetSelection(
  input: YeonjangFleetProjectionInput = {},
): YeonjangDefaultTargetSelection {
  const projected = projectYeonjangInstances(input)
  const pinnedRemoteInstanceId = normalizeString(input.pinnedDefaultRemoteInstanceId)
  const eligibleLocals = projected.filter((instance) => instance.defaultTargetEligible)
  const eligibleMarkedLocals = eligibleLocals.filter((instance) => instance.localMarker)
  if (eligibleMarkedLocals.length === 1) {
    const target = eligibleMarkedLocals[0]!
    return {
      ok: true,
      status: "auto_selected_local_interactive",
      reasonCodes: ["trusted_local_marker"],
      uiAction: "none",
      extensionId: target.nodeId,
      instanceId: target.instanceId,
      targetSessionId: target.session?.sessionId ?? null,
    }
  }
  if (eligibleMarkedLocals.length > 1) {
    return {
      ok: false,
      status: "ambiguous_state",
      reasonCodes: ["multiple_local_markers"],
      uiAction: "ui_selection",
    }
  }
  if (eligibleLocals.length === 1) {
    const target = eligibleLocals[0]!
    return {
      ok: true,
      status: "auto_selected_local_interactive",
      reasonCodes: ["single_trusted_local_interactive"],
      uiAction: "none",
      extensionId: target.nodeId,
      instanceId: target.instanceId,
      targetSessionId: target.session?.sessionId ?? null,
    }
  }
  if (eligibleLocals.length > 1) {
    return {
      ok: false,
      status: "ambiguous_state",
      reasonCodes: ["multiple_trusted_local_candidates"],
      uiAction: "ui_selection",
    }
  }

  const onlineLocals = projected.filter(
    (instance) => instance.location === "local" && instance.state === "online",
  )
  if (onlineLocals.length > 1) {
    return {
      ok: false,
      status: "ambiguous_state",
      reasonCodes: ["multiple_local_candidates"],
      uiAction: "ui_selection",
    }
  }
  if (onlineLocals.length === 1) {
    const onlyLocal = onlineLocals[0]!
    return {
      ok: false,
      status: "selection_required",
      reasonCodes: [
        onlyLocal.supportProfile !== "desktop_interactive"
          ? "local_profile_not_interactive"
          : "local_not_trusted",
      ],
      uiAction: "ask_user",
    }
  }

  if (pinnedRemoteInstanceId) {
    const pinnedRemote = projected.find(
      (instance) => instance.instanceId === pinnedRemoteInstanceId,
    )
    if (
      pinnedRemote
      && pinnedRemote.location === "remote"
      && pinnedRemote.state === "online"
      && pinnedRemote.trustState === "trusted"
      && pinnedRemote.scopeAccess === "allowed"
    ) {
      return {
        ok: true,
        status: "auto_selected_pinned_remote",
        reasonCodes: ["pinned_default_remote_instance"],
        uiAction: "none",
        extensionId: pinnedRemote.nodeId,
        instanceId: pinnedRemote.instanceId,
        targetSessionId: pinnedRemote.session?.sessionId ?? null,
      }
    }
    return {
      ok: false,
      status: "selection_required",
      reasonCodes: ["pinned_remote_unavailable"],
      uiAction: "ask_user",
    }
  }

  const onlineRemotes = projected.filter(
    (instance) =>
      instance.location === "remote"
      && instance.state === "online"
      && instance.trustState === "trusted"
      && instance.scopeAccess === "allowed",
  )
  if (onlineRemotes.length > 0) {
    return {
      ok: false,
      status: "selection_required",
      reasonCodes: ["remote_only_requires_explicit_selection"],
      uiAction: "ask_user",
    }
  }

  return {
    ok: false,
    status: "selection_required",
    reasonCodes: ["no_online_target_candidate"],
    uiAction: "ask_user",
  }
}

function diffField<T>(local: T, remote: T): YeonjangDiffField<T> {
  return {
    local,
    remote,
    different: local !== remote,
  }
}

function permissionStateOf(instance: YeonjangProjectedInstance): string {
  return instance.state === "permission_required" ? "permission_required" : "available"
}

function buildDiffSummary(
  localInstance: YeonjangProjectedInstance,
  remoteInstance: YeonjangProjectedInstance,
): YeonjangLocalRemoteDiffSummary {
  const supportedMethods = {
    localOnly: localInstance.supportedMethods.filter(
      (method) => !remoteInstance.supportedMethods.includes(method),
    ),
    remoteOnly: remoteInstance.supportedMethods.filter(
      (method) => !localInstance.supportedMethods.includes(method),
    ),
  }
  const permissionMismatch = permissionStateOf(localInstance) !== permissionStateOf(remoteInstance)
  const updateRequired =
    localInstance.state === "update_required" || remoteInstance.state === "update_required"
  const summary: YeonjangLocalRemoteDiffSummary = {
    localInstanceId: localInstance.instanceId,
    localNodeId: localInstance.nodeId,
    remoteInstanceId: remoteInstance.instanceId,
    remoteNodeId: remoteInstance.nodeId,
    reasonCodes: [],
    version: diffField(localInstance.version, remoteInstance.version),
    protocolVersion: diffField(localInstance.protocolVersion, remoteInstance.protocolVersion),
    permissionState: diffField(permissionStateOf(localInstance), permissionStateOf(remoteInstance)),
    buildTarget: diffField(localInstance.buildTarget, remoteInstance.buildTarget),
    platform: diffField(localInstance.platform, remoteInstance.platform),
    connectivityLatencyMs: diffField(
      localInstance.connectivityLatencyMs,
      remoteInstance.connectivityLatencyMs,
    ),
    lastHeartbeatAgeMs: diffField(
      localInstance.lastHeartbeatAgeMs,
      remoteInstance.lastHeartbeatAgeMs,
    ),
    supportedMethods,
    updateRequired,
    permissionMismatch,
  }
  if (summary.version.different) summary.reasonCodes.push("version_mismatch")
  if (summary.protocolVersion.different) summary.reasonCodes.push("protocol_version_mismatch")
  if (summary.permissionState.different) summary.reasonCodes.push("permission_state_mismatch")
  if (summary.buildTarget.different) summary.reasonCodes.push("build_target_mismatch")
  if (summary.platform.different) summary.reasonCodes.push("platform_mismatch")
  if (summary.lastHeartbeatAgeMs.different) summary.reasonCodes.push("heartbeat_age_mismatch")
  if (summary.connectivityLatencyMs.local == null || summary.connectivityLatencyMs.remote == null) {
    summary.reasonCodes.push("latency_unavailable")
  }
  if (summary.supportedMethods.localOnly.length > 0) {
    summary.reasonCodes.push("missing_capability_on_remote")
  }
  if (summary.supportedMethods.remoteOnly.length > 0) {
    summary.reasonCodes.push("missing_capability_on_local")
  }
  if (summary.updateRequired) summary.reasonCodes.push("update_required")
  return {
    ...summary,
    reasonCodes: uniqueStrings(summary.reasonCodes),
  }
}

export function buildYeonjangLocalRemoteDiffSummaries(
  input: Omit<YeonjangFleetProjectionInput, "pinnedDefaultRemoteInstanceId" | "registrySummary"> = {},
): YeonjangLocalRemoteDiffSummary[] {
  const projected = projectYeonjangInstances(input)
  const primaryLocal = projected.find((instance) => instance.location === "local")
  if (!primaryLocal) return []
  return projected
    .filter((instance) => instance.location === "remote")
    .map((remoteInstance) => buildDiffSummary(primaryLocal, remoteInstance))
}

export function buildYeonjangPromptProjection(
  input: YeonjangFleetProjectionInput = {},
): YeonjangPromptProjection {
  const projected = projectYeonjangInstances(input)
  const defaultTarget = resolveYeonjangDefaultTargetSelection(input)
  const registrySummary = buildYeonjangProjectionSummary({
    projected,
    ...(input.registrySummary ? { registrySummary: input.registrySummary } : {}),
    defaultTarget,
  })
  return {
    registrySummary,
    exactTargetCandidates: projected
      .filter((instance) => instance.runnableTarget)
      .map((instance) => ({
        instanceId: instance.instanceId,
        nodeId: instance.nodeId,
        instanceAlias: instance.instanceAlias,
        displayName: instance.displayName,
        normalizedCallName: normalizeYeonjangCallName(instance.instanceAlias),
        location: instance.location,
        supportProfile: instance.supportProfile,
        trustState: instance.trustState,
        scopeAccess: instance.scopeAccess,
        state: instance.state,
        defaultTargetEligible: instance.defaultTargetEligible,
      })),
    defaultTarget,
    localRemoteDiffs: buildYeonjangLocalRemoteDiffSummaries({
      ...input,
      instances: projected,
    }),
  }
}

function buildYeonjangProjectionSummary(input: {
  projected: YeonjangProjectedInstance[]
  registrySummary?: YeonjangRegistrySummary
  defaultTarget: YeonjangDefaultTargetSelection
}): YeonjangProjectionSummary {
  const base = input.registrySummary ?? {
    totalInstances: input.projected.length,
    online: input.projected.filter((instance) => instance.state === "online").length,
    offline: input.projected.filter((instance) => instance.state === "offline").length,
    degraded: input.projected.filter((instance) => instance.state === "degraded").length,
    permissionRequired: input.projected.filter((instance) => instance.state === "permission_required").length,
    updateRequired: input.projected.filter((instance) => instance.state === "update_required").length,
    discovered: input.projected.filter((instance) => instance.state === "discovered").length,
    duplicateLiveSessionInstances: input.projected.filter((instance) => instance.duplicateLiveSessionDetected).length,
    duplicateConflictCount: 0,
    localCandidates: input.projected.filter((instance) => instance.isLocalCandidate).length,
    localInstances: input.projected.filter((instance) => instance.location === "local").length,
    remoteInstances: input.projected.filter((instance) => instance.location === "remote").length,
    trusted: input.projected.filter((instance) => instance.trustState === "trusted").length,
    pending: input.projected.filter((instance) => instance.trustState === "pending").length,
    revoked: input.projected.filter((instance) => instance.trustState === "revoked").length,
    quarantined: input.projected.filter((instance) => instance.trustState === "quarantined").length,
    foreignInstances: input.projected.filter((instance) => instance.scopeAccess === "foreign").length,
    unassignedScopeInstances: input.projected.filter((instance) => instance.scopeAccess === "unassigned").length,
    activeWorkspaceScopeId: input.projected.find((instance) => instance.scopeAccess === "allowed")?.workspaceScopeId ?? "workspace:local-default",
    localMarkerInstanceId: input.projected.find((instance) => instance.localMarker)?.instanceId ?? null,
  }
  const supportProfiles = {
    desktopInteractive: input.projected.filter((instance) => instance.supportProfile === "desktop_interactive").length,
    desktopLimited: input.projected.filter((instance) => instance.supportProfile === "desktop_limited").length,
    headlessManaged: input.projected.filter((instance) => instance.supportProfile === "headless_managed").length,
  }
  return {
    ...base,
    localInstances: input.projected.filter((instance) => instance.location === "local").length,
    remoteInstances: input.projected.filter((instance) => instance.location === "remote").length,
    supportProfiles,
    duplicateLocalDetected: input.projected.filter((instance) => instance.location === "local").length > 1,
    defaultTarget: input.defaultTarget,
  }
}

export function buildYeonjangFleetProjection(
  input: YeonjangFleetProjectionInput = {},
): YeonjangFleetProjection {
  const projected = projectYeonjangInstances(input)
  const registrySummary = input.registrySummary
    ?? (input.instances ? undefined : getYeonjangRegistrySummary({ ...(input.now != null ? { now: input.now } : {}) }))
  const defaultTarget = resolveYeonjangDefaultTargetSelection({
    ...input,
    instances: projected,
  })
  const summary = buildYeonjangProjectionSummary({
    projected,
    ...(registrySummary ? { registrySummary } : {}),
    defaultTarget,
  })
  const diffSummaries = buildYeonjangLocalRemoteDiffSummaries({
    ...input,
    instances: projected,
  })
  return {
    summary,
    instances: projected,
    diffSummaries,
    promptProjection: {
      registrySummary: summary,
      exactTargetCandidates: projected
        .filter((instance) => instance.runnableTarget)
        .map((instance) => ({
        instanceId: instance.instanceId,
        nodeId: instance.nodeId,
        instanceAlias: instance.instanceAlias,
        displayName: instance.displayName,
        normalizedCallName: instance.normalizedCallName,
        location: instance.location,
        supportProfile: instance.supportProfile,
        trustState: instance.trustState,
        scopeAccess: instance.scopeAccess,
        state: instance.state,
        defaultTargetEligible: instance.defaultTargetEligible,
      })),
      defaultTarget,
      localRemoteDiffs: diffSummaries,
    },
  }
}
