import { createRequire } from "node:module"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerConfigOperationsRoute } from "../packages/core/src/api/routes/config-operations.ts"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { closeDb } from "../packages/core/src/db/index.js"
import {
  createTestRuntimeConfigFixture,
  type TestRuntimeConfigFixture,
} from "./fixtures/runtime-config.ts"

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

function useTempState(): string {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task0327-state-"))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  return runtimeFixture.paths.stateDir
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

describe("task0327 config export redaction", () => {
  it("redacts masked config export response while writing a masked export file", async () => {
    const stateDir = runtimeFixture.paths.stateDir
    const configPath = runtimeFixture.paths.configFile
    const openAiSecret = "sk-task0327-secret-value-1234567890"
    const telegramSecret = "123456:telegramtoken-task0327-secret"
    writeFileSync(configPath, JSON.stringify({
      ai: {
        connection: {
          provider: "openai",
          model: "gpt-test",
          auth: {
            apiKey: openAiSecret,
          },
        },
      },
      telegram: {
        enabled: true,
        botToken: telegramSecret,
        allowedUserIds: [42120565],
      },
    }, null, 2), "utf-8")

    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.load(), runtimeFixture.paths)
    registerConfigOperationsRoute(app)
    await app.ready()
    try {
      const response = await app.inject({ method: "POST", url: "/api/config/export" })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.export).toMatchObject({
        id: expect.stringMatching(/^config-export-/u),
        configPath: "[internal-path-redacted]",
        exportPath: "[internal-path-redacted]",
        checksum: "[checksum-redacted]",
      })
      expect(body.command).toMatchObject({ kind: "config.export", state: "completed" })
      expect(body.export.masking.secretsMasked).toBeGreaterThanOrEqual(2)

      const serializedResponse = JSON.stringify(body)
      expect(serializedResponse).not.toContain(stateDir)
      expect(serializedResponse).not.toContain(configPath)
      expect(serializedResponse).not.toContain(openAiSecret)
      expect(serializedResponse).not.toContain(telegramSecret)

      const exportPath = join(stateDir, "backups", "config", `${body.export.id}.json`)
      expect(existsSync(exportPath)).toBe(true)
      const exported = readFileSync(exportPath, "utf-8")
      expect(exported).toContain("***MASKED***")
      expect(exported).not.toContain(openAiSecret)
      expect(exported).not.toContain(telegramSecret)
      expect(exported).toContain("42120565")
    } finally {
      await app.close()
    }
  })
})
