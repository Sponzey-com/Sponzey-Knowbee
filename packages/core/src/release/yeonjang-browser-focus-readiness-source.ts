import {
  buildYeonjangBrowserFocusReadinessProjection,
  YEONJANG_BROWSER_FOCUS_CONTRACT,
  type YeonjangBrowserFocusReadinessProjection,
} from "../capabilities/yeonjang-browser-focus-contract.js"
import type { YeonjangPlatformCapabilityReceipt } from "./yeonjang-platform-acceptance.js"
import { YEONJANG_BROWSER_FOCUS_OBSERVATION_METHOD } from "./yeonjang-browser-focus-release-gate.js"

export type YeonjangBrowserFocusBackendReadinessPlatform =
  | "macos"
  | "windows"
  | "linux"
  | "unknown"

export type YeonjangBrowserFocusBackendSourceStatus =
  | "ready"
  | "permission_required"
  | "missing"
  | "unsupported"
  | "headless_unavailable"
  | "unknown"

export type YeonjangBrowserFocusBackendEvidenceSource =
  | "rust_dispatch_contract"
  | "focused_target_observation_contract"
  | "platform_backend_probe"
  | "os_permission_probe"

export interface YeonjangBrowserFocusBackendSignalSource {
  status: Exclude<YeonjangBrowserFocusBackendSourceStatus, "permission_required" | "headless_unavailable">
  evidenceSource: YeonjangBrowserFocusBackendEvidenceSource
  evidenceRef: string
  auditOnlyDetails?: Record<string, unknown> | undefined
}

export interface YeonjangBrowserFocusBackendReadinessSource {
  publicTargetName: string
  internalInstanceId?: string | undefined
  platform: YeonjangBrowserFocusBackendReadinessPlatform
  desktopSession: "available" | "headless" | "unknown"
  browserFocusCapabilityAdvertised: boolean
  browserControlPermissionGranted: boolean
  focusedTargetObservationPermissionGranted?: boolean | undefined
  commandBackend: YeonjangBrowserFocusBackendSignalSource
  observationBackend: YeonjangBrowserFocusBackendSignalSource
}

export interface YeonjangBrowserFocusPublicBackendSource {
  publicTargetName: string
  platform: Exclude<YeonjangBrowserFocusBackendReadinessPlatform, "unknown">
  desktopSession: "available" | "headless" | "unknown"
  commandBackend: {
    method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
    status: YeonjangBrowserFocusBackendSourceStatus
    evidenceSource: YeonjangBrowserFocusBackendEvidenceSource
    evidenceRef: string
  }
  observationBackend: {
    method: typeof YEONJANG_BROWSER_FOCUS_OBSERVATION_METHOD
    status: YeonjangBrowserFocusBackendSourceStatus
    evidenceSource: YeonjangBrowserFocusBackendEvidenceSource
    evidenceRef: string
  }
}

export interface YeonjangBrowserFocusReadinessSourceProjection {
  schemaVersion: "yeonjang-browser-focus-readiness-source-v1"
  publicSources: YeonjangBrowserFocusPublicBackendSource[]
  readinessProjection: YeonjangBrowserFocusReadinessProjection
  capabilityReceipts: YeonjangPlatformCapabilityReceipt[]
}

export function projectYeonjangBrowserFocusBackendReadinessSources(input: {
  sources: readonly YeonjangBrowserFocusBackendReadinessSource[]
  observedAt: number
}): YeonjangBrowserFocusReadinessSourceProjection {
  const publicSources = input.sources.flatMap(projectPublicSource)
  const readinessProjection = buildYeonjangBrowserFocusReadinessProjection({
    observations: publicSources.map((source) => ({
      publicTargetName: source.publicTargetName,
      platform: source.platform,
      desktopSession: source.desktopSession,
      capabilitySupported:
        source.commandBackend.status !== "unsupported" &&
        source.commandBackend.status !== "missing" &&
        source.commandBackend.status !== "unknown",
      permissionGranted:
        source.commandBackend.status !== "permission_required" &&
        source.observationBackend.status !== "permission_required",
      commandBackendAvailable: source.commandBackend.status === "ready",
      observationBackendAvailable: source.observationBackend.status === "ready",
    })),
  })
  return Object.freeze({
    schemaVersion: "yeonjang-browser-focus-readiness-source-v1",
    publicSources: Object.freeze(publicSources) as YeonjangBrowserFocusPublicBackendSource[],
    readinessProjection,
    capabilityReceipts: Object.freeze(
      publicSources.flatMap((source) => capabilityReceiptsFromPublicSource(source, input.observedAt)),
    ) as YeonjangPlatformCapabilityReceipt[],
  })
}

function projectPublicSource(
  source: YeonjangBrowserFocusBackendReadinessSource,
): YeonjangBrowserFocusPublicBackendSource[] {
  if (source.platform === "unknown") return []
  const publicTargetName = normalizePublicName(source.publicTargetName)
  const commandStatus = normalizeBackendStatus({
    backendStatus: source.commandBackend.status,
    desktopSession: source.desktopSession,
    permissionGranted: source.browserControlPermissionGranted,
    capabilityAdvertised: source.browserFocusCapabilityAdvertised,
  })
  const observationStatus = normalizeBackendStatus({
    backendStatus: source.observationBackend.status,
    desktopSession: source.desktopSession,
    permissionGranted: source.focusedTargetObservationPermissionGranted ?? true,
    capabilityAdvertised: true,
  })
  return [Object.freeze({
    publicTargetName,
    platform: source.platform,
    desktopSession: source.desktopSession,
    commandBackend: Object.freeze({
      method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
      status: commandStatus,
      evidenceSource: source.commandBackend.evidenceSource,
      evidenceRef: normalizeEvidenceRef(source.commandBackend.evidenceRef),
    }),
    observationBackend: Object.freeze({
      method: YEONJANG_BROWSER_FOCUS_OBSERVATION_METHOD,
      status: observationStatus,
      evidenceSource: source.observationBackend.evidenceSource,
      evidenceRef: normalizeEvidenceRef(source.observationBackend.evidenceRef),
    }),
  })]
}

function normalizeBackendStatus(input: {
  backendStatus: YeonjangBrowserFocusBackendSignalSource["status"]
  desktopSession: YeonjangBrowserFocusBackendReadinessSource["desktopSession"]
  permissionGranted: boolean
  capabilityAdvertised: boolean
}): YeonjangBrowserFocusBackendSourceStatus {
  if (input.desktopSession === "headless") return "headless_unavailable"
  if (!input.capabilityAdvertised) return "unsupported"
  if (!input.permissionGranted) return "permission_required"
  return input.backendStatus
}

function capabilityReceiptsFromPublicSource(
  source: YeonjangBrowserFocusPublicBackendSource,
  observedAt: number,
): YeonjangPlatformCapabilityReceipt[] {
  return [
    receiptFromBackend({
      platform: source.platform,
      method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
      status: source.commandBackend.status,
      evidenceRef: source.commandBackend.evidenceRef,
      observedAt,
    }),
    receiptFromBackend({
      platform: source.platform,
      method: YEONJANG_BROWSER_FOCUS_OBSERVATION_METHOD,
      status: source.observationBackend.status,
      evidenceRef: source.observationBackend.evidenceRef,
      observedAt,
    }),
  ]
}

function receiptFromBackend(input: {
  platform: Exclude<YeonjangBrowserFocusBackendReadinessPlatform, "unknown">
  method: string
  status: YeonjangBrowserFocusBackendSourceStatus
  evidenceRef: string
  observedAt: number
}): YeonjangPlatformCapabilityReceipt {
  const status = receiptHealthFromBackendStatus(input.status)
  return Object.freeze({
    platform: input.platform,
    method: input.method,
    ...status,
    observedAt: input.observedAt,
    evidenceRef: input.evidenceRef,
  })
}

function receiptHealthFromBackendStatus(
  status: YeonjangBrowserFocusBackendSourceStatus,
): Pick<YeonjangPlatformCapabilityReceipt, "supported" | "permissionEnabled" | "toolHealthStatus"> {
  switch (status) {
    case "ready":
      return { supported: true, permissionEnabled: true, toolHealthStatus: "ready" }
    case "permission_required":
      return { supported: true, permissionEnabled: false, toolHealthStatus: "permission_disabled" }
    case "unsupported":
    case "headless_unavailable":
      return { supported: false, permissionEnabled: false, toolHealthStatus: "unsupported" }
    case "missing":
    case "unknown":
      return { supported: false, permissionEnabled: false, toolHealthStatus: "unknown" }
  }
}

function normalizePublicName(value: string): string {
  const normalized = value.trim().replace(/\s+/gu, " ")
  return normalized || "Yeonjang target"
}

function normalizeEvidenceRef(value: string): string {
  const normalized = value.trim().replace(/\s+/gu, "-")
  return normalized || "capability:evidence:missing"
}
