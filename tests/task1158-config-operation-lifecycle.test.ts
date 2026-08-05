import { describe, expect, it, vi } from "vitest"
import {
  createConfigurationOperationLifecycle,
} from "../packages/core/src/config/operation-lifecycle.ts"
import { runPersistedConfigurationOperation } from "../packages/core/src/config/operation-command.ts"

describe("task1158 configuration operation lifecycle", () => {
  it("records immutable valid transitions and rejects terminal-state mutation", () => {
    const lifecycle = createConfigurationOperationLifecycle({
      commandId: "command-task1158",
      kind: "config.export",
      now: () => 100,
    })

    lifecycle.transition("validated", "input_validated")
    lifecycle.transition("executing", "export_started")
    lifecycle.transition("persisted", "export_written")
    lifecycle.transition("completed", "export_completed")
    const snapshot = lifecycle.snapshot()

    expect(snapshot).toEqual({
      commandId: "command-task1158",
      kind: "config.export",
      state: "completed",
      transitions: [
        { from: null, to: "received", reasonCode: "command_received", timestamp: 100 },
        { from: "received", to: "validated", reasonCode: "input_validated", timestamp: 100 },
        { from: "validated", to: "executing", reasonCode: "export_started", timestamp: 100 },
        { from: "executing", to: "persisted", reasonCode: "export_written", timestamp: 100 },
        { from: "persisted", to: "completed", reasonCode: "export_completed", timestamp: 100 },
      ],
    })
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.transitions)).toBe(true)
    expect(() => lifecycle.transition("failed", "late_failure")).toThrow(/completed -> failed/u)
    expect(lifecycle.snapshot()).toEqual(snapshot)
  })

  it("returns a command snapshot and fixed-field three-purpose log events", () => {
    const logger = {
      product: vi.fn(),
      fieldDebug: vi.fn(),
      development: vi.fn(),
    }

    const result = runPersistedConfigurationOperation({
      kind: "config.export",
      commandId: "command-task1158-runner",
      logger,
      execute: () => ({ fileCount: 1 }),
    })

    expect(result.value).toEqual({ fileCount: 1 })
    expect(result.command.state).toBe("completed")
    expect(logger.product).toHaveBeenCalledWith("configuration operation completed", {
      kind: "config.export",
      state: "completed",
      reasonCode: "operation_completed",
    })
    expect(logger.fieldDebug).toHaveBeenCalled()
    expect(logger.development).toHaveBeenCalledWith("configuration operation adapter completed", {
      commandId: "command-task1158-runner",
      kind: "config.export",
      state: "persisted",
      reasonCode: "adapter_completed",
    })
    expect(JSON.stringify(logger.product.mock.calls)).not.toMatch(/path|secret|token|payload/iu)
  })

  it("returns a failed terminal snapshot without exposing the adapter error", () => {
    const logger = {
      product: vi.fn(),
      fieldDebug: vi.fn(),
      development: vi.fn(),
    }

    expect(() => runPersistedConfigurationOperation({
      kind: "config.export",
      commandId: "command-task1158-failure",
      logger,
      execute: () => {
        throw new Error("secret=sk-task1158 /Users/private/config.json5")
      },
    })).toThrow("secret=sk-task1158")

    expect(logger.product).toHaveBeenCalledWith("configuration operation failed", {
      kind: "config.export",
      state: "failed",
      reasonCode: "adapter_failed",
    })
    expect(JSON.stringify(logger.product.mock.calls)).not.toContain("sk-task1158")
  })
})
