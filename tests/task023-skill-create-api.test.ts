import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { registerCapabilitiesRoute } from "../packages/core/src/api/routes/capabilities.js"
import { createRuntimePaths } from "../packages/core/src/config/paths.js"
import {
  closeDb,
  getDb,
  listAgentCapabilityBindings,
  listSkillCatalogEntries,
} from "../packages/core/src/db/index.js"

let stateRoot = ""

afterEach(() => {
  closeDb()
  if (stateRoot) rmSync(stateRoot, { recursive: true, force: true })
  stateRoot = ""
})

describe("task023 skill create API", () => {
  it("returns only the injected user receipt from an authenticated endpoint", async () => {
    const handlers = new Map<string, Function>()
    registerCapabilitiesRoute({ get() {}, post(path: string, _options: unknown, handler: Function) { handlers.set(path, handler) } } as never, {
      skillCatalogRepository: { listSkills: () => [], listBindings: () => [] },
      runtimeConfigForRequest: () => ({ profile: { workspace: "/workspace" }, security: { allowedPaths: [] } }),
      mutationActorForRequest: () => "user:self",
      skillCreateExecutor: async () => ({ mutationId: "m1", state: "active", reasonCode: null, allowedActions: [], revision: 1, skillRef: `skill_v1_${"a".repeat(24)}` }),
    } as never)
    const state = { statusCode: 200 }
    const reply = { status(code: number) { state.statusCode = code; return this }, send(payload: unknown) { return payload } }
    const body = { envelope: { actorRef: "user:self", scope: "capability:write", mutationId: "m1", targetRevision: 1, purpose: "skill_create", issuedAt: 1, nonce: "n1" }, draft: { displayName: "UI", description: "Review", sourceKind: "builtin" } }
    const result = await handlers.get("/api/capabilities/skills")?.({ body }, reply)
    expect(state.statusCode).toBe(201)
    expect(result).toMatchObject({ state: "active", skillRef: `skill_v1_${"a".repeat(24)}` })
    expect(JSON.stringify(result)).not.toMatch(/nonce|actorRef|internal|canonicalPath/)
  })

  it("derives the actor from the authenticated principal instead of trusting the body", async () => {
    const handlers = new Map<string, Function>()
    let observedActor = ""
    registerCapabilitiesRoute({ get() {}, post(path: string, _options: unknown, handler: Function) { handlers.set(path, handler) } } as never, {
      skillCatalogRepository: { listSkills: () => [], listBindings: () => [] },
      mutationActorForRequest: () => "api:owner",
      runtimeConfigForRequest: () => ({ profile: { workspace: "/workspace" }, security: { allowedPaths: [] } }),
      skillCreateExecutor: async (input) => { observedActor = input.envelope.actorRef; return { mutationId: "m1", state: "active", reasonCode: null, allowedActions: [], revision: 1, skillRef: `skill_v1_${"a".repeat(24)}` } },
    })
    const state = { statusCode: 200 }
    const reply = { status(code: number) { state.statusCode = code; return this }, send(payload: unknown) { return payload } }
    const body = { envelope: { actorRef: "spoofed", scope: "capability:write", mutationId: "m1", targetRevision: 1, purpose: "skill_create", issuedAt: 1, nonce: "n1" }, draft: { displayName: "UI", description: "", sourceKind: "builtin" } }
    expect(await handlers.get("/api/capabilities/skills")?.({ body }, reply)).toMatchObject({ state: "active" })
    expect(observedActor).toBe("api:owner")
    expect(state.statusCode).toBe(201)
  })

  it("persists a new local SKILL.md with an explicit instruction Skill kind", async () => {
    stateRoot = mkdtempSync(join(tmpdir(), "knowbee-skill-kind-"))
    const paths = createRuntimePaths(
      { KNOWBEE_STATE_DIR: stateRoot },
      { homeDir: stateRoot, exists: () => false },
    )
    getDb({ paths })
    const currentRevision = Math.max(
      listSkillCatalogEntries({ includeArchived: true }).reduce(
        (revision, row) => Math.max(revision, row.updated_at),
        0,
      ),
      listAgentCapabilityBindings({ capabilityKind: "skill", includeArchived: true }).reduce(
        (revision, row) => Math.max(revision, row.updated_at),
        0,
      ),
    )
    const targetRevision = currentRevision + 1
    const handlers = new Map<string, Function>()
    registerCapabilitiesRoute(
      {
        get() {},
        post(path: string, _options: unknown, handler: Function) {
          handlers.set(path, handler)
        },
      } as never,
      {
        mutationActorForRequest: () => "user:self",
        now: () => targetRevision,
        skillSourceInspector: () => ({
          reasonCodes: [],
          canonicalPath: "/skills/local/SKILL.md",
        }),
        runtimeConfigForRequest: () => ({
          profile: { workspace: "/workspace" },
          security: { allowedPaths: [] },
        }),
      } as never,
    )
    const reply = {
      status() {
        return this
      },
      send(payload: unknown) {
        return payload
      },
    }
    await handlers.get("/api/capabilities/skills")?.(
      {
        body: {
          envelope: {
            actorRef: "ignored",
            scope: "capability:write",
            mutationId: "kind-create",
            targetRevision,
            purpose: "skill_create",
            issuedAt: targetRevision,
            nonce: "kind-create-nonce",
          },
          draft: {
            displayName: "Local Guidance",
            description: "Use local guidance",
            sourceKind: "local",
            requestedPath: "/requested",
          },
        },
      },
      reply,
    )

    const row = listSkillCatalogEntries({ includeArchived: true }).find(
      (entry) => entry.display_name === "Local Guidance",
    )
    expect(JSON.parse(row?.metadata_json ?? "{}")).toMatchObject({
      skillKind: "instruction_skill",
      sourceKind: "local",
      canonicalPath: "/skills/local/SKILL.md",
    })
  })

  it("keeps auth and three log purposes explicit", () => {
    const source = readFileSync("packages/core/src/api/routes/capabilities.ts", "utf8")
    expect(source).toMatch(/api\/capabilities\/skills"[\s\S]*preHandler: authMiddleware/)
    expect(source).toContain("capabilityLogger.product")
    expect(source).toContain("capabilityLogger.fieldDebug")
    expect(source).toContain("capabilityLogger.development")
    expect(source).not.toMatch(/process\.env/)
  })
})
