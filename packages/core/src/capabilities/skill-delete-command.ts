import { executeCapabilityMutation, projectCapabilityMutationReceipt, type CapabilityMutation, type CapabilityMutationState } from "./capability-mutation-state-machine.js"
import { validateMutationEnvelope, type MutationEnvelope } from "./capability-security-boundary.js"
import type { SkillRuntimeStatus, SkillUpdateSnapshot } from "./skill-update-command.js"

export interface SkillDeleteSnapshot {
  internalSkillId: string
  skillRef: string
  displayName: string
  description: string
  sourceKind: SkillUpdateSnapshot["sourceKind"]
  runtimeStatus: SkillRuntimeStatus
  revision: number
}
export interface SkillDeleteCommandPorts {
  now(): number
  currentRevision(): number
  nonceUsed(nonce: string): boolean
  reserveReceipt(input: { envelope: MutationEnvelope; state: CapabilityMutationState; now: number }): boolean
  updateReceipt(input: { mutationId: string; state: CapabilityMutationState; reasonCode: string | null; now: number }): void
  resolveSkill(skillRef: string): SkillDeleteSnapshot | null
  boundAgentNames(internalSkillId: string): readonly string[]
  persistArchive(input: { snapshot: SkillDeleteSnapshot; expectedRevision: number; targetRevision: number }): { ok: boolean; revision: number; reasonCode?: string }
  verifyArchived(input: { internalSkillId: string; targetRevision: number }): { ok: boolean; reasonCode?: string }
  rollback(input: { snapshot: SkillDeleteSnapshot; baseRevision: number }): { ok: boolean; reasonCode?: string }
}

export interface SkillDeleteUserReceipt {
  mutationId: string
  state: CapabilityMutationState | "rejected"
  reasonCode: string | null
  allowedActions: readonly string[]
  revision: number
  skillRef: string
  deleted: boolean
  impact: { bindingCount: number; agentNames: string[] }
}

export async function executeSkillDeleteCommand(input: { envelope: MutationEnvelope; skillRef: string }, ports: SkillDeleteCommandPorts): Promise<SkillDeleteUserReceipt> {
  const now = ports.now()
  const baseRevision = ports.currentRevision()
  const base = (reasonCode: string, impact = { bindingCount: 0, agentNames: [] as string[] }): SkillDeleteUserReceipt => ({ mutationId: input.envelope.mutationId, state: "rejected", reasonCode, allowedActions: [], revision: baseRevision, skillRef: input.skillRef, deleted: false, impact })
  if (input.envelope.purpose !== "skill_delete") return base("mutation_purpose_denied")
  const envelopeResult = validateMutationEnvelope({ envelope: input.envelope, requiredScope: "capability:write", currentRevision: baseRevision, now, maxAgeMs: 5 * 60_000, usedNonces: new Set(ports.nonceUsed(input.envelope.nonce) ? [input.envelope.nonce] : []) })
  if (!envelopeResult.ok) return base(envelopeResult.diagnostics[0]?.reasonCode ?? "mutation_rejected")
  const snapshot = ports.resolveSkill(input.skillRef)
  if (!snapshot) return base("skill_ref_not_found")
  if (snapshot.sourceKind === "builtin") {
    return base("skill_builtin_definition_immutable")
  }
  const agentNames = [...ports.boundAgentNames(snapshot.internalSkillId)].map((name) => name.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b))
  const impact = { bindingCount: agentNames.length, agentNames }
  if (impact.bindingCount > 0) return base("skill_delete_in_use", impact)
  if (!ports.reserveReceipt({ envelope: input.envelope, state: "validating", now })) return base("mutation_nonce_replayed")
  const initial: CapabilityMutation = { mutationId: input.envelope.mutationId, state: "draft", baseRevision, targetRevision: input.envelope.targetRevision, reasonCode: null }
  const terminal = await executeCapabilityMutation(initial, {
    validate: async () => ({ ok: true }),
    persist: async (expectedRevision) => ports.persistArchive({ snapshot, expectedRevision, targetRevision: input.envelope.targetRevision }),
    apply: async () => ({ ok: true }),
    verify: async (targetRevision) => ports.verifyArchived({ internalSkillId: snapshot.internalSkillId, targetRevision }),
    rollback: async (baseRevisionForRollback) => ports.rollback({ snapshot, baseRevision: baseRevisionForRollback }),
  })
  ports.updateReceipt({ mutationId: input.envelope.mutationId, state: terminal.state, reasonCode: terminal.reasonCode, now: ports.now() })
  const receipt = projectCapabilityMutationReceipt(terminal)
  return { mutationId: receipt.mutationId, state: receipt.state, reasonCode: receipt.reasonCode, allowedActions: receipt.allowedActions, revision: terminal.state === "active" ? terminal.targetRevision : terminal.baseRevision, skillRef: input.skillRef, deleted: terminal.state === "active", impact }
}
