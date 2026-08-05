import { createRequire } from "node:module"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { registerPluginsRoute } from "../packages/core/src/api/routes/plugins.ts"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"

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

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0331 plugin path error redaction", () => {
  it("does not echo resolved entry paths in registration errors", async () => {
    const root = makeTempDir("knowbee-task0331-plugin-")
    const missingEntryPath = join(root, "missing", "plugin.js")
    const runtimeFixture = createTestRuntimeConfigFixture({ rootDir: root })
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerPluginsRoute(app)
    await app.ready()
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/plugins",
        payload: {
          name: "missing-plugin",
          version: "0.0.1",
          entryPath: missingEntryPath,
        },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({ error: "Entry path does not exist." })
      expect(JSON.stringify(response.json())).not.toContain(missingEntryPath)
      expect(JSON.stringify(response.json())).not.toContain(root)
    } finally {
      await app.close()
    }
  })
})
