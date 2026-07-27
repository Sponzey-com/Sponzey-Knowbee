import { describe, expect, it } from "vitest"
import { executeSkillCreateCommand, type SkillCreateCommandPorts } from "../packages/core/src/capabilities/skill-create-command.js"

const envelope = () => ({ actorRef: "user:self", scope: "capability:write", mutationId: "m1", targetRevision: 4, purpose: "skill_create", issuedAt: 1000, nonce: "n1" })
const ports = (overrides: Partial<SkillCreateCommandPorts> = {}): SkillCreateCommandPorts => ({
  now: () => 1100,
  currentRevision: () => 3,
  nonceUsed: () => false,
  reserveReceipt: () => true,
  updateReceipt: () => undefined,
  existingNames: () => [],
  inspectSource: () => ({ reasonCodes: [], canonicalPath: "/allowed/skill" }),
  createInternalSkillId: () => "internal-new",
  persist: () => ({ ok: true, revision: 4 }),
  apply: () => ({ ok: true }),
  verify: () => ({ ok: true }),
  rollback: () => ({ ok: true }),
  publicRefForSkillId: () => `skill_v1_${"a".repeat(24)}`,
  ...overrides,
})

describe("task023 skill create command", () => {
  it("validates, persists, applies, verifies, and returns only a public receipt", async () => {
    const calls: string[] = []
    let persistedKind = ""
    const result = await executeSkillCreateCommand({ envelope: envelope(), draft: { displayName: "UI UX", description: "Review", sourceKind: "local", requestedPath: "/requested" } }, ports({
      persist: (input) => {
        calls.push(`persist:${input.canonicalPath}`)
        persistedKind = input.skillKind
        return { ok: true, revision: 4 }
      },
      apply: () => { calls.push("apply"); return { ok: true } },
      verify: () => { calls.push("verify"); return { ok: true } },
    }))
    expect(calls).toEqual(["persist:/allowed/skill", "apply", "verify"])
    expect(persistedKind).toBe("instruction_skill")
    expect(result).toEqual({ mutationId: "m1", state: "active", reasonCode: null, allowedActions: [], revision: 4, skillRef: `skill_v1_${"a".repeat(24)}` })
    expect(JSON.stringify(result)).not.toContain("internal-new")
    expect(JSON.stringify(result)).not.toContain("/allowed")
  })

  it("rejects persisted replay before source inspection", async () => {
    let inspected = false
    const result = await executeSkillCreateCommand({ envelope: envelope(), draft: { displayName: "UI", description: "", sourceKind: "local" } }, ports({ nonceUsed: () => true, inspectSource: () => { inspected = true; return { reasonCodes: [] } } }))
    expect(result.reasonCode).toBe("mutation_nonce_replayed")
    expect(inspected).toBe(false)
  })

  it("rejects stale revisions, expired requests, and an unrelated purpose", async () => {
    expect((await executeSkillCreateCommand({ envelope: { ...envelope(), targetRevision: 9 }, draft: { displayName: "UI", description: "", sourceKind: "local" } }, ports())).reasonCode).toBe("mutation_revision_conflict")
    expect((await executeSkillCreateCommand({ envelope: { ...envelope(), issuedAt: 1 }, draft: { displayName: "UI", description: "", sourceKind: "local" } }, ports({ now: () => 400_002 }))).reasonCode).toBe("mutation_expired")
    expect((await executeSkillCreateCommand({ envelope: { ...envelope(), purpose: "other" }, draft: { displayName: "UI", description: "", sourceKind: "local" } }, ports())).reasonCode).toBe("mutation_purpose_denied")
  })

  it("rejects manual built-in creation before reserving or persisting", async () => {
    let reserved = false
    let persisted = false
    const result = await executeSkillCreateCommand({
      envelope: envelope(),
      draft: { displayName: "Injected built-in", description: "", sourceKind: "builtin" },
    }, ports({
      reserveReceipt: () => {
        reserved = true
        return true
      },
      persist: () => {
        persisted = true
        return { ok: true, revision: 4 }
      },
    }))
    expect(result).toMatchObject({
      state: "rejected",
      reasonCode: "skill_builtin_definition_immutable",
    })
    expect(reserved).toBe(false)
    expect(persisted).toBe(false)
  })

  it("does not persist duplicate names and rolls back apply failures", async () => {
    let persisted = false
    const duplicate = await executeSkillCreateCommand({ envelope: envelope(), draft: { displayName: "Known", description: "", sourceKind: "local" } }, ports({ existingNames: () => ["known"], persist: () => { persisted = true; return { ok: true, revision: 4 } } }))
    expect(duplicate.reasonCode).toBe("skill_name_duplicated")
    expect(persisted).toBe(false)
    let rolledBack = false
    const failed = await executeSkillCreateCommand({ envelope: envelope(), draft: { displayName: "New", description: "", sourceKind: "local" } }, ports({ apply: () => ({ ok: false, reasonCode: "apply_failed" }), rollback: () => { rolledBack = true; return { ok: true } } }))
    expect(rolledBack).toBe(true)
    expect(failed.state).toBe("rolled_back")
    expect(failed.reasonCode).toBe("apply_failed")
  })

  it("rolls back after verification failure", async () => {
    const calls: string[] = []
    const result = await executeSkillCreateCommand({ envelope: envelope(), draft: { displayName: "UI", description: "", sourceKind: "local" } }, ports({
      verify: () => ({ ok: false, reasonCode: "runtime_not_visible" }),
      rollback: () => { calls.push("rollback"); return { ok: true } },
    }))
    expect(calls).toEqual(["rollback"])
    expect(result).toMatchObject({ state: "rolled_back", reasonCode: "runtime_not_visible", revision: 3, skillRef: null })
  })

  it("preserves a persistence failure reason without attempting apply or rollback", async () => {
    let sideEffectCalled = false
    const result = await executeSkillCreateCommand({ envelope: envelope(), draft: { displayName: "New", description: "", sourceKind: "local" } }, ports({
      persist: () => ({ ok: false, revision: 3, reasonCode: "db_write_failed" }),
      apply: () => { sideEffectCalled = true; return { ok: true } },
      rollback: () => { sideEffectCalled = true; return { ok: true } },
    }))
    expect(result).toMatchObject({ state: "failed", reasonCode: "db_write_failed", revision: 3 })
    expect(sideEffectCalled).toBe(false)
  })
})
