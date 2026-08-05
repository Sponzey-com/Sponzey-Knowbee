import type {
  YeonjangBrowserFocusBackendReadinessPlatform,
  YeonjangBrowserFocusBackendReadinessSource,
  YeonjangBrowserFocusBackendSignalSource,
} from "./yeonjang-browser-focus-readiness-source.js"

export type YeonjangBrowserFocusDesktopProbeStatus = "available" | "headless" | "unknown"
export type YeonjangBrowserFocusBackendProbeStatus = "ready" | "missing" | "unsupported" | "unknown"
export type YeonjangBrowserFocusPermissionProbeStatus = "granted" | "denied" | "unknown"

export interface YeonjangBrowserFocusProbeSignal<TStatus extends string> {
  status: TStatus
  evidenceRef: string
  rawDetails?: Record<string, unknown> | undefined
}

export interface YeonjangBrowserFocusBackendProbeRecord {
  publicTargetName: string
  internalInstanceId?: string | undefined
  platform: YeonjangBrowserFocusBackendReadinessPlatform
  desktopSessionProbe: YeonjangBrowserFocusProbeSignal<YeonjangBrowserFocusDesktopProbeStatus>
  commandBackendProbe: YeonjangBrowserFocusProbeSignal<YeonjangBrowserFocusBackendProbeStatus>
  focusedTargetObservationBackendProbe: YeonjangBrowserFocusProbeSignal<YeonjangBrowserFocusBackendProbeStatus>
  browserControlPermissionProbe: YeonjangBrowserFocusProbeSignal<YeonjangBrowserFocusPermissionProbeStatus>
  focusedTargetObservationPermissionProbe?: YeonjangBrowserFocusProbeSignal<YeonjangBrowserFocusPermissionProbeStatus> | undefined
}

export function assembleYeonjangBrowserFocusReadinessSourcesFromProbes(input: {
  records: readonly YeonjangBrowserFocusBackendProbeRecord[]
}): YeonjangBrowserFocusBackendReadinessSource[] {
  return input.records.map((record) => Object.freeze({
    publicTargetName: normalizePublicName(record.publicTargetName),
    ...(record.internalInstanceId?.trim() ? { internalInstanceId: record.internalInstanceId.trim() } : {}),
    platform: record.platform,
    desktopSession: record.desktopSessionProbe.status,
    browserFocusCapabilityAdvertised: record.commandBackendProbe.status !== "unsupported",
    browserControlPermissionGranted: record.browserControlPermissionProbe.status === "granted",
    focusedTargetObservationPermissionGranted: record.focusedTargetObservationPermissionProbe
      ? record.focusedTargetObservationPermissionProbe.status === "granted"
      : undefined,
    commandBackend: backendSignalSource(record.commandBackendProbe),
    observationBackend: backendSignalSource(record.focusedTargetObservationBackendProbe),
  }))
}

function backendSignalSource(
  probe: YeonjangBrowserFocusProbeSignal<YeonjangBrowserFocusBackendProbeStatus>,
): YeonjangBrowserFocusBackendSignalSource {
  return Object.freeze({
    status: probe.status,
    evidenceSource: "platform_backend_probe",
    evidenceRef: normalizeEvidenceRef(probe.evidenceRef),
    ...(probe.rawDetails ? { auditOnlyDetails: probe.rawDetails } : {}),
  })
}

function normalizePublicName(value: string): string {
  const normalized = value.trim().replace(/\s+/gu, " ")
  return normalized || "Yeonjang target"
}

function normalizeEvidenceRef(value: string): string {
  const normalized = value.trim().replace(/\s+/gu, "-")
  return normalized || "probe:evidence:missing"
}
