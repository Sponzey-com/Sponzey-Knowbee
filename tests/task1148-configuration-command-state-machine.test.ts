import { describe, expect, it } from "vitest"
import {
  buildPersistedConfigurationCommand,
  buildPersistedRuntimeAppliedConfigurationCommand,
  buildRejectedConfigurationCommand,
  buildRuntimeAppliedConfigurationCommand,
  buildRuntimeFailedConfigurationCommand,
  createConfigurationCommandStateMachine,
} from "../packages/core/src/config/command-state.ts"

describe("task1148 configuration command state machine", () => {
  it("records persisted commands without pretending the running snapshot changed", () => {
    const snapshot = buildPersistedConfigurationCommand("settings.save")
    expect(snapshot.state).toBe("completed")
    expect(snapshot.transitions.map((transition) => transition.to)).toEqual([
      "received",
      "validated",
      "persisted",
      "restart_required",
      "completed",
    ])
  })

  it("records explicit runtime application separately", () => {
    expect(buildRuntimeAppliedConfigurationCommand("channels.disable").transitions.map((item) => item.to)).toEqual([
      "received",
      "validated",
      "runtime_applying",
      "runtime_applied",
      "completed",
    ])
    expect(buildRejectedConfigurationCommand("settings.reload", "runtime_config_reload_not_supported").state).toBe("rejected")
    expect(buildPersistedRuntimeAppliedConfigurationCommand("channels.disable").transitions.map((item) => item.to)).toContain("persisted")
    expect(buildRuntimeFailedConfigurationCommand("channels.restart", "channel_restart_failed").transitions.map((item) => item.to)).toContain("runtime_failed")
  })

  it("rejects invalid transitions", () => {
    const machine = createConfigurationCommandStateMachine({
      kind: "invalid",
      commandId: "command:test",
      now: () => 1,
    })
    expect(() => machine.transition("completed", "skip_validation")).toThrow(
      "Invalid configuration command transition: received -> completed",
    )
  })

  it("supports an explicit rollback after runtime application fails", () => {
    const machine = createConfigurationCommandStateMachine({
      kind: "settings.atomic_apply",
      commandId: "command:rollback",
      now: () => 1,
    })
    machine.transition("validated", "configuration_validated")
    machine.transition("runtime_applying", "runtime_application_started")
    machine.transition("runtime_failed", "runtime_application_failed")
    machine.transition("rolled_back", "persisted_candidate_rolled_back")
    machine.transition("completed", "rollback_reported")

    expect(machine.snapshot().transitions.map((transition) => transition.to)).toEqual([
      "received",
      "validated",
      "runtime_applying",
      "runtime_failed",
      "rolled_back",
      "completed",
    ])
  })
})
