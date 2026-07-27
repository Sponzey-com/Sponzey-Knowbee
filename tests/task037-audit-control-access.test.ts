import { mkdtempSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { registerAuditRoute } from "../packages/core/src/api/routes/audit.ts"
import { registerControlTimelineRoute } from "../packages/core/src/api/routes/control-timeline.ts"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { closeDb } from "../packages/core/src/db/index.ts"
import {
  type AuditAccessPrincipal,
  type AuditAccessReceipt,
  createAuditAccessReceipt,
  decideAuditAccess,
} from "../packages/core/src/security/audit-access.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"
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

const stateDir = mkdtempSync(join(tmpdir(), "knowbee-task037-"))

beforeAll(() => {
  closeDb()
  initializeTestDbRuntime(stateDir)
})

afterAll(() => {
  closeDb()
  rmSync(stateDir, { recursive: true, force: true })
})

describe("Task037 Audit control access boundary", () => {
  it("denies developer projection when no explicit Audit authorizer is installed", async () => {
    const app = Fastify()
    registerControlTimelineRoute(app as never)

    const response = await app.inject({
      method: "GET",
      url: "/api/audit/control/timeline/export?audience=developer&format=json&runId=run-37&purpose=incident_review",
    })

    expect(response.statusCode, JSON.stringify(response.json())).toBe(403)
    expect(response.json()).toEqual({
      error: "audit_access_denied",
      reasonCode: "audit_principal_missing",
    })
    await app.close()
  })

  it("does not allow the public route to elevate through query aliases or headers", async () => {
    const app = Fastify()
    registerControlTimelineRoute(app as never)

    const response = await app.inject({
      method: "GET",
      url: "/api/control/timeline/export?audience=Developer&format=json&runId=run-37",
      headers: { "x-audit-audience": "developer", "x-audit-role": "administrator" },
    })

    expect(response.statusCode, JSON.stringify(response.json())).toBe(200)
    expect((response.json() as { export: { audience: string } }).export.audience).toBe("user")
    await app.close()
  })

  it.each([
    [null, "incident_review", "run-37", "audit_principal_missing"],
    [
      { principalRef: "user:1", role: "viewer", runIds: ["run-37"], requestGroupIds: [] },
      "incident_review",
      "run-37",
      "audit_role_denied",
    ],
    [
      { principalRef: "user:1", role: "audit_reader", runIds: ["run-37"], requestGroupIds: [] },
      "debug",
      "run-37",
      "audit_purpose_invalid",
    ],
    [
      { principalRef: "user:1", role: "audit_reader", runIds: ["run-37"], requestGroupIds: [] },
      "incident_review",
      undefined,
      "audit_scope_missing",
    ],
    [
      { principalRef: "user:1", role: "audit_reader", runIds: ["run-other"], requestGroupIds: [] },
      "incident_review",
      "run-37",
      "audit_scope_denied",
    ],
  ] as const)("denies invalid Audit access with %s", (principal, purpose, runId, reasonCode) => {
    expect(
      decideAuditAccess({
        principal: principal as AuditAccessPrincipal | null,
        purpose,
        operation: "view",
        ...(runId ? { runId } : {}),
      }),
    ).toEqual({ allowed: false, reasonCode })
  })

  it("allows an injected principal only for its exact scope and records a reference-only receipt", async () => {
    const app = Fastify()
    const receipts: AuditAccessReceipt[] = []
    registerControlTimelineRoute(app as never, {
      resolvePrincipal: () => ({
        principalRef: "operator:37",
        role: "audit_reader",
        runIds: ["run-37"],
        requestGroupIds: [],
      }),
      recordAccess: (receipt) => {
        receipts.push(receipt)
        return { recorded: true }
      },
      now: () => 37,
    })

    const response = await app.inject({
      method: "GET",
      url: "/api/audit/control/timeline/export?audience=developer&format=json&runId=run-37&purpose=incident_review",
    })

    expect(response.statusCode).toBe(200)
    expect((response.json() as { export: { audience: string } }).export.audience).toBe("developer")
    expect(receipts).toEqual([
      createAuditAccessReceipt(
        {
          principal: {
            principalRef: "operator:37",
            role: "audit_reader",
            runIds: ["run-37"],
            requestGroupIds: [],
          },
          purpose: "incident_review",
          operation: "export",
          runId: "run-37",
        },
        { allowed: true, reasonCode: "audit_access_allowed" },
        37,
      ),
    ])
    expect(JSON.stringify(receipts)).not.toMatch(/prompt|memory|evidence|secret|content/iu)
    await app.close()
  })

  it("versions and restricts explicit local-instance Audit scope receipts", () => {
    const principal: AuditAccessPrincipal = {
      principalRef: "operator:instance",
      role: "audit_reader",
      runIds: [],
      requestGroupIds: [],
      scopeRefs: ["instance:local"],
    }
    const allowed = decideAuditAccess({
      principal,
      purpose: "security_review",
      operation: "view",
      scopeRef: "instance:local",
    })
    const denied = decideAuditAccess({
      principal,
      purpose: "security_review",
      operation: "view",
      scopeRef: "instance:remote",
    })

    expect(allowed).toEqual({ allowed: true, reasonCode: "audit_access_allowed" })
    expect(denied).toEqual({ allowed: false, reasonCode: "audit_scope_denied" })
    expect(
      createAuditAccessReceipt(
        {
          principal,
          purpose: "security_review",
          operation: "view",
          scopeRef: "instance:local",
        },
        allowed,
        40,
      ),
    ).toMatchObject({
      schemaVersion: "audit-access-v2",
      scopeRef: "instance:local",
      runId: null,
      requestGroupId: null,
    })
  })

  it("binds a valid startup static-token authentication to the production Audit resolver", async () => {
    const runtime = createTestRuntimeConfigFixture({
      rootDir: join(stateDir, "runtime"),
      configText: JSON.stringify({
        webui: { auth: { enabled: true, token: "task038-secret-token" } },
      }),
    })
    const app = Fastify()
    installApiRuntimeConfig(app as never, runtime.config, runtime.paths)
    registerControlTimelineRoute(app as never)

    const response = await app.inject({
      method: "GET",
      url: "/api/audit/control/timeline/export?audience=developer&format=json&runId=run-38&purpose=security_review",
      headers: { authorization: "Bearer task038-secret-token" },
    })

    expect(response.statusCode).toBe(200)
    expect(JSON.stringify(response.json())).not.toContain("task038-secret-token")
    await app.close()
  })

  it("does not create an Audit principal from a query token or role headers", async () => {
    const runtime = createTestRuntimeConfigFixture({
      rootDir: join(stateDir, "query-runtime"),
      configText: JSON.stringify({
        webui: { auth: { enabled: true, token: "task038-query-token" } },
      }),
    })
    const app = Fastify()
    installApiRuntimeConfig(app as never, runtime.config, runtime.paths)
    registerControlTimelineRoute(app as never)

    const response = await app.inject({
      method: "GET",
      url: "/api/audit/control/timeline/export?audience=developer&format=json&runId=run-38&purpose=security_review&token=task038-query-token",
      headers: { "x-audit-role": "administrator" },
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({
      error: "audit_access_denied",
      reasonCode: "audit_principal_missing",
    })
    await app.close()
  })

  it("fails closed without projecting developer data when an allow receipt cannot be recorded", async () => {
    const app = Fastify()
    registerControlTimelineRoute(app as never, {
      resolvePrincipal: () => ({
        principalRef: "operator:39",
        role: "audit_reader",
        runIds: ["run-39"],
        requestGroupIds: [],
      }),
      recordAccess: () => {
        throw new Error("database failed at /Users/private/audit.db secret=value")
      },
    })

    const response = await app.inject({
      method: "GET",
      url: "/api/audit/control/timeline/export?audience=developer&format=json&runId=run-39&purpose=incident_review",
    })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({
      error: "audit_access_unavailable",
      reasonCode: "audit_access_record_failed",
    })
    expect(JSON.stringify(response.json())).not.toMatch(/Users|audit\.db|secret=value|export/iu)
    await app.close()
  })

  it("preserves the authorization deny reason when denial receipt storage is unavailable", async () => {
    const app = Fastify()
    registerControlTimelineRoute(app as never, {
      resolvePrincipal: () => null,
      recordAccess: () => {
        throw new Error("database unavailable")
      },
    })

    const response = await app.inject({
      method: "GET",
      url: "/api/audit/control/timeline?audience=developer&runId=run-39&purpose=incident_review",
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({
      error: "audit_access_denied",
      reasonCode: "audit_principal_missing",
    })
    await app.close()
  })

  it("denies a general Audit list when purpose and exact scope are absent", async () => {
    const runtime = createTestRuntimeConfigFixture({
      rootDir: join(stateDir, "general-list-runtime"),
      configText: JSON.stringify({
        webui: { auth: { enabled: true, token: "task040-list-token" } },
      }),
    })
    const app = Fastify()
    installApiRuntimeConfig(app as never, runtime.config, runtime.paths)
    registerAuditRoute(app as never)

    const response = await app.inject({
      method: "GET",
      url: "/api/audit",
      headers: { authorization: "Bearer task040-list-token" },
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({
      error: "audit_access_denied",
      reasonCode: "audit_purpose_invalid",
    })
    await app.close()
  })

  it("denies general Audit run export for a localhost bypass without a principal", async () => {
    const app = Fastify()
    registerAuditRoute(app as never)

    const response = await app.inject({
      method: "GET",
      url: "/api/audit/runs/run-40/export?format=json&purpose=quality_review",
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({
      error: "audit_access_denied",
      reasonCode: "audit_principal_missing",
    })
    await app.close()
  })

  it("allows scoped general Audit list and run export through the shared guard", async () => {
    const app = Fastify()
    const receipts: AuditAccessReceipt[] = []
    const dependencies = {
      resolvePrincipal: () => ({
        principalRef: "operator:40",
        role: "audit_reader",
        runIds: ["run-40"],
        requestGroupIds: [],
      }),
      recordAccess: (receipt: AuditAccessReceipt) => {
        receipts.push(receipt)
        return { recorded: true as const }
      },
      now: () => 40,
    }
    registerAuditRoute(app as never, dependencies)

    const list = await app.inject({
      method: "GET",
      url: "/api/audit?runId=run-40&purpose=quality_review",
    })
    const exported = await app.inject({
      method: "GET",
      url: "/api/audit/runs/run-40/export?format=json&purpose=quality_review",
    })

    expect(list.statusCode).toBe(200)
    expect(exported.statusCode).toBe(200)
    expect(receipts.map((receipt) => receipt.operation)).toEqual(["view", "export"])
    expect(receipts.every((receipt) => receipt.runId === "run-40")).toBe(true)
    await app.close()
  })

  it("does not render a general Audit export when its access receipt fails", async () => {
    const app = Fastify()
    registerAuditRoute(app as never, {
      resolvePrincipal: () => ({
        principalRef: "operator:40",
        role: "audit_reader",
        runIds: ["run-40"],
        requestGroupIds: [],
      }),
      recordAccess: () => {
        throw new Error("private audit storage failure")
      },
    })

    const response = await app.inject({
      method: "GET",
      url: "/api/audit/runs/run-40/export?format=json&purpose=quality_review",
    })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({
      error: "audit_access_unavailable",
      reasonCode: "audit_access_record_failed",
    })
    expect(JSON.stringify(response.json())).not.toMatch(/events|content|storage failure/iu)
    await app.close()
  })

  it("denies cleanup preview before scanning data for a localhost bypass", async () => {
    const app = Fastify()
    registerAuditRoute(app as never)

    const response = await app.inject({
      method: "GET",
      url: "/api/audit/cleanup-preview?all=true&purpose=security_review&scope=local_instance",
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({
      error: "audit_access_denied",
      reasonCode: "audit_principal_missing",
    })
    await app.close()
  })

  it("denies error-corpus promotion before disclosing whether the event exists", async () => {
    const app = Fastify()
    registerAuditRoute(app as never)

    const response = await app.inject({
      method: "POST",
      url: "/api/audit/events/private-event/promote-error-corpus?purpose=security_review&scope=local_instance",
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({
      error: "audit_access_denied",
      reasonCode: "audit_principal_missing",
    })
    await app.close()
  })

  it("keeps Audit mutations administrator-only with security-review purpose", () => {
    const scope = { runIds: [], requestGroupIds: [], scopeRefs: ["instance:local"] }
    expect(
      decideAuditAccess({
        principal: { principalRef: "reader:41", role: "audit_reader", ...scope },
        purpose: "security_review",
        operation: "cleanup_delete",
        scopeRef: "instance:local",
      }),
    ).toEqual({ allowed: false, reasonCode: "audit_operation_denied" })
    expect(
      decideAuditAccess({
        principal: { principalRef: "admin:41", role: "administrator", ...scope },
        purpose: "quality_review",
        operation: "promote_error_corpus",
        scopeRef: "instance:local",
      }),
    ).toEqual({ allowed: false, reasonCode: "audit_purpose_invalid" })
    expect(
      decideAuditAccess({
        principal: { principalRef: "admin:41", role: "administrator", ...scope },
        purpose: "security_review",
        operation: "cleanup_preview",
        scopeRef: "instance:local",
      }),
    ).toEqual({ allowed: true, reasonCode: "audit_access_allowed" })
  })

  it("does not scan cleanup candidates when mutation receipt storage fails", async () => {
    const app = Fastify()
    registerAuditRoute(app as never, {
      resolvePrincipal: () => ({
        principalRef: "admin:41",
        role: "administrator",
        runIds: [],
        requestGroupIds: [],
        scopeRefs: ["instance:local"],
      }),
      recordAccess: () => {
        throw new Error("private cleanup repository failure")
      },
    })

    const response = await app.inject({
      method: "GET",
      url: "/api/audit/cleanup-preview?all=true&purpose=security_review&scope=local_instance",
    })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({
      error: "audit_access_unavailable",
      reasonCode: "audit_access_record_failed",
    })
    expect(JSON.stringify(response.json())).not.toMatch(/preview|repository failure/iu)
    await app.close()
  })
})
