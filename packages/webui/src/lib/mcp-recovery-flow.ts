import type { McpCatalogDetail, McpRecoveryReceipt, McpRecoveryRequest } from "../contracts/mcp"

export type McpRecoveryFlowState =
  | "idle"
  | "inspecting"
  | "applying"
  | "verifying"
  | "succeeded"
  | "failed"

export interface McpRecoveryFlow {
  state: McpRecoveryFlowState
  sequence: number
  reasonCode: string | null
}

export type McpRecoveryEvent =
  | { type: "start"; sequence: number }
  | { type: "inspection_completed"; sequence: number; ready: boolean; reasonCode?: string }
  | { type: "recovery_completed"; sequence: number; active: boolean; reasonCode?: string }
  | { type: "verification_completed"; sequence: number; verified: boolean; reasonCode?: string }
  | { type: "cancel" }

export const initialMcpRecoveryFlow = (): McpRecoveryFlow => ({
  state: "idle",
  sequence: 0,
  reasonCode: null,
})

export function reduceMcpRecoveryFlow(
  current: McpRecoveryFlow,
  event: McpRecoveryEvent,
): McpRecoveryFlow {
  if (event.type === "start" && ["idle", "succeeded", "failed"].includes(current.state))
    return { state: "inspecting", sequence: event.sequence, reasonCode: null }
  if (event.type === "cancel") return initialMcpRecoveryFlow()
  if (event.type === "inspection_completed") {
    if (current.state !== "inspecting" || current.sequence !== event.sequence) return current
    return event.ready
      ? { ...current, state: "applying" }
      : {
          ...current,
          state: "failed",
          reasonCode: event.reasonCode ?? "mcp_connection_probe_failed",
        }
  }
  if (event.type === "recovery_completed") {
    if (current.state !== "applying" || current.sequence !== event.sequence) return current
    return event.active
      ? { ...current, state: "verifying" }
      : { ...current, state: "failed", reasonCode: event.reasonCode ?? "mcp_recovery_failed" }
  }
  if (event.type === "verification_completed") {
    if (current.state !== "verifying" || current.sequence !== event.sequence) return current
    return event.verified
      ? { ...current, state: "succeeded", reasonCode: null }
      : {
          ...current,
          state: "failed",
          reasonCode: event.reasonCode ?? "mcp_recovery_projection_not_verified",
        }
  }
  throw new Error("mcp_recovery_transition_invalid")
}

export function createMcpRecoveryRequest(input: {
  revision: number
  now: number
  randomId: () => string
}): McpRecoveryRequest {
  return {
    envelope: {
      scope: "capability:write",
      mutationId: input.randomId(),
      targetRevision: input.revision + 1,
      purpose: "mcp_recover",
      issuedAt: input.now,
      nonce: input.randomId(),
    },
  }
}

export function verifyMcpRecoveryProjection(input: {
  receipt: McpRecoveryReceipt
  detail: McpCatalogDetail
}): boolean {
  return (
    input.receipt.state === "active" &&
    input.receipt.ready &&
    input.detail.mcpRef === input.receipt.mcpRef &&
    input.detail.configuredStatus === "enabled" &&
    input.detail.runtimeStatus === "ready" &&
    input.detail.revision === input.receipt.revision &&
    input.detail.toolCount === input.receipt.toolCount &&
    input.detail.tools.length === input.receipt.toolCount
  )
}
