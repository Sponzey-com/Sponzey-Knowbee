import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { reloadConfig } from "../packages/core/src/config/index.js"
import { closeDb } from "../packages/core/src/db/index.js"
import { runDoctor } from "../packages/core/src/diagnostics/doctor.js"
import { buildRuntimeManifest } from "../packages/core/src/runtime/manifest.js"
import { upsertYeonjangRegistryObservation } from "../packages/core/src/yeonjang/registry.ts"

const previousStateDir = process.env["NOBIE_STATE_DIR"]
const previousConfig = process.env["NOBIE_CONFIG"]
const tempDirs: string[] = []

function useTempState(): void {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "nobie-task005-yeonjang-lifecycle-"))
  tempDirs.push(stateDir)
  process.env["NOBIE_STATE_DIR"] = stateDir
  delete process.env["NOBIE_CONFIG"]
  reloadConfig()
}

function seedObservation(overrides: Partial<Parameters<typeof upsertYeonjangRegistryObservation>[0]> = {}) {
  return upsertYeonjangRegistryObservation({
    instanceId: overrides.instanceId ?? "inst-local-1",
    instanceAlias: overrides.instanceAlias ?? "local-box",
    displayName: overrides.displayName ?? "Local Control Terminal",
    nodeId: overrides.nodeId ?? "yeonjang-main",
    supportProfile: overrides.supportProfile ?? "desktop_interactive",
    platform: overrides.platform ?? "macos",
    arch: overrides.arch ?? "arm64",
    sessionId: overrides.sessionId ?? "sess-local-1",
    clientId: overrides.clientId ?? "client-local-1",
    connectionState: overrides.connectionState ?? "online",
    message: overrides.message ?? "ready",
    version: overrides.version ?? "0.1.0",
    protocolVersion: overrides.protocolVersion ?? "2026-04-16.capability-matrix.v1",
    capabilityHash: overrides.capabilityHash ?? "cap-local-1",
    transport: overrides.transport ?? ["mqtt-json"],
    permissions: overrides.permissions ?? { allow_screen_capture: true, allow_shell_exec: true },
    toolHealth: overrides.toolHealth ?? { "screen.capture": { status: "ready" } },
    capabilityMatrix: overrides.capabilityMatrix ?? {
      "screen.capture": { supported: true, requiresPermission: true, permissionSetting: "allow_screen_capture" },
    },
    methodCount: overrides.methodCount ?? 1,
    startupMode: overrides.startupMode ?? "manual",
    windowMode: overrides.windowMode ?? "hidden",
    trayState: overrides.trayState ?? "visible",
    observedAt: overrides.observedAt ?? Date.now(),
  })
}

beforeEach(() => {
  useTempState()
})

afterEach(() => {
  closeDb()
  if (previousStateDir === undefined) delete process.env["NOBIE_STATE_DIR"]
  else process.env["NOBIE_STATE_DIR"] = previousStateDir
  if (previousConfig === undefined) delete process.env["NOBIE_CONFIG"]
  else process.env["NOBIE_CONFIG"] = previousConfig
  reloadConfig()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task005 yeonjang lifecycle surface", () => {
  it("includes startup, window, and tray state in the runtime manifest", () => {
    expect(seedObservation({
      startupMode: "autostart",
      windowMode: "hidden",
      trayState: "visible",
    })).toEqual({ ok: true, instanceId: "inst-local-1", sessionId: "sess-local-1" })

    const manifest = buildRuntimeManifest({
      includeEnvironment: false,
      includeReleasePackage: false,
    })

    expect(manifest.yeonjang.nodes[0]).toEqual(expect.objectContaining({
      extensionId: "yeonjang-main",
      supportProfile: "desktop_interactive",
      startupMode: "autostart",
      windowMode: "hidden",
      trayState: "visible",
    }))
  })

  it("warns when a desktop interactive node is not running tray-first", () => {
    expect(seedObservation({
      startupMode: "manual",
      windowMode: "visible",
      trayState: "unavailable",
    })).toEqual({ ok: true, instanceId: "inst-local-1", sessionId: "sess-local-1" })

    const report = runDoctor({
      mode: "quick",
      includeEnvironment: false,
      includeReleasePackage: false,
    })
    const protocolCheck = report.checks.find((check) => check.name === "yeonjang.protocol")

    expect(protocolCheck?.status).toBe("warning")
    expect(protocolCheck?.detail).toEqual(expect.objectContaining({
      lifecycleMismatches: [
        expect.objectContaining({
          extensionId: "yeonjang-main",
          supportProfile: "desktop_interactive",
          windowMode: "visible",
          trayState: "unavailable",
        }),
      ],
    }))
  })
})
