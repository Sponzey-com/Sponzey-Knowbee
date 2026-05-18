import { createRequire } from "node:module"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerAuditRoute } from "../packages/core/src/api/routes/audit.ts"
import { registerYeonjangInstancesRoute } from "../packages/core/src/api/routes/yeonjang-instances.ts"
import { reloadConfig } from "../packages/core/src/config/index.js"
import { closeDb } from "../packages/core/src/db/index.js"
import { hashYeonjangPairingSecret, upsertYeonjangRegistryObservation } from "../packages/core/src/yeonjang/registry.ts"

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
  const stateDir = mkdtempSync(join(tmpdir(), "nobie-task008-yeonjang-api-"))
  tempDirs.push(stateDir)
  const configPath = join(stateDir, "config.json5")
  writeFileSync(configPath, `{
    webui: { enabled: true, host: "127.0.0.1", port: 18891, auth: { enabled: false } }
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

describe("task008 yeonjang governance api and audit", () => {
  it("approves pairing, renames, reassigns local marker, and redacts pairing secrets from audit exports", async () => {
    expect(upsertYeonjangRegistryObservation({
      instanceId: "inst-local",
      instanceAlias: "local-mac",
      displayName: "Local Mac Console",
      nodeId: "yeonjang-main",
      supportProfile: "desktop_interactive",
      platform: "macos",
      arch: "arm64",
      hostFingerprint: "gateway-host",
      installFingerprint: "gateway-install",
      sessionId: "sess-local",
      clientId: "client-local",
      connectionState: "online",
      message: "ready",
      version: "0.1.0",
      protocolVersion: "2026-04-16.capability-matrix.v1",
      capabilityHash: "cap-local",
      transport: ["mqtt-json"],
      permissions: { allow_screen_capture: true },
      toolHealth: { "screen.capture": { status: "ready" } },
      capabilityMatrix: { "screen.capture": { supported: true, requiresPermission: true, permissionSetting: "allow_screen_capture" } },
      methodCount: 1,
      startupMode: "manual",
      windowMode: "visible",
      trayState: "visible",
      observedAt: Date.now(),
    })).toEqual(expect.objectContaining({ ok: true }))
    expect(upsertYeonjangRegistryObservation({
      instanceId: "inst-remote",
      instanceAlias: "windows-test-pc",
      displayName: "Windows Review Console",
      nodeId: "yeonjang-windows",
      supportProfile: "desktop_interactive",
      platform: "windows",
      arch: "x64",
      hostFingerprint: "remote-host",
      installFingerprint: "remote-install",
      sessionId: "sess-remote",
      clientId: "client-remote",
      connectionState: "online",
      message: "ready",
      version: "0.1.0",
      protocolVersion: "2026-04-16.capability-matrix.v1",
      capabilityHash: "cap-remote",
      transport: ["mqtt-json"],
      permissions: { allow_screen_capture: true },
      toolHealth: { "screen.capture": { status: "ready" } },
      capabilityMatrix: { "screen.capture": { supported: true, requiresPermission: true, permissionSetting: "allow_screen_capture" } },
      methodCount: 1,
      startupMode: "manual",
      windowMode: "visible",
      trayState: "visible",
      workspaceScopeId: "workspace:local-default",
      pairingFingerprint: hashYeonjangPairingSecret("my-secret-value"),
      observedAt: Date.now(),
    })).toEqual(expect.objectContaining({ ok: true }))

    const app = Fastify({ logger: false })
    registerYeonjangInstancesRoute(app)
    registerAuditRoute(app)
    await app.ready()
    try {
      const pairing = await app.inject({
        method: "POST",
        url: "/api/yeonjang/instances/inst-remote/pairing/approve",
        payload: {
          pairingSecret: "my-secret-value",
          actor: "webui:operator",
          ownerUserId: "user:bob",
          workspaceScopeId: "workspace:local-default",
          reason: "approve remote desktop",
        },
      })
      expect(pairing.statusCode).toBe(200)
      const pairingBody = pairing.json()
      expect(pairingBody.instances).toEqual(expect.arrayContaining([
        expect.objectContaining({
          instanceId: "inst-remote",
          trustState: "trusted",
          ownerUserId: "user:bob",
        }),
      ]))
      expect(pairingBody.governanceHistory).toEqual(expect.arrayContaining([
        expect.objectContaining({ action: "yeonjang_pairing_approved", instanceId: "inst-remote" }),
      ]))

      const renamed = await app.inject({
        method: "POST",
        url: "/api/yeonjang/instances/inst-remote/rename",
        payload: {
          instanceAlias: "windows-review",
          displayName: "Windows Review Console",
          actor: "webui:operator",
          reason: "rename for clarity",
        },
      })
      expect(renamed.statusCode).toBe(200)
      expect(renamed.json().instances).toEqual(expect.arrayContaining([
        expect.objectContaining({
          instanceId: "inst-remote",
          instanceAlias: "windows-review",
          displayName: "Windows Review Console",
        }),
      ]))

      const localMarker = await app.inject({
        method: "POST",
        url: "/api/yeonjang/instances/inst-remote/local-marker",
        payload: {
          actor: "webui:operator",
          reason: "make remote review baseline",
        },
      })
      expect(localMarker.statusCode).toBe(200)
      expect(localMarker.json().summary.localMarkerInstanceId).toBe("inst-remote")

      const revoke = await app.inject({
        method: "POST",
        url: "/api/yeonjang/instances/inst-remote/trust",
        payload: {
          trustState: "revoked",
          actor: "webui:operator",
          reason: "pause remote access",
        },
      })
      expect(revoke.statusCode).toBe(200)
      expect(revoke.json().instances).toEqual(expect.arrayContaining([
        expect.objectContaining({
          instanceId: "inst-remote",
          trustState: "revoked",
        }),
      ]))

      const audit = await app.inject({ method: "GET", url: "/api/audit?q=yeonjang_" })
      expect(audit.statusCode).toBe(200)
      const auditBody = audit.json()
      expect(JSON.stringify(auditBody)).not.toContain("my-secret-value")
      expect(auditBody.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ toolName: "yeonjang_pairing_approved" }),
        expect.objectContaining({ toolName: "yeonjang_instance_renamed" }),
        expect.objectContaining({ toolName: "yeonjang_local_marker_changed" }),
        expect.objectContaining({ toolName: "yeonjang_trust_state_changed" }),
      ]))
    } finally {
      await app.close()
    }
  })
})
