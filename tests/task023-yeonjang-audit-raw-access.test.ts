import { createRequire } from "node:module"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerAuditRoute, listAuditEvents } from "../packages/core/src/api/routes/audit.ts"
import type { AuditAccessReceipt } from "../packages/core/src/security/audit-access.ts"
import { closeDb, insertAuditLog } from "../packages/core/src/db/index.js"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const require = createRequire(import.meta.url)
const Fastify = require("../packages/core/node_modules/fastify") as () => {
  close(): Promise<void>
  inject(options: {
    method: string
    url: string
    headers?: Record<string, string>
  }): Promise<{ statusCode: number; json(): unknown }>
}

const tempDirs: string[] = []

function useTempState(): void {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-task023-audit-raw-"))
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

describe("task023 Yeonjang Audit-only raw access", () => {
  it("keeps general audit redacted and exposes raw event fields only through authorized Audit raw route", async () => {
    const eventId = insertAuditLog({
      timestamp: 23_000,
      session_id: "session-task023",
      run_id: "run-task023",
      request_group_id: "group-task023",
      channel: "telegram",
      source: "agent",
      tool_name: "yeonjang_camera_capture",
      params: JSON.stringify({
        targetRef: "yeonjang-main",
        rawPayload: { base64_data: "do-not-show-in-list" },
        accessToken: "secret-token-task023",
      }),
      output: "raw camera output do-not-show-in-list",
      result: "success",
      duration_ms: 12,
      approval_required: 1,
      approved_by: "operator:task023",
      error_code: null,
    })

    const listed = listAuditEvents({ runId: "run-task023", limit: "10" })
    expect(JSON.stringify(listed)).not.toContain("do-not-show-in-list")
    expect(JSON.stringify(listed)).not.toContain("secret-token-task023")

    const receipts: AuditAccessReceipt[] = []
    const app = Fastify()
    registerAuditRoute(app as never, {
      resolvePrincipal: () => ({
        principalRef: "operator:task023",
        role: "audit_reader",
        runIds: ["run-task023"],
        requestGroupIds: [],
      }),
      recordAccess: (receipt) => {
        receipts.push(receipt)
        return { recorded: true }
      },
      now: () => 23_123,
    })

    const missingPurpose = await app.inject({
      method: "GET",
      url: `/api/audit/events/${eventId}/raw`,
    })
    expect(missingPurpose.statusCode).toBe(403)
    expect(missingPurpose.json()).toEqual({
      error: "audit_access_denied",
      reasonCode: "audit_purpose_invalid",
    })

    const raw = await app.inject({
      method: "GET",
      url: `/api/audit/events/${eventId}/raw?purpose=security_review`,
    })

    expect(raw.statusCode).toBe(200)
    expect(raw.json()).toMatchObject({
      ok: true,
      event: {
        id: eventId,
        kind: "tool_call",
        visibility: "audit_only",
        runId: "run-task023",
        requestGroupId: "group-task023",
        toolName: "yeonjang_camera_capture",
      },
    })
    expect(raw.json().event.paramsRaw).toContain("do-not-show-in-list")
    expect(raw.json().event.paramsRaw).toContain("secret-token-task023")
    expect(raw.json().event.outputRaw).toContain("do-not-show-in-list")
    expect(receipts.map((receipt) => receipt.operation)).toEqual(["export", "export"])
    expect(receipts.every((receipt) => receipt.runId === "run-task023")).toBe(true)
    await app.close()
  })

  it("denies Audit raw route when the principal is outside the event run scope", async () => {
    const eventId = insertAuditLog({
      timestamp: 23_500,
      session_id: "session-task023-denied",
      run_id: "run-task023-denied",
      request_group_id: "group-task023-denied",
      channel: "webui",
      source: "agent",
      tool_name: "yeonjang_file_read",
      params: JSON.stringify({ path: "/Users/private/file.txt", rawPayload: "do-not-show" }),
      output: "private file content do-not-show",
      result: "success",
      duration_ms: 3,
      approval_required: 0,
      approved_by: null,
      error_code: null,
    })

    const app = Fastify()
    registerAuditRoute(app as never, {
      resolvePrincipal: () => ({
        principalRef: "operator:outside",
        role: "audit_reader",
        runIds: ["other-run"],
        requestGroupIds: [],
      }),
      recordAccess: () => ({ recorded: true }),
    })

    const response = await app.inject({
      method: "GET",
      url: `/api/audit/events/${eventId}/raw?purpose=security_review`,
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({
      error: "audit_access_denied",
      reasonCode: "audit_scope_denied",
    })
    expect(JSON.stringify(response.json())).not.toContain("do-not-show")
    await app.close()
  })
})
