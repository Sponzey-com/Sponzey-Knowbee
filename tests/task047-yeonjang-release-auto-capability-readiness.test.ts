import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { closeDb, getDb } from "../packages/core/src/db/index.js"
import { buildReleaseManifest } from "../packages/core/src/release/package.ts"
import { upsertYeonjangRegistryObservation } from "../packages/core/src/yeonjang/registry.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"

const directories: string[] = []
const NOW = new Date("2026-07-21T10:00:00.000Z")

afterEach(() => {
  closeDb()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe("Task 047 Yeonjang release auto capability readiness", () => {
  it("collects sanitized platform capability receipts from registry when explicitly enabled", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task047-release-auto-capability-"))
    directories.push(rootDir)
    const runtime = createTestRuntimeConfigFixture({ rootDir })
    getDb({ paths: runtime.paths })

    expect(upsertYeonjangRegistryObservation({
      instanceId: "private-instance-047",
      instanceAlias: "studio-mac-target",
      displayName: "Studio Mac",
      nodeId: "yeonjang-main",
      supportProfile: "desktop_interactive",
      platform: "macos",
      arch: "arm64",
      sessionId: "private-session-047",
      clientId: "private-client-047",
      connectionState: "online",
      message: "ready",
      version: "0.1.0",
      protocolVersion: "2026-04-16.capability-matrix.v1",
      capabilityHash: "private-capability-hash-047",
      transport: ["mqtt-json"],
      trustState: "trusted",
      ownerUserId: "user:test",
      workspaceScopeId: "workspace:test",
      permissions: {
        allow_clipboard_read: true,
        allow_clipboard_write: false,
      },
      toolHealth: {
        "clipboard.read": { status: "ready", internalDetail: "private clipboard read detail" },
        "clipboard.write": { status: "permission_disabled", internalDetail: "private clipboard write detail" },
      },
      capabilityMatrix: {
        "clipboard.read": { supported: true, permissionSetting: "allow_clipboard_read", rawSchema: { secret: "private" } },
        "clipboard.write": { supported: true, permissionSetting: "allow_clipboard_write", rawSchema: { secret: "private" } },
      },
      methodCount: 2,
      startupMode: "autostart",
      windowMode: "hidden",
      trayState: "visible",
      observedAt: NOW.getTime(),
    })).toEqual(expect.objectContaining({ ok: true }))

    const manifest = buildReleaseManifest({
      rootDir,
      runtimePaths: runtime.paths,
      targetPlatforms: ["macos"],
      availableYeonjangPlatforms: ["macos"],
      yeonjangPlatformDeterministicReceipts: [
        { platform: "macos", status: "passed", reasonCodes: [] },
      ],
      yeonjangPlatformRequiredCapabilityMethods: ["clipboard.read", "clipboard.write"],
      yeonjangAutoCollectPlatformCapabilityReadiness: true,
      yeonjangLiveSessionMaxAgeMs: 5_000,
      now: NOW,
    })

    expect(manifest.yeonjangPlatformAcceptance.platforms).toEqual(expect.arrayContaining([
      expect.objectContaining({
        platform: "macos",
        capabilityReadiness: [
          expect.objectContaining({ method: "clipboard.read", status: "passed" }),
          expect.objectContaining({ method: "clipboard.write", status: "permission_disabled" }),
        ],
      }),
    ]))
    expect(JSON.stringify(manifest.yeonjangPlatformAcceptance)).not.toMatch(/private-instance-047|private-session-047|private-client-047|rawSchema|permissions_json|tool_health_json|capability_matrix_json|private clipboard/u)
  })

  it("keeps explicit receipts while adding auto-collected registry receipts", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task047-release-merge-capability-"))
    directories.push(rootDir)
    const runtime = createTestRuntimeConfigFixture({ rootDir })
    getDb({ paths: runtime.paths })

    expect(upsertYeonjangRegistryObservation({
      instanceId: "private-instance-merge",
      instanceAlias: "field-windows-target",
      displayName: "Field Windows",
      nodeId: "yeonjang-main",
      supportProfile: "desktop_interactive",
      platform: "windows",
      arch: "x64",
      sessionId: "private-session-merge",
      clientId: "private-client-merge",
      connectionState: "online",
      message: "ready",
      version: "0.1.0",
      protocolVersion: "2026-04-16.capability-matrix.v1",
      capabilityHash: "private-capability-hash-merge",
      transport: ["mqtt-json"],
      trustState: "trusted",
      ownerUserId: "user:test",
      workspaceScopeId: "workspace:test",
      permissions: { allow_clipboard_write: true },
      toolHealth: { "clipboard.write": { status: "ready" } },
      capabilityMatrix: {
        "clipboard.write": { supported: true, permissionSetting: "allow_clipboard_write" },
      },
      methodCount: 1,
      observedAt: NOW.getTime(),
    })).toEqual(expect.objectContaining({ ok: true }))

    const manifest = buildReleaseManifest({
      rootDir,
      runtimePaths: runtime.paths,
      targetPlatforms: ["windows"],
      availableYeonjangPlatforms: ["windows"],
      yeonjangPlatformDeterministicReceipts: [
        { platform: "windows", status: "passed", reasonCodes: [] },
      ],
      yeonjangPlatformRequiredCapabilityMethods: ["clipboard.read", "clipboard.write"],
      yeonjangAutoCollectPlatformCapabilityReadiness: true,
      yeonjangPlatformCapabilityReceipts: [
        {
          platform: "windows",
          method: "clipboard.read",
          supported: true,
          permissionEnabled: true,
          toolHealthStatus: "ready",
          observedAt: NOW.getTime(),
          evidenceRef: "capability:explicit:clipboard-read",
        },
      ],
      yeonjangLiveSessionMaxAgeMs: 5_000,
      now: NOW,
    })

    const windows = manifest.yeonjangPlatformAcceptance.platforms.find((entry) => entry.platform === "windows")
    expect(windows?.capabilityReadiness).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: "clipboard.read", status: "passed" }),
      expect.objectContaining({ method: "clipboard.write", status: "passed" }),
    ]))
  })
})
