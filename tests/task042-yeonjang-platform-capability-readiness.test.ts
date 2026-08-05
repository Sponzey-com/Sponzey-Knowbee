import { describe, expect, it } from "vitest"
import { buildYeonjangPlatformAcceptanceMatrix } from "../packages/core/src/release/yeonjang-platform-acceptance.ts"

function receipt(overrides: Partial<{
  platform: "linux" | "windows" | "macos"
  method: string
  supported: boolean
  permissionEnabled: boolean
  toolHealthStatus: "ready" | "permission_disabled" | "unsupported" | "unknown"
  observedAt: number
  evidenceRef: string
}> = {}) {
  return {
    platform: overrides.platform ?? "macos",
    method: overrides.method ?? "clipboard.write",
    supported: overrides.supported ?? true,
    permissionEnabled: overrides.permissionEnabled ?? true,
    toolHealthStatus: overrides.toolHealthStatus ?? "ready",
    observedAt: overrides.observedAt ?? 1_000,
    evidenceRef: overrides.evidenceRef ?? "capability:macos:clipboard-write",
  } as const
}

describe("Task 042 Yeonjang platform capability readiness", () => {
  it("uses one camera capability receipt schema across macOS, Windows, and Linux fixtures", () => {
    const platforms = ["macos", "windows", "linux"] as const
    const matrix = buildYeonjangPlatformAcceptanceMatrix({
      requiredPlatforms: [...platforms],
      availablePlatforms: [...platforms],
      deterministicReceipts: platforms.map((platform) => ({
        platform,
        status: "passed" as const,
        reasonCodes: [],
      })),
      liveRecords: [],
      requiredCapabilityMethods: ["camera.list", "camera.capture"],
      capabilityReceipts: platforms.flatMap((platform) => [
        receipt({
          platform,
          method: "camera.list",
          evidenceRef: `capability:${platform}:camera-list`,
        }),
        receipt({
          platform,
          method: "camera.capture",
          evidenceRef: `capability:${platform}:camera-capture`,
        }),
      ]),
      now: 1_000,
      maxSessionAgeMs: 5_000,
    })

    expect(matrix.capabilityReady).toBe(true)
    for (const platform of platforms) {
      expect(
        matrix.platforms.find((item) => item.platform === platform)
          ?.capabilityReadiness,
      ).toEqual([
        expect.objectContaining({ method: "camera.capture", status: "passed" }),
        expect.objectContaining({ method: "camera.list", status: "passed" }),
      ])
    }
  })

  it("marks required clipboard capabilities passed without running side-effect smoke", () => {
    const matrix = buildYeonjangPlatformAcceptanceMatrix({
      requiredPlatforms: ["macos"],
      availablePlatforms: ["macos"],
      deterministicReceipts: [{ platform: "macos", status: "passed", reasonCodes: [] }],
      liveRecords: [],
      requiredCapabilityMethods: ["clipboard.read", "clipboard.write"],
      capabilityReceipts: [
        receipt({ method: "clipboard.read", evidenceRef: "capability:macos:clipboard-read" }),
        receipt({ method: "clipboard.write", evidenceRef: "capability:macos:clipboard-write" }),
      ],
      now: 1_000,
      maxSessionAgeMs: 5_000,
    })

    const row = matrix.platforms.find((item) => item.platform === "macos")
    expect(row?.capabilityReadiness).toEqual([
      expect.objectContaining({ method: "clipboard.read", status: "passed" }),
      expect.objectContaining({ method: "clipboard.write", status: "passed" }),
    ])
    expect(row?.evidenceRefs).toEqual([
      "capability:macos:clipboard-read",
      "capability:macos:clipboard-write",
    ])
    expect(matrix.capabilityReady).toBe(true)
    expect(matrix.publicReleaseReady).toBe(false)
  })

  it("fails closed for permission disabled, missing, stale, and duplicate capability receipts", () => {
    const matrix = buildYeonjangPlatformAcceptanceMatrix({
      requiredPlatforms: ["macos"],
      availablePlatforms: ["macos"],
      deterministicReceipts: [{ platform: "macos", status: "passed", reasonCodes: [] }],
      liveRecords: [],
      requiredCapabilityMethods: ["clipboard.read", "clipboard.write", "device.status", "network.status"],
      capabilityReceipts: [
        receipt({ method: "clipboard.read", observedAt: -10_000 }),
        receipt({ method: "clipboard.write", permissionEnabled: false, toolHealthStatus: "permission_disabled" }),
        receipt({ method: "device.status", evidenceRef: "capability:macos:device-status:a" }),
        receipt({ method: "device.status", evidenceRef: "capability:macos:device-status:b" }),
      ],
      now: 1_000,
      maxSessionAgeMs: 5_000,
    })

    const row = matrix.platforms.find((item) => item.platform === "macos")
    expect(row?.capabilityReadiness).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: "clipboard.read", status: "stale" }),
      expect.objectContaining({ method: "clipboard.write", status: "permission_disabled" }),
      expect.objectContaining({ method: "device.status", status: "failed" }),
      expect.objectContaining({ method: "network.status", status: "missing" }),
    ]))
    expect(row?.reasonCodes).toEqual(expect.arrayContaining([
      "platform_capability_clipboard_read_stale",
      "platform_capability_clipboard_write_permission_disabled",
      "platform_capability_device_status_duplicate",
      "platform_capability_network_status_missing",
    ]))
    expect(matrix.capabilityReady).toBe(false)
    expect(JSON.stringify(matrix)).not.toMatch(/session|instance|private clipboard/u)
  })
})
