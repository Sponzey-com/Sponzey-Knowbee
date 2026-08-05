import { createRequire } from "node:module"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerAuditRoute } from "../packages/core/src/api/routes/audit.ts"
import type { AuditAccessReceipt } from "../packages/core/src/security/audit-access.ts"
import { closeDb, insertAuditLog, insertDiagnosticEvent, insertSession } from "../packages/core/src/db/index.js"
import { appendRunEvent, createRootRun } from "../packages/core/src/runs/store.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const require = createRequire(import.meta.url)
const Fastify = require("../packages/core/node_modules/fastify") as () => {
  close(): Promise<void>
  inject(options: { method: string; url: string; headers?: Record<string, string> }): Promise<{
    statusCode: number
    json(): unknown
  }>
}

const tempDirs: string[] = []

function useTempState(): void {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-task083-audit-route-"))
  tempDirs.push(stateDir)
  initializeTestDbRuntime(stateDir)
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

describe("task083 audit route internal evidence redaction", () => {
  it("keeps Yeonjang internal evidence out of general run timeline and export responses", async () => {
    insertSession({
      id: "session-task083",
      source: "webui",
      source_id: "webui-task083",
      created_at: 83_000,
      updated_at: 83_000,
      summary: null,
    })
    createRootRun({
      id: "run-task083",
      sessionId: "session-task083",
      requestGroupId: "group-task083",
      prompt: "click and verify",
      source: "webui",
    })
    appendRunEvent(
      "run-task083",
      "yeonjang-goal-validation:mouse_click:candidate_not_validated:result_diagnosis_not_sufficient operationId=operation:run-event receipt payload raw observed state",
    )
    insertDiagnosticEvent({
      kind: "yeonjang_goal_validation_failed",
      summary:
        "diagnosis failed yeonjang-goal-validation:mouse_click:candidate_not_validated:result_diagnosis_not_sufficient operationId=operation:diagnostic raw observed state",
      runId: "run-task083",
      sessionId: "session-task083",
      requestGroupId: "group-task083",
      detail: {
        publicReason: "goal validation was not sufficient",
        evidence:
          "operation:diagnostic-detail receipt payload structured diagnosis payload DB row",
      },
    })
    const auditEventId = insertAuditLog({
      timestamp: 83_100,
      session_id: "session-task083",
      run_id: "run-task083",
      request_group_id: "group-task083",
      channel: "webui",
      source: "agent",
      tool_name: "mouse_click",
      params: JSON.stringify({
        target: "tool:mouse_click:side-effect-goal",
        operationId: "operation:audit-param",
        evidence:
          "yeonjang-goal-validation:mouse_click:candidate_not_validated:result_diagnosis_not_sufficient receipt payload",
      }),
      output:
        "result includes operation:tool-output raw observed state structured diagnosis payload",
      result: "failed",
      duration_ms: 5,
      approval_required: 1,
      approved_by: "operator:task083",
      error_code: "yeonjang-goal-validation:mouse_click",
      retry_count: 0,
      stop_reason: "operationId=operation:stop-reason",
    })

    const receipts: AuditAccessReceipt[] = []
    const app = Fastify()
    registerAuditRoute(app as never, {
      resolvePrincipal: () => ({
        principalRef: "operator:task083",
        role: "audit_reader",
        runIds: ["run-task083"],
        requestGroupIds: ["group-task083"],
      }),
      recordAccess: (receipt) => {
        receipts.push(receipt)
        return { recorded: true }
      },
      now: () => 83_123,
    })

    const timeline = await app.inject({
      method: "GET",
      url: "/api/audit/runs/run-task083/timeline?purpose=security_review&limit=20",
    })
    const exported = await app.inject({
      method: "GET",
      url: "/api/audit/runs/run-task083/export?format=json&purpose=security_review&limit=20",
    })
    const raw = await app.inject({
      method: "GET",
      url: `/api/audit/events/${auditEventId}/raw?purpose=security_review`,
    })

    expect(timeline.statusCode).toBe(200)
    expect(exported.statusCode).toBe(200)
    const publicSerialized = `${JSON.stringify(timeline.json())}\n${JSON.stringify(exported.json())}`
    expect(publicSerialized).toContain("[internal-evidence-redacted]")
    expect(publicSerialized).not.toContain("yeonjang-goal-validation")
    expect(publicSerialized).not.toContain("operationId")
    expect(publicSerialized).not.toContain("operation:audit-param")
    expect(publicSerialized).not.toContain("operation:run-event")
    expect(publicSerialized).not.toContain("operation:diagnostic")
    expect(publicSerialized).not.toContain("receipt payload")
    expect(publicSerialized).not.toContain("raw observed state")
    expect(publicSerialized).not.toContain("structured diagnosis payload")
    expect(publicSerialized).not.toContain("DB row")

    expect(raw.statusCode).toBe(200)
    const rawSerialized = JSON.stringify(raw.json())
    expect(rawSerialized).toContain("operation:audit-param")
    expect(rawSerialized).toContain("yeonjang-goal-validation:mouse_click")
    expect(rawSerialized).toContain("raw observed state")
    expect(receipts.map((receipt) => receipt.operation)).toEqual(["view", "export", "export"])
    await app.close()
  })
})
