import { describe, expect, it } from "vitest"
import {
  canTransitionRunStatus,
  projectRequestExecutionOutcome,
  resolveRunFlowIdentifiers,
} from "../packages/core/src/runs/flow-contract.ts"
import type { CanonicalWorkAggregate } from "../packages/core/src/contracts/canonical-work-aggregate.ts"

function aggregate(
  state: CanonicalWorkAggregate["state"],
  previousState?: CanonicalWorkAggregate["state"],
): CanonicalWorkAggregate {
  return {
    workId: "work:root:run-1",
    rootRunId: "run-1",
    state,
    revision: previousState ? 1 : 0,
    transitions: previousState
      ? [{
          revision: 1,
          event: "REPORT_DELIVERED",
          previousState,
          nextState: state,
          receiptRef: "receipt:report",
        }]
      : [],
  }
}

describe("run flow contract", () => {
  it("resolves request group and lineage identifiers before execution", () => {
    expect(resolveRunFlowIdentifiers({
      runId: "run-1",
      sessionId: "session-1",
    })).toEqual({
      runId: "run-1",
      sessionId: "session-1",
      requestGroupId: "run-1",
      lineageRootRunId: "run-1",
      runScope: "root",
    })

    expect(resolveRunFlowIdentifiers({
      runId: "child-1",
      sessionId: "session-1",
      requestGroupId: "group-1",
      lineageRootRunId: "root-1",
      parentRunId: "root-1",
    })).toEqual({
      runId: "child-1",
      sessionId: "session-1",
      requestGroupId: "group-1",
      lineageRootRunId: "root-1",
      runScope: "child",
      parentRunId: "root-1",
    })
  })

  it("blocks terminal status reversal", () => {
    expect(canTransitionRunStatus("completed", "failed")).toEqual({
      allowed: false,
      reason: "terminal_status_locked:completed->failed",
    })
    expect(canTransitionRunStatus("running", "failed")).toEqual({ allowed: true })
    expect(canTransitionRunStatus("failed", "failed")).toEqual({ allowed: true })
  })

  it("projects channel-neutral execution and delivery outcomes without user-facing prose", () => {
    expect(projectRequestExecutionOutcome({
      aggregate: aggregate("EXECUTING"),
      runStatus: "running",
      deliveryStatus: "not_started",
    })).toEqual({
      executionStatus: "in_progress",
      deliveryStatus: "not_started",
    })
    expect(projectRequestExecutionOutcome({
      aggregate: aggregate("USER_INPUT_REQUIRED"),
      runStatus: "awaiting_approval",
      deliveryStatus: "not_started",
    })).toEqual({
      executionStatus: "awaiting_approval",
      deliveryStatus: "not_started",
    })
    expect(projectRequestExecutionOutcome({
      aggregate: aggregate("USER_INPUT_REQUIRED"),
      runStatus: "awaiting_user",
      deliveryStatus: "not_started",
    }).executionStatus).toBe("awaiting_user")
  })

  it("preserves verified terminal meaning after the user report transition", () => {
    const statuses = [
      ["SUCCEEDED", "succeeded"],
      ["PARTIALLY_SUCCEEDED", "partially_succeeded"],
      ["BLOCKED", "blocked"],
      ["EXHAUSTED", "exhausted"],
      ["CANCELLED", "cancelled"],
    ] as const

    for (const [previousState, executionStatus] of statuses) {
      expect(projectRequestExecutionOutcome({
        aggregate: aggregate("USER_REPORT", previousState),
        runStatus: executionStatus === "cancelled"
          ? "cancelled"
          : executionStatus === "succeeded" || executionStatus === "partially_succeeded"
            ? "completed"
            : "failed",
        deliveryStatus: "delivered",
      })).toEqual({
        executionStatus,
        deliveryStatus: "delivered",
      })
    }
  })

  it("projects runtime termination without a canonical terminal decision as internal fault", () => {
    expect(projectRequestExecutionOutcome({
      aggregate: aggregate("POLICY_VALIDATED"),
      runStatus: "failed",
      deliveryStatus: "failed",
    })).toEqual({
      executionStatus: "internal_fault",
      deliveryStatus: "failed",
    })
  })
})
