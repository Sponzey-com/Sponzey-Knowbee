import { createRequire } from "node:module"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerAdminRoute } from "../packages/core/src/api/routes/admin.ts"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import type { KnowbeeConfig } from "../packages/core/src/config/types.ts"
import { closeDb, getDb } from "../packages/core/src/db/index.js"
import { runDoctor } from "../packages/core/src/diagnostics/doctor.js"
import { resolveAdminUiActivation } from "../packages/core/src/ui/mode.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const require = createRequire(import.meta.url)
const Fastify = require("../packages/core/node_modules/fastify") as (options: { logger: boolean }) => {
  ready(): Promise<void>
  close(): Promise<void>
  inject(options: { method: string; url: string; payload?: unknown }): Promise<{ statusCode: number; json(): any }>
}

const tempDirs: string[] = []
let runtimeFixture: ReturnType<typeof createTestRuntimeConfigFixture>

function useTempState(): void {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-admin-guard-"))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
}

function writeConfig(value: unknown): KnowbeeConfig {
  mkdirSync(dirname(runtimeFixture.paths.configFile), { recursive: true })
  writeFileSync(runtimeFixture.paths.configFile, JSON.stringify(value, null, 2), "utf-8")
  return runtimeFixture.load()
}

function adminUiRuntime(env: Record<string, string | undefined>, nodeEnv = "development") {
  return {
    uiModeRuntime: {
      adminActivation: { env, argv: [], nodeEnv },
      rollbackActivation: { env: {} },
    },
  }
}

beforeEach(() => {
  useTempState()
})

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task009 admin activation and guard", () => {
  it("keeps CLI admin UI flag out of process.env mutation", () => {
    const cliEntry = readFileSync(new URL("../packages/cli/src/index.ts", import.meta.url), "utf-8")

    expect(cliEntry).toContain('.option("--admin-ui"')
    expect(cliEntry).not.toContain("process.env" + '["KNOWBEE_ADMIN_UI"] = "1"')
    expect(cliEntry).not.toContain("process.env" + ".KNOWBEE_ADMIN_UI =")
  })

  it("resolves admin activation from env, CLI, local script, and production config gate", () => {
    expect(resolveAdminUiActivation({ env: {}, argv: [], configEnabled: false, nodeEnv: "development" })).toEqual(expect.objectContaining({
      enabled: false,
      reason: "disabled",
    }))

    expect(resolveAdminUiActivation({ env: { KNOWBEE_ADMIN_UI: "1" }, argv: [], configEnabled: false, nodeEnv: "development" })).toEqual(expect.objectContaining({
      enabled: true,
      envEnabled: true,
      reason: "enabled_by_runtime_flag",
    }))

    expect(resolveAdminUiActivation({ env: {}, argv: ["knowbee", "serve", "--admin-ui"], configEnabled: false, nodeEnv: "development" })).toEqual(expect.objectContaining({
      enabled: true,
      cliEnabled: true,
      reason: "enabled_by_runtime_flag",
    }))

    expect(resolveAdminUiActivation({ env: { KNOWBEE_ADMIN_UI: "1", KNOWBEE_ADMIN_UI_SOURCE: "local-script" }, argv: [], configEnabled: false, nodeEnv: "development" })).toEqual(expect.objectContaining({
      enabled: true,
      localDevScriptEnabled: true,
      reason: "enabled_by_local_dev_script",
    }))

    expect(resolveAdminUiActivation({ env: { KNOWBEE_ADMIN_UI: "1" }, argv: [], configEnabled: false, nodeEnv: "production" })).toEqual(expect.objectContaining({
      enabled: false,
      productionMode: true,
      reason: "blocked_by_production_config_gate",
    }))

    expect(resolveAdminUiActivation({ env: { KNOWBEE_ADMIN_UI: "1" }, argv: [], configEnabled: true, nodeEnv: "production" })).toEqual(expect.objectContaining({
      enabled: true,
      productionMode: true,
      reason: "enabled_by_config_and_runtime_flag",
    }))
  })

  it("blocks admin API by default and records a diagnostic event", async () => {
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerAdminRoute(app)
    await app.ready()
    try {
      const response = await app.inject({ method: "GET", url: "/api/admin/runtime" })
      expect(response.statusCode).toBe(403)
      expect(response.json()).toEqual(expect.objectContaining({ ok: false, error: "admin_ui_disabled" }))
      const event = getDb()
        .prepare<[], { kind: string; summary: string; detail_json: string }>("SELECT kind, summary, detail_json FROM diagnostic_events WHERE kind = 'admin.guard.denied' ORDER BY created_at DESC LIMIT 1")
        .get()
      expect(event).toEqual(expect.objectContaining({ kind: "admin.guard.denied" }))
      expect(event?.summary).toContain("Admin API access denied")
      expect(event?.detail_json).toContain("/api/admin/runtime")
    } finally {
      await app.close()
    }
  })

  it("keeps admin API closed when env changes after route registration", async () => {
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerAdminRoute(app, {
      uiModeRuntime: {
        adminActivation: { env: {}, argv: [], nodeEnv: "development" },
        rollbackActivation: { env: {} },
      },
    })
    expect(resolveAdminUiActivation({
      env: { KNOWBEE_ADMIN_UI: "1" },
      argv: [],
      configEnabled: false,
      nodeEnv: "development",
    }).enabled).toBe(true)
    await app.ready()
    try {
      const response = await app.inject({ method: "GET", url: "/api/admin/runtime" })
      expect(response.statusCode).toBe(403)
      expect(response.json()).toEqual(expect.objectContaining({ ok: false, error: "admin_ui_disabled" }))
    } finally {
      await app.close()
    }
  })

  it("opens admin API only when the explicit runtime flag is enabled", async () => {
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerAdminRoute(app, adminUiRuntime({ KNOWBEE_ADMIN_UI: "1" }))
    await app.ready()
    try {
      const response = await app.inject({ method: "GET", url: "/api/admin/runtime" })
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual(expect.objectContaining({
        ok: true,
        mode: expect.objectContaining({ adminEnabled: true, availableModes: ["beginner", "advanced", "admin"] }),
        manifest: expect.objectContaining({ adminUi: expect.objectContaining({ enabled: true }) }),
      }))
    } finally {
      await app.close()
    }
  })

  it("keeps production admin API closed until config and runtime flag are both enabled", async () => {
    const blockedApp = Fastify({ logger: false })
    installApiRuntimeConfig(blockedApp as never, runtimeFixture.config, runtimeFixture.paths)
    registerAdminRoute(blockedApp, adminUiRuntime({ KNOWBEE_ADMIN_UI: "1" }, "production"))
    await blockedApp.ready()
    try {
      const blocked = await blockedApp.inject({ method: "GET", url: "/api/admin/runtime" })
      expect(blocked.statusCode).toBe(403)
    } finally {
      await blockedApp.close()
    }

    const enabledConfig = writeConfig({ webui: { admin: { enabled: true } } })
    const enabledApp = Fastify({ logger: false })
    installApiRuntimeConfig(enabledApp as never, enabledConfig, runtimeFixture.paths)
    registerAdminRoute(enabledApp, adminUiRuntime({ KNOWBEE_ADMIN_UI: "1" }, "production"))
    await enabledApp.ready()
    try {
      const enabled = await enabledApp.inject({ method: "GET", url: "/api/admin/runtime" })
      expect(enabled.statusCode).toBe(200)
      expect(enabled.json().manifest.adminUi).toEqual(expect.objectContaining({
        enabled: true,
        configEnabled: true,
        runtimeFlagEnabled: true,
        productionMode: true,
      }))
    } finally {
      await enabledApp.close()
    }
  })

  it("adds a doctor blocked warning when admin UI is enabled on a remote unauthenticated host", () => {
    const config = writeConfig({
      webui: {
        host: "0.0.0.0",
        auth: { enabled: false },
        admin: { enabled: true },
      },
    })

    const report = runDoctor({ config, paths: runtimeFixture.paths,
      mode: "quick",
      includeEnvironment: false,
      includeReleasePackage: false,
      adminActivation: { env: { KNOWBEE_ADMIN_UI: "1" }, argv: [], nodeEnv: "development" },
    })
    const adminCheck = report.checks.find((check) => check.name === "admin.ui")
    expect(adminCheck).toEqual(expect.objectContaining({
      status: "blocked",
      message: expect.stringContaining("Admin UI"),
    }))
    expect(adminCheck?.detail).toEqual(expect.objectContaining({
      enabled: true,
      host: "0.0.0.0",
      authEnabled: false,
    }))
  })
})
