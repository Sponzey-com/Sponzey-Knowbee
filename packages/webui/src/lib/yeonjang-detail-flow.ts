import type { YeonjangRecoveryRequest } from "../contracts/yeonjang"

export interface YeonjangRecoveryFlow {
  state: "idle" | "confirming" | "executing" | "active" | "failed" | "blocked"
  action: YeonjangRecoveryRequest["action"] | null
  reasonCode: string | null
}

export type YeonjangRecoveryEvent =
  | { type: "request"; action: YeonjangRecoveryRequest["action"] }
  | { type: "confirm" }
  | { type: "succeeded" }
  | { type: "failed"; reasonCode: string; blocked?: boolean }
  | { type: "cancel" }
  | { type: "reset" }

export const initialYeonjangRecoveryFlow: YeonjangRecoveryFlow = Object.freeze({
  state: "idle",
  action: null,
  reasonCode: null,
})

export function reduceYeonjangRecoveryFlow(
  current: YeonjangRecoveryFlow,
  event: YeonjangRecoveryEvent,
): YeonjangRecoveryFlow {
  if (event.type === "reset") return initialYeonjangRecoveryFlow
  if (current.state === "idle" && event.type === "request")
    return { state: "confirming", action: event.action, reasonCode: null }
  if (current.state === "confirming" && event.type === "cancel") return initialYeonjangRecoveryFlow
  if (current.state === "confirming" && event.type === "confirm")
    return { ...current, state: "executing" }
  if (current.state === "executing" && event.type === "succeeded")
    return { ...current, state: "active", reasonCode: null }
  if (current.state === "executing" && event.type === "failed")
    return {
      ...current,
      state: event.blocked ? "blocked" : "failed",
      reasonCode: event.reasonCode,
    }
  if ((current.state === "failed" || current.state === "blocked") && event.type === "confirm")
    return { ...current, state: "executing", reasonCode: null }
  throw new Error(`Invalid Yeonjang UI recovery transition: ${current.state} -> ${event.type}`)
}

export interface YeonjangBindingFlow {
  state: "viewing" | "editing" | "saving" | "failed"
  selectedAgentRefs: string[]
  reasonCode: string | null
  requiresRefresh?: boolean
}

export type YeonjangBindingEvent =
  | { type: "edit"; selectedAgentRefs: readonly string[] }
  | { type: "toggle"; agentRef: string }
  | { type: "save" }
  | { type: "saved"; selectedAgentRefs: readonly string[] }
  | { type: "failed"; reasonCode: string; requiresRefresh?: boolean }
  | { type: "cancel"; selectedAgentRefs: readonly string[] }

export function initialYeonjangBindingFlow(
  selectedAgentRefs: readonly string[],
): YeonjangBindingFlow {
  return {
    state: "viewing",
    selectedAgentRefs: [...selectedAgentRefs],
    reasonCode: null,
    requiresRefresh: false,
  }
}

export function reduceYeonjangBindingFlow(
  current: YeonjangBindingFlow,
  event: YeonjangBindingEvent,
): YeonjangBindingFlow {
  if (event.type === "edit" && current.state === "viewing")
    return {
      state: "editing",
      selectedAgentRefs: [...event.selectedAgentRefs],
      reasonCode: null,
      requiresRefresh: false,
    }
  if (event.type === "toggle" && current.state === "editing") {
    const selected = new Set(current.selectedAgentRefs)
    selected.has(event.agentRef) ? selected.delete(event.agentRef) : selected.add(event.agentRef)
    return { ...current, selectedAgentRefs: [...selected].sort() }
  }
  if (
    event.type === "save" &&
    (current.state === "editing" ||
      (current.state === "failed" && current.requiresRefresh !== true))
  )
    return { ...current, state: "saving", reasonCode: null }
  if (event.type === "saved" && current.state === "saving")
    return {
      state: "viewing",
      selectedAgentRefs: [...event.selectedAgentRefs],
      reasonCode: null,
      requiresRefresh: false,
    }
  if (event.type === "failed" && current.state === "saving")
    return {
      ...current,
      state: "failed",
      reasonCode: event.reasonCode,
      requiresRefresh: event.requiresRefresh ?? false,
    }
  if (event.type === "cancel" && (current.state === "editing" || current.state === "failed"))
    return {
      state: "viewing",
      selectedAgentRefs: [...event.selectedAgentRefs],
      reasonCode: null,
      requiresRefresh: false,
    }
  throw new Error(`Invalid Yeonjang binding transition: ${current.state} -> ${event.type}`)
}
