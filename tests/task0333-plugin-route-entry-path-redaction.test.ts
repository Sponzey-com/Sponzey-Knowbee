import { createRequire } from "node:module"
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerPluginsRoute } from "../packages/core/src/api/routes/plugins.ts"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { closeDb } from "../packages/core/src/db/index.js"
import {
  createTestRuntimeConfigFixture,
  type TestRuntimeConfigFixture,
} from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const require = createRequire(import.meta.url)
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

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

function useTempState(): void {
  closeDb()
  const rootDir = makeTempDir("knowbee-task0333-state-")
  runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
}

function writePlugin(entryPath: string): void {
  mkdirSync(dirname(entryPath), { recursive: true })
  writeFileSync(entryPath, "export default { name: 'route-test-plugin', version: '0.0.1', initialize() {} }\n", "utf-8")
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

describe("task0333 plugin route entry path redaction", () => {
  it("redacts plugin entry paths in standard route responses and enable failures", async () => {
    const pluginRoot = makeTempDir("knowbee-task0333-plugin-")
    const entryPath = join(pluginRoot, "plugins", "route-test-plugin.js")
    writePlugin(entryPath)

    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerPluginsRoute(app)
    await app.ready()
    try {
      const install = await app.inject({
        method: "POST",
        url: "/api/plugins",
        payload: {
          name: "route-test-plugin",
          version: "0.0.1",
          description: "Route test plugin",
          entryPath,
          config: { visible: true },
        },
      })
      expect(install.statusCode).toBe(200)
      expect(install.json()).toMatchObject({
        name: "route-test-plugin",
        entry_path: "[internal-path-redacted]",
        config: { visible: true },
      })
      expect(JSON.stringify(install.json())).not.toContain(entryPath)
      expect(JSON.stringify(install.json())).not.toContain(pluginRoot)

      const list = await app.inject({ method: "GET", url: "/api/plugins" })
      expect(list.statusCode).toBe(200)
      expect(list.json()[0]).toMatchObject({ name: "route-test-plugin", entry_path: "[internal-path-redacted]" })
      expect(JSON.stringify(list.json())).not.toContain(entryPath)

      const detail = await app.inject({ method: "GET", url: "/api/plugins/route-test-plugin" })
      expect(detail.statusCode).toBe(200)
      expect(detail.json()).toMatchObject({ name: "route-test-plugin", entry_path: "[internal-path-redacted]" })
      expect(JSON.stringify(detail.json())).not.toContain(entryPath)

      const disable = await app.inject({
        method: "PATCH",
        url: "/api/plugins/route-test-plugin",
        payload: { enabled: false, config: { visible: false } },
      })
      expect(disable.statusCode).toBe(200)
      expect(disable.json()).toMatchObject({
        name: "route-test-plugin",
        entry_path: "[internal-path-redacted]",
        config: { visible: false },
      })
      expect(JSON.stringify(disable.json())).not.toContain(entryPath)

      unlinkSync(entryPath)
      const enable = await app.inject({
        method: "PATCH",
        url: "/api/plugins/route-test-plugin",
        payload: { enabled: true },
      })
      expect(enable.statusCode).toBe(400)
      expect(enable.json()).toEqual({ error: "Plugin could not be enabled." })
      expect(JSON.stringify(enable.json())).not.toContain(entryPath)
      expect(JSON.stringify(enable.json())).not.toContain(pluginRoot)
    } finally {
      await app.close()
    }
  })
})
