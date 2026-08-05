import { randomUUID } from "node:crypto"

export type ConfigurationCommandState =
  | "received"
  | "validated"
  | "persisted"
  | "runtime_applying"
  | "runtime_applied"
  | "runtime_failed"
  | "rolled_back"
  | "restart_required"
  | "rejected"
  | "completed"

export interface ConfigurationCommandTransition {
  from: ConfigurationCommandState | null
  to: ConfigurationCommandState
  reasonCode: string
  timestamp: number
}

export interface ConfigurationCommandSnapshot {
  commandId: string
  kind: string
  state: ConfigurationCommandState
  transitions: ConfigurationCommandTransition[]
}

const ALLOWED_TRANSITIONS: Record<ConfigurationCommandState, readonly ConfigurationCommandState[]> = {
  received: ["validated", "rejected"],
  validated: ["persisted", "runtime_applying", "rejected"],
  persisted: ["runtime_applying", "runtime_applied", "restart_required", "completed"],
  runtime_applying: ["runtime_applied", "runtime_failed"],
  runtime_applied: ["completed"],
  runtime_failed: ["rolled_back", "restart_required", "completed"],
  rolled_back: ["completed"],
  restart_required: ["completed"],
  rejected: [],
  completed: [],
}

export function createConfigurationCommandStateMachine(options: {
  kind: string
  commandId?: string
  now?: () => number
}) {
  const now = options.now ?? Date.now
  const commandId = options.commandId ?? randomUUID()
  let state: ConfigurationCommandState = "received"
  const transitions: ConfigurationCommandTransition[] = [
    { from: null, to: "received", reasonCode: "command_received", timestamp: now() },
  ]

  return {
    transition(next: ConfigurationCommandState, reasonCode: string): void {
      if (!ALLOWED_TRANSITIONS[state].includes(next)) {
        throw new Error(`Invalid configuration command transition: ${state} -> ${next}`)
      }
      const previous = state
      state = next
      transitions.push({ from: previous, to: next, reasonCode, timestamp: now() })
    },
    snapshot(): ConfigurationCommandSnapshot {
      return {
        commandId,
        kind: options.kind,
        state,
        transitions: transitions.map((transition) => ({ ...transition })),
      }
    },
  }
}

export function buildPersistedConfigurationCommand(kind: string): ConfigurationCommandSnapshot {
  const machine = createConfigurationCommandStateMachine({ kind })
  machine.transition("validated", "configuration_validated")
  machine.transition("persisted", "configuration_persisted")
  machine.transition("restart_required", "running_snapshot_unchanged")
  machine.transition("completed", "persistence_command_completed")
  return machine.snapshot()
}

export function buildRuntimeAppliedConfigurationCommand(kind: string): ConfigurationCommandSnapshot {
  const machine = createConfigurationCommandStateMachine({ kind })
  machine.transition("validated", "runtime_input_validated")
  machine.transition("runtime_applying", "runtime_application_started")
  machine.transition("runtime_applied", "runtime_application_succeeded")
  machine.transition("completed", "runtime_command_completed")
  return machine.snapshot()
}

export function buildPersistedRuntimeAppliedConfigurationCommand(
  kind: string,
): ConfigurationCommandSnapshot {
  const machine = createConfigurationCommandStateMachine({ kind })
  machine.transition("validated", "configuration_validated")
  machine.transition("persisted", "configuration_persisted")
  machine.transition("runtime_applying", "runtime_application_started")
  machine.transition("runtime_applied", "runtime_application_succeeded")
  machine.transition("completed", "configuration_command_completed")
  return machine.snapshot()
}

export function buildRuntimeFailedConfigurationCommand(
  kind: string,
  reasonCode: string,
): ConfigurationCommandSnapshot {
  const machine = createConfigurationCommandStateMachine({ kind })
  machine.transition("validated", "runtime_input_validated")
  machine.transition("runtime_applying", "runtime_application_started")
  machine.transition("runtime_failed", reasonCode)
  machine.transition("completed", "runtime_failure_reported")
  return machine.snapshot()
}

export function buildRejectedConfigurationCommand(
  kind: string,
  reasonCode: string,
): ConfigurationCommandSnapshot {
  const machine = createConfigurationCommandStateMachine({ kind })
  machine.transition("rejected", reasonCode)
  return machine.snapshot()
}
