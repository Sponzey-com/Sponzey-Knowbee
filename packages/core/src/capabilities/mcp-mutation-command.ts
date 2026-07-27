import {
  executeCapabilityMutation,
  projectCapabilityMutationReceipt,
  type CapabilityMutation,
  type CapabilityMutationState,
} from "./capability-mutation-state-machine.js"
import {
  validateMutationEnvelope,
  type MutationEnvelope,
} from "./capability-security-boundary.js"
import {
  validateMcpConnectionDraft,
  type McpConnectionDraft,
} from "./mcp-connection-validation.js"

export interface McpMutationReceipt {
  mutationId: string
  state: CapabilityMutationState | "rejected"
  reasonCode: string | null
  allowedActions: readonly string[]
  revision: number
  mcpRef: string | null
}

export interface McpMutationReceiptPorts {
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
}

export interface McpCreateCommandPorts extends McpMutationReceiptPorts {
  existingNames(): readonly string[]
  existingPublicRefs(): readonly string[]
  createInternalMcpId(): string
  publicRefForMcpId(internalMcpId: string): string
  inspectConnection(
    draft: McpConnectionDraft,
    signal: AbortSignal,
  ): Promise<{ ok: boolean; reasonCode?: string; draft?: McpConnectionDraft }>
  persist(input: {
    internalMcpId: string
    draft: McpConnectionDraft
    expectedRevision: number
    targetRevision: number
  }, signal: AbortSignal): Promise<{ ok?: boolean; revision: number; reasonCode?: string }>
  apply(input: {
    internalMcpId: string
    draft: McpConnectionDraft
    targetRevision: number
  }, signal: AbortSignal): Promise<{ ok: boolean; reasonCode?: string }>
  verify(input: {
    internalMcpId: string
    targetRevision: number
  }, signal: AbortSignal): Promise<{ ok: boolean; reasonCode?: string }>
  rollback(input: {
    internalMcpId: string
    baseRevision: number
  }, signal: AbortSignal): Promise<{ ok: boolean; reasonCode?: string }>
}

export interface McpUpdateSnapshot {
  internalMcpId: string
  mcpRef: string
  draft: McpConnectionDraft
  revision: number
}

export interface McpUpdateCommandPorts extends McpMutationReceiptPorts {
  resolveMcp(mcpRef: string): McpUpdateSnapshot | null
  existingNames(): readonly { internalMcpId: string; displayName: string }[]
  inspectConnection(
    draft: McpConnectionDraft,
    signal: AbortSignal,
  ): Promise<{ ok: boolean; reasonCode?: string; draft?: McpConnectionDraft }>
  persist(input: {
    snapshot: McpUpdateSnapshot
    draft: McpConnectionDraft
    expectedRevision: number
    targetRevision: number
  }, signal: AbortSignal): Promise<{ ok?: boolean; revision: number; reasonCode?: string }>
  apply(input: {
    internalMcpId: string
    draft: McpConnectionDraft
    targetRevision: number
  }, signal: AbortSignal): Promise<{ ok: boolean; reasonCode?: string }>
  verify(input: {
    internalMcpId: string
    targetRevision: number
  }, signal: AbortSignal): Promise<{ ok: boolean; reasonCode?: string }>
  rollback(input: {
    snapshot: McpUpdateSnapshot
    baseRevision: number
  }, signal: AbortSignal): Promise<{ ok: boolean; reasonCode?: string }>
}

function rejected(input: {
  envelope: MutationEnvelope
  revision: number
  reasonCode: string
  mcpRef?: string
}): McpMutationReceipt {
  return {
    mutationId: input.envelope.mutationId,
    state: "rejected",
    reasonCode: input.reasonCode,
    allowedActions: [],
    revision: input.revision,
    mcpRef: input.mcpRef ?? null,
  }
}

function validateEnvelope(input: {
  envelope: MutationEnvelope
  expectedPurpose: "mcp_create" | "mcp_update"
  revision: number
  now: number
  nonceUsed: boolean
}): string | null {
  if (input.envelope.purpose !== input.expectedPurpose) return "mutation_purpose_denied"
  const result = validateMutationEnvelope({
    envelope: input.envelope,
    requiredScope: "capability:write",
    currentRevision: input.revision,
    now: input.now,
    maxAgeMs: 5 * 60_000,
    usedNonces: new Set(input.nonceUsed ? [input.envelope.nonce] : []),
  })
  return result.ok ? null : result.diagnostics[0]?.reasonCode ?? "mutation_rejected"
}

function normalizedDraftOrReason(input: unknown, existingNames: readonly string[], ownName?: string) {
  const validation = validateMcpConnectionDraft(input)
  if (!validation.valid || !validation.draft) {
    return { reasonCode: validation.reasonCodes[0] ?? "mcp_draft_invalid" } as const
  }
  const normalizedName = validation.draft.displayName.toLocaleLowerCase()
  if (existingNames.some((name) => name.toLocaleLowerCase() === normalizedName && name !== ownName)) {
    return { reasonCode: "mcp_name_duplicated" } as const
  }
  return { draft: validation.draft } as const
}

function sameDraft(left: McpConnectionDraft, right: McpConnectionDraft): boolean {
  return left.displayName === right.displayName
    && left.transport === right.transport
    && left.command === right.command
    && left.cwd === right.cwd
    && left.required === right.required
    && left.args.length === right.args.length
    && left.args.every((value, index) => value === right.args[index])
}

export async function executeMcpCreateCommand(
  input: { envelope: MutationEnvelope; draft: unknown },
  ports: McpCreateCommandPorts,
  signal: AbortSignal = new AbortController().signal,
): Promise<McpMutationReceipt> {
  const now = ports.now()
  const baseRevision = ports.currentRevision()
  const envelopeReason = validateEnvelope({
    envelope: input.envelope,
    expectedPurpose: "mcp_create",
    revision: baseRevision,
    now,
    nonceUsed: ports.nonceUsed(input.envelope.nonce),
  })
  if (envelopeReason) return rejected({ envelope: input.envelope, revision: baseRevision, reasonCode: envelopeReason })
  const normalized = normalizedDraftOrReason(input.draft, ports.existingNames())
  if ("reasonCode" in normalized) return rejected({ envelope: input.envelope, revision: baseRevision, reasonCode: normalized.reasonCode })
  const internalMcpId = ports.createInternalMcpId()
  const mcpRef = ports.publicRefForMcpId(internalMcpId)
  if (ports.existingPublicRefs().includes(mcpRef)) {
    return rejected({ envelope: input.envelope, revision: baseRevision, reasonCode: "mcp_public_ref_collision" })
  }
  if (!ports.reserveReceipt({ envelope: input.envelope, state: "validating", now })) {
    return rejected({ envelope: input.envelope, revision: baseRevision, reasonCode: "mutation_nonce_replayed" })
  }

  let effectiveDraft = normalized.draft
  const initial: CapabilityMutation = {
    mutationId: input.envelope.mutationId,
    state: "draft",
    baseRevision,
    targetRevision: input.envelope.targetRevision,
    reasonCode: null,
  }
  const terminal = await executeCapabilityMutation(initial, {
    validate: async (currentSignal) => {
      const inspection = await ports.inspectConnection(effectiveDraft, currentSignal)
      if (inspection.ok && inspection.draft) effectiveDraft = inspection.draft
      return inspection
    },
    persist: async (expectedRevision, currentSignal) => ports.persist({
      internalMcpId,
      draft: effectiveDraft,
      expectedRevision,
      targetRevision: input.envelope.targetRevision,
    }, currentSignal),
    apply: async (targetRevision, currentSignal) => ports.apply({ internalMcpId, draft: effectiveDraft, targetRevision }, currentSignal),
    verify: async (targetRevision, currentSignal) => ports.verify({ internalMcpId, targetRevision }, currentSignal),
    rollback: async (baseRevisionForRollback, currentSignal) => ports.rollback({ internalMcpId, baseRevision: baseRevisionForRollback }, currentSignal),
  }, signal)
  ports.updateReceipt({ mutationId: input.envelope.mutationId, state: terminal.state, reasonCode: terminal.reasonCode, now: ports.now() })
  const receipt = projectCapabilityMutationReceipt(terminal)
  return {
    mutationId: receipt.mutationId,
    state: receipt.state,
    reasonCode: receipt.reasonCode,
    allowedActions: receipt.allowedActions,
    revision: terminal.state === "active" ? terminal.targetRevision : terminal.baseRevision,
    mcpRef: terminal.state === "active" ? mcpRef : null,
  }
}

export async function executeMcpUpdateCommand(
  input: { envelope: MutationEnvelope; mcpRef: string; draft: unknown },
  ports: McpUpdateCommandPorts,
  signal: AbortSignal = new AbortController().signal,
): Promise<McpMutationReceipt> {
  const now = ports.now()
  const baseRevision = ports.currentRevision()
  const envelopeReason = validateEnvelope({
    envelope: input.envelope,
    expectedPurpose: "mcp_update",
    revision: baseRevision,
    now,
    nonceUsed: ports.nonceUsed(input.envelope.nonce),
  })
  if (envelopeReason) return rejected({ envelope: input.envelope, revision: baseRevision, reasonCode: envelopeReason, mcpRef: input.mcpRef })
  const snapshot = ports.resolveMcp(input.mcpRef)
  if (!snapshot) return rejected({ envelope: input.envelope, revision: baseRevision, reasonCode: "mcp_ref_not_found", mcpRef: input.mcpRef })
  const normalized = normalizedDraftOrReason(input.draft, ports.existingNames().filter((item) => item.internalMcpId !== snapshot.internalMcpId).map((item) => item.displayName))
  if ("reasonCode" in normalized) return rejected({ envelope: input.envelope, revision: baseRevision, reasonCode: normalized.reasonCode, mcpRef: input.mcpRef })
  if (sameDraft(snapshot.draft, normalized.draft)) {
    return { mutationId: input.envelope.mutationId, state: "active", reasonCode: null, allowedActions: [], revision: baseRevision, mcpRef: input.mcpRef }
  }
  if (!ports.reserveReceipt({ envelope: input.envelope, state: "validating", now })) {
    return rejected({ envelope: input.envelope, revision: baseRevision, reasonCode: "mutation_nonce_replayed", mcpRef: input.mcpRef })
  }

  const initial: CapabilityMutation = {
    mutationId: input.envelope.mutationId,
    state: "draft",
    baseRevision,
    targetRevision: input.envelope.targetRevision,
    reasonCode: null,
  }
  let effectiveDraft = normalized.draft
  const terminal = await executeCapabilityMutation(initial, {
    validate: async (currentSignal) => {
      const inspection = await ports.inspectConnection(effectiveDraft, currentSignal)
      if (inspection.ok && inspection.draft) effectiveDraft = inspection.draft
      return inspection
    },
    persist: async (expectedRevision, currentSignal) => ports.persist({ snapshot, draft: effectiveDraft, expectedRevision, targetRevision: input.envelope.targetRevision }, currentSignal),
    apply: async (targetRevision, currentSignal) => ports.apply({ internalMcpId: snapshot.internalMcpId, draft: effectiveDraft, targetRevision }, currentSignal),
    verify: async (targetRevision, currentSignal) => ports.verify({ internalMcpId: snapshot.internalMcpId, targetRevision }, currentSignal),
    rollback: async (baseRevisionForRollback, currentSignal) => ports.rollback({ snapshot, baseRevision: baseRevisionForRollback }, currentSignal),
  }, signal)
  ports.updateReceipt({ mutationId: input.envelope.mutationId, state: terminal.state, reasonCode: terminal.reasonCode, now: ports.now() })
  const receipt = projectCapabilityMutationReceipt(terminal)
  return {
    mutationId: receipt.mutationId,
    state: receipt.state,
    reasonCode: receipt.reasonCode,
    allowedActions: receipt.allowedActions,
    revision: terminal.state === "active" ? terminal.targetRevision : terminal.baseRevision,
    mcpRef: input.mcpRef,
  }
}
