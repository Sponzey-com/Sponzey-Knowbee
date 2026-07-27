import type { UserRecoveryProjection } from "./user-recovery"
import { projectUserRecovery } from "./user-recovery"

export interface AgentBindingMutationState {
  state: "idle" | "saving" | "failed"
  requestedCount: number
  appliedCount: number
  rejectedCount: number
  requiresRefresh: boolean
  recovery: UserRecoveryProjection | null
}

export const initialAgentBindingMutation: AgentBindingMutationState = Object.freeze({
  state: "idle",
  requestedCount: 0,
  appliedCount: 0,
  rejectedCount: 0,
  requiresRefresh: false,
  recovery: null,
})

export type AgentBindingMutationEvent =
  | { type: "save_started"; requestedCount: number }
  | {
      type: "save_finished"
      appliedCount: number
      rejectedCount: number
      verified: boolean
      recovery: UserRecoveryProjection | null
    }
  | { type: "refreshed" }

export function reduceAgentBindingMutation(
  current: AgentBindingMutationState,
  event: AgentBindingMutationEvent,
): AgentBindingMutationState {
  if (event.type === "refreshed") return initialAgentBindingMutation
  if (
    (current.state === "idle" || (current.state === "failed" && !current.requiresRefresh)) &&
    event.type === "save_started"
  ) {
    if (!Number.isInteger(event.requestedCount) || event.requestedCount < 1)
      throw new Error("Agent binding mutation requires at least one request")
    return {
      state: "saving",
      requestedCount: event.requestedCount,
      appliedCount: 0,
      rejectedCount: 0,
      requiresRefresh: false,
      recovery: null,
    }
  }
  if (current.state === "saving" && event.type === "save_finished") {
    const failed = event.rejectedCount > 0 || !event.verified
    return {
      state: failed ? "failed" : "idle",
      requestedCount: failed ? current.requestedCount : 0,
      appliedCount: failed ? event.appliedCount : 0,
      rejectedCount: failed ? event.rejectedCount : 0,
      requiresRefresh: failed && !event.verified,
      recovery: failed ? (event.recovery ?? projectAgentReceiptFailure(null)) : null,
    }
  }
  throw new Error(`Invalid agent binding mutation transition: ${current.state} -> ${event.type}`)
}

export function projectAgentFailure(cause: unknown): UserRecoveryProjection {
  return projectUserRecovery(cause, "mutation")
}

export function projectAgentReceiptFailure(
  reasonCode: string | null | undefined,
): UserRecoveryProjection {
  if (reasonCode === "authentication_required") return projection("authentication", "reauthorize")
  if (reasonCode === "permission_denied") return projection("authorization", "contact_admin")
  if (
    reasonCode === "mutation_revision_conflict" ||
    reasonCode === "persisted_revision_mismatch" ||
    reasonCode === "stale_revision" ||
    reasonCode === "capability_revision_conflict"
  )
    return projection("conflict", "refresh_state")
  if (reasonCode === "validation_failed") return projection("invalid_input", "edit_input")
  if (reasonCode === "unsupported_operation") return projection("unsupported", "choose_alternative")
  if (reasonCode === "service_unavailable" || reasonCode === "network_unavailable")
    return projection("unavailable", "refresh_state")
  return {
    kind: "unknown",
    reasonCode: "request_failed",
    messageKey: "request_failed",
    action: "refresh_state",
    actionLabelKey: "refresh_state",
  }
}

function projection(
  kind: Exclude<UserRecoveryProjection["kind"], "unknown">,
  action: UserRecoveryProjection["action"],
): UserRecoveryProjection {
  return {
    kind,
    reasonCode: kind,
    messageKey: kind,
    action,
    actionLabelKey: action,
  }
}
