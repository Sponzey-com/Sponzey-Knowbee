import type {
  YeonjangBrowserFocusReadinessProjection,
  YeonjangBrowserFocusReadinessStatus,
} from "../capabilities/yeonjang-browser-focus-contract.js"
import { YEONJANG_BROWSER_FOCUS_CONTRACT } from "../capabilities/yeonjang-browser-focus-contract.js"
import type { YeonjangPlatformCapabilityReceipt } from "./yeonjang-platform-acceptance.js"

export interface ProjectYeonjangBrowserFocusReadinessReceiptsInput {
  projection: YeonjangBrowserFocusReadinessProjection
  observedAt: number
}

export function projectYeonjangBrowserFocusReadinessReceipts(
  input: ProjectYeonjangBrowserFocusReadinessReceiptsInput,
): YeonjangPlatformCapabilityReceipt[] {
  return input.projection.targets.flatMap((target) => {
    const platform = normalizeReceiptPlatform(target.platform)
    if (!platform) return []
    return [{
      platform,
      method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
      ...receiptStatusFromReadiness(target.readinessStatus),
      observedAt: input.observedAt,
      evidenceRef: `capability:${platform}:browser-focus:${slugify(target.publicTargetName) || "target"}`,
    }]
  })
}

function receiptStatusFromReadiness(
  status: YeonjangBrowserFocusReadinessStatus,
): Pick<YeonjangPlatformCapabilityReceipt, "supported" | "permissionEnabled" | "toolHealthStatus"> {
  switch (status) {
    case "ready":
      return { supported: true, permissionEnabled: true, toolHealthStatus: "ready" }
    case "permission_required":
      return { supported: true, permissionEnabled: false, toolHealthStatus: "permission_disabled" }
    case "unsupported":
    case "headless_unavailable":
      return { supported: false, permissionEnabled: false, toolHealthStatus: "unsupported" }
    case "target_identity_required":
    case "command_backend_required":
    case "observation_backend_required":
      return { supported: false, permissionEnabled: false, toolHealthStatus: "unknown" }
  }
}

function normalizeReceiptPlatform(platform: "macos" | "windows" | "linux" | "unknown"): "macos" | "windows" | "linux" | null {
  return platform === "unknown" ? null : platform
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/giu, "-")
    .replace(/^-+|-+$/gu, "")
}
