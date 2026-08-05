import { describe, expect, it } from "vitest"
import {
  buildYeonjangBrowserFocusReadinessProjection,
  selectYeonjangBrowserFocusReadyTargets,
} from "../packages/core/src/capabilities/yeonjang-browser-focus-contract.ts"
import { projectYeonjangBrowserFocusReadinessReceipts } from "../packages/core/src/release/yeonjang-browser-focus-readiness-adapter.ts"
import { buildYeonjangPlatformAcceptanceMatrix } from "../packages/core/src/release/yeonjang-platform-acceptance.ts"

describe("Task 115 Yeonjang browser.focus readiness adapter", () => {
  it("turns browser.focus readiness projection into release capability receipts without marking blocked targets passed", () => {
    const projection = buildYeonjangBrowserFocusReadinessProjection({
      observations: [
        {
          publicTargetName: "Office Mac",
          internalInstanceId: "private-mac",
          platform: "macos",
          desktopSession: "available",
          capabilitySupported: true,
          permissionGranted: true,
          commandBackendAvailable: true,
          observationBackendAvailable: true,
        },
        {
          publicTargetName: "Studio Windows",
          internalInstanceId: "private-win",
          platform: "windows",
          desktopSession: "available",
          capabilitySupported: true,
          permissionGranted: false,
          commandBackendAvailable: true,
          observationBackendAvailable: true,
        },
        {
          publicTargetName: "Linux Headless",
          internalInstanceId: "private-linux",
          platform: "linux",
          desktopSession: "headless",
          capabilitySupported: true,
          permissionGranted: true,
          commandBackendAvailable: true,
          observationBackendAvailable: true,
        },
        {
          publicTargetName: "Unknown Worker",
          internalInstanceId: "private-unknown",
          platform: "unknown",
          desktopSession: "unknown",
          capabilitySupported: false,
          permissionGranted: false,
          commandBackendAvailable: false,
          observationBackendAvailable: false,
        },
      ],
    })
    const receipts = projectYeonjangBrowserFocusReadinessReceipts({
      projection,
      observedAt: 115_000,
    })

    expect(receipts).toEqual([
      expect.objectContaining({
        platform: "macos",
        method: "browser.focus",
        supported: true,
        permissionEnabled: true,
        toolHealthStatus: "ready",
        evidenceRef: "capability:macos:browser-focus:office-mac",
      }),
      expect.objectContaining({
        platform: "windows",
        method: "browser.focus",
        supported: true,
        permissionEnabled: false,
        toolHealthStatus: "permission_disabled",
        evidenceRef: "capability:windows:browser-focus:studio-windows",
      }),
      expect.objectContaining({
        platform: "linux",
        method: "browser.focus",
        supported: false,
        permissionEnabled: false,
        toolHealthStatus: "unsupported",
        evidenceRef: "capability:linux:browser-focus:linux-headless",
      }),
    ])
    expect(receipts).toHaveLength(3)

    const matrix = buildYeonjangPlatformAcceptanceMatrix({
      requiredPlatforms: ["macos", "windows", "linux"],
      availablePlatforms: ["macos", "windows", "linux"],
      deterministicReceipts: [
        { platform: "macos", status: "passed", reasonCodes: [] },
        { platform: "windows", status: "passed", reasonCodes: [] },
        { platform: "linux", status: "passed", reasonCodes: [] },
      ],
      liveRecords: [],
      requiredCapabilityMethods: ["browser.focus"],
      capabilityReceipts: receipts,
      now: 115_000,
      maxSessionAgeMs: 5_000,
    })

    expect(matrix.platforms.find((item) => item.platform === "macos")?.capabilityReadiness).toEqual([
      expect.objectContaining({ method: "browser.focus", status: "passed" }),
    ])
    expect(matrix.platforms.find((item) => item.platform === "windows")?.capabilityReadiness).toEqual([
      expect.objectContaining({ method: "browser.focus", status: "permission_disabled" }),
    ])
    expect(matrix.platforms.find((item) => item.platform === "linux")?.capabilityReadiness).toEqual([
      expect.objectContaining({ method: "browser.focus", status: "unsupported" }),
    ])
    expect(matrix.capabilityReady).toBe(false)
    expect(JSON.stringify({ receipts, matrix })).not.toMatch(/private-|Unknown Worker|internalInstanceId|rawFocusedTarget/u)
  })

  it("exposes only ready public targets as browser.focus selectable gate input", () => {
    const projection = buildYeonjangBrowserFocusReadinessProjection({
      observations: [
        {
          publicTargetName: "Office Mac",
          internalInstanceId: "private-mac",
          platform: "macos",
          desktopSession: "available",
          capabilitySupported: true,
          permissionGranted: true,
          commandBackendAvailable: true,
          observationBackendAvailable: true,
        },
        {
          publicTargetName: "Linux Desktop",
          internalInstanceId: "private-linux",
          platform: "linux",
          desktopSession: "available",
          capabilitySupported: true,
          permissionGranted: true,
          commandBackendAvailable: true,
          observationBackendAvailable: false,
        },
      ],
    })

    expect(selectYeonjangBrowserFocusReadyTargets(projection)).toEqual([
      {
        publicTargetName: "Office Mac",
        platform: "macos",
        method: "browser.focus",
        requiresApproval: true,
        permissionSetting: "allow_browser_control",
      },
    ])
    expect(JSON.stringify(selectYeonjangBrowserFocusReadyTargets(projection))).not.toMatch(/private-|Linux Desktop/u)
  })
})
