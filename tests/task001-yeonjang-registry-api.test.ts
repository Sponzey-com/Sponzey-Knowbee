import { createRequire } from "node:module"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerDoctorRoute } from "../packages/core/src/api/routes/doctor.ts"
import { registerStatusRoute } from "../packages/core/src/api/routes/status.ts"
import { registerYeonjangInstancesRoute } from "../packages/core/src/api/routes/yeonjang-instances.ts"
import { reloadConfig } from "../packages/core/src/config/index.js"
import { closeDb } from "../packages/core/src/db/index.js"
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

function useTempConfig(): void {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "nobie-task001-yeonjang-api-"))
  tempDirs.push(stateDir)
  const configPath = join(stateDir, "config.json5")
  writeFileSync(configPath, `{
    webui: { enabled: true, host: "127.0.0.1", port: 18891, auth: { enabled: false } },
    mqtt: {
      enabled: true,
      host: "127.0.0.1",
      port: 1883,
      username: "mqtt-user",
      password: "mqtt-password",
      allowAnonymous: false
    }
  }`, "utf-8")
  process.env["NOBIE_STATE_DIR"] = stateDir
  process.env["NOBIE_CONFIG"] = configPath
  reloadConfig()
}

beforeEach(() => {
  useTempConfig()
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

describe("task001 yeonjang registry api and doctor", () => {
  it("serves an empty registry shape before any extension is connected", async () => {
    const app = Fastify({ logger: false })
    registerYeonjangInstancesRoute(app)
    registerStatusRoute(app)
    await app.ready()
    try {
      const registryResponse = await app.inject({ method: "GET", url: "/api/yeonjang/instances" })
      expect(registryResponse.statusCode).toBe(200)
      expect(registryResponse.json()).toEqual(expect.objectContaining({
        ok: true,
        summary: expect.objectContaining({
          totalInstances: 0,
          online: 0,
          localInstances: 0,
          remoteInstances: 0,
        }),
        instances: [],
        diffSummaries: [],
        defaultTarget: expect.objectContaining({
          ok: false,
          status: "selection_required",
        }),
      }))
    } finally {
      await app.close()
    }
  })

  it("serves registry projection and keeps raw fingerprints out of status-facing responses", async () => {
    const rawHostFingerprint = "host-fingerprint-raw-api-123456789"
    const rawInstallFingerprint = "install-fingerprint-raw-api-123456789"
    expect(upsertYeonjangRegistryObservation({
      instanceId: "inst-api-1",
      instanceAlias: "api-box",
      displayName: "API Control Box",
      nodeId: "yeonjang-main",
      supportProfile: "desktop_interactive",
      platform: "macos",
      arch: "arm64",
      hostFingerprint: rawHostFingerprint,
      installFingerprint: rawInstallFingerprint,
      sessionId: "sess-api-1",
      clientId: "client-api-1",
      connectionState: "online",
      message: "ready",
      version: "0.1.0",
      protocolVersion: "2026-04-16.capability-matrix.v1",
      capabilityHash: "cap-api-1",
      transport: ["mqtt-json"],
      permissions: { allow_screen_capture: true },
      toolHealth: { "screen.capture": { status: "ready" } },
      capabilityMatrix: { "screen.capture": { supported: true, requiresPermission: true, permissionSetting: "allow_screen_capture" } },
      methodCount: 1,
      startupMode: "manual",
      windowMode: "visible",
      trayState: "unknown",
      observedAt: Date.now(),
    })).toEqual(expect.objectContaining({ ok: true }))

    expect(upsertYeonjangRegistryObservation({
      instanceId: "inst-api-2",
      instanceAlias: "remote-box",
      displayName: "Remote Review Box",
      nodeId: "yeonjang-remote",
      supportProfile: "desktop_interactive",
      platform: "windows",
      arch: "x64",
      hostFingerprint: "host-fingerprint-raw-remote",
      installFingerprint: "install-fingerprint-raw-remote",
      sessionId: "sess-api-2",
      clientId: "client-api-2",
      connectionState: "online",
      message: "ready",
      version: "0.1.0",
      protocolVersion: "2026-04-16.capability-matrix.v1",
      capabilityHash: "cap-api-2",
      transport: ["mqtt-json"],
      permissions: { allow_screen_capture: true },
      toolHealth: { "screen.capture": { status: "ready" } },
      capabilityMatrix: { "screen.capture": { supported: true, requiresPermission: true, permissionSetting: "allow_screen_capture" } },
      methodCount: 1,
      startupMode: "manual",
      windowMode: "visible",
      trayState: "unknown",
      observedAt: Date.now(),
    })).toEqual(expect.objectContaining({ ok: true }))

    const app = Fastify({ logger: false })
    registerYeonjangInstancesRoute(app)
    registerStatusRoute(app)
    registerDoctorRoute(app)
    await app.ready()
    try {
      const registryResponse = await app.inject({ method: "GET", url: "/api/yeonjang/instances" })
      expect(registryResponse.statusCode).toBe(200)
      const registryBody = registryResponse.json()
      expect(registryBody).toEqual(expect.objectContaining({
        ok: true,
        summary: expect.objectContaining({
          totalInstances: 2,
          online: 2,
          localInstances: 1,
          remoteInstances: 1,
        }),
        instances: expect.arrayContaining([
          expect.objectContaining({
            instanceId: "inst-api-1",
            instanceAlias: "api-box",
            displayName: "API Control Box",
            state: "online",
            session: expect.objectContaining({ sessionId: "sess-api-1" }),
          }),
          expect.objectContaining({
            instanceId: "inst-api-2",
            instanceAlias: "remote-box",
            displayName: "Remote Review Box",
            state: "online",
            session: expect.objectContaining({ sessionId: "sess-api-2" }),
          }),
        ]),
      }))
      expect(JSON.stringify(registryBody)).not.toContain(rawHostFingerprint)
      expect(JSON.stringify(registryBody)).not.toContain(rawInstallFingerprint)

      const statusResponse = await app.inject({ method: "GET", url: "/api/status" })
      expect(statusResponse.statusCode).toBe(200)
      const statusBody = statusResponse.json()
      expect(statusBody.yeonjang.registry).toEqual(expect.objectContaining({
        summary: expect.objectContaining({
          totalInstances: 2,
          online: 2,
          localInstances: 1,
          remoteInstances: 1,
        }),
      }))
      expect(JSON.stringify(statusBody)).not.toContain(rawHostFingerprint)
      expect(JSON.stringify(statusBody)).not.toContain(rawInstallFingerprint)

      const doctorResponse = await app.inject({ method: "GET", url: "/api/doctor?mode=quick" })
      expect(doctorResponse.statusCode).toBe(200)
      const doctorBody = doctorResponse.json()
      const mqttCheck = doctorBody.report.checks.find((check: { name: string }) => check.name === "yeonjang.mqtt")
      const protocolCheck = doctorBody.report.checks.find((check: { name: string }) => check.name === "yeonjang.protocol")
      expect(mqttCheck?.detail?.registry).toEqual(expect.objectContaining({
        totalInstances: 2,
        online: 2,
        localInstances: 1,
        remoteInstances: 1,
      }))
      expect(protocolCheck?.detail?.registry).toEqual(expect.objectContaining({
        totalInstances: 2,
      }))
      expect(JSON.stringify(doctorBody)).not.toContain(rawHostFingerprint)
      expect(JSON.stringify(doctorBody)).not.toContain(rawInstallFingerprint)
    } finally {
      await app.close()
    }
  })
})
