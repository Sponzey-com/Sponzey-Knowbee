import { describe, expect, it } from "vitest"
import { buildSkillCatalogPage } from "../packages/core/src/capabilities/skill-catalog-query.js"
import { createSkillPublicRef } from "../packages/core/src/capabilities/skill-public-reference.js"
import { registerCapabilitiesRoute } from "../packages/core/src/api/routes/capabilities.js"
import { projectSkillCatalogItem } from "../packages/webui/src/lib/skill-catalog-contract.js"

describe("task019 skill public reference", () => {
  const rows = [
    { skill_id: "internal-1", status: "enabled" as const, display_name: "UI UX", metadata_json: null, updated_at: 1 },
    { skill_id: "internal-2", status: "disabled" as const, display_name: "Writer", metadata_json: null, updated_at: 2 },
  ]

  it("creates a stable opaque reference without disclosing the internal id", () => {
    const first = createSkillPublicRef("internal-1")
    expect(first).toMatch(/^skill_v1_[a-f0-9]{24}$/)
    expect(createSkillPublicRef("internal-1")).toBe(first)
    expect(first).not.toContain("internal")
    expect(createSkillPublicRef("internal-2")).not.toBe(first)
    expect(() => createSkillPublicRef("   ")).toThrow("skill_public_ref_source_invalid")
  })

  it("fails closed with a redacted server error when references collide", async () => {
    const handlers = new Map<string, Function>()
    registerCapabilitiesRoute({ get(path: string, _options: unknown, handler: Function) { handlers.set(path, handler) }, post() {} } as never, {
      skillCatalogRepository: { listSkills: () => rows, listBindings: () => [] },
      skillPublicRefForId: () => `skill_v1_${"a".repeat(24)}`,
    })
    const state = { statusCode: 200 }
    const reply = {
      status(code: number) { state.statusCode = code; return this },
      send(payload: unknown) { return payload },
    }
    expect(await handlers.get("/api/capabilities/skills")?.({ query: {} }, reply)).toEqual({ error: "skill_catalog_read_failed" })
    expect(state.statusCode).toBe(500)
  })

  it("requires valid unique references from the explicit projection port", () => {
    const base = { rows, bindings: [], query: {}, observedAt: 10 }
    expect(() => buildSkillCatalogPage({ ...base, publicRefForSkillId: () => "invalid" })).toThrow("skill_public_ref_invalid")
    expect(() => buildSkillCatalogPage({ ...base, publicRefForSkillId: () => `skill_v1_${"a".repeat(24)}` })).toThrow("skill_public_ref_collision")
  })

  it("projects skillRef to WebUI while dropping internal and raw fields", () => {
    const skillRef = createSkillPublicRef("internal-1")
    expect(projectSkillCatalogItem({
      skillRef,
      internalId: "internal-1",
      displayName: "UI UX",
      description: "Review",
      sourceKind: "local",
      validationStatus: "valid",
      runtimeStatus: "active",
      bindingCount: 1,
      revision: 1,
      rawMetadata: { path: "/private" },
    })).toEqual({ skillRef, displayName: "UI UX", description: "Review", sourceKind: "local", validationStatus: "valid", runtimeStatus: "active", bindingCount: 1, revision: 1 })
  })
})
