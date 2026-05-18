import { createRequire } from "node:module"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerUiModeRoute } from "../packages/core/src/api/routes/ui-mode.ts"
import { reloadConfig } from "../packages/core/src/config/index.js"
import { closeDb } from "../packages/core/src/db/index.js"
import { upsertYeonjangRegistryObservation } from "../packages/core/src/yeonjang/registry.ts"

const require = createRequire(import.meta.url)
const Fastify = require("../packages/core/node_modules/fastify") as (options: { logger: boolean }) => {
  ready(): Promise<void>
  close(): Promise<void>
  inject(options: { method: string; url: string; payload?: unknown }): Promise<{ statusCode: number; json(): any }>
}

const tempDirs: string[] = []
const previousStateDir = process.env["NOBIE_STATE_DIR"]
const previousConfig = process.env["NOBIE_CONFIG"]
const previousAdminUi = process.env["NOBIE_ADMIN_UI"]

function useTempState(): void {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "nobie-ui-shell-"))
  tempDirs.push(stateDir)
  process.env["NOBIE_STATE_DIR"] = stateDir
  delete process.env["NOBIE_CONFIG"]
  delete process.env["NOBIE_ADMIN_UI"]
  reloadConfig()
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
  if (previousAdminUi === undefined) delete process.env["NOBIE_ADMIN_UI"]
  else process.env["NOBIE_ADMIN_UI"] = previousAdminUi
  reloadConfig()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task002 UI shell route", () => {
  it("returns a compact shell summary without raw secrets or diagnostic payloads", async () => {
    const app = Fastify({ logger: false })
    registerUiModeRoute(app)
    await app.ready()
    try {
      const response = await app.inject({ method: "GET", url: "/api/ui/shell" })
      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toEqual(expect.objectContaining({
        generatedAt: expect.any(Number),
        mode: expect.objectContaining({ mode: "beginner", preferredUiMode: "beginner", adminEnabled: false }),
        setupState: { completed: false },
        runtimeHealth: expect.objectContaining({
          ai: expect.objectContaining({ configured: expect.any(Boolean), modelConfigured: expect.any(Boolean) }),
          channels: expect.objectContaining({ webui: true, telegramConfigured: expect.any(Boolean), slackConfigured: expect.any(Boolean) }),
          yeonjang: expect.objectContaining({
            mqttEnabled: expect.any(Boolean),
            connectedExtensions: expect.any(Number),
            localInstances: expect.any(Number),
            remoteInstances: expect.any(Number),
            supportProfiles: expect.objectContaining({
              desktopInteractive: expect.any(Number),
              desktopLimited: expect.any(Number),
              headlessManaged: expect.any(Number),
            }),
            defaultTargetStatus: expect.any(String),
          }),
        }),
        activeRuns: expect.objectContaining({ total: expect.any(Number), pendingApprovals: expect.any(Number) }),
      }))
      expect(typeof body.runtimeHealth.ai.provider === "string" || body.runtimeHealth.ai.provider === null).toBe(true)
      expect(JSON.stringify(body)).not.toMatch(/botToken|appToken|apiKey|secret|stack|raw|diagnostic/i)
    } finally {
      await app.close()
    }
  })

  it("reports admin availability from the explicit runtime flag only", async () => {
    process.env["NOBIE_ADMIN_UI"] = "1"
    reloadConfig()
    const app = Fastify({ logger: false })
    registerUiModeRoute(app)
    await app.ready()
    try {
      const response = await app.inject({ method: "GET", url: "/api/ui/shell" })
      expect(response.statusCode).toBe(200)
      expect(response.json().mode).toEqual(expect.objectContaining({
        mode: "beginner",
        preferredUiMode: "beginner",
        adminEnabled: true,
        availableModes: ["beginner", "advanced", "admin"],
      }))
    } finally {
      await app.close()
    }
  })

  it("projects local/remote support-profile counts into the shell summary", async () => {
    const now = Date.now()
    expect(upsertYeonjangRegistryObservation({
      instanceId: "inst-shell-local",
      instanceAlias: "shell-local",
      displayName: "Shell Local Primary",
      nodeId: "yeonjang-main",
      supportProfile: "desktop_interactive",
      platform: "macos",
      arch: "arm64",
      hostFingerprint: "host-shell-local",
      installFingerprint: "install-shell-local",
      sessionId: "sess-shell-local",
      clientId: "client-shell-local",
      connectionState: "online",
      message: "ready",
      version: "0.1.0",
      protocolVersion: "2026-04-16.capability-matrix.v1",
      capabilityHash: "cap-shell-local",
      transport: ["mqtt-json"],
      permissions: { allow_screen_capture: true },
      toolHealth: { "screen.capture": { status: "ready" } },
      capabilityMatrix: { "screen.capture": { supported: true } },
      methodCount: 1,
      startupMode: "manual",
      windowMode: "visible",
      trayState: "visible",
      observedAt: now,
    })).toEqual(expect.objectContaining({ ok: true }))
    expect(upsertYeonjangRegistryObservation({
      instanceId: "inst-shell-remote",
      instanceAlias: "shell-remote",
      displayName: "Shell Remote Worker",
      nodeId: "yeonjang-remote",
      supportProfile: "headless_managed",
      platform: "linux",
      arch: "x64",
      hostFingerprint: "host-shell-remote",
      installFingerprint: "install-shell-remote",
      sessionId: "sess-shell-remote",
      clientId: "client-shell-remote",
      connectionState: "online",
      message: "ready",
      version: "0.1.0",
      protocolVersion: "2026-04-16.capability-matrix.v1",
      capabilityHash: "cap-shell-remote",
      transport: ["mqtt-json"],
      permissions: { allow_screen_capture: true },
      toolHealth: { "screen.capture": { status: "ready" } },
      capabilityMatrix: { "screen.capture": { supported: true } },
      methodCount: 1,
      startupMode: "managed",
      windowMode: "hidden",
      trayState: "hidden",
      observedAt: now,
    })).toEqual(expect.objectContaining({ ok: true }))

    const app = Fastify({ logger: false })
    registerUiModeRoute(app)
    await app.ready()
    try {
      const response = await app.inject({ method: "GET", url: "/api/ui/shell" })
      expect(response.statusCode).toBe(200)
      expect(response.json().runtimeHealth.yeonjang).toEqual(expect.objectContaining({
        localInstances: 1,
        remoteInstances: 1,
        supportProfiles: {
          desktopInteractive: 1,
          desktopLimited: 0,
          headlessManaged: 1,
        },
      }))
    } finally {
      await app.close()
    }
  })
})
