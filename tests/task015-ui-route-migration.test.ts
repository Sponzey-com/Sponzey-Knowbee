import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerUiModeRoute } from "../packages/core/src/api/routes/ui-mode.ts"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { closeDb } from "../packages/core/src/db/index.js"
import { resolveUiMode, resolveUiModeRollbackActivation } from "../packages/core/src/ui/mode.ts"
import {
  getDeprecatedUiRoutes,
  getUiRouteInventory,
  resolveLegacyAdvancedRoute,
  resolveModeSwitchRoute,
  resolveRollbackRoute,
  resolveRouteMigration,
} from "../packages/webui/src/lib/ui-mode.js"
import {
  type TestRuntimeConfigFixture,
  createTestRuntimeConfigFixture,
} from "./fixtures/runtime-config.ts"

const require = createRequire(import.meta.url)
const Fastify = require("../packages/core/node_modules/fastify") as (options: {
  logger: boolean
}) => {
  ready(): Promise<void>
  close(): Promise<void>
  inject(options: { method: string; url: string; payload?: unknown }): Promise<{
    statusCode: number
    json(): unknown
  }>
}

const tempDirs: string[] = []
let runtimeFixture: TestRuntimeConfigFixture

function useTempState(): void {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task015-ui-migration-"))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
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

describe("task015 UI route migration and rollback", () => {
  it("keeps a route inventory with mode ownership, API calls, and replacement paths", () => {
    const inventory = getUiRouteInventory()
    const paths = inventory.map((item) => item.path)

    expect(paths).toEqual(
      expect.arrayContaining([
        "/chat",
        "/tasks",
        "/dashboard",
        "/settings",
        "/ai",
        "/channels",
        "/advanced/dashboard",
        "/advanced/settings",
        "/admin",
      ]),
    )
    expect(inventory.find((item) => item.path === "/chat")).toEqual(
      expect.objectContaining({
        mode: "beginner",
        component: "ChatPage",
        status: "kept",
      }),
    )
    expect(inventory.find((item) => item.path === "/dashboard")).toEqual(
      expect.objectContaining({
        mode: "advanced",
        status: "redirect",
        replacementPath: "/advanced/dashboard",
      }),
    )
    expect(inventory.find((item) => item.path === "/ai")).toEqual(
      expect.objectContaining({
        mode: "advanced",
        status: "redirect",
        replacementPath: "/settings/ai",
      }),
    )
    expect(
      inventory.every((item) => item.apiCalls.length > 0 || item.component === "Navigate"),
    ).toBe(true)
    expect(
      getDeprecatedUiRoutes().every((item) => item.replacementPath?.startsWith("/advanced/")),
    ).toBe(true)
  })

  it("redirects legacy and deprecated URLs without leaving blank screens", () => {
    expect(resolveLegacyAdvancedRoute("/settings")).toBeNull()
    expect(resolveLegacyAdvancedRoute("/settings/ai")).toBeNull()
    expect(resolveLegacyAdvancedRoute("/runs")).toBe("/work/runs")
    expect(resolveLegacyAdvancedRoute("/ai")).toBe("/settings/ai")
    expect(resolveLegacyAdvancedRoute("/channels/slack")).toBe("/settings/connections")
    expect(resolveLegacyAdvancedRoute("/memory")).toBe("/settings/memory")
    expect(resolveLegacyAdvancedRoute("/chat")).toBeNull()

    expect(resolveRouteMigration("/release")).toEqual(
      expect.objectContaining({
        from: "/release",
        to: "/settings/diagnostics",
        status: "redirect",
        component: "LegacyAdvancedRedirect",
      }),
    )
  })

  it("provides a rollback route policy for the mode shell", () => {
    expect(resolveRollbackRoute("/")).toBe("/chat")
    expect(resolveRollbackRoute("/chat")).toBe("/chat")
    expect(resolveRollbackRoute("/setup")).toBe("/setup")
    expect(resolveRollbackRoute("/settings/mqtt")).toBe("/settings/mqtt")
    expect(resolveRollbackRoute("/advanced/runs")).toBe("/work/runs")
    expect(resolveModeSwitchRoute("/setup", "advanced")).toBe("/setup")
    expect(resolveModeSwitchRoute("/advanced/ai", "beginner")).toBe("/settings/ai")
  })

  it("uses an environment rollback flag to disable UI mode switching without data migration", async () => {
    const rollbackActivation = { env: { KNOWBEE_UI_MODE_ROLLBACK: "1" } }

    expect(resolveUiModeRollbackActivation(rollbackActivation)).toEqual(
      expect.objectContaining({
        enabled: true,
        reason: "enabled_by_ui_mode_rollback",
      }),
    )
    expect(
      resolveUiMode({ preferredUiMode: "beginner", adminEnabled: false, rollbackActivation }),
    ).toEqual(
      expect.objectContaining({
        mode: "advanced",
        preferredUiMode: "advanced",
        availableModes: ["advanced"],
        canSwitchInUi: false,
      }),
    )

    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerUiModeRoute(app, { rollbackActivation })
    await app.ready()
    try {
      const mode = await app.inject({ method: "GET", url: "/api/ui/mode" })
      expect(mode.statusCode).toBe(200)
      expect(mode.json()).toEqual(
        expect.objectContaining({
          mode: "advanced",
          preferredUiMode: "advanced",
          availableModes: ["advanced"],
          canSwitchInUi: false,
        }),
      )

      const saved = await app.inject({
        method: "POST",
        url: "/api/ui/mode",
        payload: { mode: "beginner" },
      })
      expect(saved.statusCode).toBe(200)
      expect(saved.json()).toEqual(
        expect.objectContaining({
          ok: true,
          mode: "advanced",
          preferredUiMode: "advanced",
          canSwitchInUi: false,
        }),
      )
      if (existsSync(runtimeFixture.paths.configFile)) {
        expect(readFileSync(runtimeFixture.paths.configFile, "utf-8")).not.toContain(
          "preferredUiMode",
        )
      }
    } finally {
      await app.close()
    }
  })

  it("keeps the existing settings save path when rollback is not enabled", async () => {
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerUiModeRoute(app)
    await app.ready()
    try {
      const saved = await app.inject({
        method: "POST",
        url: "/api/ui/mode",
        payload: { mode: "advanced" },
      })
      expect(saved.statusCode).toBe(200)
      expect(saved.json()).toEqual(
        expect.objectContaining({ ok: true, mode: "advanced", preferredUiMode: "advanced" }),
      )
      expect(readFileSync(runtimeFixture.paths.configFile, "utf-8")).toContain("preferredUiMode")
    } finally {
      await app.close()
    }
  })
})
