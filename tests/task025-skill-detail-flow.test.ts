import { describe, expect, it } from "vitest"
import { createSkillUpdateRequest, initialSkillDetailFlow, reduceSkillDetailFlow } from "../packages/webui/src/lib/skill-detail-flow.js"

describe("task025 skill detail flow", () => {
  it("uses explicit view, edit, saving, and failure transitions", () => {
    const viewing = initialSkillDetailFlow({ displayName: "UI", description: "Review" })
    const editing = reduceSkillDetailFlow(viewing, { type: "edit" })
    const saving = reduceSkillDetailFlow(editing, { type: "save" })
    expect([viewing.state, editing.state, saving.state]).toEqual(["viewing", "editing", "saving"])
    expect(reduceSkillDetailFlow(saving, { type: "save_failed", reasonCode: "mutation_revision_conflict" })).toMatchObject({ state: "failed", reasonCode: "mutation_revision_conflict" })
  })

  it("restores the current projection when editing is cancelled", () => {
    const editing = reduceSkillDetailFlow(initialSkillDetailFlow({ displayName: "UI", description: "Review" }), { type: "edit" })
    const changed = reduceSkillDetailFlow(editing, { type: "draft_changed", patch: { displayName: "Changed" } })
    expect(reduceSkillDetailFlow(changed, { type: "cancel", projection: { displayName: "UI", description: "Latest" } })).toEqual({ state: "viewing", draft: { displayName: "UI", description: "Latest" }, reasonCode: null })
  })

  it("creates a fresh update envelope without actor, source, or internal identifiers", () => {
    const ids = ["mutation", "nonce"]
    const request = createSkillUpdateRequest({ change: { displayName: "UI Pro", description: "Updated" }, revision: 7, now: 100, randomId: () => ids.shift()! })
    expect(request).toEqual({ envelope: { scope: "capability:write", mutationId: "mutation", targetRevision: 8, purpose: "skill_update", issuedAt: 100, nonce: "nonce" }, change: { displayName: "UI Pro", description: "Updated" } })
    expect(JSON.stringify(request)).not.toMatch(/actor|source|internal|path/)
  })
})
