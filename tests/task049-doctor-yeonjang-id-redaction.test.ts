import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { closeDb, getDb } from "../packages/core/src/db/index.js"
import { runDoctor } from "../packages/core/src/diagnostics/doctor.ts"
import { buildRuntimeManifest } from "../packages/core/src/runtime/manifest.ts"
import { upsertYeonjangRegistryObservation } from "../packages/core/src/yeonjang/registry.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"

const directories: string[] = []
const NOW = new Date("2026-07-21T12:00:00.000Z")

afterEach(() => {
  closeDb()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe("Task 049 doctor Yeonjang internal ID redaction", () => {
  it("keeps public Yeonjang state but redacts internal IDs from runtime manifest and doctor report", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task049-yeonjang-redaction-"))
    directories.push(rootDir)
    const runtime = createTestRuntimeConfigFixture({ rootDir })
    getDb({ paths: runtime.paths })

    expect(upsertYeonjangRegistryObservation({
      instanceId: "private-instance-049",
      instanceAlias: "public-office-mac",
      displayName: "Office Mac Display",
      nodeId: "yeonjang-main",
      supportProfile: "desktop_interactive",
      platform: "macos",
      arch: "arm64",
      sessionId: "private-session-049",
      clientId: "private-client-049",
      connectionState: "online",
      message: "ready",
      version: "0.1.0",
      protocolVersion: "2026-04-16.capability-matrix.v1",
      capabilityHash: "capability-hash-049",
      transport: ["mqtt-json"],
      trustState: "trusted",
      ownerUserId: "user:test",
      workspaceScopeId: "workspace:test",
      permissions: {},
      toolHealth: {},
      capabilityMatrix: {},
      methodCount: 1,
      startupMode: "autostart",
      windowMode: "hidden",
      trayState: "visible",
      observedAt: NOW.getTime(),
    })).toEqual(expect.objectContaining({ ok: true }))

    const manifest = buildRuntimeManifest({
      config: runtime.config,
      paths: runtime.paths,
      includeEnvironment: false,
      includeReleasePackage: false,
      now: NOW,
    })
    const report = runDoctor({
      config: runtime.config,
      paths: runtime.paths,
      mode: "quick",
      includeEnvironment: false,
      includeReleasePackage: false,
      now: NOW,
    })

    expect(manifest.yeonjang.nodes[0]).toEqual(expect.objectContaining({
      extensionId: "yeonjang-main",
      instanceId: null,
      instanceAlias: "public-office-mac",
      state: "online",
      supportProfile: "desktop_interactive",
    }))
    expect(JSON.stringify({ manifest, report })).not.toMatch(/private-instance-049|private-session-049|private-client-049|localMarkerInstanceId/u)
  })
})
