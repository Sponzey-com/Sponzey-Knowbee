import type { McpDeleteRequest, McpLifecycleReceipt, McpStatusRequest } from "../contracts/mcp"

export type McpLifecycleAction = "enable" | "disable" | "delete"
export type McpLifecycleFlowState =
  | "idle"
  | "confirming"
  | "saving"
  | "verifying"
  | "succeeded"
  | "failed"
export interface McpLifecycleFlow {
  state: McpLifecycleFlowState
  action: McpLifecycleAction | null
  sequence: number
  reasonCode: string | null
}
export type McpLifecycleEvent =
  | { type: "begin"; action: McpLifecycleAction }
  | { type: "cancel" }
  | { type: "save"; sequence: number }
  | { type: "save_completed"; sequence: number; active: boolean; reasonCode?: string }
  | { type: "verification_completed"; sequence: number; verified: boolean; reasonCode?: string }

export const initialMcpLifecycleFlow = (): McpLifecycleFlow => ({
  state: "idle",
  action: null,
  sequence: 0,
  reasonCode: null,
})
export function reduceMcpLifecycleFlow(
  current: McpLifecycleFlow,
  event: McpLifecycleEvent,
): McpLifecycleFlow {
  if (event.type === "begin" && ["idle", "succeeded", "failed"].includes(current.state))
    return { ...current, state: "confirming", action: event.action, reasonCode: null }
  if (event.type === "cancel" && ["confirming", "failed"].includes(current.state))
    return initialMcpLifecycleFlow()
  if (event.type === "save" && current.state === "confirming" && current.action)
    return { ...current, state: "saving", sequence: event.sequence, reasonCode: null }
  if (event.type === "save_completed") {
    if (current.state !== "saving" || current.sequence !== event.sequence) return current
    return event.active
      ? { ...current, state: "verifying" }
      : { ...current, state: "failed", reasonCode: event.reasonCode ?? "mcp_lifecycle_failed" }
  }
  if (event.type === "verification_completed") {
    if (current.state !== "verifying" || current.sequence !== event.sequence) return current
    return event.verified
      ? { ...current, state: "succeeded", reasonCode: null }
      : {
          ...current,
          state: "failed",
          reasonCode: event.reasonCode ?? "mcp_lifecycle_projection_not_verified",
        }
  }
  throw new Error("mcp_lifecycle_transition_invalid")
}

function envelope(input: {
  action: McpLifecycleAction
  revision: number
  now: number
  randomId: () => string
}) {
  return {
    scope: "capability:write" as const,
    mutationId: input.randomId(),
    targetRevision: input.revision + 1,
    purpose: `mcp_${input.action}` as const,
    issuedAt: input.now,
    nonce: input.randomId(),
  }
}
export function createMcpLifecycleRequest(input: {
  action: "enable" | "disable"
  revision: number
  now: number
  randomId: () => string
}): McpStatusRequest {
  return { envelope: envelope(input), enabled: input.action === "enable" }
}
export function createMcpDeleteRequest(input: {
  revision: number
  now: number
  randomId: () => string
}): McpDeleteRequest {
  return { envelope: envelope({ ...input, action: "delete" }) }
}
export function verifyMcpLifecycleProjection(input: {
  action: McpLifecycleAction
  receipt: McpLifecycleReceipt
  detail?: { configuredStatus: "enabled" | "disabled"; runtimeStatus: string; revision: number }
  list: { items: readonly { mcpRef: string }[]; revision: number }
}): boolean {
  if (input.receipt.state !== "active" || input.list.revision !== input.receipt.revision)
    return false
  if (input.action === "delete")
    return (
      input.receipt.deleted &&
      !input.list.items.some((item) => item.mcpRef === input.receipt.mcpRef)
    )
  if (!input.detail || input.detail.revision !== input.receipt.revision) return false
  return input.action === "enable"
    ? input.detail.configuredStatus === "enabled" && input.detail.runtimeStatus === "ready"
    : input.detail.configuredStatus === "disabled" && input.detail.runtimeStatus === "inactive"
}
