import { createRequire } from "node:module"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerSettingsRoute } from "../packages/core/src/api/routes/settings.js"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { closeDb } from "../packages/core/src/db/index.js"
import { stopMqttBroker } from "../packages/core/src/mqtt/broker.js"
import {
  createTestRuntimeConfigFixture,
  type TestRuntimeConfigFixture,
} from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const require = createRequire(import.meta.url)
const JSON5 = require("../packages/core/node_modules/json5") as { parse(source: string): unknown }
const Fastify = require("../packages/core/node_modules/fastify") as (options: { logger: boolean }) => {
  ready(): Promise<void>
  close(): Promise<void>
  inject(options: { method: string; url: string; payload?: unknown }): Promise<{
    statusCode: number
    json(): any
  }>
}

const tempDirs: string[] = []
let runtimeFixture: TestRuntimeConfigFixture

function useTempState(): void {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task0554-state-"))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({
    rootDir,
    configText: JSON.stringify({
      orchestration: {
        mode: "orchestration",
        featureFlagEnabled: true,
        maxDelegationTurns: 3,
      },
      mqtt: { enabled: false },
    }, null, 2),
  })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
}

beforeEach(() => {
  useTempState()
})

afterEach(async () => {
  await stopMqttBroker()
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0554 settings API direct main agent mode adapter", () => {
  it("accepts canonical direct_main_agent input and persists legacy single_knowbee mode", async () => {
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerSettingsRoute(app)
    await app.ready()
    try {
      const response = await app.inject({
        method: "PUT",
        url: "/api/settings",
        payload: {
          orchestration: {
            mode: "direct_main_agent",
            featureFlagEnabled: false,
            maxDelegationTurns: 0,
          },
        },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().ok).toBe(true)
      expect(response.json().legacy.orchestration.mode).toBe("orchestration")
      expect(response.json().orchestration.mode).toBe("orchestration")
      expect(response.json()).toEqual(expect.objectContaining({
        restartRequired: true,
        appliesOn: "next_start",
        runtimeConfigApplied: false,
        configCommand: expect.objectContaining({
          kind: "settings.compat.save",
          state: "completed",
        }),
      }))

      const persisted = JSON5.parse(readFileSync(runtimeFixture.paths.configFile, "utf-8")) as {
        orchestration?: { mode?: string; featureFlagEnabled?: boolean; maxDelegationTurns?: number }
      }
      expect(persisted.orchestration?.mode).toBe("single_knowbee")
      expect(persisted.orchestration?.featureFlagEnabled).toBe(false)
      expect(persisted.orchestration?.maxDelegationTurns).toBe(0)

      const running = await app.inject({ method: "GET", url: "/api/settings" })
      expect(running.json().orchestration.mode).toBe("orchestration")

      const reload = await app.inject({ method: "POST", url: "/api/settings/reload" })
      expect(reload.statusCode).toBe(409)
      expect(reload.json()).toEqual(expect.objectContaining({
        ok: false,
        error: "runtime_config_reload_not_supported",
        restartRequired: true,
        configCommand: expect.objectContaining({
          kind: "settings.reload",
          state: "rejected",
        }),
      }))
    } finally {
      await app.close()
    }
  })
})
