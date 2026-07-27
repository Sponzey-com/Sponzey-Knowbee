import { executeCapabilityMutation, projectCapabilityMutationReceipt, type CapabilityMutation, type CapabilityMutationState } from "./capability-mutation-state-machine.js"
import { validateMutationEnvelope, type MutationEnvelope } from "./capability-security-boundary.js"

export interface SkillBindingCommandPorts {
  now(): number
  currentRevision(): number
  nonceUsed(nonce: string): boolean
  reserveReceipt(input: { envelope: MutationEnvelope; state: CapabilityMutationState; now: number }): boolean
  updateReceipt(input: { mutationId: string; state: CapabilityMutationState; reasonCode: string | null; now: number }): void
  resolveSkill(skillRef: string): { internalSkillId: string; active: boolean } | null
  resolveAgent(agentRef: string): { internalAgentId: string; name: string } | null
  bindingEnabled(input: { internalSkillId: string; internalAgentId: string }): boolean
  persist(input: { internalSkillId: string; internalAgentId: string; enabled: boolean; expectedRevision: number; targetRevision: number }): { ok: boolean; revision: number; reasonCode?: string }
  verify(input: { internalSkillId: string; internalAgentId: string; enabled: boolean; targetRevision: number }): { ok: boolean; reasonCode?: string }
  rollback(input: { internalSkillId: string; internalAgentId: string; enabled: boolean; baseRevision: number }): { ok: boolean; reasonCode?: string }
}

export interface SkillBindingUserReceipt {
  mutationId: string
  state: CapabilityMutationState | "rejected"
  reasonCode: string | null
  allowedActions: readonly string[]
  revision: number
  skillRef: string
  agentRef: string
  bound: boolean
}

function rejected(input: { envelope: MutationEnvelope; skillRef: string; agentRef: string; revision: number; reasonCode: string; bound?: boolean }): SkillBindingUserReceipt {
  return { mutationId: input.envelope.mutationId, state: "rejected", reasonCode: input.reasonCode, allowedActions: [], revision: input.revision, skillRef: input.skillRef, agentRef: input.agentRef, bound: input.bound ?? false }
}

export async function executeSkillBindingCommand(input: { envelope: MutationEnvelope; skillRef: string; agentRef: string; action: "bind" | "unbind" }, ports: SkillBindingCommandPorts): Promise<SkillBindingUserReceipt> {
  const now = ports.now()
  const baseRevision = ports.currentRevision()
  const requiredPurpose = input.action === "bind" ? "skill_bind" : "skill_unbind"
  if (input.envelope.purpose !== requiredPurpose) return rejected({ ...input, revision: baseRevision, reasonCode: "mutation_purpose_denied" })
  const envelopeResult = validateMutationEnvelope({ envelope: input.envelope, requiredScope: "capability:write", currentRevision: baseRevision, now, maxAgeMs: 5 * 60_000, usedNonces: new Set(ports.nonceUsed(input.envelope.nonce) ? [input.envelope.nonce] : []) })
  if (!envelopeResult.ok) return rejected({ ...input, revision: baseRevision, reasonCode: envelopeResult.diagnostics[0]?.reasonCode ?? "mutation_rejected" })
  const skill = ports.resolveSkill(input.skillRef)
  if (!skill) return rejected({ ...input, revision: baseRevision, reasonCode: "skill_ref_not_found" })
  if (input.action === "bind" && !skill.active) return rejected({ ...input, revision: baseRevision, reasonCode: "skill_binding_inactive" })
  const agent = ports.resolveAgent(input.agentRef)
  if (!agent) return rejected({ ...input, revision: baseRevision, reasonCode: "agent_ref_not_found" })
  if (!ports.reserveReceipt({ envelope: input.envelope, state: "validating", now })) return rejected({ ...input, revision: baseRevision, reasonCode: "mutation_nonce_replayed" })
  const previousEnabled = ports.bindingEnabled({ internalSkillId: skill.internalSkillId, internalAgentId: agent.internalAgentId })
  const enabled = input.action === "bind"
  if (previousEnabled === enabled) {
    ports.updateReceipt({ mutationId: input.envelope.mutationId, state: "active", reasonCode: null, now: ports.now() })
    return { mutationId: input.envelope.mutationId, state: "active", reasonCode: null, allowedActions: [], revision: baseRevision, skillRef: input.skillRef, agentRef: input.agentRef, bound: enabled }
  }
  const initial: CapabilityMutation = { mutationId: input.envelope.mutationId, state: "draft", baseRevision, targetRevision: input.envelope.targetRevision, reasonCode: null }
  const terminal = await executeCapabilityMutation(initial, {
    validate: async () => ({ ok: true }),
    persist: async (expectedRevision) => ports.persist({ internalSkillId: skill.internalSkillId, internalAgentId: agent.internalAgentId, enabled, expectedRevision, targetRevision: input.envelope.targetRevision }),
    apply: async () => ({ ok: true }),
    verify: async (targetRevision) => ports.verify({ internalSkillId: skill.internalSkillId, internalAgentId: agent.internalAgentId, enabled, targetRevision }),
    rollback: async (baseRevisionForRollback) => ports.rollback({ internalSkillId: skill.internalSkillId, internalAgentId: agent.internalAgentId, enabled: previousEnabled, baseRevision: baseRevisionForRollback }),
  })
  ports.updateReceipt({ mutationId: input.envelope.mutationId, state: terminal.state, reasonCode: terminal.reasonCode, now: ports.now() })
  const receipt = projectCapabilityMutationReceipt(terminal)
  return { mutationId: receipt.mutationId, state: receipt.state, reasonCode: receipt.reasonCode, allowedActions: receipt.allowedActions, revision: terminal.state === "active" ? terminal.targetRevision : terminal.baseRevision, skillRef: input.skillRef, agentRef: input.agentRef, bound: terminal.state === "active" ? enabled : previousEnabled }
}
