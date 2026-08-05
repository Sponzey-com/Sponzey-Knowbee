import { createRequire } from "node:module"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerAdminRoute } from "../packages/core/src/api/routes/admin.ts"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { createTestRuntimeConfigFixture, type TestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"
import { recordControlEvent } from "../packages/core/src/control-plane/timeline.ts"
import { closeDb, getDb, insertAuditLog, insertDiagnosticEvent } from "../packages/core/src/db/index.js"

const require = createRequire(import.meta.url)
const Fastify = require("../packages/core/node_modules/fastify") as (options: { logger: boolean }) => {
  ready(): Promise<void>
  close(): Promise<void>
  inject(options: { method: string; url: string; payload?: unknown }): Promise<{ statusCode: number; body: string; json(): any }>
}

const tempDirs: string[] = []
let runtimeFixture: TestRuntimeConfigFixture

function useTempState(): void {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task014-admin-platform-"))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
}

function restoreEnv(): void {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
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

beforeEach(() => {
  useTempState()
})

afterEach(() => {
  restoreEnv()
})

describe("task014 admin platform inspectors and diagnostic export", () => {
  it("shows Yeonjang/MQTT, DB migration state, and writes sanitized export bundles", async () => {
    const stateDir = runtimeFixture.paths.stateDir
    const snapshotDir = join(stateDir, "backups", "snapshots", "snapshot-task014")
    mkdirSync(snapshotDir, { recursive: true })
    writeFileSync(join(snapshotDir, "manifest.json"), JSON.stringify({
      id: "snapshot-task014",
      createdAt: Date.now(),
      schemaVersion: 1,
      latestSchemaVersion: 1,
      files: [{ relativePath: "state/data.db" }],
    }), "utf-8")

    recordControlEvent({
      eventType: "yeonjang.heartbeat",
      component: "yeonjang",
      severity: "info",
      summary: "TASK014 Yeonjang heartbeat",
      detail: {
        extensionId: "yeonjang-main",
        state: "connected",
        protocolVersion: "knowbee-mqtt-v1",
        capabilityHash: "capability-task014",
        methodCount: 7,
        methods: ["screen_capture", "file_read"],
        reconnectAttempts: 2,
      },
    })
    recordControlEvent({
      eventType: "mqtt.reconnect",
      component: "mqtt",
      severity: "warning",
      summary: "TASK014 MQTT reconnect attempted",
      detail: {
        extensionId: "yeonjang-main",
        state: "connected",
        reconnectAttempts: 1,
      },
    })
    recordControlEvent({
      eventType: "web_retrieval.attempt.recorded",
      component: "web_retrieval",
      requestGroupId: "group-task014",
      severity: "warning",
      summary: "fetch blocked by HTML",
      detail: {
        sourceUrl: "https://example.invalid/finance",
        localPath: "/Users/dongwooshin/.knowbee/raw/task014.html",
        token: "Bearer sk-task014-secret-token-value",
        providerRawResponse: "<!doctype html><html><body>blocked</body></html>",
      },
    })
    recordControlEvent({
      eventType: "yeonjang.goal.validation",
      component: "yeonjang",
      requestGroupId: "group-task014",
      severity: "warning",
      summary: "yeonjang-goal-validation:task014 operationId=operation:task014 receipt payload raw observed state structured diagnosis payload DB row",
      detail: {
        operationId: "operation:task014",
        receiptPayload: "task014 private receipt payload",
        rawObservedState: "task014 raw observed state",
        structuredDiagnosisPayload: { verdict: "task014 private structured diagnosis" },
      },
    })
    insertDiagnosticEvent({
      kind: "migration.failed",
      summary: "TASK014 migration diagnostic",
      requestGroupId: "group-task014",
      detail: {
        backupPath: "/Users/dongwooshin/.knowbee/backups/raw.sqlite3",
        token: "sk-task014-diagnostic-secret",
        html: "<html><body>do not export</body></html>",
        request_diagnosis: { goal: "TASK014 private diagnosis goal" },
        operation_id: "operation:task014-diagnostic",
        raw_observed_state: "task014 diagnostic raw observed state",
      },
    })
    insertAuditLog({
      timestamp: Date.now(),
      session_id: null,
      source: "test",
      tool_name: "task014.audit",
      params: JSON.stringify({
        authorization: "Bearer sk-task014-audit-secret",
        localPath: "/Users/dongwooshin/.knowbee/raw/audit.html",
        operationId: "operation:task014-audit",
      }),
      output: JSON.stringify({
        providerRawResponse: "<html><body>audit</body></html>",
        serialized: JSON.stringify({ solution_plan: { steps: ["TASK014 private plan step"] } }),
        receiptPayload: "task014 audit receipt payload",
      }),
      result: "failed",
      duration_ms: null,
      approval_required: 0,
      approved_by: null,
      request_group_id: "group-task014",
    })

    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerAdminRoute(app, {
      uiModeRuntime: {
        adminActivation: {
          env: { KNOWBEE_ADMIN_UI: "1" },
          nodeEnv: undefined,
        },
      },
    })
    await app.ready()
    try {
      const inspectorResponse = await app.inject({ method: "GET", url: "/api/admin/platform-inspectors?limit=100" })
      expect(inspectorResponse.statusCode).toBe(200)
      const inspector = inspectorResponse.json()
      expect(inspector.yeonjang.summary.heartbeats).toBeGreaterThanOrEqual(1)
      expect(inspector.yeonjang.summary.reconnectAttempts).toBeGreaterThanOrEqual(2)
      expect(inspector.yeonjang.nodes[0]).toEqual(expect.objectContaining({
        extensionId: "yeonjang-main",
        protocolVersion: "knowbee-mqtt-v1",
        capabilityHash: "capability-task014",
        methodCount: 7,
      }))
      expect(inspector.database.summary.currentVersion).toBeGreaterThan(0)
      expect(inspector.database.summary.latestVersion).toBeGreaterThan(0)
      expect(inspector.database.summary.integrityOk).toBe(true)
      expect(inspector.database.summary.backupSnapshots).toBe(1)
      expect(inspector.database.summary.migrationDiagnostics).toBeGreaterThanOrEqual(1)
      expect(JSON.stringify(inspector.database.diagnostics)).not.toMatch(/sk-task014|\/Users\/dongwooshin|<html/i)

      const startResponse = await app.inject({
        method: "POST",
        url: "/api/admin/diagnostic-exports",
        payload: { requestGroupId: "group-task014", includeTimeline: true, includeReport: true, limit: 100 },
      })
      expect(startResponse.statusCode).toBe(202)
      const started = startResponse.json()
      const job = await waitForExportJob(app, started.job.id)
      expect(job.status).toBe("succeeded")
      expect(job.progress).toBe(100)
      expect(job.bundlePath).toBe("[internal-path-redacted]")
      expect(job.bundleUrl).toBe(`/api/admin/diagnostic-exports/${encodeURIComponent(job.id)}/bundle`)

      const bundleResponse = await app.inject({ method: "GET", url: job.bundleUrl })
      expect(bundleResponse.statusCode).toBe(200)
      const bundle = bundleResponse.body
      expect(bundle).toContain("knowbee.admin.diagnostic_export")
      expect(bundle).toContain("[redacted")
      expect(bundle).not.toMatch(/sk-task014|Bearer sk-|\/Users\/dongwooshin|<!doctype|<html/i)
      expect(bundle).not.toMatch(/TASK014 private diagnosis goal|TASK014 private plan step/u)
      expect(bundle).toContain("[internal-evidence-redacted]")
      expect(bundle).not.toMatch(/yeonjang-goal-validation|operationId|operation:task014|receipt payload|raw observed state|structured diagnosis payload|DB row/u)
      expect(bundle).not.toMatch(/task014 private receipt payload|task014 private structured diagnosis|task014 diagnostic raw observed state|task014 audit receipt payload/u)

      const listResponse = await app.inject({ method: "GET", url: "/api/admin/diagnostic-exports" })
      expect(listResponse.statusCode).toBe(200)
      expect(listResponse.json().jobs.some((item: any) => item.id === job.id && item.status === "succeeded")).toBe(true)
    } finally {
      await app.close()
    }
  })
})
