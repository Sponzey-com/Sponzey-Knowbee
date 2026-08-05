import type { YeonjangCapabilityItem } from "./yeonjang-capability-projection.js"
import type { YeonjangPlatform } from "./yeonjang-platform-support.js"

export interface YeonjangPlatformProbeContext {
  readonly platform: Exclude<YeonjangPlatform, "unknown">
  readonly supportProfile: YeonjangCapabilityItem["supportProfile"]
  readonly deadlineAt: number
}

export interface YeonjangPlatformProbeObservation {
  platform: Exclude<YeonjangPlatform, "unknown">
  packageReady: boolean
  processReady: boolean
  trayWindowState: "ready" | "limited" | "unsupported"
  permissionState: YeonjangCapabilityItem["permissionState"]
  observedAt: number
}

export interface YeonjangPlatformProbeReceipt {
  platform: Exclude<YeonjangPlatform, "unknown">
  status: "passed" | "failed" | "cancelled"
  reasonCodes: string[]
  observedAt: number | null
}

export type YeonjangPlatformProbeLogLevel = "product" | "field_debug" | "development"

export function projectYeonjangPlatformProbeLog(input: {
  level: YeonjangPlatformProbeLogLevel
  receipt: YeonjangPlatformProbeReceipt
  displayName: string
  durationMs: number
}): Readonly<Record<string, unknown>> {
  const base = {
    level: input.level,
    platform: input.receipt.platform,
    status: input.receipt.status,
    reasonCodes: input.receipt.reasonCodes,
  }
  if (input.level === "product") return Object.freeze(base)
  if (input.level === "field_debug")
    return Object.freeze({
      ...base,
      displayName: input.displayName.trim() || "Yeonjang",
      probeKind: "package_health",
      durationMs: Math.max(0, Math.floor(input.durationMs)),
    })
  return Object.freeze({
    ...base,
    transition: input.receipt.status === "passed" ? "probe_verified" : "probe_terminal",
    observedAt: input.receipt.observedAt,
  })
}

export type YeonjangPlatformProbePort = (
  context: YeonjangPlatformProbeContext,
  signal: AbortSignal,
) => Promise<YeonjangPlatformProbeObservation | null>

async function waitForProbeDeadline(intervalMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(done, intervalMs)
    function done() {
      clearTimeout(timeout)
      signal.removeEventListener("abort", done)
      resolve()
    }
    signal.addEventListener("abort", done, { once: true })
  })
}

function receipt(input: {
  platform: Exclude<YeonjangPlatform, "unknown">
  status: YeonjangPlatformProbeReceipt["status"]
  reasonCodes: string[]
  observedAt?: number
}): YeonjangPlatformProbeReceipt {
  return Object.freeze({
    platform: input.platform,
    status: input.status,
    reasonCodes: Object.freeze([...new Set(input.reasonCodes)].sort()) as string[],
    observedAt: input.observedAt ?? null,
  })
}

export async function executeYeonjangPlatformProbe(
  input: {
    context: YeonjangPlatformProbeContext
    now(): number
    probe: YeonjangPlatformProbePort
    wait?: (intervalMs: number, signal: AbortSignal) => Promise<void>
  },
  signal: AbortSignal,
): Promise<YeonjangPlatformProbeReceipt> {
  if (signal.aborted)
    return receipt({
      platform: input.context.platform,
      status: "cancelled",
      reasonCodes: ["platform_probe_cancelled"],
    })
  if (!Number.isFinite(input.context.deadlineAt) || input.now() > input.context.deadlineAt)
    return receipt({
      platform: input.context.platform,
      status: "failed",
      reasonCodes: ["platform_probe_timeout"],
    })

  const controller = new AbortController()
  const abort = () => controller.abort()
  signal.addEventListener("abort", abort, { once: true })
  const remainingMs = Math.max(0, input.context.deadlineAt - input.now())
  const result = await Promise.race([
    input.probe(input.context, controller.signal).then((observation) => ({
      type: "observation" as const,
      observation,
    })),
    (input.wait ?? waitForProbeDeadline)(remainingMs, controller.signal).then(() => ({
      type: signal.aborted ? ("cancelled" as const) : ("timeout" as const),
    })),
  ])
  signal.removeEventListener("abort", abort)
  if (result.type !== "observation") {
    controller.abort()
    return receipt({
      platform: input.context.platform,
      status: result.type === "cancelled" ? "cancelled" : "failed",
      reasonCodes: [
        result.type === "cancelled" ? "platform_probe_cancelled" : "platform_probe_timeout",
      ],
    })
  }
  controller.abort()
  const observation = result.observation
  if (signal.aborted)
    return receipt({
      platform: input.context.platform,
      status: "cancelled",
      reasonCodes: ["platform_probe_cancelled"],
    })
  if (!observation || !Number.isFinite(observation.observedAt))
    return receipt({
      platform: input.context.platform,
      status: "failed",
      reasonCodes: ["platform_probe_observation_invalid"],
    })
  if (observation.platform !== input.context.platform)
    return receipt({
      platform: input.context.platform,
      status: "failed",
      reasonCodes: ["platform_probe_target_mismatch"],
      observedAt: observation.observedAt,
    })
  if (input.now() > input.context.deadlineAt || observation.observedAt > input.context.deadlineAt)
    return receipt({
      platform: input.context.platform,
      status: "failed",
      reasonCodes: ["platform_probe_timeout"],
      observedAt: observation.observedAt,
    })

  const reasons: string[] = []
  if (!observation.packageReady) reasons.push("platform_package_not_ready")
  if (!observation.processReady) reasons.push("platform_process_not_ready")
  if (observation.permissionState !== "ready") reasons.push("platform_permission_not_ready")
  const expectedTray = input.context.supportProfile !== "headless_managed"
  if (expectedTray && observation.trayWindowState === "unsupported")
    reasons.push("platform_tray_window_unavailable")
  if (!expectedTray && observation.trayWindowState !== "unsupported")
    reasons.push("headless_tray_window_unexpected")
  return receipt({
    platform: input.context.platform,
    status: reasons.length === 0 ? "passed" : "failed",
    reasonCodes: reasons,
    observedAt: observation.observedAt,
  })
}
