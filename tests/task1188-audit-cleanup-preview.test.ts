import { createRequire } from "node:module"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { registerAuditRoute } from "../packages/core/src/api/routes/audit.js"
import { closeDb, getDb, insertAuditLog, insertSession } from "../packages/core/src/db/index.js"
import { createRootRun } from "../packages/core/src/runs/store.js"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const require = createRequire(import.meta.url)
const Fastify = require("../packages/core/node_modules/fastify") as (options: {
  logger: boolean
}) => {
  ready(): Promise<void>
  close(): Promise<void>
  inject(options: { method: string; url: string }): Promise<{
    statusCode: number
    json(): Record<string, unknown>
  }>
}

const tempDirs: string[] = []
const auditMutationDependencies = {
  resolvePrincipal: () => ({
    principalRef: "test:task1188-administrator",
    role: "administrator",
    runIds: ["*"],
    requestGroupIds: ["*"],
    scopeRefs: ["instance:local"],
  }),
  recordAccess: () => ({ recorded: true as const }),
}

function insertTestAudit(runId?: string): void {
  insertAuditLog({
    timestamp: 1,
    session_id: null,
    ...(runId ? { run_id: runId } : {}),
    source: "task1188",
    tool_name: "test_tool",
    params: null,
    output: null,
    result: "success",
    duration_ms: 1,
    approval_required: 0,
    approved_by: null,
  })
}

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true })
})

describe("task1188 audit cleanup preview", () => {
  it("retains audit data and returns a preview when confirmation is missing", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "knowbee-task1188-audit-"))
    tempDirs.push(stateDir)
    initializeTestDbRuntime(stateDir)
    insertTestAudit()

    const app = Fastify({ logger: false })
    registerAuditRoute(app, auditMutationDependencies)
    await app.ready()
    try {
      const response = await app.inject({
        method: "DELETE",
        url: "/api/audit?all=true&purpose=security_review&scope=local_instance",
      })

      expect(response.statusCode).toBe(409)
      expect(response.json()).toEqual(
        expect.objectContaining({
          ok: false,
          reasonCode: "cleanup_confirmation_required",
          preview: expect.objectContaining({ auditLogs: 1 }),
        }),
      )
      const remaining = getDb().prepare("SELECT COUNT(*) AS count FROM audit_logs").get() as {
        count: number
      }
      expect(remaining.count).toBe(1)

      const explicitPreview = await app.inject({
        method: "GET",
        url: "/api/audit/cleanup-preview?before=2&purpose=security_review&scope=local_instance",
      })
      expect(explicitPreview.statusCode).toBe(200)
      expect(explicitPreview.json()).toEqual(
        expect.objectContaining({
          ok: true,
          preview: expect.objectContaining({ auditLogs: 1, deletableCount: 1, protectedCount: 0 }),
        }),
      )

      const preview = response.json().preview as { before: number; confirmationToken: string }
      insertTestAudit()
      const staleApply = await app.inject({
        method: "DELETE",
        url: `/api/audit?before=${preview.before}&confirm=${preview.confirmationToken}&purpose=security_review&scope=local_instance`,
      })
      expect(staleApply.statusCode).toBe(409)
      expect(staleApply.json()).toEqual(
        expect.objectContaining({ reasonCode: "cleanup_preview_stale" }),
      )

      const freshPreviewResponse = await app.inject({
        method: "DELETE",
        url: `/api/audit?before=${preview.before}&purpose=security_review&scope=local_instance`,
      })
      const freshPreview = freshPreviewResponse.json().preview as { confirmationToken: string }
      const apply = await app.inject({
        method: "DELETE",
        url: `/api/audit?before=${preview.before}&confirm=${freshPreview.confirmationToken}&purpose=security_review&scope=local_instance`,
      })
      expect(apply.statusCode).toBe(200)
      expect(apply.json()).toEqual(
        expect.objectContaining({
          ok: true,
          deleted: expect.objectContaining({ auditLogs: 2 }),
        }),
      )
      const afterApply = getDb().prepare("SELECT COUNT(*) AS count FROM audit_logs").get() as {
        count: number
      }
      expect(afterApply.count).toBe(0)
    } finally {
      await app.close()
    }
  })

  it("protects audit rows referenced by an existing run", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "knowbee-task1188-reference-"))
    tempDirs.push(stateDir)
    initializeTestDbRuntime(stateDir)
    insertSession({
      id: "session:protected",
      source: "webui",
      source_id: null,
      created_at: 1,
      updated_at: 1,
      summary: null,
    })
    createRootRun({
      id: "run:protected",
      sessionId: "session:protected",
      requestGroupId: "group:protected",
      prompt: "protected run",
      source: "webui",
    })
    insertTestAudit("run:protected")
    insertTestAudit()

    const app = Fastify({ logger: false })
    registerAuditRoute(app, auditMutationDependencies)
    await app.ready()
    try {
      const previewResponse = await app.inject({
        method: "DELETE",
        url: "/api/audit?before=2&purpose=security_review&scope=local_instance",
      })
      expect(previewResponse.statusCode).toBe(409)
      const preview = previewResponse.json().preview as {
        before: number
        confirmationToken: string
        protectedCount: number
        deletableCount: number
      }
      expect(preview).toEqual(expect.objectContaining({ protectedCount: 1, deletableCount: 1 }))

      const apply = await app.inject({
        method: "DELETE",
        url: `/api/audit?before=${preview.before}&confirm=${preview.confirmationToken}&purpose=security_review&scope=local_instance`,
      })
      expect(apply.statusCode).toBe(200)
      const rows = getDb().prepare("SELECT run_id FROM audit_logs ORDER BY run_id").all() as Array<{
        run_id: string | null
      }>
      expect(rows).toEqual([{ run_id: "run:protected" }])
    } finally {
      await app.close()
    }
  })
})
