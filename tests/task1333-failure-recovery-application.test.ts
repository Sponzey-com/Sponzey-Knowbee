import { describe, expect, it, vi } from "vitest"
import {
  applyStructuredFailureRecoveryDecision,
  type StructuredFailureRecoveryDecision,
} from "../packages/core/src/index.ts"

const candidate = {
  action_type: "retry" as const,
  changed_input_or_strategy: "fallback-tool",
  expected_benefit: "Uses an available implementation.",
  risk: "low" as const,
  changed_dimensions: ["tool" as const],
}

function retryDecision(): StructuredFailureRecoveryDecision {
  return {
    state: "retry_ready",
    outcome: "retry",
    receiptId: "diagnosis:1",
    selectedCandidate: candidate,
    changedDimensions: ["tool"],
    nextAttemptSignature: "attempt:fallback-tool",
    evidenceRefs: ["capability:1"],
    partialResultRefs: [],
    unresolvedScope: ["step:failed"],
    userActions: [],
    stateTrace: ["diagnosing", "generating_candidates", "reviewing_constraints", "selecting_action", "retry_ready"],
  }
}

function callbacks() {
  return {
    executeRecovery: vi.fn(async () => "retried"),
    reportPartial: vi.fn(async () => "reported"),
    stopRecovery: vi.fn(async () => "stopped"),
  }
}

describe("task1333 failure recovery application", () => {
  it("executes exactly the diagnosed changed recovery action and advances retry_count", async () => {
    const handlers = callbacks()
    await expect(applyStructuredFailureRecoveryDecision({
      decision: retryDecision(),
      retryCount: 1,
      ...handlers,
    })).resolves.toEqual({
      status: "recovery_executed",
      outcome: "retry",
      receiptId: "diagnosis:1",
      attemptSignature: "attempt:fallback-tool",
      retryCount: 2,
      result: "retried",
    })
    expect(handlers.executeRecovery).toHaveBeenCalledWith({
      action: candidate,
      attemptSignature: "attempt:fallback-tool",
      receiptId: "diagnosis:1",
      retryCount: 2,
    })
    expect(handlers.reportPartial).not.toHaveBeenCalled()
    expect(handlers.stopRecovery).not.toHaveBeenCalled()
  })

  it("routes partial and stopped decisions without invoking another recovery attempt", async () => {
    const partialHandlers = callbacks()
    await expect(applyStructuredFailureRecoveryDecision({
      decision: {
        ...retryDecision(),
        state: "report_ready",
        outcome: "partial",
        selectedCandidate: undefined,
        nextAttemptSignature: undefined,
        partialResultRefs: ["artifact:done"],
        unresolvedScope: ["step:remaining"],
        userActions: ["Connect the required resource."],
      },
      retryCount: 1,
      ...partialHandlers,
    })).resolves.toMatchObject({ status: "partial_reported", result: "reported" })
    expect(partialHandlers.executeRecovery).not.toHaveBeenCalled()

    const stopHandlers = callbacks()
    await expect(applyStructuredFailureRecoveryDecision({
      decision: {
        ...retryDecision(),
        state: "stopped",
        outcome: "blocked",
        selectedCandidate: undefined,
        nextAttemptSignature: undefined,
        stopCondition: "permission_denied",
        reason: "Permission was denied.",
        unresolvedScope: ["step:remaining"],
        userActions: ["Grant permission and retry."],
      },
      retryCount: 1,
      ...stopHandlers,
    })).resolves.toMatchObject({ status: "recovery_stopped", outcome: "blocked", result: "stopped" })
    expect(stopHandlers.executeRecovery).not.toHaveBeenCalled()
  })

  it("rejects malformed application decisions before any callback", async () => {
    const handlers = callbacks()
    await expect(applyStructuredFailureRecoveryDecision({
      decision: { ...retryDecision(), nextAttemptSignature: undefined },
      retryCount: 0,
      ...handlers,
    })).rejects.toThrow(/requires an action and attempt signature/i)
    expect(handlers.executeRecovery).not.toHaveBeenCalled()
    expect(handlers.reportPartial).not.toHaveBeenCalled()
    expect(handlers.stopRecovery).not.toHaveBeenCalled()
  })
})
