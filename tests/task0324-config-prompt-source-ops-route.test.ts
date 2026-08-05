import { createRequire } from "node:module"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerConfigOperationsRoute } from "../packages/core/src/api/routes/config-operations.ts"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { closeDb } from "../packages/core/src/db/index.ts"
import { ensurePromptSourceFiles, loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
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

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

function useTempState(): string {
  closeDb()
  const rootDir = makeTempDir("knowbee-task0324-state-")
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

describe("task0324 config prompt source operations route", () => {
  it("redacts prompt source export response and returns a bounded export id", async () => {
    const workDir = makeTempDir("knowbee-task0324-prompts-export-")
    ensurePromptSourceFiles(workDir)

    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerConfigOperationsRoute(app)
    await app.ready()
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/config/prompt-sources/export",
        payload: { workDir },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.export).toMatchObject({
        exportId: expect.stringMatching(/^prompt-sources-export-.+\.json$/u),
        exportPath: "[internal-path-redacted]",
        checksum: "[checksum-redacted]",
      })
      expect(body.export.sources.length).toBeGreaterThan(0)
      expect(body.export.sources.every((source: { path: string }) => source.path === "[internal-path-redacted]")).toBe(true)
      expect(body.export.sources.every((source: { checksum: string }) => source.checksum === "[checksum-redacted]")).toBe(true)
      expect(JSON.stringify(body.export)).not.toContain(workDir)
      expect(existsSync(join(runtimeFixture.paths.stateDir, "backups", "prompts", body.export.exportId))).toBe(true)
    } finally {
      await app.close()
    }
  })

  it("imports prompt sources through export id and redacts import metadata", async () => {
    const sourceRoot = makeTempDir("knowbee-task0324-prompts-source-")
    const targetRoot = makeTempDir("knowbee-task0324-prompts-target-")
    ensurePromptSourceFiles(sourceRoot)
    ensurePromptSourceFiles(targetRoot)
    writeFileSync(join(sourceRoot, "prompts", "channel.md"), "# Channel\n\nImported channel source\n", "utf-8")

    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerConfigOperationsRoute(app)
    await app.ready()
    try {
      const exportResponse = await app.inject({
        method: "POST",
        url: "/api/config/prompt-sources/export",
        payload: { workDir: sourceRoot },
      })
      expect(exportResponse.statusCode).toBe(200)
      const exportId = exportResponse.json().export.exportId
      rmSync(join(targetRoot, "prompts", "channel.md"), { force: true })

      const importResponse = await app.inject({
        method: "POST",
        url: "/api/config/prompt-sources/import",
        payload: { workDir: targetRoot, exportId, overwrite: false },
      })

      expect(importResponse.statusCode).toBe(200)
      const body = importResponse.json()
      expect(body.import).toMatchObject({
        exportId,
        exportPath: "[internal-path-redacted]",
        imported: expect.arrayContaining(["channel:en"]),
      })
      expect(body.import.registry[0]).toMatchObject({
        path: "[internal-path-redacted]",
        checksum: "[checksum-redacted]",
      })
      expect(JSON.stringify(body.import)).not.toContain(targetRoot)
      expect(JSON.stringify(body.import)).not.toContain(sourceRoot)
      expect(readFileSync(join(targetRoot, "prompts", "channel.md"), "utf-8")).toContain("Imported channel source")
      expect(loadPromptSourceRegistry(targetRoot).some((source) => source.sourceId === "channel" && source.locale === "en")).toBe(true)
    } finally {
      await app.close()
    }
  })

  it("rejects arbitrary prompt source import filesystem paths", async () => {
    const sourceRoot = makeTempDir("knowbee-task0324-prompts-reject-source-")
    const targetRoot = makeTempDir("knowbee-task0324-prompts-reject-target-")
    ensurePromptSourceFiles(sourceRoot)
    ensurePromptSourceFiles(targetRoot)
    const arbitraryExport = join(sourceRoot, "arbitrary-export.json")
    writeFileSync(arbitraryExport, JSON.stringify({ kind: "knowbee.prompt-sources.export", version: 1, sources: [] }), "utf-8")

    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerConfigOperationsRoute(app)
    await app.ready()
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/config/prompt-sources/import",
        payload: { workDir: targetRoot, exportPath: arbitraryExport, overwrite: false },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ ok: false })
      expect(response.json().command).toMatchObject({ kind: "config.prompt_sources.import", state: "failed" })
      expect(JSON.stringify(response.json())).not.toContain(arbitraryExport)
    } finally {
      await app.close()
    }
  })
})
