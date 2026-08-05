import { describe, expect, it } from "vitest"
import { collectYeonjangPlatformCapabilityReceipts } from "../packages/core/src/release/yeonjang-capability-readiness-collector.ts"

describe("Task 045 Yeonjang capability readiness collector", () => {
  it("converts sanitized tool health observations into platform capability receipts", () => {
    const receipts = collectYeonjangPlatformCapabilityReceipts({
      requiredMethods: ["clipboard.read", "clipboard.write", "network.status"],
      observations: [
        {
          publicTargetName: "Office Mac",
          platform: "macos",
          runnableTarget: true,
          observedAt: 1_000,
          capabilitySummary: {
            "clipboard.read": { supported: true, permissionEnabled: true, toolHealthStatus: "ready" },
            "clipboard.write": { supported: true, permissionEnabled: false, toolHealthStatus: "permission_disabled" },
            "network.status": { supported: true, permissionEnabled: true, toolHealthStatus: "ready" },
          },
        },
      ],
    })

    expect(receipts).toEqual([
      expect.objectContaining({
        platform: "macos",
        method: "clipboard.read",
        supported: true,
        permissionEnabled: true,
        toolHealthStatus: "ready",
        observedAt: 1_000,
        evidenceRef: "capability:macos:clipboard-read:office-mac",
      }),
      expect.objectContaining({
        platform: "macos",
        method: "clipboard.write",
        supported: true,
        permissionEnabled: false,
        toolHealthStatus: "permission_disabled",
        evidenceRef: "capability:macos:clipboard-write:office-mac",
      }),
      expect.objectContaining({ method: "network.status", toolHealthStatus: "ready" }),
    ])
    expect(JSON.stringify(receipts)).not.toMatch(/instanceId|sessionId|clientId|capabilityMatrix|private clipboard/u)
  })

  it("fails closed for non-runnable, unsupported, unknown, and missing method observations", () => {
    const receipts = collectYeonjangPlatformCapabilityReceipts({
      requiredMethods: ["device.status", "clipboard.read", "clipboard.write"],
      observations: [
        {
          publicTargetName: "Linux Headless",
          platform: "linux",
          runnableTarget: false,
          observedAt: 2_000,
          capabilitySummary: {
            "device.status": { supported: true, permissionEnabled: true, toolHealthStatus: "ready" },
            "clipboard.read": { supported: false, permissionEnabled: false, toolHealthStatus: "unsupported" },
          },
        },
      ],
    })

    expect(receipts).toEqual([
      expect.objectContaining({ method: "device.status", supported: false, permissionEnabled: false, toolHealthStatus: "unknown" }),
      expect.objectContaining({ method: "clipboard.read", supported: false, permissionEnabled: false, toolHealthStatus: "unsupported" }),
      expect.objectContaining({ method: "clipboard.write", supported: false, permissionEnabled: false, toolHealthStatus: "unknown" }),
    ])
  })
})
