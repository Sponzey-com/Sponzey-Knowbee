import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { closeDb } from "../packages/core/src/db/index.js"
import { collectYeonjangCapabilityReadinessObservationsFromRegistry } from "../packages/core/src/release/yeonjang-capability-readiness-registry-source.ts"
import { collectYeonjangPlatformCapabilityReceipts } from "../packages/core/src/release/yeonjang-capability-readiness-collector.ts"
import { upsertYeonjangRegistryObservation } from "../packages/core/src/yeonjang/registry.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []

beforeEach(() => {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-task046-capability-source-"))
  tempDirs.push(stateDir)
  initializeTestDbRuntime(stateDir)
})

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("Task 046 Yeonjang capability readiness registry source", () => {
  it("summarizes registry capability matrix, permissions, and tool health without raw identifiers", () => {
    const now = 1_000
    expect(upsertYeonjangRegistryObservation({
      instanceId: "private-instance-1",
      instanceAlias: "office-mac-target",
      displayName: "Office Mac",
      nodeId: "yeonjang-main",
      supportProfile: "desktop_interactive",
      platform: "macos",
      arch: "arm64",
      sessionId: "private-session-1",
      clientId: "private-client-1",
      connectionState: "online",
      message: "ready",
      version: "0.1.0",
      protocolVersion: "2026-04-16.capability-matrix.v1",
      capabilityHash: "private-capability-hash",
      transport: ["mqtt-json"],
      trustState: "trusted",
      ownerUserId: "user:test",
      workspaceScopeId: "workspace:test",
      permissions: {
        allow_clipboard_read: true,
        allow_clipboard_write: false,
      },
      toolHealth: {
        "clipboard.read": { status: "ready", internalDetail: "private clipboard detail" },
        "clipboard.write": { status: "permission_disabled", internalDetail: "private clipboard detail" },
      },
      capabilityMatrix: {
        "clipboard.read": { supported: true, permissionSetting: "allow_clipboard_read", rawSchema: { secret: "private" } },
        "clipboard.write": { supported: true, permissionSetting: "allow_clipboard_write", rawSchema: { secret: "private" } },
      },
      methodCount: 2,
      startupMode: "autostart",
      windowMode: "hidden",
      trayState: "visible",
      observedAt: now,
    })).toEqual(expect.objectContaining({ ok: true }))

    const observations = collectYeonjangCapabilityReadinessObservationsFromRegistry({
      requiredMethods: ["clipboard.read", "clipboard.write"],
      now,
    })
    expect(observations).toEqual([
      expect.objectContaining({
        publicTargetName: "Office Mac",
        platform: "macos",
        runnableTarget: true,
        observedAt: now,
        capabilitySummary: {
          "clipboard.read": { supported: true, permissionEnabled: true, toolHealthStatus: "ready" },
          "clipboard.write": { supported: true, permissionEnabled: false, toolHealthStatus: "permission_disabled" },
        },
      }),
    ])
    expect(JSON.stringify(observations)).not.toMatch(/private-instance-1|private-session-1|private-client-1|rawSchema|permissions_json|tool_health_json|capability_matrix_json|private clipboard detail/u)

    const receipts = collectYeonjangPlatformCapabilityReceipts({
      requiredMethods: ["clipboard.read", "clipboard.write"],
      observations,
    })
    expect(receipts).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: "clipboard.read", toolHealthStatus: "ready" }),
      expect.objectContaining({ method: "clipboard.write", toolHealthStatus: "permission_disabled" }),
    ]))
  })

  it("marks missing matrix or unsupported platforms as unknown sanitized observations", () => {
    expect(upsertYeonjangRegistryObservation({
      instanceId: "private-instance-2",
      instanceAlias: "unknown-box-target",
      displayName: "Unknown Box",
      nodeId: "yeonjang-unknown",
      supportProfile: "desktop_interactive",
      platform: "freebsd",
      arch: "x64",
      sessionId: "private-session-2",
      clientId: "private-client-2",
      connectionState: "online",
      message: "ready",
      version: "0.1.0",
      protocolVersion: "2026-04-16.capability-matrix.v1",
      capabilityHash: "cap2",
      transport: ["mqtt-json"],
      trustState: "trusted",
      ownerUserId: "user:test",
      workspaceScopeId: "workspace:test",
      permissions: {},
      toolHealth: {},
      capabilityMatrix: {},
      methodCount: 0,
      observedAt: 2_000,
    })).toEqual(expect.objectContaining({ ok: true }))

    const observations = collectYeonjangCapabilityReadinessObservationsFromRegistry({
      requiredMethods: ["device.status"],
      now: 2_000,
    })
    expect(observations).toEqual([])
  })
})
