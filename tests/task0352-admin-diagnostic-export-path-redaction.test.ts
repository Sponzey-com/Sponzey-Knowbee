import { createRequire } from "node:module"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerAdminRoute } from "../packages/core/src/api/routes/admin.ts"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { closeDb, insertDiagnosticEvent } from "../packages/core/src/db/index.js"
import {
  createTestRuntimeConfigFixture,
  type TestRuntimeConfigFixture,
} from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const require = createRequire(import.meta.url)
const Fastify = require("../packages/core/node_modules/fastify") as (options: { logger: boolean }) => {
  ready(): Promise<void>
  close(): Promise<void>
  inject(options: { method: string; url: string; payload?: unknown }): Promise<{ statusCode: number; body: string; json(): any }>
}

const tempDirs: string[] = []
let runtimeFixture: TestRuntimeConfigFixture

function useTempState(): string {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-admin-export-path-"))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
  return runtimeFixture.paths.stateDir
}

function restoreState(): void {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
}

function adminRuntimeOptions() {
  return {
    uiModeRuntime: {
      adminActivation: {
        env: { KNOWBEE_ADMIN_UI: "1" },
        nodeEnv: undefined,
      },
      rollbackActivation: { env: {} },
    },
  }
}

async function waitForExportJob(app: ReturnType<typeof Fastify>, id: string): Promise<any> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await app.inject({ method: "GET", url: `/api/admin/diagnostic-exports/${encodeURIComponent(id)}` })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    if (body.job.status === "succeeded" || body.job.status === "failed") return body.job
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("diagnostic export job did not finish")
}

let currentStateDir = ""

beforeEach(() => {
  currentStateDir = useTempState()
})

afterEach(() => {
  restoreState()
  currentStateDir = ""
})

describe("task0352 admin diagnostic export path redaction", () => {
  it("redacts export job paths and streams bundles through an API URL", async () => {
    insertDiagnosticEvent({
      kind: "task0352.diagnostic",
      summary: "TASK0352 diagnostic export fixture",
      detail: { localPath: join(currentStateDir, "raw", "secret.json"), token: "sk-task0352-export-secret" },
    })

    const app = Fastify({ logger: false })
    const startupPaths = runtimeFixture.paths
    installApiRuntimeConfig(app as never, runtimeFixture.config, startupPaths)
    registerAdminRoute(app, adminRuntimeOptions())
    await app.ready()
    try {
      const changedStateDir = mkdtempSync(join(tmpdir(), "knowbee-admin-export-path-changed-"))
      tempDirs.push(changedStateDir)
      const startResponse = await app.inject({
        method: "POST",
        url: "/api/admin/diagnostic-exports",
        payload: { includeTimeline: true, includeReport: true, limit: 50 },
      })
      expect(startResponse.statusCode).toBe(202)
      const started = startResponse.json()
      const job = await waitForExportJob(app, started.job.id)

      expect(job.status).toBe("succeeded")
      expect(job.bundlePath).toBe("[internal-path-redacted]")
      expect(job.bundleFile).toEqual(expect.stringMatching(/^admin-export-.+\.json$/u))
      expect(job.bundleBytes).toBeGreaterThan(0)
      expect(job.bundleUrl).toBe(`/api/admin/diagnostic-exports/${encodeURIComponent(job.id)}/bundle`)
      expect(JSON.stringify(job)).not.toContain(currentStateDir)
      expect(existsSync(join(startupPaths.stateDir, "admin-exports", job.bundleFile))).toBe(true)
      expect(existsSync(join(changedStateDir, "admin-exports"))).toBe(false)

      const listResponse = await app.inject({ method: "GET", url: "/api/admin/diagnostic-exports" })
      expect(listResponse.statusCode).toBe(200)
      expect(JSON.stringify(listResponse.json())).not.toContain(currentStateDir)

      const platformResponse = await app.inject({ method: "GET", url: "/api/admin/platform-inspectors?limit=50" })
      expect(platformResponse.statusCode).toBe(200)
      const platformSerialized = JSON.stringify(platformResponse.json().exports.jobs)
      expect(platformSerialized).toContain("[internal-path-redacted]")
      expect(platformSerialized).not.toContain(currentStateDir)

      const bundleResponse = await app.inject({ method: "GET", url: job.bundleUrl })
      expect(bundleResponse.statusCode).toBe(200)
      expect(bundleResponse.body).toContain("knowbee.admin.diagnostic_export")
      expect(bundleResponse.body).not.toContain(currentStateDir)
      expect(bundleResponse.body).not.toContain("sk-task0352-export-secret")
    } finally {
      await app.close()
    }
  })
})
