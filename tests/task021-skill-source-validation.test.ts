import { mkdtempSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { evaluateSkillSourceValidation } from "../packages/core/src/capabilities/skill-source-validation.js"
import { inspectLocalSkillSource } from "../packages/core/src/capabilities/skill-source-filesystem.js"
import { registerCapabilitiesRoute } from "../packages/core/src/api/routes/capabilities.js"

describe("task021 skill source validation", () => {
  it("combines deterministic input and filesystem evidence without paths", () => {
    expect(evaluateSkillSourceValidation({ displayName: " Known ", sourceKind: "local", existingNames: ["known"], evidenceReasonCodes: ["skill_manifest_missing"] })).toEqual({
      ready: false,
      displayName: "Known",
      sourceKind: "local",
      reasonCodes: ["skill_name_duplicated", "skill_manifest_missing"],
    })
    expect(evaluateSkillSourceValidation({ displayName: "", sourceKind: "local", existingNames: [], evidenceReasonCodes: ["skill_path_unreadable", "skill_owner_mismatch"] }).reasonCodes).toEqual([
      "skill_name_missing", "skill_path_unreadable", "skill_owner_mismatch",
    ])
  })

  it("accepts a readable in-root SKILL.md and rejects traversal and symlink escape", () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-skill-root-"))
    const valid = join(root, "valid")
    mkdirSync(valid)
    writeFileSync(join(valid, "SKILL.md"), "# Skill\n", "utf8")
    expect(inspectLocalSkillSource({ requestedPath: valid, allowedRoots: [root] })).toMatchObject({ reasonCodes: [], canonicalPath: realpathSync(valid) })
    expect(inspectLocalSkillSource({ requestedPath: "", allowedRoots: [root] })).toEqual({ reasonCodes: ["skill_path_missing"] })
    expect(inspectLocalSkillSource({ requestedPath: "../escape", allowedRoots: [root] }).reasonCodes).toContain("skill_path_traversal")

    const outside = mkdtempSync(join(tmpdir(), "knowbee-skill-outside-"))
    writeFileSync(join(outside, "SKILL.md"), "# Outside\n", "utf8")
    expect(inspectLocalSkillSource({ requestedPath: outside, allowedRoots: [root] }).reasonCodes).toContain("skill_path_outside_root")
    const link = join(root, "linked")
    symlinkSync(outside, link)
    expect(inspectLocalSkillSource({ requestedPath: link, allowedRoots: [root] }).reasonCodes).toContain("skill_symlink_escape")
  })

  it("reports missing manifests and does not expose canonical paths", () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-skill-empty-"))
    const result = inspectLocalSkillSource({ requestedPath: root, allowedRoots: [root] })
    expect(result).toEqual({ reasonCodes: ["skill_manifest_missing"] })
    expect(JSON.stringify(result)).not.toContain(root)
  })

  it("registers an authenticated non-persisting endpoint and redacts adapter exceptions", async () => {
    const routeSource = readFileSync("packages/core/src/api/routes/capabilities.ts", "utf8")
    expect(routeSource).toMatch(/api\/capabilities\/skills\/validate[\s\S]*preHandler: authMiddleware/)
    const validationHandler = routeSource.slice(routeSource.indexOf('"/api/capabilities/skills/validate"'), routeSource.indexOf('"/api/capabilities/skills",', routeSource.indexOf('"/api/capabilities/skills/validate"')))
    expect(validationHandler).not.toMatch(/upsertSkillCatalogEntry/)
    const handlers = new Map<string, Function>()
    registerCapabilitiesRoute({
      get(path: string, _options: unknown, handler: Function) { handlers.set(`GET ${path}`, handler) },
      post(path: string, _options: unknown, handler: Function) { handlers.set(`POST ${path}`, handler) },
    } as never, {
      skillCatalogRepository: { listSkills: () => [], listBindings: () => [] },
      skillSourceInspector: () => { throw new Error("/private/secret/SKILL.md") },
      runtimeConfigForRequest: () => ({ profile: { workspace: "/workspace" }, security: { allowedPaths: [] } }),
    } as never)
    const state = { statusCode: 200 }
    const reply = { status(code: number) { state.statusCode = code; return this }, send(payload: unknown) { return payload } }
    expect(await handlers.get("POST /api/capabilities/skills/validate")?.({ body: { displayName: "New", sourceKind: "local", requestedPath: "/secret" } }, reply)).toEqual({ error: "skill_source_validation_failed" })
    expect(state.statusCode).toBe(500)
  })
})
