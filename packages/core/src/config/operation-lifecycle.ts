import { randomUUID } from "node:crypto"

export type ConfigurationOperationState =
  | "received"
  | "validated"
  | "executing"
  | "persisted"
  | "backed_up"
  | "replacing"
  | "verifying"
  | "rolling_back"
  | "completed"
  | "failed"
  | "rejected"

export interface ConfigurationOperationTransition {
  readonly from: ConfigurationOperationState | null
  readonly to: ConfigurationOperationState
  readonly reasonCode: string
  readonly timestamp: number
}

export interface ConfigurationOperationSnapshot {
  readonly commandId: string
  readonly kind: string
  readonly state: ConfigurationOperationState
  readonly transitions: readonly ConfigurationOperationTransition[]
}

const ALLOWED_TRANSITIONS: Record<ConfigurationOperationState, readonly ConfigurationOperationState[]> = {
  received: ["validated", "rejected"],
  validated: ["executing", "backed_up", "rejected"],
  executing: ["persisted", "completed", "failed"],
  persisted: ["completed", "failed"],
  backed_up: ["replacing", "rolling_back"],
  replacing: ["verifying", "rolling_back"],
  verifying: ["completed", "rolling_back"],
  rolling_back: ["failed"],
  completed: [],
  failed: [],
  rejected: [],
}

function assertReasonCode(reasonCode: string): void {
  if (!/^[a-z][a-z0-9_.-]*$/u.test(reasonCode)) {
    throw new Error("Configuration operation reason code must be a stable lowercase identifier")
  }
}

export function createConfigurationOperationLifecycle(options: {
  kind: string
  commandId?: string
  now?: () => number
}) {
  const now = options.now ?? Date.now
  const commandId = options.commandId ?? randomUUID()
  let state: ConfigurationOperationState = "received"
  const transitions: ConfigurationOperationTransition[] = [
    Object.freeze({ from: null, to: "received", reasonCode: "command_received", timestamp: now() }),
  ]

  return {
    transition(next: ConfigurationOperationState, reasonCode: string): void {
      assertReasonCode(reasonCode)
      if (!ALLOWED_TRANSITIONS[state].includes(next)) {
        throw new Error(`Invalid configuration operation transition: ${state} -> ${next}`)
      }
      const previous = state
      state = next
      transitions.push(Object.freeze({ from: previous, to: next, reasonCode, timestamp: now() }))
    },
    snapshot(): ConfigurationOperationSnapshot {
      return Object.freeze({
        commandId,
        kind: options.kind,
        state,
        transitions: Object.freeze([...transitions]),
      })
    },
  }
}

export type ConfigurationOperationLifecycle = ReturnType<typeof createConfigurationOperationLifecycle>
