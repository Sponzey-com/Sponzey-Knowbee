import {
  type CapabilityMutation,
  type CapabilityMutationState,
  executeCapabilityMutation,
  projectCapabilityMutationReceipt,
} from "./capability-mutation-state-machine.js"
import { type MutationEnvelope, validateMutationEnvelope } from "./capability-security-boundary.js"
import type { McpConnectionDraft } from "./mcp-connection-validation.js"

export type McpLifecycleAction = "enable" | "disable" | "delete"
export interface McpLifecycleSnapshot {
  internalMcpId: string
  mcpRef: string
  displayName: string
  status: "enabled" | "disabled"
  draft: McpConnectionDraft
  revision: number
}
export interface McpLifecycleCommandPorts {
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
  resolveMcp(mcpRef: string): McpLifecycleSnapshot | null
  boundAgentNames(internalMcpId: string): readonly string[]
  inspect(
    snapshot: McpLifecycleSnapshot,
    signal: AbortSignal,
  ): Promise<{ ok: boolean; reasonCode?: string }>
  persist(input: {
    snapshot: McpLifecycleSnapshot
    action: McpLifecycleAction
    expectedRevision: number
    targetRevision: number
  }): Promise<{ ok: boolean; revision: number; reasonCode?: string }>
  apply(
    input: { snapshot: McpLifecycleSnapshot; action: McpLifecycleAction; targetRevision: number },
    signal: AbortSignal,
  ): Promise<{ ok: boolean; reasonCode?: string }>
  verify(
    input: { snapshot: McpLifecycleSnapshot; action: McpLifecycleAction; targetRevision: number },
    signal: AbortSignal,
  ): Promise<{ ok: boolean; reasonCode?: string }>
  rollback(
    input: { snapshot: McpLifecycleSnapshot; baseRevision: number },
    signal: AbortSignal,
  ): Promise<{ ok: boolean; reasonCode?: string }>
}
export interface McpLifecycleReceipt {
  mutationId: string
  state: CapabilityMutationState | "rejected"
  reasonCode: string | null
  allowedActions: readonly string[]
  revision: number
  mcpRef: string
  status: "enabled" | "disabled" | "deleted"
  deleted: boolean
  impact: { bindingCount: number; agentNames: string[] }
}

export async function executeMcpLifecycleCommand(
  input: { envelope: MutationEnvelope; mcpRef: string; action: McpLifecycleAction },
  ports: McpLifecycleCommandPorts,
  signal: AbortSignal = new AbortController().signal,
): Promise<McpLifecycleReceipt> {
  const baseRevision = ports.currentRevision()
  const rejected = (
    reasonCode: string,
    impact = { bindingCount: 0, agentNames: [] as string[] },
  ): McpLifecycleReceipt => ({
    mutationId: input.envelope.mutationId,
    state: "rejected",
    reasonCode,
    allowedActions: [],
    revision: baseRevision,
    mcpRef: input.mcpRef,
    status: "disabled",
    deleted: false,
    impact,
  })
  if (input.envelope.purpose !== `mcp_${input.action}`) return rejected("mutation_purpose_denied")
  const checked = validateMutationEnvelope({
    envelope: input.envelope,
    requiredScope: "capability:write",
    currentRevision: baseRevision,
    now: ports.now(),
    maxAgeMs: 5 * 60_000,
    usedNonces: new Set(ports.nonceUsed(input.envelope.nonce) ? [input.envelope.nonce] : []),
  })
  if (!checked.ok) return rejected(checked.diagnostics[0]?.reasonCode ?? "mutation_rejected")
  const snapshot = ports.resolveMcp(input.mcpRef)
  if (!snapshot) return rejected("mcp_ref_not_found")
  const agentNames = [...ports.boundAgentNames(snapshot.internalMcpId)]
    .map((name) => name.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))
  const impact = { bindingCount: agentNames.length, agentNames }
  if (input.action === "delete" && impact.bindingCount > 0)
    return rejected("mcp_delete_in_use", impact)
  const targetStatus =
    input.action === "delete" ? "deleted" : input.action === "enable" ? "enabled" : "disabled"
  if (
    (input.action === "enable" && snapshot.status === "enabled") ||
    (input.action === "disable" && snapshot.status === "disabled")
  )
    return {
      mutationId: input.envelope.mutationId,
      state: "active",
      reasonCode: null,
      allowedActions: [],
      revision: baseRevision,
      mcpRef: input.mcpRef,
      status: targetStatus,
      deleted: false,
      impact,
    }
  if (!ports.reserveReceipt({ envelope: input.envelope, state: "validating", now: ports.now() }))
    return rejected("mutation_nonce_replayed", impact)
  const initial: CapabilityMutation = {
    mutationId: input.envelope.mutationId,
    state: "draft",
    baseRevision,
    targetRevision: input.envelope.targetRevision,
    reasonCode: null,
  }
  const terminal = await executeCapabilityMutation(initial, {
    validate: async () =>
      input.action === "enable" ? ports.inspect(snapshot, signal) : { ok: true },
    persist: async (expectedRevision) =>
      ports.persist({
        snapshot,
        action: input.action,
        expectedRevision,
        targetRevision: input.envelope.targetRevision,
      }),
    apply: async (targetRevision) =>
      ports.apply({ snapshot, action: input.action, targetRevision }, signal),
    verify: async (targetRevision) =>
      ports.verify({ snapshot, action: input.action, targetRevision }, signal),
    rollback: async (baseRevisionForRollback) =>
      ports.rollback({ snapshot, baseRevision: baseRevisionForRollback }, signal),
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
    status: terminal.state === "active" ? targetStatus : snapshot.status,
    deleted: terminal.state === "active" && input.action === "delete",
    impact,
  }
}
