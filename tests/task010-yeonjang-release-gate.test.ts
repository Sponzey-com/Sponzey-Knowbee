import { createRequire } from "node:module"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerDoctorRoute } from "../packages/core/src/api/routes/doctor.ts"
import { registerStatusRoute } from "../packages/core/src/api/routes/status.ts"
import { reloadConfig } from "../packages/core/src/config/index.js"
import { closeDb } from "../packages/core/src/db/index.js"
import { ensurePromptSourceFiles } from "../packages/core/src/memory/nobie-md.ts"
import { buildReleaseManifest } from "../packages/core/src/release/package.ts"
import { upsertYeonjangRegistryObservation } from "../packages/core/src/yeonjang/registry.ts"

const require = createRequire(import.meta.url)
const Fastify = require("../packages/core/node_modules/fastify") as (options: { logger: boolean }) => {
  ready(): Promise<void>
  close(): Promise<void>
  inject(options: { method: string; url: string; payload?: unknown }): Promise<{ statusCode: number; json(): any }>
}

const previousStateDir = process.env["NOBIE_STATE_DIR"]
const previousConfig = process.env["NOBIE_CONFIG"]
const tempDirs: string[] = []
let observedBase = 0

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

function useTempState(): void {
  closeDb()
  const stateDir = tempDir("nobie-task010-yeonjang-release-state-")
  process.env["NOBIE_STATE_DIR"] = stateDir
  delete process.env["NOBIE_CONFIG"]
  reloadConfig()
}

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const filePath = join(rootDir, ...relativePath.split("/"))
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content, "utf-8")
}

function createReleaseRoot(): string {
  const rootDir = tempDir("nobie-task010-yeonjang-release-root-")
  writeFile(rootDir, "package.json", JSON.stringify({ version: "9.9.9" }))
  writeFile(rootDir, "packages/cli/dist/index.js", "console.log('cli')\n")
  writeFile(rootDir, "packages/core/dist/index.js", "export const core = true\n")
  writeFile(rootDir, "packages/webui/dist/index.html", "<html></html>\n")
  writeFile(rootDir, "packages/core/src/db/migrations.ts", "export const MIGRATIONS = []\n")
  writeFile(rootDir, "Yeonjang/src/protocol.rs", "pub struct Request;\n")
  writeFile(rootDir, "Yeonjang/manifests/permissions.json", "{}\n")
  writeFile(rootDir, "scripts/build-yeonjang-macos.sh", "#!/usr/bin/env bash\n")
  writeFile(rootDir, "scripts/start-yeonjang-macos.sh", "#!/usr/bin/env bash\n")
  writeFile(rootDir, "scripts/build-yeonjang-linux.sh", "#!/usr/bin/env bash\n")
  writeFile(rootDir, "scripts/start-yeonjang-linux.sh", "#!/usr/bin/env bash\n")
  writeFile(rootDir, "scripts/start-yeonjang-linux-headless.sh", "#!/usr/bin/env bash\n")
  writeFile(rootDir, "scripts/stop-yeonjang-linux.sh", "#!/usr/bin/env bash\n")
  writeFile(rootDir, "scripts/stop-yeonjang-linux-headless.sh", "#!/usr/bin/env bash\n")
  writeFile(rootDir, "scripts/build-yeonjang-windows.bat", "@echo off\n")
  writeFile(rootDir, "scripts/start-yeonjang-windows.bat", "@echo off\n")
  writeFile(rootDir, "scripts/stop-yeonjang-windows.bat", "@echo off\n")
  writeFile(rootDir, "docs/release-runbook.md", "# Release Runbook\n")
  ensurePromptSourceFiles(rootDir)
  return rootDir
}

function seedObservation(overrides: Partial<Parameters<typeof upsertYeonjangRegistryObservation>[0]> = {}) {
  const observedAt = overrides.observedAt ?? Date.now()
  return upsertYeonjangRegistryObservation({
    instanceId: overrides.instanceId ?? "inst-local",
    instanceAlias: overrides.instanceAlias ?? "local-main",
    displayName: overrides.displayName ?? "Local Main Console",
    nodeId: overrides.nodeId ?? "yeonjang-main",
    supportProfile: overrides.supportProfile ?? "desktop_interactive",
    platform: overrides.platform ?? "macos",
    arch: overrides.arch ?? "arm64",
    hostFingerprint: overrides.hostFingerprint ?? "host-local",
    installFingerprint: overrides.installFingerprint ?? "install-local",
    sessionId: overrides.sessionId ?? "ys-inst-local-1000",
    clientId: overrides.clientId ?? "client-local",
    connectionState: overrides.connectionState ?? "online",
    message: overrides.message ?? "ready",
    version: overrides.version ?? "0.1.0",
    protocolVersion: overrides.protocolVersion ?? "2026-04-16.capability-matrix.v1",
    capabilityHash: overrides.capabilityHash ?? "cap-local",
    transport: overrides.transport ?? ["mqtt-json"],
    permissions: overrides.permissions ?? { allow_screen_capture: true },
    toolHealth: overrides.toolHealth ?? { "screen.capture": { status: "ready" } },
    capabilityMatrix: overrides.capabilityMatrix ?? {
      "screen.capture": { supported: true, requiresPermission: true, permissionSetting: "allow_screen_capture" },
    },
    methodCount: overrides.methodCount ?? 1,
    startupMode: overrides.startupMode ?? "manual",
    windowMode: overrides.windowMode ?? "visible",
    trayState: overrides.trayState ?? "visible",
    workspaceScopeId: overrides.workspaceScopeId ?? "workspace:local-default",
    pairingFingerprint: overrides.pairingFingerprint ?? "pairing-fp-1",
    trustState: overrides.trustState ?? "trusted",
    observedAt,
  })
}

beforeEach(() => {
  useTempState()
  observedBase = Date.now()
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

describe("task010 yeonjang release evidence", () => {
  it("surfaces multi-instance summary in status and doctor, including duplicate conflict counts", async () => {
    expect(seedObservation({
      instanceId: "inst-local",
      instanceAlias: "local-main",
      nodeId: "yeonjang-main",
      observedAt: observedBase,
    })).toEqual(expect.objectContaining({ ok: true }))
    expect(seedObservation({
      instanceId: "inst-update",
      instanceAlias: "update-box",
      displayName: "Outdated Console",
      nodeId: "yeonjang-update",
      platform: "windows",
      arch: "x64",
      hostFingerprint: "host-update",
      installFingerprint: "install-update",
      sessionId: "ys-inst-update-1000",
      protocolVersion: "2025-12-01.legacy",
      observedAt: observedBase,
    })).toEqual(expect.objectContaining({ ok: true }))
    expect(seedObservation({
      instanceId: "inst-update",
      instanceAlias: "update-box",
      displayName: "Outdated Console",
      nodeId: "yeonjang-update",
      platform: "windows",
      arch: "x64",
      hostFingerprint: "host-rogue",
      installFingerprint: "install-rogue",
      sessionId: "ys-inst-update-2000",
      observedAt: observedBase + 1_000,
    })).toEqual(expect.objectContaining({
      ok: true,
      claimOutcome: "quarantined",
    }))

    const app = Fastify({ logger: false })
    registerStatusRoute(app)
    registerDoctorRoute(app)
    await app.ready()
    try {
      const statusResponse = await app.inject({ method: "GET", url: "/api/status" })
      expect(statusResponse.statusCode).toBe(200)
      const statusBody = statusResponse.json()
      expect(statusBody.yeonjang.registry.summary.totalInstances).toBe(2)
      expect(statusBody.yeonjang.registry.summary.localInstances).toBe(1)
      expect(statusBody.yeonjang.registry.summary.remoteInstances).toBe(1)
      expect(statusBody.yeonjang.registry.summary.trusted).toBe(2)
      expect(statusBody.yeonjang.registry.summary.duplicateConflictCount).toBe(1)
      expect(statusBody.yeonjang.registry.summary.updateRequired).toBe(1)

      const doctorResponse = await app.inject({ method: "GET", url: "/api/doctor?mode=quick" })
      expect(doctorResponse.statusCode).toBe(200)
      const doctorBody = doctorResponse.json()
      const mqttCheck = doctorBody.report.checks.find((check: { name: string }) => check.name === "yeonjang.mqtt")
      const protocolCheck = doctorBody.report.checks.find((check: { name: string }) => check.name === "yeonjang.protocol")
      expect(mqttCheck?.detail?.registry?.totalInstances).toBe(2)
      expect(mqttCheck?.detail?.registry?.duplicateConflictCount).toBe(1)
      expect(protocolCheck?.detail?.registry?.updateRequired).toBe(1)
    } finally {
      await app.close()
    }
  })

  it("wires multi-instance readiness evidence into the release manifest, pipeline, and checklist", () => {
    expect(seedObservation({
      instanceId: "inst-local",
      instanceAlias: "local-main",
      nodeId: "yeonjang-main",
      observedAt: observedBase,
    })).toEqual(expect.objectContaining({ ok: true }))
    expect(seedObservation({
      instanceId: "inst-remote",
      instanceAlias: "windows-box",
      displayName: "Windows Review Console",
      nodeId: "yeonjang-win",
      platform: "windows",
      arch: "x64",
      hostFingerprint: "host-remote",
      installFingerprint: "install-remote",
      sessionId: "ys-inst-remote-1000",
      observedAt: observedBase,
    })).toEqual(expect.objectContaining({ ok: true }))
    expect(seedObservation({
      instanceId: "inst-remote",
      instanceAlias: "windows-box",
      displayName: "Windows Review Console",
      nodeId: "yeonjang-win",
      platform: "windows",
      arch: "x64",
      hostFingerprint: "host-rogue",
      installFingerprint: "install-rogue",
      sessionId: "ys-inst-remote-2000",
      observedAt: observedBase + 1_000,
    })).toEqual(expect.objectContaining({
      ok: true,
      claimOutcome: "quarantined",
    }))

    const manifest = buildReleaseManifest({
      rootDir: createReleaseRoot(),
      releaseVersion: "v-task010",
      gitTag: "v-task010",
      gitCommit: "abc1234",
      targetPlatforms: ["macos", "windows", "linux"],
      now: new Date("2026-05-18T00:00:00.000Z"),
    })

    expect(manifest.yeonjangMultiInstanceEvidence.kind).toBe("nobie.release.yeonjang_multi_instance")
    expect(manifest.yeonjangMultiInstanceEvidence.policyVersion).toBe("2026-05-18.yeonjang-multi-instance.release-gate.v1")
    expect(manifest.yeonjangMultiInstanceEvidence.gateStatus).toBe("warning")
    expect(manifest.yeonjangMultiInstanceEvidence.liveFleetSummary.totalInstances).toBe(2)
    expect(manifest.yeonjangMultiInstanceEvidence.liveFleetSummary.duplicateConflictCount).toBe(1)
    expect(manifest.yeonjangMultiInstanceEvidence.warnings).toEqual(expect.arrayContaining(["manual_smoke_not_run"]))
    expect(manifest.yeonjangMultiInstanceEvidence.checks.map((check) => check.id)).toEqual([
      "exact_target_regression",
      "ambiguous_target_fail_guard",
      "revoked_target_block_guard",
      "broadcast_approval_guard",
      "idempotency_delivery_guard",
      "duplicate_session_guard",
    ])
    expect(manifest.pipeline.order).toContain("yeonjang-multi-instance-release-gate")
    expect(manifest.cleanInstallChecklist.some((item) => item.id === "yeonjang-multi-instance-release-gate" && item.required)).toBe(true)
    expect(manifest.releaseNotes.knownLimitations).toContain("Yeonjang multi-instance release gate: warning")
  })
})
