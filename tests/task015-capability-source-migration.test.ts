import { describe, expect, it } from "vitest"
import {
  compareCapabilityRevisions,
  evaluateCapabilityWrite,
  transitionCapabilityMigration,
  type CapabilityMigration,
} from "../packages/webui/src/lib/capability-source-migration.js"

const planned = (): CapabilityMigration => ({ aggregateId: "mcp_catalog", state: "planned", usedEvidenceIds: [], rollbackOwner: "capability.application", reasonCode: null })

describe("task015 capability source migration", () => {
  it("requires ordered unique evidence before cutover", () => {
    let state = transitionCapabilityMigration(planned(), { type: "start_shadow", evidenceId: "e1", owner: "capability.query" })
    state = transitionCapabilityMigration(state, { type: "shadow_collected", evidenceId: "e2", owner: "capability.query" })
    state = transitionCapabilityMigration(state, { type: "comparison_passed", evidenceId: "e3", owner: "capability.query" })
    expect(state.state).toBe("ready")
    expect(() => transitionCapabilityMigration(state, { type: "cutover", evidenceId: "e3", owner: "capability.application" })).toThrow("Migration evidence already used")
    state = transitionCapabilityMigration(state, { type: "cutover", evidenceId: "e4", owner: "capability.application" })
    state = transitionCapabilityMigration(state, { type: "cutover_completed", evidenceId: "e5", owner: "capability.application" })
    state = transitionCapabilityMigration(state, { type: "legacy_blocked", evidenceId: "e6", owner: "capability.boundary" })
    state = transitionCapabilityMigration(state, { type: "verified", evidenceId: "e7", owner: "capability.application" })
    expect(state.state).toBe("verified")
  })

  it("returns only aggregate reason codes for revision or checksum mismatch", () => {
    expect(compareCapabilityRevisions({ aggregateId: "skills", legacyRevision: 2, newRevision: 3, runtimeRevision: 3, legacyChecksum: "a", newChecksum: "b" })).toEqual({
      ok: false, aggregateId: "skills", reasonCodes: ["persisted_revision_mismatch", "projection_checksum_mismatch"],
    })
  })

  it("blocks legacy writes after cutover and unauthorized rollback", () => {
    expect(evaluateCapabilityWrite({ state: "legacy_blocked", source: "legacy", owner: "setup.save" })).toEqual({ allowed: false, reasonCode: "legacy_write_blocked" })
    expect(evaluateCapabilityWrite({ state: "legacy_blocked", source: "new", owner: "capability.command" })).toEqual({ allowed: true })
    const failed: CapabilityMigration = { ...planned(), state: "failed" }
    expect(() => transitionCapabilityMigration(failed, { type: "rollback", evidenceId: "r1", owner: "other" })).toThrow("Migration rollback owner mismatch")
  })
})
