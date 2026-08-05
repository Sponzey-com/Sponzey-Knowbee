import { createRequire } from "node:module"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerSettingsRoute } from "../packages/core/src/api/routes/settings.js"
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
let rawAuthPath = ""

function useTempState(): void {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task0339-state-"))
  tempDirs.push(rootDir)
  rawAuthPath = join(rootDir, "private", "auth.json")
  runtimeFixture = createTestRuntimeConfigFixture({
    rootDir,
    configText: JSON.stringify({
      ai: {
        connection: {
          provider: "openai",
          model: "gpt-test",
          auth: { mode: "chatgpt_oauth", oauthAuthFilePath: rawAuthPath },
        },
      },
    }, null, 2),
  })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
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

describe("task0339 settings AI OAuth path redaction", () => {
  it("masks legacy settings OAuth auth file paths", async () => {
    expect(rawAuthPath).toBeTruthy()

    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerSettingsRoute(app)
    await app.ready()
    try {
      const response = await app.inject({ method: "GET", url: "/api/settings" })

      expect(response.statusCode, JSON.stringify(response.json())).toBe(200)
      expect(response.json().ai.oauthAuthFilePath).toBe("[internal-path-redacted]")
      expect(response.json().ai.hasOAuthAuthFilePath).toBe(true)
      expect(JSON.stringify(response.json())).not.toContain(rawAuthPath)
    } finally {
      await app.close()
    }
  })
})
