import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { closeDb, getDb } from "../packages/core/src/db/index.js"
import { buildReleaseManifest } from "../packages/core/src/release/package.ts"
import { upsertYeonjangRegistryObservation } from "../packages/core/src/yeonjang/registry.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"

const directories: string[] = []
const NOW = new Date("2026-07-21T13:00:00.000Z")

afterEach(() => {
  closeDb()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe("Task 050 Yeonjang receipt-driven capability readiness", () => {
  it("accepts camera, file, and disk methods from sanitized registry receipts without a release allowlist", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task050-receipt-driven-"))
    directories.push(rootDir)
    const runtime = createTestRuntimeConfigFixture({ rootDir })
    getDb({ paths: runtime.paths })

    expect(upsertYeonjangRegistryObservation({
      instanceId: "private-instance-050",
      instanceAlias: "media-workstation",
      displayName: "Media Workstation Display",
      nodeId: "yeonjang-main",
      supportProfile: "desktop_interactive",
      platform: "macos",
      arch: "arm64",
      sessionId: "private-session-050",
      clientId: "private-client-050",
      connectionState: "online",
      message: "ready",
      version: "0.1.0",
      protocolVersion: "2026-04-16.capability-matrix.v1",
      capabilityHash: "private-capability-hash-050",
      transport: ["mqtt-json"],
      trustState: "trusted",
      ownerUserId: "user:test",
      workspaceScopeId: "workspace:test",
      permissions: {
        allow_camera_list: true,
        allow_file_list: true,
        allow_disk_usage: true,
        allow_camera_capture: false,
      },
      toolHealth: {
        "camera.list": { status: "ready", rawDeviceIds: ["private-camera-id"] },
        "file.list": { status: "ready", rawPath: "/private/workspace" },
        "disk.usage": { status: "ready", rawMount: "/private" },
        "camera.capture": { status: "permission_disabled", rawDeviceIds: ["private-camera-id"] },
      },
      capabilityMatrix: {
        "camera.list": { supported: true, permissionSetting: "allow_camera_list", rawSchema: { secret: "private" } },
        "file.list": { supported: true, permissionSetting: "allow_file_list", rawSchema: { secret: "private" } },
        "disk.usage": { supported: true, permissionSetting: "allow_disk_usage", rawSchema: { secret: "private" } },
        "camera.capture": { supported: true, permissionSetting: "allow_camera_capture", rawSchema: { secret: "private" } },
      },
      methodCount: 4,
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
      yeonjangPlatformRequiredCapabilityMethods: [
        "camera.capture",
        "camera.list",
        "disk.usage",
        "file.list",
      ],
      yeonjangAutoCollectPlatformCapabilityReadiness: true,
      yeonjangLiveSessionMaxAgeMs: 5_000,
      now: NOW,
    })
    const macos = manifest.yeonjangPlatformAcceptance.platforms.find((row) => row.platform === "macos")

    expect(macos?.capabilityReadiness).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: "camera.list", status: "passed" }),
      expect.objectContaining({ method: "file.list", status: "passed" }),
      expect.objectContaining({ method: "disk.usage", status: "passed" }),
      expect.objectContaining({ method: "camera.capture", status: "permission_disabled" }),
    ]))
    expect(manifest.yeonjangPlatformAcceptance.capabilityReady).toBe(false)
    expect(JSON.stringify(manifest.yeonjangPlatformAcceptance)).not.toMatch(/private-instance-050|private-session-050|private-client-050|private-camera-id|rawSchema|rawPath|rawMount/u)
  })
})
