import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { buildYeonjangCapabilityProjection } from "../packages/core/src/capabilities/yeonjang-capability-projection.js"

function instance(overrides: Record<string, unknown> = {}) {
  return {
    instanceId: "internal-instance-1",
    nodeId: "internal-node-1",
    instanceAlias: "studio-mac",
    displayName: "Studio Mac",
    normalizedCallName: "studio mac",
    location: "local",
    platform: "darwin",
    supportProfile: "desktop_interactive",
    state: "online",
    lastSeenAt: 900,
    lastHeartbeatAgeMs: 100,
    runnableTarget: true,
    runnableReasonCodes: [],
    trustState: "trusted",
    scopeAccess: "allowed",
    duplicateLiveSessionDetected: false,
    supportedMethods: ["system.status", "screen.capture", "keyboard.type", "mouse.click"],
    session: { sessionId: "private-session" },
    hostFingerprintPreview: "private-host",
    installFingerprintPreview: "private-install",
    transport: ["mqtt/private/topic"],
    ownerUserId: "private-owner",
    workspaceScopeId: "private-workspace",
    ...overrides,
  }
}

describe("task034 Yeonjang public capability projection", () => {
  it("projects local and remote instances without internal registry fields", () => {
    const result = buildYeonjangCapabilityProjection({
      instances: [
        instance(),
        instance({
          instanceId: "internal-instance-2",
          displayName: "Build PC",
          location: "remote",
          platform: "win32",
          state: "permission_required",
          runnableTarget: false,
          lastSeenAt: 800,
          lastHeartbeatAgeMs: 200,
          supportedMethods: ["app.launch", "browser.list", "process.list", "disk.usage"],
        }),
      ],
      now: 1_000,
      staleAfterMs: 1_000,
      publicRefForInstanceId: (id) => `yeonjang_v1_${id.endsWith("1") ? "a" : "b".repeat(24)}`,
    })
    expect(result.items).toEqual([
      expect.objectContaining({
        displayName: "Build PC",
        location: "remote",
        platform: "windows",
        status: "permission_required",
        permissionState: "required",
        capabilityGroups: ["applications", "browser", "disk", "process"],
      }),
      expect.objectContaining({
        displayName: "Studio Mac",
        location: "local",
        platform: "macos",
        status: "ready",
        permissionState: "ready",
        capabilityGroups: ["input", "screen", "system"],
      }),
    ])
    const serialized = JSON.stringify(result)
    expect(serialized).not.toMatch(
      /internal-instance|internal-node|private-|mqtt|sessionId|fingerprint|ownerUserId|workspaceScopeId|supportedMethods/,
    )
  })

  it("fails closed for stale and duplicate installations", () => {
    const result = buildYeonjangCapabilityProjection({
      instances: [
        instance({ location: "remote", lastSeenAt: 10, lastHeartbeatAgeMs: 9_990 }),
        instance({
          instanceId: "duplicate",
          displayName: "Duplicate",
          duplicateLiveSessionDetected: true,
        }),
      ],
      now: 10_000,
      staleAfterMs: 1_000,
      duplicateLocalDetected: true,
      publicRefForInstanceId: (id) => `ref-${id}`,
    })
    expect(result.summary.duplicateInstanceDetected).toBe(true)
    expect(result.items.find((item) => item.displayName === "Studio Mac")).toMatchObject({
      status: "stale",
      actionableIssue: "yeonjang_stale",
      runnable: false,
    })
    expect(result.items.find((item) => item.displayName === "Duplicate")).toMatchObject({
      actionableIssue: "yeonjang_duplicate_instance",
      runnable: false,
    })
  })

  it("keeps Knowbee fallback explicit when no Yeonjang is installed", () => {
    const result = buildYeonjangCapabilityProjection({
      instances: [],
      now: 1,
      publicRefForInstanceId: (id) => id,
    })
    expect(result).toMatchObject({
      items: [],
      summary: {
        total: 0,
        knowbeeFallbackAvailable: true,
        computerControlAvailable: false,
      },
    })
  })

  it("does not depend on infrastructure or framework modules", () => {
    const source = readFileSync(
      "packages/core/src/capabilities/yeonjang-capability-projection.ts",
      "utf8",
    )
    expect(source).not.toMatch(/node:|process\.env|Fastify|React|mqtt|db\/|yeonjang\/registry/)
  })
})
