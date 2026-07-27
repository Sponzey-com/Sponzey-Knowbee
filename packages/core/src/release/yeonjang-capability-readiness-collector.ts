import type { ReleaseTargetPlatform } from "./package.js"
import type { YeonjangPlatformCapabilityReceipt } from "./yeonjang-platform-acceptance.js"

export type YeonjangCapabilityToolHealthStatus =
  | "ready"
  | "permission_disabled"
  | "unsupported"
  | "unknown"

export interface YeonjangCapabilityReadinessSummaryEntry {
  supported: boolean
  permissionEnabled: boolean
  toolHealthStatus: YeonjangCapabilityToolHealthStatus
}

export interface YeonjangCapabilityReadinessObservation {
  publicTargetName: string
  platform: ReleaseTargetPlatform
  runnableTarget: boolean
  observedAt: number
  capabilitySummary: Readonly<Record<string, YeonjangCapabilityReadinessSummaryEntry>>
}

export interface CollectYeonjangPlatformCapabilityReceiptsInput {
  requiredMethods: readonly string[]
  observations: readonly YeonjangCapabilityReadinessObservation[]
}

export function collectYeonjangPlatformCapabilityReceipts(
  input: CollectYeonjangPlatformCapabilityReceiptsInput,
): YeonjangPlatformCapabilityReceipt[] {
  const requiredMethods = [...new Set(input.requiredMethods.map(normalizeMethod).filter(Boolean))]
  const receipts: YeonjangPlatformCapabilityReceipt[] = []
  for (const observation of input.observations) {
    const targetSlug = slugify(observation.publicTargetName) || "target"
    for (const method of requiredMethods) {
      const summary = observation.capabilitySummary[method]
      const nonRunnableFallback: YeonjangCapabilityReadinessSummaryEntry = {
        supported: false,
        permissionEnabled: false,
        toolHealthStatus: "unknown",
      }
      const effective = observation.runnableTarget
        ? summary ?? nonRunnableFallback
        : summary?.toolHealthStatus === "unsupported"
          ? summary
          : nonRunnableFallback
      receipts.push(Object.freeze({
        platform: observation.platform,
        method,
        supported: effective.supported,
        permissionEnabled: effective.permissionEnabled,
        toolHealthStatus: effective.toolHealthStatus,
        observedAt: observation.observedAt,
        evidenceRef: `capability:${observation.platform}:${method.replace(/[^a-z0-9]+/giu, "-").replace(/^-+|-+$/gu, "")}:${targetSlug}`,
      }))
    }
  }
  return receipts
}

function normalizeMethod(value: string): string {
  return value.trim()
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/giu, "-")
    .replace(/^-+|-+$/gu, "")
}
