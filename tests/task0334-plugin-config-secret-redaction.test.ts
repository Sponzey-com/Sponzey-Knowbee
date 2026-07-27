import { createRequire } from "node:module"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerPluginsRoute } from "../packages/core/src/api/routes/plugins.ts"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { closeDb } from "../packages/core/src/db/index.ts"
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

function useTempState(): string {
  closeDb()
  const rootDir = makeTempDir("knowbee-task0334-state-")
  runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
  return runtimeFixture.paths.stateDir
}

function writePlugin(entryPath: string): void {
  mkdirSync(dirname(entryPath), { recursive: true })
  writeFileSync(entryPath, "export default { name: 'secret-plugin', version: '0.0.1', initialize() {} }\n", "utf-8")
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

describe("task0334 plugin config secret redaction", () => {
  it("masks plugin config secrets across install, list, detail, and update responses", async () => {
    const pluginRoot = makeTempDir("knowbee-task0334-plugin-")
    const entryPath = join(pluginRoot, "plugins", "secret-plugin.js")
    const apiKey = "sk-task0334-plugin-secret-value-1234567890"
    const token = "xoxb-task0334-plugin-secret-token-1234567890"
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
          name: "secret-plugin",
          version: "0.0.1",
          entryPath,
          config: {
            apiKey,
            nested: {
              token,
              visible: "safe-value",
            },
          },
        },
      })
      expect(install.statusCode).toBe(200)
      expect(install.json().config).toEqual({
        apiKey: "***MASKED***",
        nested: {
          token: "***MASKED***",
          visible: "safe-value",
        },
      })
      expect(JSON.stringify(install.json())).not.toContain(apiKey)
      expect(JSON.stringify(install.json())).not.toContain(token)

      const list = await app.inject({ method: "GET", url: "/api/plugins" })
      expect(list.statusCode).toBe(200)
      expect(list.json()[0].config.apiKey).toBe("***MASKED***")
      expect(list.json()[0].config.nested.visible).toBe("safe-value")
      expect(JSON.stringify(list.json())).not.toContain(apiKey)
      expect(JSON.stringify(list.json())).not.toContain(token)

      const detail = await app.inject({ method: "GET", url: "/api/plugins/secret-plugin" })
      expect(detail.statusCode).toBe(200)
      expect(detail.json().config.nested.token).toBe("***MASKED***")
      expect(detail.json().config.nested.visible).toBe("safe-value")

      const updatedSecret = "sk-task0334-updated-secret-value-1234567890"
      const update = await app.inject({
        method: "PATCH",
        url: "/api/plugins/secret-plugin",
        payload: {
          config: {
            apiKey: updatedSecret,
            visible: "updated-safe-value",
          },
        },
      })
      expect(update.statusCode).toBe(200)
      expect(update.json().config).toEqual({
        apiKey: "***MASKED***",
        visible: "updated-safe-value",
      })
      expect(JSON.stringify(update.json())).not.toContain(updatedSecret)
    } finally {
      await app.close()
    }
  })
})
