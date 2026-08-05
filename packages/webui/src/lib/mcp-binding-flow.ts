import type { McpBindingRequest } from "../contracts/mcp"

export type McpBindingFlowState =
  | "idle"
  | "editing"
  | "saving"
  | "verifying"
  | "succeeded"
  | "failed"
export interface McpBindingFlow {
  state: McpBindingFlowState
  persistedRefs: string[]
  draftRefs: string[]
  reasonCode: string | null
  sequence: number
}
export type McpBindingEvent =
  | { type: "edit" }
  | { type: "toggle"; agentRef: string }
  | { type: "cancel" }
  | { type: "save"; sequence: number }
  | { type: "save_completed"; sequence: number; active: boolean; reasonCode?: string }
  | {
      type: "verification_completed"
      sequence: number
      verified: boolean
      persistedRefs: string[]
      reasonCode?: string
    }

const sorted = (values: readonly string[]) =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right))
export function initialMcpBindingFlow(boundAgentRefs: readonly string[]): McpBindingFlow {
  const refs = sorted(boundAgentRefs)
  return { state: "idle", persistedRefs: refs, draftRefs: refs, reasonCode: null, sequence: 0 }
}
export function reduceMcpBindingFlow(
  current: McpBindingFlow,
  event: McpBindingEvent,
): McpBindingFlow {
  if (event.type === "edit" && ["idle", "succeeded", "failed"].includes(current.state))
    return { ...current, state: "editing", draftRefs: current.persistedRefs, reasonCode: null }
  if (event.type === "toggle" && ["editing", "failed"].includes(current.state))
    return {
      ...current,
      state: "editing",
      draftRefs: current.draftRefs.includes(event.agentRef)
        ? current.draftRefs.filter((ref) => ref !== event.agentRef)
        : sorted([...current.draftRefs, event.agentRef]),
    }
  if (event.type === "cancel" && ["editing", "failed"].includes(current.state))
    return { ...current, state: "idle", draftRefs: current.persistedRefs, reasonCode: null }
  if (event.type === "save" && ["editing", "failed"].includes(current.state))
    return { ...current, state: "saving", sequence: event.sequence, reasonCode: null }
  if (event.type === "save_completed") {
    if (current.state !== "saving" || current.sequence !== event.sequence) return current
    return event.active
      ? { ...current, state: "verifying" }
      : { ...current, state: "failed", reasonCode: event.reasonCode ?? "mcp_binding_failed" }
  }
  if (event.type === "verification_completed") {
    if (current.state !== "verifying" || current.sequence !== event.sequence) return current
    const persistedRefs = sorted(event.persistedRefs)
    return event.verified
      ? {
          ...current,
          state: "succeeded",
          persistedRefs,
          draftRefs: persistedRefs,
          reasonCode: null,
        }
      : {
          ...current,
          state: "failed",
          persistedRefs,
          reasonCode: event.reasonCode ?? "mcp_binding_verify_failed",
        }
  }
  throw new Error("mcp_binding_transition_invalid")
}

export function mcpBindingDiff(flow: McpBindingFlow) {
  return [
    ...flow.persistedRefs
      .filter((agentRef) => !flow.draftRefs.includes(agentRef))
      .map((agentRef) => ({ agentRef, bound: false })),
    ...flow.draftRefs
      .filter((agentRef) => !flow.persistedRefs.includes(agentRef))
      .map((agentRef) => ({ agentRef, bound: true })),
  ].sort((left, right) => left.agentRef.localeCompare(right.agentRef))
}

export function createMcpBindingRequest(input: {
  bound: boolean
  revision: number
  now: number
  randomId: () => string
}): McpBindingRequest {
  return {
    envelope: {
      scope: "capability:write",
      mutationId: input.randomId(),
      targetRevision: input.revision + 1,
      purpose: input.bound ? "mcp_bind" : "mcp_unbind",
      issuedAt: input.now,
      nonce: input.randomId(),
    },
    bound: input.bound,
  }
}
