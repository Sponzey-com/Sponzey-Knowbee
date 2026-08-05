import { describe, expect, it } from "vitest"
import { createSkillMutationRequest, reduceSkillAddFlow } from "../packages/webui/src/lib/skill-add-flow.js"

describe("task024 skill add flow", () => {
  it("invalidates validation whenever the draft changes", () => {
    const ready = { state: "ready" as const, draft: { displayName: "UI", description: "", sourceKind: "local" as const, requestedPath: "/skill" }, reasonCodes: [] as string[] }
    expect(reduceSkillAddFlow(ready, { type: "draft_changed", patch: { displayName: "UI 2" } })).toMatchObject({ state: "editing", reasonCodes: [] })
  })

  it("allows saving only after successful validation", () => {
    const editing = { state: "editing" as const, draft: { displayName: "UI", description: "", sourceKind: "builtin" as const }, reasonCodes: [] as string[] }
    const validating = reduceSkillAddFlow(editing, { type: "validate" })
    expect(reduceSkillAddFlow(validating, { type: "validation_completed", ready: true, reasonCodes: [] }).state).toBe("ready")
    expect(() => reduceSkillAddFlow(editing, { type: "save" })).toThrow("skill_add_transition_invalid")
  })

  it("creates a fresh server-actor envelope without local path for builtin sources", () => {
    const request = createSkillMutationRequest({ draft: { displayName: "UI", description: "Review", sourceKind: "builtin" }, revision: 4, now: 100, randomId: (() => { const ids = ["mutation", "nonce"]; return () => ids.shift()! })() })
    expect(request).toEqual({ envelope: { scope: "capability:write", mutationId: "mutation", targetRevision: 5, purpose: "skill_create", issuedAt: 100, nonce: "nonce" }, draft: { displayName: "UI", description: "Review", sourceKind: "builtin" } })
    expect(JSON.stringify(request)).not.toContain("actorRef")
  })
})
