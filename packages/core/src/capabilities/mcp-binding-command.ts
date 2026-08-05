import {
  type CapabilityMutation,
  type CapabilityMutationState,
  executeCapabilityMutation,
  projectCapabilityMutationReceipt,
} from "./capability-mutation-state-machine.js"
import { type MutationEnvelope, validateMutationEnvelope } from "./capability-security-boundary.js"

export interface McpBindingCommandPorts {
  now(): number
  currentRevision(): number
  nonceUsed(nonce: string): boolean
  reserveReceipt(input: {
    envelope: MutationEnvelope
    state: CapabilityMutationState
    now: number
  }): boolean
  updateReceipt(input: {
    mutationId: string
    state: CapabilityMutationState
    reasonCode: string | null
    now: number
  }): void
  resolveMcp(mcpRef: string): { internalMcpId: string; active: boolean } | null
  resolveAgent(agentRef: string): { internalAgentId: string; name: string } | null
  bindingEnabled(input: { internalMcpId: string; internalAgentId: string }): boolean
  persist(input: {
    internalMcpId: string
    internalAgentId: string
    enabled: boolean
    expectedRevision: number
    targetRevision: number
  }): { ok: boolean; revision: number; reasonCode?: string }
  verify(input: {
    internalMcpId: string
    internalAgentId: string
    enabled: boolean
    targetRevision: number
  }): { ok: boolean; reasonCode?: string }
  rollback(input: {
    internalMcpId: string
    internalAgentId: string
    enabled: boolean
    baseRevision: number
  }): { ok: boolean; reasonCode?: string }
}

export interface McpBindingUserReceipt {
  mutationId: string
  state: CapabilityMutationState | "rejected"
  reasonCode: string | null
  allowedActions: readonly string[]
  revision: number
  mcpRef: string
  agentRef: string
  bound: boolean
}

function rejected(input: {
  envelope: MutationEnvelope
  mcpRef: string
  agentRef: string
  revision: number
  reasonCode: string
  bound?: boolean
}): McpBindingUserReceipt {
  return {
    mutationId: input.envelope.mutationId,
    state: "rejected",
    reasonCode: input.reasonCode,
    allowedActions: [],
    revision: input.revision,
    mcpRef: input.mcpRef,
    agentRef: input.agentRef,
    bound: input.bound ?? false,
  }
}

export async function executeMcpBindingCommand(
  input: {
    envelope: MutationEnvelope
    mcpRef: string
    agentRef: string
    action: "bind" | "unbind"
  },
  ports: McpBindingCommandPorts,
): Promise<McpBindingUserReceipt> {
  const now = ports.now()
  const baseRevision = ports.currentRevision()
  const requiredPurpose = input.action === "bind" ? "mcp_bind" : "mcp_unbind"
  if (input.envelope.purpose !== requiredPurpose)
    return rejected({ ...input, revision: baseRevision, reasonCode: "mutation_purpose_denied" })
  const envelopeResult = validateMutationEnvelope({
    envelope: input.envelope,
    requiredScope: "capability:write",
    currentRevision: baseRevision,
    now,
    maxAgeMs: 5 * 60_000,
    usedNonces: new Set(ports.nonceUsed(input.envelope.nonce) ? [input.envelope.nonce] : []),
  })
  if (!envelopeResult.ok)
    return rejected({
      ...input,
      revision: baseRevision,
      reasonCode: envelopeResult.diagnostics[0]?.reasonCode ?? "mutation_rejected",
    })
  const mcp = ports.resolveMcp(input.mcpRef)
  if (!mcp) return rejected({ ...input, revision: baseRevision, reasonCode: "mcp_ref_not_found" })
  if (input.action === "bind" && !mcp.active)
    return rejected({ ...input, revision: baseRevision, reasonCode: "mcp_binding_inactive" })
  const agent = ports.resolveAgent(input.agentRef)
  if (!agent)
    return rejected({ ...input, revision: baseRevision, reasonCode: "agent_ref_not_found" })
  if (!ports.reserveReceipt({ envelope: input.envelope, state: "validating", now }))
    return rejected({ ...input, revision: baseRevision, reasonCode: "mutation_nonce_replayed" })
  const previousEnabled = ports.bindingEnabled({
    internalMcpId: mcp.internalMcpId,
    internalAgentId: agent.internalAgentId,
  })
  const enabled = input.action === "bind"
  if (previousEnabled === enabled) {
    ports.updateReceipt({
      mutationId: input.envelope.mutationId,
      state: "active",
      reasonCode: null,
      now: ports.now(),
    })
    return {
      mutationId: input.envelope.mutationId,
      state: "active",
      reasonCode: null,
      allowedActions: [],
      revision: baseRevision,
      mcpRef: input.mcpRef,
      agentRef: input.agentRef,
      bound: enabled,
    }
  }
  const initial: CapabilityMutation = {
    mutationId: input.envelope.mutationId,
    state: "draft",
    baseRevision,
    targetRevision: input.envelope.targetRevision,
    reasonCode: null,
  }
  const terminal = await executeCapabilityMutation(initial, {
    validate: async () => ({ ok: true }),
    persist: async (expectedRevision) =>
      ports.persist({
        internalMcpId: mcp.internalMcpId,
        internalAgentId: agent.internalAgentId,
        enabled,
        expectedRevision,
        targetRevision: input.envelope.targetRevision,
      }),
    apply: async () => ({ ok: true }),
    verify: async (targetRevision) =>
      ports.verify({
        internalMcpId: mcp.internalMcpId,
        internalAgentId: agent.internalAgentId,
        enabled,
        targetRevision,
      }),
    rollback: async (baseRevisionForRollback) =>
      ports.rollback({
        internalMcpId: mcp.internalMcpId,
        internalAgentId: agent.internalAgentId,
        enabled: previousEnabled,
        baseRevision: baseRevisionForRollback,
      }),
  })
  ports.updateReceipt({
    mutationId: input.envelope.mutationId,
    state: terminal.state,
    reasonCode: terminal.reasonCode,
    now: ports.now(),
  })
  const receipt = projectCapabilityMutationReceipt(terminal)
  return {
    mutationId: receipt.mutationId,
    state: receipt.state,
    reasonCode: receipt.reasonCode,
    allowedActions: receipt.allowedActions,
    revision: terminal.state === "active" ? terminal.targetRevision : terminal.baseRevision,
    mcpRef: input.mcpRef,
    agentRef: input.agentRef,
    bound: terminal.state === "active" ? enabled : previousEnabled,
  }
}
