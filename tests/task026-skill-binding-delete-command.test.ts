import { describe, expect, it } from "vitest"
import { executeSkillBindingCommand, type SkillBindingCommandPorts } from "../packages/core/src/capabilities/skill-binding-command.js"
import { executeSkillDeleteCommand, type SkillDeleteCommandPorts } from "../packages/core/src/capabilities/skill-delete-command.js"

const envelope = (purpose: string, overrides = {}) => ({ actorRef: "user:1", scope: "capability:write", mutationId: "m1", targetRevision: 8, purpose, issuedAt: 100, nonce: "n1", ...overrides })
const common = { now: () => 100, currentRevision: () => 7, nonceUsed: () => false, reserveReceipt: () => true, updateReceipt: () => undefined }

function bindingPorts(overrides: Partial<SkillBindingCommandPorts> = {}): SkillBindingCommandPorts {
  return { ...common, resolveSkill: () => ({ internalSkillId: "s1", active: true }), resolveAgent: () => ({ internalAgentId: "a1", name: "Analyst" }), bindingEnabled: () => false, persist: () => ({ ok: true, revision: 8 }), verify: () => ({ ok: true }), rollback: () => ({ ok: true }), ...overrides }
}

function deletePorts(overrides: Partial<SkillDeleteCommandPorts> = {}): SkillDeleteCommandPorts {
  return { ...common, resolveSkill: () => ({ internalSkillId: "s1", skillRef: "skill-public", displayName: "UI", description: "Review", sourceKind: "local", runtimeStatus: "inactive", revision: 7 }), boundAgentNames: () => [], persistArchive: () => ({ ok: true, revision: 8 }), verifyArchived: () => ({ ok: true }), rollback: () => ({ ok: true }), ...overrides }
}

describe("task026 skill binding and delete commands", () => {
  it("binds and unbinds through explicit purposes", async () => {
    let status = ""
    const bind = await executeSkillBindingCommand({ envelope: envelope("skill_bind"), skillRef: "skill-public", agentRef: "agent-public", action: "bind" }, bindingPorts({ persist: (input) => { status = input.enabled ? "enabled" : "archived"; return { ok: true, revision: 8 } } }))
    expect(bind).toMatchObject({ state: "active", bound: true, revision: 8 })
    expect(status).toBe("enabled")
    const unbind = await executeSkillBindingCommand({ envelope: envelope("skill_unbind"), skillRef: "skill-public", agentRef: "agent-public", action: "unbind" }, bindingPorts({ bindingEnabled: () => true }))
    expect(unbind).toMatchObject({ state: "active", bound: false })
  })

  it("returns idempotent binding receipts without increasing revision", async () => {
    let writes = 0
    const result = await executeSkillBindingCommand({ envelope: envelope("skill_bind"), skillRef: "skill-public", agentRef: "agent-public", action: "bind" }, bindingPorts({ bindingEnabled: () => true, persist: () => { writes += 1; return { ok: true, revision: 8 } } }))
    expect(result).toMatchObject({ state: "active", revision: 7, bound: true })
    expect(writes).toBe(0)
  })

  it("rejects stale/replayed and unknown binding targets", async () => {
    expect((await executeSkillBindingCommand({ envelope: envelope("skill_bind", { targetRevision: 9 }), skillRef: "s", agentRef: "a", action: "bind" }, bindingPorts())).reasonCode).toBe("mutation_revision_conflict")
    expect((await executeSkillBindingCommand({ envelope: envelope("skill_bind"), skillRef: "s", agentRef: "a", action: "bind" }, bindingPorts({ nonceUsed: () => true }))).reasonCode).toBe("mutation_nonce_replayed")
    expect((await executeSkillBindingCommand({ envelope: envelope("skill_bind"), skillRef: "s", agentRef: "a", action: "bind" }, bindingPorts({ resolveAgent: () => null }))).reasonCode).toBe("agent_ref_not_found")
  })

  it("preserves adapter persistence reasons without running verification", async () => {
    let verified = false
    const binding = await executeSkillBindingCommand({ envelope: envelope("skill_bind"), skillRef: "skill-public", agentRef: "agent-public", action: "bind" }, bindingPorts({
      persist: () => ({ ok: false, revision: 7, reasonCode: "skill_binding_write_failed" }),
      verify: () => { verified = true; return { ok: true } },
    }))
    expect(binding).toMatchObject({ state: "failed", reasonCode: "skill_binding_write_failed", revision: 7, bound: false })
    expect(verified).toBe(false)

    const deletion = await executeSkillDeleteCommand({ envelope: envelope("skill_delete"), skillRef: "skill-public" }, deletePorts({ persistArchive: () => ({ ok: false, revision: 7, reasonCode: "skill_archive_write_failed" }) }))
    expect(deletion).toMatchObject({ state: "failed", reasonCode: "skill_archive_write_failed", revision: 7, deleted: false })
  })

  it("blocks deletion in use and returns only user-facing impact", async () => {
    let archived = false
    const result = await executeSkillDeleteCommand({ envelope: envelope("skill_delete"), skillRef: "skill-public" }, deletePorts({ boundAgentNames: () => ["Writer", "Analyst"], persistArchive: () => { archived = true; return { ok: true, revision: 8 } } }))
    expect(result).toMatchObject({ state: "rejected", reasonCode: "skill_delete_in_use", impact: { bindingCount: 2, agentNames: ["Analyst", "Writer"] } })
    expect(archived).toBe(false)
    expect(JSON.stringify(result)).not.toMatch(/internal|agent_id|s1/)
  })

  it("rejects built-in definition deletion before impact lookup or persistence", async () => {
    let impactRead = false
    let archived = false
    const result = await executeSkillDeleteCommand({
      envelope: envelope("skill_delete"),
      skillRef: "skill-public",
    }, deletePorts({
      resolveSkill: () => ({
        internalSkillId: "skill:web-research",
        skillRef: "skill-public",
        displayName: "Web research",
        description: "",
        sourceKind: "builtin",
        runtimeStatus: "active",
        revision: 7,
      }),
      boundAgentNames: () => {
        impactRead = true
        return []
      },
      persistArchive: () => {
        archived = true
        return { ok: true, revision: 8 }
      },
    }))

    expect(result).toMatchObject({
      state: "rejected",
      reasonCode: "skill_builtin_definition_immutable",
      deleted: false,
    })
    expect(impactRead).toBe(false)
    expect(archived).toBe(false)
  })

  it("archives unused skills and rolls back verification failure", async () => {
    expect(await executeSkillDeleteCommand({ envelope: envelope("skill_delete"), skillRef: "skill-public" }, deletePorts())).toMatchObject({ state: "active", revision: 8, deleted: true })
    const rollback = await executeSkillDeleteCommand({ envelope: envelope("skill_delete"), skillRef: "skill-public" }, deletePorts({ verifyArchived: () => ({ ok: false, reasonCode: "skill_delete_not_visible" }) }))
    expect(rollback).toMatchObject({ state: "rolled_back", reasonCode: "skill_delete_not_visible", deleted: false, revision: 7 })
  })
})
