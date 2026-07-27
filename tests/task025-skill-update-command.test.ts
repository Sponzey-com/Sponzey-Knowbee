import { describe, expect, it } from "vitest"
import { executeSkillUpdateCommand, type SkillUpdateCommandPorts } from "../packages/core/src/capabilities/skill-update-command.js"

const envelope = (overrides = {}) => ({ actorRef: "user:1", scope: "capability:write", mutationId: "m1", targetRevision: 8, purpose: "skill_update", issuedAt: 100, nonce: "n1", ...overrides })
const snapshot = { internalSkillId: "internal-1", skillRef: `skill_v1_${"a".repeat(24)}`, displayName: "UI", description: "Review", sourceKind: "local" as const, runtimeStatus: "active" as const, revision: 7 }

function ports(overrides: Partial<SkillUpdateCommandPorts> = {}): SkillUpdateCommandPorts {
  return {
    now: () => 100,
    currentRevision: () => 7,
    nonceUsed: () => false,
    reserveReceipt: () => true,
    updateReceipt: () => undefined,
    resolveSkill: () => snapshot,
    existingNames: () => [{ internalSkillId: "internal-1", displayName: "UI" }],
    persist: () => ({ ok: true, revision: 8 }),
    apply: () => ({ ok: true }),
    verify: () => ({ ok: true }),
    rollback: () => ({ ok: true }),
    ...overrides,
  }
}

describe("task025 skill update command", () => {
  it("updates user metadata without allowing source replacement", async () => {
    let persisted: unknown
    const result = await executeSkillUpdateCommand({ envelope: envelope(), skillRef: snapshot.skillRef, change: { displayName: " UI Pro ", description: "Updated" } }, ports({ persist: (input) => { persisted = input; return { ok: true, revision: 8 } } }))
    expect(result).toMatchObject({ state: "active", revision: 8, skillRef: snapshot.skillRef })
    expect(persisted).toMatchObject({ internalSkillId: "internal-1", displayName: "UI Pro", description: "Updated", runtimeStatus: "active" })
    expect(JSON.stringify(persisted)).not.toContain("sourceKind")
  })

  it("rejects empty and duplicate names before persistence", async () => {
    let writes = 0
    const duplicatePorts = ports({
      existingNames: () => [{ internalSkillId: "internal-2", displayName: "Known" }],
      persist: () => { writes += 1; return { ok: true, revision: 8 } },
    })
    expect((await executeSkillUpdateCommand({ envelope: envelope(), skillRef: snapshot.skillRef, change: { displayName: " " } }, duplicatePorts)).reasonCode).toBe("skill_name_missing")
    expect((await executeSkillUpdateCommand({ envelope: envelope({ mutationId: "m2", nonce: "n2" }), skillRef: snapshot.skillRef, change: { displayName: "known" } }, duplicatePorts)).reasonCode).toBe("skill_name_duplicated")
    expect(writes).toBe(0)
  })

  it("rejects unknown references, stale revisions, replay, and source fields", async () => {
    expect((await executeSkillUpdateCommand({ envelope: envelope(), skillRef: snapshot.skillRef, change: { displayName: "UI" } }, ports({ resolveSkill: () => null }))).reasonCode).toBe("skill_ref_not_found")
    expect((await executeSkillUpdateCommand({ envelope: envelope({ targetRevision: 9 }), skillRef: snapshot.skillRef, change: { displayName: "UI" } }, ports())).reasonCode).toBe("mutation_revision_conflict")
    expect((await executeSkillUpdateCommand({ envelope: envelope(), skillRef: snapshot.skillRef, change: { displayName: "UI" } }, ports({ nonceUsed: () => true }))).reasonCode).toBe("mutation_nonce_replayed")
    expect((await executeSkillUpdateCommand({ envelope: envelope(), skillRef: snapshot.skillRef, change: { displayName: "UI", sourceKind: "builtin" } as never }, ports())).reasonCode).toBe("skill_source_change_denied")
  })

  it("rejects every built-in definition change before reserving or persisting", async () => {
    let reserved = false
    let persisted = false
    const result = await executeSkillUpdateCommand({
      envelope: envelope(),
      skillRef: snapshot.skillRef,
      change: { displayName: "Changed", runtimeStatus: "inactive" },
    }, ports({
      resolveSkill: () => ({ ...snapshot, sourceKind: "builtin" }),
      reserveReceipt: () => {
        reserved = true
        return true
      },
      persist: () => {
        persisted = true
        return { ok: true, revision: 8 }
      },
    }))

    expect(result).toMatchObject({
      state: "rejected",
      reasonCode: "skill_builtin_definition_immutable",
      revision: 7,
    })
    expect(reserved).toBe(false)
    expect(persisted).toBe(false)
  })

  it("returns an idempotent active receipt without increasing revision", async () => {
    let persisted = false
    const result = await executeSkillUpdateCommand({ envelope: envelope(), skillRef: snapshot.skillRef, change: { displayName: "UI", description: "Review", runtimeStatus: "active" } }, ports({ persist: () => { persisted = true; return { ok: true, revision: 8 } } }))
    expect(result).toMatchObject({ state: "active", revision: 7, reasonCode: null })
    expect(persisted).toBe(false)
  })

  it("rolls back apply and verification failures while preserving the original reason", async () => {
    const rollbacks: string[] = []
    const apply = await executeSkillUpdateCommand({ envelope: envelope(), skillRef: snapshot.skillRef, change: { runtimeStatus: "inactive" } }, ports({ apply: () => ({ ok: false, reasonCode: "runtime_apply_failed" }), rollback: ({ snapshot }) => { rollbacks.push(snapshot.runtimeStatus); return { ok: true } } }))
    expect(apply).toMatchObject({ state: "rolled_back", reasonCode: "runtime_apply_failed", revision: 7 })
    const verify = await executeSkillUpdateCommand({ envelope: envelope({ mutationId: "m2", nonce: "n2" }), skillRef: snapshot.skillRef, change: { runtimeStatus: "inactive" } }, ports({ verify: () => ({ ok: false, reasonCode: "runtime_not_visible" }), rollback: ({ snapshot }) => { rollbacks.push(snapshot.runtimeStatus); return { ok: true } } }))
    expect(verify).toMatchObject({ state: "rolled_back", reasonCode: "runtime_not_visible" })
    expect(rollbacks).toEqual(["active", "active"])
  })
})
