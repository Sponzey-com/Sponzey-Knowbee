import { createRequire } from "node:module"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerConfigOperationsRoute } from "../packages/core/src/api/routes/config-operations.ts"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { closeDb, getSession, insertSession } from "../packages/core/src/db/index.js"
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

function useTempState(): string {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task0325-state-"))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
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

describe("task0325 config DB operations route", () => {
  it("redacts DB backup response while returning a usable backup id", async () => {
    insertSession({
      id: "session-before-db-backup",
      source: "webui",
      source_id: null,
      created_at: 1,
      updated_at: 1,
      summary: null,
    })

    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerConfigOperationsRoute(app)
    await app.ready()
    try {
      const response = await app.inject({ method: "POST", url: "/api/config/db/backup" })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.backup).toMatchObject({
        id: expect.stringMatching(/^db-backup-.+/u),
        databasePath: "[internal-path-redacted]",
        backupPath: "[internal-path-redacted]",
        checksum: "[checksum-redacted]",
      })
      expect(body.command).toMatchObject({ kind: "config.db.backup", state: "completed" })
      expect(body.command.transitions.map((transition: { to: string }) => transition.to)).toEqual([
        "received",
        "validated",
        "executing",
        "persisted",
        "completed",
      ])
      expect(JSON.stringify(body.backup)).not.toContain(runtimeFixture.paths.stateDir)
      expect(existsSync(join(runtimeFixture.paths.stateDir, "backups", "db", `${body.backup.id}.sqlite3`))).toBe(true)
    } finally {
      await app.close()
    }
  })

  it("imports DB backup through backup id and redacts import metadata", async () => {
    insertSession({
      id: "session-before-db-import",
      source: "webui",
      source_id: null,
      created_at: 1,
      updated_at: 1,
      summary: null,
    })

    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerConfigOperationsRoute(app)
    await app.ready()
    try {
      const backupResponse = await app.inject({ method: "POST", url: "/api/config/db/backup" })
      expect(backupResponse.statusCode).toBe(200)
      const backupId = backupResponse.json().backup.id

      insertSession({
        id: "session-after-db-backup",
        source: "webui",
        source_id: null,
        created_at: 2,
        updated_at: 2,
        summary: null,
      })
      expect(getSession("session-after-db-backup")?.id).toBe("session-after-db-backup")

      const importResponse = await app.inject({
        method: "POST",
        url: "/api/config/db/import",
        payload: { backupId },
      })

      expect(importResponse.statusCode).toBe(200)
      const body = importResponse.json()
      expect(body.import).toMatchObject({
        importedPath: "[internal-path-redacted]",
        rollbackBackup: {
          id: expect.stringMatching(/^db-rollback-.+/u),
          databasePath: "[internal-path-redacted]",
          backupPath: "[internal-path-redacted]",
          checksum: "[checksum-redacted]",
        },
      })
      expect(body.command).toMatchObject({ kind: "config.db.import", state: "completed" })
      expect(body.command.transitions.map((transition: { to: string }) => transition.to)).toEqual([
        "received",
        "validated",
        "backed_up",
        "replacing",
        "verifying",
        "completed",
      ])
      expect(JSON.stringify(body.import)).not.toContain(runtimeFixture.paths.stateDir)
      closeDb()
      initializeTestDbRuntime(runtimeFixture.paths.stateDir)
      expect(getSession("session-before-db-import")?.id).toBe("session-before-db-import")
      expect(getSession("session-after-db-backup")).toBeUndefined()
    } finally {
      await app.close()
    }
  })

  it("rejects arbitrary DB import filesystem paths", async () => {
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerConfigOperationsRoute(app)
    await app.ready()
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/config/db/import",
        payload: { backupPath: runtimeFixture.paths.dbFile },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json()).toMatchObject({ ok: false })
      expect(response.json().command).toMatchObject({ kind: "config.db.import", state: "rejected" })
      expect(JSON.stringify(response.json())).not.toContain(runtimeFixture.paths.dbFile)
    } finally {
      await app.close()
    }
  })
})
