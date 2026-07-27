import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { closeDb, getDb } from "../packages/core/src/db/index.js"
import { runDoctor } from "../packages/core/src/diagnostics/doctor.ts"
import { upsertYeonjangRegistryObservation } from "../packages/core/src/yeonjang/registry.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"

const directories: string[] = []
const NOW = new Date("2026-07-21T11:00:00.000Z")

afterEach(() => {
  closeDb()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe("Task 048 doctor release capability readiness", () => {
  it("surfaces auto-collected Yeonjang capability readiness in full doctor without raw registry data", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task048-doctor-capability-"))
    directories.push(rootDir)
    const runtime = createTestRuntimeConfigFixture({ rootDir })
    getDb({ paths: runtime.paths })

    expect(upsertYeonjangRegistryObservation({
      instanceId: "private-instance-048",
      instanceAlias: "doctor-mac-target",
      displayName: "Doctor Mac",
      nodeId: "yeonjang-main",
      supportProfile: "desktop_interactive",
      platform: "macos",
      arch: "arm64",
      sessionId: "private-session-048",
      clientId: "private-client-048",
      connectionState: "online",
      message: "ready",
      version: "0.1.0",
      protocolVersion: "2026-04-16.capability-matrix.v1",
      capabilityHash: "private-capability-hash-048",
      transport: ["mqtt-json"],
      trustState: "trusted",
      ownerUserId: "user:test",
      workspaceScopeId: "workspace:test",
      permissions: {
        allow_clipboard_read: true,
        allow_clipboard_write: true,
      },
      toolHealth: {
        "clipboard.read": { status: "ready", internalDetail: "private read detail" },
        "clipboard.write": { status: "ready", internalDetail: "private write detail" },
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

    const report = runDoctor({
      config: runtime.config,
      paths: runtime.paths,
      mode: "full",
      includeEnvironment: false,
      includeReleasePackage: true,
      now: NOW,
    })
    const releaseCheck = report.checks.find((check) => check.name === "release.package")

    expect(report.manifest.releasePackage).toMatchObject({
      yeonjangPlatformCapabilityReady: false,
      yeonjangPlatformCapabilityRequiredMethods: ["clipboard.read", "clipboard.write"],
      yeonjangPlatformCapabilityEvidenceCount: 2,
      yeonjangPlatformCapabilityFailureCount: expect.any(Number),
    })
    expect(releaseCheck?.detail).toMatchObject({
      yeonjangPlatformCapabilityReady: false,
      yeonjangPlatformCapabilityEvidenceCount: 2,
    })
    expect(JSON.stringify({
      releasePackage: report.manifest.releasePackage,
      releasePackageCheckDetail: releaseCheck?.detail,
    })).not.toMatch(/private-instance-048|private-session-048|private-client-048|rawSchema|permissions_json|tool_health_json|capability_matrix_json|private read|private write/u)
  })
})
