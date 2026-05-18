import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { reloadConfig } from "../packages/core/src/config/index.js"
import { closeDb } from "../packages/core/src/db/index.js"
import { runDoctor } from "../packages/core/src/diagnostics/doctor.js"
import { buildReleaseArtifactDefinitions } from "../packages/core/src/release/package.ts"
import { buildRuntimeManifest } from "../packages/core/src/runtime/manifest.js"
import { upsertYeonjangRegistryObservation } from "../packages/core/src/yeonjang/registry.ts"

const previousStateDir = process.env["NOBIE_STATE_DIR"]
const previousConfig = process.env["NOBIE_CONFIG"]
const tempDirs: string[] = []

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const filePath = join(rootDir, ...relativePath.split("/"))
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content, "utf-8")
}

function createReleaseFixture(): string {
  const rootDir = makeTempDir("nobie-task006-yeonjang-release-")
  writeFile(rootDir, "package.json", JSON.stringify({ version: "1.2.3" }))
  writeFile(rootDir, "scripts/build-yeonjang-linux.sh", "#!/usr/bin/env bash\n")
  writeFile(rootDir, "scripts/start-yeonjang-linux.sh", "#!/usr/bin/env bash\n")
  writeFile(rootDir, "scripts/start-yeonjang-linux-headless.sh", "#!/usr/bin/env bash\n")
  writeFile(rootDir, "scripts/stop-yeonjang-linux.sh", "#!/usr/bin/env bash\n")
  writeFile(rootDir, "scripts/stop-yeonjang-linux-headless.sh", "#!/usr/bin/env bash\n")
  return rootDir
}

beforeEach(() => {
  closeDb()
  const stateDir = makeTempDir("nobie-task006-yeonjang-profile-")
  process.env["NOBIE_STATE_DIR"] = stateDir
  delete process.env["NOBIE_CONFIG"]
  reloadConfig()
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

describe("task006 yeonjang support profile and release surface", () => {
  it("does not require tray lifecycle for headless managed nodes", () => {
    expect(upsertYeonjangRegistryObservation({
      instanceId: "inst-headless-1",
      instanceAlias: "linux-box-headless",
      displayName: "Linux Headless",
      nodeId: "yeonjang-main",
      supportProfile: "headless_managed",
      platform: "linux",
      arch: "x64",
      sessionId: "sess-headless-1",
      clientId: "client-headless-1",
      connectionState: "online",
      message: "ready",
      version: "0.1.0",
      protocolVersion: "2026-04-16.capability-matrix.v1",
      capabilityHash: "cap-headless-1",
      transport: ["mqtt-json"],
      permissions: {
        allow_shell_exec: true,
        allow_screen_capture: false,
      },
      toolHealth: {
        "system.exec": { status: "ready" },
        "screen.capture": { status: "unsupported" },
      },
      capabilityMatrix: {
        "system.exec": {
          supported: true,
          supportState: "supported",
          defaultTargetPolicy: "exact_instance",
        },
        "screen.capture": {
          supported: false,
          supportState: "blocked_by_profile",
          requiresInteractiveDesktop: true,
          reasonCodes: ["support_profile_restricted"],
        },
      },
      methodCount: 2,
      startupMode: "managed",
      windowMode: "hidden",
      trayState: "unsupported",
      observedAt: Date.now(),
    })).toEqual({ ok: true, instanceId: "inst-headless-1", sessionId: "sess-headless-1" })

    const manifest = buildRuntimeManifest({
      includeEnvironment: false,
      includeReleasePackage: false,
    })
    const report = runDoctor({
      mode: "quick",
      includeEnvironment: false,
      includeReleasePackage: false,
    })
    const protocolCheck = report.checks.find((check) => check.name === "yeonjang.protocol")

    expect(manifest.yeonjang.nodes[0]).toEqual(expect.objectContaining({
      supportProfile: "headless_managed",
      startupMode: "managed",
      trayState: "unsupported",
    }))
    expect(protocolCheck?.status).toBe("ok")
  })

  it("includes Linux desktop and headless scripts in release artifact definitions", () => {
    const rootDir = createReleaseFixture()
    const definitions = buildReleaseArtifactDefinitions({
      rootDir,
      targetPlatforms: ["linux"],
      promptSources: [],
    })
    const ids = definitions.map((item) => item.id)

    expect(ids).toEqual(expect.arrayContaining([
      "yeonjang:linux:start-script",
      "yeonjang:linux:headless-start-script",
      "yeonjang:linux:stop-script",
      "yeonjang:linux:headless-stop-script",
    ]))
  })
})
