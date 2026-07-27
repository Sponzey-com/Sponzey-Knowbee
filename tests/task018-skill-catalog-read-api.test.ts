import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { buildSkillCatalogPage } from "../packages/core/src/capabilities/skill-catalog-query.js"
import { registerCapabilitiesRoute } from "../packages/core/src/api/routes/capabilities.js"

describe("task018 skill catalog read API", () => {
  const rows = [
    { skill_id: "internal-1", status: "enabled" as const, display_name: "UI UX Pro Max", metadata_json: JSON.stringify({ description: "UI review", sourceKind: "local", absolutePath: "/private", instruction: "hidden" }), updated_at: 4 },
    { skill_id: "internal-2", status: "disabled" as const, display_name: "Writer", metadata_json: null, updated_at: 3 },
  ]
  const bindings = [{ catalog_id: "internal-1", status: "enabled" as const }, { catalog_id: "internal-1", status: "disabled" as const }]
  const publicRefForSkillId = (skillId: string) => `skill_v1_${(skillId === "internal-1" ? "1" : "2").repeat(24)}`

  it("builds a paginated redacted projection with binding counts", () => {
    expect(buildSkillCatalogPage({ rows, bindings, query: { limit: 1, search: "ui", boundOnly: true }, observedAt: 1000, publicRefForSkillId })).toEqual({
      items: [{ skillRef: `skill_v1_${"1".repeat(24)}`, displayName: "UI UX Pro Max", description: "UI review", sourceKind: "local", validationStatus: "valid", runtimeStatus: "active", bindingCount: 1, revision: 4 }],
      nextCursor: null, revision: 4, observedAt: 1000,
    })
  })

  it("uses an opaque offset cursor and validates limits", () => {
    const first = buildSkillCatalogPage({ rows, bindings, query: { limit: 1 }, observedAt: 1000, publicRefForSkillId })
    expect(first.nextCursor).toBe("v1:1")
    expect(buildSkillCatalogPage({ rows, bindings, query: { limit: 1, cursor: first.nextCursor! }, observedAt: 1000, publicRefForSkillId }).items[0]?.displayName).toBe("Writer")
    expect(() => buildSkillCatalogPage({ rows, bindings, query: { limit: 101 }, observedAt: 1000, publicRefForSkillId })).toThrow("skill_catalog_limit_invalid")
  })

  it("registers an authenticated endpoint and a signal-aware WebUI adapter", () => {
    const route = readFileSync("packages/core/src/api/routes/capabilities.ts", "utf8")
    expect(route).toContain('"/api/capabilities/skills"')
    expect(route).toMatch(/\/api\/capabilities\/skills[\s\S]*preHandler: authMiddleware/)
    const local = readFileSync("packages/webui/src/api/adapters/local.ts", "utf8")
    expect(local).toContain("request<SkillCatalogPageResponse>(")
    expect(local).toContain("`/api/capabilities/skills${")
    expect(local).toContain("signal")
  })

  it("rejects an ambiguous bound filter instead of coercing it to false", async () => {
    const handlers = new Map<string, Function>()
    registerCapabilitiesRoute({ get(path: string, _options: unknown, handler: Function) { handlers.set(path, handler) }, post() {} } as never, {
      skillCatalogRepository: { listSkills: () => rows, listBindings: () => bindings },
    })
    const state = { statusCode: 200 }
    const reply = {
      status(code: number) { state.statusCode = code; return this },
      send(payload: unknown) { return payload },
    }

    expect(await handlers.get("/api/capabilities/skills")?.({ query: { bound: "yes" } }, reply)).toEqual({ error: "skill_catalog_bound_invalid" })
    expect(state.statusCode).toBe(400)
  })

  it("serves injected repository data and redacts repository failures", async () => {
    const handlers = new Map<string, Function>()
    const app = { get(path: string, _options: unknown, handler: Function) { handlers.set(path, handler) }, post() {} }
    registerCapabilitiesRoute(app as never, {
      skillCatalogRepository: { listSkills: () => rows, listBindings: () => bindings },
      now: () => 1000,
    })
    const reply = () => {
      const state = { statusCode: 200 }
      return {
        state,
        api: {
          status(code: number) { state.statusCode = code; return this },
          send(payload: unknown) { return payload },
        },
      }
    }
    const okReply = reply()
    const ok = await handlers.get("/api/capabilities/skills")?.({ query: { limit: "1" } }, okReply.api)
    expect(okReply.state.statusCode).toBe(200)
    expect(ok).toMatchObject({ observedAt: 1000, items: [{ displayName: "UI UX Pro Max" }] })

    const failedHandlers = new Map<string, Function>()
    registerCapabilitiesRoute({ get(path: string, _options: unknown, handler: Function) { failedHandlers.set(path, handler) }, post() {} } as never, {
      skillCatalogRepository: { listSkills: () => { throw new Error("private db path") }, listBindings: () => [] },
    })
    const failedReply = reply()
    expect(await failedHandlers.get("/api/capabilities/skills")?.({ query: {} }, failedReply.api)).toEqual({ error: "skill_catalog_read_failed" })
    expect(failedReply.state.statusCode).toBe(500)
  })
})
