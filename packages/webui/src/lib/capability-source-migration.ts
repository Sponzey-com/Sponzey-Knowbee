export type CapabilityMigrationState = "planned" | "shadow_reading" | "comparing" | "ready" | "cutting_over" | "cutover" | "legacy_blocked" | "verified" | "rolling_back" | "rolled_back" | "failed"

export interface CapabilityMigration {
  aggregateId: string
  state: CapabilityMigrationState
  usedEvidenceIds: readonly string[]
  rollbackOwner: string
  reasonCode: string | null
}

export type CapabilityMigrationEvent =
  | { type: "start_shadow" | "shadow_collected" | "comparison_passed" | "cutover" | "cutover_completed" | "legacy_blocked" | "verified" | "rollback" | "rollback_completed"; evidenceId: string; owner: string }
  | { type: "comparison_failed" | "cutover_failed" | "verification_failed" | "rollback_failed"; evidenceId: string; owner: string; reasonCode: string }

const NEXT: Readonly<Record<string, CapabilityMigrationState>> = {
  "planned:start_shadow": "shadow_reading",
  "shadow_reading:shadow_collected": "comparing",
  "comparing:comparison_passed": "ready",
  "ready:cutover": "cutting_over",
  "cutting_over:cutover_completed": "cutover",
  "cutover:legacy_blocked": "legacy_blocked",
  "legacy_blocked:verified": "verified",
  "failed:rollback": "rolling_back",
  "rolling_back:rollback_completed": "rolled_back",
}

export function transitionCapabilityMigration(current: CapabilityMigration, event: CapabilityMigrationEvent): CapabilityMigration {
  if (!event.evidenceId.trim() || !event.owner.trim()) throw new Error("Migration evidence and owner are required")
  if (current.usedEvidenceIds.includes(event.evidenceId)) throw new Error("Migration evidence already used")
  if (event.type === "rollback" && event.owner !== current.rollbackOwner) throw new Error("Migration rollback owner mismatch")
  const usedEvidenceIds = [...current.usedEvidenceIds, event.evidenceId]
  if (["comparison_failed", "cutover_failed", "verification_failed", "rollback_failed"].includes(event.type)) {
    return { ...current, state: "failed", usedEvidenceIds, reasonCode: "reasonCode" in event ? event.reasonCode : "migration_failed" }
  }
  const state = NEXT[`${current.state}:${event.type}`]
  if (!state) throw new Error(`Invalid capability migration transition: ${current.state} -> ${event.type}`)
  return { ...current, state, usedEvidenceIds, reasonCode: null }
}

export function compareCapabilityRevisions(input: {
  aggregateId: string
  legacyRevision: number
  newRevision: number
  runtimeRevision: number
  legacyChecksum: string
  newChecksum: string
}): { ok: boolean; aggregateId: string; reasonCodes: string[] } {
  const reasonCodes: string[] = []
  if (input.legacyRevision !== input.newRevision) reasonCodes.push("persisted_revision_mismatch")
  if (input.newRevision !== input.runtimeRevision) reasonCodes.push("runtime_revision_mismatch")
  if (input.legacyChecksum !== input.newChecksum) reasonCodes.push("projection_checksum_mismatch")
  return { ok: reasonCodes.length === 0, aggregateId: input.aggregateId, reasonCodes }
}

export function evaluateCapabilityWrite(input: {
  state: CapabilityMigrationState
  source: "legacy" | "new"
  owner: string
}): { allowed: true } | { allowed: false; reasonCode: string } {
  const afterCutover = ["cutover", "legacy_blocked", "verified"].includes(input.state)
  if (afterCutover && input.source === "legacy") return { allowed: false, reasonCode: "legacy_write_blocked" }
  if (!afterCutover && input.source === "new") return { allowed: false, reasonCode: "new_write_before_cutover" }
  const expectedOwner = input.source === "new" ? "capability.command" : "setup.save"
  if (input.owner !== expectedOwner) return { allowed: false, reasonCode: "write_owner_mismatch" }
  return { allowed: true }
}
